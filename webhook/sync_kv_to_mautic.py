#!/usr/bin/env python3
"""
sync_kv_to_mautic.py — Sync captured leads from Cloudflare Worker KV to Mautic.

Architecture:
  Form → Cloudflare Worker → KV storage (real-time, already working)
                                              ↓ (this script, runs on cron)
                                     Mautic API (localhost:8081)

The Worker exposes a GET /leads endpoint (requires ADMIN_TOKEN as a Bearer header).
This script polls it, creates/updates Mautic contacts, and tracks what's been synced.

Run:  python3 sync_kv_to_mautic.py         # one-shot sync
      python3 sync_kv_to_mautic.py --watch  # poll every 60s (for testing)

Set env vars:
  LEADS_API_URL    — Worker GET /leads URL
  ADMIN_TOKEN      — Worker admin secret for /leads auth (sent as a Bearer header)
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
import subprocess
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

    def create_contact(self, email: str, first_name: str = "", tags: list[str] | None = None,
                       ip_address: str = "") -> dict:
        """Create a Mautic contact.

        Pass the visitor's IP (ip_address) so Mautic lead-identification can
        merge this contact with the anonymous pixel lead of the same visitor.
        Without the IP, a form lead and its pixel lead stay as two rows: the
        anonymous one never acquires an email, which dilutes the email-capture
        rate (denominator bloat).
        """
        payload: dict[str, Any] = {
            "email": email,
            "firstname": first_name,
            "tags": tags or [],
            "ipAddress": ip_address or "",
            "overwriteWithBlank": False,
        }
        return self._request("POST", "contacts/new", payload)["contact"]

    def update_contact_tags(self, contact_id: int, add_tags: list[str],
                           ip_address: str = "") -> dict:
        """Add tags (and backfill ipAddress) to an existing contact."""
        payload: dict[str, Any] = {"overwriteWithBlank": False}
        if add_tags:
            payload["tags"] = add_tags
        if ip_address:
            payload["ipAddress"] = ip_address
        return self._request("PATCH", f"contacts/{contact_id}/edit", payload)

    def add_utm_tags(self, contact_id: int, utm: dict[str, str], referer: str = "",
                     user_agent: str = "") -> dict:
        """Record the lead's utm_* values on the contact (Mautic lead_utmtags)."""
        payload: dict[str, Any] = dict(utm)
        if referer:
            payload["referer"] = referer
        if user_agent:
            payload["useragent"] = user_agent
        return self._request("POST", f"contacts/{contact_id}/utm/add", payload)


# ---------------------------------------------------------------------------
# Campaign enrollment (direct DB — Mautic has no public campaign-add API)
# ---------------------------------------------------------------------------
# Mautic's public API (v1/v2) exposes GET/DELETE for campaign leads but no
# POST/PUT to add a lead to a campaign. Campaign auto-enrollment requires a
# trigger event in the campaign graph, which campaign 10 does not have. The
# only reliable path is a direct INSERT INTO campaign_leads on the mautic-db-1
# container; Mautic's mautic:campaigns:trigger cron then schedules the D1/D2/D3
# events. PK is (campaign_id, lead_id) so INSERT IGNORE is idempotent.
MAUTIC_DB_ENV = os.environ.get("MAUTIC_DB_ENV", "/home/wayne/docker/mautic/.env")
MAUTIC_DB_CONTAINER = os.environ.get("MAUTIC_DB_CONTAINER", "mautic-db-1")
MAUTIC_DB_NAME = os.environ.get("MAUTIC_DB_NAME", "mautic_db")
MAUTIC_DB_USER = os.environ.get("MAUTIC_DB_USER", "mautic_user")
WELCOME_CAMPAIGN_ID = int(os.environ.get("WELCOME_CAMPAIGN_ID", "10"))


def _mautic_db_password() -> str:
    """Read the Mautic DB password from the compose .env (no hardcoding)."""
    with open(MAUTIC_DB_ENV) as f:
        for line in f:
            line = line.strip()
            if line.startswith("MYSQL_PASSWORD="):
                return line.split("=", 1)[1]
    raise RuntimeError(f"MYSQL_PASSWORD not found in {MAUTIC_DB_ENV}")


