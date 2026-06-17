#!/usr/bin/env python3
"""
Social media promo poster - runs via GitHub Actions on Tue/Thu/Sat.
Promotes the 5 websites by rotating through them each posting day.

Required GitHub Secrets:
  THREADS_CHROME_SESSION  - full JSON from threads_chrome_session.json
  IG_SESSION_JSON         - full JSON from ig_pw_session.json (optional)
  FB_SESSION_JSON         - full JSON from fb_pw_session.json (optional)
  FB_EMAIL / FB_PASSWORD  - FB credentials if no session (optional)
"""
import os, sys, json, time, datetime
from pathlib import Path

# ── Site rotation ─────────────────────────────────────────────────────────────

SITES = [
    {
        "name": "ETF分析Dashboard",
        "url": "https://slashman413.github.io/tw-etf-dashboard/dashboard.html",
        "text": (
            "📊 台灣 ETF 全方位分析，完全免費！\n\n"
            "追蹤 0050・0056・00878・00713 等主流 ETF\n"
            "✦ 財務面：EPS、ROE、殖利率深度分析\n"
            "✦ 技術面：RSI、MACD、K 線即時圖表\n"
            "✦ 全市場掃描・每日自動更新\n\n"
            "👉 https://slashman413.github.io/tw-etf-dashboard/dashboard.html\n\n"
            "#台股 #ETF #00878 #0050 #投資理財 #免費工具"
        ),
    },
    {
        "name": "大飆股DNA量化篩選",
        "url": "https://slashman413.github.io/twse-surge-stocks-dna/",
        "text": (
            "🧬 大飆股 DNA 量化篩選，完全免費！\n\n"
            "用數據找出下一檔潛力飆股\n"
            "✦ 趨勢拉回 20MA + RSI 進出場策略\n"
            "✦ 2004–2026 年歷史回測驗證\n"
            "✦ 每日掃描台股全市場・即時 K 線分析\n\n"
            "👉 https://slashman413.github.io/twse-surge-stocks-dna/\n\n"
            "#台股 #量化投資 #技術分析 #選股 #免費工具"
        ),
    },
    {
        "name": "台股回測儀表板",
        "url": "https://slashman413.github.io/twse-backtests/",
        "text": (
            "📈 台股策略回測儀表板，完全免費！\n\n"
            "歷史資料驗證你的投資策略\n"
            "✦ K 線突破・MACD 動能・ADX 趨勢強度\n"
            "✦ Williams %R 超買超賣訊號\n"
            "✦ 每年獨立資金模擬・績效一目了然\n\n"
            "👉 https://slashman413.github.io/twse-backtests/\n\n"
            "#台股 #回測 #量化交易 #技術分析 #免費工具"
        ),
    },
    {
        "name": "全球大事3D追蹤",
        "url": "https://slashman413.github.io/global-events-tracker/",
        "text": (
            "🌍 全球大事 3D 地球儀，完全免費！\n\n"
            "互動式地球追蹤全球重大事件\n"
            "✦ 每日 60+ 筆全球新聞・六大洲覆蓋\n"
            "✦ 3D 視覺化・一眼看懂世界局勢\n"
            "✦ 地緣政治・經濟・自然災害即時更新\n\n"
            "👉 https://slashman413.github.io/global-events-tracker/\n\n"
            "#全球局勢 #國際新聞 #地緣政治 #免費工具"
        ),
    },
    {
        "name": "LLM VRAM計算機",
        "url": "https://slashman413.github.io/llm-calc/",
        "text": (
            "🖥️ LLM VRAM 計算機，完全免費！\n\n"
            "跑本地 AI 需要多少記憶體？馬上算出來\n"
            "✦ 支援 7B 到 405B 全規格模型\n"
            "✦ GGUF・AWQ・FP16 量化格式即時對比\n"
            "✦ RTX 4090、M3 Max 等主流硬體一覽\n\n"
            "👉 https://slashman413.github.io/llm-calc/\n\n"
            "#LocalLLM #AI #VRAM #Ollama #免費工具"
        ),
    },
]


