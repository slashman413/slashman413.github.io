---
title: "One Week of Watching a Home DGX LLM Server: Design Notes"
description: "A one-week monitoring design for a home DGX Spark vLLM server: the four signals to watch, how to tier alerts, and what each alert should trigger."
date: "2026-10-13T08:00:00+08:00"
draft: false
slug: "watching-a-home-dgx-llm-server"
author: "Wayne Chang"
tags: ["dgx-spark", "vllm", "monitoring", "systemd", "observability"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "One Week of Watching a Home DGX LLM Server: Design Notes"
faq:
  - q: "Should I alert on GPU memory or host memory on a DGX Spark?"
    a: "Both. On the GB10 the CPU and GPU share one unified memory pool, so `nvidia-smi` and `free -h` are two readings of the same budget and either can be the one that fills up."
  - q: "How do I stop the watchdog from restarting vLLM during a slow model load?"
    a: "Treat a load as expected work rather than a hang: raise `TimeoutStartSec`, set `RestartSec` and `StartLimitBurst` to tolerate one slow start, and let the alert `for:` duration run longer than any legitimate reload."
  - q: "What is the most useful thing to log during the observation week?"
    a: "Timestamps of every deliberate change, paired with how long each model swap took. Almost every other signal in the week is only interpretable against those two facts."
---

Most home LLM servers get judged by the wrong number. Tokens per second matters far less than whether the box is actually serving when you walk over to it, and whether it came back cleanly after your last change. What follows is the design of a one-week observation window for a DGX Spark (GB10, 128 GB of unified memory) running vLLM: which signals to record, how to tier the alerts, and what each alert should actually trigger.

## The week has three phases, and only one of them is quiet

**Phase 1 — 48 hours of silence.** No alerts, no thresholds, no tuning. You are collecting shapes, not incidents. Scrape vLLM's `/metrics` every 15 seconds, the host every 15 seconds, and hit `/health` every 5 seconds. A flat file is enough to start; the point is to be able to look backwards later and see what normal looked like before you decided anything was wrong.

**Phase 2 — the change window.** On days three and four you do the things that break things, on purpose: stop and start the model, swap to a different one, fire a request with a context long enough to push the KV cache hard, restart the network interface. Every action gets a timestamp in a plain text file. Now every signal from phase 1 is anchored to a known cause instead of a guess.

**Phase 3 — the quiet tail.** Three days of ordinary use. The question is no longer "is it up" but "does it drift". Most of what a week of watching an LLM server teaches you is drift, not failure.

The instrumentation is boring on purpose:

```bash
# swap-watch.sh — record the shape of a swap, not just the outcome
set -euo pipefail
LOG="/var/log/vllm/swap-$(date +%Y%m%dT%H%M%S).log"
{
  echo "=== begin $(date -Is) ==="
  systemctl stop vllm@qwen.service
  # GB10 memory is unified: the host reading is part of the model budget
  free -g
  nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader
  systemctl start vllm@qwen.service
  until curl -sf localhost:8000/health >/dev/null; do sleep 1; done
  echo "=== ready $(date -Is) ==="
  # metric names shift between vLLM releases; grep once, then write yours down
  curl -s localhost:8000/metrics | grep -E '^vllm:' | head -n 20
} 2>&1 | tee "$LOG"
```

Those last two lines matter more than they look. A log entry saying "the second swap of this model was slower than the first, and cache usage read differently" is a lead. A dashboard line going up is a feeling.

## Four signals, four different kinds of failure

| Signal | Where it comes from | What normal looks like | How it fails | Tier |
|---|---|---|---|---|
| Model swap time | timestamps in `swap-watch.sh`, plus systemd unit duration | a stable band across three swaps of the same model, most of it spent loading weights | drifts upward over days; the second swap of a day is slower than the first | ticket |
| Memory pressure | `free -h` on the host, `nvidia-smi`, dcgm exporter | rises under load, plateaus after warmup, returns to the same plateau after a swap | a slow climb that never comes back down, ending in an OOM kill of the API server | page |
| Watchdog restarts | a counter you emit from the watchdog script, plus `systemctl show` | zero during the quiet window | restarts on a regular interval — that is a probe problem, not a model problem | page, above 3/hour |
| Health-check false alarms | `/health` responses compared against a real one-token completion | both succeed; `/health` may briefly 503 during a load | `/health` returns 200 while generation times out, or flaps during a legitimate load | dashboard |

Notice how dependent on the baseline that table is. Three of the four signals mean nothing on their own; they are only readable against the first 48 hours. That is why the week is a design and not a checklist.

One hardware note changes the analysis. On the GB10, memory is unified — the number `nvidia-smi` reports and the number `free -h` reports are two views of the same pool. A page-cache-heavy host workload, say a large rsync or an unindexed scan of a model directory, competes with the model instead of sitting beside it. Treat the host reading as part of the model's memory budget and watch both.

## Tier the alerts before you write them

An untiered rule becomes background noise within a week. Three tiers are enough:

- **page** — phone, any hour. The service is down and will not fix itself.
- **ticket** — read it during the workday.
- **dashboard** — recorded, reviewed weekly, no notification.

The rule that keeps this honest: an alert that fires often and is always dismissed is a tax, not a signal. Either the threshold is wrong or the condition is one you have already decided not to act on. Delete it. The same thinking is what stops a watchdog from flapping — see [tuning a watchdog so it does not flap](/blog/tuning-watchdog-without-flapping/).

```yaml
groups:
  - name: dgx-vllm
    rules:
      - alert: VLLMServingDown
        expr: up{job="vllm"} == 0
        for: 2m                  # longer than any legitimate reload
        labels: {tier: page}
      - alert: KernelOOMKill
        expr: increase(node_vmstat_oom_kill[10m]) > 0
        labels: {tier: page}
      - alert: ModelLoadDrift
        expr: vllm_model_load_seconds > on() vllm_model_load_seconds_baseline * 1.5
        for: 15m
        labels: {tier: ticket}
```

`vllm_model_load_seconds` is not something the exporter hands you; you emit it from the swap script and set the baseline from your own phase-1 data. Route on the `tier` label rather than on alert names, so adding a rule does not mean editing a routing tree.

Also separate startup from readiness. `/health` is a liveness check: it tells you the process answers. A readiness check is a real completion, one or two tokens, through the same path your client uses. On a vLLM box those two diverge exactly when things get interesting.

## Running the playbook when a tier fires

**Tier 0, OOM kill.** Confirm before you tune. Exit code 137 on the unit plus an OOM line in `dmesg` is the signature. The three dials that matter, in order: lower `--gpu-memory-utilization` (it defaults to 0.9), lower `--max-model-len`, then cap `--max-num-seqs`. On unified memory, also check whether a host-side job was holding page cache at the moment of the kill. If you set a KV cache swap space, remember that on this hardware you are moving bytes within one pool, not borrowing from a separate host RAM budget — measure it in your own window before trusting it as headroom.

**Tier 0, watchdog restart loop.** Restarts at a fixed interval are almost never the model's fault. Check `ExecMainStatus`; 137 points back at memory, a plain 1 usually means a startup error, and a CUDA device error means stop restarting and look at the driver. Fix the probe first: a legitimate load takes time, so `TimeoutStartSec`, `RestartSec` and `StartLimitBurst` should reflect that.

**Tier 1, swap drift.** Compare against your own three-swap baseline from phase 2. Common causes: weights on slow or cold storage, a leftover process still holding memory, or a daemon that never fully exited.

**Tier 1, health flaps.** Fix the probe, not the model. Lengthen the `for:` duration, raise the probe interval, and make sure the readiness check runs a real request.

**Tier 2.** Log it, review it weekly, adjust one threshold. Two firings that both self-resolved is the threshold telling you it is wrong.

The 60-second triage, run before you change anything:

```bash
# Tier 0 triage — read only, change nothing yet
systemctl status vllm.service --no-pager | head -n 20
systemctl show -p NRestarts -p ExecMainStatus vllm.service
journalctl -u vllm.service -n 200 --no-pager | grep -iE 'oom|cuda|error|killed'
dmesg -T | tail -n 40 | grep -iE 'oom|killed'
free -h
nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader
```

This is the same discipline as [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/): gather evidence first, because the first instinct after a page at 2am is usually to restart something that was about to tell you what went wrong.

## What to do next

1. Pick these four signals — swap time, memory pressure, watchdog restarts, health-checks — and record a 48-hour baseline before you write a single rule.
2. Split liveness from readiness: keep `/health` as the liveness probe and add a one-token completion as readiness.
3. Emit your own restart counter from the watchdog script instead of inferring restarts from unit state changes.
4. Add a `tier` label to every rule and route on that label. Delete any alert that fired more than a handful of times this week without anyone acting on it.
5. Keep the swap log as a rolling file. Swap timestamps are the cheapest early warning you have, and they cost nothing to write.

If you would rather start from something already wired up, the DGX Spark LLM Deployment Kit ($49, one-time) is a deployment kit for running vLLM models on an NVIDIA GB10: systemd units, memory planning, health checks, watchdog and a troubleshooting playbook.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=article&utm_campaign=watching-a-home-dgx-llm-server) — **$79** (or $49 with code GB10EARLY), one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
