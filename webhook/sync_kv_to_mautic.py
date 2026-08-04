#!/usr/bin/env python3
"""
sync_kv_to_mautic.py — Sync captured leads from Cloudflare Worker KV to Mautic.

Architecture:
  Form → Cloudflare Worker → KV storage (real-time, already working)
                                              ↓ (this script, runs on cron)
                                     Mautic API (localhost:8081)

The Worker exposes a GET /leads endpoint (requires MAUTIC_FORWARD_TOKEN).
This script polls it, creates/updates Mautic contacts, and tracks what's been synced.

Run:  python3 sync_kv_to_mautic.py         # one-shot sync
      python3 sync_kv_to_mautic.py --watch  # poll every 60s (for testing)

Set env vars:
  LEADS_API_URL    — Worker GET /leads URL
  MAUTIC_FORWARD_TOKEN — secret token for /leads auth
  MAUTIC_BASE_URL  — Mautic base URL (default: http://localhost:8081)
  MAUTIC_API_USER  — Mautic API username
  MAUTIC_API_PASSWORD — Mautic API password
  SYNC_STATE_FILE  — path to track last sync timestamp (default: .synced_leads.json)
"""
from __future__ import annotations

import os
import sys
import json
import time
import base64
import hashlib
import argparse
from typing import Any
from urllib import request as urlrequest
from urllib import parse as urlparse
from urllib.error import HTTPError, URLError

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Minimal Mautic client (same pattern as mautic_client.py)
# ---------------------------------------------------------------------------
class MauticAPI:
    def __init__(self, base_url: str, username: str, password: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        self._headers = {
            "Authorization": f"Basic {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self.timeout = timeout

    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        url = f"{self.base_url}/api/{path.lstrip('/')}"
        data = json.dumps(payload).encode() if payload else None
        req = urlrequest.Request(url, data=data, headers=self._headers, method=method)
        try:
            with urlrequest.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode() or "{}"
                return json.loads(body)
        except HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"{method} {url} -> HTTP {e.code}: {body[:500]}") from e
        except URLError as e:
            raise RuntimeError(f"{method} {url} -> {e.reason}") from e

    def find_contact_by_email(self, email: str) -> dict | None:
        """Find a Mautic contact by email. Returns contact dict or None."""
        data = self._request("GET", f"contacts?search={urlparse.quote(email)}&limit=1")
        contacts = data.get("contacts", {})
        if isinstance(contacts, list):
            for c in contacts:
                if c.get("fields", {}).get("core", {}).get("email", {}).get("value", "").lower() == email.lower():
                    return c
        elif isinstance(contacts, dict):
            for c in contacts.values():
                if c.get("fields", {}).get("core", {}).get("email", {}).get("value", "").lower() == email.lower():
                    return c
        return None

    def create_contact(self, email: str, first_name: str = "", tags: list[str] | None = None) -> dict:
        """Create a Mautic contact."""
        payload: dict[str, Any] = {
            "email": email,
            "firstname": first_name,
            "tags": tags or [],
            "ipAddress": "",
            "overwriteWithBlank": False,
        }
        return self._request("POST", "contacts/new", payload)["contact"]

    def update_contact_tags(self, contact_id: int, add_tags: list[str]) -> dict:
        """Add tags to an existing contact."""
        return self._request(
            "PATCH", f"contacts/{contact_id}/edit",
            {"tags": add_tags, "overwriteWithBlank": False}
        )


# ---------------------------------------------------------------------------
# Worker KV leads fetcher
# ---------------------------------------------------------------------------
def fetch_leads(api_url: str, token: str, since: str = "", limit: int = 500) -> list[dict]:
    """Fetch leads from the Worker's GET /leads endpoint."""
    params = f"token={urlparse.quote(token)}&limit={limit}"
    if since:
        params += f"&since={urlparse.quote(since)}"
    url = f"{api_url.rstrip('/')}/leads?{params}"
    req = urlrequest.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json",
    })
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            if not data.get("ok"):
                raise RuntimeError(f"API returned error: {data.get('error', 'unknown')}")
            return data.get("leads", [])
    except HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"GET {url} -> HTTP {e.code}: {body[:500]}") from e
    except URLError as e:
        raise RuntimeError(f"GET {url} -> {e.reason}") from e


# ---------------------------------------------------------------------------
# Main sync logic
# ---------------------------------------------------------------------------
def load_state(state_file: str) -> dict:
    """Load sync timestamp from state file."""
    if os.path.exists(state_file):
        with open(state_file) as f:
            return json.load(f)
    return {"last_sync": "", "synced_emails": {}}

def save_state(state_file: str, state: dict):
    """Save sync state."""
    os.makedirs(os.path.dirname(state_file) or ".", exist_ok=True)
    with open(state_file, "w") as f:
        json.dump(state, f, indent=2)

