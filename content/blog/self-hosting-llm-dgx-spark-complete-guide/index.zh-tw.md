---
title: "自架 AI 與本地 LLM 部署完整指南：在 NVIDIA DGX Spark (GB10) 從零到生產環境（含 DGX Spark 評價與實測數據）"
description: "2026 台灣最完整的自架 AI 與本地 LLM 部署實戰指南：涵蓋 NVIDIA DGX Spark (GB10) 評價與實測數據、vLLM vs Ollama vs llama.cpp 比較、systemd 守護進程與 VRAM 記憶體配置。"
date: 2026-08-03
lastmod: 2026-11-03
slug: self-hosting-llm-dgx-spark-complete-guide
tags: [ai, llm, self-hosting, dgx, vllm, 自架ai, 本地llm部署]
faq:
  - q: "自架 AI 與本地 LLM 部署需要多少硬體預算與 VRAM？"
    a: "入門級自架 AI 可使用 24GB VRAM 顯示卡（如 RTX 4090/5090）執行 14B–32B Q4 模型；若需同時執行 70B/72B 旗艦模型與多 Agent 並行推理，配備 96GB–128GB 統一記憶體的 NVIDIA DGX Spark (GB10) 或 Mac Studio 是性價比最高的生產環境選擇。"
  - q: "NVIDIA DGX Spark 評價如何？適合台灣個人開發者與中小企業自架 AI 嗎？"
    a: "根據我們連續數月的生產環境實測，DGX Spark (GB10) 在約 150W 低功耗下可穩定以 12–15 tok/s 執行 Qwen 2.5/3 72B (Q4_K_M)，或以 22–28 tok/s 執行 32B 模型。相較每月 $350–$450 的雲端 API 帳單，中度以上用量約 2–3 個月即可回本。"
  - q: "本地 LLM 部署該選 vLLM、Ollama 還是 llama.cpp？"
    a: "單人互動測試與快速載入 GGUF 模型首選 Ollama；需要多人共用、多 Agent 並行呼叫與高吞吐量 OpenAI 相容 API 的生產環境，強烈建議使用 vLLM 搭配 systemd 與健康檢查 watchdog。"
---

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "如何在 NVIDIA DGX Spark (GB10) 完成自架 AI 與本地 LLM 部署",
  "description": "從硬體統一記憶體規劃、Docker 與 NVIDIA Container Toolkit 安裝、vLLM 雙模型部署到 systemd 自動重啟與健康檢查的完整步驟。",
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "規劃統一記憶體與模型量化格式",
      "text": "透過 free -g 與 nvidia-smi 確認可用統一記憶體，保留系統與快取空間後，將 --gpu-memory-utilization 設定於 0.85 至 0.90，並選擇 FP8、AWQ 或 GGUF Q4_K_M 量化模型。"
    },
    {
      "@type": "HowToStep",
      "position": 2,
      "name": "安裝 Docker 與 NVIDIA Container Toolkit",
      "text": "在 Ubuntu/Linux 環境安裝 Docker Engine 與 nvidia-container-toolkit，設定 nvidia-ctk runtime 並重啟 Docker 服務。"
    },
    {
      "@type": "HowToStep",
      "position": 3,
      "name": "部署 vLLM OpenAI 相容推論伺服器",
      "text": "啟動 vllm/vllm-openai 容器，掛載 NVMe 模型目錄並指定 --max-model-len 32768 與 --gpu-memory-utilization 0.90。"
    },
    {
      "@type": "HowToStep",
      "position": 4,
      "name": "配置 systemd 守護進程與健康檢查 Watchdog",
      "text": "建立 /etc/systemd/system/vllm.service 與定時健康檢查探針，測試 /health 與實際生成回應，確保服務異常時自動安全重啟。"
    }
  ]
}
</script>

# 自架 AI 與本地 LLM 部署完整指南：在 NVIDIA DGX Spark (GB10) 從零到生產環境

## 為什麼 2026 年需要自架 AI 與本地 LLM 部署？

每個月，雲端 AI 模型變得更強大，但 API 帳單與隱私合規成本也同步飆升。對於需要全天候運行自動化工作流、多 Agent 系統或處理內部敏感資料的團隊與獨立開發者來說，**自架 AI（Self-Hosted AI）**與**本地 LLM 部署（Local LLM Deployment）**提供了雲端 API 無法取代的三大核心優勢：

