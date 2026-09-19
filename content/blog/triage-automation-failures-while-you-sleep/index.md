---
title: "Triage Habits for Automation That Fails While You Sleep"
description: "Make failing automations self-describing: log the offending input, alert on outcomes, separate transient from design failures, choose what fails loud."
date: "2026-09-19T08:00:00+08:00"
draft: false
slug: "triage-automation-failures-while-you-sleep"
author: "Wayne Chang"
tags: ["automation", "observability", "ai-agents", "error-handling", "triage"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Triage Habits for Automation That Fails While You Sleep"
faq:
  - q: "Why not just retry every failure a few times and move on?"
    a: "Retries only help environmental failures like timeouts and rate limits. A deterministic failure, such as a schema mismatch, reproduces on every attempt and wastes budget while delaying detection. Give each task a retry budget and a dead-letter target instead."
  - q: "What is the minimum I should log when a run fails?"
    a: "Task name, attempt number, error class, the full input (redacted), an input hash, and outcome counts such as items written versus items expected. The input and the hash are what make the failure self-describing at 3am."
  - q: "How do I reduce alerts without missing real failures?"
    a: "Suppress retries that are still inside budget, page on outcome anomalies (zero rows written, exhausted retries, cost over cap) and on missing heartbeats, and route partial successes to a ticket queue rather than a pager."
---

An automation that fails at 3am is not a bug report. It is a mystery with a timestamp attached. The difference between a ten-minute fix and a lost morning is decided long before the failure — by what you chose to record, what you chose to page on, and which runs you allowed to fail quietly.

## Make every failure describe its own input

Most 3am logs say `RequestError: 400`. That tells you nothing about which of the four hundred records your pipeline touched was the one that broke the schema.

Store a structured record, and store the input. Not a summary of the input, not the first field — the actual payload that went in. It costs a few KB per failure and cuts triage to reading one file.

```python
import hashlib, json, pathlib, traceback
from datetime import datetime, timezone

FAILURES = pathlib.Path("/var/log/agents/failures.jsonl")

def record_failure(task, payload, attempt, exc, retryable):
    blob = json.dumps(payload, sort_keys=True, default=str)
    FAILURES.open("a").write(json.dumps({
        "ts": datetime.now(timezone.utc).isoformat(),
        "task": task,
        "attempt": attempt,
        "retryable": retryable,
        "error_type": type(exc).__name__,
        "error": str(exc)[:400],
        "input_hash": hashlib.sha256(blob.encode()).hexdigest()[:16],
        "input": payload,                  # the part everyone skips
        "trace": traceback.format_exc()[-1500:],
    }) + "\n")
```

The `input_hash` field matters more than it looks. It gives you a cheap way to ask "has this exact input failed before?" with a shell pipeline instead of a debugging session.

Two rules for this log. First, redact secrets before writing — tokens, keys, personal data — and store a pointer to the raw payload in object storage if you need it intact. Second, log outcomes, not just exceptions: `rows_written: 0, rows_expected: 40` is a failure even when nothing raised. Silent no-ops are the most expensive category, because nobody gets paged. This is the same discipline behind [context engineering](/blog/what-is-context-engineering/): decide what the system carries forward, because it cannot reason about what it never recorded.

## Alert on outcomes, not on activity

Alert fatigue comes from paging on liveness events — retries, slow runs, a single timeout. Those are normal. Correctness events are not.

| Signal | Log only | Alert | Reason |
|---|---|---|---|
| Retry 1-3 on 429/503 | yes | no | Backoff exists to absorb this |
| Retry budget exhausted | yes | yes (ticket) | It stopped being transient |
| Schema or validation error | yes | yes (page) | Retrying cannot fix a bad input |
| Run finished, 0 items written | yes | yes (page) | Clean exit code, wrong outcome |
| Partial success | yes | yes (ticket) | Needs a decision, not urgency |
| Cost per run above cap | yes | yes (ticket) | Usually a retry loop |
| Job never started | n/a | yes (page) | Absence of a signal is a signal |

The last row is the one people forget. Error-based alerting assumes your job runs and then fails. If the scheduler dies, the container is OOM-killed, or the cron entry gets commented out during a migration, you get silence — and silence looks exactly like success. Add a heartbeat: an external check that expects a ping every 15 minutes and alerts when it does not arrive.

Route alerts declaratively so the suppression logic is reviewable instead of buried in an `if`:

```yaml
# alerting.yaml
suppress:
  - "attempt < max_attempts and error_class in ['RateLimit','Timeout','ConnectionReset']"
routes:
  - severity: page
    when: "error_class in ['ValidationError','SchemaError'] or retries_exhausted or (items_written == 0 and items_expected > 0)"
    channel: pager
  - severity: ticket
    when: "partial_success or cost_usd > 2.00"
    channel: issue-tracker
heartbeat:
  expect_every: "15m"
  grace: "20m"
```

## Transient or design failure? Decide with evidence

A transient failure is environmental: rate limits, timeouts, connection resets, a provider having a bad minute. A design failure is deterministic: the input does not match the schema, the credential expired, the upstream stage emits a field you never agreed to. Retrying a design failure forever is how a pipeline burns a night of API budget reproducing the same error.

The strongest signal is repetition. Same input hash, same error, twice — that is a design failure wearing a transient costume. Group your failure log to find them:

```bash
# Failures that repeat with identical input are not blips.
jq -r 'select(.retryable == true) | [.task, .input_hash] | @tsv' \
  /var/log/agents/failures.jsonl \
  | sort | uniq -c | sort -rn \
  | awk '$1 > 1 {print $1"x", $2, $3}'
```

Note the asymmetry: an upstream design failure shows up as a downstream transient failure. If stage B keeps timing out because stage A hands it a malformed payload, retrying B is pointless. Triage walks one stage upstream before it touches a retry policy. The instinct is the same one behind [cutting context before cutting the model](/blog/cut-context-before-cutting-model/): reduce what you pass forward instead of paying to retry it.

Every retrying task needs a budget with a floor and a ceiling — max attempts, max wall-clock time, and exponential backoff with jitter. Without jitter, parallel workers re-collide on the same interval. Without a ceiling, "retry" quietly becomes "run forever."

## Choose, in advance, which runs fail loudly

Per task, not per system. Three policies cover nearly everything.

| Task | Failure policy | Why |
|---|---|---|
| Payment capture, invoice send, outbound email | Fail loud, halt downstream | Bad state compounds; a human decides |
| Database migration, file delete | Fail loud, halt downstream | Partial application is worse than none |
| Embedding backfill, report generation | Dead-letter, retry later | No user impact, recoverable |
| Thumbnail generation, cache warm, cosmetic enrichment | Best-effort, drop and continue | Not worth a human's attention |

The `fail_loud` set should be small. If everything pages, nothing pages.

Halt downstream explicitly: exit non-zero so the scheduler sees it, and have dependents check for a completion marker rather than a timestamp. A script that catches every exception and exits 0 is not robust — it is an automation that cannot report its own failure, which is worse than one that crashes.

Finally, put an escalation on forever-retrying jobs: if a task has not succeeded within N cycles, convert it to a design-failure ticket and stop retrying. That single rule removes most of what wakes people up.

## What to do next

1. Add `input` and `input_hash` to every failure record this week. One dict, one file, redacted on write.
2. Write your retry policy down per task: max attempts, backoff, dead-letter target, alert severity.
3. Add a heartbeat check that alerts on absence, not only on errors.
4. Run the `uniq -c` query above over last month's failures and reclassify repeat offenders as design failures.
5. If triage means ssh-ing into three boxes and reading four log formats, consolidate. Cowork Pro is a $59 USD one-time dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history, so "which agent failed at 3am" becomes a lookup. Tool or not, the habit matters more than the software: if the setup advice in the [full automation guide](/blog/ultimate-ai-automation-guide-2026/) leaves you with many agents and no shared run history, start with the logs before the dashboards.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=blog&utm_medium=article&utm_campaign=triage-automation-failures-while-you-sleep) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
