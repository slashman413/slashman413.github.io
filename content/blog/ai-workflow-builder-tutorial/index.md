---
title: "使用 AI Workflow Builder 建立第一個 AI 工作流：完整教學"
date: "2026-08-03T12:00:00+08:00"
description: "從安裝到上線的完整教學：用 AI Workflow Builder 把一句提示詞變成驗證過的 DAG 與可執行的 Python 程式碼。含 Grill-Me 問答、pre-flight 驗證、GitHub 發布的逐步操作。"
slug: "ai-workflow-builder-tutorial"
tags: [ai, workflow, tutorial, grill-me, dag, python, github]
draft: false
schema: "Article"
---

# 使用 AI Workflow Builder 建立第一個 AI 工作流：完整教學

**SEO Keywords**: AI Workflow Builder 教學, 建立 AI 工作流, Grill-Me 教學, 多 Agent 工作流教學, prompt to workflow tutorial, AI workflow tutorial

這篇教學帶你把 [AI Workflow Builder](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=seo&utm_campaign=aiwb) 從安裝一路走到「第一個工作流上線」。全程約 30 分鐘，你會建立一個真實可用的多 Agent 工作流：**每日競品定價監控**。

## 前置需求

- Node.js 22.5+（使用內建 `node:sqlite`）
- npm 10+
- 一個 GitHub 帳號（用於發布步驟，可選）

## Step 0：安裝

```bash
git clone https://github.com/slashman413/ai-workflow-builder.git
cd ai-workflow-builder
npm install          # 安裝 server + web 兩個 workspace
npm run dev          # server :4000 + studio :5173
```

打開 http://localhost:5173。開發模式提供模擬登入（Continue with GitHub），不需要真實憑證。

## Step 1：輸入你的第一句提示詞

在 Studio 的提示輸入框輸入：

```
Build a market research agent that scrapes competitor pricing daily,
analyzes trends, and emails a morning summary to the team
```

按下 **Grill me →**。AI Workflow Builder 不會直接開工——它會先啟動 Grill-Me 問答迴圈，只問這句提示詞裡真正模糊的部分。

## Step 2：回答 Grill-Me 問題（約 3-5 題）

你會被問到類似這樣的問題：

**Q: 成功的執行必須產出什麼單一具體成果？**
→ `A daily markdown report with prices for all 10 competitors`

**Q: 競品清單從哪裡來？**
→ `A URL list I provide in the project settings`

**Q: 怎麼知道這次跑對了？**
→ `All 10 competitors have prices, and sampled values match the source pages`

**Q: 某家網站反爬失敗時怎麼辦？**
→ `Flag it as needing human review and continue with the rest`

每答完一題，右側的 coverage 指示器就會更新。當所有關鍵維度都亮綠燈（ready: true），就可以進入下一步。

## Step 3：產生並驗證工作流 DAG

點擊 **Scaffold**。系統會：

1. 把答案組合成版本化規格（spec.yaml）
2. 建構工作流 DAG——大概長這樣：

```
[URL 清單] → [抓取器 × 10] → [解析器] → [比對/驗證] → [摘要生成] → [Email 發送]
                                        ↑                    ↑
                                  [變更偵測器]          [人工確認佇列]
```

3. 跑 pre-flight 靜態驗證：循環、可達性、schema 比對、工具邊界、安全邊界

如果 DAG 有結構問題（例如解析器被省略，HTML 直接餵給摘要節點），pre-flight 會直接拒絕並告訴你為什麼——**在執行任何東西之前**。

## Step 4：檢視生成的 Python 程式碼

Scaffold 產出的專案包含：

```
interfaces.py          # 型別化介面，每個節點的輸入輸出都有明確型別
main.py                # 可執行入口，continue_on_error=True 的韌性主迴圈
workflow.json          # 驗證過的 DAG 定義
spec.yaml              # 版本化規格（真理來源）
.github/workflows/ci.yml  # 第一天就有的 CI
```

LLM 呼叫標配 retry + fallback（`LLM_MAX_RETRIES`、`DEFAULT_AGENT_FALLBACK`）——生產環境的 LLM 呼叫不可靠，這是標配不是選配。

## Step 5：一鍵發布到 GitHub（可選）

點擊 **Publish**，用 GitHub OAuth 授權（repo scope），編譯後的工作流會在幾秒內 scaffold 成一個全新的 repository，CI 直接開始跑。每次發布都記錄在 publications ledger——發布歷史可稽核。

## Step 6：交給排程器

發布後的工作流是標準 Python 專案：

```bash
pip install -r requirements.txt
# 用 cron 或任何排程器每天跑
0 9 * * * cd /path/to/workflow && python main.py
```

## 常見問題

**Q: 免費層能跑什麼？**
A: 每月 10 次 Grill 會話 + mock 預覽。Team 層（$99/mo，14 天試用）解鎖無限 Grill 與 GitHub 發布。買斷授權的原始碼則完全無限制——你自己部署。

**Q: 服務端會執行我的工作流嗎？**
A: 不會。Studio 只做驗證與模擬（mock）；真正執行的是你本地/自架的生成程式碼。

**Q: LLM key 放哪？**
A: 內建 vault 用 envelope 加密（AES-256-GCM）儲存，永遠不會以明文顯示。

**Q: 跟 Cowork Pro 衝突嗎？**
A: 不衝突。Builder 設計並驗證工作流；Cowork Pro 長期派發執行任務。建議工作流：Builder 設計 → Cowork 執行。

## 下一步

- 讀[如何設計多 Agent AI 工作流](/blog/designing-multi-agent-ai-workflows-guide/)——理解方法論
- 讀[Grill-Me 互動規格設計](/blog/grill-me-spec-design/)——理解問答引擎
- 買斷 [AI Workflow Builder ($99)](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=seo&utm_campaign=aiwb)，開始建你自己的多 Agent 系統
