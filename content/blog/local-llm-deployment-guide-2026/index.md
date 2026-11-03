---
title: "Local LLM Deployment (2026): vLLM vs Ollama vs llama.cpp, VRAM Sizing & Production Stack"
seo_title: "Local LLM Deployment (2026): vLLM vs Ollama vs llama.cpp Guide"
description: "Complete 2026 field guide to local LLM deployment: hardware VRAM sizing (7B–70B), vLLM vs Ollama vs llama.cpp throughput benchmarks, Docker Compose, systemd health checks, and watchdog setup."
date: 2026-08-03
lastmod: 2026-11-03
slug: local-llm-deployment-guide-2026
tags: [llm, deployment, vllm, self-hosting, gpu, qwen, local-llm]
faq:
  - q: "What is the best runtime for local LLM deployment in 2026: vLLM, Ollama, or llama.cpp?"
    a: "Use vLLM for production multi-agent pipelines and shared team APIs where continuous batching and high concurrent throughput matter. Use Ollama for single-user interactive prototyping, and llama.cpp for CPU+GPU hybrid inference or Apple Silicon/heterogeneous hardware."
  - q: "How much VRAM do I need for local LLM deployment?"
    a: "A 7B–9B model in Q4/FP8 needs 6–10 GB VRAM; a 14B model needs 10–16 GB; a 32B–35B model needs 20–24 GB in 4-bit AWQ/GGUF (or 36 GB in FP8); and a 70B–72B model requires 42–48 GB for weights plus 12–20 GB for a 32K KV cache, fitting comfortably on a 128 GB unified-memory box like the NVIDIA DGX Spark (GB10)."
  - q: "Why isn't systemd Restart=always enough for a local LLM server?"
    a: "Restart=always only triggers when the OS process exits. When a local LLM server wedges due to KV-cache exhaustion or a CUDA lockup, the port stays open and /health still returns 200. You need a generation watchdog probe that sends a short completion request and classifies exit codes before draining and restarting."
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "HowTo",
      "name": "How to Deploy a Production Local LLM Server with vLLM, Docker Compose, and Systemd Watchdog",
      "description": "Step-by-step instructions to size VRAM, select a quantization format, deploy an OpenAI-compatible local LLM server using vLLM or Ollama, and attach a readiness + generation watchdog probe.",
      "step": [
        {
          "@type": "HowToStep",
          "position": 1,
          "name": "Calculate Hardware VRAM Budget and Reserve OS Headroom",
          "text": "Run free -g and nvidia-smi on an idle host, reserve 12–16 GB for the Linux kernel and page cache on unified memory systems, and size your quantized model weights plus KV cache to 85–90% of the remaining memory."
        },
        {
          "@type": "HowToStep",
          "position": 2,
          "name": "Choose the Serving Runtime (vLLM vs Ollama vs llama.cpp)",
          "text": "Select vLLM for concurrent multi-agent API serving, Ollama for local single-stream development, or llama.cpp for GGUF cross-platform execution."
        },
        {
          "@type": "HowToStep",
          "position": 3,
          "name": "Launch the OpenAI-Compatible Inference Container",
          "text": "Deploy vLLM via Docker Compose or a foreground systemd unit pinned to NVMe storage (HF_HOME=/mnt/nvme/hf) with --gpu-memory-utilization 0.85 and --max-model-len 32768."
        },
        {
          "@type": "HowToStep",
          "position": 4,
          "name": "Attach a Generation Health Check and Drain-First Watchdog",
          "text": "Schedule a 60-second systemd timer that verifies actual token generation at temperature 0, classifies failures by exit code (2=unreachable, 3=corrupt output, 4=slow TTFT), and drains active requests before restarting."
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the best runtime for local LLM deployment in 2026: vLLM, Ollama, or llama.cpp?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Use vLLM for production multi-agent pipelines and shared team APIs where continuous batching and high concurrent throughput matter. Use Ollama for single-user interactive prototyping, and llama.cpp for CPU+GPU hybrid inference or heterogeneous hardware."
          }
        },
        {
          "@type": "Question",
          "name": "How much VRAM do I need for local LLM deployment?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A 7B–9B model in Q4/FP8 needs 6–10 GB VRAM; a 14B model needs 10–16 GB; a 32B–35B model needs 20–24 GB in 4-bit AWQ/GGUF; and a 70B–72B model requires 42–48 GB for weights plus 12–20 GB for a 32K KV cache."
          }
        }
      ]
    }
  ]
}
</script>

