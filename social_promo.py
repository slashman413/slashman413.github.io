#!/usr/bin/env python3
"""
Social media promo poster - runs via GitHub Actions twice daily.
PROMO_SLOT=am promotes sites 1-3 (morning); PROMO_SLOT=pm promotes sites 4-6 (afternoon).
Each selected site is posted to Threads + Instagram + Facebook.

Required GitHub Secrets:
  THREADS_CHROME_SESSION  - full JSON from threads_chrome_session.json
  IG_SESSION_JSON         - full JSON from ig_session.json (from capture_sessions.py --ig)
  IG_USERNAME             - Instagram username
  IG_PASSWORD             - Instagram password
  FB_SESSION_JSON         - full JSON from fb_pw_session.json (from capture_sessions.py --fb)
"""
import os
import re, sys, json, time, datetime, platform
from pathlib import Path

# ── Site rotation ─────────────────────────────────────────────────────────────

SITES = [
    {
        "name": "ETF分析Dashboard",
        "url": "https://slashman413.github.io/tw-etf-dashboard/dashboard.html",
        "color": (99, 102, 241),
        "icon": "📊",
        "text": (
            "📊 Still guessing which Taiwan ETF to buy?\n"
            "Free analysis of 0050 / 0056 / 00878 — fundamentals, technicals & a daily whole-market scan.\n\n"
            "📊 還在憑感覺買 0050、00878？\n免費幫你一次看懂每檔 ETF 的財務+技術面 👇\n\n"
            "👉 https://slashman413.github.io/tw-etf-dashboard/dashboard.html\n\n"
            "#TaiwanStocks #ETF #Investing #台股 #ETF #00878 #0050 #存股 #被動收入 #免費工具"
        ),
        "subtitle": "追蹤 0050・0056・00878 等主流 ETF",
        "features": ["財務面：EPS / ROE / 殖利率", "技術面：RSI / MACD / K 線", "全市場掃描 · 每日自動更新"],
    },
    {
        "name": "大飆股DNA量化篩選",
        "url": "https://slashman413.github.io/twse-surge-stocks-dna/",
        "color": (16, 185, 129),
        "icon": "🧬",
        "text": (
            "🧬 Looking for the next breakout stock but don't know where to start?\n"
            "A free quant screener for Taiwan stocks, backtested over 20 years (2004–2026).\n\n"
            "🧬 想抓下一檔飆股，卻不知從何找起？\n用 20 年數據幫你篩出潛力股，完全免費 👇\n\n"
            "👉 https://slashman413.github.io/twse-surge-stocks-dna/\n\n"
            "#StockScreener #QuantTrading #台股 #飆股 #量化投資 #技術分析 #選股 #免費工具"
        ),
        "subtitle": "用數據找出下一檔潛力飆股",
        "features": ["趨勢拉回 20MA + RSI 策略", "2004–2026 年歷史回測驗證", "每日掃描台股全市場"],
    },
    {
        "name": "台股回測儀表板",
        "url": "https://slashman413.github.io/twse-backtests/",
        "color": (245, 158, 11),
        "icon": "📈",
        "text": (
            "📈 Does your trading strategy actually make money?\n"
            "Backtest it on real historical Taiwan-stock data — K-line breakout, MACD, ADX & more. Free.\n\n"
            "📈 你的存股／當沖策略，真的會賺嗎？\n用歷史數據一鍵回測驗證給你看，免費 👇\n\n"
            "👉 https://slashman413.github.io/twse-backtests/\n\n"
            "#Backtesting #TradingStrategy #台股 #回測 #量化交易 #程式交易 #免費工具"
        ),
        "subtitle": "歷史資料驗證你的投資策略",
        "features": ["K 線突破 / MACD / ADX 趨勢", "Williams %R 超買超賣訊號", "每年獨立資金模擬"],
    },
    {
        "name": "全球大事3D追蹤",
        "url": "https://slashman413.github.io/global-events-tracker/",
        "color": (6, 182, 212),
        "icon": "🌍",
        "text": (
            "🌍 Get the whole world's news in 30 seconds.\n"
            "An interactive 3D globe with 60+ major headlines daily across all six continents. Free.\n\n"
            "🌍 30 秒看懂今天全世界發生了什麼事\n互動 3D 地球儀・每日 60+ 重大新聞，免費 👇\n\n"
            "👉 https://slashman413.github.io/global-events-tracker/\n\n"
            "#WorldNews #Geopolitics #台股 #全球局勢 #國際新聞 #時事 #免費工具"
        ),
        "subtitle": "互動式地球追蹤全球重大事件",
        "features": ["每日 60+ 筆全球新聞", "六大洲即時覆蓋", "3D 視覺化地球儀"],
    },
    {
        "name": "LLM VRAM計算機",
        "url": "https://slashman413.github.io/llm-calc/",
        "color": (139, 92, 246),
        "icon": "🖥",
        "text": (
            "🖥️ Want to run AI locally but worried your GPU can't handle it?\n"
            "Instantly calculate the VRAM you need for any model, 7B to 405B. Free.\n\n"
            "🖥️ 想在自己電腦跑 AI 又怕顯卡跑不動？\n一秒算出你的卡能跑多大的模型，免費 👇\n\n"
            "👉 https://slashman413.github.io/llm-calc/\n\n"
            "#LocalLLM #AI #VRAM #Ollama #LLM #人工智慧 #免費工具"
        ),
        "subtitle": "本地 AI 需要多少 VRAM？馬上算",
        "features": ["支援 7B 到 405B 全規格模型", "GGUF / AWQ / FP16 量化對比", "主流顯卡相容性一覽"],
    },
    {
        "name": "量化投資工具箱",
        "url": "https://slashman413.github.io/",
        "color": (79, 70, 229),
        "icon": "🚀",
        "text": (
            "🚀 10+ free investing & AI tools in one place.\n"
            "Taiwan-stock analysis, screeners, backtesting, AI calculators — all free, no signup.\n\n"
            "🚀 10+ 個免費投資 & AI 工具，一站全包！\n台股分析・選股・回測・AI 計算機…通通免費 👇\n\n"
            "👉 https://slashman413.github.io/\n\n"
            "#FreeTools #Investing #AI #量化投資 #台股 #ETF #理財工具 #免費工具"
        ),
        "subtitle": "一站直達所有免費投資工具",
        "features": ["台股 ETF / 大飆股 DNA / 回測", "全球事件 3D・LLM 計算機", "每日自動更新 · 無需註冊"],
    },
    {
        "name": "Token 成本計算機",
        "url": "https://slashman413.github.io/token-cost-calculator/",
        "color": (139, 92, 246),
        "icon": "🧮",
        "text": "🧮 Free Token Cost Calculator\nCount tokens & compare GPT / Claude / Gemini API pricing instantly — runs in your browser, nothing uploaded.\n\n🧮 Token 成本計算機：算 token、比較各家 API 費用，免費 👇\n\n👉 https://slashman413.github.io/token-cost-calculator/\n☕ Support: https://ko-fi.com/ytstories0413\n#AI #LLM #GPT #Claude #FreeTools",
        "subtitle": "算 token・比較 GPT/Claude/Gemini API 費用",
        "features": ["即時計算 token 數", "10+ 模型價格對比", "本機運算不上傳"],
    },
    {
        "name": "AI 出圖尺寸計算機",
        "url": "https://slashman413.github.io/ai-image-size-calculator/",
        "color": (236, 72, 153),
        "icon": "🖼️",
        "text": "🖼️ AI Image Size Calculator\nFind the perfect resolution & aspect ratio for Midjourney, Stable Diffusion & SDXL — free.\n\n🖼️ AI 出圖尺寸計算機：Midjourney／SD／SDXL 最佳長寬比，免費 👇\n\n👉 https://slashman413.github.io/ai-image-size-calculator/\n☕ Support: https://ko-fi.com/ytstories0413\n#AIart #Midjourney #StableDiffusion #FreeTools",
        "subtitle": "Midjourney/SD/SDXL 長寬比與解析度",
        "features": ["常用長寬比一鍵帶入", "對齊 64 倍數避免破圖", "免費・本機運算"],
    },
    {
        "name": "AI Prompt 範本庫",
        "url": "https://slashman413.github.io/ai-prompt-library/",
        "color": (16, 185, 129),
        "icon": "📝",
        "text": "📝 AI Prompt Library\nHigh-quality, ready-to-use prompt templates for ChatGPT, Claude & Gemini — copy & go, free.\n\n📝 AI Prompt 範本庫：高品質提示詞範本一鍵複製，免費 👇\n\n👉 https://slashman413.github.io/ai-prompt-library/\n☕ Support: https://ko-fi.com/ytstories0413\n#AI #ChatGPT #Prompt #FreeTools",
        "subtitle": "高品質提示詞範本・一鍵複製",
        "features": ["分類 + 搜尋", "一鍵複製", "持續新增範本"],
    },
]