def enroll_in_campaign(lead_id: int, campaign_id: int = WELCOME_CAMPAIGN_ID) -> bool:
    """Enroll a Mautic lead into a campaign via direct DB INSERT (idempotent).

    Requires docker access to the mautic DB container. Returns True on success.
    """
    try:
        pwd = _mautic_db_password()
    except Exception as e:
        print(f"  !! campaign enrollment unavailable ({e})", file=sys.stderr)
        return False
    sql = (
        "INSERT IGNORE INTO campaign_leads "
        "(lead_id, campaign_id, date_added, manually_added, manually_removed, rotation) "
        f"VALUES ({int(lead_id)}, {int(campaign_id)}, NOW(), 1, 0, 0);"
    )
    check = (
        f"SELECT COUNT(*) FROM campaign_leads "
        f"WHERE campaign_id={int(campaign_id)} AND lead_id={int(lead_id)};"
    )
    try:
        proc = subprocess.run(
            ["docker", "exec", MAUTIC_DB_CONTAINER,
             "mysql", f"-u{MAUTIC_DB_USER}", f"-p{pwd}", MAUTIC_DB_NAME, "-e", sql],
            capture_output=True, text=True, timeout=30,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            print(f"  !! campaign enrollment DB error: {err}", file=sys.stderr)
            return False
        # INSERT IGNORE exits 0 even when 0 rows were inserted (e.g. FK
        # violation because the lead id does not exist yet). Verify the row
        # actually exists before reporting success.
        chk = subprocess.run(
            ["docker", "exec", MAUTIC_DB_CONTAINER,
             "mysql", f"-u{MAUTIC_DB_USER}", f"-p{pwd}", MAUTIC_DB_NAME,
             "-N", "-e", check],
            capture_output=True, text=True, timeout=30,
        )
        count = (chk.stdout or "").strip()
        if count and count != "0":
            return True
        print(f"  !! campaign enrollment: no row for lead {lead_id} (FK violation or missing lead)", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  !! campaign enrollment failed: {e}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# Worker KV leads fetcher
# ---------------------------------------------------------------------------
def fetch_leads(api_url: str, token: str, since: str = "", limit: int = 500) -> list[dict]:
    """Fetch leads from the Worker's GET /leads endpoint."""
    params = f"limit={limit}"
    if since:
        params += f"&since={urlparse.quote(since)}"
    url = f"{api_url.rstrip('/')}/leads?{params}"
    req = urlrequest.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    })
    # NOTE: the Worker's /leads does a KV list + one KV get per lead; with ~100
    # leads that takes ~60-90s end to end. timeout=30 was the historical cause
    # of the "sync forever times out" failure (see sync.log) — keep it generous.
    try:
        with urlrequest.urlopen(req, timeout=300) as resp:
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
UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


def mask_email(email: str) -> str:
    """Log-safe form of an address: sync.log must not collect subscriber emails."""
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


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
    # The Worker's /leads is slow (KV list + per-lead get), so transient
    # timeouts happen. Retry 3x with backoff instead of losing the whole
    # 5-minute sync window (historically this was the silent funnel break).
    leads = None
    for attempt in range(3):
        try:
            leads = fetch_leads(api_url, forward_token, since=since, limit=limit)
            break
        except Exception as e:
            if attempt < 2:
                wait_s = 20 * (attempt + 1)
                print(f"  .. fetch failed (attempt {attempt+1}/3): {e} — retrying in {wait_s}s", file=sys.stderr)
                time.sleep(wait_s)
            else:
                print(f"  !! fetch failed after 3 attempts: {e}", file=sys.stderr)
                raise
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
        # Visitor IP from the Worker lead record. Forward it to Mautic so lead
        # identification can merge this form lead with the anonymous pixel lead
        # of the same visitor (prevents denominator bloat in the email-capture
        # rate). Skip placeholder / loopback / 0.0.0.0 values.
        ip = (lead.get("ip") or "").strip()
        if ip in ("0.0.0.0", "::1", "127.0.0.1", "0:0:0:0:0:0:0:1"):
            ip = ""
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
                print(f"  Contact exists: {mask_email(email)} (id={contact_id}), adding tags: {tags}")
                mautic.update_contact_tags(contact_id, tags, ip_address=ip)
            else:
                print(f"  Creating contact: {mask_email(email)} (tags={tags})")
                created = mautic.create_contact(email, first_name, tags, ip_address=ip)
                contact_id = created.get("id")
                new_count += 1

            # Carry the visitor's attribution onto the contact. A failure here
            # is logged, not raised: it must not stop the drip enrollment below.
            utm = {k: v for k in UTM_KEYS if (v := str(lead.get(k) or "").strip())}
            if contact_id and utm:
                try:
                    mautic.add_utm_tags(contact_id, utm, referer=lead.get("referrer") or "",
                                        user_agent=lead.get("user_agent") or "")
                    print(f"  Recorded UTM on lead {contact_id}: {utm}")
                except Exception as e:
                    print(f"  !! UTM write failed for lead {contact_id}: {e}", file=sys.stderr)

            # Enroll into the welcome drip (campaign 10). Mautic has no
            # public campaign-add API; the DB INSERT is idempotent and the
            # mautic:campaigns:trigger cron then schedules D1/D2/D3.
            if contact_id and enroll_in_campaign(contact_id):
                print(f"  Enrolled {mask_email(email)} (lead {contact_id}) in campaign {WELCOME_CAMPAIGN_ID}")

            synced[email] = {
                "synced_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "tags": tags,
            }
        except Exception as e:
            print(f"  !! Failed to sync {mask_email(email)}: {e}", file=sys.stderr)
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
    forward_token = os.environ.get("ADMIN_TOKEN", "")
    mautic_base = os.environ.get("MAUTIC_BASE_URL", "http://localhost:8081")
    mautic_user = os.environ.get("MAUTIC_API_USER", "")
    mautic_pass = os.environ.get("MAUTIC_API_PASSWORD", "")

    if not forward_token:
        print("!! ADMIN_TOKEN not set. Set it to match the Worker's ADMIN_TOKEN secret.", file=sys.stderr)
        sys.exit(1)
    if not mautic_user or not mautic_pass:
        print("!! MAUTIC_API_USER / MAUTIC_API_PASSWORD not set.", file=sys.stderr)
        sys.exit(1)

    try:
        import fcntl
        lock_fd = open("/tmp/sync_kv_to_mautic.lock", "w")
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (BlockingIOError, OSError):
        print("  .. Another sync_kv_to_mautic instance is already running; skipping.")
        return

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
