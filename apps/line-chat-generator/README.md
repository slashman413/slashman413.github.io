# LINE Chat Generator (source)

Vite + React + TypeScript + Tailwind. This is the only source of the tool; the
built bundles under `static/line-chat-generator/` (this repo and
ckw19810413.github.io) are generated from it.

```bash
npm ci && npm run dev      # local dev
./deploy.sh                # build once, copy dist/ to both static/ folders
```

Then commit + push both repos.

## PRO status

PRO is sold as Gumroad product `line-chat-generator-pro` on slashmaster6
(Single Pass NT$39, 30-Day Pass NT$99, Lifetime NT$249; one-time payments, the
receipt shows a license key). The app posts the key to
`https://api.slashmantools.us/license/line-chat-pro` (`webhook/worker.js`), which
checks it with Gumroad `/v2/licenses/verify` and returns a token signed with
ECDSA P-256. The app stores the token and grants PRO only while its signature
(public key `LICENSE_PUBLIC_JWK` in `src/utils/proStore.ts`) and expiry check
out. Single Pass: one export per activation, key accepted at most twice.
30-Day Pass: valid 30 days from purchase (`sale_timestamp`, enforced by the
Worker). Lifetime: each token lasts 30 days. For both, the app keeps the key in
localStorage and silently re-activates when the token is within 3 days of
expiry or already expired; the refresh sends the old token, so the Worker
doesn't count it against the activation cap (Gumroad `uses`: 30-Day 20,
Lifetime 50 → error `activation_limit`). If the signing key is rotated, update both the Worker secret
`LICENSE_SIGNING_JWK` and `LICENSE_PUBLIC_JWK`.
