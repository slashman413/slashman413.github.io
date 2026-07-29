# Lead Capture 配置指南 · Lead Capture Setup

> **已更新 (2026-07):** slashmantools.us 的 Lead Capture 已從 ConvertKit/Kit 佔位表單
> 遷移到**自建 Webhook**（Cloudflare Worker），不再依賴第三方表單供應商。
>
> **Updated (2026-07):** The lead-capture system has moved off the dead
> ConvertKit/Kit placeholder forms to a **self-hosted webhook** (Cloudflare
> Worker). No third-party form provider is required.

## 現在的架構 · Current architecture

```
表單 (sidebar + /toolkit/) ──POST──▶ Cloudflare Worker (/subscribe)
                                        ├─ 驗證 + 去重 email
                                        ├─ honeypot + 限流
                                        ├─ 存入 KV
                                        ├─ 寄送下載連結 (Resend，可選)
                                        └─ 轉發到行銷漏斗 (FORWARD_URL，可選)
```

## 部署的文件 · Deployed files

| 文件 · File                        | 用途 · Purpose                          |
| ---------------------------------- | --------------------------------------- |
| `webhook/worker.js`                | Webhook 端點 · The webhook endpoint     |
| `webhook/wrangler.toml`            | Cloudflare 設定 · Worker config         |
| `webhook/README.md`                | **完整部署說明 · Full deploy guide**    |
| `static/js/lead-capture.js`        | 前端 AJAX 送出 · Shared form client     |
| `static/toolkit/index.html`        | Lead magnet 落地頁 · Landing page       |
| `layouts/partials/sidebar.html`    | 側邊欄訂閱 · Sidebar newsletter widget  |
| `hugo.toml` → `params.leadEndpoint`| 端點網址 · Endpoint URL (single source) |

## 如何上線 · How to go live

完整步驟見 **`webhook/README.md`**。摘要 · In short:

1. `cd webhook && npm install && npx wrangler login`
2. `npx wrangler kv namespace create LEADS` — 把 id 貼進 `wrangler.toml`
3. (可選) `npx wrangler secret put RESEND_API_KEY` — 自動寄送下載信
4. (可選) 在 `wrangler.toml` 設 `FORWARD_URL` 接到 n8n / Make / ESP
5. `npx wrangler deploy`

要換端點網址：改 `hugo.toml` 的 `params.leadEndpoint`（以及 `static/toolkit/index.html`
的 inline `window.LEAD_ENDPOINT`，因為該頁是獨立靜態頁）。
