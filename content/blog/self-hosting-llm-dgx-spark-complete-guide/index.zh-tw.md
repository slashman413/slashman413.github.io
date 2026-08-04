---
title: "DGX Spark 上自託管 AI 模型的完整指南 — 從零到生產環境"
description: "在 NVIDIA DGX Spark 上運行生產等級 LLM 的全面指南。涵蓋 vLLM 部署、systemd 設定、記憶體管理與真實效能基準測試。"
date: 2026-08-03
slug: self-hosting-llm-dgx-spark-complete-guide
tags: [ai, llm, self-hosting, dgx, vllm]
---

# DGX Spark 上自託管 AI 模型的完整指南

## 為什麼 2026 年需要自託管 AI

每個月，AI 模型變得更強大但也更昂貴。成本曲線對於任何大規模在生產環境中運行 AI 的人來說都是不可持續的。自託管提供雲端 API 無法比擬的三大優勢：

1. **成本可預測** — 您為電力付費，而非按 Token 計費
2. **資料隱私** — 您的資料永遠不會離開您的基礎建設
3. **沒有速率限制** — 您的模型服務您的需求，而非共用資源池

DGX Spark（NVIDIA GB10）是絕佳的入門選擇。以約 $1000 的價格，它提供了足夠的 VRAM 與運算能力來運行生產等級模型，同時保持在預算內。

## 硬體需求

### DGX Spark 提供什麼

|| 規格 | 數值 |
|---------------|-------|
| GPU | NVIDIA GB10（統一記憶體） |
| 統一記憶體 | 96GB（GPU + CPU 共用） |
| 儲存 | NVMe SSD（使用者自備） |
| 外型 | 緊湊型桌上型機 |
| 功耗 | 負載下約 150W |

96GB 統一記憶體是最強的賣點。您可以運行在消費級 GPU（24GB VRAM）甚至資料中心卡（80GB HBM）上根本裝不下的模型。

### 哪些模型可用？

|| 模型 | 參數量 | 量化 | 所需記憶體 |
|-------|-----------|--------------|-----------------|
| Qwen 2.5 72B | 72B | Q4_K_M | ~48GB |
| Llama 3.1 70B | 70B | Q4_K_M | ~46GB |
| Mixtral 8x22B | 56B | Q4_K_M | ~38GB |
| Qwen 2.5 32B | 32B | FP16 | ~64GB |
| Phi-4 | 14B | FP16 | ~28GB |

剩餘空間很重要。在 96GB 記憶體下，72B 模型約占 48GB，您還有 48GB 用於系統開銷、多個模型並行處理。

## vLLM 逐步部署

### 1. 安裝 Docker 與 NVIDIA Container Toolkit

```bash
# 安裝 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安裝 NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sed 's/deb https:///deb [signed-by=\/usr\/share\/keyrings\/nvidia-container-toolkit-keyring.gpg] https:\/\/\//g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
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

### 3. 建立 Systemd 服務（推薦）

Docker 命令適合測試，但生產環境建議使用 systemd 服務：

```ini
# /etc/systemd/system/vllm.service
[Unit]
Description=VLLM AI 推論伺服器
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

### 4. 驗證運行狀態

```bash
# 查看日誌
sudo journalctl -u vllm -f

# 測試 API 端點
curl http://localhost:8000/v1/models

# 測試聊天完成
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-72B-Instruct",
    "messages": [{"role": "user", "content": "What is the capital of France?"}],
    "max_tokens": 50
  }'
```

## 記憶體管理微調

在 DGX Spark 上運行模型的重點在於管理 96GB 共用記憶體池。以下是關鍵參數：

### gpu-memory-utilization

控制可用 VRAM 的百分比用於模型權重。

|| 數值 | 模型大小（Q4_K_M） | 安全餘額 |
|-------|---------------------|---------------|
| 0.85 | ~44GB | 舒適 |
| 0.90 | ~48GB | 推薦 |
| 0.95 | ~50GB | 危險（可能 OOM） |

**建議：** 從 0.85 開始。如果穩定運行一週，調至 0.90。除非有特定理由，否則不要超過 0.95。

### max-model-len

控制最大上下文視窗。越大越有用但也佔用更多記憶體。

```bash
# 72B 模型 Q4_K_M 量化：
--max-model-len 32768  # 權重約 48GB，KV 快取約 20GB

# 如需更長上下文：
--max-model-len 131072  # 權重約 48GB，KV 快取約 60GB（接近極限）
```

### 啟用交換

vLLM 支援將 KV 快取交換至 CPU 記憶體：

```bash
--swap-space 16  # 16GB CPU RAM 作為交換空間
```

這能防止 OOM 錯誤，但可能導致交換發生時生成速度變慢。

## 運行多個模型

96GB 記憶體允許您同時運行兩個模型：

```bash
# 主要模型（72B）
docker run -d --name vllm-72b --gpus all -p 8000:8000 vllm/vllm-openai:latest \
  --model Qwen2.5-72B-Instruct --max-model-len 32768 --gpu-memory-utilization 0.45

# 次要模型（7B）
docker run -d --name vllm-7b --gpus all -p 8001:8000 vllm/vllm-openai:latest \
  --model Qwen2.5-7B-Instruct --max-model-len 8192 --gpu-memory-utilization 0.10
```

使用負載平衡器（nginx 或 Traefik）根據任務複雜度將請求路由至適當的模型。

## 基準測試結果

### 推論速度

