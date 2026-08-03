---
title: "Grill-Me 互動規格設計：讓 AI 只問該問的問題"
date: "2026-08-03T11:00:00+08:00"
description: "Grill-Me 互動規格迴圈的完整設計解析：如何讓 AI 只問真正模糊的問題、如何用維度與關鍵性標記追蹤規格覆蓋率、以及為什麼一次問一題是互動設計的黃金法則。"
slug: "grill-me-spec-design"
tags: [ai, grill-me, spec, prompt-engineering, interaction-design, workflow]
draft: false
schema: "Article"
---

# Grill-Me 互動規格設計：讓 AI 只問該問的問題

**SEO Keywords**: Grill-Me, 互動規格設計, AI 問答設計, 規格覆蓋率, 提示詞工程, spec-driven development, interaction design for AI

「問對問題」是 AI 系統設計裡最被低估的能力。

市面上多數「AI 工作流」工具的互動設計分兩種：**一次問完 20 題**（使用者直接關掉），或**完全不問**（上線後默默誤解）。Grill-Me 迴圈是第三條路：**只問真正模糊的部分，一次問一題，問到規格覆蓋率滿為止。**

這篇文章拆解 Grill-Me 的設計，也是 [AI Workflow Builder](https://slashmantools.us/blog/ai-workflow-builder/) 的核心互動引擎的說明書。

## 核心概念：維度（Dimensions）與關鍵性（Criticality）

Grill-Me 把「模糊」結構化成六個維度：

| 維度 | 要釘死的問題 |
|------|-------------|
| goal | 成功的執行必須產出什麼單一具體成果？ |
| inputs | 輸入從哪來？格式是什麼？ |
| outputs | 輸出形狀是什麼？送到哪？ |
| constraints | 有什麼硬性限制？（預算、時間、工具、法規） |
| success | 怎麼知道跑對了？什麼時候該拒絕輸出？ |
| edge_cases | 失敗時的行為是什麼？ |

每個維度有兩層標記：**是否關鍵（critical）**與**是否已回答（covered）**。規格只有在「所有關鍵維度都被覆蓋」時才算 ready——這就是可程式化的「完成定義」。

```json
{
  "coverage": { "goal": true, "inputs": true, "outputs": false,
                "constraints": false, "success": false, "edge_cases": false },
  "ready": false,
  "missing": ["outputs", "success"],
  "warnings": ["constraints", "edge_cases"]
}
```

## 設計原則一：一次問一題

人類對「問題牆」的耐受度是零。一題一問有四個好處：

1. **認知負荷低**：每個問題都能被認真回答
2. **答案品質高**：單一問題 → 單一焦點 → 更精確的答案
3. **路徑可變**：根據上一題的答案，決定下一題問什麼（自適應）
4. **放棄成本低**：使用者隨時知道「還剩幾題」

## 設計原則二：只問真正模糊的

Grill-Me 不是測謊儀，是**差異化問答**：

- 提示詞已經明確的維度 → **跳過**（例如「寄到 team@company.com」就別再問輸出目標）
- 部分模糊的維度 → 只問缺失的那一塊
- 完全不提的關鍵維度 → 必問（critical）

判斷「模糊」的依據來自規格建構器：每個維度都有閾值，答案不足就列入 missing。

## 設計原則三：問題必須可回答

無效問題長這樣：「你的系統要具備良好的可擴展性嗎？」——廢話，誰會說不要？

有效問題長這樣：「一次執行要處理幾家競品？10 家以下還是 100 家以上？」——它逼使用者做出**具體的、會影響架構的選擇**。

判斷標準：如果「是」與「否」兩種答案不會改變工作流的結構，這個問題就不該問。

## 設計原則四：答案進入版本化規格

每個答案即時寫入版本化規格（spec.yaml）。規格是唯一的真理來源：

- **可稽核**：每個設計決策都有來歷
- **可重現**：同一份規格 → 同一個 DAG → 同一份程式碼
- **可演進**：需求變了 → 改規格 → 重新生成，而不是改膠水程式碼

## 實戰：從「市場研究」到可建構的規格

```
Q1 (goal): 成功的執行必須產出什麼單一具體成果？
A1: 一份包含 5 家競品定價的每日 Markdown 報告

Q2 (inputs): 競品清單從哪來？
A2: 我提供 URL 清單，存在專案設定裡

Q3 (success): 怎麼知道這次跑對了？
A3: 5 家都有價格，且抽樣與來源頁一致

Q4 (edge_cases): 某家網站反爬失敗時？
A4: 標記「待人工確認」，不中斷其他 4 家

→ coverage: goal✓ inputs✓ outputs✓(from prompt) success✓ edge_cases✓ → ready: true
```

注意：outputs 沒有被問——因為提示詞裡已經寫了「每天寄摘要」，這叫**只問真正模糊的**。

## 與傳統 spec-first 的差異

| | 傳統 spec-first | Grill-Me |
|---|---|---|
| 起點 | 空白文件 | 一句提示詞 |
| 問題 | 一次列完（牆） | 一次一題（自適應） |
| 模糊處理 | 全問 | 只問缺的 |
| 完成定義 | 人判斷 | coverage 覆蓋率（程式化） |
| 規格演進 | 重寫文件 | 版本化增量 |

## 什麼時候不該用 Grill-Me

老實說：**目標明確、輸入輸出固定、無失敗路徑**的任務（例如「把這個 CSV 轉成 JSON」）不需要問答。Grill-Me 的價值在模糊度高的任務——多 Agent 系統、自動化管線、研究型 agent。判斷標準：如果提示詞本身就已經是完整規格，直接建構就好。

## 自己動手

Grill-Me 引擎是 [AI Workflow Builder](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=seo&utm_campaign=aiwb) 的開放原始碼核心（MIT 授權），domain 層零框架依賴，可以直接讀原始碼學習或改造成自己的問答引擎。

延伸閱讀：[如何設計多 Agent AI 工作流](/blog/designing-multi-agent-ai-workflows-guide/) · [使用 AI Workflow Builder 建立第一個 AI 工作流](/blog/ai-workflow-builder-tutorial/)
