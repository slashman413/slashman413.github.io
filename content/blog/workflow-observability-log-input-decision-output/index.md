---
title: "Add Observability to a Workflow: Log Input, Decision, Output"
description: "Log the input, decision and output of every automation step so a failure three days later is diagnosable, plus how to keep logs small enough to read."
date: "2026-11-02T08:00:00+08:00"
draft: false
slug: "workflow-observability-log-input-decision-output"
author: "Wayne Chang"
tags: ["observability", "logging", "automation", "debugging", "workflows"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/amwkf"
product_price: "99"
product_brand: "Slashman Tools"
product_sku: "SMT-AWB"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Add Observability to a Workflow: Log Input, Decision, Output"
faq:
  - q: "How long should I keep workflow logs?"
    a: "Keep a short hot window you can search interactively, and a longer cold archive for audits or slow-burning bugs. Two weeks hot and a quarter cold covers most automations, and sampling successful runs keeps the volume manageable."
  - q: "Should I log full prompts and responses?"
    a: "Usually not in production. A digest plus a truncated preview answers most debugging questions, and full payloads bring secret-leak and volume problems. Switch individual steps to full logging temporarily when you are actively investigating."
  - q: "What if my automation tool does not expose a run identifier?"
    a: "Generate your own at the entry point and pass it through your context object, including into sub-workflows and outbound HTTP headers. Tool-level run IDs are convenient but you should not depend on them staying stable across edits."
---

Three days after a workflow ships, it stops doing what it did on day one. The log line says the step failed, maybe with a stack trace, and that is the entire forensic record you have. You re-run the job, it works, and you learn nothing.

That is a logging design problem, not a code problem, and you can fix it in an afternoon by deciding up front what a step record contains.

## Log three things per step, not one

A useful step record answers three questions: what arrived, why the step did what it did, and what left. The error is a fourth field, not the whole record.

- **Input**: the payload the step received, or a digest plus a short preview of it.
- **Decision**: the branch, threshold, model, template or tool the step chose, and the value that drove it.
- **Output**: what the step returned, or a digest plus preview.
- **Error** (optional): type and message, capped in length.

The cleanest way to guarantee these fields stay in sync with real behaviour is to wrap each step rather than sprinkling log calls inside it. The wrapper sees the actual input and actual output, so it cannot drift.

```python
import hashlib, json, sys, time
from functools import wraps

MAX_PREVIEW = 2048
SECRET_KEYS = ("api_key", "authorization", "password", "token", "cookie")

def digest(value):
    raw = json.dumps(value, default=str, sort_keys=True)
    return {
        "sha": hashlib.sha256(raw.encode()).hexdigest()[:12],
        "bytes": len(raw),
        "preview": raw[:MAX_PREVIEW],
    }

def step(name):
    def wrap(fn):
        @wraps(fn)
        def inner(ctx, payload):
            started = time.monotonic()
            record = {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "run_id": ctx["run_id"],
                "parent_step": ctx.get("parent_step"),
                "step": name,
                "attempt": ctx.get("attempt", 1),
                "workflow_version": ctx["workflow_version"],
                "input": digest(payload),
            }
            try:
                output, decision = fn(ctx, payload)  # every step returns (output, why)
                record.update(decision=decision, output=digest(output), status="ok")
                return output
            except Exception as exc:
                record.update(
                    status="error",
                    error={"type": type(exc).__name__, "msg": str(exc)[:300]},
                )
                raise
            finally:
                record["ms"] = round((time.monotonic() - started) * 1000)
                print(json.dumps(record, default=str), file=sys.stderr, flush=True)
        return inner
    return wrap
```

One JSON line per step, to stderr, flushed immediately. If the process is killed mid-run, you still have every step that completed.

## The decision record is the part people skip

Output alone tells you a ticket went to human review. It does not tell you whether that was correct, and three days later nobody remembers the threshold. Store the rule and the observed value together, so the record reads as a claim you can check.

```json
{
  "run_id": "r-8f3c",
  "step": "route_ticket",
  "decision": {
    "rule": "confidence >= 0.80 -> auto_send, else human_review",
    "observed": {"confidence": 0.71, "classifier": "v3", "template": "reply-v7"},
    "taken": "human_review"
  }
}
```

Model names, prompt template versions, retrieved document IDs, retry reasons and fallback paths all belong in this object. When a workflow degrades quietly, the decision field is what tells you it was the prompt version that changed on Tuesday, not the code. That is the same reasoning behind [triaging a failing workflow before you rewrite it](/blog/triage-failing-workflow-before-rewrite/): you need the evidence before you need the fix.

## Keep the logs small enough to read

A log nobody reads is a compliance artefact. The failure mode is not too few bytes, it is a thousand lines of pretty-printed prompt text that make `grep` useless. Pick a storage mode per step and be honest about the tradeoff.

| Storage choice | What you can still answer 3 days later | Risk | Use it for |
|---|---|---|---|
| Full payload | Everything, including fields you never anticipated | Secrets, PII, unreadable volume | Low-volume internal steps |
| Digest + preview | Shape, key fields, whether two runs had identical input | Preview may cut the field you need | Default for most steps |
| Digest only | Whether inputs matched, nothing about content | Debugging stalls immediately | High-volume or sensitive steps |

Set the rules in one config file rather than per step, so nobody has to remember them at 2am.

```yaml
logging:
  format: jsonl
  destination: file
  always_fields: [ts, run_id, parent_step, step, attempt, status, ms, workflow_version]
  payloads:
    mode: preview        # full | preview | hash
    preview_bytes: 2048
    redact_keys: [api_key, authorization, password, token, cookie]
  sampling:
    success_rate: 0.1    # keep a slice of successful runs as a baseline
    keep_on_error: true
  retention:
    hot_days: 14
    cold_days: 90
```

Sampling successes matters more than it sounds. You cannot judge an anomalous run without a sense of a normal one, and keeping every successful full payload is how log stores become expensive. Keep all failures, sample the rest.

Then write the two queries you will actually need, and commit them so they are not re-derived under pressure.

```bash
# Everything that happened in one run, in order
jq -c 'select(.run_id=="r-8f3c") | {ts, step, status, ms}' logs/workflow.jsonl

# Every failing run and the step it died on
jq -s 'map(select(.status=="error"))
       | group_by(.run_id)
       | map({run_id: .[0].run_id, died_at: (map(.step)|last)})' \
   logs/workflow.jsonl
```

## The field you must never leave out because it is obvious

The `run_id`. It feels redundant: your framework creates the run, the job name is in the log, timestamps are there. Then a fan-out step spawns four parallel branches, one of them calls a sub-agent, that sub-agent calls an external HTTP API, and a human reviewer picks up a queue item. Without a run identifier threaded through every one of those hops, you cannot reconstruct the sequence, only a pile of timestamped fragments.

Treat `run_id` as plumbing, not metadata:

- Generate it once at the entry point, and pass it in the context object, never as a module-level global.
- Send it as an outbound header (`X-Run-Id`) on every external call, so the vendor's logs and yours can be joined.
- Put it in human review tickets, error alerts and webhook payloads.
- Use the same value as your idempotency key, so retries are traceable to the original.
- Add `parent_step` for fan-out, so the tree is recoverable rather than a flat list.

If you are working inside a visual builder, check whether the step identity it exports is stable across edits; that difference is central to running one in production, as covered in [visual workflow builders vs scripts](/blog/visual-workflow-builder-vs-scripts/). A step name that changes when you rename a box is not an identifier.

## What to do next

1. Add `run_id`, `step`, `status` and `ms` to every step this week, even before you add payload logging. Then take one failing run from the last month and check you can find all of its lines with a single `grep`.
2. Make every step return a `decision` object, not just an output. Start with the three steps that involve a model call or a branch, since those are the ones that degrade silently.
3. Switch payload logging to preview mode with a 2 KB cap and a redaction list covering `api_key`, `authorization`, `token` and `cookie`.
4. Commit a `scripts/trace.sh` with your two `jq` queries so the next incident starts with a command, not a discussion.
5. If you want the trace structure already present in the workflow definition, AI Workflow Builder ($99 USD, one-time) turns plain-English prompts into validated multi-agent workflow definitions you can inspect, version and run, available at https://slashmaster6.gumroad.com/l/amwkf.

## Get AI Workflow Builder

[**AI Workflow Builder**](https://slashmaster6.gumroad.com/l/amwkf?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=workflow-observability-log-input-decision-output) — **$99**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-workflow-builder/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
