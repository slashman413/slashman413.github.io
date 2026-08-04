---
title: "在 DGX Spark 上自架 AI 模型完整指南——从零基础到生产环境"
description: "在 NVIDIA DGX Spark 上运行生产级 LLM 的全面指南。涵盖 vLLM 部署、systemd 配置、内存管理和真实基准测试。"
date: 2026-08-03
slug: self-hosting-llm-dgx-spark-complete-guide
tags: [ai, llm, self-hosting, dgx, vllm]
---

# 在 DGX Spark 上自架 AI 模型完整指南

## 为什么在 2026 年自架 AI 很重要

每个月，AI 模型越来越好，但成本也越来越高。这种成本轨迹对于在生产环境中规模化运行 AI 的任何人都不可持续。自架提供了三个云 API 无法匹敌的优势：

1. **成本可预测**——你支付的是电费，而不是按 token 计费
2. **数据隐私**——你的数据永远不会离开你自己的基础设施
3. **无速率限制**——你的模型服务于你的需求，而非共享池

DGX Spark（NVIDIA GB10）是绝佳的入门选择。约 $1000 的价格，提供了足够的显存和算力来运行生产级模型，同时仍在预算之内。

## 硬件需求

### DGX Spark 提供什么

| 规格 | 数值 |
|---------------|-------|
| GPU | NVIDIA GB10（统一内存） |
| 统一内存 | 96GB（GPU + CPU 共享） |
| 存储 | NVMe SSD（用户自备） |
| 外形 | 紧凑型桌面 |
| 功耗 | 负载下约 150W |

96GB 统一内存是杀手锏。你可以运行在消费级显卡（24GB 显存）甚至数据中心显卡（80GB HBM）上根本装不下的模型。

### 哪些模型能装下？

| 模型 | 参数量 | 量化方式 | 所需内存 |
|-------|-----------|--------------|-----------------|
| Qwen 2.5 72B | 72B | Q4_K_M | ~48GB |
| Llama 3.1 70B | 70B | Q4_K_M | ~46GB |
| Mixtral 8x22B | 56B | Q4_K_M | ~38GB |
| Qwen 2.5 32B | 32B | FP16 | ~64GB |
| Phi-4 | 14B | FP16 | ~28GB |

余量很关键。96GB 内存，72B 模型约 48GB，你还有 48GB 可用于系统开销、多模型和并发处理。

## vLLM 分步部署

### 1. 安装 Docker 和 NVIDIA Container Toolkit

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sed 's/deb https:///deb [signed-by=\\/usr\\/share\\/keyrings\\/nvidia-container-toolkit-keyring.gpg] https:\\/\\//g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 2. 使用 Docker 部署 vLLM

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

### 3. 创建 systemd 服务（推荐）

Docker 命令适合测试，但生产环境请使用 systemd 服务：

```ini
# /etc/systemd/system/vllm.service
[Unit]
Description=VLLM AI 推理服务器
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

### 4. 验证运行状态

```bash
# 查看日志
sudo journalctl -u vllm -f

# 测试 API 端点
curl http://localhost:8000/v1/models

# 测试对话完成
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-72B-Instruct",
    "messages": [{"role": "user", "content": "法国的首都是哪里？"}],
    "max_tokens": 50
  }'
```

## 内存管理调优

在 DGX Spark 上运行模型的关键是管理 96GB 共享内存池。以下是关键参数：

### gpu-memory-utilization

控制用于模型权重的可用显存百分比。

| 数值 | 模型大小（Q4_K_M） | 安全余量 |
|-------|---------------------|---------------|
| 0.85 | ~44GB | 舒适 |
| 0.90 | ~48GB | 推荐 |
| 0.95 | ~50GB | 有风险（可能 OOM） |

**建议：** 从 0.85 开始。如果运行稳定一周后，提升到 0.90。除非有特定原因，否则绝不要超过 0.95。

### max-model-len

控制最大上下文窗口。越大越有用但消耗更多内存。

```bash
# 72B 模型在 Q4_K_M 下：
--max-model-len 32768  # 权重约 48GB，KV 缓存约 20GB

# 如果需要更长上下文：
--max-model-len 131072  # 权重约 48GB，KV 缓存约 60GB（接近极限）
```

### 启用交换

vLLM 支持将 KV 缓存交换到 CPU 内存：

```bash
--swap-space 16  # 16GB CPU 内存作为交换空间
```

这可以防止 OOM 错误，但交换发生时可能降低生成速度。

## 运行多个模型

凭借 96GB 内存，你可以同时运行两个模型：

```bash
# 主模型（72B）
docker run -d --name vllm-72b --gpus all -p 8000:8000 vllm/vllm-openai:latest \
  --model Qwen2.5-72B-Instruct --max-model-len 32768 --gpu-memory-utilization 0.45

# 次模型（7B）
docker run -d --name vllm-7b --gpus all -p 8001:8000 vllm/vllm-openai:latest \
  --model Qwen2.5-7B-Instruct --max-model-len 8192 --gpu-memory-utilization 0.10
