/**
 * Slashman Tools — Lead Capture Webhook (Cloudflare Worker)
 * =========================================================
 * Custom webhook endpoint for the site's email-capture forms. Replaces the
 * dead ConvertKit/Kit form placeholders (`form.kit/...`) with a self-owned,
 * zero-cost endpoint that:
 *
 *   1. Validates + de-dupes the lead        (KV: LEADS)
 *   2. Rate-limits abusive IPs              (KV: LEADS, short TTL keys)
 *   3. Delivers the lead magnet by email    (Resend, optional)
 *   4. Feeds the marketing funnel           (forwards to FORWARD_URL, optional)
 *
 * Every downstream integration is OPTIONAL and controlled by environment
 * bindings — with nothing configured the Worker still captures and stores
 * leads durably in KV, so it is useful from the first deploy.
 *
 * Endpoints:
 *   POST /subscribe   → capture a lead   (JSON or form-encoded body)
 *   GET  /health      → liveness probe   ({ ok: true })
 *   GET  /leads       → export leads KV   (Authorization: Bearer ADMIN_TOKEN)
 *   GET  /hit         → no-cookie counter pixel (?s=<site>&e=<event>), 1x1 GIF
 *   GET  /stats       → daily counter totals   (?s=<site>&days=<n>)
 *   POST /cleanup     → admin: delete test lead keys (Authorization: Bearer ADMIN_TOKEN, body {"emails":[...]})
 *   POST /license/line-chat-pro → verify a Gumroad license key, return a signed PRO token
 *
 * See ./README.md for the full deploy + configuration guide.
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

// Origins allowed to call this Worker from the browser.
const ALLOWED_ORIGINS = [
  "https://slashmantools.us",
  "https://slashman413.github.io",
  "https://ckw19810413.github.io",
  "http://localhost:1313", // hugo server
  "http://127.0.0.1:1313",
];

// Max lead submissions per IP per rolling window (defense against form spam).
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 10; // 10 minutes

// /license/line-chat-pro: verification attempts per IP per window, and how
// many times a Single Pass key may be activated (1 + one retry).
const LICENSE_RATE_LIMIT_MAX = 20;
const SINGLE_PASS_MAX_USES = 2;
const DAY_SECONDS = 60 * 60 * 24;

// Cookieless counter (/hit, /stats): site + event names are a closed charset so
// arbitrary callers can't flood KV with junk keys; daily rows expire after 400d.
const COUNTER_KEY_RE = /^[a-z0-9_-]{1,32}$/;
const COUNTER_TTL_SECONDS = 60 * 60 * 24 * 400;
const PIXEL_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0)
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "lead-capture" }, 200, origin);
    }

    // --- /hit — cookieless pageview/click counter (KV: LEADS, hit:* keys) ---
    // Stores only an aggregate daily count per site+event: no IP, no cookie,
    // no user agent. Embedded as an <img> pixel or fired via sendBeacon.
    if (url.pathname === "/hit") {
      const site = url.searchParams.get("s") || "";
      const event = url.searchParams.get("e") || "pageview";
      if (env.LEADS && COUNTER_KEY_RE.test(site) && COUNTER_KEY_RE.test(event)) {
        const key = `hit:${site}:${event}:${new Date().toISOString().slice(0, 10)}`;
        ctx.waitUntil(
          env.LEADS.get(key).then((v) =>
            env.LEADS.put(key, String(parseInt(v || "0", 10) + 1), {
              expirationTtl: COUNTER_TTL_SECONDS,
            })
          )
        );
      }
      return new Response(PIXEL_GIF, {
        status: 200,
        headers: {
          "content-type": "image/gif",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    // --- /stats — daily totals for one site, newest first -----------------
    if (url.pathname === "/stats") {
      const site = url.searchParams.get("s") || "";
      if (!COUNTER_KEY_RE.test(site)) {
        return json({ ok: false, error: "bad_site" }, 400, origin);
      }
      if (!env.LEADS) {
        return json({ ok: false, error: "kv_not_configured" }, 503, origin);
      }
      const days = Math.min(parseInt(url.searchParams.get("days") || "30", 10) || 30, 90);
      const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      // Follow the cursor: one list() page caps at 1000 keys (site × event × day).
      const hitKeys = [];
      let cursor;
      do {
        const page = await env.LEADS.list({ prefix: `hit:${site}:`, limit: 1000, ...(cursor ? { cursor } : {}) });
        hitKeys.push(...page.keys);
        cursor = page.listComplete ? undefined : page.cursor;
      } while (cursor);
      const rows = [];
      const totals = {};
      const allKeys = hitKeys.filter((k) => {
        const [, , , day] = k.name.split(":");
        return day >= cutoff;
      });
      const CHUNK = 20;
      for (let i = 0; i < allKeys.length; i += CHUNK) {
        const chunk = allKeys.slice(i, i + CHUNK);
        const raws = await Promise.all(chunk.map((k) => env.LEADS.get(k.name)));
        chunk.forEach((k, j) => {
          const [, , event, day] = k.name.split(":");
          const n = parseInt((raws[j]) || "0", 10);
          rows.push({ day, event, n });
          totals[event] = (totals[event] || 0) + n;
        });
      }
      rows.sort((a, b) => b.day.localeCompare(a.day) || a.event.localeCompare(b.event));
      return new Response(JSON.stringify({ ok: true, site, days, totals, rows }), {
        status: 200,
        headers: { ...JSON_HEADERS, "access-control-allow-origin": "*", "cache-control": "no-store" },
      });
    }

    // --- GET /leads — export all captured leads (requires ADMIN_TOKEN) ---
    if (url.pathname === "/leads") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "method_not_allowed" }, 405, origin);
      }
      if (!(await isAdmin(request, env))) {
        return json({ ok: false, error: "unauthorized" }, 401, origin);
      }
      if (!env.LEADS) {
        return json({ ok: false, error: "kv_not_configured" }, 503, origin);
      }
      // List all lead keys (paginate past 1000 if the store grows that big)
      // and fetch the lead records in parallel chunks. Sequential per-key gets
      // took ~60-90s at ~100 leads (2026-10-18), exceeding the sync client's
      // timeout and silently breaking the KV→Mautic pipeline.
      const leadKeys = [];
      let cursor;
      do {
        const page = await env.LEADS.list({ prefix: "lead:", limit: 1000, ...(cursor ? { cursor } : {}) });
        leadKeys.push(...page.keys);
        cursor = page.listComplete ? undefined : page.cursor;
      } while (cursor);
      const leads = [];
      const CHUNK = 20;
      for (let i = 0; i < leadKeys.length; i += CHUNK) {
        const raws = await Promise.all(
          leadKeys.slice(i, i + CHUNK).map((k) => env.LEADS.get(k.name))
        );
        for (const raw of raws) {
          if (raw) {
            try { leads.push(JSON.parse(raw)); } catch (_) { /* skip malformed */ }
          }
        }
      }
      const since = url.searchParams.get("since") || "";
      const filtered = since
        ? leads.filter((l) => (l.created_at || l.updated_at || "") > since)
        : leads;
      // Return newest first
      filtered.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
      return json({ ok: true, total: filtered.length, leads: filtered.slice(0, limit) }, 200, origin);
    }

    // --- POST /cleanup — admin: delete test lead keys (token-guarded) ----
    // The KV key-level REST API is not routable from outside, so admin
    // deletion goes through the Worker itself (its LEADS binding works).
    // Body: { "emails": [...] }  Auth: Authorization: Bearer ADMIN_TOKEN.
    // Deletes only lead:* keys for the given emails; never rl:* or hit:*.
    if (url.pathname === "/cleanup") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405, origin);
      }
      if (!(await isAdmin(request, env))) {
        return json({ ok: false, error: "unauthorized" }, 401, origin);
      }
      if (!env.LEADS) {
        return json({ ok: false, error: "kv_not_configured" }, 503, origin);
      }
      let body;
      try { body = await request.json(); } catch {
        return json({ ok: false, error: "bad_request" }, 400, origin);
      }
      const emails = Array.isArray(body?.emails) ? body.emails : [];
      const results = [];
      for (const email of emails.slice(0, 500)) {
        const key = `lead:${String(email).trim().toLowerCase()}`;
        try {
          const existed = await env.LEADS.get(key);
          if (existed !== null) {
            await env.LEADS.delete(key);
            results.push({ email, deleted: true });
          } else {
            results.push({ email, deleted: false });
          }
        } catch (e) {
          results.push({ email, deleted: false, error: String(e) });
        }
      }
      return json({
        ok: true,
        requested: emails.length,
        deleted: results.filter(r => r.deleted).length,
        results,
      }, 200, origin);
    }

    // --- /license/line-chat-pro — LINE Chat Generator PRO activation -------
    // The browser sends the Gumroad license key; we verify it against the
    // Gumroad product and return a token signed with LICENSE_SIGNING_JWK
    // (ECDSA P-256). The app checks the signature with the embedded public
    // key, so PRO state can't be granted by editing localStorage.
    if (url.pathname === "/license/line-chat-pro") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405, origin);
      }
      if (!env.LICENSE_SIGNING_JWK || !env.LINE_CHAT_PRO_PRODUCT_ID) {
        return json({ ok: false, error: "not_configured" }, 503, origin);
      }
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (env.LEADS) {
        const rlKey = `rl:lic:${ip}`;
        const count = parseInt((await env.LEADS.get(rlKey)) || "0", 10);
        if (count >= LICENSE_RATE_LIMIT_MAX) {
          return json({ ok: false, error: "rate_limited" }, 429, origin);
        }
        ctx.waitUntil(
          env.LEADS.put(rlKey, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS })
        );
      }
      let body;
      try {
        body = await parseBody(request);
      } catch {
        return json({ ok: false, error: "invalid_body" }, 400, origin);
      }
      const key = String(body?.license_key || "").trim();
      if (!/^[A-Za-z0-9-]{8,64}$/.test(key)) {
        return json({ ok: false, error: "invalid_key" }, 400, origin);
      }
      const result = await verifyLineChatProKey(env, key);
      return json(result.body, result.status, origin);
    }

    if (url.pathname !== "/subscribe") {
      return json({ ok: false, error: "not_found" }, 404, origin);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405, origin);
    }

    let payload;
    try {
      payload = await parseBody(request);
    } catch (err) {
      return json({ ok: false, error: "bad_request" }, 400, origin);
    }

    // --- Honeypot: real users never fill these hidden fields ---------------
    if ((payload.website || payload._hp || "").trim() !== "") {
      // Pretend success so bots don't learn they were caught.
      return json({ ok: true }, 200, origin);
    }

    // --- Validate email ----------------------------------------------------
    const email = normalizeEmail(payload.email);
    if (!isValidEmail(email)) {
      return json({ ok: false, error: "invalid_email" }, 422, origin);
    }

    const firstName = String(payload.first_name || payload["fields[FIRST_NAME]"] || "")
      .trim()
      .slice(0, 80);
    const tags = String(payload.tags || "").trim().slice(0, 200);
    const source = String(payload.source || "unknown").trim().slice(0, 80);
    // A/B test cell the lead converted on (set by cta-ab.js, e.g. "leadmagnet:b2").
    const variant = String(payload.variant || "").trim().slice(0, 60);
    // Social traffic attribution (set by lead-capture.js from the landing URL).
    const utm = {
      utm_source: String(payload.utm_source || "").trim().slice(0, 120),
      utm_medium: String(payload.utm_medium || "").trim().slice(0, 120),
      utm_campaign: String(payload.utm_campaign || "").trim().slice(0, 120),
      utm_content: String(payload.utm_content || "").trim().slice(0, 120),
      utm_term: String(payload.utm_term || "").trim().slice(0, 120),
    };
    const referrer = String(payload.referrer || request.headers.get("Referer") || "").trim().slice(0, 500);
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

    // --- Rate limit by IP --------------------------------------------------
    if (env.LEADS) {
      const rlKey = `rl:${ip}`;
      const count = parseInt((await env.LEADS.get(rlKey)) || "0", 10);
      if (count >= RATE_LIMIT_MAX) {
        return json({ ok: false, error: "rate_limited" }, 429, origin);
      }
      ctx.waitUntil(
        env.LEADS.put(rlKey, String(count + 1), {
          expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
        })
      );
    }

    const now = new Date().toISOString();
    const lead = {
      email,
      first_name: firstName,
      tags,
      source,
      variant,
      ...utm,
      referrer,
      ip,
      country: request.cf?.country || "",
      user_agent: request.headers.get("User-Agent") || "",
      referer: request.headers.get("Referer") || "",
      created_at: now,
    };

    // --- Persist (idempotent by email) ------------------------------------
    let isNew = true;
    if (env.LEADS) {
      const key = `lead:${email}`;
      const existing = await env.LEADS.get(key);
      if (existing) {
        isNew = false;
        // Preserve original signup timestamp; refresh last-seen + tags.
        try {
          const prev = JSON.parse(existing);
          lead.created_at = prev.created_at || now;
          lead.first_name = lead.first_name || prev.first_name || "";
        } catch (_) {}
        lead.updated_at = now;
      }
      ctx.waitUntil(env.LEADS.put(key, JSON.stringify(lead)));
    }

    // --- Fan out to downstream integrations (never block the response) ----
    ctx.waitUntil(
      Promise.allSettled([
        forwardToFunnel(env, lead, isNew),
      ])
    );

    return json({ ok: true, new: isNew }, 200, origin);
  },
};

