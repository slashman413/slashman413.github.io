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
 *   GET  /leads       → export leads KV   (requires ?token=MAUTIC_FORWARD_TOKEN)
 *
 * See ./README.md for the full deploy + configuration guide.
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

// Origins allowed to call this Worker from the browser.
const ALLOWED_ORIGINS = [
  "https://slashmantools.us",
  "https://www.slashmantools.us",
  "https://slashman413.github.io",
  "http://localhost:1313", // hugo server
  "http://127.0.0.1:1313",
];

// Max lead submissions per IP per rolling window (defense against form spam).
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 10; // 10 minutes

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

    // --- GET /leads — export all captured leads (requires MAUTIC_FORWARD_TOKEN) ---
    if (url.pathname === "/leads") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "method_not_allowed" }, 405, origin);
      }
      const token = url.searchParams.get("token") || "";
      if (!env.MAUTIC_FORWARD_TOKEN || token !== env.MAUTIC_FORWARD_TOKEN) {
        return json({ ok: false, error: "unauthorized" }, 401, origin);
      }
      if (!env.LEADS) {
        return json({ ok: false, error: "kv_not_configured" }, 503, origin);
      }
      // List all lead keys and fetch each one
      const all = await env.LEADS.list({ prefix: "lead:" });
      const leads = [];
      for (const key of all.keys) {
        const raw = await env.LEADS.get(key.name);
        if (raw) {
          try { leads.push(JSON.parse(raw)); } catch (_) { /* skip malformed */ }
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
        isNew ? deliverLeadMagnet(env, lead) : Promise.resolve(),
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

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}