**Local LLM deployment** in 2026 is no longer an experimental weekend project — it is an engineering decision driven by workload economics, data sovereignty, and multi-agent throughput. When you run autonomous agents, automated content pipelines, or internal code/document analysis around the clock, cloud API token meters and rate limits quickly become your largest operational bottleneck.

This guide is our complete production reference for **local LLM deployment**: how to calculate real VRAM budgets across 7B to 72B models, how `vLLM`, `Ollama`, and `llama.cpp` compare under real concurrent load, and the exact `docker compose`, `systemd`, pre-flight checklist, and watchdog scripts we run on our own hardware (including our [self-hosting AI models on NVIDIA DGX Spark guide](/blog/self-hosting-llm-dgx-spark-complete-guide/) and [DGX Spark local LLM deployment walkthrough](/blog/local-llm-deployment-dgx-spark-guide-2026/)).

---

## Why Local LLM Deployment Beats Cloud APIs for Sustained Workloads

In 2026 the API-versus-local question comes down to the shape of your traffic. **Local LLM deployment** wins decisively when any of these four conditions hold:

1. **Data privacy and compliance are non-negotiable** — customer PII, legal contracts, financial records, or proprietary repositories never leave your LAN or Tailscale mesh.
2. **Your workload is sustained rather than bursty** — continuous pipelines and background jobs turn variable per-token bills ($350–$600+/month) into a flat ~$30/month electricity cost.
3. **Predictable latency and zero rate limits** — no 429 throttling during batch runs, no silent model deprecations, and full control over quantization and context length.
4. **Multi-agent orchestration** — agent frameworks issue dozens of verification, routing, and extraction calls per task; serving those locally makes iterative agent loops practically free.

---

## Chapter 1: Hardware & VRAM Sizing Table (7B to 72B Models)

The single most important number in **local LLM deployment** is **available VRAM (or unified memory)** after accounting for model weights, the KV cache (`--max-model-len`), and OS headroom:

| Model Class | FP16 / BF16 VRAM | FP8 VRAM (Hopper / Blackwell) | 4-Bit VRAM (AWQ / GPTQ / GGUF Q4_K_M) | + 32K Context KV Cache | Recommended Hardware Tier | Best Workload Fit |
|---|---|---|---|---|---|---|
| **7B – 9B** (Qwen 2.5/3 7B, Llama 3.1 8B) | 15–18 GB | 8–10 GB | 5–6.5 GB | +2–4 GB | 12GB–16GB Consumer GPU (RTX 4070 Ti / 4080) | Fast classification, routing, JSON extraction |
| **14B** (Phi-4 14B, Qwen 2.5 14B) | 28–30 GB | 15–16 GB | 8.5–10 GB | +4–6 GB | 16GB–24GB GPU (RTX 4090 / 5080) | General coding, bilingual summarization |
| **30B – 35B** (Qwen 3 / 2.5 32B, DeepSeek-R1 32B) | 64–68 GB | 34–36 GB | 18–21 GB | +8–12 GB | 24GB–32GB GPU (tight Q4) or **64GB–128GB Unified Memory** | **Sweet spot**: tool calling, agentic coding, complex synthesis |
| **70B – 72B** (Qwen 2.5/3 72B, Llama 3.3 70B) | 140–145 GB | 72–76 GB | 42–48 GB | +16–22 GB | **128 GB NVIDIA DGX Spark (GB10)**, Mac Studio, or 2×24GB/48GB GPUs | Frontier-grade local reasoning, long-context multi-agent pipelines |

**Critical unified-memory rule:** On unified-memory architectures like the NVIDIA GB10 (DGX Spark) or Apple Silicon, CPU and GPU share one physical RAM pool. Always leave **12–16 GB of system RAM** untouched for the Linux kernel, Docker runtime, and disk page cache, or page-cache thrashing will cut token generation speed in half.

---

## Chapter 2: Runtime Comparison — vLLM vs Ollama vs llama.cpp

