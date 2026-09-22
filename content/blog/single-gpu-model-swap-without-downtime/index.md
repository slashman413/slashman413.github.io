---
title: "Swapping Models on a Single-GPU Box Without Downtime Drama"
description: "A step-by-step procedure for swapping vLLM models on a one-GPU machine: drain traffic, confirm VRAM is released, health-check with a real request, and keep rollback ready."
date: "2026-09-22T08:00:00+08:00"
draft: false
slug: "single-gpu-model-swap-without-downtime"
author: "Wayne Chang"
tags: ["vllm", "gpu", "deployment", "systemd", "ops"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Swapping Models on a Single-GPU Box Without Downtime Drama"
faq:
  - q: "Can I run the old and new model at the same time to avoid downtime entirely?"
    a: "Only if the combined weights plus KV cache fit in VRAM with headroom, which is rare on a single card. For most setups the honest answer is a short, planned interruption rather than a true zero-downtime swap."
  - q: "Why does the new server hit CUDA out-of-memory right after I stopped the old one?"
    a: "Because the old worker processes or CUDA context have not finished tearing down. Check `nvidia-smi` compute-apps and wait until the memory is actually released before starting the replacement."
  - q: "What is the minimum health check before I send traffic back?"
    a: "At least one real chat completion request with an assertion that the response body is non-empty. A passing `/health` endpoint or open port does not prove the model loaded."
---

Swapping the model behind a single-GPU inference server is not a rolling deploy. There is one device, one set of weights in VRAM, and no second node to take over while the first one restarts. The failure mode is predictable: you kill the old process, the new one fails to allocate, and now nothing is serving while you debug in a panic. The fix is a fixed sequence you follow every time, including a way back.

## Why concurrent model swaps fail on one GPU

A 24 GB or 48 GB or 128 GB card can hold one model comfortably and two models badly. When you start a new vLLM server while the old one is still running, one of three things happens: the new process fails with a CUDA out-of-memory error, both processes allocate smaller KV caches and both serve badly, or the driver lets them run and you get throughput collapse from contention. None of these is a swap. They are a degraded state you then have to unwind while users are waiting.

The other trap is process-level thinking. Killing the server process does not mean the memory is gone. vLLM workers, NCCL communicators, and the CUDA context can take seconds to tear down. If you start the replacement in the same second, you race the teardown and lose. So the procedure has an explicit wait step, and that wait is checked, not assumed.

Finally, ports. If both servers bind the same port, the new one exits immediately with an address-in-use error and you may not notice until a health check fails later. Sequencing the stop before the start is not optional.

## The swap procedure, step by step

Treat this as a runbook. Write it down, put it in the repo, and do not improvise under pressure.

**1. Stop accepting work.** If anything is in front of the GPU box, take it out of rotation first. For most single-box setups that means flipping a health endpoint or a reverse-proxy upstream so new requests are not routed here, while in-flight requests finish.

```bash
# systemd-managed services: stop the intake side first
sudo systemctl stop vllm-gateway.service

# confirm the service is actually down before touching the GPU
systemctl is-active vllm-gateway.service || echo "gateway down"
```

If you do not have a gateway, the equivalent is a small proxy like nginx or Caddy in front of the model server. Point the upstream at a 503 or remove it, reload, and wait for active connections to drain. A 30-second drain window is usually enough for chat-style traffic; long-running generation needs longer.

**2. Stop the old model server.** Now, and only now, stop the process that holds the weights.

```bash
sudo systemctl stop vllm.service

# Wait for the process to disappear, not just for the command to return
for i in $(seq 1 30); do
  if ! pgrep -f "vllm.entrypoints.api_server" > /dev/null; then
    echo "server process gone after ${i}s"
    break
  fi
  sleep 1
done
```

**3. Confirm VRAM is actually released.** This is the step people skip, and it is the one that causes confusing OOM errors on the next start. Check both the driver view and the process view.

```bash
nvidia-smi --query-gpu=memory.used,memory.total --format=csv
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
```

What you want to see is `memory.used` back down near idle (a driver and display stack may hold a small amount) and an empty or near-empty compute-apps list. If a PID is still holding several gigabytes, do not start the new server. Investigate that PID first — a stuck worker process will block the new allocation no matter how many times you retry.

| Check | Healthy result | What to do if not |
| --- | --- | --- |
| `systemctl is-active vllm.service` | `inactive` or `failed` | Stop it again, check `journalctl -u vllm.service -n 50` |
| `nvidia-smi` memory.used | Near idle baseline | Find the holder with `fuser -v /dev/nvidia*` |
| compute-apps list | Empty | Kill the leftover worker PID, wait, recheck |
| Port free | `ss -ltnp` shows nothing on 8000 | Find and stop the stale listener |

**4. Start the new server with an explicit command.** Keep the launch command in a file or a systemd unit, not in your shell history. When something goes wrong at 2 a.m., you want the exact flags that worked yesterday, not a reconstruction.

```bash
# /etc/systemd/system/vllm.service (excerpt)
[Service]
ExecStart=/usr/local/bin/vllm serve /models/Qwen3-32B-Instruct \
  --host 0.0.0.0 --port 8000 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --served-model-name qwen3-32b
Restart=on-failure
RestartSec=5
```

Two flags deserve attention. `--gpu-memory-utilization` sets the fraction of VRAM vLLM will target for weights plus KV cache; on a box with a display or another small consumer, leaving it at 0.90 instead of 0.95 buys headroom. `--max-model-len` directly affects KV cache size, so lowering it is your first lever when a model that used to fit no longer fits after a config change.

**5. Health-check with a real request, not just a port check.** A listening socket means the HTTP layer is up. It does not mean the model loaded. Send an actual completion and assert on the response body.

```bash
until curl -sf http://127.0.0.1:8000/health > /dev/null; do sleep 2; done

curl -s http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-32b",
    "messages": [{"role": "user", "content": "reply with the word ok"}],
    "max_tokens": 8
  }' | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['choices'][0]['message']['content'].strip(), 'empty completion'; print('model serving')"
```

The assertion matters. A server that returns HTTP 200 with an empty or truncated completion is not healthy, and it will pass a naive uptime check. Only after this passes do you put the gateway back and resume traffic.

## Keep the previous launch as a rollback

Before you start the new model, write down the old launch parameters somewhere you can paste them. Not "the previous model" — the full command, the model path, the revision or commit if you pin one, and the serving name your clients expect.

```bash
# /opt/rollback/vllm-previous.sh
exec /usr/local/bin/vllm serve /models/Llama-3.3-70B-Instruct-AWQ \
  --host 0.0.0.0 --port 8000 \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.92 \
  --served-model-name llama-3.3-70b
```

Rollback is then a two-command drill: stop the new unit, and start the previous script as the unit's ExecStart (or run it directly and fix the unit after). Practice it once on a quiet afternoon so it is muscle memory rather than a first attempt during an incident. If you pin model weights by revision, rollback also protects you from a silent upstream update to the same model name.

If clients address the model by the `--served-model-name` value, keep that name stable across swaps where the API surface is compatible. Changing the name forces every client to redeploy, which turns a five-minute swap into a multi-service release.

## What to do next

1. Write the swap runbook into your repo as a Markdown file with the exact commands above, ordered stop-then-start, including the VRAM verification step.
2. Move your launch command out of shell history and into a systemd unit or a versioned script, so both start and rollback use the same flags.
3. Replace your port-based health check with one real completion request that asserts on the response body, and wire it into whatever notifies you when the box is unhealthy.
4. Record the VRAM baseline of your current model at idle and under load, so the next swap has a number to compare against instead of a guess.
5. Do one dry run of the rollback path while nothing is broken. It is cheap now and expensive later.

If you would rather not assemble the systemd units, memory math, watchdog and health checks yourself, the DGX Spark LLM Deployment Kit ($49, one-time) bundles those pieces for running vLLM models on an NVIDIA GB10, including a troubleshooting playbook for the allocation and startup failures this procedure is designed to catch. If you are still deciding where automation fits around your serving stack at all, /blog/ultimate-ai-automation-guide-2026/ is the broader map, and /blog/triage-habits-for-automation-that-fails-while-you-sleep/ covers what to do when the box fails at 3 a.m.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=article&utm_campaign=single-gpu-model-swap-without-downtime) — **$49**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
