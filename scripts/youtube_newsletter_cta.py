#!/usr/bin/env python3
"""
youtube_newsletter_cta.py — add the newsletter CTA to Gentle Soul videos.

Does two things (idempotent — safe to re-run):
  1. Appends a newsletter signup block to every video description that does not
     already contain it (via videos.update).
  2. Inserts a top-level "subscribe" comment CTA on the most recent N videos
     that don't already have one (via commentThreads.insert).

Channel: Gentle Soul (UCvd4nL04uE7lFqkKtzsOwLg)
Credentials: ~/.priv/youtube_token.json (OAuth installed-app, refreshed live)
             + ~/.priv/google/client_secret_*.json (client id/secret)
Scope: youtube.force-ssl (already granted — the upload bot uses the same token)

Usage:
  python3 scripts/youtube_newsletter_cta.py              # descriptions + 3 comments
  python3 scripts/youtube_newsletter_cta.py --comments 5
  python3 scripts/youtube_newsletter_cta.py --dry-run

Notes:
  - Pinning a comment is NOT exposed via the YouTube Data API — after this
    script inserts the CTA comment, pin it manually in YouTube Studio
    (Comments → pin) so it sits at the top of the thread.
  - End screens are Studio-only too (Editor → End screen) — not scriptable.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import google.auth.transport.requests

HOME = Path.home()
TOKEN_PATH = HOME / ".priv/youtube_token.json"
SECRET_DIR = HOME / ".priv/google"

NEWSLETTER_URL = "https://slashmantools.us/newsletter/?utm_source=youtube&utm_medium=video-description&utm_campaign=newsletter"

DESCRIPTION_CTA = f"""

📬 Free weekly AI tips — practical AI tools, automation guides & digital-product lessons, one email a week. No spam, unsubscribe anytime.
👉 Subscribe: {NEWSLETTER_URL}"""

COMMENT_CTA = (
    "🎧 Enjoying the vibes? 📬 Get one practical AI/automation guide a week — "
    f"free, no spam → {NEWSLETTER_URL}"
)


def load_creds():
    token = json.loads(TOKEN_PATH.read_text())
    creds = Credentials(
        token=token.get("access_token"),
        refresh_token=token.get("refresh_token"),
        client_id=token.get("client_id"),
        client_secret=token.get("client_secret"),
        token_uri=token.get("token_uri", "https://oauth2.googleapis.com/token"),
        scopes=token.get("scope", "").split(),
    )
    creds.refresh(google.auth.transport.requests.Request())
    return build("youtube", "v3", credentials=creds)


def channel_videos(yt, channel_id):
    """Yield (video_id, title, description) for every upload, newest first."""
    req = yt.playlistItems().list(
        part="snippet,contentDetails",
        playlistId="UU" + channel_id[2:],  # uploads playlist id
        maxResults=50,
    )
    while req:
        resp = req.execute()
        for item in resp.get("items", []):
            vid = item["contentDetails"]["videoId"]
            sn = item["snippet"]
            yield vid, sn.get("title", ""), sn.get("description", "")
        req = yt.playlistItems().list_next(req, resp)


def update_description(yt, video_id, description, dry_run):
    # videos.update requires the full snippet (title etc.) — fetch the current
    # video first so we never blank the title/category.
    vid = yt.videos().list(part="snippet,status", id=video_id).execute()
    if not vid.get("items"):
        print(f"  ✗ video {video_id} not found")
        return False
    sn = vid["items"][0]["snippet"]
    body = {
        "id": video_id,
        "snippet": {
            "title": sn.get("title", ""),
            "description": description,
            "categoryId": sn.get("categoryId", "10"),
        },
        "status": {"privacyStatus": vid["items"][0]["status"].get("privacyStatus", "public")},
    }
    if dry_run:
        print(f"  [dry-run] would update desc for {video_id}")
        return True
    try:
        yt.videos().update(part="snippet,status", body=body).execute()
        return True
    except Exception as e:
        print(f"  ✗ desc update failed for {video_id}: {e}")
        return False


def has_our_comment(yt, video_id, text):
    """True if the channel already left a top-level comment containing CTA text."""
    try:
        threads = (
            yt.commentThreads()
            .list(part="snippet", videoId=video_id, maxResults=50)
            .execute()
        )
        for t in threads.get("items", []):
            c = t["snippet"]["topLevelComment"]["snippet"]
            if c.get("authorChannelId", {}).get("value") and text.split()[0] in c.get("textOriginal", ""):
                return True
    except Exception:
        pass
    return False


def insert_comment(yt, video_id, text, dry_run):
    if has_our_comment(yt, video_id, text):
        print(f"  = comment already present on {video_id}, skipping")
        return True
    if dry_run:
        print(f"  [dry-run] would comment on {video_id}")
        return True
    try:
        yt.commentThreads().insert(
            part="snippet",
            body={"snippet": {"videoId": video_id, "topLevelComment": {"snippet": {"textOriginal": text}}}},
        ).execute()
        return True
    except Exception as e:
        print(f"  ✗ comment failed for {video_id}: {e}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--comments", type=int, default=3, help="comment CTA on N newest videos")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    yt = load_creds()
    ch = yt.channels().list(part="snippet,contentDetails", mine=True).execute()
    if not ch.get("items"):
        raise SystemExit("No channel found for token — is this the Gentle Soul token?")
    channel = ch["items"][0]
    channel_id = channel["id"]
    print(f"Channel: {channel['snippet']['title']} ({channel_id})")

    videos = list(channel_videos(yt, channel_id))
    print(f"Found {len(videos)} videos")

    updated = 0
    for vid, title, desc in videos:
        if DESCRIPTION_CTA.strip() in (desc or ""):
            continue
        new_desc = (desc or "").rstrip() + DESCRIPTION_CTA
        if update_description(yt, vid, new_desc, args.dry_run):
            updated += 1
        if args.dry_run:
            break  # just show the pattern once

    print(f"\nDescriptions updated: {updated}")

    commented = 0
    for vid, title, _ in videos[: args.comments]:
        if insert_comment(yt, vid, COMMENT_CTA, args.dry_run):
            commented += 1

    print(f"Comments inserted: {commented} (pin manually in Studio)")
    print("\nReminder: pin the CTA comment + add end screens in YouTube Studio.")


if __name__ == "__main__":
    sys.exit(main())