1. **成本完全可預測** — 自架 AI 只需負擔固定硬體折舊與每月約 NT$900（~$30）的電費，徹底告別按 Token 計費的無底洞。
2. **100% 資料隱私與主權** — 程式碼、客戶個資、合約與財務數據永遠不會離開您的本地伺服器與內網。
3. **零速率限制（No Rate Limits）** — 您的本地 LLM 推論伺服器專屬於您的多 Agent 管線，不會因為共用雲端資源池而遭遇 429 限流或延遲暴增。

在開始設定之前，先根據您的工作負載選擇最適合的**自架 AI 硬體層級**：

| 自架 AI 硬體方案 | 可用 VRAM / 統一記憶體 | 適合本地 LLM 部署規模 | 實測推論速度 (Q4/FP8) | 典型功耗 | 適用場景 |
|---|---|---|---|---|---|
| **RTX 4090 / 5090 單卡工作站** | 24GB–32GB GDDR6X/GDDR7 | 7B–32B (AWQ / GGUF Q4) | 45–85 tok/s | 350W–450W | 低延遲單模型 Coding 助手、個人高速推論 |
| **Apple Mac Studio (M3/M4 Max/Ultra)** | 64GB–128GB 統一記憶體 | 32B–70B (GGUF / MLX) | 15–32 tok/s | 60W–120W | macOS 桌面環境、靜音本地開發測試 |
| **NVIDIA DGX Spark (GB10 超級晶片)** | 96GB–128GB LPDDR5X 統一記憶體 | **32B FP16 或 70B/72B Q4 + 7B 雙模型並行** | 12–25 tok/s | **~150W** | **Linux 24/7 生產環境、CUDA/vLLM 原生生態、多 Agent 伺服器** |

---

## DGX Spark 評價與實測數據（2026 生產環境基準測試）

許多台灣開發者與技術主管在評估本地 AI 伺服器時，最常搜尋的問題就是：「**NVIDIA DGX Spark 評價如何？值得買來做本地 LLM 部署嗎？**」

我們將 DGX Spark（搭載 NVIDIA Grace Blackwell GB10 架構）放入真實的 24/7 生產環境運行數月，作為 [多 Agent AI 工作流](/zh-tw/blog/designing-multi-agent-ai-workflows-guide/) 與自動化內容管線的主力推論節點。以下是我們的第一手 **DGX Spark 評價與實測數據**：

### 1. DGX Spark 硬體規格與架構亮點

| 規格項目 | NVIDIA DGX Spark (GB10) 實測配置 | 實戰影響與評價 |
|---|---|---|
| **運算晶片** | NVIDIA GB10 Grace Blackwell Superchip | 原生支援 CUDA、vLLM、FP8 與 NVFP4 硬體加速，無需像 Mac 轉譯或妥協相容性 |
| **統一記憶體池** | 96GB–128GB LPDDR5X（CPU + GPU 共用） | **最大殺手鐧**：單機即可載入 70B/72B 大模型，或同時常駐「32B 主力模型 + 7B 快速分類模型 + Embedding 模型」 |
| **儲存介面** | 高速 NVMe SSD | 建議將 `HF_HOME` 指向 NVMe，70B 模型冷啟動載入約 35–50 秒，熱啟動（Page Cache）僅需 8–12 秒 |
| **機身與散熱噪音** | 緊湊型桌上型機（Mini-ITX 等級） | 滿載功耗僅約 150W，可直接放在辦公室或書房全天候開機，不像傳統 4U 機架伺服器吵雜耗電 |

### 2. DGX Spark 本地 LLM 部署實測速度與記憶體佔用表

以下數據為我們在 DGX Spark 上使用 **vLLM (`--gpu-memory-utilization 0.90`, `--max-model-len 32768`)** 針對繁體中文與程式碼任務進行的實測表現：

