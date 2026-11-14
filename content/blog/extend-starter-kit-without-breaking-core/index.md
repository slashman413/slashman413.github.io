---
title: "Extending a SaaS Starter Kit Without Breaking Auth, Teams or Billing"
description: "Where to put domain code, how to avoid forking the kit's core, keep Stripe config out of feature branches, and pin AI hooks so updates cannot change behaviour."
date: "2026-11-14T08:00:00+08:00"
draft: false
slug: "extend-starter-kit-without-breaking-core"
author: "Wayne Chang"
tags: ["saas-boilerplate", "nextjs", "stripe", "architecture", "ai-hooks"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/kuvajr"
product_price: "99.99"
product_brand: "Slashman Tools"
product_sku: "SMT-SSK"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Extending a SaaS Starter Kit Without Breaking Auth, Teams or"
faq:
  - q: "Should I fork a starter kit or keep it as an upstream remote?"
    a: "Keep it as an upstream remote and put your code in a separate module tree that imports from the kit, never the reverse. Fork only when you have already edited core files heavily enough that upstream merges are no longer realistic, and accept that upstream security fixes then become your job."
  - q: "Where should Stripe price IDs live?"
    a: "Not in source control. Reference a lookup key or plan slug in code and let each environment map that key to a price ID, so test and live mode can differ without a branch or a commit."
  - q: "How do I stop a kit update from changing my AI output?"
    a: "Own the model identifier, the prompt text and the output schema in your own versioned files, and call the kit's transport through a wrapper you control. Log the prompt id and model on every request so a changed default is visible immediately."
---

A starter kit pays for itself in the first week and starts charging rent in the third — the rent being every upstream release you cannot merge because your changes are tangled into files the kit owns. The fix is not discipline. It is a directory contract, one import direction, payment config that lives outside your branches, and AI calls you can pin. All four are cheap before your first feature branch and expensive afterwards.

## Keep the core read-only and put your code beside it

Decide once which folders the kit owns: sessions and sign-in, team membership and invitations, role checks, subscription state, API key issuance. Call that the core, and treat it like a vendored dependency. During normal work you do not edit those files. Your logic goes in `src/modules/<domain>/` — the invoice exporter, the prompt library, the webhook fan-out, the onboarding flow.

Two rules make that hold. Imports go one way: modules may import core, core may never import modules. And contact with core happens through a few adapters you own — `requireRole()`, `getEntitlements()`, `callModel()` — so feature code asks your adapter, never the kit's internals. When the kit changes a signature, you fix one file instead of forty call sites. The same reasoning applies to any layered stack: change [one layer at a time](/blog/upgrade-one-layer-ai-stack/) and you keep the rest frozen.

Enforce the boundary with the linter rather than code review:

```json
{
  "extends": ["next/core-web-vitals"],
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["@/modules/*"],
        "message": "Core must not import domain modules. Put shared types in /lib/contracts."
      }]
    }]
  },
  "overrides": [{
    "files": ["src/modules/**/*"],
    "rules": { "no-restricted-imports": "off" }
  }]
}
```

Add a CI guard too, so nobody patches core at 6pm on a Friday:

```bash
if git diff --name-only origin/main...HEAD | grep -qE '^src/(auth|teams|billing|keys)/'; then
  echo "Core paths changed. Open an upstream PR or move the change into src/modules."
  exit 1
fi
```

## Choose an overlay strategy before the first merge conflict

Four ways to add features to a kit, ranked by how much of your future you spend on it:

| Strategy | How it works | Upgrade cost | Main risk | Use when |
|---|---|---|---|---|
| Hard fork | Edit kit files, stop pulling upstream | Total: you re-implement every upstream fix | Security fixes to auth and billing never reach you | You have already diverged badly |
| Overlay + upstream remote | Kit files stay untouched, your code in `src/modules`, thin wrapper components | Low: merge upstream tags, conflicts only in wiring files | Low | Default choice |
| Patch files | Small edits to core stored as `patches/*.patch`, reapplied on upgrade | Medium | Patches silently stop applying when upstream touches the same lines | One or two tiny edits to a file you cannot wrap |
| Extension points | Register hooks, providers or handlers the kit exposes | Lowest | Only covers what the kit exposes | The kit has real hook points |

The overlay is the one worth defaulting to. Your repo gets two remotes: upstream, read-only, and your origin. You merge tags rather than branches, so the version you run is always a name you can read in `package.json`, and the wiring files you do touch are few enough to review by hand. If you are picking a kit in the first place, [what survived week one](/blog/week-one-saas-starter-kit/) is a more useful question than the feature list.

## Keep payment configuration out of feature branches

The worst place for a Stripe price ID is a feature branch. Two branches add two plans, both merge, and checkout now points at a price that existed in one person's test account. Price IDs also differ between test and live mode, so any ID hardcoded in a component is wrong in at least one environment.

Rule: code references a lookup key or plan slug. The environment maps that key to a price.

```json
{
  "plans": {
    "starter": { "lookupKey": "starter_monthly", "features": ["api_keys", "csv_export"] },
    "team":    { "lookupKey": "team_monthly",    "features": ["api_keys", "csv_export", "sso"] }
  },
  "stripe": {
    "secretEnv": "STRIPE_SECRET_KEY",
    "webhookSecretEnv": "STRIPE_WEBHOOK_SECRET",
    "mode": "test"
  }
}
```

Gate features on an entitlements row written by the webhook, not by calling Stripe on every request and not by comparing plan names as strings in JSX. Resolve price to lookup key to plan in exactly one handler, keyed on the Stripe event id so replays are harmless.

On schema: do not alter the kit's subscription table to hold your flags. Add `app_entitlements` beside it and join. If you truly need a new column on a core table, add it nullable with a backfill, so an upstream migration does not collide with yours. Each developer keeps their own test-mode keys in a gitignored `.env.local`; CI uses a shared sandbox account. Live keys never appear in a branch.

## Pin the AI hooks so an upstream update cannot change behaviour

Most kits now ship an AI helper: a client wrapper, a default model, maybe a summarise function. Call it directly and an upstream bump can change the model, the temperature, the prompt, the truncation and the retry policy — your product changes with no diff in your repo. Pin at the boundary instead.

Three things to own: the model identifier (a dated snapshot string, not a moving alias), the prompt text in your own versioned file, and the output shape as a schema you validate.

```ts
// src/modules/ai/prompts/summarise.v3.ts
export const promptId = "summarise.v3";
export const model = "gpt-4o-2024-08-06";
export const maxOutputTokens = 400;

export const messages = (doc: string) => [
  { role: "system", content: "Summarise in three bullet points. No preamble." },
  { role: "user", content: doc },
];
```

Then route every call through one function that logs `promptId`, `model` and token counts beside the request id — the pattern in [log input, decision, output](/blog/workflow-observability-log-input-decision-output/). When the kit's wrapper changes its default model, the log line shows it the same day instead of surfacing as a vague quality complaint. Validate the parsed result with a schema and keep one fixture test; a renamed field then fails in CI, not in production.

## What to do next

1. Write the core line down. List the folders the kit owns in the README, add the eslint rule and the CI guard above, and run the build once to confirm nothing already violates it.
2. Build the three adapters — `requireRole`, `getEntitlements`, `callModel` — then grep your feature code for direct imports of kit internals and replace each one.
3. Move price IDs out of code: create `config/plans.json`, add lookup keys in Stripe test mode, and verify checkout from a fresh `.env.local` with no IDs committed anywhere.
4. Pin the AI call: copy the model string and prompt into a versioned module, add a schema check plus one fixture, and log the `promptId` on every request.
5. Set up the two remotes and merge upstream by tag. Keep a short changelog of the wiring files you edit so the next merge takes minutes.

If you would rather start from something that already has the core wired, the SaaS Starter Kit is a production-grade Next.js multi-tenant boilerplate with authentication, teams, RBAC, Stripe billing and API keys built in, available as a free open-source core plus a paid Pro kit for $99.99 one-time at https://slashmaster6.gumroad.com/l/kuvajr.

## Get SaaS Starter Kit

[**SaaS Starter Kit**](https://slashmaster6.gumroad.com/l/kuvajr?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=extend-starter-kit-without-breaking-core) — **$99.99**, one-time payment, instant download. See the full breakdown on the [review page](/blog/saas-starter-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