def get_site_for_today() -> dict:
    today = datetime.date.today()
    week_num = today.isocalendar()[1]
    day = today.isoweekday()  # 2=Tue, 4=Thu, 6=Sat
    slot = {2: 0, 4: 1, 6: 2}.get(day, 0)
    index = (week_num * 3 + slot) % len(SITES)
    return SITES[index]


# ── Threads posting ───────────────────────────────────────────────────────────

def post_to_threads(text: str) -> bool:
    session_json = os.environ.get("THREADS_CHROME_SESSION", "")
    if not session_json:
        print("[threads] THREADS_CHROME_SESSION not set, skipping.", flush=True)
        return False
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[threads] playwright not installed, skipping.", flush=True)
        return False

    chrome_data = json.loads(session_json)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="zh-TW",
        )
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        # Inject Chrome sessionid cookie
        for cookie in chrome_data.get("cookies", []):
            if cookie.get("name") == "sessionid":
                context.add_cookies([cookie])
                print("[threads] Injected sessionid cookie.", flush=True)
                break

        try:
            page = context.new_page()
            page.goto("https://www.threads.net", wait_until="networkidle", timeout=30000)
            time.sleep(3)

            if "login" in page.url.lower():
                print("[threads] Session expired/invalid, cannot post.", flush=True)
                return False

            print(f"[threads] Logged in. URL: {page.url}", flush=True)

            # Open compose dialog
            opened = False
            for fragment in ["撰寫新貼文", "新串文", "compose a new post", "Type to compose"]:
                el = page.locator(f'[aria-label*="{fragment}"]')
                if el.count() > 0:
                    el.first.click()
                    try:
                        page.locator('[contenteditable="true"]').wait_for(timeout=5000)
                        opened = True
                        break
                    except Exception:
                        time.sleep(2)
                        opened = page.locator('[contenteditable="true"]').count() > 0
                        if opened:
                            break

            if not opened:
                for btn_txt in ["New thread", "新串文"]:
                    el = page.locator(f'[role="button"]:has-text("{btn_txt}")')
                    if el.count() > 0:
                        el.first.click()
                        try:
                            page.locator('[contenteditable="true"]').wait_for(timeout=5000)
                            opened = True
                            break
                        except Exception:
                            pass

            if not opened:
                print("[threads] Could not find compose button.", flush=True)
                return False

            text_box = page.locator('[contenteditable="true"]').first
            text_box.wait_for(timeout=10000)
            text_box.click()
            text_box.fill(text)
            time.sleep(1)

            post_btn = page.locator(
                '[role="button"]:has-text("Post"), button:has-text("Post"), '
                '[role="button"]:has-text("發佈"), button:has-text("發佈")'
            ).last
            post_btn.wait_for(timeout=5000)
            post_btn.click()
            time.sleep(4)

            print("[threads] Posted successfully!", flush=True)
            return True

        finally:
            browser.close()


# ── Instagram posting ─────────────────────────────────────────────────────────

def post_to_instagram(text: str) -> bool:
    session_json = os.environ.get("IG_SESSION_JSON", "")
    ig_user = os.environ.get("IG_USERNAME", "")
    ig_pass = os.environ.get("IG_PASSWORD", "")

    if not session_json and not (ig_user and ig_pass):
        print("[ig] No IG_SESSION_JSON or credentials set, skipping.", flush=True)
        return False

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[ig] playwright not installed, skipping.", flush=True)
        return False

    session_file = Path("/tmp/ig_session.json")
    if session_json:
        session_file.write_text(session_json, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
        )
        ctx_opts = dict(
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
            locale="zh-TW",
            is_mobile=True,
        )
        if session_file.exists():
            context = browser.new_context(storage_state=str(session_file), **ctx_opts)
        else:
            context = browser.new_context(**ctx_opts)
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        try:
            page = context.new_page()
            page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)

            if page.locator('input[name="username"]').count() > 0 and ig_user:
                print("[ig] Logging in...", flush=True)
                page.locator('input[name="username"]').fill(ig_user)
                page.locator('input[name="password"]').fill(ig_pass)
                btn = page.locator('button:has-text("登入"), button:has-text("Log in")')
                btn.first.click()
                try:
                    page.wait_for_url(lambda url: "/login" not in url, timeout=15000)
                except Exception:
                    pass
                time.sleep(4)
                context.storage_state(path=str(session_file))

            if "/login" in page.url:
                print("[ig] Not logged in, skipping.", flush=True)
                return False

            # IG Threads-style text post is not easily done via web; skip image upload
            # and use direct compose URL
            page.goto("https://www.instagram.com/create/style/", wait_until="domcontentloaded", timeout=15000)
            time.sleep(2)
            print("[ig] IG image upload requires an image file; text-only not supported on web. Skipping.", flush=True)
            return False

        finally:
            browser.close()


