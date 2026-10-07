---
title: "How to Write a Runbook for an Unattended AI Agent"
description: "Preconditions, health checks, three failure classes and paging rules for an AI agent that runs on a schedule with nobody watching."
date: "2026-10-07T08:00:00+08:00"
draft: false
slug: "runbook-for-unattended-ai-agents"
author: "Wayne Chang"
tags: ["agents", "runbook", "observability", "ops", "automation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-ADS"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "How to Write a Runbook for an Unattended AI Agent"
faq:
  - q: "How often should the health checker run compared to the agent itself?"
    a: "Run the checker on a separate scheduler at roughly the step interval of the agent, so a stalled step is caught within one or two cycles. It must not run inside the agent process, or it dies with the thing it is watching."
  - q: "Should model errors ever page someone?"
    a: "Only if they persist after bounded retries and the run cannot complete, which means the loop is effectively stopped. Transient 429s and timeouts belong in a log channel with a note about which item was dead-lettered."
  - q: "What is the minimum state I need to store for a runbook to work?"
    a: "A row per run with run_id, prompt_version, start and end timestamps, input revision and outcome, plus a heartbeat timestamp per step. That is enough to answer what ran, what it produced, and what changed before it broke."
---

An unattended agent is not a script you run; it is a service you own at 3 a.m. A runbook is the operator manual for that service: what must be true before the loop starts, what to check when the agent goes quiet, how to tell one failure class from another, and who gets woken up. Write it before the first scheduled run, not after the first silent week.

## Preconditions: what must be true before the first scheduled run

Preconditions fail fast, before the agent spends money or writes anything. When one fails, the run exits with a distinct code and touches nothing. The point is to convert "the agent did something strange" into "one specific assumption was false."

Keep a manifest in the repo next to the agent code, reviewed the same way as the code:

```yaml
# runbook.yaml — one per agent
agent: invoice-reconciler
owner: platform-oncall        # an existing rotation, not one person's name
entrypoint: "python -m agents.reconciler --once"
schedule: "0 */2 * * *"
max_runtime_seconds: 900      # hard kill; the agent must not outlive its slot
budget:
  per_run_usd: 0.75
  per_day_usd: 12.00
state_store: "postgres://state-db/agent_state"
idempotency_key: "sha256(input_revision + prompt_version)"
kill_switch: "s3://ops-flags/agents/invoice-reconciler/disabled"
alerts:
  page: agents-primary
  log: "#agents-log"
```

The checklist behind that file:

- Credentials have an expiry date and a written rotation step. A tool token with no owner is an outage waiting for a calendar.
- Inputs have a schema and a freshness bound. Reading yesterday's export twice is a state error, not a model error.
- The output destination tolerates being written twice, or the write is wrapped in an idempotency key.
- The kill switch can be flipped without SSH — a flag in object storage or a config service, not a shell on the box.
- `run_id` and `prompt_version` are written to state on every run. Correlating a failure streak with a prompt deploy is guesswork otherwise.

If you are still designing the loop itself, the broader build order matters more than any single check — see the [complete automation framework](/blog/ultimate-ai-automation-guide-2026/) for how the pieces fit together.

## Health checks: liveness, readiness, and "did it actually do work"

Three layers, three signals, and they should not run inside the agent process. A checker that dies with the agent checks nothing.

**Liveness.** Each step writes a heartbeat timestamp to the state store. A separate scheduler compares the newest heartbeat against 2-3x the expected step interval.

**Readiness.** A cheap, read-only call per dependency: model health endpoint, `SELECT 1` against the state store, one authenticated `HEAD` per external tool. A 401 on a tool credential is a config bug you want to hear about at 09:00 in Slack, not from a customer.

**Productivity.** Exit code 0 is not success. An agent that runs cleanly and writes zero rows has failed. Check the artifact, not the process: rows written in the last window, messages sent, files produced. This is the check teams skip and the one that catches silent no-ops.

```bash
#!/usr/bin/env bash
# check_agent.sh — run every 5 minutes by a scheduler that is not the agent
set -euo pipefail

# liveness: heartbeat newer than 3x the 10-minute step interval
hb=$(cat /var/lib/agent/last_heartbeat)
age=$(( $(date +%s) - $(date -d "$hb" +%s) ))
[ "$age" -lt 1800 ] || { echo "STALE_HEARTBEAT ${age}s"; exit 2; }

# readiness: dependencies reachable
curl -fsS --max-time 5 "$MODEL_HEALTH_URL" >/dev/null || { echo "MODEL_UNREACHABLE"; exit 3; }
psql "$STATE_DSN" -tAc "select 1" >/dev/null || { echo "STATE_UNREACHABLE"; exit 4; }

# productivity: did the last window produce anything at all?
runs=$(psql "$STATE_DSN" -tAc \
  "select count(*) from runs where started_at > now() - interval '3 hours'")
[ "$runs" -gt 0 ] || { echo "NO_RUNS_3H"; exit 5; }
echo OK
```

Exit codes are the interface. Keep the mapping in the same file as the check so it cannot drift: 2 and 5 page, 3 and 4 page once and then suppress for an hour.

## Three failure classes, three different responses

Most runbooks collapse everything into "the agent broke." That produces retries exactly where retries make things worse.

| Failure class | Signature | Blast radius | Retry? | First move |
| --- | --- | --- | --- | --- |
| Model error | 429/5xx, timeout, schema-invalid JSON, refusal | one step | yes, bounded | retry with jitter, then fall back to a smaller model or dead-letter |
| Tool error | 401/403, 404 on a moved resource, 4xx validation | one run, sometimes a batch | only for 429/5xx | stop the run, discard the staged batch, fix the credential |
| State error | duplicate rows, cursor past unprocessed items, two workers on one partition | your data | never | freeze writes, page a human, reconcile against the source |

**Model error.** Split transient from semantic. Rate limits, 5xx and timeouts deserve three retries with jitter and a cap on total wait. Invalid JSON, a hallucinated tool name and a refusal do not get better with repetition — send one repair prompt with the schema attached, then dead-letter the item. This is where versioned prompts earn their keep: [context engineering](/blog/what-is-context-engineering/) is mostly about making the input to a retry different from the input that just failed.

**Tool error.** The real risk is a partial commit: rows written, then the downstream API rejects the batch. Force the order read → stage → call → commit, so a failed tool call leaves only staged rows that can be dropped. A 4xx that is not a rate limit is a config bug; route it to Slack with the failing credential name and do not wake anyone.

**State error.** The only class that needs a human within minutes. The fix requires deciding which side is the truth — your state store or the source system — and that is a judgment call, not an algorithm. Design against it: a unique constraint on `run_id`, an idempotency key derived from the input revision, and a daily reconciler that compares source count to destination count and alarms on drift.

## Who gets paged, and how the loop closes

Page only when all three are true: the loop is stopped, the work is time-bounded (someone is waiting on it), and no automatic recovery exists. Everything else goes to a channel. Model errors after retries and tool 4xx failures are log items. State errors, a tripped kill switch, an exhausted budget and a missed productivity check are page items — and state errors ignore quiet hours.

Bind the agent to an existing rotation rather than a person. The page payload should be short enough to read on a phone:

```text
AGENT  invoice-reconciler
CLASS  state
RUN    run_2026_04_11_14 (last good: 12:00)
SYMPT  duplicate rows in invoices_out, 42 staged, 0 committed
FIRST  psql $STATE_DSN -c "select * from runs where run_id='run_2026_04_11_14'"
LOG    https://logs.internal/agents/invoice-reconciler/run_2026_04_11_14
```

The loop closes on three habits, and none of them are optional:

1. Every page produces a runbook entry — symptom, check, fix, and one prevention line. The entry is what turns the next occurrence into a five-minute task instead of a rediscovery. The [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/) cover the same ground from the on-call side.
2. The dead-letter queue drains on a timer, with an alarm on its depth. A queue nobody drains is a slow-motion outage.
3. A 15-minute weekly review of the run log: runs, runs that needed retries, dead-letter depth, budget burn. Rising retries mean the loop is not unattended, just unsupervised.

## What to do next

1. Write `runbook.yaml` for your oldest unattended agent today. Owner, entrypoint, `max_runtime_seconds`, budget ceiling, kill switch, idempotency key. It takes under an hour and it forces every vague assumption into a field.
2. Move the health checker out of the agent process. Three exit-code classes: liveness, readiness, productivity. Point them at a scheduler that survives the agent.
3. Add `run_id` and `prompt_version` to your state table plus a unique constraint on `run_id`. Run `--dry-run` once against production input before the next scheduled window.
4. Write the page payload template once and paste it into your alerting tool. Then map the agent to an existing rotation so there is no "who owns this" on the night it fires.
5. Schedule the weekly log review as a calendar event, and put the dead-letter drain on a timer with an alarm on depth.

If you want the scaffolding that sits around these practices — prompt library, agent framework, deployment tooling and tutorials, pre-configured to work together — the AI Developer Stack Bundle is a one-time $79. None of it replaces the runbook, but it removes a weekend of wiring before you get to write one.

## Get AI Developer Stack Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=blog&utm_medium=article&utm_campaign=runbook-for-unattended-ai-agents) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-dev-stack/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
