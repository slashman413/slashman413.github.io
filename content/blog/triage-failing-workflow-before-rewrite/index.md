---
title: "Triage a Failing Workflow Before You Rewrite It"
description: "Read the last run, tell a failed step from a wrong-output step, and change one thing that explains the symptom before rebuilding anything."
date: "2026-11-02T08:00:00+08:00"
draft: false
slug: "triage-failing-workflow-before-rewrite"
author: "Wayne Chang"
tags: ["debugging", "automation", "workflows", "triage", "runbooks"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/amwkf"
product_price: "99"
product_brand: "Slashman Tools"
product_sku: "SMT-AWB"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Triage a Failing Workflow Before You Rewrite It"
faq:
  - q: "My workflow shows a green status but produced no output. Is that a failure?"
    a: "Yes, and it belongs to the \"returned something wrong\" class. The step exited cleanly but broke the contract the next step depends on, so compare the output shape against the last known-good run rather than trusting the status field."
  - q: "What if the workflow does not store per-step inputs and outputs?"
    a: "Add that first, because every later triage step depends on it. Until you can replay a step against the exact input it saw, you are guessing rather than debugging."
  - q: "How do I know when a rewrite is actually justified?"
    a: "When the problem is structural: you cannot inspect or replay single steps, the inputs changed shape permanently, or two minimal fixes moved the failure instead of clearing it."
---

A workflow that worked last week now fails, and the first instinct is to open a branch and rebuild it. That instinct usually costs days. A broken automation is a handful of small unknowns wearing the costume of one big unknown, and the order you look at them decides whether you finish this afternoon or next Thursday.

## Read the last run's output first

The last run is the only artifact that describes the failure as it actually happened: the real inputs, the real response bodies, the real timestamps. Everything else — the canvas, your memory of how the pipeline was supposed to work, the vendor docs — describes how the workflow was supposed to behave. Start with evidence.

Pull the run record before you open a single line of code:

```bash
# 1. Newest run record for this workflow.
ls -t runs/billing-reconcile/ | head -n 1

# 2. The fields that matter, before any code is opened.
jq '{run_id, status, exit_code,
     failed: [.steps[] | select(.status != "ok") | {name, error}]}' \
  "runs/billing-reconcile/$(ls -t runs/billing-reconcile/ | head -n 1)"

# 3. The failing step's output, verbatim. Not a summary.
jq -r '.steps[] | select(.name == "extract_invoices") | .output' \
  runs/billing-reconcile/last.json | head -c 2000
```

Two things are worth noticing in that output. The step that reports an error is frequently not the step that caused it; look one step earlier, at what was handed in. And the raw output usually tells you more than the error text, because a step fails on the shape of what it received while the error only names the symptom.

If your workflow does not persist per-step input and output, fix that before you fix the bug. A run you cannot inspect is a run you can only guess about, and guessing is what leads people to the rewrite. The basics of wiring that kind of observability into an automation are covered in the [AI automation guide](/blog/ultimate-ai-automation-guide-2026/), but the short version is: one record per step, input and output stored raw, no truncation until you know what you need.

## Separate "the step failed" from "the step returned something wrong"

These are two different bugs that produce the same complaint ("the workflow is broken"), and they need different evidence.

| Signal in the run record | What it means | Where the bug usually lives | First move |
| --- | --- | --- | --- |
| Non-zero exit, exception, timeout | The step could not complete | The step's own boundary: credentials, network, rate limits, response schema | Read the error string, reproduce it with the recorded input |
| Exit 0, output empty or wrong shape | The step completed and returned something unusable | The contract between steps: a renamed field, a changed model response, a filter that matches nothing | Diff the output against the last known-good run |
| Exit 0, output fine, later step fails | The reported failure is downstream of the real one | The mapping between steps, or the downstream step's assumptions | Replay the downstream step with this exact payload |
| Step skipped | A branch condition did not run | Condition logic, empty upstream input, missing config key | Count records in versus records out at the branch |

The first row is the easy one. A hard failure hands you an error string, you reproduce it, and the fix is usually a boundary: an expired token, a renamed field, a rate limit hit at the wrong hour. The second row is where rewrites come from, because nothing looks broken — the run is green, the status field says success, and the next step quietly processes zero rows.

Make that class visible with a contract check at each step boundary instead of trusting the status field:

```python
# A green status only means no exception was raised. Assert the contract.
def check_records(step_name, payload, min_items=1):
    if not isinstance(payload, list):
        raise ValueError(f"{step_name}: expected a list, got {type(payload).__name__}")
    if len(payload) < min_items:
        raise ValueError(f"{step_name}: returned {len(payload)} records, expected at least {min_items}")
    if missing := [r for r in payload if "invoice_id" not in r]:
        raise ValueError(f"{step_name}: {len(missing)} records missing invoice_id")
    return payload
```

The check costs a few lines and converts a silent wrong-output failure into a hard failure at the step that caused it, which is exactly the kind of bug you can triage in minutes.

## Change the smallest thing that explains the symptom

Before you touch anything, state the hypothesis in one sentence: "the extractor returns zero records because the source renamed `invoice_id` to `invoiceId`." If you cannot state it, you do not have one yet, and every change you make is just adding noise to the evidence.

Then hold to three rules. Replay the recorded input, not a fresh one, because a new input on a new day adds variables you have not accounted for. Make one change per run. Replay from the failing step where possible, rather than the whole pipeline.

```bash
# Replay one step against the input it actually saw, with side effects off.
jq '.steps[] | select(.name == "extract_invoices") | .input' \
  runs/billing-reconcile/last.json > /tmp/extract_invoices.input.json

run-step extract_invoices \
  --input /tmp/extract_invoices.input.json \
  --dry-run \
  --record-to /tmp/replay-01.json
```

The `--dry-run` flag matters more than it looks. If replaying the step writes to a downstream system, you change the state you are trying to observe, and the second replay behaves differently from the first. Keep the replay read-only, or point it at a scratch destination.

If you genuinely cannot replay a single step against a recorded input, that missing capability is itself the defect worth fixing first. Everything else here depends on it; without it you are not debugging, you are guessing with extra steps.

## Why rebuilding is usually a rabbit hole

A rewrite feels productive because you are typing and the diff is large. What it throws away is the only thing you had going for you: a version that worked, with inputs that used to pass. After a rewrite there is no baseline to diff against, no last known-good output, and no way to bisect. You re-implement steps that were never broken from memory, reintroduce the quirks you had already patched, and inherit every integration assumption you had forgotten about.

Meanwhile the actual trigger — a renamed field, an endpoint that changed its output format, a rotated credential, a rate limit — travels with the new workflow. You rebuild the same shape of pipeline against the same changed world and hit the same class of failure, now with less information than you started with.

Rebuild when the trigger is structural, not when the symptom is annoying:

- You cannot replay a single step: no per-step records, no per-step retries, no way to inspect inputs. The tool cannot express the debugging you need.
- Two consecutive minimal fixes moved the failure instead of clearing it. That points at the contract between steps, not a line inside one.
- The inputs changed shape permanently and the current branch structure cannot represent them.

Anything else is trading one unknown for a large number of unknowns. If the structural case does apply and you are choosing a replacement, the tradeoffs between a script and a builder are covered in [workflow builder vs a plain script](/blog/workflow-builder-vs-plain-script/); either way, migrate one layer at a time, as argued in [upgrading one layer of a stack](/blog/upgrade-one-layer-ai-stack/).

## What to do next

1. Add a per-step run record to the failing workflow: step name, input, output, status, error, timestamp. Nothing else, and no dashboards yet.
2. Open the last failure and classify it in writing as either "the step failed" or "the step returned something wrong." The classification determines what you look at next.
3. Replay the step with its recorded input and add one assertion that would have caught the symptom at its source.
4. Keep a one-line changelog on the workflow: hypothesis, change, result. Two entries in a row that move the failure without clearing it is your signal to consider a structural fix.
5. If triage keeps ending at "the definition on paper is not the definition that runs," AI Workflow Builder ($99 one-time) turns plain-English prompts into validated multi-agent workflow definitions you can inspect, version and run, which makes the next diff a diff of intent instead of guesswork. It is a download from https://slashmaster6.gumroad.com/l/amwkf.

## Get AI Workflow Builder

[**AI Workflow Builder**](https://slashmaster6.gumroad.com/l/amwkf?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=triage-failing-workflow-before-rewrite) — **$99**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-workflow-builder/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