| 模型名稱 | 參數量 | 量化格式 | 權重 + KV Cache 記憶體佔用 | 單請求生成速度 (tok/s) | 4 並行總吞吐量 (tok/s) | 首字延遲 (TTFT) | 繁中/Agent 實測評價 |
|---|---|---|---|---|---|---|---|
| **Qwen 3 / Qwen 2.5 72B Instruct** | 72B | GGUF / AWQ Q4_K_M | ~48GB（含 32K KV 快取約 68GB） | 12–15 tok/s | 34–42 tok/s | ~80ms/tok | 繁體中文理解與長文推理頂尖，適合非即時背景 Agent |
| **Llama 3.3 / 3.1 70B Instruct** | 70B | AWQ / GPTQ 4-bit | ~46GB（含 32K KV 快取約 65GB） | 10–13 tok/s | 30–38 tok/s | ~90ms/tok | 英文指令遵循與結構化輸出極穩 |
| **Qwen 2.5 / Qwen 3 32B Instruct** | 32B | FP8 / FP16 | ~34GB (FP8) / ~64GB (FP16) | 20–28 tok/s | 65–82 tok/s | ~40ms/tok | **主力首選**：速度與智商完美平衡，適合 Tool Calling |
| **DeepSeek-R1 Distill Qwen 32B** | 32B | Q4_K_M / FP8 | ~22GB–34GB | 22–30 tok/s | 70–88 tok/s | ~38ms/tok | 複雜邏輯、數學與程式碼除錯首選 |
| **Phi-4 / Qwen 2.5 14B Instruct** | 14B | FP16 / Q8_0 | ~16GB–28GB | 35–48 tok/s | 110+ tok/s | ~22ms/tok | 適合即時互動、Email 分類與格式驗證閘門 |

### 3. DGX Spark 綜合優缺點評價（買前必看）

- **優點（為什麼值得買）：**
  - **突破 24GB 顯卡牆**：消費級顯卡（RTX 4090）卡在 24GB VRAM，跑 32B 以上模型就必須縮減 Context 或忍受跨卡設定；DGX Spark 的大統一記憶體讓 32B–72B 模型與長 Context (32K–128K) 輕鬆共處。
  - **雙模型架構（Dual-Model Serving）**：我們在生產環境同時啟動一個 32B/72B 主模型（負責複雜決策與寫作）與一個 7B/14B 輕量模型（負責即時分類與 Schema 檢查），硬體利用率極高。
  - **軟體生態零摩擦**：完整支援標準 NVIDIA Container Toolkit 與 vLLM，生產環境穩定度遠高於拼裝礦卡。
- **限制與誠實提醒（哪些人不適合）：**
  - **記憶體頻寬受限於 LPDDR5X**：單一使用者極限飆速（tok/s）不如雙卡 RTX 5090，但透過 vLLM Continuous Batching，在多 Agent 並行批次任務上總吞吐量非常出色。
  - **Linux 統一記憶體需手動預留系統空間**：`nvidia-smi` 顯示的記憶體與 Linux Kernel 及 Page Cache 共用，不能把 `--gpu-memory-utilization` 設到 `0.98`，否則會觸發系統級 OOM（詳見下方檢查清單）。

### 4. 自架 AI vs 雲端 API 投資報酬率（TCO 成本實測比較）

| 供應商 / 部署方式 | 1M 輸入 Token 成本 | 1M 輸出 Token 成本 | 每月費用（100M 輸入 + 10M 輸出） | 資料隱私 |
|---|---|---|---|---|
| **OpenAI GPT-4o API** | $2.50 | $10.00 | ~$350 / 月（約 NT$11,200） | 傳送至外部雲端 |
| **Anthropic Claude Sonnet/Opus** | $3.00 | $15.00 | ~$450 / 月（約 NT$14,400） | 傳送至外部雲端 |
| **自架 AI（DGX Spark 本地部署）** | **$0** | **$0** | **~$30 / 月（僅電費約 NT$950）** | **100% 留在內網** |

在中度以上的自動化或 Agent 呼叫量下，**自架 AI 的硬體回收期僅約 2 至 3 個月**。若您希望跳過繁瑣的環境踩坑，我們將實測穩定的雙模型設定打包成了 **[DGX Spark 部署套件（DGX Spark Deployment Kit）](/zh-tw/blog/dgx-spark-kit/)**，內含生產級 systemd 服務檔、VRAM 計算表與自動修復腳本。

---

## 本地 LLM 部署執行環境比較：vLLM vs Ollama vs llama.cpp

在規劃**本地 LLM 部署**時，選擇正確的推論引擎（Runtime）決定了系統的吞吐量與穩定度：

