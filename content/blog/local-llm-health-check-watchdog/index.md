---
title: "Add a Health Check and Watchdog to a Local LLM Server"
description: "Build a probe that tests whether a local vLLM server actually answers, classify its failures by exit code, and restart only when draining is safe."
date: "2026-10-26T08:00:00+08:00"
draft: false
slug: "local-llm-health-check-watchdog"
author: "Wayne Chang"
tags: ["llm", "vllm", "systemd", "monitoring", "watchdog"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Add a Health Check and Watchdog to a Local LLM Server"
faq:
  - q: "Why not just set Restart=always in the systemd unit?"
    a: "That only reacts to the process exiting. A wedged engine keeps the process alive and the port open, so systemd never fires. You need a separate probe that actually sends a request."
  - q: "Should the health check run a full generation each time?"
    a: "No. Keep it to a short prompt with a small max_tokens so it does not add queue pressure. Run a longer context probe rarely, as its own check."
  - q: "What should the watchdog do when the server is slow but still correct?"
    a: "Alert and investigate rather than restart. A restart clears the KV cache and hides the real cause: queue depth, thermal throttling or oversized client prompts."
---

A local inference server rarely dies cleanly. The process stays up, the port stays open, and `/v1/models` keeps returning JSON while the engine is stuck behind a full KV cache or quietly failed to load its weights. A watchdog built on `Restart=always` will babysit that broken state for days. You need two separate pieces: a probe that answers "is the model actually replying", and a restart path that does not kill the requests you already accepted.

## Decide what healthy means before writing the check

Each layer of checking costs more to run and tells you something different. Pick the layer that matches the failure you actually care about, then stack two of them.

| Check | Cost per run | Catches | Misses |
|---|---|---|---|
| Process alive / TCP connect | near zero | Crash, closed port, dead unit | Deadlocks, engine not loaded |
| `GET /health` or `GET /v1/models` | near zero | Frontend down, engine still starting | Wedged scheduler, wrong weights |
| One short completion, total latency | one prefill plus a few tokens | Hard hangs, saturated queue | Slow first token hidden inside fast decode |
| Time to first token (streamed) | same request as above | KV cache pressure, prefill backlog | Slow decode, wrong answers |
| Known-answer probe at temperature 0 | same request as above | Wrong model, broken tokenizer, corrupt weights | Throughput and latency regressions |
| Long-context probe (run rarely) | one large prefill | Memory fragmentation, context limit mismatch | Anything a short request would show |

Two details matter here. First, vLLM's `/health` endpoint returns success once the engine is ready and fails while it is still loading, which makes it a good startup gate and a poor liveness gate: it keeps returning success after the engine wedges. Second, fold first-token timing and the known-answer check into the same request. A single short generation gives you both, so the probe costs one prefill and a handful of decoded tokens.

On determinism: greedy decoding at temperature 0 is close to deterministic, but batching and kernel choices mean the exact string can shift. Assert that the reply contains a fixed token rather than equals it, and put a random suffix in the prompt so a prompt cache cannot answer on the model's behalf.

## Write the probe so its exit code classifies the failure

Most health checks fail badly: they return one generic error, and the watchdog treats every failure as "restart". Distinguish the failures a restart fixes from the ones it only hides.

```python
#!/usr/bin/env python3
# /opt/llm/healthcheck.py
import json, os, time, urllib.request, uuid

BASE = os.environ.get("LLM_BASE", "http://127.0.0.1:8000")
MODEL = os.environ["LLM_MODEL"]
BUDGET_S = float(os.environ.get("HEALTH_BUDGET_S", "20"))
MARKER = "READY-" + uuid.uuid4().hex[:6]

def chat(payload):
    req = urllib.request.Request(
        BASE + "/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    return urllib.request.urlopen(req, timeout=BUDGET_S)

def probe():
    payload = {
        "model": MODEL,
        "messages": [{"role": "user",
                      "content": f"Reply with exactly this token: {MARKER}"}],
        "temperature": 0,
        "max_tokens": 16,
        "stream": True,
    }
    start, ttft, chunks = time.monotonic(), None, []
    with chat(payload) as resp:
        for raw in resp:
            line = raw.decode().strip()
            if not line.startswith("data:"):
                continue
            body = line[5:].strip()
            if body == "[DONE]":
                break
            delta = json.loads(body)["choices"][0]["delta"].get("content")
            if delta:
                if ttft is None:
                    ttft = time.monotonic() - start
                chunks.append(delta)
    return ttft, time.monotonic() - start, "".join(chunks)

if __name__ == "__main__":
    try:
        ttft, total, answer = probe()
    except Exception as exc:
        print(f"unreachable: {exc}")
        raise SystemExit(2)      # process or port is gone
    if MARKER not in answer:
        print(f"wrong answer: {answer!r}")
        raise SystemExit(3)      # engine answered, content is wrong
    print(f"ok ttft={ttft:.2f}s total={total:.2f}s")
    if ttft > BUDGET_S / 2:
        raise SystemExit(4)      # correct but slow: alert, do not restart
    raise SystemExit(0)
```

Now the exit code carries the decision. `2` means the server lost its ability to answer, which a restart usually fixes. `3` means it answered something wrong, which a restart will reproduce. `4` means the machine is working but under pressure. Your watchdog and your alerting can share one script.

## Drain first, restart second

systemd should run the timer and hold the restart policy:

```ini
# /etc/systemd/system/llm-healthcheck.service
[Unit]
Description=LLM generation probe
After=llm-server.service

[Service]
Type=oneshot
User=llm
Environment=LLM_MODEL=your-model-name
Environment=LLM_BASE=http://127.0.0.1:8000
Environment=HEALTH_BUDGET_S=20
ExecStart=/opt/llm/healthcheck.py
SuccessExitStatus=0 4
```

```ini
# /etc/systemd/system/llm-healthcheck.timer
[Unit]
Description=Run the LLM probe every minute

[Timer]
OnBootSec=5min
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
```

`SuccessExitStatus=0 4` keeps the slow-but-correct case out of your failure logs. Exit 3 stays a failure but triggers nothing automatic, which is intentional. A wrong answer is a page-a-human event, not a restart event.

For the restart itself you have a choice about in-flight work:

| Strategy | In-flight requests | Downtime | When it fits |
|---|---|---|---|
| Immediate `systemctl restart` | Dropped | Short, but every retry costs latency | Single user, batch jobs, clients that retry |
| Drain at the proxy, then restart | Completed | Seconds of refused connections | Anything with interactive users |
| Two instances behind a proxy, rotate | Completed | None visible | Enough VRAM for two copies of the model |
| Reload weights in place | Depends on the server | Long | Only if your server exposes it cleanly |

A drain wrapper is about twenty lines:

```bash
#!/usr/bin/env bash
# /opt/llm/drain-restart.sh, run only after healthcheck.py exits 2
set -euo pipefail
MAX_WAIT=${MAX_WAIT:-120}

# 1. Stop routing new work to this instance.
printf 'backup' > /etc/caddy/active-upstream
caddy reload --config /etc/caddy/Caddyfile

# 2. Wait until the running-request gauge reaches zero.
for _ in $(seq 1 "$MAX_WAIT"); do
  active=$(curl -fsS http://127.0.0.1:8000/metrics \
    | awk '/^vllm:num_requests_running/ {print $2; exit}')
  [ "${active:-0}" = "0" ] && break
  sleep 1
done

# 3. Restart, wait for readiness, restore traffic.
systemctl restart llm-server.service
until curl -fsS http://127.0.0.1:8000/health >/dev/null; do sleep 2; done
printf 'primary' > /etc/caddy/active-upstream
caddy reload --config /etc/caddy/Caddyfile
```

The gauge name depends on your build; if you do not scrape metrics, ask the proxy for its active connection count instead. The order is the point: flip the edge, wait for quiet, restart, wait for `/health`, flip back. If you cannot drain, at least put a proxy in front that fails fast with a 503 and make clients retry with a short backoff. A retry on a refused connection is cheaper than a truncated stream.

Keep `StartLimitBurst` on the server unit so systemd gives up after a few attempts. A server restarting every three seconds is harder to debug than one that stays down and pages you. The limits themselves are covered in [tuning a watchdog so it does not flap](/blog/tuning-watchdog-without-flapping/).

## When a restart is the wrong fix

- **The model never becomes ready after a config change.** Check `journalctl -u llm-server` and `dmesg` for out-of-memory at load time. Restarting repeats the same load. Lower `--gpu-memory-utilization` or `--max-model-len` first. A previous process still holding VRAM can also make the next start look broken.
- **Every restart produces a wrong-answer probe.** Inspect the model path and checksum on disk before you touch the service. You are reloading bad weights on a schedule.
- **Latency climbs and stays there.** A restart clears the KV cache and buys minutes. Check `nvidia-smi` for clocks and temperatures, check queue depth, and look for the client sending enormous prompts.
- **The probe fails right after you edited launch flags.** Roll the config back. Restarting with the same flags is a coin flip.
- **Only the long-context probe fails.** Your configured context limit and your advertised limit disagree. Restarts do not reconcile them.

The rule to keep: restart when the process lost its ability to answer, not when its answer is wrong or slow. For how these machines degrade over longer stretches, see [one week of watching a home DGX LLM server](/blog/watching-a-home-dgx-llm-server/).

## What to do next

1. Add `/opt/llm/healthcheck.py` and run it by hand until you trust its four exit codes.
2. Wrap it in a systemd timer at 60 seconds with `SuccessExitStatus=0 4`, and set `StartLimitBurst` on the server unit so a crash loop stops itself.
3. Point alerting at exit 3 and exit 4 rather than the unit's state. Those are the failures systemd cannot see.
4. Write the drain step before enabling the restart step. A watchdog that drops streams gets disabled by its owner within a week.
5. If you want the systemd units, memory planning and probe already assembled for a GB10 box, the DGX Spark LLM Deployment Kit is a $79 one-time download at https://slashmaster6.gumroad.com/l/bppdqp.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=local-llm-health-check-watchdog) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
