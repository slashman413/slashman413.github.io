# Meta auto-posting setup (Facebook / Instagram / Threads)

`social_promo.py` can post automatically to FB Pages, Instagram, and Threads via
the **official Graph / Threads APIs** — the sanctioned, ban-safe path (no browser
session replay). It stays **dormant** until you add the GitHub Secrets below.

## Turn it on

Set repository secrets (Settings → Secrets and variables → Actions), then set
`META_AUTOPOST=1`. Missing a platform's tokens just skips that platform.

| Platform  | Secrets | Where to get them |
|-----------|---------|-------------------|
| Facebook Page | `FB_PAGE_ID`, `FB_PAGE_TOKEN` | Meta app → Graph API Explorer → a long-lived **Page** access token with `pages_manage_posts`, `pages_read_engagement` |
| Instagram | `IG_USER_ID`, `IG_GRAPH_TOKEN` | IG **Business/Creator** account linked to the FB Page; `instagram_content_publish` permission. `IG_USER_ID` = the IG-user id from `/{page-id}?fields=instagram_business_account` |
| Threads | `THREADS_USER_ID`, `THREADS_TOKEN` | Threads API app → long-lived user token with `threads_basic`, `threads_content_publish` |
| Enable flag | `META_AUTOPOST` = `1` | turns the whole thing on |

Optional: `PROMO_PLATFORMS` (e.g. `facebook,threads`) limits which platforms post;
empty = all three.

## How it works

- Each run renders one 1080×1080 promo card per selected site (same image used
  for Discord).
- When `META_AUTOPOST=1`, the cards are committed to `promo_images/` and served
  via `raw.githubusercontent.com`, because **IG and Threads image posts require a
  public image URL** (they cannot take a file upload).
- Facebook posts the image via direct file upload (no public URL needed).
- Threads falls back to a text-only post if the image URL isn't available.
- Discord delivery still runs as the notification/record of what went out.

## Token expiry

Long-lived Page/IG tokens last ~60 days; Threads tokens ~60 days and are
refreshable. Rotate them before expiry or posting will silently skip (logged as
FAILED in the Action logs). Consider a reminder or a token-refresh step.

## Ban-safety note

This path uses only official, rate-limited APIs — the approach Meta sanctions for
automation. Do **not** re-enable the old `post_to_threads/instagram/facebook`
session-replay functions; replaying login cookies from a datacenter IP is what
gets accounts suspended.
