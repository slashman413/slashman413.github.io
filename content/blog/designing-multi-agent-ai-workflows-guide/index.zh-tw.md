---
title: "如何設計多 Agent AI 工作流：從提示詞到驗證過的 DAG（實戰指南）"
date: "2026-08-03T10:00:00+08:00"
description: "多 Agent AI 工作流設計的完整實戰指南：如何把一句模糊提示詞變成可驗證、可測試、可上生產的 DAG。涵蓋規格先行、DAG 驗證、pre-flight 檢查與程式碼生成的完整方法論。"
slug: "designing-multi-agent-ai-workflows-guide"
tags: [ai, agents, workflow, dag, multi-agent, architecture, guide]
draft: false
schema: "Article"
---

# 如何設計多 Agent AI 工作流：從提示詞到驗證過的 DAG（實戰指南）

**SEO Keywords**: 多 Agent AI 工作流, AI 工作流設計, Agent 編排, 工作流 DAG, AI 架構設計, multi-agent system design, AI workflow architecture

多 Agent AI 系統是 2026 年最被高估、也最被低估的東西。高估的是「貼幾個提示詞就能跑」的錯覺；低估的是「設計一個不會上線就爆的工作流」所需要的工程紀律。

這篇文章是我在設計與實作多 Agent 工作流時總結的實戰方法論，也是 [AI Workflow Builder](https://slashmantools.us/blog/ai-workflow-builder/) 這個工具背後的設計哲學。目標很簡單：**讓模糊的提示詞，變成可驗證、可測試、可上生產的工作流。**

## 為什麼 90% 的多 Agent 專案死在設計期

先說結論：多數多 Agent 專案不是死在程式碼，是死在**規格模糊**。

你對 AI 說「幫我建一個市場研究 agent」——這句話至少有五個洞：

1. **目標**：成功的執行必須產出什麼？一頁報告？一疊 CSV？
2. **輸入**：資料從哪來？給 URL？還是它自己找？
3. **輸出形狀**：Markdown？JSON？寄到信箱？
4. **成功標準**：怎麼知道這次跑對了？什麼時候該拒絕輸出？
5. **邊界情況**：網站掛了、欄位缺了、API key 失效了怎麼辦？

這五個洞，就是「五個維度」。**任何一個沒釘死，工作流就是未定義行為**——AI 會用最合理的方式猜，而猜錯的代價在上線後才付。

## 方法論：規格先行，程式碼後到

正確的順序不是「寫程式 → 除錯」，而是：

```
提示詞（模糊）
  → 互動問答（只問真正模糊的維度）
  → 版本化規格（spec）
  → 驗證過的 DAG（結構檢查）
  → 程式碼生成（型別化、有 retry、有 CI）
```

### Step 1：把「模糊」變成「問題」

不要試圖一次問完所有事。互動式問答的原則是：**只問真正模糊的部分，並且一次只問一題**。

好的問題長這樣：「成功的執行必須產出什麼單一具體成果？」——它逼使用者把「市場研究」釘成「一份包含 5 家競品定價的每日 Markdown 報告」。

關鍵設計：每個問題都要標註**維度**（goal / inputs / outputs / constraints / success / edge_cases）與**是否關鍵**（critical）。只有當所有關鍵維度都有答案時，規格才算 ready。

### Step 2：把答案變成規格

每個答案都進入版本化規格（spec.yaml）。為什麼要版本化？因為規格是工作流唯一的真理來源——程式碼可以重新生成，但「當初為什麼這樣設計」必須可稽核。

### Step 3：把規格變成驗證過的 DAG

DAG（有向無環圖）是工作流的骨架：節點是 agent/工具，邊是資料依賴。骨架必須在設計期就接受靜態驗證：

- **環偵測**：A 等 B、B 等 A → 死鎖，直接拒絕
- **可達性**：孤島節點（沒有輸入來源）與不可達節點（輸出沒人用）→ 白工
- **Schema 比對**：上游輸出型別 ≠ 下游輸入型別 → 執行期必然炸
- **工具邊界**：節點只能使用 allow-list 內的工具 → 安全邊界

這四項檢查全部是靜態的——**不需要執行任何東西**，就能攔下會在上線時爆炸的結構問題。

### Step 4：把 DAG 變成可執行的程式碼

驗證過的 DAG 生成程式碼時，有三個不可妥協的要素：

1. **型別化介面**（interfaces.py）：每個節點的輸入輸出都有明確型別，IDE 與靜態檢查器都認得
2. **Retry + fallback**：LLM 呼叫不是可靠的——`LLM_MAX_RETRIES`、`DEFAULT_AGENT_FALLBACK`、`continue_on_error=True` 是標配
3. **CI 從第一天就在**：生成的專案直接附 GitHub Actions workflow，合規即測試

## 實戰案例：競品定價監控工作流

把方法論套到一個真實案例。提示詞：「抓競品價格，每天寄摘要」。

**Grill-Me 問答後釐清的規格：**

```yaml
goal: 每天上午 9 點產出競品定價摘要報告
inputs:
  - source: 使用者提供的競品 URL 清單 (10 家)
outputs:
  - format: markdown 報告，寄到 team@company.com
success_criteria:
  - 所有 10 家競品都有價格記錄
  - 價格與來源頁面一致（抽樣驗證）
edge_cases:
  - 網站改版/反爬 → 標記該競品為「待人工確認」，不中斷流程
```

**驗證過的 DAG：**

```
[URL 清單] → [抓取器 × 10] → [解析器] → [比對/驗證] → [摘要生成] → [Email 發送]
                                      ↑                    ↑
                                 [變更偵測器]          [人工確認佇列]
```

結構檢查會抓出：如果「抓取器」與「摘要生成」之間沒有「解析器」，schema 就不匹配（HTML ≠ markdown），pre-flight 直接拒絕。

## 五個實戰原則

1. **模糊要付費，越早付越便宜**：問答環節花 10 分鐘，好過上線後花 10 小時
2. **靜態驗證優於動態測試**：能在設計期攔下的，不要留到執行期
3. **一次問一題**：使用者對「牆上的 20 個問題」的耐受度是 0
4. **規格是真理來源**：程式碼可以重新生成，規格必須可稽核
5. **生成物的工程品質 = 你的品牌品質**：型別、retry、CI 一個都不能少

## 自己動手

這套方法論已經工具化了：[AI Workflow Builder](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=seo&utm_campaign=aiwb) 實作了完整的 Grill-Me 規格迴圈、DAG 驗證器與 Python 程式碼生成。$99 一次買斷、MIT 授權、自架部署——適合把多 Agent 工作流當工程做的團隊。

延伸閱讀：[Grill-Me 互動規格設計：讓 AI 只問該問的問題](/blog/grill-me-spec-design/) · [使用 AI Workflow Builder 建立第一個 AI 工作流](/blog/ai-workflow-builder-tutorial/) · [Cowork Pro：多 Agent 任務編排](/blog/cowork-pro/)
