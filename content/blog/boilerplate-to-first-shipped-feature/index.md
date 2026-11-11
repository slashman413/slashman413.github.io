---
title: "From Boilerplate to Your First Shipped Feature in a Weekend"
description: "A fixed order for shipping one feature on a boilerplate: pick the scope, reuse auth and billing, add one entity, deploy, then prove it with a smoke test."
date: "2026-11-11T08:00:00+08:00"
draft: false
slug: "boilerplate-to-first-shipped-feature"
author: "Wayne Chang"
tags: ["saas", "nextjs", "boilerplate", "deployment", "smoke-test"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/kuvajr"
product_price: "99.99"
product_brand: "Slashman Tools"
product_sku: "SMT-SSK"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "From Boilerplate to Your First Shipped Feature in a Weekend"
faq:
  - q: "Why should the wrong-tenant read return 404 instead of 403?"
    a: "A 403 confirms the record exists and only the permission failed, which leaks the presence of another customer's data. A 404 makes cross-tenant access indistinguishable from a nonexistent id."
  - q: "Do I need a separate API route if my feature is a server-rendered form?"
    a: "Not for users, but a thin route handler that calls the same guarded action lets your smoke test exercise the whole stack with curl instead of a browser session. Keep both paths calling one action function so they cannot drift."
  - q: "How do I check plan access without calling Stripe on every request?"
    a: "Let the existing webhook write the plan onto your local team or subscription record, then read that record in a guard. Call Stripe only for checkout and the billing portal, never on a hot path."
---

Two days is enough to ship one feature on top of a boilerplate, and not enough to ship two. The sequence below runs in a fixed order — pick the feature, reuse the auth and billing paths that already exist, add one domain entity, deploy, verify — because each step removes decisions the next one would otherwise force you to make. Run it out of order and you will spend Sunday night debugging a payment webhook instead of checking your own code.

## Pick a feature you can prove with an HTTP status code

Before you open the editor, run your candidate through four questions:

1. Does it need more than one new table?
2. Is it gated by a plan flag, role or seat limit that already exists in the kit?
3. Can you prove it works with a status code and a follow-up read, without clicking around?
4. Does it avoid a third party you have not integrated yet?

Three yeses is a weekend. Two is a cut. Below is how the usual candidates score.

| Candidate | New tables | Touches auth | Touches billing | Provable by curl | Weekend-safe |
|---|---|---|---|---|---|
| CSV export of existing records | 0 | No | Read-only plan gate | Yes | Yes |
| Audit log page over existing events | 1 | No | No | Yes | Yes |
| Invite a teammate | 1 (invites) | Yes, roles | Seat counting | Partly, needs email | Risky |
| Scheduled email digests | 1 (jobs) | No | No | No, needs a queue | No |
| Custom SMTP settings | 1 | No | Yes | Partly | No, secrets and deliverability |

Cutting is the actual skill here. The invite flow looks small until you discover it touches role assignment, seat limits, an email provider and a pending-state table, each with its own failure mode. The export flow touches your entity and one entitlement check. Ship the second one; the first one is next weekend's project, and you will know more about your own domain by then.

## Wire the existing auth and billing before you write domain code

Order matters: session, then tenant, then entitlement, then domain. If you write the domain layer first, you will bolt the checks on afterward and end up with two code paths that disagree.

Use the kit's existing helpers. Do not write a second session check because the existing one felt awkward in this one route — a duplicate auth path is the single most common way a boilerplate app grows a hole. The same goes for billing: never call Stripe from a request handler to decide whether someone is allowed to do something. The webhook already wrote the plan onto the local record. Read that record.

```ts
// app/(app)/items/actions.ts — illustrative names, keep the shape
export async function createItem(input: unknown) {
  const session = await requireSession();      // redirects when absent
  const team = await requireTeam(session);     // resolves the active tenant
  assertEntitlement(team, 'items.write');      // reads the local plan record

  const data = itemSchema.parse(input);        // validate at the boundary
  return itemsRepo.create({ ...data, teamId: team.id });
}
```

The rule that keeps this honest: the domain repository never sees a raw request. It takes `teamId` and validated data, nothing else. Every query inside it filters on `teamId`. If a function needs to know about the session, it belongs in the action layer.

## The pre-wired pieces you should not touch

Some parts of a boilerplate are contracts with an external system or with another part of the app. Editing them is how a one-feature weekend turns into a three-day authentication incident.

- Session and cookie configuration, including JWT or session callbacks. Changing the shape here invalidates every existing session.
- The Stripe webhook handler and its signature verification. If you need new event data, add a column and handle the event, do not restructure the handler.
- Middleware order and route matchers, and whatever resolves the active tenant. A matcher that accidentally excludes a new path silently drops your auth check.
- Existing migration files. Add new migrations; never edit applied ones.
- Environment variable names the kit already reads. Adding a differently named copy of the same secret guarantees a production-only bug.

This is the same discipline as keeping one job per layer, which is the argument behind [upgrading one layer without breaking the rest](/blog/upgrade-one-layer-ai-stack/). Treat the pre-wired pieces as third-party code you happen to have the source for.

## Put one entity in one place

Additive migration, schema, repository, action, page. Nothing else. A layout that works:

```text
src/
  db/migrations/2026..._add_items.sql
  domain/items/schema.ts    # types and validation, no DB imports
  domain/items/repo.ts      # every SQL statement for items
  app/(app)/items/page.tsx  # read view
  app/(app)/items/actions.ts # write path, guards live here
```

The migration is where tenant safety is decided, not in application code:

```sql
create table items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index items_team_created_idx on items (team_id, created_at desc);
create unique index items_team_name_key on items (team_id, lower(name));
```

Scoping the unique index to `team_id` means two different customers can both have an item called "first", and the same customer cannot. On delete cascade means deleting a team does not leave orphans that later confuse a support ticket. Keep the constraint in the database even if you also validate in code — the database is the only place that cannot be bypassed.

If the entity has a write path used by a form, add a thin JSON route handler that calls the same action. You are not doing it for an API customer; you are doing it so the smoke test below can run without a browser.

## Deploy, then run the smoke test that proves the stack

Deploy in the same order you built: run migrations, deploy the app against a preview URL, run the smoke test there, then promote and run the same script against production. Two base URLs, one script.

The smoke test needs two sessions in different tenants, created by hand once. The four cases that matter: anonymous access, normal access, cross-tenant access, and the plan or duplicate constraint.

```bash
#!/usr/bin/env bash
# smoke.sh — run against preview, then production
BASE="${1:?usage: smoke.sh <base-url>}"
A="${SMOKE_COOKIE_A:?tenant A session cookie}"
B="${SMOKE_COOKIE_B:?tenant B session cookie}"

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

[ "$(code "$BASE/items")" = '307' ] || { echo 'FAIL: anonymous should redirect'; exit 1; }
[ "$(code -H "Cookie: $A" "$BASE/items")" = '200' ] || { echo 'FAIL: owner read'; exit 1; }

body=$(curl -s -X POST "$BASE/api/items" -H "Cookie: $A" \
  -H 'content-type: application/json' -d '{"name":"first"}')
id=$(printf '%s' "$body" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
[ -n "$id" ] || { echo "FAIL: create returned $body"; exit 1; }

[ "$(code -H "Cookie: $B" "$BASE/api/items/$id")" = '404' ] || { echo 'FAIL: cross-tenant read'; exit 1; }
[ "$(code -X POST "$BASE/api/items" -H "Cookie: $A" \
  -H 'content-type: application/json' -d '{"name":"first"}')" = '409' ] || { echo 'FAIL: duplicate accepted'; exit 1; }

echo 'smoke ok'
```

A wrong-tenant read must return 404, not 403 — 403 confirms the record exists. If your smoke test passes against preview and fails in production, the usual cause is a migration that did not run, not a code difference. Commit the script, run it before you tell anyone the feature exists, and log one line per guard decision so a failed check points at the guard rather than the page; the logging shape in [adding observability to a workflow](/blog/workflow-observability-log-input-decision-output/) applies directly.

If you are starting from someone else's kit rather than your own, read [what survived week one with a SaaS starter kit](/blog/week-one-saas-starter-kit/) before you decide which files are safe to edit.

## What to do next

1. Write your one-sentence feature statement and the four-line smoke test before you write any application code. If the smoke test is hard to describe, the feature is too big.
2. Create two real accounts in two teams this week and capture their session cookies into `SMOKE_COOKIE_A` and `SMOKE_COOKIE_B`. This is the slowest part of the verification step and it is pure setup.
3. List the files in your kit that handle session, tenant resolution, the Stripe webhook and middleware, and put them on a do-not-edit list in the repo README.
4. Run the smoke script against your current preview deploy, even with no new feature. Whatever fails now is not your feature's fault later.
5. If you want a base where authentication, teams, RBAC, Stripe billing and API keys are already wired, the SaaS Starter Kit is a $99.99 one-time download with a free open-source core and a paid Pro kit, available at https://slashmaster6.gumroad.com/l/kuvajr. It removes the wiring you should not be touching; it does not remove the entity, the migration, or the smoke test.

## Get SaaS Starter Kit

[**SaaS Starter Kit**](https://slashmaster6.gumroad.com/l/kuvajr?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=boilerplate-to-first-shipped-feature) — **$99.99**, one-time payment, instant download. See the full breakdown on the [review page](/blog/saas-starter-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