# Morning slot promotes sites 1-3, afternoon slot promotes sites 4-6 (by name, order-stable).
AM_NAMES = ["量化投資工具箱", "LLM VRAM計算機", "ETF分析Dashboard"]
PM_NAMES = ["大飆股DNA量化篩選", "台股回測儀表板", "全球大事3D追蹤"]
AI_TOOL_NAMES = ["Token 成本計算機", "AI 出圖尺寸計算機", "AI Prompt 範本庫"]  # one appended at random to the AM slot daily


def get_sites_for_slot() -> list:
    """Return the 3 sites for the current slot. PROMO_SLOT=am|pm (set by the workflow);
    if unset, infer from UTC hour (morning run vs afternoon run)."""
    slot = os.environ.get("PROMO_SLOT", "").lower().strip()
    if slot not in ("am", "pm"):
        slot = "am" if datetime.datetime.now(datetime.timezone.utc).hour < 5 else "pm"
    names = AM_NAMES if slot == "am" else PM_NAMES
    by_name = {s["name"]: s for s in SITES}
    result = [by_name[n] for n in names if n in by_name]
    if slot == "am":
        import random
        pool = [by_name[n] for n in AI_TOOL_NAMES if n in by_name and n not in names]
        if pool:
            result.append(random.choice(pool))  # daily random AI-tool promo
    return result