# ── Facebook posting ──────────────────────────────────────────────────────────

def post_to_facebook(text: str) -> bool:
    session_json = os.environ.get("FB_SESSION_JSON", "")
    fb_email = os.environ.get("FB_EMAIL", "")
    fb_pass = os.environ.get("FB_PASSWORD", "")

    if not session_json and not (fb_email and fb_pass):
        print("[fb] No FB_SESSION_JSON or credentials set, skipping.", flush=True)
        return False

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[fb] playwright not installed, skipping.", flush=True)
        return False

    session_file = Path("/tmp/fb_session.json")
    if session_json:
        session_file.write_text(session_json, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        )
        ctx_opts = dict(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="zh-TW",
        )
        if session_file.exists():
            context = browser.new_context(storage_state=str(session_file), **ctx_opts)
        else:
            context = browser.new_context(**ctx_opts)
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        try:
            page = context.new_page()
            page.goto("https://www.facebook.com", wait_until="networkidle", timeout=30000)
            time.sleep(3)

            if "login" in page.url or page.locator('#email').count() > 0:
                if fb_email and fb_pass:
                    print("[fb] Logging in...", flush=True)
                    page.locator('#email').first.fill(fb_email)
                    page.locator('#pass').first.fill(fb_pass)
                    page.locator('[name="login"]').first.click()
                    time.sleep(5)
                    context.storage_state(path=str(session_file))
                else:
                    print("[fb] Not logged in and no credentials, skipping.", flush=True)
                    return False

            if "login" in page.url or "checkpoint" in page.url:
                print("[fb] FB requires 2FA/checkpoint, skipping.", flush=True)
                return False

            opened = False
            for label in ["What's on your mind?", "你在想什麼", "Create a post", "建立貼文"]:
                el = page.locator(f'[aria-label*="{label}"]')
                if el.count() > 0:
                    el.first.click()
                    time.sleep(2)
                    opened = True
                    break

            if not opened:
                el = page.locator('[data-pagelet="FeedComposer"] [role="button"]')
                if el.count() > 0:
                    el.first.click()
                    time.sleep(2)
                    opened = True

            if not opened:
                print("[fb] Could not open composer, skipping.", flush=True)
                return False

            text_box = page.locator('[role="dialog"] [contenteditable="true"], [role="dialog"] [role="textbox"]')
            if text_box.count() == 0:
                text_box = page.locator('[contenteditable="true"]')

            text_box.first.wait_for(timeout=10000)
            text_box.first.click()
            time.sleep(0.5)
            text_box.first.fill(text)
            time.sleep(1)

            post_btn = page.locator(
                '[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="發佈"], '
                '[role="dialog"] button:has-text("Post"), [role="dialog"] button:has-text("發佈"), '
                '[role="dialog"] [role="button"]:has-text("Post"), [role="dialog"] [role="button"]:has-text("發佈")'
            )
            post_btn.last.wait_for(timeout=10000)
            post_btn.last.click()
            time.sleep(5)

            print("[fb] Posted successfully!", flush=True)
            return True

        finally:
            browser.close()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    site = get_site_for_today()
    print(f"[promo] Site: {site['name']}", flush=True)
    print(f"[promo] URL: {site['url']}", flush=True)

    results = {}
    results["threads"] = post_to_threads(site["text"])
    results["instagram"] = post_to_instagram(site["text"])
    results["facebook"] = post_to_facebook(site["text"])

    print(f"\n[promo] Results: {results}", flush=True)
    ok = sum(1 for v in results.values() if v)
    if ok == 0:
        print("[promo] WARNING: No posts were made. Check secrets.", flush=True)
        sys.exit(1)
    print(f"[promo] Posted to {ok}/{len(results)} platforms.", flush=True)


if __name__ == "__main__":
    main()
