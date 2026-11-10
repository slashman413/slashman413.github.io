---
title: "Week One With a SaaS Starter Kit: What Survived, What Got Rewritten"
description: "A first-week case study of shipping one feature on a Next.js SaaS boilerplate: which auth, billing and API key code survived, which got rewritten, and why."
date: "2026-11-10T08:00:00+08:00"
draft: false
slug: "week-one-saas-starter-kit"
author: "Wayne Chang"
tags: ["saas-boilerplate", "nextjs", "multi-tenant", "billing", "case-study"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/kuvajr"
product_price: "99.99"
product_brand: "Slashman Tools"
product_sku: "SMT-SSK"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Week One With a SaaS Starter Kit: What Survived, What Got Re"
faq:
  - q: "Should I delete the kit's role model and write my own from scratch?"
    a: "Usually not. Keep the tenant role for workspace-level actions and add a resource grant table for per-object permissions, then rewrite the body of the existing permission function instead of replacing it. That keeps every call site and the tests that already pass."
  - q: "Why not just read the plan field wherever I need a limit?"
    a: "Because downgrades leave existing rows over the limit, and the policy for that case belongs in one place. A single entitlement resolver makes the grandfathering decision explicit instead of scattering it across handlers."
  - q: "How do I know which pre-wired pieces are safe to leave alone?"
    a: "If a file only answers who is calling and which tenant they belong to, leave it. If it answers whether this actor may do this to that object, or assumes a shape for your domain data, expect to rewrite it in week one."
---

The first week with a boilerplate is a test of nerve: a working app you did not write, and one feature you do have to. I shipped exactly one domain feature — team-scoped Projects with per-project membership — on top of a multi-tenant Next.js kit, and kept a file-by-file note of everything I touched. What follows is that note, sorted into what survived untouched, what got rewritten the day the domain logic landed, and the rule that told the two apart.

## What survived the week untouched

Six pre-wired surfaces never got edited, and I want to be specific about which ones, because "auth just works" is not useful advice.

Session cookies and the server-side session lookup. Password reset and email verification. The OAuth callback route. Stripe Checkout session creation and the billing portal link. The Stripe webhook handler's signature verification and event-idempotency write. API key generation, hashing and the one-time plaintext display.

Why they survived: none of them knows what the product is. Their entire contract is "who is calling, and which tenant are they in." Domain code asks that question once per request and never asks it again. The moment I found myself opening the session helper to add a project field, I stopped, because that is how a kit turns into a fork you maintain forever.

I kept a small harness so I would notice if a migration quietly broke the frozen surfaces:

```bash
# run after every schema change, not just before deploy
npx prisma migrate dev --name add_projects
npx playwright test auth billing api-keys
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
```

The point is not the tooling. It is that "keep" is a decision you have to enforce, or the next schema migration silently drags half the kit into your diff.

## The role model is where the defaults fight you

The kit ships flat tenant roles — owner, admin, member — checked through a helper that takes a tenant and an action. That works when permissions never vary by object. My feature needed the same person to be an editor on one project and a viewer on another, and the helper had nowhere to put a project id.

There were three ways out, and I tried two of them:

| Approach | Cost | Holds when |
|---|---|---|
| Add editor/viewer to the tenant role enum | One migration; every existing check keeps compiling | Permissions never vary per resource |
| Tenant role plus a resource grant table | New table; every check site needs a resource argument | The same actor has different rights on different objects |
| One nested team per project | Reuses the kit's team model, but doubles tenancy and confuses billing | You have no billing, or projects are billed separately |

I started on the first option because it was an hour of work. It fell apart as soon as the invite flow asked "invite this person to the project or to the workspace" — a question a flat role cannot represent.

What actually got rewritten was the body of the permission function, not its interface. Every call site stayed. That is the pattern worth copying: keep the shape the kit gave you, and replace the decision logic inside it.

```ts
export async function can(
  actorId: string,
  action: "project:read" | "project:write" | "billing:manage",
  resource?: { projectId: string },
): Promise<boolean> {
  const tenantRole = await getTenantRole(actorId); // kept from the kit
  if (tenantRole === "owner") return true;
  if (!resource) return action === "project:read";

  const grant = await getProjectGrant(actorId, resource.projectId);
  if (!grant) return false;
  return rank(grant.role) >= rank(requiredRole(action));
}
```

Both the UI and the route handlers call this. The week-one failure mode I avoided was letting the server component check membership inline while the API route checked something slightly different — that drift is where permission bugs live. The same layering discipline shows up in [wiring a dev stack so each layer has one job](/blog/upgrade-one-layer-ai-stack/), and it applies to permission checks as much as to infrastructure.

## Payments survive; entitlements get rewritten

Checkout, the customer portal, webhook verification and idempotency: untouched. What died was the kit's assumption that a plan maps to a set of boolean feature flags on the tenant. Real limits are counts — projects per workspace, seats, active API keys — and they are checked at the moment of creation, inside the transaction that creates the row.

So I put every limit in one resolver and banned direct plan reads from handlers.

```json
{
  "free":       { "projects": 3,  "seats": 1,  "apiKeys": 1, "scopes": ["projects:read"] },
  "pro":        { "projects": 50, "seats": 10, "apiKeys": 5, "scopes": ["projects:read", "projects:write"] },
  "enterprise": { "projects": -1, "seats": -1, "apiKeys": -1, "scopes": ["projects:read", "projects:write"] }
}
```

Use `-1` for unlimited and treat it explicitly; a missing key and an unlimited key are not the same thing. Replace the counts with your own; the structure is the reusable part.

The rewrite happens because subscriptions change mid-cycle. A downgrade leaves rows already over the limit, and someone has to decide whether they are grandfathered, read-only, or hidden. If that decision lives in a resolver, it is one function. If it lives in the twelve places that grep `tenant.plan`, it is a bug queue.

One thing to leave alone: the webhook handler's ordering assumptions. Stripe events can arrive for a subscription your database has not seen yet, and the kit already stores the raw event before processing. Do not add business logic in front of that.

## API keys: keep the plumbing, rewrite the scope

Generation, hashing, the prefix used for lookup, the one-time reveal and last-used timestamps all stayed. What changed is that the kit's keys are tenant-wide and all-or-nothing, and once you have projects, the first integration question is "can I limit this key to one project." The answer cannot be "create a second tenant."

The rewrite is small: a scope array and an optional project id on the key table, and the key-auth middleware resolving the key to a `(tenant, actor, scope)` triple before calling the same `can()` the session path uses. Rotation and revocation stay untouched — they never knew what a scope was.

## The line that sorts every file

After a week the heuristic was clear. Identity, tenancy, money movement and secret handling stay as the kit wrote them. Anything that answers "may this actor do this to this object" is yours. Anything that assumes a shape for your domain data is yours.

The defaults fight you for an honest reason: a kit optimizes for the median SaaS, which has a flat workspace, flat roles and a plan that equals a set of flags. Your product stops being the median SaaS on day two. Expect to rewrite the permission decision, the entitlement mapping and the key scope — and expect to leave the session, the webhook and the hash function alone. Write down which is which before you start; it is the difference between extending a kit and [maintaining a fork of it](/blog/versioning-templates-without-losing-customisations/).

One last note: log the permission decision, not just the outcome. A denied request with no record of which grant was missing will cost you an afternoon, and [logging input, decision and output](/blog/workflow-observability-log-input-decision-output/) is cheaper to add now than to reconstruct later.

## What to do next

1. Before writing the feature, list every pre-wired surface in the kit and mark each keep or rewrite. It takes thirty minutes and prevents a diff that touches everything at once.
2. Write the permission function with a resource argument on day one, then point both the UI and the API at it. Delete any second check you find.
3. Move every limit into one entitlement resolver, and add a CI grep that fails when `tenant.plan` appears in a route handler.
4. Freeze the auth, billing and API key tests and run them after each migration so a schema change cannot quietly rewrite the parts you decided to keep.
5. If you would rather start from a wired baseline than wire one yourself, SaaS Starter Kit is a one-time $99.99 production-grade Next.js multi-tenant boilerplate with authentication, teams, RBAC, Stripe billing and API keys already in place, with a free open-source core plus the paid Pro kit, available at [https://slashmaster6.gumroad.com/l/kuvajr](https://slashmaster6.gumroad.com/l/kuvajr).

## Get SaaS Starter Kit

[**SaaS Starter Kit**](https://slashmaster6.gumroad.com/l/kuvajr?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=week-one-saas-starter-kit) — **$99.99**, one-time payment, instant download. See the full breakdown on the [review page](/blog/saas-starter-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
