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

## Google sign-up card

`index.html` loads Google's script and the shared `slashmantools.us/shared/google-signup.js`,
which draws the bottom card and sends the credential to
`https://api.slashmantools.us/subscribe/google`. The Worker verifies the ID token and takes the
email from it. `src/index.css` moves the card right on desktop and adds scroll room; `App.tsx`
hides it during dialogs and captures, because recording grabs the whole tab.

The card doesn't appear under `npm run dev`: the script skips non-HTTPS pages, and Google only
accepts this client on the authorized origins. Test on the live URLs:

- https://slashmantools.us/line-chat-generator/
- https://ckw19810413.github.io/line-chat-generator/

To see the card again after dismissing or signing up, run this in the console, then reload:
`localStorage.removeItem('sm_google_signup')`
