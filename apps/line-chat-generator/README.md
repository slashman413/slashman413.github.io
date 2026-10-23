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

`PRO_SALES_OPEN` in `src/utils/proStore.ts` is `false`: buy buttons and the
license form are hidden and no client-side code can grant PRO. Before turning
it on, the Gumroad product `line-chat-generator-pro` must exist and keys must
be verified server-side (Gumroad `/v2/licenses/verify` via the
api.slashmantools.us Worker, returning a signed token).