// --------------------------------------------------------------------------
// Downstream integrations
// --------------------------------------------------------------------------

/**
 * Forward the captured lead to the marketing funnel. FORWARD_URL can be an
 * n8n / Make.com webhook, an ESP inbound endpoint, a Google Apps Script, etc.
 * The lead is POSTed as JSON; if FORWARD_SECRET is set it is sent as a
 * bearer token so the receiver can authenticate the call.
 */
async function forwardToFunnel(env, lead, isNew) {
  if (!env.FORWARD_URL) return;
  const headers = { "content-type": "application/json" };
  if (env.FORWARD_SECRET) headers["Authorization"] = `Bearer ${env.FORWARD_SECRET}`;
  await fetch(env.FORWARD_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...lead, is_new: isNew }),
  });
}

/**
 * Send the transactional "here's your download" email via Resend. This is the
 * promise the /toolkit/ landing page makes ("sent to your inbox instantly").
 * Requires RESEND_API_KEY + FROM_EMAIL. DOWNLOAD_URL is the lead-magnet asset.
 */
async function deliverLeadMagnet(env, lead) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) return;

  const isToolkit = /toolkit/i.test(lead.source) || /toolkit/i.test(lead.tags);
  const downloadUrl = env.DOWNLOAD_URL || "https://slashmantools.us/toolkit/";
  const name = lead.first_name ? ` ${lead.first_name}` : "";

  const subject = isToolkit
    ? "Your AI Productivity Toolkit is ready 🎁"
    : "You're in — welcome to Slashman Tools 📬";

  const cta = isToolkit
    ? `<p style="margin:24px 0"><a href="${downloadUrl}" style="background:#818cf8;color:#0a0a0f;padding:12px 24px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Download the Toolkit →</a></p>
       <p style="color:#666;font-size:13px">Or copy this link: <a href="${downloadUrl}">${downloadUrl}</a></p>`
    : `<p style="margin:24px 0"><a href="https://slashmantools.us/" style="background:#818cf8;color:#0a0a0f;padding:12px 24px;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block">Browse the guides →</a></p>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#222">
      <h2 style="color:#111">Hey${name}! 👋</h2>
      <p>${
        isToolkit
          ? "Thanks for grabbing the AI Productivity Toolkit — 50+ prompts, a tools comparison sheet, and ready-to-use workflow templates."
          : "Thanks for subscribing to AI Tools Weekly — practical AI guides and free tools, no hype."
      }</p>
      ${cta}
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
      <p style="color:#999;font-size:12px">You received this because you signed up at slashmantools.us.
      Reply to this email any time — a real human reads them.</p>
    </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: lead.email,
      subject,
      html,
      reply_to: env.REPLY_TO || undefined,
    }),
  });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

async function parseBody(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await request.json();
  }
  // application/x-www-form-urlencoded or multipart/form-data
  const form = await request.formData();
  const obj = {};
  for (const [k, v] of form.entries()) obj[k] = v;
  return obj;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  // Pragmatic RFC-5322-lite check: something@something.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Admin auth for /leads and /cleanup: `Authorization: Bearer <ADMIN_TOKEN>`.
 * ADMIN_TOKEN is its own secret, separate from MAUTIC_FORWARD_TOKEN (which is
 * sent to the Mautic receiver), and never travels in the URL. Both values are
 * hashed first so the constant-time compare works on equal-length buffers.
 */
async function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(env.ADMIN_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Check a key with Gumroad and map the purchase to a PRO plan:
 *   Single Pass → one export (key accepted at most SINGLE_PASS_MAX_USES times)
 *   30-Day Pass → unlimited until 30 days after purchase
 *   Lifetime    → unlimited; the token lasts 30 days and the app re-verifies
 */
async function verifyLineChatProKey(env, key) {
  const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
    method: "POST",
    body: new URLSearchParams({
      product_id: env.LINE_CHAT_PRO_PRODUCT_ID,
      license_key: key,
      increment_uses_count: "true",
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data?.success || !data.purchase) {
    return { status: res.status === 404 ? 404 : 502, body: { ok: false, error: res.status === 404 ? "unknown_key" : "gumroad_error" } };
  }
  const p = data.purchase;
  if (p.refunded || p.chargebacked || p.disputed) {
    return { status: 403, body: { ok: false, error: "purchase_revoked" } };
  }
  // `variants` is {"方案 Plan": "Lifetime"} on current Gumroad, "(Lifetime)" on older payloads.
  const v = p.variants;
  const variant = (v && typeof v === "object" ? Object.values(v).join(" ") : String(v || "")).toLowerCase();
  const plan = variant.includes("lifetime") ? "lifetime"
    : variant.includes("30-day") ? "monthly"
    : "single_pass";
  const now = Math.floor(Date.now() / 1000);
  let exp = now + 30 * DAY_SECONDS;
  if (plan === "monthly") {
    exp = Math.floor(Date.parse(p.sale_timestamp) / 1000) + 30 * DAY_SECONDS;
    if (!(exp > now)) return { status: 403, body: { ok: false, error: "expired" } };
  } else if (plan === "single_pass") {
    if ((data.uses || 0) > SINGLE_PASS_MAX_USES) {
      return { status: 403, body: { ok: false, error: "single_pass_used" } };
    }
    exp = now + DAY_SECONDS;
  }
  const payload = { v: 1, plan, key: key.slice(-4), iat: now, exp };
  return { status: 200, body: { ok: true, plan, exp, token: await signToken(env, payload) } };
}

/** `<base64url(payload JSON)>.<base64url(ECDSA P-256/SHA-256 signature)>` */
async function signToken(env, payload) {
  const jwk = JSON.parse(env.LICENSE_SIGNING_JWK);
  const privKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privKey, new TextEncoder().encode(body)
  );
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}
