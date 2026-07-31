# Lead-Capture Webhook

Custom, self-owned email-capture endpoint for **slashmantools.us**. Replaces the
dead ConvertKit/Kit form placeholders (`form.kit/...`, `YOUR_FORM_ID`) that were
sitting on the sidebar newsletter widget and the `/toolkit/` lead-magnet page.

It's a single [Cloudflare Worker](https://developers.cloudflare.com/workers/)
(free tier: 100k requests/day) — no server to run, matching the site's
zero-hosting-cost model.

## What it does

```
Browser form ──POST /subscribe──▶ Cloudflare Worker
                                      ├─ validate + de-dupe email
                                      ├─ honeypot + per-IP rate limit
                                      ├─ store lead            → KV (LEADS)
                                      ├─ email the download    → Resend   (optional)
                                      └─ forward to funnel     → FORWARD_URL (optional)
```

Everything downstream is **optional**. With nothing configured beyond the KV
namespace, leads are still captured and stored durably — so it works from the
first deploy. Add Resend to auto-email the toolkit, add `FORWARD_URL` to pipe
leads into n8n / Make.com / your ESP.

## Frontend wiring (already done in this repo)

- `static/js/lead-capture.js` — shared AJAX client. Any form tagged
  `data-lead-form` posts here with inline loading/success/error UX. Keeps the
  existing GA4 `generate_lead` + Plausible `Lead` tracking.
- `layouts/partials/head.html` — injects `window.LEAD_ENDPOINT` from
  `hugo.toml` → `params.leadEndpoint` and loads the client on all templated pages.
- `layouts/partials/sidebar.html` — newsletter widget (`data-source="sidebar-subscribe"`).
- `static/toolkit/index.html` — lead-magnet form (`data-source="toolkit-landing"`).

To point the site at a different endpoint, edit `params.leadEndpoint` in
`hugo.toml` (and the inline `window.LEAD_ENDPOINT` in `static/toolkit/index.html`,
which is a standalone static page).

## One-time deploy

From this `webhook/` directory:

```bash
npm install
npx wrangler login                              # auth once

# 1. Create the KV namespace and paste the printed id into wrangler.toml
npx wrangler kv namespace create LEADS

# 2. (Optional) transactional email via Resend — https://resend.com
npx wrangler secret put RESEND_API_KEY

# 3. (Optional) forward leads into the marketing funnel
#    set FORWARD_URL in wrangler.toml [vars], and if the receiver needs auth:
npx wrangler secret put FORWARD_SECRET

# 4. Ship it
npx wrangler deploy
```

By default the Worker is reachable at
`https://lead-capture.<your-subdomain>.workers.dev`. For best deliverability
serve it first-party at `http://100.80.243.33:8081` — uncomment the
`[[routes]]` block in `wrangler.toml` (requires slashmantools.us on Cloudflare
DNS). The forms already expect that URL.

## Configuration reference

| Binding           | Where            | Purpose                                             |
| ----------------- | ---------------- | --------------------------------------------------- |
| `LEADS`           | KV namespace     | Stores leads (`lead:<email>`) + rate-limit counters |
| `FROM_EMAIL`      | `[vars]`         | Verified Resend sender, e.g. `hello@slashmantools.us` |
| `REPLY_TO`        | `[vars]`         | Reply-to for the welcome email                       |
| `DOWNLOAD_URL`    | `[vars]`         | Lead-magnet asset link sent to toolkit subscribers   |
| `FORWARD_URL`     | `[vars]`         | Downstream webhook (n8n/Make/ESP) — optional         |
| `RESEND_API_KEY`  | `wrangler secret`| Enables transactional email — optional               |
| `FORWARD_SECRET`  | `wrangler secret`| Bearer token sent to `FORWARD_URL` — optional        |

## CI

`.github/workflows/deploy-webhook.yml` auto-deploys on any push touching
`webhook/**`. Add repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit)
and `CLOUDFLARE_ACCOUNT_ID`.

## Inspecting captured leads

```bash
npx wrangler kv key list --binding=LEADS               # all keys
npx wrangler kv key get --binding=LEADS "lead:you@example.com"
npx wrangler tail                                       # live request logs
```

## Local test

```bash
npx wrangler dev
# in another shell:
curl -s -X POST http://localhost:8787/subscribe \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","first_name":"Sam","source":"toolkit-landing"}'
# → {"ok":true,"new":true}
```
