#!/usr/bin/env python3
"""
Local helper to capture IG and FB sessions for use in GitHub Actions.

Run this ONCE on your local machine:
  python capture_sessions.py --ig    (capture Instagram session)
  python capture_sessions.py --fb    (capture Facebook session via visible browser)
  python capture_sessions.py --all   (capture both)

After running, copy the JSON file contents into GitHub Secrets:
  IG_SESSION_JSON = content of ig_session.json
  IG_USERNAME     = your Instagram username
  IG_PASSWORD     = your Instagram password
  FB_SESSION_JSON = content of fb_pw_session.json
"""
import sys, json
from pathlib import Path

THIS_DIR     = Path(__file__).parent
IG_CREDS     = THIS_DIR / "ig_creds.json"
IG_SESSION   = THIS_DIR / "ig_session.json"
FB_CREDS     = THIS_DIR / "fb_creds.json"
FB_SESSION   = THIS_DIR / "fb_pw_session.json"


def capture_ig():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Install: pip install playwright && playwright install chromium")
        return

    creds = json.loads(IG_CREDS.read_text(encoding="utf-8-sig")) if IG_CREDS.exists() else {}
    print("[ig] Opening browser — log in to Instagram (handles 2FA / FB-linked accounts)...", flush=True)

    import time
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
            locale="zh-TW",
            is_mobile=True,
        )
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        page = context.new_page()
        page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(2)

        # Pre-fill if credentials available
        if creds and page.locator('input[name="username"]').count() > 0:
            page.locator('input[name="username"]').fill(creds.get("username", ""))
            page.locator('input[name="password"]').fill(creds.get("password", ""))

        print("[ig] Complete login in the browser window (including 2FA / FB login if needed), then press ENTER here...")
        input()

        context.storage_state(path=str(IG_SESSION))
        print(f"[ig] Session saved to: {IG_SESSION}")
        print(f"\n=== Copy this as GitHub Secret IG_SESSION_JSON ===")
        print(IG_SESSION.read_text(encoding="utf-8")[:200] + "...\n")
        print(f"Full path: {IG_SESSION}\n")
        browser.close()


def capture_fb():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Install: pip install playwright && playwright install chromium")
        return

    creds = json.loads(FB_CREDS.read_text(encoding="utf-8-sig"))
    print(f"[fb] Opening browser — log in with 2FA as needed...", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,  # visible browser so user can handle 2FA
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="zh-TW",
        )
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        page = context.new_page()
        page.goto("https://www.facebook.com/login", wait_until="networkidle", timeout=30000)

        # Pre-fill credentials
        if page.locator("#email").count() > 0:
            page.locator("#email").fill(creds.get("email", ""))
            page.locator("#pass").fill(creds.get("password", ""))

        print("[fb] Complete login (2FA etc.) in the browser window, then press ENTER here...")
        input()

        context.storage_state(path=str(FB_SESSION))
        print(f"[fb] Session saved to: {FB_SESSION}")
        print(f"\n=== Copy this as GitHub Secret FB_SESSION_JSON ===")
        print(FB_SESSION.read_text(encoding="utf-8")[:200] + "...\n")
        print(f"Full path: {FB_SESSION}\n")
        browser.close()


def main():
    args = set(sys.argv[1:])
    if "--all" in args:
        capture_ig()
        capture_fb()
    elif "--ig" in args:
        capture_ig()
    elif "--fb" in args:
        capture_fb()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
