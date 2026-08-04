# 推文模板 — Newsletter 導流 (Tweet Templates)

Source of truth for X/Twitter posts that drive traffic to
https://slashmantools.us/newsletter/ .

**Account:** @KWC59125740 — the live, API-writable account.
**⚠️ @digitalProductTW is SUSPENDED** (see `~/.priv/twitter-api-config.sh`).
Any future card/creator attribution must use @KWC59125740 (already set in
`hugo.toml` → `twitterHandle`).

**Auto-post:** `scripts/newsletter_tweet.py` (cron: 每週 newsletter 發布後自動推文).
**UTM scheme:** `utm_source=x&utm_medium=social&utm_campaign=newsletter`
(extended with `utm_content=<issue>` when an issue label is given).

---

## 1. 每週 Newsletter 發布推文 (weekly issue announcement)

```
📬 Subscribe for weekly AI tips

One practical AI & automation guide a week — tools, workflows and
lessons from a solo founder.

Free forever. No spam.

https://slashmantools.us/newsletter/?utm_source=x&utm_medium=social&utm_campaign=newsletter
```

With issue label (`--issue "Issue 12"`):

```
📬 Issue 12 is out!

One practical AI & automation guide a week — tools, workflows and
lessons from a solo founder.

Free forever. No spam.

https://slashmantools.us/newsletter/?utm_source=x&utm_medium=social&utm_campaign=newsletter&utm_content=issue-12
```

## 2. 單篇文章導流 (article share, also used by the in-article share block)

```
📬 Free weekly AI tips — one practical AI/automation guide a week.

Just read <article-title> → <article-url>

Subscribe (free, no spam): https://slashmantools.us/newsletter/?utm_source=x&utm_medium=share&utm_campaign=newsletter&utm_content=<slug>
```

## 3. 精簡版 (bio-adjacent / reply thread)

```
Weekly AI tips, one email. Free forever → slashmantools.us/newsletter/
```

---

## 執行方式 (operations)

- Manual: `python3 scripts/newsletter_tweet.py --issue "Issue 13" --dry-run`
- Real post: `python3 scripts/newsletter_tweet.py --issue "Issue 13"`
- Cron: 「Newsletter X 自動推文」runs the script weekly after the email send.