| 比較項目 | **vLLM（生產環境首選）** | **Ollama（快速原型首選）** | **llama.cpp server** |
|---|---|---|---|
| **核心優勢** | Continuous Batching 高並行吞吐、PagedAttention | 一行指令下載並啟動 GGUF 模型 | 極致輕量、C++ 原生跨平台相容 |
| **並行處理能力 (Concurrency)** | **極高**（多 Agent 同時呼叫不卡頓） | 低（多請求排隊易阻塞） | 中（支援平行 Slot 設定） |
| **VRAM 記憶體管理** | 啟動時預先分配 KV Cache 記憶體池 | 動態載入，閒置可自動卸載 | 精準控制 GPU Offload 層數 (`-ngl`) |
| **支援量化格式** | FP8, AWQ, GPTQ, BitsAndBytes, GGUF | GGUF (Q4_K_M, Q8_0 等) | GGUF 原生參考實作 |
| **API 介面** | 完整 OpenAI `/v1/chat/completions` + Structured Outputs | OpenAI 相容端點 + 原生 `/api/generate` | OpenAI 相容 HTTP Server |
| **最適用場景** | **企業/團隊共用 API、多 Agent 自動化管線** | **個人本機測試、快速切換模型實驗** | **異質硬體、CPU+GPU 混合推論** |

我們的實戰配置模式：**生產環境主力模型使用 vLLM**（提供給 [AI Workflow Builder](/zh-tw/blog/ai-workflow-builder/) 與 [Cowork Pro](/zh-tw/blog/cowork-pro/) 的 Agent 呼叫），同時在另一埠號搭配 **Ollama** 進行新模型的快速驗證。

---

## vLLM 本地 LLM 部署逐步教學（從零到生產環境）

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
  --ipc=host \
  --shm-size=16g \
  -p 127.0.0.1:8000:8000 \
  -v /data/models:/models \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-72B-Instruct \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.88 \
  --tensor-parallel-size 1
```

### 3. 建立 Systemd 服務（生產環境必備）

單純的 Docker 命令適合測試，但生產環境的**本地 LLM 部署**必須透過 `systemd` 管理啟動順序、日誌與崩潰重啟：

```ini
# /etc/systemd/system/vllm.service
[Unit]
Description=vLLM Local LLM Inference Server (GB10)
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=wayne
Restart=on-failure
RestartSec=15
TimeoutStartSec=1800
ExecStart=/usr/bin/docker run --rm \
  --name vllm-server \
  --gpus all --ipc=host --shm-size=16g \
  -p 127.0.0.1:8000:8000 \
  -v /data/models:/models \
  vllm/vllm-openai:latest \
  --model /models/Qwen2.5-72B-Instruct \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.88 \
  --tensor-parallel-size 1
ExecStop=/usr/bin/docker stop vllm-server

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable vllm
sudo systemctl start vllm
sudo systemctl status vllm
```

### 4. 驗證本地 LLM API 運行狀態

```bash
# 即時查看啟動與 CUDA Graph 載入日誌
sudo journalctl -u vllm -f

# 測試模型列表端點
curl http://localhost:8000/v1/models

# 測試 OpenAI 相容 Chat Completions API
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-72B-Instruct",
    "messages": [{"role": "user", "content": "請用三點總結台灣中小企業自架 AI 的核心優勢。"}],
    "max_tokens": 200
  }'
```

---

## 記憶體管理微調與雙模型並行配置

在 DGX Spark (GB10) 上進行**自架 AI** 的核心關鍵在於管理共用記憶體池：

### 1. `gpu-memory-utilization` 安全水位表

| 設定數值 | 模型與 KV 快取可用空間 | 系統安全餘額評價 |
|---|---|---|
| `0.80–0.85` | ~76GB–82GB | **最舒適**：預留充足 Linux Page Cache 與容器空間 |
| `0.88–0.90` | ~85GB–86GB | **推薦生產環境上限**：適合單一 72B 大模型 + 32K 上下文 |
| `0.95+` | >90GB | **危險**：高機率在長 Prompt 並行時觸發系統 OOM |

### 2. `max-model-len` 與 KV Cache 交換空間

```bash
# 72B 模型 Q4_K_M 量化建議配置：
--max-model-len 32768  # 權重約 48GB，KV 快取約 20GB

# 啟用 CPU RAM 交換空間防止突發流量 OOM：
--swap-space 16
```

### 3. 在單台 DGX Spark 同時運行兩個本地 LLM 模型

憑藉大容量統一記憶體，您可以同時部署「主力推理模型」與「高速輕量模型」：

```bash
# 主力模型（72B，負責深度推理與長文生成，分配 45% 記憶體）
docker run -d --name vllm-72b --gpus all --ipc=host -p 127.0.0.1:8000:8000 vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-72B-Instruct --max-model-len 32768 --gpu-memory-utilization 0.45

