# Runbook — Public lead ingress → Mautic (durable fix)

**Status:** OPEN — blocked on Cloudflare account access + Mautic API creds (Wayne only).
**Created:** 2026-08-01. **Re-verified:** 2026-08-01 by cowork task
`bee7c65d` (engineering-devops-automator). Second pass corrected the recommended
architecture (Worker+KV+sync — never exposes Mautic) and re-tested every claim.

## Why this exists

The blog's `LEAD_ENDPOINT` was `http://100.80.243.33:8081/subscribe`. Fatal three
ways — **every subscribe failed silently, list growth = 0**:

1. `100.80.243.33` is a **Tailscale (100.64/10 CGNAT) private IP** — public
   visitors cannot route to it.
2. The site is **HTTPS**, so an `http://` POST is **mixed content** → browser-blocked.
3. Even inside the tailnet, `POST /subscribe` is **404** — Mautic has no such route
   (its real form route is `POST /form/submit?formId=<N>`).

## What is live right now (stop-gap — bleeding stopped, verified)

`hugo.toml` → `leadEndpoint = "https://api.web3forms.com/submit"` (+ `leadAccessKey`).
Confirmed **live on the public domain**: `curl https://slashmantools.us/` ships the
web3forms endpoint. Real visitors' browsers submit successfully; leads arrive as
**email** to the web3forms-registered inbox. This does **not** create Mautic contacts.

⚠️ **You cannot smoke-test web3forms with `curl`.** As of 2026-08-01 the endpoint sits
behind a **Cloudflare "Just a moment" managed challenge** and rejects non-browser
clients (server curl → `403`, JS-challenge HTML). That is by design (client-side
form API) and does **not** mean the funnel is broken — verify from a real browser on
the page, or via the browser devtools Network tab, not curl.

## The durable fix — recommended architecture (already ~90% built)

```
Form → Cloudflare Worker  →  KV storage  →  sync_kv_to_mautic.py (cron)  →  Mautic API
       (/webhook/worker.js)  (leads)         (/webhook/sync_kv_to_mautic.py)  (localhost:8081)
```

Why this over "reverse-proxy straight to Mautic": it **never exposes Mautic to the
public internet** (Mautic stays tailnet-only; the sync script reaches it on
`localhost`), it **solves CORS** (the Worker sets `Access-Control-Allow-Origin` for
`slashmantools.us`), and the current `lead-capture.js` already posts the exact flat
JSON body the Worker's `POST /subscribe` accepts (`{email, first_name, tags, source,
website}`) and reads the `data.ok` the Worker returns — **no site JS changes needed**,
just drop `leadAccessKey`.

Everything below the DNS/creds line is already coded in `/webhook/`:
`worker.js` (validate + dedup + rate-limit + CORS + `/subscribe` `/health` `/leads`),
`wrangler.toml`, `sync_kv_to_mautic.py` (polls Worker `/leads`, upserts Mautic
contacts). What is missing is **deployment + credentials only**:

### Step 1 — Deploy the Worker (needs Wayne's Cloudflare account)
```bash
cd slashman413.github.io/webhook
npm install
npx wrangler login                                   # << Wayne's Cloudflare account
npx wrangler kv namespace create LEADS               # paste returned id → wrangler.toml [[kv_namespaces]].id
npx wrangler secret put MAUTIC_FORWARD_TOKEN         # invent a strong token; reuse in Step 3
# optional: npx wrangler secret put RESEND_API_KEY   # only if you want the lead-magnet email
npx wrangler deploy
```

### Step 2 — First-party domain (needs slashmantools.us on Cloudflare DNS)
In `wrangler.toml` uncomment the `[[routes]]` block (`leads.slashmantools.us`,
`custom_domain = true`) and `wrangler deploy` again. Fallback if the domain is not on
Cloudflare: use the default `https://lead-capture.<subdomain>.workers.dev` URL — works
immediately, no DNS needed, just a longer hostname.

### Step 3 — Enable Mautic API + a service user (needs Mautic admin)
1. Mautic **Settings → Configuration → API Settings → API enabled = Yes** (Basic Auth on).
2. **Settings → Users → New**: a dedicated API user; note user/password.
3. Provide `MAUTIC_API_USER` / `MAUTIC_API_PASSWORD` to the sync script env.

### Step 4 — Schedule the sync (host cron)
```bash
LEADS_API_URL="https://leads.slashmantools.us/leads" \
MAUTIC_FORWARD_TOKEN="<same token as Step 1>" \
MAUTIC_BASE_URL="http://localhost:8081" \
MAUTIC_API_USER="<step 3>" MAUTIC_API_PASSWORD="<step 3>" \
python3 /home/wayne/workspace/github/slashman413/slashman413.github.io/webhook/sync_kv_to_mautic.py
# then add a */5 * * * * crontab entry with the same env (or a systemd timer).
```

### Step 5 — Point the site back & verify, then deploy
```bash
# hugo.toml:
#   leadEndpoint  = "https://leads.slashmantools.us/subscribe"
#   leadAccessKey = ""     # web3forms-only; drop it
# ACCEPTANCE (run from OUTSIDE the tailnet, e.g. phone hotspot):
curl -i -X POST "https://leads.slashmantools.us/subscribe" \
  -H "Content-Type: application/json" \
  -d '{"email":"curltest@example.com","first_name":"Curl","source":"acceptance"}'
# expect HTTP 200 {"ok":true}; then run the sync; then Mautic → Contacts shows curltest@example.com
git commit -am "feat(leads): durable Worker→KV→Mautic ingress; retire web3forms stop-gap" && git push  # → Actions redeploys
```

## Alternative if Cloudflare is off the table

**Tailscale Funnel** (verified available on node `aitopatom-a4e2`) can expose a
public HTTPS endpoint at `https://aitopatom-a4e2.tail5cf769.ts.net/...` **without any
Cloudflare account**. But it (a) needs Funnel enabled in the tailnet ACL
(`nodeAttrs`/`funnel` — admin-console grant), (b) must be **path-scoped to
`/form/submit` + `/mtc/*` only** (never funnel `/s/` admin), and (c) still needs a CORS
shim + a **real Mautic form** built first — the only existing form (`/form/5`
"actionstest") is a fieldless test form with no email input, so it is unusable as-is.
Net: more moving parts and a public foothold on Mautic; prefer the Worker path.

## Decisions/inputs needed from Wayne (this is the whole blocker)
1. **Cloudflare account access** to deploy the Worker + KV (+ optionally
   `leads.slashmantools.us` DNS). This is the recommended path and unblocks Steps 1–2.
2. **Mautic API user + password** (Step 3) so the sync can upsert contacts.
3. Confirm the target: **Mautic contacts** (do Steps 1–5) vs. **stay on web3forms
   email** for now (do nothing — it is already live and capturing).
