---
title: "One GPU Box, Four Workloads, One Operator: A Field Guide"
description: "How to budget unified memory and schedule model serving, image generation, video encoding and batch jobs on one GB10 box without killing the server."
date: "2026-09-15T08:00:00+08:00"
draft: false
slug: "one-gpu-box-multiple-workloads"
author: "Wayne Chang"
tags: ["gpu", "vllm", "systemd", "memory-management", "self-hosting"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "One GPU Box, Four Workloads, One Operator: A Field Guide"
faq:
  - q: "Can vLLM and an image generation UI run on the same GB10 box at once?"
    a: "Yes, if both are capped: set vLLM's `--gpu-memory-utilization` from your budget file and give the diffusion process a hard cgroup cap with concurrency of 1. The failure you are avoiding is a transient diffusion peak triggering the OOM killer against the model server."
  - q: "Why does my LLM server get killed instead of the job that caused the memory spike?"
    a: "The kernel usually kills the process with the largest resident set, which is the model server. Set `OOMScoreAdjust=-500` on the serving unit and `MemoryOOMGroup=yes` on batch slices so the offending cgroup dies as a unit."
  - q: "Should I enable swap on a unified-memory machine?"
    a: "Generally no for GPU workloads. Paging weights out to NVMe makes every decode step a disk read, so set `MemorySwapMax=0` on GPU slices and keep swap, if any, for non-GPU work with its own limit."
---

One machine that serves an LLM, renders images, encodes video and runs overnight batch jobs sounds like a capacity problem. On a unified-memory box it is mostly a budgeting problem, because the GPU and the CPU draw from the same pool. These are the conventions that keep a single GB10-class machine honest for a single operator.

## Unified memory changes the arithmetic

On a discrete card you track two numbers: host RAM and VRAM. `nvidia-smi` reports the second one, and that is the number that kills you. On GB10 (Grace Blackwell with coherent LPDDR5X shared between CPU and GPU) there is one pool. The capacity figure describes the whole machine, not the accelerator, and no separate VRAM ceiling exists to plan against.

Three things follow from that:

- **Page cache competes with weights.** A model read once and later evicted lands back on NVMe, and the next request eats disk latency. Nothing reserves cache for you.
- **There is no hardware partitioning.** No MIG-style isolation on a shared pool, so isolation has to come from cgroups, admission control and operator discipline.
- **Swap is worse than an OOM kill.** Paging a live model out to NVMe turns every decode step into a disk read. Set `MemorySwapMax=0` on GPU slices and let the OOM killer be loud, fast and diagnosable.

The unit of accounting becomes "how much of the pool may this workload touch", not "how much VRAM does it use".

## Write the budget down before you start anything

Every long-running workload gets a reservation and a hard cap. Batch jobs get a cap only, no reservation, because they run on leftovers. Reservations must sum to less than the pool. Pick one file, keep it in version control, and treat a change to it as a change to production.

```yaml
# /etc/gpu-box/budget.yaml — one operator, one box, hard numbers
host:
  unified_memory_gb: 128      # CPU + GPU share one coherent pool
  reserved_for_host_gb: 20    # kernel, page cache floor, ssh, build tools
  swap: off                   # swapping this pool is worse than an OOM kill

workloads:
  llm-serving:
    class: interactive
    engine: vllm
    reserve_gb: 60
    hard_cap_gb: 68
    cpu_weight: 400
    env:
      VLLM_USE_V1: "1"
      PYTORCH_CUDA_ALLOC_CONF: "expandable_segments:True"
    args: ["--gpu-memory-utilization", "0.47",
           "--max-model-len", "32768",
           "--max-num-seqs", "16"]

  image-generation:
    class: interactive
    reserve_gb: 18
    hard_cap_gb: 22
    concurrency: 1            # one diffusion graph at a time, queued by the gate

  video-encode:
    class: exclusive
    reserve_gb: 6
    hard_cap_gb: 10
    concurrency: 1
    note: "NVENC holds fixed hardware queues; never run two encodes at once"

  batch:
    class: background
    reserve_gb: 0             # leftovers, expressed as a cap and a concurrency limit
    hard_cap_gb: 24
    cpu_weight: 50
    max_concurrency: 2
```

Note what `--gpu-memory-utilization` really does here: it is a fraction of the pool, not of a discrete card, so it is your only lever for stopping vLLM from growing into the diffusion job's headroom. Set it once, from the budget file, and do not let the serving command line drift.

| Workload | Pattern in the shared pool | Failure mode if unbudgeted | Class |
|---|---|---|---|
| LLM serving (vLLM) | Long-lived weights plus a KV cache that grows per concurrent sequence | Sibling job's peak triggers CUDA OOM, or the whole box OOMs | Interactive, reserved and capped |
| Image generation | Large transient allocations per step, heavy fragmentation | Free memory looks available but cannot be satisfied; new requests fail | Interactive, concurrency 1 |
| Video encode (NVENC/NVDEC) | Modest GPU allocation, large host frame buffers, fixed hardware queues | A second encode stalls the first; bandwidth pressure slows every tenant | Exclusive, lock-guarded |
| Batch jobs | Unbounded by default; the script picks its own batch size | Runaway allocation, page cache eviction, OOM kill of an unrelated service | Background, cap only |

## Scheduling rules that survive contact with reality

Four rules cover most of it. First, two priority tiers only: interactive and background. Batch work starts when the interactive queue is empty, and it is stopped, not slowed, when the queue fills. Second, anything holding a hardware queue — encode, large diffusion batches, any fine-tune — is exclusive and guarded by a lock. Third, no job chooses its own concurrency; the gate and the unit file do. Fourth, every timeout is explicit: request timeouts at the proxy, `--max-model-len` to bound per-request KV growth, and a job timeout on every batch run.

Enforcement lives in systemd slices, not in shell scripts that happen to be polite:

```ini
# /etc/systemd/system/gpu-interactive.slice
[Slice]
MemoryHigh=88G
MemoryMax=96G
MemorySwapMax=0
CPUWeight=400
IOWeight=400
TasksMax=512
ManagedOOMPreference=avoid
```

```ini
# /etc/systemd/system/vllm.service
[Unit]
Description=vLLM OpenAI-compatible server
After=network-online.target

[Service]
Slice=gpu-interactive.slice
Environment=VLLM_USE_V1=1
Environment=PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
ExecStart=/usr/local/bin/vllm serve /models/qwen3-32b-awq \
  --host 127.0.0.1 --port 8000 \
  --gpu-memory-utilization 0.47 \
  --max-model-len 32768 \
  --max-num-seqs 16 \
  --disable-log-requests
Restart=on-failure
RestartSec=10
MemoryMax=68G
MemorySwapMax=0
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target
```

Every batch job then goes through one gate. No exceptions, because the exception is always the job that takes the box down at 3am. This is the same discipline as any scheduled pipeline — the queue owns the schedule, not the worker.

```bash
#!/usr/bin/env bash
# /usr/local/bin/gpu-run — the only supported way to start batch work
set -euo pipefail
LOCK=/run/gpu-exclusive.lock
MIN_AVAIL_GB=${MIN_AVAIL_GB:-20}

# -n: fail fast if an exclusive job holds the slot. Caller retries with backoff.
exec 9>"$LOCK"
flock -n 9 || { echo "exclusive slot busy" >&2; exit 75; }

avail_kb=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
if (( avail_kb / 1048576 < MIN_AVAIL_GB )); then
  echo "only $((avail_kb/1048576))G available, need ${MIN_AVAIL_GB}G" >&2
  exit 75
fi

exec systemd-run --quiet --wait --collect \
  --slice=gpu-batch.slice \
  --property=MemoryMax=24G \
  --property=MemorySwapMax=0 \
  --property=CPUWeight=50 \
  --property=MemoryOOMGroup=yes \
  "$@"
```

`MemoryOOMGroup=yes` matters more than it looks: it makes the kernel kill the whole batch cgroup instead of picking the largest single process, which is usually your model server.

## Contention symptoms and what they mean

- **CUDA OOM while `free` reports headroom.** Fragmentation plus a transient peak. `expandable_segments:True` on the PyTorch workloads, a hard cgroup cap on the offenders, and concurrency of 1 for diffusion.
- **First-token latency jumps by seconds after a big encode.** A large mmap'd media file evicted model weights. Prefer streaming I/O with `O_DIRECT` or drop caches deliberately at a known point rather than letting ffmpeg decide.
- **The OOM killer takes vLLM, not the runaway job.** No `OOMScoreAdjust` on the serving unit and no `MemoryOOMGroup` on the batch slice. Fix the units; do not add memory.
- **Everything gets slow when ffmpeg runs, and `CPUWeight` does nothing.** You are bandwidth-bound, not CPU-bound. Limit threads with `-threads` and `-filter_threads`, and move encodes into the exclusive window.
- **SSH stops responding during a batch run.** The host reserve is not real. Raise `reserved_for_host_gb` and stop assuming page cache is free memory.

A health check per workload closes the loop: vLLM exposes `/health`, and the watchdog should restart on repeated failures rather than on the first 503. For the interactive tier, alert on queue depth and time to first token, not on GPU utilization — utilization stays pinned at high values even when the server is healthy, so it tells you nothing. If you are still deciding how much orchestration belongs outside the box, the tradeoffs in the [automation tooling comparison](/blog/zapier-vs-n8n-vs-ai-workflow-builder/) apply here too, and [context engineering](/blog/what-is-context-engineering/) matters because `--max-model-len` is a memory decision disguised as a prompt decision.

## What to do next

1. Write the budget file this week with reservation and cap columns for every long-running workload, and make sure reservations sum below the pool.
2. Move vLLM and the diffusion service into `gpu-interactive.slice` with `MemorySwapMax=0` and `OOMScoreAdjust=-500`.
3. Install the `gpu-run` gate and route every batch script and cron entry through it, including the ones you think are harmless.
4. Add a `/health` check and a restart-on-repeated-failure watchdog for the interactive tier, plus a bounded job timeout on batch.
5. Watch `dmesg | grep -i oom` for one week and fix the units instead of the symptoms.

If you would rather not hand-write the slices, budget file and watchdog, the DGX Spark LLM Deployment Kit ($49, one-time) packages systemd units, memory planning, health checks, a watchdog and a troubleshooting playbook for running vLLM models on an NVIDIA GB10.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=article&utm_campaign=one-gpu-box-multiple-workloads) — **$49**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