|| 模型 | 每秒 Token 數 | 平均延遲 | GPU 利用率 |
|-------|--------------|-------------|----------|
| Qwen2.5-72B Q4_K_M | 12-15 tok/s | 80ms/tok | 95% |
| Llama 3.1-70B Q4_K_M | 10-13 tok/s | 90ms/tok | 97% |
| Qwen2.5-32B FP16 | 20-25 tok/s | 45ms/tok | 80% |
| Phi-4 FP16 | 35-45 tok/s | 25ms/tok | 60% |

### 成本比較

|| 供應商 | 1M 輸入 Token | 1M 輸出 Token | 每月（100M 輸入，10M 輸出） |
|----------|-----------------|------------------|----------------------------------|
| OpenAI GPT-4o | $2.50 | $10.00 | ~$350 |
| Anthropic Claude | $3.00 | $15.00 | ~$450 |
| 自託管（DGX Spark） | $0 | $0 | ~$30（電力） |

DGX Spark 的回收期約為兩到三個月中度 API 用量。

## 在 Spark 上選擇您的執行環境

Spark 的統一記憶體意味著兩種服務方式都能良好運作，正確的選擇取決於誰在使用模型：

- **vLLM（本指南預設）** — 當多個服務、代理或團隊成員共用模型時的正確選擇。連續分組在並行負載下保持高吞吐量，OpenAI 相容的 API 意味著任何現有客戶端無需更改即可連接。
- **Ollama** — 適合互動式單人實驗的正確選擇。一條命令拉取 GGUF 模型並服務；代價是分組控制較弱，且在並行請求下容易停滯。
- **llama.cpp server** — GGUF 模型在特殊硬體上的穩固中繼選擇，或當您需要參考實作時。

我們運行的務實模式：vLLM 用於生產模型（代理和應用程式呼叫的模型），並行部署 Ollama 用於原型測試新模型，然後提升為生產用途。兩者在 Spark 的記憶體池中共存而不會衝突，因為統一架構允許您為每個程序分配 VRAM。

## 安全性與存取控制

網路上的模型伺服器是一個端點——請像對待端點一樣對待它：

1. **預設綁定至 localhost 或私人介面**。除非您的使用情境需要，否則不要在 LAN 上暴露，更不要在未經驗證的情況下暴露至公共網路。
2. **在 OpenAI 相容 API 前面加上驗證反向代理**，如果它可被 localhost 之外的位置存取。一個帶有 Token 檢查的反向代理只需一個設定檔就能關閉最大的暴露風險。
3. **為服務設定資源限制**（記憶體、重啟策略），以防 runaway 生成程序拖垮主機。
4. **記錄請求** — 載荷與回應碼 — 以便稽核模型被要求做什麼。當伺服器被共用時這一點尤為重要。

此處的安全性 mostly 是「不要暴露它」加上「了解它做了什麼」。兩者都可以廉價地在部署時實作，而在發生事件後補救則代價高昂。

## 生產環境考量

### 監控

```bash
# GPU 使用率
nvidia-smi

# GPU 記憶體
nvidia-smi --query-gpu=memory.used,memory.total --format=csv

# 進程列表
htop | grep vllm
```

### 備份與復原

1. **模型權重：** 備份至外部儲存或 S3
2. **Systemd 設定：** Git 版本控制（我們已隨 DGX Spark 套件完成）
3. **Docker 映像：** 重建時拉取，或存為 tarball

### 安全性

```bash
# 將 vLLM 限制為僅 localhost
--host 127.0.0.1

# 或使用 nginx 作為帶驗證的反向代理
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

## 常見問題與解決方案

### 問題：OOM（記憶體不足）

**原因：** 模型過大，或上下文視窗太長。
**解決方案：** 減少 `--max-model-len` 或使用更激進的量化（Q4 而非 Q8）。

### 問題：推論速度慢

**原因：** 散熱降頻，或交換。
**解決方案：** 確保充分散熱。檢查 `nvidia-smi` 中的溫度。如果正在交換，減少 `--gpu-memory-utilization`。

### 問題：模型無法載入

**原因：** 模型路徑或格式不正確。
**解決方案：** 驗證模型檔案存在於掛載的磁碟區中。使用正確的模型標識符（例如 `Qwen/Qwen2.5-72B-Instruct` 而非 `qwen-72b`）。

## 結論

2026 年，DGX Spark 上的自託管已成熟到足以用於生產環境。96GB 統一記憶體、vLLM 的最佳化與單一 $1000 投資的結合，使其成為大規模運行 AI 最具成本效益的方式之一。

關鍵要點：
1. 使用 Q4_K_M 量化取得最佳平衡
2. 將 gpu-memory-utilization 設為 0.85-0.90
3. 使用 systemd 確保可靠運作
4. 密切監控記憶體使用
5. 考慮同時運行兩個模型以處理不同任務複雜度

如需包含部署腳本與 systemd 設定檔的完整設定指南，請查看我們的 [DGX Spark 套件](/blog/dgx-spark-kit/)。

---

**相關：**
- [Cowork Pro](/blog/cowork-pro/) — 協調 AI 代理呼叫您的本地模型
- [DGX Spark 上自託管 LLM](/blog/self-hosting-llm-dgx-spark-complete-guide/) — 完整基礎建設指南
- [DGX Spark 部署套件](/blog/dgx-spark-kit/) — 部署腳本與 systemd 設定
- [AI 開發堆疊](/blog/ai-dev-stack/) — 完整 AI 技術堆疊
- [開發者工具主題中心](/categories/developer-tools/) — 所有開發者工具指南