You do not need one runtime for everything; you need the runtime whose scheduling architecture matches your concurrency profile. Here is an indicative 2026 comparison across **vLLM**, **Ollama**, and **llama.cpp**. The speed rows are typical ranges, not a controlled benchmark; for numbers we actually measured on our DGX Spark (Qwen3.8-27B NVFP4 on SGLang: ~29 tok/s single-stream median, ~92 tok/s aggregate at concurrency 4, 24 prompts, 2026-11-03), see the [self-hosting guide](/blog/self-hosting-llm-dgx-spark-complete-guide/):

| Metric / Capability | **vLLM (Production API Standard)** | **Ollama (Rapid Prototyping)** | **llama.cpp (`llama-server`)** |
|---|---|---|---|
| **Scheduling Architecture** | Continuous batching + PagedAttention + prefix caching | Go wrapper over `llama.cpp` with dynamic model loading | Native C/C++ GGML/GGUF server with parallel slots (`-np`) |
| **Single-User Speed (32B Q4/FP8 on GB10, indicative)** | **22–28 tok/s** (TTFT ~38ms) | **20–25 tok/s** (TTFT ~45ms) | **21–26 tok/s** (TTFT ~40ms) |
| **8-Concurrent-Request Throughput (32B, indicative)** | **115–145 tok/s total** (scales cleanly) | **24–32 tok/s total** (serializes/queues heavily) | **48–65 tok/s total** (depends on `-np` KV split) |
| **VRAM Allocation Strategy** | Pre-allocates fixed pool (`--gpu-memory-utilization 0.85`) | Loads on demand, unloads after `OLLAMA_KEEP_ALIVE` timer | Allocates exact GGUF layers (`-ngl`) + fixed context buffer |
| **Supported Quantization Formats** | FP8, AWQ, GPTQ, NVFP4, BitsAndBytes, GGUF | GGUF (`Q4_K_M`, `Q5_K_M`, `Q8_0`) | GGUF (`Q2_K` through `Q8_0`, IQ4_XS) |
| **Schema / Guided Decoding** | **First-class** (`guided_json`, `response_format` FSM) | Basic JSON mode / tool calls | Grammar-based GBNF + JSON schema |
| **Ideal Use Case** | **Multi-agent systems, team APIs, 24/7 production services** | **Local CLI testing, IDE assistants, quick model swaps** | **Edge hardware, CPU+GPU split offloading, minimal footprint** |

### The Pragmatic Dual-Runtime Pattern
In our production environment, we run **vLLM on port `8000`** for our always-on production model (called by agents and web services) and **Ollama on port `11434`** for ad-hoc testing of newly released checkpoints before promoting them to production.

---

## Chapter 3: Copy-Paste Production Setup (`docker-compose.yml` + `systemd`)

### Option A: Docker Compose Stack (`vLLM` + `Open WebUI` / Local API)

Save this as `docker-compose.yml` for a reproducible **local LLM deployment** backed by local NVMe storage:

```yaml
services:
  vllm-primary:
    image: vllm/vllm-openai:latest
    container_name: vllm-primary
    restart: unless-stopped
    ipc: host
    shm_size: "16g"
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      - HF_HOME=/mnt/nvme/hf
      - VLLM_API_KEY=${VLLM_API_KEY:-local-prod-key}
    volumes:
      - /mnt/nvme/hf:/mnt/nvme/hf
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    command: >
      --model Qwen/Qwen2.5-32B-Instruct-AWQ
      --served-model-name local-primary
      --dtype auto
      --max-model-len 32768
      --gpu-memory-utilization 0.85
      --enable-prefix-caching
      --port 8000
      --host 0.0.0.0
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8000/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 180s
```

### Option B: Foreground Docker-in-Systemd Unit (Recommended for 24/7 Servers)

Running a foreground container inside `systemd` gives you the prebuilt CUDA/vLLM container image **plus** native `journald` logging, boot ordering, and controlled restart backoff (`StartLimitBurst`):

