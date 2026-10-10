---
title: "Tuning a Watchdog So It Does Not Flap"
description: "Practical watchdog tuning: thresholds, cooldowns, health-check endpoints, and what \"healthy\" means on unified-memory hardware."
date: "2026-10-10T08:00:00+08:00"
draft: false
slug: "tuning-watchdog-without-flapping"
author: "Wayne Chang"
tags: ["watchdog", "ops", "health-checks", "llm-inference", "reliability"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Tuning a Watchdog So It Does Not Flap"
faq:
  - q: "How many consecutive health-check failures should trigger a restart?"
    a: "Start with four for a slow-loading inference server and three for a lightweight HTTP API, always paired with a cooldown. The right number depends on how long a normal request takes under load, so measure that first."
  - q: "Why does my watchdog restart a service that is only slow?"
    a: "Because the health check uses a timeout shorter than real work takes, or because it has no failure threshold. Lengthen the timeout, require consecutive failures, and separate liveness from readiness so slow traffic only marks the target unready."
  - q: "What should a health endpoint check on unified-memory hardware?"
    a: "Model handle loaded, queue drainable, a small real allocation succeeding, and time since last successful work. Swap rate is a useful secondary signal but spikes during legitimate model loads, so it should not be your primary trigger."
---

A watchdog that restarts your service every four minutes is not monitoring, it is a second outage. Flapping usually comes from one of three places: a health check that measures the wrong thing, a threshold with no hysteresis, or a restart policy that treats a slow process as a dead one. Fix those three and most of the noise disappears.

## Decide what "healthy" actually means first

Most watchdog problems are diagnostic problems. If your health endpoint returns 200 whenever the process is running, it will happily report healthy while the model server is stuck at 100% memory and answering nothing. That endpoint is measuring liveness, not readiness.

Separate the two. Liveness answers "is this process wedged beyond recovery?" and should almost never trigger a restart. Readiness answers "can this process serve a request right now?" and should be used for routing and backoff, not for killing things.

On unified-memory hardware — Apple Silicon, Grace Hopper, any box where the GPU and CPU share one pool — this distinction matters more than on discrete GPUs. There is no VRAM number to check. Memory pressure shows up as swap growth, page faults, and a gradual slowdown before it shows up as an error. A watchdog that only looks at exit codes will never see it coming.

What you can actually check on unified memory:

| Signal | What it tells you | Good use |
|---|---|---|
| Process RSS | Resident memory the inference process holds | Trend over 5-10 min, not instantaneous value |
| Swap in/out rate | Whether the machine is thrashing | Restart trigger, with a cooldown |
| Health endpoint latency | Whether the runtime can still schedule work | Readiness gate, not a kill signal |
| Queue depth | Backlog of pending requests | Scale-out or load-shed decision |
| Last successful completion timestamp | Whether real work finished recently | The single most useful restart trigger |

That last row is the one people skip. "Time since last successful job" is a business-level signal, and it is far more robust than CPU or memory heuristics. If your service completes work in a loop, track when it last completed. If that number exceeds a few normal cycle lengths, you have a real problem regardless of what the process table says.

## Thresholds need a floor, a ceiling, and a delay

A single threshold is an invitation to flap. If you restart when the health check fails once, a single slow request during a model load will kill a healthy server. Use three numbers per rule: the threshold, the number of consecutive failures required, and a cooldown before the next action.

```yaml
# watchdog.yaml
checks:
  - name: inference_ready
    url: http://127.0.0.1:8080/healthz
    timeout_ms: 2000
    interval_s: 15
    # require this many consecutive failures before acting
    failure_threshold: 4
    # but first failure immediately marks the target unready for routing
    unready_on: 1

  - name: progress
    type: last_success_age
    max_age_s: 900
    failure_threshold: 2

actions:
  restart:
    command: systemctl restart llm-server
    # do not restart again for this long, no matter what
    cooldown_s: 300
    # after 3 restarts in 1h, stop restarting and page a human
    max_restarts_in_window: 3
    window_s: 3600
```

The `failure_threshold` and `cooldown_s` are what stop flapping. The `max_restarts_in_window` is what stops a restart loop from hiding a bug you should fix. Without a cap, a crashloop becomes invisible: the watchdog keeps succeeding at its job while the service never does its own.

A practical starting point for a slow-loading inference server: 15-second check interval, 2-second timeout, 4 consecutive failures, 5-minute cooldown. For a lightweight HTTP API, 10 seconds, 1 second, 3 failures, 60-second cooldown. Tune from there, not from a blog post's numbers.

## Health-check endpoints: make them cheap but honest

The worst health endpoint is one that runs a full inference to prove the model works. It is honest and it is also a self-inflicted load generator that can cause the failures it is meant to detect. The second worst returns 200 unconditionally.

Aim for a middle path: a cheap check that touches the parts that actually break. For a model server, that usually means verifying the model handle is loaded, the request queue is drainable, and the runtime can allocate a small tensor.

```python
# healthz.py — FastAPI route
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
import time, psutil

app = FastAPI()
START = time.time()
_last_success = {"t": time.time()}

def mark_success():
    _last_success["t"] = time.time()

@app.get("/healthz")
def healthz():
    checks = {}
    checks["model_loaded"] = MODEL is not None
    checks["queue_depth"] = QUEUE.qsize()
    checks["last_success_age_s"] = round(time.time() - _last_success["t"], 1)
    checks["rss_mb"] = round(psutil.Process().memory_info().rss / 1e6, 1)
    # a real allocation, tiny, to prove the runtime can still allocate
    try:
        _ = next(MODEL.parameters()).detach().clone()
        checks["alloc_ok"] = True
    except Exception:
        checks["alloc_ok"] = False

    ok = checks["model_loaded"] and checks["alloc_ok"]
    # report degraded, not dead, when work is merely slow
    status = 200 if ok else 503
    return JSONResponse(checks, status_code=status)
```

Note that this returns a body with the individual signals. When the watchdog does restart something, you want the last health payload in your logs. A bare 503 tells you nothing six hours later; a payload showing `alloc_ok: false` and rising `last_success_age_s` tells you the whole story.

Some teams on unified-memory machines also gate on swap rate. That is reasonable, but treat it as a tie-breaker rather than the primary signal, because swap activity spikes during legitimate model loads and will cause exactly the flapping you are trying to avoid. If you are still deciding whether a given task should be a long-running service or a scheduled script at all, the tradeoffs are covered in [Workflow Builder vs a Plain Script](/blog/workflow-builder-vs-plain-script/).

## Restart like you mean it, and record what happened

A restart that only restarts the process and nothing else is half a restart. If the failure was memory pressure, you also need to confirm the old process actually exited and released memory before starting a new one. On unified memory, an orphaned process holding tens of gigabytes will make the new one fail too, and the watchdog will see two failures and restart again. That is a flap loop with extra steps.

Shutdown sequence that avoids it:

```bash
#!/usr/bin/env bash
set -euo pipefail

PIDFILE=/run/llm-server.pid
OLD_PID=$(cat "$PIDFILE" 2>/dev/null || true)

if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
  kill -TERM "$OLD_PID"
  for i in {1..30}; do
    kill -0 "$OLD_PID" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "graceful shutdown timed out, sending SIGKILL" >&2
    kill -KILL "$OLD_PID"
    sleep 2
  fi
fi

exec /usr/local/bin/llm-server --config /etc/llm/server.toml &
echo $! > "$PIDFILE"
```

The 30-second graceful window matters more than it looks. Model servers often need to finish an in-flight generation and flush logs. Killing them at 5 seconds turns a slow request into a corrupted output, and corrupted outputs are how "the service is up but users are unhappy" incidents start.

Also log every watchdog action as a structured event: timestamp, rule that fired, health payload, restart count in window. If you cannot answer "has this flapped this week?" from your logs, you have not finished tuning. The triage habits that make those logs useful at 3 a.m. are the same ones covered in [Triage Habits for Automation That Fails While You Sleep](/blog/triage-automation-failures-while-you-sleep/).

## What to do next

- Split your health endpoint into `/livez` and `/healthz`. Make `/livez` return 200 whenever the process is running and never restart on it. Point the watchdog only at `/healthz`.
- Add `failure_threshold`, `cooldown_s`, and `max_restarts_in_window` to every watchdog rule you have. If any of the three is missing, that rule can flap.
- Track "time since last successful job" as a first-class metric and use it as your primary restart trigger. It beats CPU, memory, and error-rate heuristics on unified-memory boxes.
- Add a 30-second graceful shutdown window to your restart script, then verify no orphaned process is holding memory before you start the replacement.
- If you are new to wiring up this kind of monitoring by hand and want a guided path to a first working automation project, Ship With AI is a four-hour practical course priced at $39 one-time that takes a non-coder from zero to a running AI automation.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=blog&utm_medium=article&utm_campaign=tuning-watchdog-without-flapping) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
