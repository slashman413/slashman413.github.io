---
title: "Where to Put Approval Gates in an Agent Workflow"
description: "Classify steps by reversibility, spend and audience impact, gate only the expensive or public ones, and keep the gate from decaying into a rubber stamp."
date: "2026-09-20T08:00:00+08:00"
draft: false
slug: "approval-gates-agent-workflow"
author: "Wayne Chang"
tags: ["approval-gates", "agent-workflows", "automation", "human-in-the-loop", "ai-agents"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/amwkf"
product_price: "99"
product_brand: "Slashman Tools"
product_sku: "SMT-AWB"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Where to Put Approval Gates in an Agent Workflow"
faq:
  - q: "How many approval gates should an agent workflow have?"
    a: "As few as possible. Gate only steps that are irreversible, spend money, or are visible outside your company; everything else should run unattended with logging and a kill switch."
  - q: "What should an approval request contain?"
    a: "The proposed action, the diff against the last run, the blast radius, the rollback path, supporting evidence, and what happens on timeout. The default on timeout for irreversible steps should be abort."
  - q: "How do I stop reviewers from rubber-stamping approvals?"
    a: "Cap blast radius below the gate threshold so exceptions are rare, supply enough evidence to actually judge, require a typed reject reason, and sample-audit executed actions after the fact."
---

An approval gate is a queue with a human at the end, and queues get ignored. The question worth answering per step is not "should a human review this" but "what does it cost when this step is wrong and nobody catches it." Answer that honestly and the gates place themselves.

## Classify the step before you gate it

Three axes decide almost everything: reversibility, spend, and audience impact. Score each step on all three and let the worst score win.

| Axis | Low — no gate | Medium — log and alert | High — gate it |
| --- | --- | --- | --- |
| Reversibility | Draft edits, re-runnable jobs, staging writes | Refund via API, branch commit, soft delete with restore window | Sent email, published post, hard delete, DNS or IAM change |
| Spend | Read-only API calls, cached lookups | Small per-run charges you can absorb | Charges above your comfort number, recurring subscriptions |
| Audience | Internal notes, scratch files, your own Slack channel | Internal stakeholders, staging URLs | Customers, prospects, payment rails, public web |

Reversibility has two parts: the cost of undo and the window in which undo still exists. A `git revert` on an unmerged branch is free. A Stripe refund is cheap but visible to the customer. An email to a prospect list has no undo. A dropped table without point-in-time recovery is permanent, and so is a domain transfer.

Store the classification in the workflow file itself, next to the step, not in a wiki page nobody opens. If the step's config cannot tell you why it is or is not gated, the next person to touch it will guess.

## Put gates at the boundary, not in the middle

Internal steps need observability, not approval. Retrieval, classification, dedupe, re-ranking and draft generation should produce traces and diffs you can read after the fact. Gating them teaches reviewers that approving is the default motion, which is exactly the habit you need them to unlearn before they reach a step that actually matters.

Gates belong where irreversible, spent money, and outside visibility overlap. Concretely: the first outbound message to a new segment or domain, any refund or charge, production deploys, DNS and IAM changes, destructive database operations, publishing to a public channel, and sending quotes or contracts to a lead.

Where a gate feels heavy but the step is real, try a cheaper substitute first: a dry run that posts its diff to a review channel, a send-to-seed-list step before the full send, a soft delete with a restore window, or a kill switch plus alerting. These preserve throughput and still catch the mistake before it is public.

```bash
# dryrun.sh — post the diff, send nothing, exit 0 only if the plan looks sane
set -euo pipefail

target=${1:?usage: dryrun.sh <segment>}

./agent plan --segment "$target" --out ./artifacts/plan.json
jq -e '.recipients | length > 0' ./artifacts/plan.json > /dev/null

# reviewers read this thread, not a yes/no dialog
./notify post --channel review-outreach --file ./artifacts/plan.json
```

## Give reviewers evidence, not a yes/no button

A gate decays into a rubber stamp the moment the request contains less information than the reviewer needs to decide. If the screen says "Agent wants to send 412 emails. Approve?" the correct behavior for a busy person is to click approve. That is a design failure, not a discipline failure.

The approval payload should be self-contained. Think of it as context engineering applied to a human reader:

```json
{
  "step_id": "outreach.send_first_touch",
  "run_id": "run_8f21",
  "action": "send_email",
  "why": "Inbound leads from /pricing form, ICP filter matched 412 of 431",
  "diff": {
    "recipients_added": 412,
    "template_changed": "v4 -> v5",
    "preview_url": "https://internal.example/preview/run_8f21"
  },
  "blast_radius": { "max_recipients": 412, "domains": 3, "estimated_cost_usd": 0 },
  "rollback": "no API undo; suppression list pre-built at ./artifacts/suppress.csv",
  "precedent": "run_7c02 approved 2026-01-14, similar template, zero complaints",
  "evidence": ["spam_score 0.8/10", "unsubscribe link present", "dkim pass"],
  "required_decision": "approve | edit | reject",
  "default_on_timeout": "abort",
  "sla_minutes": 240
}
```

Two fields do most of the work. `rollback` tells the reviewer what happens if they are wrong; if the honest answer is "nothing, there is no undo," the review is genuinely load-bearing. `default_on_timeout` must be `abort` for irreversible steps. Auto-approving on timeout turns a gate into a formality with extra latency.

Require a typed reject reason, and treat rejects as product feedback: they are how you discover the classifier is wrong. Then measure the gate itself. A reviewer who clears dozens of items a day without a single reject or edit means either the step does not need a gate or the evidence is too thin to judge. Both are fixable, and neither is fixed by asking people to be more careful. More on the failure side of this in [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/).

## Cap the blast radius below the review threshold

The cheapest gate is the one you never needed, because the ungated step cannot do much damage. Instead of gating every send, cap the send. Instead of gating every charge, cap the charge.

```yaml
# limits.yaml — evaluated by the runner before each step executes
defaults:
  dry_run: true
  idempotency_key: "${run_id}:${step_id}"
  max_retries: 2

steps:
  outreach.send_first_touch:
    limits:
      max_recipients_per_run: 25
      max_domains_per_run: 1
      require_allowlist: true
    escalate_when_exceeded: approve
    approver: growth-ops
    sla_minutes: 240
    default_on_timeout: abort

  billing.issue_refund:
    limits:
      max_amount_usd: 100
      max_refunds_per_day: 5
    escalate_when_exceeded: approve
    approver: finance
    default_on_timeout: abort

  infra.apply_migration:
    limits:
      allowed_environments: ["staging"]
    escalate_when_exceeded: approve
    approver: oncall
    default_on_timeout: abort
```

Anything under the limit runs unattended. Anything over it stops and asks. That is a real gate, because the reviewer only sees exceptions and exceptions are rare enough to read closely. Pair the caps with a preflight check that refuses to run when the computed blast radius exceeds the cap and no approval token is present:

```bash
# preflight.sh — exit non-zero to halt the step
set -euo pipefail

recipients=$(wc -l < ./artifacts/recipients.txt)
cap=25
token=${APPROVAL_TOKEN:-}

if [ "$recipients" -gt "$cap" ] && [ -z "$token" ]; then
  echo "halt: ${recipients} recipients exceeds cap of ${cap};" \
       "request approval for step outreach.send_first_touch" >&2
  exit 1
fi

echo "ok: ${recipients} recipients within cap"
```

Two habits keep the system honest over time. Sample audits: pull a handful of recently executed below-cap actions and read them, on a schedule. Rotation: same reviewer, same step, every day for a quarter is how a gate turns into a stamp. Idempotency keys and dry runs are the plumbing that makes both affordable — the wider patterns are covered in the [full automation framework guide](/blog/ultimate-ai-automation-guide-2026/).

## What to do next

1. Open your workflow config and score every step on the three axes. Write the score and a one-line reason next to the step. Do this for one workflow, not all of them.
2. Replace any bare "Approve? yes/no" prompt with a payload that includes `rollback`, `blast_radius`, `evidence` and `default_on_timeout: abort`.
3. Add limits — batch size, per-run spend, allowed environments — so routine work runs unattended and only exceptions reach a person.
4. Start a weekly sample audit of executed actions below the cap, and track reject and edit rate per gate. Retire gates that never produce either.
5. If you would rather describe these boundaries in plain English and get back something you can read and version, AI Workflow Builder does that: it turns plain-English prompts into validated multi-agent workflow definitions you can inspect, version and run, for a one-time $99.

## Get AI Workflow Builder

[**AI Workflow Builder**](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=article&utm_campaign=approval-gates-agent-workflow) — **$99**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-workflow-builder/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
