---
title: "The Complete Guide to Self-Hosting AI Models on DGX Spark — From Zero to Production"
description: "A comprehensive guide to running production LLMs on NVIDIA DGX Spark. Covers vLLM deployment, systemd setup, memory management, and real-world benchmarks."
date: 2026-08-03
slug: self-hosting-llm-dgx-spark-complete-guide
tags: [ai, llm, self-hosting, dgx, vllm]
---

# The Complete Guide to Self-Hosting AI Models on DGX Spark

## Why Self-Hosting AI Matters in 2026

Every month, AI models get better but more expensive. The cost trajectory is unsustainable for anyone running AI in production at scale. Self-hosting offers three advantages that cloud APIs simply cannot match:

1. **Cost predictability** — You pay for electricity, not per-token pricing
2. **Data privacy** — Your data never leaves your infrastructure
3. **No rate limits** — Your models serve your demand, not a shared pool

The DGX Spark (NVIDIA GB10) is the perfect entry point. At ~$1000, it offers enough VRAM and compute to run production models while staying within budget.

## Hardware Requirements

### What the DGX Spark Offers

| Specification | Value |
|---------------|-------|
| GPU | NVIDIA GB10 (unified memory) |
| Unified Memory | 96GB (GPU + CPU share) |
| Storage | NVMe SSD (user-supplied) |
| Form Factor | Compact desktop |
| Power | ~150W under load |

The 96GB unified memory is the killer feature. You can run models that simply won't fit on consumer GPUs (24GB VRAM) or even data center cards (80GB HBM).

### What Models Fit?

| Model | Parameters | Quantization | Memory Required |
|-------|-----------|--------------|-----------------|
| Qwen 2.5 72B | 72B | Q4_K_M | ~48GB |
| Llama 3.1 70B | 70B | Q4_K_M | ~46GB |
| Mixtral 8x22B | 56B | Q4_K_M | ~38GB |
| Qwen 2.5 32B | 32B | FP16 | ~64GB |
| Phi-4 | 14B | FP16 | ~28GB |

The headroom matters. With 96GB and a 72B model at ~48GB, you have 48GB left for system overhead, multiple models, and concurrency.

## Step-by-Step vLLM Deployment

### 1. Install Docker and NVIDIA Container Toolkit

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sed 's/deb https:///deb [signed-by=\/usr\/share\/keyrings\/nvidia-container-toolkit-keyring.gpg] https:\/\//g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 2. Deploy vLLM with Docker

```bash
docker run -d \
  --name vllm-server \
  --gpus all \
  -p 8000:8000 \
  -v /data/models:/models \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-72B-Instruct \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --tensor-parallel-size 1
```

### 3. Create a Systemd Service (Recommended)

The Docker command works for testing, but for production, use a systemd service:

```ini
# /etc/systemd/system/vllm.service
[Unit]
Description=VLLM AI Inference Server
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=wayne
ExecStart=/usr/bin/docker run -d \
  --name vllm-server \
  --gpus all \
  -p 8000:8000 \
  -v /data/models:/models \
  vllm/vllm-openai:latest \
  --model /models/Qwen2.5-72B-Instruct \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --tensor-parallel-size 1
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable vllm
sudo systemctl start vllm
sudo systemctl status vllm
```

### 4. Verify It's Running

```bash
# Check logs
sudo journalctl -u vllm -f

# Test the API endpoint
curl http://localhost:8000/v1/models

# Test a chat completion
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-72B-Instruct",
    "messages": [{"role": "user", "content": "What is the capital of France?"}],
    "max_tokens": 50
  }'
```

## Memory Management Tuning

The key to running models on DGX Spark is managing the 96GB shared memory pool. Here are the parameters that matter:

### gpu-memory-utilization

Controls what percentage of available VRAM is used for model weights.

| Value | Model Size (Q4_K_M) | Safety Margin |
|-------|---------------------|---------------|
| 0.85 | ~44GB | Comfortable |
| 0.90 | ~48GB | Recommended |
| 0.95 | ~50GB | Risky (may OOM) |

**Recommendation:** Start at 0.85. If stable for a week, bump to 0.90. Never go above 0.95 unless you have a specific reason.

### max-model-len

Controls the maximum context window. Larger = more useful but uses more memory.

```bash
# For 72B model at Q4_K_M:
--max-model-len 32768  # ~48GB for weights, ~20GB for KV cache

# If you need longer contexts:
--max-model-len 131072  # ~48GB for weights, ~60GB for KV cache (close to limit)
```

