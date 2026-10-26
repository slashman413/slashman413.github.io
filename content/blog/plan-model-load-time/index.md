---
title: "Plan Model Load Time So the Server Comes Up Predictably"
description: "How to measure, bound and warm model load time on a local LLM server, and when a slow start means a broken config rather than big weights."
date: "2026-10-26T08:00:00+08:00"
draft: false
slug: "plan-model-load-time"
author: "Wayne Chang"
tags: ["llm-ops", "vllm", "systemd", "startup", "local-llm"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Plan Model Load Time So the Server Comes Up Predictably"
faq:
  - q: "Why is my model server slow only on the first request?"
    a: "With mmap, weights fault in on demand, and CUDA graphs for a batch shape are captured the first time that shape runs. Sending one warm request after /health moves that cost off your users."
  - q: "Should I use mmap or preload weights into the page cache?"
    a: "mmap starts faster but makes early requests slow and restart times unstable. Preloading costs one sequential disk read per boot and gives a predictable start, so use it when startup time has to be known."
  - q: "How long should the systemd start timeout be for an LLM server?"
    a: "Longer than your worst cold load, not your typical one. Measure a restart after a reboot with the page cache cold, then set TimeoutStartSec and the watchdog deadline above that number."
---

Model load time is a budget line, not a mystery. It is disk read, memory placement, and a one-time warm-up, and each part fails in a different way. Once you can name which part is growing, "it takes a while to start" becomes a number you either accept or change.

## What moving weights into unified memory actually costs

Weights are bytes: parameters times bytes per parameter. At fp16 that is 2 bytes per parameter, at fp8 one byte, at 4-bit roughly half a byte. A 32B model is about 64 GB of weights at fp16 and about 32 GB at fp8, before any cache. On a GB10, CPU and GPU share one 128 GB pool of unified memory, so weights, KV cache and runtime overhead come out of the same number. A configuration that fits with a short context can fail with a long one, and it fails slowly, after a long load.

The load runs in three phases:

1. **Read.** The checkpoint comes off disk. With safetensors and mmap, vLLM's default, this is lazy: the file is mapped and pages fault in as they are touched. "Started" comes fast, "serving" comes much later.
2. **Place.** Weights are copied into the memory the engine will use. Peak memory is highest here because source and destination briefly coexist.
3. **Initialize.** KV cache blocks are allocated for `--max-model-len` and `--gpu-memory-utilization`, CUDA graphs are captured, kernels compile, the tokenizer loads. None of that depends on your prompt.

Phase 3 is the one usually blamed on "the model is big". It scales with context length and batch shape, not parameter count. Raising `--max-model-len` on an unchanged model makes startup longer and steady-state memory higher.

| Load path | Where the time goes | Restart behaviour | Use when |
| --- | --- | --- | --- |
| safetensors + mmap (default) | page faults on first touch | fast if page cache is warm, slow if evicted | normal serving on a quiet box |
| pre-read weights into page cache | one sequential disk pass before the engine starts | predictable, paid once per boot | you need a known start time |
| `--load-format dummy` | no weight read at all | near-instant | testing HTTP path or memory math only |
| `--enforce-eager` | skips CUDA graph capture | shorter start, lower per-token throughput | debugging, or shapes that will not capture |

## Measure the load path before you tune it

Four timestamps per start matter: process start, "model loaded" in the log, `/health` returning 200, and the first completed request. The gap between the last two is what users feel, and it is invisible if you only watch service status.

```bash
#!/usr/bin/env bash
# /usr/local/bin/measure-load.sh — one line per restart
set -euo pipefail
LOG=/var/log/vllm/load.log; API=http://127.0.0.1:8000
t0=$(date +%s.%N)
systemctl restart vllm.service
until curl -fsS -o /dev/null "$API/health"; do sleep 0.5; done
t1=$(date +%s.%N)
curl -fsS "$API/v1/completions" -H 'Content-Type: application/json' \
  -d '{"model":"local","prompt":"warm","max_tokens":16}' >/dev/null
t2=$(date +%s.%N)
awk -v a="$t0" -v b="$t1" -v c="$t2" -v d="$(date -Is)" \
  'BEGIN{printf "%s ready=%.1fs cold=%.1fs\n", d, b-a, c-b}' >> "$LOG"
```

Run it after every deploy for a week. A bimodal ready time means page cache, not the model. A flat line that steps up after a config change points at context length or memory utilisation. Keep the startup log line where vLLM reports KV cache size and maximum concurrency: it should move when you change `--max-model-len` and stay put when you do not.

## Warm both caches so the first request is not the slowest

There are two caches and they need separate warm-ups.

The file cache belongs to the operating system. Read the weight files once before the engine starts:

```ini
[Service]
Type=simple
TimeoutStartSec=0
ExecStartPre=/usr/local/bin/preload.sh /models/qwen-safetensors
ExecStart=/opt/vllm/bin/vllm serve /models/qwen-safetensors --port 8000
Restart=on-failure
RestartSec=5
```

`preload.sh` can be a loop of `cat "$f" > /dev/null` over the `*.safetensors` files, or `vmtouch -t` on the directory, which also reports what stayed resident. `ExecStartPre` blocks startup and counts against `TimeoutStartSec`, whose default of 90 seconds is not sized for a model load, so raise it.

The runtime cache belongs to the engine: CUDA graphs for the batch shapes it will see, and the prefix cache if enabled. `/health` returning 200 only means the HTTP layer is up. After it passes, send one request shaped like your worst realistic call, full system prompt and maximum `max_tokens`, and discard the answer. That request pays the graph capture and the prefill; later requests with the same system prompt hit the prefix cache.

Two flags are worth knowing. `--enforce-eager` skips graph capture and shortens startup at the cost of per-token throughput. `--load-format dummy` skips weight loading entirely and is for testing the server path, never for serving.

## Keep heavy jobs off the boot path

The worst slow start is not slow at all, it is two things starting at once. A backup, an index rebuild, a dataset download or a second model server competes with the loader for disk bandwidth and, under unified memory, for pages. Weights get paged back out, the watchdog deadline passes, systemd restarts the unit, and the cycle repeats with the job still running. This is the same failure mode covered in [adding a health check and watchdog to a local LLM server](/blog/local-llm-health-check-watchdog/), with timing added.

Order units explicitly and gate on readiness rather than elapsed time:

```ini
# vllm-ready.service
[Unit]
After=vllm.service
Requires=vllm.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/warmup.sh

# nightly-index.service
[Unit]
After=vllm-ready.service
Requires=vllm-ready.service
```

`warmup.sh` is the same warm request used in the measurement script; keep one script called from both places so the gate and the measurement never disagree. Set the watchdog deadline above your worst measured load, never against a warm restart, and use `Conflicts=` for any unit that cannot share memory with the engine. The boot ordering notes in [one week of watching a home DGX LLM server](/blog/watching-a-home-dgx-llm-server/) are the same lesson from the other direction.

## When slow is fine, and when the config is wrong

Slow is fine when it is proportional to weight bytes, stable across restarts, written down, and followed by a warm first request. Anything else is information.

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Ready time alternates fast/slow | page cache warm vs evicted | `vmtouch` on the weight directory |
| Unit restarts during load | deadline below load time | `TimeoutStartSec`, `WatchdogSec` |
| Load grew with no model change | `--max-model-len`, `--gpu-memory-utilization` | KV cache line in startup log |
| Memory near the cap, swap activity | weights plus cache plus another process | `dmesg -T` for OOM lines |
| First request far slower than the rest | no warm-up | send warm request after `/health` |
| Long but identical every restart | genuinely large weights | bytes per parameter; consider fp8 |

The last row is the honest one. If the number is large but stable and budgeted, schedule around it: longer `TimeoutStartSec`, a readiness gate, no cron at boot. If it is large and unstable, the config is wrong, not the model. Before you blame the model, re-read [upgrading one layer of the stack](/blog/upgrade-one-layer-ai-stack/): most load-time surprises arrive with a flag change, not a checkpoint change.

## What to do next

1. Add the measurement script to your deploy path and collect a week of `ready` and `cold` numbers before changing any flag.
2. Set `TimeoutStartSec` and the watchdog deadline from your worst measured cold load, not from a warm restart.
3. Pre-read the weight files in `ExecStartPre`, send one warm request after `/health`, then re-measure.
4. Move every heavy timer behind a `vllm-ready.service` gate and check `dmesg` for the OOM killer after the next restart.
5. Write the load budget into the runbook: expected range, what makes it grow, what to check when it does.

If you would rather not assemble the unit ordering, readiness gate and watchdog yourself, the DGX Spark LLM Deployment Kit is a $79 one-time download for running vLLM on an NVIDIA GB10: systemd units, memory planning, health checks, a watchdog and a troubleshooting playbook. It is available at https://slashmaster6.gumroad.com/l/bppdqp.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=plan-model-load-time) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