# ── Promo image generation ────────────────────────────────────────────────────

def _find_font(size, bold=False):
    from PIL import ImageFont
    if platform.system() == "Windows":
        candidates = (
            [r"C:\Windows\Fonts\msjhbd.ttc", r"C:\Windows\Fonts\arialbd.ttf"] if bold
            else [r"C:\Windows\Fonts\msjh.ttc", r"C:\Windows\Fonts\arial.ttf"]
        )
    else:
        candidates = (
            [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            ] if bold else [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            ]
        )
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# English text for promo IMAGES (caption stays bilingual; image cards render English).
EN_CARD = {
    "ETF分析Dashboard": {"name": "Taiwan ETF Analysis", "subtitle": "0050 / 0056 / 00878 deep-dive", "features": ["Fundamentals: EPS / ROE / yield", "Technicals: RSI / MACD / K-line", "Whole-market scan, daily"]},
    "大飆股DNA量化篩選": {"name": "Surge Stock DNA Screener", "subtitle": "Find the next breakout stock", "features": ["20MA pullback + RSI strategy", "Backtested 2004-2026", "Daily whole-market scan"]},
    "台股回測儀表板": {"name": "Taiwan Stock Backtester", "subtitle": "Validate strategies on real data", "features": ["K-line breakout / MACD / ADX", "Williams %R signals", "Yearly capital simulation"]},
    "全球大事3D追蹤": {"name": "Global Events 3D Globe", "subtitle": "Track world events in 3D", "features": ["60+ daily global headlines", "All six continents", "Interactive 3D globe"]},
    "LLM VRAM計算機": {"name": "LLM VRAM Calculator", "subtitle": "How much VRAM for local AI?", "features": ["Models from 7B to 405B", "GGUF / AWQ / FP16 compare", "GPU compatibility list"]},
    "量化投資工具箱": {"name": "Free AI & Finance Toolkit", "subtitle": "All free tools in one place", "features": ["TW stocks / DNA / backtest", "3D events, LLM calculator", "Daily updates, no signup"]},
    "Token 成本計算機": {"name": "Token Cost Calculator", "subtitle": "Count tokens, compare API pricing", "features": ["Instant token counting", "10+ model price compare", "Runs locally"]},
    "AI 出圖尺寸計算機": {"name": "AI Image Size Calculator", "subtitle": "Ratios for Midjourney / SD / SDXL", "features": ["Common aspect ratios", "Snaps to 64 multiples", "Free, runs locally"]},
    "AI Prompt 範本庫": {"name": "AI Prompt Library", "subtitle": "Ready-to-use prompt templates", "features": ["Category + search", "One-click copy", "Always adding more"]},
    "YouTube 新片": {"name": "New Video Out Now", "features": ["New video daily", "Gentle Soul channel", "Subscribe for more"]},
}