### Enable Swapping

vLLM supports swapping KV cache to CPU memory:

```bash
--swap-space 16  # 16GB CPU RAM as swap
```

This prevents OOM errors but may slow down generation when swapping occurs.

## Running Multiple Models

With 96GB, you can run two models simultaneously:

```bash
# Primary model (72B)
docker run -d --name vllm-72b --gpus all -p 8000:8000 vllm/vllm-openai:latest \
  --model Qwen2.5-72B-Instruct --max-model-len 32768 --gpu-memory-utilization 0.45

# Secondary model (7B)
docker run -d --name vllm-7b --gpus all -p 8001:8000 vllm/vllm-openai:latest \
  --model Qwen2.5-7B-Instruct --max-model-len 8192 --gpu-memory-utilization 0.10
```

Use a load balancer (nginx or Traefik) to route requests to the appropriate model based on task complexity.

## Benchmark Results

### Inference Speed

| Model | Tokens/Second | Avg Latency | GPU Util |
|-------|--------------|-------------|----------|
| Qwen2.5-72B Q4_K_M | 12-15 tok/s | 80ms/tok | 95% |
| Llama 3.1-70B Q4_K_M | 10-13 tok/s | 90ms/tok | 97% |
| Qwen2.5-32B FP16 | 20-25 tok/s | 45ms/tok | 80% |
| Phi-4 FP16 | 35-45 tok/s | 25ms/tok | 60% |

### Cost Comparison

| Provider | 1M input tokens | 1M output tokens | Monthly (100M input, 10M output) |
|----------|-----------------|------------------|----------------------------------|
| OpenAI GPT-4o | $2.50 | $10.00 | ~$350 |
| Anthropic Claude | $3.00 | $15.00 | ~$450 |
| Self-hosted (DGX Spark) | $0 | $0 | ~$30 (electricity) |

The payback period for DGX Spark is approximately 2-3 months of moderate API usage.

## Production Considerations

### Monitoring

```bash
# GPU usage
nvidia-smi

# GPU memory
nvidia-smi --query-gpu=memory.used,memory.total --format=csv

# Process list
htop | grep vllm
```

### Backup and Recovery

1. **Model weights:** Backup to external storage or S3
2. **Systemd config:** Git version control (already done with our DGX Spark kit)
3. **Docker images:** Pull on rebuild or save as tarball

### Security

```bash
# Restrict vLLM to localhost only
--host 127.0.0.1

# Or use nginx as reverse proxy with auth
# /etc/nginx/sites-available/vllm
server {
    listen 443 ssl;
    server_name your-domain.com;

    location /v1/ {
        proxy_pass http://localhost:8000;
        auth_request /auth;
    }

    location /auth {
        internal;
        proxy_pass http://auth-server/check;
    }
}
```

## Common Issues and Solutions

### Issue: OOM (Out of Memory)

**Cause:** Model too large, or context window too long.
**Solution:** Reduce `--max-model-len` or use more aggressive quantization (Q4 instead of Q8).

### Issue: Slow Inference

**Cause:** Thermal throttling, or swapping.
**Solution:** Ensure adequate cooling. Check `nvidia-smi` for temperature. Reduce `--gpu-memory-utilization` if swapping.

### Issue: Model Won't Load

**Cause:** Incorrect model path or format.
**Solution:** Verify model files exist in the mounted volume. Use the correct model identifier (e.g., `Qwen/Qwen2.5-72B-Instruct` not `qwen-72b`).

## Conclusion

Self-hosting on DGX Spark is mature enough for production use in 2026. The combination of 96GB unified memory, vLLM's optimization, and a single $1000 investment makes it one of the most cost-effective ways to run AI at scale.

The key takeaways:
1. Start with Q4_K_M quantization for the best balance
2. Set gpu-memory-utilization to 0.85-0.90
3. Use systemd for reliable operation
4. Monitor memory usage closely
5. Consider running two models simultaneously for different task complexity

For a complete setup guide with deploy scripts and systemd configs, check out our [DGX Spark Kit](/blog/dgx-spark-kit/).

---

**Related:**
- [Cowork Pro](/blog/cowork-pro/) — Orchestrate AI agents that call your local model
- [Self-Hosted AI for Solopreneurs](/blog/self-hosted-ai-solopreneurs/) — Full infrastructure guide