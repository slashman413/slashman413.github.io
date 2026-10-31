---
title: "Five Checks Before You Pick a Model for a Unified-Memory Box"
description: "Five pre-flight checks for choosing a model on a GB10-class box: weight fit with headroom, co-tenants, load time, real context size, and behaviour at the limit."
date: "2026-10-31T08:00:00+08:00"
draft: false
slug: "model-choice-unified-memory-checks"
author: "Wayne Chang"
tags: ["llm", "vllm", "dgx-spark", "quantization", "memory-planning"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Five Checks Before You Pick a Model for a Unified-Memory Box"
faq:
  - q: "Can I just run the largest 4-bit model that fits in 128 GB?"
    a: "Fitting the weights is only the first of five checks. KV cache, CUDA and framework overhead, co-tenant services and load time all draw from the same pool, so a model sized to the last gigabyte will fail under real concurrency."
  - q: "Does 4-bit quantisation hurt output quality?"
    a: "It depends on the model and the task, and it is not predictable from the format name alone. If the model fits in fp8, prefer fp8; if you need int4 to fit, test it on your own prompts before committing."
  - q: "Why does the model load slowly the first time and faster later?"
    a: "The first load reads safetensors shards from disk; later loads may hit page cache. On a unified-memory box that cache shares the same pool as your KV blocks, so a warm start is not something you can rely on for scheduling."
---

A GB10-class box sells on one number: 128 GB of coherent memory shared by the CPU and the GPU. That number is real, and it is not the amount you get to spend on model weights. The model that fits on paper and the model that still answers requests after an hour of long prompts are often two different models.

## 1. Does the quantised weight fit with headroom?

Start with arithmetic, not benchmarks. Weight footprint is roughly parameter count multiplied by bytes per parameter, plus packing overhead for the chosen format.

| Weight format | Bytes/param (approx.) | vLLM path | Trade-off |
|---|---|---|---|
| bf16 / fp16 | 2 | native | reference quality, largest footprint |
| fp8 w8a8 | ~1 | native on Blackwell-class parts | half the footprint, small quality risk |
| int4 AWQ / GPTQ | ~0.5-0.6 including group scales | quantisation kernels | fits much larger models; quality loss is task-dependent |
| GGUF k-quants | ~0.5-0.7 | not the main vLLM path | fine under llama.cpp, awkward here |

Weights are the easy line item. The budget is where plans break:

- **KV cache.** Scales with context length times concurrent sequences. Computed properly in check 4.
- **Activation and workspace buffers.** Grow with batch size and tensor-parallel width.
- **CUDA context and framework overhead.** Multiple GiB consumed before your model does any work.
- **Co-tenants.** Anything else resident in the pool (check 2).
- **OS, page cache and logs.** Small alone, not small together.

A useful policy: if the plan only closes at 90%+ of the pool, it does not close. Leave a few GiB unallocated so one long request, one log rotation or one stray container does not become an outage. Note that vLLM's `--gpu-memory-utilization` is a fraction of *total* device memory, not of free memory, and it decides how much remains for KV blocks after weights load. Set it from your ledger, not from the default.

## 2. What else runs on the same memory?

On a discrete GPU box, host RAM and device memory are separate accounts. Here they are one account, which means every process on the machine is a potential tenant of your KV cache.

Things that quietly claim the pool: a second model for embeddings or reranking, a Jupyter kernel holding a tokenised dataset, Docker with a few containers, a monitoring agent, and — if the machine is not headless — the desktop session itself. Two services each configured with `--gpu-memory-utilization 0.9` will not share politely. One of them loses at startup, or, worse, both start and then thrash.

Write a memory ledger before you download any weights. Model A gets X GiB, model B gets Y GiB, the rest is reserved. Keep it in version control next to the systemd units, and update it whenever a service is added. The design notes from [a week of watching a home DGX server](/blog/watching-a-home-dgx-llm-server/) are worth reading for how much of that week was spent on exactly this accounting rather than on prompts.

## 3. What is the load time?

Cold and warm load are different operations. A cold start reads tens of GiB of safetensors shards off disk. A warm start may read from page cache — but on unified memory, page cache competes with the KV pool, so "it was fast the second time" is not a guarantee you can schedule around.

Load time is not a curiosity. It decides your restart policy, your maintenance windows, and whether "active" in `systemctl status` means anything. Measure it before you pick the model:

```bash
MODEL=/models/local-model-awq
start=$(date +%s)
vllm serve "$MODEL" --max-model-len 32768 --gpu-memory-utilization 0.80 &
until curl -sf http://127.0.0.1:8000/health >/dev/null; do sleep 2; done
echo "ready in $(( $(date +%s) - start ))s"
```

Run it twice: once after dropping page cache, once immediately after. The gap tells you how much you can rely on caching. Then wire the result into the unit, because `Type=simple` marks a unit started the moment the process is spawned — it says nothing about readiness:

```ini
[Unit]
Description=vLLM model server
StartLimitIntervalSec=1800
StartLimitBurst=3

[Service]
Type=exec
ExecStart=/opt/venv/bin/vllm serve /models/local-model-awq \
  --max-model-len 32768 \
  --max-num-seqs 4 \
  --gpu-memory-utilization 0.80 \
  --swap-space 0
ExecStartPost=/bin/sh -c 'until curl -sf http://127.0.0.1:8000/health; do sleep 2; done'
TimeoutStartSec=900
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

If load time is long enough to be annoying, the answer is a resident service, not a scale-to-zero pattern. Restarting a large model per request path is a design mistake on this class of hardware.

## 4. What context size do you actually need?

The common failure is copying the model's advertised maximum into `--max-model-len`. KV cache grows linearly with context **and** with concurrent sequences, so the number you set is multiplied by `--max-num-seqs` whether or not you plan to reach it.

Compute it from the model config instead of guessing:

```python
import json

cfg = json.load(open("config.json"))
layers = cfg["num_hidden_layers"]
heads  = cfg["num_attention_heads"]
kvh    = cfg.get("num_key_value_heads", heads)      # GQA
hd     = cfg.get("head_dim", cfg["hidden_size"] // heads)
elem   = 2                                          # bf16 KV; 1 for --kv-cache-dtype fp8
ctx    = 32768
seqs   = 4

per_token = 2 * layers * kvh * hd * elem            # K and V
print(f"KV per token:        {per_token / 1024:.0f} KiB")
print(f"KV, {ctx} tok x 1:     {per_token * ctx / 2**30:.1f} GiB")
print(f"KV, {ctx} tok x {seqs}:     {per_token * ctx * seqs / 2**30:.1f} GiB")
```

Now compare against your actual prompt distribution: system prompt, tool schemas, retrieved chunks, conversation history. Set `--max-model-len` to something close to your long-tail prompt size plus margin, not to the maximum the model was trained on. Long-context tricks such as RoPE scaling change behaviour, and a bigger window you never use is just memory you handed to nobody. The distinction between "context I have" and "context I engineered" is covered in [what is context engineering](/blog/what-is-context-engineering/).

## 5. What happens at the limit?

Every box has an edge. The question is whether you have seen yours. When requests exceed the KV blocks available, vLLM preempts sequences — recomputing or swapping them out. On a unified-memory machine, swap is not the safety net it is elsewhere: `--swap-space` moves KV to host memory, and host memory is the same pool. You are not borrowing from a bigger account, you are rearranging the same one. Many operators set it to zero and let recompute handle pressure.

Past that edge, the failure modes get ugly and non-obvious: the kernel OOM killer picks a victim that is frequently not the model, the queue grows until clients time out, latency falls off a cliff without any request failing cleanly.

So instrument the edge deliberately:

- Expose `/metrics` and watch `vllm:gpu_cache_usage_perc` and `vllm:num_requests_waiting`. Cache usage pinned near the top with a rising queue is your warning, minutes before users notice.
- Do not treat `/health` returning 200 as readiness for load. It means the process is up. Gate traffic on a readiness check that also looks at cache headroom.
- Put admission control in front: `--max-num-seqs` bounds concurrency inside the engine, but the proxy should also cap the queue rather than accepting unlimited requests.
- Give the watchdog a backoff. Rapid restarts of a 40 GiB model hammer the disk and make cold starts worse.

Then break it on purpose: send two maximum-length requests at once and watch what dies first — the process, the queue, or the client. That test is worth more than any spec sheet. If this box is one layer of a wider stack, the layering advice in [the automation framework guide](/blog/ultimate-ai-automation-guide-2026/) keeps model serving from absorbing responsibilities that belong elsewhere.

## What to do next

1. **Write the ledger before you download.** One row per memory line item from check 1, one column per service. If the total exceeds roughly 90% of the pool, drop a model or shrink the context — do not hope.
2. **Run the KV script against the real `config.json`.** Set `--max-model-len` and `--max-num-seqs` from your prompt distribution, then divide the result by your headroom and see if it still fits.
3. **Time a cold load and a warm load.** Put `TimeoutStartSec` comfortably above the cold number, use `Type=exec` with a readiness `ExecStartPost`, and cap restarts with `StartLimitBurst`.
4. **Break it once, on purpose.** Two concurrent max-length requests, `/metrics` open in another terminal. Write down which component failed and what the watchdog did.
5. **Decide whether you want to assemble this yourself.** The systemd units, memory planning worksheet, health checks, watchdog and troubleshooting playbook I use are packaged as the [DGX Spark LLM Deployment Kit](https://slashmaster6.gumroad.com/l/bppdqp) — $79 one-time, aimed at running vLLM models on an NVIDIA GB10 (DGX Spark).

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=model-choice-unified-memory-checks) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
