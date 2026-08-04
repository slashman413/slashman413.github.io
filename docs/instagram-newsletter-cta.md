# Instagram 導流 — Newsletter CTA (@ytstories04132026)

Goal: point @ytstories04132026 traffic at
https://slashmantools.us/newsletter/ .

## 狀態總覽 (status)

| 項目 | 狀態 | 方式 |
|------|------|------|
| Bio link → /newsletter/ | ⚠️ 手動 (見下) | Instagram App 內編輯 (需 User token 才能 API) |
| Posts 內 CTA | ✅ 已就緒 | `social-autopost-app/content-packages.md` instagram 模板已含 CTA |
| Stories link sticker | ⚠️ 手動 | Stories 內建 link sticker (API 不支援) |
| UTM 追蹤 | ✅ | 所有連結都帶 `utm_source=instagram&utm_medium=social&utm_campaign=newsletter` |

## 為什麼 bio/stories 需要手動

目前 `~/.priv/slashman413-meta-graph-api-post-bots-tokens` 只有 **App token**
(應用程式級)，**沒有 User token**。Instagram Graph API 的 profile 編輯
(biography / external link) 與 Stories link sticker 都要求
`instagram_business_manage` 級別的 **User access token**，App token 會回傳
`OAuthException #2500 (an active access token must be used)`。

已驗證 (2026-08-04): 用 App token 呼叫 `GET /me?fields=instagram_business_account`
回傳 code 2500。若之後拿到 User token（IG 帳號有密碼 + Meta Developer app
`instagram_business_basic|content_publish` 授權），可把以下 API 呼叫寫進
`social-autopost-app`：

```
POST /v21.0/{ig-user-id}?fields=biography={...}&access_token={USER_TOKEN}
```

## Bio 文案 (手動貼上)

App → 編輯個人檔案：

```
Gentle Soul 🎧 Lofi & ambient for deep focus.
📬 Free weekly AI tips: slashmantools.us/newsletter/
```

- **Link (website)**: `https://slashmantools.us/newsletter/?utm_source=instagram&utm_medium=social&utm_campaign=newsletter`
  （IG 只允許一個可點連結 — 放 newsletter 是最高價值的單一目的地）
- 若想保留其他工具入口，可改用 Linktree，但第一順位仍是 newsletter。

## Stories link sticker (手動)

每週 newsletter 發布後：

1. IG 首頁 → 你的頭像 → 新增限時動態
2. 加入背景圖（可用 `scripts/make_youtube_banner.py` 產出的 QR 圖，或文章 og.png）
3. 點「貼圖」→「連結」→ 貼上
   `https://slashmantools.us/newsletter/?utm_source=instagram&utm_medium=stories&utm_campaign=newsletter`
4. 文案：`📬 Free weekly AI tips — no spam, unsubscribe anytime`

> 帳號需要 ≥10K 追蹤或藍勾才能用 link sticker — 若尚未解鎖，
> 改用「問答貼圖 + 貼文置頂留言帶連結」替代。

## Posts CTA (已自動化)

`social-autopost-app/content-packages.md` 的 instagram 模板已更新：

```
One-person software portfolio, running entirely on free infrastructure.
...
📬 Free weekly AI tips — one practical AI/automation guide a week, no spam.
[media: https://slashmantools.us/og.png]
[link: https://slashmantools.us/newsletter/?utm_source=instagram&utm_medium=social&utm_campaign=newsletter]
```

下次 `social-autopost publish` 跑 instagram 時，每則貼文 caption 會帶
newsletter CTA，連結指向帶 UTM 的訂閱頁。