def generate_promo_image(site: dict) -> str:
    """Generate a 1080x1080 promo card. Returns absolute path to PNG."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("[img] pillow not installed, cannot generate image.", flush=True)
        return ""

    W = H = 1080
    accent = site["color"]
    accent_dim = tuple(max(0, c - 80) for c in accent)

    BG1    = (8, 12, 28)
    BG2    = (4, 7, 18)
    WHITE  = (255, 255, 255)
    GRAY   = (140, 155, 185)
    CARD   = (14, 22, 50)
    BORDER = (35, 55, 110)

    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)

    # Background gradient
    for y in range(H):
        t = y / H
        r = int(BG1[0] + (BG2[0] - BG1[0]) * t)
        g = int(BG1[1] + (BG2[1] - BG1[1]) * t)
        b = int(BG1[2] + (BG2[2] - BG1[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # Top accent bar (gradient)
    for x in range(W):
        t = x / W
        c = tuple(int(accent[i] * (1 - t) + 99 * t) for i in range(3))
        draw.line([(x, 0), (x, 6)], fill=c)

    # Icon circle
    draw.rounded_rectangle([W // 2 - 55, 60, W // 2 + 55, 170], radius=20, fill=CARD, outline=accent_dim, width=2)

    # Title
    f_title = _find_font(50, bold=True)
    f_sub   = _find_font(30)
    f_feat  = _find_font(26)
    f_url   = _find_font(27, bold=True)
    f_tag   = _find_font(22)
    f_free  = _find_font(34, bold=True)

    def cx(text, y, fnt, fill):
        w = draw.textlength(text, font=fnt)
        draw.text(((W - w) // 2, y), text, font=fnt, fill=fill)

    cx(EN_CARD.get(site["name"], {}).get("name", site["name"]), 195, f_title, WHITE)
    cx(EN_CARD.get(site["name"], {}).get("subtitle", site["subtitle"]), 260, f_sub, GRAY)

    # Divider
    draw.line([(120, 305), (W - 120, 305)], fill=BORDER, width=1)

    # FREE badge
    FREE_Y = 325
    draw.rounded_rectangle([W // 2 - 110, FREE_Y, W // 2 + 110, FREE_Y + 60], radius=30,
                           fill=(*accent_dim, 180), outline=accent, width=2)
    cx("完全免費", FREE_Y + 13, f_free, accent)

    # Features
    feat_y = 420
    for feat in EN_CARD.get(site["name"], {}).get("features", site["features"]):
        draw.text((120, feat_y), "✦", font=f_feat, fill=accent)
        draw.text((165, feat_y), feat, font=f_feat, fill=WHITE)
        feat_y += 52

    # Large accent circle decoration
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(40, 0, -1):
        alpha = int(3 * i / 40)
        gd.ellipse([W - 200 - i * 5, 600 - i * 5, W - 200 + i * 5, 600 + i * 5], fill=(*accent, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)

    # URL card
    URL_Y = 870
    draw.rounded_rectangle([80, URL_Y, W - 80, URL_Y + 70], radius=35, fill=CARD, outline=accent, width=2)
    url_text = site["url"].replace("https://", "")
    cx(url_text, URL_Y + 18, f_url, accent)

    # Hashtags
    tags = "#免費工具  #台股  #AI工具  #量化投資"
    cx(tags, 975, f_tag, tuple(c // 2 for c in accent))

    # Watermark
    draw.text((W - 20, H - 20), "@ytstories0413", font=_find_font(20), fill=(60, 70, 95), anchor="rb")

    # Bottom accent bar
    for x in range(W):
        t = x / W
        c = tuple(int(accent[i] * t + 99 * (1 - t)) for i in range(3))
        draw.line([(x, H - 6), (x, H)], fill=c)

    out = Path(f"/tmp/promo_{site['name'].replace('/', '_')}.png")
    img.save(str(out), "PNG")
    print(f"[img] Promo image saved: {out}", flush=True)
    return str(out)


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

        for cookie in chrome_data.get("cookies", []):
            if cookie.get("name") == "sessionid":
                context.add_cookies([cookie])
                print("[threads] Injected sessionid cookie.", flush=True)
                break

        try:
            page = context.new_page()
            # Navigate to threads.com (matches .threads.com cookie domain)
            page.goto("https://www.threads.com", wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)

            if "login" in page.url.lower():
                print("[threads] Session expired/invalid, cannot post.", flush=True)
                return False

            print(f"[threads] Logged in. URL: {page.url}", flush=True)

            opened = False
            for fragment in ["撰寫新貼文", "新串文", "開始串文", "compose a new post",
                             "Type to compose", "建立", "Create", "What's new", "有什麼新鮮事"]:
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
                for btn_txt in ["New thread", "新串文", "開始串文", "建立", "Create"]:
                    el = page.locator(f'[role="button"]:has-text("{btn_txt}")')
                    if el.count() > 0:
                        el.first.click()
                        try:
                            page.locator('[contenteditable="true"]').wait_for(timeout=5000)
                            opened = True
                            break
                        except Exception:
                            pass

            # Last resort: click the feed composer prompt ("有什麼新鮮事？" / "What's new?")
            if not opened:
                try:
                    prompt = page.get_by_text(re.compile(r"有什麼新鮮事|What's new", re.I))
                    if prompt.count() > 0:
                        prompt.first.click()
                        page.locator('[contenteditable="true"]').wait_for(timeout=5000)
                        opened = True
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


# ── Instagram posting via Playwright session ──────────────────────────────────

def post_to_instagram(site: dict) -> bool:
    session_json = os.environ.get("IG_SESSION_JSON", "")
    if not session_json:
        print("[ig] IG_SESSION_JSON not set, skipping.", flush=True)
        return False

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[ig] playwright not installed, skipping.", flush=True)
        return False

    # Generate promo image
    image_path = generate_promo_image(site)
    if not image_path or not Path(image_path).exists():
        print("[ig] Promo image generation failed, skipping IG.", flush=True)
        return False

    session_file = Path("/tmp/ig_session.json")
    session_file.write_text(session_json, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = browser.new_context(
            storage_state=str(session_file),
            # DESKTOP context: IG mobile-web "+" defaults to Stories; desktop "+" creates a square FEED post
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="zh-TW",
            is_mobile=False,
        )
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        try:
            page = context.new_page()
            page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)

            if "/login" in page.url or "/accounts/login" in page.url:
                print("[ig] Session expired, cannot post.", flush=True)
                return False

            print(f"[ig] Logged in. URL: {page.url}", flush=True)

            # Click New Post button or navigate directly
            clicked = False
            for sel in ['[aria-label="New post"]', 'svg[aria-label="New post"]', '[aria-label="建立"]']:
                el = page.locator(sel)
                if el.count() > 0:
                    el.first.click()
                    clicked = True
                    time.sleep(2)
                    break
            if not clicked:
                page.goto("https://www.instagram.com/create/style/", wait_until="domcontentloaded", timeout=15000)
                time.sleep(2)

            # Upload image file (IG's file input is hidden -> wait for "attached", not "visible")
            file_input = page.locator('input[type="file"]').first
            file_input.wait_for(state="attached", timeout=15000)
            file_input.set_input_files(str(Path(image_path).resolve()))
            time.sleep(4)

            # Navigate through crop → filter → caption steps
            for _step in ["crop", "filter"]:
                for btn_text in ["Next", "下一步"]:
                    btn = page.locator(f'button:has-text("{btn_text}"), [role="button"]:has-text("{btn_text}")')
                    if btn.count() > 0:
                        btn.first.click()
                        time.sleep(2)
                        break

            # Fill caption
            caption_box = page.locator(
                '[aria-label*="caption"], [aria-label*="說明文字"], '
                '[aria-label*="Write a caption"], textarea, [contenteditable="true"]'
            )
            if caption_box.count() > 0:
                caption_box.first.click()
                # IG feed captions can't have clickable links -> direct users to the bio link
                ig_caption = site["text"] + "\n\n🔗 連結點不了？完整工具總覽都在個人簡介連結 👆"
                caption_box.first.fill(ig_caption)
                time.sleep(1)

            # Share
            for btn_text in ["Share", "分享"]:
                btn = page.locator(f'button:has-text("{btn_text}"), [role="button"]:has-text("{btn_text}")')
                if btn.count() > 0:
                    btn.last.click()
                    time.sleep(6)
                    break

            print("[ig] Posted image successfully!", flush=True)
            return True

        except Exception as e:
            print(f"[ig] Error: {e}", flush=True)
            return False

        finally:
            browser.close()


# ── Facebook posting via Playwright session ───────────────────────────────────

def post_to_facebook(text: str) -> bool:
    session_json = os.environ.get("FB_SESSION_JSON", "")
    if not session_json:
        print("[fb] FB_SESSION_JSON not set, skipping.", flush=True)
        return False

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[fb] playwright not installed, skipping.", flush=True)
        return False

    session_file = Path("/tmp/fb_session.json")
    session_file.write_text(session_json, encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            storage_state=str(session_file),
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="zh-TW",
        )
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        try:
            page = context.new_page()
            page.goto("https://www.facebook.com", wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)

            if "login" in page.url or "checkpoint" in page.url:
                print("[fb] Session expired or 2FA required, cannot post.", flush=True)
                return False

            print(f"[fb] Logged in. URL: {page.url}", flush=True)

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
                print("[fb] Could not open composer.", flush=True)
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

def latest_youtube_item():
    """D11: fetch the channel's latest public video from the keyless RSS feed and return a
    SITES-compatible dict so it gets cross-posted to Threads/IG/FB alongside the tool sites."""
    import urllib.request as _u, re as _re, html as _h
    CHANNEL = "UCvd4nL04uE7lFqkKtzsOwLg"  # Gentle Soul
    try:
        req = _u.Request(f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL}",
                         headers={"User-Agent": "Mozilla/5.0"})
        xml = _u.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"[promo] youtube RSS failed: {e}", flush=True)
        return None
    m = _re.search(r"<entry>(.*?)</entry>", xml, _re.S)
    if not m:
        return None
    entry = m.group(1)
    vid = _re.search(r"<yt:videoId>(.*?)</yt:videoId>", entry)
    title = _re.search(r"<title>(.*?)</title>", entry)
    if not (vid and title):
        return None
    vid = vid.group(1)
    title = _h.unescape(title.group(1)).strip()
    url = f"https://youtu.be/{vid}"
    low = title.lower()
    music = any(k in low for k in ("ambient", "sleep", "study", "relax", "dreamscape", "calm", "lofi"))
    tags = "#ambient #音樂 #放鬆 #助眠 #專注 #lofi #sleepmusic" if music else "#AI #科技 #知識 #教學 #生產力"
    line = "🎧 戴上耳機放鬆一下" if music else "✦ 每日新知，一支看懂"
    text = f"🎬 新影片上線！\n\n{title}\n\n{line}\n👉 {url}\n\n{tags}"
    return {
        "name": "YouTube 新片",
        "url": url,
        "color": (236, 72, 153),
        "icon": "🎬",
        "text": text,
        "subtitle": title[:40],
        "features": ["每日自動更新影片", "Gentle Soul 頻道", "訂閱看更多"],
    }


def deliver_to_discord(site) -> bool:
    """Generate the promo card + caption and post them to the Discord webhook (multipart)."""
    wh = os.environ.get("DISCORD_WEBHOOK")
    if not wh:
        print("[discord] no DISCORD_WEBHOOK set", flush=True)
        return False
    import urllib.request
    caption = site.get("text", "")
    img = ""
    try:
        img = generate_promo_image(site)
    except Exception as e:
        print(f"[discord] image gen failed: {e}", flush=True)
    boundary = "----promo" + str(int(time.time() * 1000))
    pre = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
           "Content-Type: application/json\r\n\r\n" + json.dumps({"content": caption[:1900]}) + "\r\n")
    body = pre.encode("utf-8")
    if img and os.path.exists(img):
        with open(img, "rb") as f:
            data = f.read()
        body += ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"files[0]\"; "
                 "filename=\"promo.png\"\r\nContent-Type: image/png\r\n\r\n").encode("utf-8") + data + b"\r\n"
    body += ("--" + boundary + "--\r\n").encode("utf-8")
    req = urllib.request.Request(wh, data=body, headers={
        "Content-Type": "multipart/form-data; boundary=" + boundary,
        "User-Agent": "Mozilla/5.0 (compatible; sm413-promo)",
    })
    try:
        urllib.request.urlopen(req, timeout=40)
        print(f"[discord] delivered: {site['name']}", flush=True)
        return True
    except Exception as e:
        print(f"[discord] failed for {site['name']}: {e}", flush=True)
        return False


def main():
    sites = get_sites_for_slot()
    _yt = latest_youtube_item()
    if _yt:
        sites = list(sites) + [_yt]
    slot = os.environ.get("PROMO_SLOT", "auto")
    print(f"[promo] Slot={slot} | delivering {len(sites)} item(s) to Discord: {[s['name'] for s in sites]}", flush=True)
    wh = os.environ.get("DISCORD_WEBHOOK")
    if wh:
        try:
            import urllib.request
            hdr = f"\U0001F4E3 今日社群推廣素材（{len(sites)} 則）— 存圖 + 複製文案發 IG，Meta 會自動同步 FB + Threads \U0001F447"
            req = urllib.request.Request(wh, data=json.dumps({"content": hdr}).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; sm413-promo)"})
            urllib.request.urlopen(req, timeout=20)
        except Exception as e:
            print(f"[discord] header failed: {e}", flush=True)
    ok = 0
    for site in sites:
        print(f"\n[promo] ===== {site['name']} =====", flush=True)
        if deliver_to_discord(site):
            ok += 1
        time.sleep(1)
    print(f"\n[promo] DONE. Delivered {ok}/{len(sites)} item(s) to Discord.", flush=True)
    if ok == 0:
        print("[promo] WARNING: nothing delivered. Check DISCORD_WEBHOOK.", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