```

使用负载均衡器（nginx 或 Traefik）根据任务复杂度将请求路由到相应的模型。

## 基准测试结果

### 推理速度

| 模型 | 每秒 Token 数 | 平均延迟 | GPU 利用率 |
|-------|--------------|-------------|----------|
| Qwen2.5-72B Q4_K_M | 12-15 tok/s | 80ms/tok | 95% |
| Llama 3.1-70B Q4_K_M | 10-13 tok/s | 90ms/tok | 97% |
| Qwen2.5-32B FP16 | 20-25 tok/s | 45ms/tok | 80% |
| Phi-4 FP16 | 35-45 tok/s | 25ms/tok | 60% |

### 成本对比

| 提供商 | 100 万输入 token | 100 万输出 token | 月成本（1 亿输入，1000 万输出） |
|----------|-----------------|------------------|----------------------------------|
| OpenAI GPT-4o | $2.50 | $10.00 | ~$350 |
| Anthropic Claude | $3.00 | $15.00 | ~$450 |
| 自架（DGX Spark） | $0 | $0 | ~$30（电费） |

DGX Spark 的回报周期约为中等 API 使用量的 2-3 个月。

## 在 Spark 上选择你的运行时

Spark 的统一内存意味着两种运行方式都能很好工作，而正确的选择取决于谁在消费模型：

- **vLLM（本指南的默认选择）**——当多个服务、代理或同事共享模型时，这是正确的选择。持续批处理在高并发下保持高吞吐量，OpenAI 兼容 API 意味着任何现有客户端无需修改即可连接。
- **Ollama**——适合交互式、单用户实验的正确选择。一条命令拉取 GGUF 模型并服务它；缺点是批量控制较弱，且在并发请求下容易阻塞。
- **llama.cpp server**——GGUF 模型在非典型硬件上的稳固中间方案，或当你想要参考实现时。

我们实际运行的务实模式：vLLM 用于生产模型（代理和应用程序调用的那个），旁边搭配 Ollama 用于在将新模型提升为生产槽位之前进行原型测试。两者在 Spark 的内存池中无冲突地共存，因为统一架构允许你为每个进程分区显存。

## 安全与访问控制

网络上的模型服务器就是一个端点——像对待端点一样对待它：

1. **默认绑定到 localhost 或私有接口**。仅在用例需要时才暴露到局域网，在未经认证的情况下绝不要暴露到公网。
2. **如果 OpenAI 兼容 API 可被 localhost 之外的地址访问，在其前面加一个认证代理**。带 token 检查的反向代理只需一个配置文件就能关闭最大的暴露面。
3. **为服务设置资源限制**（内存、重启策略），防止失控的生成操作拖垮主机。
4. **记录请求**——请求载荷和响应代码——以便你能审计模型被要求做什么。当服务器被共享时这点尤其重要。

此处的安全性主要是"不要暴露它"加上"知道它做了什么"。两者在部署时实施都很便宜，而在事故发生后补救则代价高昂。

## 生产环境注意事项

### 监控

```bash
# GPU 使用情况
nvidia-smi

# GPU 内存
nvidia-smi --query-gpu=memory.used,memory.total --format=csv

# 进程列表
htop | grep vllm
```

### 备份与恢复

1. **模型权重：** 备份到外部存储或 S3
2. **systemd 配置：** Git 版本控制（已在我们的 DGX Spark 套件中完成）
3. **Docker 镜像：** 重新构建时拉取或保存为 tarball

### 安全

```bash
# 将 vLLM 限制为仅 localhost
--host 127.0.0.1

# 或使用 nginx 作为带认证的 Reverse Proxy
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

## 常见问题与解决方案

### 问题：OOM（内存溢出）

**原因：** 模型过大，或上下文窗口太长。
**解决方案：** 减小 `--max-model-len` 或使用更激进的量化（Q4 而非 Q8）。

### 问题：推理速度慢

**原因：** 热节流或交换。
**解决方案：** 确保充分散热。检查 `nvidia-smi` 中的温度。如果正在交换，降低 `--gpu-memory-utilization`。

### 问题：模型无法加载

**原因：** 模型路径或格式不正确。
**解决方案：** 验证模型文件存在于挂载的卷中。使用正确的模型标识符（例如 `Qwen/Qwen2.5-72B-Instruct` 而非 `qwen-72b`）。

## 结论

2026 年，在 DGX Spark 上自架已经足够成熟，可以用于生产环境。96GB 统一内存、vLLM 的优化和单次 $1000 投资相结合，使其成为规模化运行 AI 最具成本效益的方式之一。

关键要点：

1. 从 Q4_K_M 量化开始以获得最佳平衡
2. 将 gpu-memory-utilization 设为 0.85-0.90
3. 使用 systemd 保障可靠运行
4. 密切监控内存使用情况
5. 考虑同时运行两个模型以应对不同的任务复杂度

如需完整的设置指南（含部署脚本和 systemd 配置），请查看我们的 [DGX Spark 套件](/blog/dgx-spark-kit/)。

---

**相关文章：**

- [Cowork Pro](/blog/cowork-pro/) —— 编排调用你本地模型的 AI 代理
- [在 DGX Spark 上自架 LLM](/blog/self-hosting-llm-dgx-spark-complete-guide/) —— 完整基础设施指南
- [DGX Spark 部署套件](/blog/dgx-spark-kit/) —— 部署脚本和 systemd 配置
- [AI 开发技术栈](/blog/ai-dev-stack/) —— 完整的 AI 技术栈
- [开发者工具主题中心](/categories/developer-tools/) —— 所有开发者工具指南