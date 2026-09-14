---
title: "Local LLM Server on a GB10: A Pre-Flight Checklist"
description: "A practical checklist for running vLLM on a single-GPU unified-memory GB10 box: quantization, memory limits, systemd vs Docker, health checks and fallbacks."
date: "2026-09-14T08:00:00+08:00"
draft: false
slug: "gb10-local-llm-server-checklist"
author: "Wayne Chang"
tags: ["vllm", "gb10", "local-llm", "systemd", "quantization"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Local LLM Server on a GB10: A Pre-Flight Checklist"
faq:
  - q: "Can I use the full 128GB of unified memory for the model?"
    a: "No. The host kernel, container runtime and page cache share that pool, so you set `--gpu-memory-utilization` against a post-reserve figure and leave headroom. Treat the full number as capacity, not as an allocation target."
  - q: "Is Docker slower than running vLLM directly on a GB10?"
    a: "The container adds little GPU overhead; the real cost is startup work. Use a foreground container managed by systemd so you keep journald logging and restart policy while still getting the prebuilt CUDA environment."
  - q: "How do I stop clients hanging when the server is down?"
    a: "Give local requests a short timeout and route failures to a fallback endpoint in the client itself. A watchdog can restart the service, but it cannot unblock a job that is already waiting on a dead socket."
---

The GB10 in a DGX Spark is not a discrete GPU with its own VRAM. It is a Blackwell superchip where CPU and GPU share one pool of LPDDR5X unified memory. That single fact breaks most advice you will find for running a local LLM, because `nvidia-smi` shows memory you cannot fully hand to the model. Everything below assumes one box, one GPU, one shared memory pool, and a server you actually want to stay up.

## 1. Pick the quantization before you pick anything else

Quantization decides what fits. On Blackwell you have three realistic choices, and they differ in *where* the math runs, not just in bit width.

| Format | Bits | Hardware requirement | Typical use |
|---|---|---|---|
| BF16 | 16 | None | Largest models that still fit; your quality baseline |
| FP8 | 8 | Hopper-class or newer (GB10 qualifies) | Best speed/quality tradeoff on Blackwell |
| NVFP4 / MXFP4 | 4 | Blackwell-class | Smallest footprint; many models ship pre-quantized |

Rules of thumb that hold regardless of model size:

- Weights scale roughly with bit width. Going from BF16 to FP8 halves the weight footprint; 4-bit quarters it. Leave room for the KV cache, which grows with `--max-model-len`.
- Prefer a checkpoint that was quantized by its publisher over one you quantize yourself at 2am. Check the model card for the exact format string vLLM expects.
- If a 4-bit checkpoint is not available and its quality loss is unproven for your task, run FP8 and shrink the context instead. Context is the cheaper dial to turn.

```bash
# Rough weight footprint: params x bits / 8, then add KV cache and activations
# Example: an 8B model at FP8 -> ~8GB of weights before any cache
```

## 2. Plan unified memory: the GPU fraction is not the whole box

On a discrete card, `--gpu-memory-utilization 0.90` means 90% of VRAM. On unified memory it means 90% of a shared pool the Linux host also needs. Set it too high and the kernel reclaims pages under pressure; your server either OOMs or starts swapping.

The practical procedure:

1. Boot the box, do nothing else, and read total memory (`free -g` or `nvidia-smi`).
2. Subtract a fixed reserve for the OS, the container runtime and page cache. On unified memory, do not go below a few gigabytes of headroom.
3. Compute the fraction against the *remaining* memory after the reserve, not the raw total.
4. Cap `--max-model-len` to what you actually need. Every extra token of context is KV cache that competes with weights.
5. After the first successful start, check real usage and adjust. If `nvidia-smi` shows utilisation above about 90% of what you allocated, you are one long prompt away from trouble.

Also decide where weights live. Keep models and the Hugging Face cache on NVMe (`HF_HOME=/mnt/nvme/hf`) rather than a network mount, and set the cache directory once so you never re-download.

## 3. Docker or systemd: pick docker-in-systemd

This is the most common false choice. Docker gives you the prebuilt vLLM image, CUDA libraries and tokenizer dependencies in one artifact. Systemd gives you native restart policy, journald logging, boot ordering and a health-check contract. Use both: a systemd unit that owns a foreground container, not a detached one.

```ini
# /etc/systemd/system/vllm.service
[Unit]
Description=vLLM OpenAI-compatible server (GB10)
After=network-online.target
Wants=network-online.target

[Service]
Restart=on-failure
RestartSec=10
TimeoutStartSec=1800
Environment=HF_HOME=/mnt/nvme/hf
Environment=CUDA_VISIBLE_DEVICES=0
ExecStart=/usr/bin/docker run --rm --name vllm \
  --gpus all --ipc=host --shm-size=16g \
  --env HF_HOME=/mnt/nvme/hf \
  -v /mnt/nvme/hf:/mnt/nvme/hf \
  -p 127.0.0.1:8000:8000 \
  vllm/vllm-openai:latest \
  --model /mnt/nvme/hf/models/your-model \
  --served-model-name local \
  --dtype auto \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.80 \
  --api-key "$VLLM_API_KEY" \
  --port 8000 --host 0.0.0.0
ExecStop=/usr/bin/docker stop vllm

[Install]
WantedBy=multi-user.target
```

Notes that matter on this box: `--ipc=host` and `--shm-size` avoid shared-memory failures during startup; binding to `127.0.0.1` keeps the endpoint off the network unless you deliberately front it with a reverse proxy; `--api-key` stops random LAN hosts from using your GPU. If the host only has the container toolkit for GPUs, install it before writing this unit — debugging driver visibility through systemd is not how you want to spend an evening.

## 4. Add a health check that tests readiness, not liveness

A port that accepts TCP connections tells you nothing. vLLM initialises, loads weights and captures CUDA graphs before it can serve. Poll the readiness endpoint, and treat startup as a special case rather than a failure.

```bash
#!/usr/bin/env bash
# /usr/local/bin/vllm-healthcheck.sh
set -euo pipefail
MODEL=${1:-local}
if curl -fsS --max-time 5 http://127.0.0.1:8000/health >/dev/null \
   && curl -fsS --max-time 10 http://127.0.0.1:8000/v1/models \
        -H "Authorization: Bearer $VLLM_API_KEY" | grep -q "$MODEL"; then
  exit 0
fi
exit 1
```

Run it from a systemd timer, and give the service `Restart=on-failure` with `RestartSec` long enough that a crash-looping process does not hammer the GPU:

```ini
# /etc/systemd/system/vllm-healthcheck.service
[Unit]
Description=Probe vLLM readiness
[Service]
Type=oneshot
ExecStart=/usr/local/bin/vllm-healthcheck.sh local

# /etc/systemd/system/vllm-healthcheck.timer
[Unit]
Description=Run vLLM probe every 30s
[Timer]
OnBootSec=5min
OnUnitActiveSec=30s
[Install]
WantedBy=timers.target
```

Have the failed probe write to the journal and restart the unit, or restart the unit on a fixed rule. What you must avoid is a probe that passes because the socket is open while the engine is still loading.

## 5. Budget the load time, and decide what happens when the server is down

Two timings matter. **Cold start** reads weights from disk plus CUDA graph capture. **Warm start** benefits from page cache and is much faster. The only honest way to know yours is to time `systemctl start vllm` until the readiness probe passes, twice: once after a reboot, once immediately after a stop. Record both in the unit file comment so the next person does not guess.

Then write down the fallback before you need it:

- **Client side:** every call to the local endpoint gets a short timeout and a fallback path. Never let a 20-minute OS update silently turn into a hung production job.

```python
import os, httpx

LOCAL = "http://127.0.0.1:8000/v1"
REMOTE = os.environ["REMOTE_BASE_URL"]

def complete(payload: dict) -> dict:
    headers = {"Authorization": f"Bearer {os.environ['LOCAL_API_KEY']}"}
    try:
        r = httpx.post(f"{LOCAL}/chat/completions", json=payload,
                       headers=headers, timeout=20.0)
        r.raise_for_status()
        return r.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
        r = httpx.post(f"{REMOTE}/chat/completions", json=payload,
                       headers={"Authorization": f"Bearer {os.environ['REMOTE_API_KEY']}"},
                       timeout=60.0)
        r.raise_for_status()
        return r.json()
```

- **Server side:** keep a smaller always-resident model on the same GPU as a degraded mode, or accept the outage and surface an explicit error instead of a hang. Both are valid; pretending you have five nines is not.

If you want the systemd units, memory-planning worksheet, watchdog and a troubleshooting playbook for exactly this hardware already assembled, the DGX Spark LLM Deployment Kit is a $49 one-time download built for vLLM on the GB10. It is the same material as above, filled in and debugged, for people who would rather not retype it.

## What to do next

1. Run `free -g` and `nvidia-smi` on the idle box and write down the real total. Subtract your OS reserve and note the number; that is your memory budget, not the sticker figure.
2. Choose one quantized checkpoint, confirm the format on its model card, and set `--max-model-len` to the smallest value your workload tolerates.
3. Write the systemd unit from section 3, set `HF_HOME` to NVMe, and start it with `Restart=on-failure` plus a generous `TimeoutStartSec`.
4. Install the readiness probe and timer, then deliberately kill the server and confirm it recovers without manual help.
5. Time one cold start and one warm start, record both in the unit file, and set your client timeout below the warm-start figure.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=article&utm_campaign=gb10-local-llm-server-checklist) — **$49**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
