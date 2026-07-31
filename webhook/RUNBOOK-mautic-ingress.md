# Runbook — Public HTTPS ingress for Mautic lead capture (durable fix)

**Status:** OPEN — blocked on decisions/credentials only Wayne can provide.
**Created:** 2026-08-01 by cowork task (engineering-devops-automator).

## Why this exists

The blog's `LEAD_ENDPOINT` was `http://100.80.243.33:8081/subscribe`. That is fatal
three ways and every subscribe attempt failed **silently**:

1. `100.80.243.33` is a **Tailscale (100.64.0.0/10 CGNAT) private IP** — public
   visitors cannot route to it at all.
2. The site is served over **HTTPS**, so an `http://` request is **mixed content**
   and browsers block it outright.
3. Even inside the tailnet, `POST /subscribe` returns **404** — Mautic has no such
   route. Mautic's real form endpoint is `POST /form/submit?formId=<N>`.

## What was already shipped (stop-gap — the bleeding is stopped)

The site now posts to **web3forms** (`https://api.web3forms.com/submit`,
client-side, HTTPS, public) — the same provider/key already live in the
`unit-converter` tool. Leads arrive as **email** to the web3forms-registered
inbox. This un-breaks the funnel today but does **not** create Mautic contacts.
Files changed in `slashman413.github.io`: `hugo.toml` (`leadEndpoint`,
`leadAccessKey`), `layouts/partials/head.html`, `layouts/partials/sidebar.html`,
`layouts/newsletter/list.html`, `static/js/lead-capture.js`,
`static/toolkit/index.html`.

## Environment (verified on the host, 2026-08-01)

- The blog **and** Mautic run on the same box: `aitopatom-a4e2`,
  tailnet `tail5cf769.ts.net`, Tailscale IP `100.80.243.33`, public egress IP
  `119.14.21.45` (residential — **no inbound ports open / no HTTPS ingress**).
- Mautic = **Docker**, `mautic/mautic:7.1.3-apache-patched`, container
  `mautic-mautic_web-1`, published `0.0.0.0:8081->80`. Compose dir
  `/home/wayne/docker/mautic`; console at `/home/wayne/mautic/bin/console`;
  DB in `mautic-db-1` (mysql:8.4).
- No `cloudflared`, no authenticated `wrangler`, no nginx/caddy/traefik present.

## The durable fix = two independent pieces

### Piece 1 — a real Mautic form (gives a valid submit endpoint)

1. Log into Mautic (`http://100.80.243.33:8081/s/dashboard` over Tailscale).
2. **Components → Forms → New** (Campaign form). Add fields: Email (required),
   First Name, plus a hidden `tags` field if you want source tagging.
3. Save & publish. Note the **form ID** (`N`) from the URL. Its public submit
   endpoint is then `POST /form/submit?formId=N` with body fields named
   `mauticform[email]`, `mauticform[firstname]`, `mauticform[formId]=N`,
   `mauticform[return]`, `mauticform[submit]=1`.
   *(Mautic ignores/needs these exact `mauticform[...]` names — the current
   `lead-capture.js` sends flat JSON, so either point the endpoint at a thin
   proxy that reshapes the body, or use the Cloudflare Worker in `/webhook/`
   with `FORWARD_URL` set to the Mautic form submit URL.)*

### Piece 2 — public HTTPS ingress (pick ONE)

**Option A — Cloudflare Tunnel (recommended; keeps Mautic admin private).**
```bash
# on aitopatom-a4e2:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login                       # << needs Wayne's Cloudflare account
cloudflared tunnel create mautic-leads
# Route ONLY the submit + tracking paths publicly, NOT /s/ (admin):
#   ingress:
#     - hostname: leads.slashmantools.us
#       path: ^/(form/submit|mtc/.*|form/generate.*)
#       service: http://localhost:8081
#     - service: http_status:404
cloudflared tunnel route dns mautic-leads leads.slashmantools.us
cloudflared tunnel run mautic-leads            # then install as a systemd service
```
Requires: Cloudflare account + `slashmantools.us` on Cloudflare DNS.
Then set `leadEndpoint = "https://leads.slashmantools.us/form/submit?formId=N"`.

**Option B — Tailscale Funnel (no Cloudflare, but exposes a `*.ts.net` host).**
```bash
# path-scope to the form endpoints only; do NOT funnel /s/ admin:
tailscale serve --bg --set-path /form/submit http://localhost:8081/form/submit
tailscale funnel 443 on
tailscale funnel status
```
Requires: Funnel enabled in the tailnet ACL (`nodeAttrs`/`funnel`), and HTTPS
certs enabled for the tailnet. Endpoint would be
`https://aitopatom-a4e2.tail5cf769.ts.net/form/submit?formId=N` (ugly but works).
⚠️ Security: never funnel the whole Mautic app — path-scope to `/form/*` + `/mtc/*`.

**Option C — reverse-proxy under the existing site domain / a VPS.**
Put nginx/caddy in front on a public host and `proxy_pass` `/leads/` →
`http://100.80.243.33:8081/` over the tailnet; terminate TLS with the
slashmantools cert. Then `leadEndpoint = "https://<public-host>/leads/form/submit?formId=N"`.

### Piece 3 — point the site back & harden

Once ingress + form exist and a **public curl returns HTTP 200 and a contact
appears in Mautic**:
```bash
# curl acceptance test (run from OUTSIDE the tailnet):
curl -i -X POST "https://leads.slashmantools.us/form/submit" \
  -d "mauticform[email]=curltest@example.com" \
  -d "mauticform[firstname]=Curl" \
  -d "mauticform[formId]=N" -d "mauticform[submit]=1"
# expect 200/302; then Contacts in Mautic shows curltest@example.com
```
- In `slashman413.github.io/hugo.toml`: set `leadEndpoint` to the Mautic URL and
  remove `leadAccessKey` (web3forms-only). `lead-capture.js` already accepts a
  `.ok`/`.success`/2xx response; add `mauticform[...]` field mapping if you post
  directly to Mautic rather than through the Worker/proxy.
- Add CORS on the ingress for `https://slashmantools.us` (Mautic form submit is
  same-origin-tolerant but browser AJAX needs the header).
- Commit & push `main` → GitHub Actions rebuilds Hugo and deploys.

## Decisions needed from Wayne
1. Which ingress? (A Cloudflare Tunnel / B Tailscale Funnel / C reverse-proxy.)
2. Do leads go straight into **Mautic**, or stay on **web3forms email** for now?
3. Cloudflare account access (Option A) or Funnel ACL grant (Option B).