def sync_once(mautic: MauticAPI, api_url: str, forward_token: str, state: dict, limit: int = 500) -> int:
    """Sync all new leads from Worker KV to Mautic. Returns count of new contacts created."""
    since = state.get("last_sync", "")
    leads = fetch_leads(api_url, forward_token, since=since, limit=limit)
    if not leads:
        return 0

    new_count = 0
    synced = state.setdefault("synced_emails", {})
    latest_ts = since

    for lead in leads:
        email = lead.get("email", "").lower().strip()
        if not email:
            continue
        if email in synced:
            continue

        first_name = lead.get("first_name", "")
        tags = [t.strip() for t in lead.get("tags", "").split(",") if t.strip()]
        source = lead.get("source", "web-form").strip()
        # A/B test cell (cta-ab.js → Worker lead.variant, e.g. "leadmagnet:b2").
        # Tagged so conversion-per-cell is queryable in Mautic without any
        # dashboard work: search contacts by tag "variant-leadmagnet-b2".
        variant = lead.get("variant", "").strip()
        if variant:
            vtag = "variant-" + "".join(c if c.isalnum() or c in "_-" else "-" for c in variant)
            if vtag not in tags:
                tags.append(vtag)

        # Add source as a tag
        if source and source not in tags:
            tags.append(f"source-{source}")

        # Every new subscriber enters the 7-Day Welcome campaign (segment 26 is
        # filtered on the welcome-7day tag; campaign "Slashman 7-Day Welcome").
        if "welcome-7day" not in tags:
            tags.append("welcome-7day")

        # Also enter the weekly newsletter broadcast list (segment 21 filters on
        # the "newsletter" tag; email 16 "Newsletter Issue 1" goes out every
        # Tuesday 09:00 via mautic:broadcasts:send --id=16).
        if "newsletter" not in tags:
            tags.append("newsletter")

        try:
            existing = mautic.find_contact_by_email(email)
            if existing:
                contact_id = existing["id"]
                print(f"  Contact exists: {email} (id={contact_id}), adding tags: {tags}")
                if tags:
                    mautic.update_contact_tags(contact_id, tags)
            else:
                print(f"  Creating contact: {email} (first_name={first_name}, tags={tags})")
                mautic.create_contact(email, first_name, tags)
                new_count += 1

            synced[email] = {
                "synced_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "tags": tags,
            }
        except Exception as e:
            print(f"  !! Failed to sync {email}: {e}", file=sys.stderr)
            continue

        # Track latest timestamp
        ts = lead.get("created_at") or lead.get("updated_at") or ""
        if ts > latest_ts:
            latest_ts = ts

    if latest_ts:
        state["last_sync"] = latest_ts
    save_state(STATE_FILE, state)
    return new_count


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
STATE_FILE = os.environ.get("SYNC_STATE_FILE", os.path.join(HERE, ".synced_leads.json"))

def main():
    parser = argparse.ArgumentParser(description="Sync Worker KV leads to Mautic")
    parser.add_argument("--watch", action="store_true", help="Poll every 60s")
    parser.add_argument("--interval", type=int, default=60, help="Poll interval in seconds")
    parser.add_argument("--limit", type=int, default=500, help="Max leads per fetch")
    args = parser.parse_args()

    api_url = os.environ.get("LEADS_API_URL", "http://100.80.243.33:8081")
    forward_token = os.environ.get("MAUTIC_FORWARD_TOKEN", "")
    mautic_base = os.environ.get("MAUTIC_BASE_URL", "http://localhost:8081")
    mautic_user = os.environ.get("MAUTIC_API_USER", "")
    mautic_pass = os.environ.get("MAUTIC_API_PASSWORD", "")

    if not forward_token:
        print("!! MAUTIC_FORWARD_TOKEN not set. Set it to match what's in the Worker's secret.", file=sys.stderr)
        sys.exit(1)
    if not mautic_user or not mautic_pass:
        print("!! MAUTIC_API_USER / MAUTIC_API_PASSWORD not set.", file=sys.stderr)
        sys.exit(1)

    mautic = MauticAPI(mautic_base, mautic_user, mautic_pass)
    state = load_state(STATE_FILE)

    print(f"==> Syncing {api_url}/leads → {mautic_base}/api/contacts")
    if args.watch:
        print(f"    Watching every {args.interval}s. Ctrl+C to stop.")
        while True:
            try:
                count = sync_once(mautic, api_url, forward_token, state, args.limit)
                if count:
                    print(f"    Synced {count} new contact(s). Waiting {args.interval}s...")
                else:
                    print(f"    No new leads. Waiting {args.interval}s...")
                time.sleep(args.interval)
            except KeyboardInterrupt:
                print("\nStopped.")
                break
            except Exception as e:
                print(f"    Error: {e}", file=sys.stderr)
                time.sleep(args.interval)
    else:
        count = sync_once(mautic, api_url, forward_token, state, args.limit)
        print(f"    Synced {count} new contact(s). Total synced: {len(state.get('synced_emails', {}))}")

if __name__ == "__main__":
    main()
