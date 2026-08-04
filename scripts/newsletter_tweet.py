#!/usr/bin/env python3
"""
newsletter_tweet.py — auto-tweet the weekly newsletter to drive newsletter
signups from X/Twitter.

Posts ONE tweet announcing the current newsletter issue, with the
"📬 Subscribe for weekly AI tips" CTA and a UTM-tagged link to
slashmantools.us/newsletter/ so the social → newsletter journey is
attributable in Plausible/GA and in lead-capture Worker records.

Account: @KWC59125740 (the live, API-writable account — @digitalProductTW is
suspended, see ~/.priv/twitter-api-config.sh). Credentials are read from
~/.priv/twitter-api-config.sh (OAuth 1.0a user context).

Usage:
  python3 scripts/newsletter_tweet.py                       # weekly issue tweet
  python3 scripts/newsletter_tweet.py --issue "Issue 12"    # with issue label
  python3 scripts/newsletter_tweet.py --dry-run             # print, don't post

Designed to be invoked by a weekly cron job right after the newsletter email
sends (see ~/.hermes/cron/jobs.json — "Newsletter X 自動推文").
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

CRED_FILE = Path(os.environ.get("X_CRED_FILE", str(Path.home() / ".priv/twitter-api-config.sh")))

NEWSLETTER_URL = os.environ.get(
    "NEWSLETTER_URL", "https://slashmantools.us/newsletter/?utm_source=x&utm_medium=social&utm_campaign=newsletter"
)

TEMPLATE = (
    "📬 Subscribe for weekly AI tips\n\n"
    "One practical AI & automation guide a week — tools, workflows and "
    "digital-product lessons from a solo founder who ships alone.\n\n"
    "Free forever. No spam.\n\n"
    "{url}"
)


def load_creds(path: Path) -> dict:
    cfg = {}
    for line in path.read_text().splitlines():
        m = re.match(r'^\s*([A-Z_]+)="?([^"\n]*)"?\s*$', line)
        if m and m.group(1).startswith("X_"):
            cfg[m.group(1)] = m.group(2)
    missing = [k for k in ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET") if not cfg.get(k)]
    if missing:
        raise SystemExit(f"Missing credentials in {path}: {missing}")
    return cfg


def post_tweet(text: str, dry_run: bool = False) -> None:
    from requests_oauthlib import OAuth1Session

    cfg = load_creds(CRED_FILE)
    oauth = OAuth1Session(
        cfg["X_API_KEY"],
        client_secret=cfg["X_API_SECRET"],
        resource_owner_key=cfg["X_ACCESS_TOKEN"],
        resource_owner_secret=cfg["X_ACCESS_SECRET"],
    )
    if dry_run:
        print("DRY-RUN — would post:\n" + text)
        return
    r = oauth.post("https://api.twitter.com/2/tweets", json={"text": text[:280]})
    data = r.json()
    if r.status_code == 201 and data.get("data", {}).get("id"):
        tid = data["data"]["id"]
        print(f"✅ Tweet posted: https://x.com/i/status/{tid}")
    else:
        print(f"❌ Tweet failed ({r.status_code}): {data}", file=sys.stderr)
        sys.exit(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--issue", default="", help="issue label, e.g. 'Issue 12'")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    text = TEMPLATE.format(url=NEWSLETTER_URL)
    if args.issue:
        text = f"📬 {args.issue} is out!\n\n" + text
    post_tweet(text, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