```ini
# /etc/systemd/system/vllm.service
[Unit]
Description=vLLM OpenAI-Compatible Local LLM Server
After=network-online.target docker.service
Wants=network-online.target docker.service
StartLimitIntervalSec=300
StartLimitBurst=3

[Service]
Type=simple
Restart=on-failure
RestartSec=15
TimeoutStartSec=1800
Environment=HF_HOME=/mnt/nvme/hf
Environment=VLLM_API_KEY=local-prod-key
ExecStartPre=-/usr/bin/docker rm -f vllm
ExecStart=/usr/bin/docker run --rm --name vllm \
  --gpus all --ipc=host --shm-size=16g \
  --env HF_HOME=/mnt/nvme/hf \
  -v /mnt/nvme/hf:/mnt/nvme/hf \
  -p 127.0.0.1:8000:8000 \
  vllm/vllm-openai:latest \
  --model /mnt/nvme/hf/models/Qwen2.5-32B-Instruct-AWQ \
  --served-model-name local \
  --dtype auto \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.85 \
  --api-key "${VLLM_API_KEY}" \
  --port 8000 --host 0.0.0.0
ExecStop=/usr/bin/docker stop vllm

[Install]
WantedBy=multi-user.target
```

---

## Chapter 4: Pre-Flight Checklist & Watchdog Health Checks (Merged Operational Guide)

*Consolidated from our GB10 Pre-Flight Checklist and Local LLM Watchdog operational runbooks.*

A local inference server rarely dies cleanly. Often the process stays up, port `8000` stays open, and `/health` keeps returning `200 OK` while the inference engine is wedged behind a fragmented KV cache. Relying on `Restart=always` alone will leave your server in a zombie state for days.

### 1. The 5-Point Pre-Flight Checklist (Especially on Unified-Memory / GB10 Boxes)

1. **Pick quantization before sizing context**: On Hopper/Blackwell GPUs (including GB10), `FP8` gives near-BF16 accuracy at half the memory; `AWQ` / `NVFP4` / `GGUF Q4_K_M` quarters the weight footprint.
2. **Calculate `--gpu-memory-utilization` against post-reserve RAM**: Run `free -g` on an idle box, subtract 12–16 GB for OS + container overhead, and allocate 80–88% of the remainder.
3. **Pin `HF_HOME` to local NVMe**: Never load 40GB+ weights over NFS/SMB. Measure both **cold start** (disk read + CUDA graph capture) and **warm start** (page-cached) times and record them in your unit file.
4. **Enforce client-side timeouts and fallback routing**: Every client calling `http://127.0.0.1:8000/v1` should set a 20-second connect/first-token timeout and fail over cleanly if the local box is restarting.
5. **Test readiness with a real generation probe, not TCP liveness**: Verify that the model actually decodes tokens at `temperature: 0`.

### 2. Exit-Code-Classified Generation Watchdog (`healthcheck.py`)

This lightweight Python probe sends a 16-token streaming request with a cache-busting UUID marker, measures Time-To-First-Token (`TTFT`), and classifies the state via exit code so your watchdog only restarts when a restart will actually fix the problem:

- **Exit `0`**: Healthy — token generated within latency budget.
- **Exit `2`**: Unreachable / hung socket — **safe for watchdog to drain and restart**.
- **Exit `3`**: Corrupt/wrong output — **alert human, do not restart-loop**.
- **Exit `4`**: Correct answer but slow `TTFT` (queue pressure / thermal throttling) — **log warning, do not clear KV cache with a restart**.

```python
#!/usr/bin/env python3
# /opt/llm/healthcheck.py
import json, os, time, urllib.request, uuid

BASE = os.environ.get("LLM_BASE", "http://127.0.0.1:8000")
MODEL = os.environ.get("LLM_MODEL", "local")
API_KEY = os.environ.get("VLLM_API_KEY", "local-prod-key")
BUDGET_S = float(os.environ.get("HEALTH_BUDGET_S", "20"))
MARKER = "READY-" + uuid.uuid4().hex[:6]

def probe():
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": f"Reply with exactly this token: {MARKER}"}],
        "temperature": 0,
        "max_tokens": 16,
        "stream": True,
    }
    req = urllib.request.Request(
        BASE + "/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
    )
    start, ttft, chunks = time.monotonic(), None, []
    with urllib.request.urlopen(req, timeout=BUDGET_S) as resp:
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
    return ttft or (time.monotonic() - start), time.monotonic() - start, "".join(chunks)

if __name__ == "__main__":
    try:
        ttft, total, answer = probe()
    except Exception as exc:
        print(f"unreachable: {exc}")
        raise SystemExit(2)      # Dead socket/hung engine -> restart
    if MARKER not in answer:
        print(f"wrong answer: {answer!r}")
        raise SystemExit(3)      # Corrupt weights/tokenizer -> page human
    print(f"ok ttft={ttft:.2f}s total={total:.2f}s")
    if ttft > BUDGET_S / 2:
        raise SystemExit(4)      # Slow under load -> alert only, do not restart
    raise SystemExit(0)
```