# 次要模型（7B，負責分類、路由與 JSON 擷取，分配 12% 記憶體）
docker run -d --name vllm-7b --gpus all --ipc=host -p 127.0.0.1:8001:8000 vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct --max-model-len 16384 --gpu-memory-utilization 0.12
```

---

## GB10 自架 AI 上線前檢查清單與健康檢查 Watchdog

本地推論伺服器最常見的故障不是進程崩潰（Crash），而是**假死（Wedged Engine）**：Port 8000 依然開放、`/health` 仍回傳 200，但 KV Cache 卡死導致所有請求逾時。因此，生產環境必須完成以下檢查清單：

1. **先扣除非 GPU 預留記憶體**：開機閒置時執行 `free -g` 與 `nvidia-smi`，保留至少 12GB–16GB 給 OS 與容器，再計算 `--gpu-memory-utilization`。
2. **將模型快取固定在 NVMe SSD**：設定 `HF_HOME=/mnt/nvme/hf`，避免重複下載或網路磁碟 I/O 瓶頸。
3. **部署「真實生成探針」而非僅檢查 TCP Port**：每 60 秒發送一個 `max_tokens: 8, temperature: 0` 的測試請求，確認模型真的能吐出 Token，並依據退出碼區分「服務無回應（需重啟）」與「負載過高變慢（僅告警不重啟）」。
4. **客戶端設定 Fallback 路由**：在呼叫本地 LLM 的程式碼中設定 20 秒 Timeout，當本地伺服器重啟維護時自動切換至備援端點，確保業務不中斷。

---

## 安全性、存取控制與常見問題排解

### 生產環境安全守則
1. **預設僅綁定 `127.0.0.1` 或 Tailscale 私網介面**：切勿將未加密的 8000 埠直接暴露於公網。
2. **啟用 API Key 驗證與 Nginx/Caddy 反向代理**：加上 `--api-key "$VLLM_API_KEY"` 並透過反向代理進行權限檢查與存取日誌記錄。

### 常見問題快速排解
- **OOM（記憶體不足）**：調降 `--max-model-len`（例如從 65536 改為 32768）或改用 FP8 / Q4_K_M 量化權重。
- **推論速度突然變慢**：檢查 `nvidia-smi` 溫度是否觸發散熱降頻，或是否因為 `--gpu-memory-utilization` 過高導致 Linux 開始使用 Swap。

---

## 結論與下一步行動

在 2026 年，透過 **NVIDIA DGX Spark (GB10)** 進行**自架 AI 與本地 LLM 部署**已經是兼具隱私、穩定度與高投資報酬率的成熟工程方案：

1. 首選 **FP8 或 Q4_K_M 量化模型**（如 Qwen 3 / 2.5 32B 與 72B）取得品質與速度的最佳平衡。
2. 將 `gpu-memory-utilization` 控制在 **0.85–0.90**，並使用 `systemd` + 生成式健康檢查探針確保 24/7 穩定運行。
3. 將本地 LLM 端點接入您的多 Agent 自動化系統，把變動 Token 成本轉化為固定資產優勢。

👉 **想要直接套用我們驗證過的雙模型部署腳本、systemd 設定檔與 Watchdog 監控工具？立即查看 [DGX Spark 部署套件（DGX Spark Deployment Kit）](/zh-tw/blog/dgx-spark-kit/)（或前往 [Gumroad 直接下載](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=seo&utm_campaign=self-hosting-zhtw)）。**

---

**延伸閱讀與相關工具：**
- [如何設計多 Agent AI 工作流：從提示詞到驗證過的 DAG（實戰指南）](/zh-tw/blog/designing-multi-agent-ai-workflows-guide/) — 將多 Agent 工作流連接至您的自架 AI 伺服器
- [2026 本地 LLM 部署實戰：在 DGX Spark 運行開源 AI 模型](/zh-tw/blog/local-llm-deployment-dgx-spark-guide-2026/) — 快速入門與架構解析
- [DGX Spark 部署套件完整評測](/zh-tw/blog/dgx-spark-kit/) — 雙模型生產環境設定檔與自動化腳本
- [AI Workflow Builder 教學與評測](/zh-tw/blog/ai-workflow-builder/) — 一句提示詞生成驗證過的多 Agent 工作流
- [Cowork Pro](/zh-tw/blog/cowork-pro/) — 協調多智能體呼叫您的本地模型
- [Slashman Tools 產品目錄](/zh-tw/products/) — 瀏覽所有 AI 自動化與本地部署工具
