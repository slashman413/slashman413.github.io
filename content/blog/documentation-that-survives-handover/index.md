---
title: "Documentation That Survives the Person Who Wrote It"
description: "How to write decision logs, one-page runbooks, interface lists and why-first changelogs so your systems survive a handover."
date: "2026-10-04T08:00:00+08:00"
draft: false
slug: "documentation-that-survives-handover"
author: "Wayne Chang"
tags: ["documentation", "runbooks", "changelog", "handover", "devops"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xohjh"
product_price: "19"
product_brand: "Slashman Tools"
product_sku: "SMT-FSH"
product_category: "Software > Productivity"
product_currency: "USD"
seo_title: "Documentation That Survives the Person Who Wrote It"
faq:
  - q: "How long should a decision log entry be?"
    a: "Ten to twenty lines is usually enough: date, decision, context, rejected alternatives and a revisit trigger. If it needs more, keep the entry short and link to a longer document."
  - q: "Should runbooks live in the repo or in a team wiki?"
    a: "The repo by default, because the runbook versions with the code and gets reviewed in pull requests. Use a wiki only when people outside the repo need access, and keep one canonical copy rather than two drifting ones."
  - q: "How is this different from writing good commit messages?"
    a: "Commit messages explain what changed in one file at one time. A changelog records interface-visible changes with reasons and migration notes, and a decision log records choices that never appear in a diff at all."
---

Documentation fails in one specific, predictable way: it is written for the person who already knows the answers. The test that matters is whether a reader with zero context — a new contractor, an on-call engineer, or an AI assistant you paste a file into — can act correctly without asking you anything. Four artifacts and one writing rule close most of that gap.

## Decisions need a date and a reason

The hardest thing to reconstruct after a handover is not the code. Code shows what the system does. Nothing in it shows why the obvious alternative was rejected, and that is the question that stalls a new maintainer for a week.

Keep an append-only decision log inside the repository, not in a wiki or a chat thread. One file per decision, named with the date, reviewed like any other change.

```yaml
# docs/decisions/2026-02-14-postgres-for-billing.md
date: 2026-02-14
status: accepted        # accepted | superseded by <file> | rejected
deciders: [sam]
decision: Use Postgres as the primary store for the billing service.
context: Two writers (webhook ingest, nightly reconcile) touch the same
  data. SQLite serializes writes on a single file and the two jobs collide.
alternatives:
  - SQLite plus a write queue — rejected: one more component to operate
  - Managed Postgres — rejected: cost not justified at this volume
consequences:
  - One more service to back up, monitor and upgrade
revisit_if: concurrent writers grow past what one primary handles
```

Two rules keep this useful. First, never edit an accepted entry. If the decision changes, add a new file and mark the old one superseded. Editing history destroys the only record of why the system looks the way it does. Second, every entry ends with a `revisit_if` trigger, so decisions are reviewed on evidence instead of nostalgia.

## Runbooks fit on one page

If your runbook has eight sections, it is a wiki page pretending to be an operational document. Split it. One alert, one page, one path through the problem.

Structure it in the order you actually work: the symptom as the title, the first check, the command that separates one cause from another, the action, then the escalation point and the point where you stop and call someone. Write the boring checks in — the ones you always run but never write down, because those are exactly the steps a tired person skips. Our notes on [triage habits for failing automation](/blog/triage-automation-failures-while-you-sleep/) cover the same principle from the alerting side.

```bash
#!/usr/bin/env bash
# runbook: ingest-lag alert fires
set -euo pipefail

# 1. Is the consumer even running?
systemctl is-active ingest-consumer || systemctl restart ingest-consumer

# 2. Backlog or stall? Queue length tells you whether work is piling up.
redis-cli LLEN ingest:pending

# 3. If the queue is growing, read the oldest unacked message.
redis-cli --raw LRANGE ingest:pending 0 0

# 4. Stop here if the failure is upstream. Escalate to the producer owner.
```

Where the file lives matters as much as what is in it:

| Location | Survives a handover | Reviewable | Typical failure |
|---|---|---|---|
| `docs/runbooks/` in the repo | Yes, ships with the code | Yes, through pull requests | Nobody outside the repo can read it |
| Team wiki | Only if someone owns it | Weakly | Content rots with no review trigger |
| Chat thread | No | No | Scrolls out of reach in days |
| Personal notes | No | No | Leaves with you |

The honest test: hand the page to someone who has never touched the service and watch them follow it without asking a question. Every question they ask is a missing line.

## One interface list per service

For each service boundary you own, keep a single file that answers: what comes in, what goes out, how it is authenticated, what happens when a dependency is down, who owns it, and which runbook applies. This is not generated API reference. It is the operational surface — the part that makes integration, debugging and delegation possible.

```yaml
service: billing-webhook
owner: sam
listen: "POST /hooks/stripe"
auth: Stripe-Signature header, HMAC-SHA256, secret in BILLING_WEBHOOK_SECRET
emits:
  - topic: billing.event.received      # consumed by ledger-sync
  - table: webhook_events              # idempotency key: event.id
failure_modes:
  - duplicate delivery -> dedupe on event.id, return 200
  - bad signature -> return 400, log payload hash, do not retry
  - ledger-sync down -> rows stay queued in webhook_events
runbook: docs/runbooks/billing-webhook.md
```

Keep it in the repo and version it. This file plus the decision log is the minimum context worth pasting into an assistant before asking it to modify the service. Without them, the model invents an interface and you spend the afternoon correcting it.

## Changelogs that say why, not just what

A changelog entry that reads "fixed webhook bug" is noise. Git history already records what changed in which file. The changelog's job is different: it records interface-visible changes, when they landed, why, and what a caller has to do about it. Follow a published convention so readers know where to look — Keep a Changelog and Conventional Commits are both worth adopting — but neither replaces a sentence of reasoning.

```markdown
## 2026-03-02 — 1.4.0
Changed: POST /v1/invoices returns `paid_at` as ISO-8601 UTC.
Why: two consumers parsed Unix epochs as local time and billed a day off.
Migration: parse `paid_at` as ISO-8601. Legacy `paid_ts` stays until 1.5.0.
```

The rule of thumb: if a change is invisible from outside the service, it does not belong in the changelog. If it changes an interface, it needs a date, a version, a reason and a migration note. Anything else is a commit message.

## Write every file for a reader with no context

This rule is what makes the other four hold together. Any file a person or a model must read cold has to stand on its own. No "as discussed", no "see the other doc" without a path, no acronym on first use without expansion, no undated claims, no ownerless caveats.

Stating the audience at the top of the file is a two-line habit with a large payoff:

- First line: what this file is and who it is for.
- Every claim carries a date or an owner.
- Every reference to another file includes its path.
- Anything a reader must not change says so explicitly.

This pays off twice. The same files that onboard a new maintainer are the ones you paste into a context window, and a model is just a reader with no patience for missing context — the problem described in our piece on [context engineering](/blog/what-is-context-engineering/). A file that is self-contained enough for a stranger is self-contained enough for an assistant.

## What to do next

1. Create `docs/decisions/` and write one entry for a choice you made in the last month: date, decision, reason, rejected alternatives, `revisit_if`.
2. Take the alert that wakes you up most often and write a one-page runbook for it. Then hand it to someone and watch them follow it cold.
3. Write interface lists for your two busiest services using the fields above, and commit them next to the code.
4. Add required "Why" and "Migration" lines to your changelog template and your pull request template, so the habit does not depend on memory.
5. If your team works in Feishu or DingTalk, Feishu Template Marketplace is $19 one-time and includes twenty-plus ready-made templates covering project tracking, OKRs, meeting notes and documentation, which gives you a working shape rather than an empty page. The value still comes from the dates, reasons and owners you fill in.

## Get Feishu Template Marketplace

[**Feishu Template Marketplace**](https://slashmaster6.gumroad.com/l/xohjh?utm_source=blog&utm_medium=article&utm_campaign=documentation-that-survives-handover) — **$19**, one-time payment, instant download. See the full breakdown on the [review page](/blog/feishu-templates/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