Pair `/opt/llm/healthcheck.py` with a 60-second systemd timer (`SuccessExitStatus=0 4`) and a drain wrapper that checks `vllm:num_requests_running` on `/metrics` before executing `systemctl restart vllm.service`:

```ini
# /etc/systemd/system/llm-healthcheck.service
[Unit]
Description=Local LLM generation readiness probe
After=vllm.service

[Service]
Type=oneshot
Environment=LLM_MODEL=local
Environment=LLM_BASE=http://127.0.0.1:8000
Environment=HEALTH_BUDGET_S=20
ExecStart=/opt/llm/healthcheck.py
SuccessExitStatus=0 4
OnFailure=llm-drain-restart.service
```

---

## Chapter 5: Production Gotchas We've Hit First-Hand

1. **KV-cache memory balloons at 64K–128K context** — A 32K context window handles 99% of agent and coding tasks while leaving double the VRAM for concurrent batching.
2. **Setting `--gpu-memory-utilization` above `0.92`** — Looks great on a single prompt, then crashes under a 4-agent parallel burst. Keep it at `0.85–0.88`.
3. **Silent CPU fallback in Ollama** — If a model exceeds VRAM by even 1 GB, Ollama spills layers to system RAM and throughput drops from 40 tok/s to 4 tok/s. Always verify `ollama ps` (100% GPU) or `nvidia-smi` after startup.
4. **Prompt cache misses from dynamic timestamps** — Put static instructions first and dynamic timestamps/UUIDs at the end of the user message so vLLM's `--enable-prefix-caching` hits >80% cache reuse.

---

## The Complete Local LLM Deployment Checklist

- [ ] Hardware VRAM budget computed (`weights + 32K KV cache + 16 GB OS reserve`)
- [ ] Runtime matched to workload (`vLLM` for concurrent APIs/agents, `Ollama` for local prototyping)
- [ ] Quantization (`FP8`, `AWQ`, or `GGUF Q4_K_M`) tested against real structured JSON prompts
- [ ] Model cache pinned to local NVMe (`HF_HOME=/mnt/nvme/hf`)
- [ ] Foreground Docker container managed by `systemd` with `StartLimitBurst=3`
- [ ] Generation health-check probe (`healthcheck.py`) running on a 60s systemd timer
- [ ] Client-side timeout (20s) + fallback API route configured

If you want all of these systemd units, dual-model `vLLM` configs, memory-planning worksheets, and watchdog scripts pre-built and tested for NVIDIA GB10 / Linux servers, grab our **[DGX Spark LLM Deployment Kit ($79)](/blog/dgx-spark-kit/)** ([direct Gumroad download](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=seo&utm_campaign=local-llm-deployment-guide-2026)).

---

**Related Guides:**
- [Self-Hosting AI Models on DGX Spark — Complete Production Guide](/blog/self-hosting-llm-dgx-spark-complete-guide/) — Hardware sizing, dual-model serving, and benchmarks
- [Local LLM Deployment on DGX Spark (2026 Starter Guide)](/blog/local-llm-deployment-dgx-spark-guide-2026/) — Quick-start architecture overview
- [Local LLMs in 2026: Workload Benchmarks & Cloud Break-Even Math](/blog/local-llms-2026-running-own-hardware-bppdqp/) — Model matrix across Qwen, Llama, and DeepSeek
- [Self-Hosted AI in 2026: The Complete Stack for Solopreneurs](/blog/self-hosted-ai-solopreneurs/) — TCO economics, Open WebUI + n8n + backup routines
- [DGX Spark Deployment Kit Review](/blog/dgx-spark-kit/) — Pre-packaged systemd units, health checks, and tuning scripts
- [AI Developer Stack Bundle](/blog/ai-dev-stack/) — Complete AI development and deployment toolchain
