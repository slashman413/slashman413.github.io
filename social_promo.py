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
        "url": "https://slashmantools.us/tw-etf-dashboard/dashboard.html",
        "color": (99, 102, 241),
        "icon": "📊",
        "text": (
            "📊 0050 vs 0056 vs 00878 — which one actually fits you?\n"
            "Compare fundamentals + technicals side by side, refreshed daily from a whole-market scan. Free.\n\n"
            "📊 0050、0056、00878 到底買哪檔？\n財務面＋技術面並排比一比，每日自動更新，免費 👇\n\n"
            "👉 https://slashmantools.us/tw-etf-dashboard/dashboard.html\n\n"
            "#台股 #ETF #存股 #被動收入 #Investing"
        ),
        "subtitle": "追蹤 0050・0056・00878 等主流 ETF",
        "features": ["財務面：EPS / ROE / 殖利率", "技術面：RSI / MACD / K 線", "全市場掃描 · 每日自動更新"],
    },
    {
        "name": "大飆股DNA量化篩選",
        "url": "https://slashmantools.us/twse-surge-stocks-dna/",
        "color": (16, 185, 129),
        "icon": "🧬",
        "text": (
            "🧬 What do past breakout stocks have in common? I turned it into a screener.\n"
            "Trend pullback + 20MA + RSI, backtested 2004–2026, scanning all of Taiwan daily. Free.\n\n"
            "🧬 飆股都有共同特徵，我把它變成一套篩選器\n20 年回測驗證，每日掃描台股全市場，免費 👇\n\n"
            "👉 https://slashmantools.us/twse-surge-stocks-dna/\n\n"
            "#台股 #飆股 #量化投資 #選股 #StockScreener"
        ),
        "subtitle": "用數據找出下一檔潛力飆股",
        "features": ["趨勢拉回 20MA + RSI 策略", "2004–2026 年歷史回測驗證", "每日掃描台股全市場"],
    },
    {
        "name": "台股回測儀表板",
        "url": "https://slashmantools.us/twse-backtests/",
        "color": (245, 158, 11),
        "icon": "📈",
        "text": (
            "📈 \"Buy the dip\" sounds smart — but does it beat buy-and-hold?\n"
            "Backtest strategies on real Taiwan-stock history: K-line breakout, MACD, ADX & more. Free.\n\n"
            "📈 「逢低加碼」聽起來很聰明，但真的贏過買進持有嗎？\n用歷史數據一鍵回測驗證，免費 👇\n\n"
            "👉 https://slashmantools.us/twse-backtests/\n\n"
            "#台股 #回測 #量化交易 #程式交易 #Backtesting"
        ),
        "subtitle": "歷史資料驗證你的投資策略",
        "features": ["K 線突破 / MACD / ADX 趨勢", "Williams %R 超買超賣訊號", "每年獨立資金模擬"],
    },
    {
        "name": "全球大事3D追蹤",
        "url": "https://slashmantools.us/global-events-tracker/",
        "color": (6, 182, 212),
        "icon": "🌍",
        "text": (
            "🌍 Doomscrolling the news? Spin the globe instead.\n"
            "An interactive 3D Earth with 60+ major headlines a day across all six continents. Free.\n\n"
            "🌍 與其滑一堆負面新聞，不如轉動地球看重點\n互動 3D 地球儀・每日 60+ 全球大事，免費 👇\n\n"
            "👉 https://slashmantools.us/global-events-tracker/\n\n"
            "#國際新聞 #全球局勢 #時事 #WorldNews #Geopolitics"
        ),
        "subtitle": "互動式地球追蹤全球重大事件",
        "features": ["每日 60+ 筆全球新聞", "六大洲即時覆蓋", "3D 視覺化地球儀"],
    },
    {
        "name": "總經產業熱度儀表板",
        "url": "https://slashmantools.us/macro-dashboard/",
        "color": (220, 38, 38),
        "icon": "🔥",
        "text": (
            "🔥 Which sector is hot right now — and which is quietly rolling over?\n"
            "14 industry ETFs ranked by 3-month return, click any card for its top-10 holdings. Free.\n\n"
            "🔥 現在資金往哪個產業跑？哪個又在默默走弱？\n14 大產業 ETF 依近 3 月報酬排名，點卡片看前 10 大成分股，免費 👇\n\n"
            "👉 https://slashmantools.us/macro-dashboard/\n\n"
            "#台股 #產業輪動 #ETF #總經 #Investing"
        ),
        "subtitle": "14 大產業 ETF 熱度即時排名",
        "features": ["依近 3 月報酬率排名", "點卡片看前 10 大成分股", "串接即時數據 · 每日更新"],
    },
    {
        "name": "LLM VRAM計算機",
        "url": "https://slashmantools.us/llm-calc/",
        "color": (139, 92, 246),
        "icon": "🖥",
        "text": (
            "🖥️ Before you buy that GPU for local AI — will it even run the model?\n"
            "Check the VRAM you need for any model 7B–405B (GGUF / AWQ / FP16) in one second. Free.\n\n"
            "🖥️ 想加顯卡跑本地 AI？先確認跑不跑得動\n一秒算出你的卡能跑多大的模型，免費 👇\n\n"
            "👉 https://slashmantools.us/llm-calc/\n\n"
            "#LocalLLM #Ollama #VRAM #AI #人工智慧"
        ),
        "subtitle": "本地 AI 需要多少 VRAM？馬上算",
        "features": ["支援 7B 到 405B 全規格模型", "GGUF / AWQ / FP16 量化對比", "主流顯卡相容性一覽"],
    },
    {
        "name": "量化投資工具箱",
        "url": "https://slashmantools.us/",
        "color": (79, 70, 229),
        "icon": "🚀",
        "text": (
            "🚀 Bookmark one link, get 10+ free investing & AI tools.\n"
            "Taiwan-stock analysis, screeners, backtesting, AI calculators — no signup, no paywall.\n\n"
            "🚀 存一個連結，10+ 免費投資 & AI 工具一次擁有\n台股分析・選股・回測・AI 計算機，免註冊 👇\n\n"
            "👉 https://slashmantools.us/\n\n"
            "#台股 #量化投資 #理財工具 #AI #FreeTools"
        ),
        "subtitle": "一站直達所有免費投資工具",
        "features": ["台股 ETF / 大飆股 DNA / 回測", "全球事件 3D・LLM 計算機", "每日自動更新 · 無需註冊"],
    },
    {
        "name": "Token 成本計算機",
        "url": "https://slashmantools.us/token-cost-calculator/",
        "color": (139, 92, 246),
        "icon": "🧮",
        "text": "🧮 That API bill adds up fast — know the cost before you hit send.\nCount tokens & compare GPT / Claude / Gemini pricing instantly, in your browser. Free.\n\n🧮 API 帳單越滾越大？送出前先算清楚\n即時算 token、比較各家 API 費用，免費 👇\n\n👉 https://slashmantools.us/token-cost-calculator/\n☕ Support: https://ko-fi.com/ytstories0413\n#AI #LLM #GPT #Claude",
        "subtitle": "算 token・比較 GPT/Claude/Gemini API 費用",
        "features": ["即時計算 token 數", "10+ 模型價格對比", "本機運算不上傳"],
    },
    {
        "name": "AI 出圖尺寸計算機",
        "url": "https://slashmantools.us/ai-image-size-calculator/",
        "color": (236, 72, 153),
        "icon": "🖼️",
        "text": "🖼️ Stop guessing aspect ratios that come out stretched.\nGet the perfect resolution for Midjourney, Stable Diffusion & SDXL (aligned to 64). Free.\n\n🖼️ 別再猜長寬比、猜到出圖變形\nMidjourney／SD／SDXL 最佳解析度一鍵帶入，免費 👇\n\n👉 https://slashmantools.us/ai-image-size-calculator/\n☕ Support: https://ko-fi.com/ytstories0413\n#AIart #Midjourney #StableDiffusion #SDXL",
        "subtitle": "Midjourney/SD/SDXL 長寬比與解析度",
        "features": ["常用長寬比一鍵帶入", "對齊 64 倍數避免破圖", "免費・本機運算"],
    },
    {
        "name": "AI Prompt 範本庫",
        "url": "https://slashmantools.us/ai-prompt-library/",
        "color": (16, 185, 129),
        "icon": "📝",
        "text": "📝 Bad prompt in, bad answer out. Start from ones that work.\nHigh-quality, ready-to-use prompt templates for ChatGPT, Claude & Gemini — copy & go. Free.\n\n📝 提示詞寫不好，AI 就答不好\n高品質提示詞範本一鍵複製，直接套用，免費 👇\n\n👉 https://slashmantools.us/ai-prompt-library/\n☕ Support: https://ko-fi.com/ytstories0413\n#AI #ChatGPT #Claude #Prompt",
        "subtitle": "高品質提示詞範本・一鍵複製",
        "features": ["分類 + 搜尋", "一鍵複製", "持續新增範本"],
    },
    {
        "name": "密碼產生器",
        "url": "https://slashmantools.us/password-generator/",
        "color": (244, 63, 94),
        "icon": "🔐",
        "text": "🔐 Still reusing the same password everywhere? Fix that in 2 seconds.\nCrypto-grade random passwords, custom length & symbols — generated locally, never uploaded.\n\n🔐 還在到處用同一組密碼？2 秒換掉它\n加密級亂數、自訂長度字元，本機產生不上傳 👇\n\n👉 https://slashmantools.us/password-generator/\n☕ Support: https://ko-fi.com/ytstories0413\n#資安 #Security #Privacy #密碼",
        "subtitle": "自訂長度字元・即時產生安全密碼",
        "features": ["加密級亂數產生", "本機運算不上傳", "即時強度檢測"],
    },
    {
        "name": "字數統計工具",
        "url": "https://slashmantools.us/word-counter/",
        "color": (59, 130, 246),
        "icon": "✍️",
        "text": "✍️ Essay limit? Post caption? Know your count before you paste.\nWords, characters, sentences & reading time — instant, right in your browser. Free.\n\n✍️ 報告字數限制？貼文長度？貼上前先數清楚\n字數・字元・句數・閱讀時間即時統計，免費 👇\n\n👉 https://slashmantools.us/word-counter/\n☕ Support: https://ko-fi.com/ytstories0413\n#寫作 #Writing #WordCount",
        "subtitle": "字數・字元・句數・閱讀時間",
        "features": ["即時統計字數字元", "估算閱讀時間", "本機運算不上傳"],
    },
    {
        "name": "複利計算機",
        "url": "https://slashmantools.us/compound-calculator/",
        "color": (245, 158, 11),
        "icon": "💹",
        "text": "💹 $100/month for 20 years = how much? The answer will surprise you.\nSee your money grow on a live chart — supports lump-sum + monthly investing. Free.\n\n💹 每月存 5,000、存 20 年會變多少？答案會嚇到你\n本利和成長圖＋定期定額試算，免費 👇\n\n👉 https://slashmantools.us/compound-calculator/\n#理財 #複利 #存錢 #Investing",
        "subtitle": "複利成長試算＋圖表",
        "features": ["本利和成長圖", "定期定額試算", "支援 5 種語言"],
    },
    {
        "name": "單位換算工具",
        "url": "https://slashmantools.us/unit-converter/",
        "color": (20, 184, 166),
        "icon": "📐",
        "text": "📐 Recipe in cups, oven in °F, package in inches? Convert it all in one place.\nLength, weight, temperature, area, speed & more — instant, runs locally. Free.\n\n📐 食譜用杯、烤箱用華氏、尺寸用英吋？一個工具全搞定\n長度・重量・溫度・面積・速度即時換算，免費 👇\n\n👉 https://slashmantools.us/unit-converter/\n#單位換算 #生活工具 #UnitConverter",
        "subtitle": "長度・重量・溫度・面積・速度",
        "features": ["多類單位即時換算", "常用單位齊全", "免費・本機運算"],
    },
    {
        "name": "番茄鐘專注計時器",
        "url": "https://slashmantools.us/pomodoro-focus-timer/",
        "color": (249, 115, 22),
        "icon": "⏲️",
        "text": "⏲️ Can't start the task you've been avoiding? Try just 25 minutes.\nA browser Pomodoro timer with work/break cycles + desktop alerts. No install. Free.\n\n⏲️ 那件一直拖的事，先做 25 分鐘就好\n番茄鐘工作／休息循環＋桌面提醒，免安裝，免費 👇\n\n👉 https://slashmantools.us/pomodoro-focus-timer/\n#番茄鐘 #生產力 #專注 #Productivity",
        "subtitle": "番茄工作法・專注／休息循環",
        "features": ["可自訂工作/休息時間", "桌面通知提醒", "免費・免安裝"],
    },
    {
        "name": "JSON・Regex 工具",
        "url": "https://slashmantools.us/json-regex-devtools/",
        "color": (99, 102, 241),
        "icon": "🧰",
        "text": "🧰 Debugging a broken API response or a regex that won't match? Two tabs, one page.\nFormat/validate JSON & test regex live — in your browser, nothing leaves your machine.\n\n🧰 在對付壞掉的 JSON、或兜不出來的 Regex？一頁搞定\nJSON 格式化＋Regex 即時測試，本機運算 👇\n\n👉 https://slashmantools.us/json-regex-devtools/\n#工程師 #DevTools #JSON #Regex",
        "subtitle": "JSON 格式化 + Regex 即時測試",
        "features": ["JSON 美化/驗證", "Regex 即時比對", "本機運算不上傳"],
    },
    {
        "name": "開發者工具箱",
        "url": "https://slashmantools.us/dev-tools/",
        "color": (34, 197, 94),
        "icon": "🛠️",
        "text": "🛠️ Stop pasting your JWT into a random sketchy site to decode it.\nBase64, URL, JWT, UUID, timestamp, SHA-256 — one toolbox, all runs locally. Free.\n\n🛠️ 別再把 JWT 貼到來路不明的網站解碼了\nBase64・JWT・UUID・SHA-256 一站搞定，本機運算 👇\n\n👉 https://slashmantools.us/dev-tools/\n#工程師 #DevTools #WebDev #Programming",
        "subtitle": "Base64・JWT・UUID・SHA-256…",
        "features": ["編解碼一次到位", "JWT/UUID/雜湊", "本機運算不上傳"],
    },
    {
        "name": "配色工具",
        "url": "https://slashmantools.us/color-tools/",
        "color": (236, 72, 153),
        "icon": "🎨",
        "text": "🎨 Found a color you love but need the HEX? Grab it and build a palette.\nPicker, HEX/RGB/HSL converter, palette maker & CSS gradient generator — free.\n\n🎨 看到喜歡的顏色卻不知道色碼？取色、轉換、配一整組\n取色器・色碼轉換・調色盤・CSS 漸層，免費 👇\n\n👉 https://slashmantools.us/color-tools/\n#設計 #配色 #CSS #Design",
        "subtitle": "取色・轉換・調色盤・CSS 漸層",
        "features": ["HEX/RGB/HSL 互轉", "調色盤產生", "CSS 漸層輸出"],
    },
    {
        "name": "QR Code 產生器",
        "url": "https://slashmantools.us/qr-code-generator/",
        "color": (234, 179, 8),
        "icon": "🔳",
        "text": "🔳 Tired of reading out the Wi-Fi password to every guest? Make a QR code.\nLinks, text, Wi-Fi & more → instant downloadable QR. No signup. Free.\n\n🔳 每個客人都要問一次 Wi-Fi 密碼？做成 QR 貼牆上\n網址・文字・Wi-Fi 一秒轉，可下載，免費 👇\n\n👉 https://slashmantools.us/qr-code-generator/\n#QRCode #行銷工具 #生活工具",
        "subtitle": "網址・文字・Wi-Fi 轉 QR Code",
        "features": ["即時產生 QR", "可下載 PNG", "免費・免註冊"],
    },
    {
        "name": "圖片壓縮工具",
        "url": "https://slashmantools.us/image-compressor/",
        "color": (14, 165, 233),
        "icon": "🖼️",
        "text": "🖼️ \"File too large to upload.\" Shrink it without uploading it anywhere.\nCompress & resize images right in your browser — files never leave your device.\n\n🖼️ 「檔案太大無法上傳」？在本機壓好再傳\n瀏覽器內壓縮／縮放，檔案不上傳保護隱私，免費 👇\n\n👉 https://slashmantools.us/image-compressor/\n#隱私 #圖片壓縮 #ImageCompression",
        "subtitle": "瀏覽器內壓縮・縮放圖片",
        "features": ["不上傳・保護隱私", "壓縮 + 縮放", "支援 JPG/PNG/WebP"],
    },
    {
        "name": "PDF 工具",
        "url": "https://slashmantools.us/pdf-tools/",
        "color": (239, 68, 68),
        "icon": "📄",
        "text": "📄 Need to combine scans into one PDF — without uploading private docs?\nImages → PDF & merge PDFs, all in your browser. Files never leave your device.\n\n📄 要把好幾張掃描檔併成一份 PDF、又不想上傳隱私文件？\n圖片轉 PDF、合併 PDF，本機處理不上傳，免費 👇\n\n👉 https://slashmantools.us/pdf-tools/\n#隱私 #PDF #文件工具",
        "subtitle": "圖片轉 PDF・合併 PDF",
        "features": ["圖片轉 PDF", "合併多份 PDF", "本機處理不上傳"],
    },
    {
        "name": "多功能計算機",
        "url": "https://slashmantools.us/calculators/",
        "color": (168, 85, 247),
        "icon": "🧮",
        "text": "🧮 Splitting a bill, checking a loan, working out a discount? One page for all of it.\nBMI, loan, percentage, age, tip — everyday calculators in one place. No signup. Free.\n\n🧮 分帳、算貸款、算折扣？一頁全部算到好\nBMI・貸款・百分比・年齡・小費，免註冊，免費 👇\n\n👉 https://slashmantools.us/calculators/\n#計算機 #生活工具 #理財",
        "subtitle": "BMI・貸款・百分比・年齡・小費",
        "features": ["分頁式多種計算", "即時結果", "免費・免註冊"],
    },
]


# Morning slot promotes sites 1-3, afternoon slot promotes sites 4-6 (by name, order-stable).
AM_NAMES = ["量化投資工具箱", "LLM VRAM計算機", "ETF分析Dashboard"]
PM_NAMES = ["大飆股DNA量化篩選", "台股回測儀表板", "全球大事3D追蹤"]
AI_TOOL_NAMES = ["Token 成本計算機", "AI 出圖尺寸計算機", "AI Prompt 範本庫"]  # one appended at random to the AM slot daily


def get_sites_for_slot() -> list:
    """Pick 5 RANDOM sites to promote this run, so the daily promo is never the same
    set two days running. PROMO_SLOT (am/pm) is still accepted by the workflow but no
    longer fixes which sites go out — each run samples fresh from the full SITES pool."""
    import random
    return random.sample(SITES, min(5, len(SITES)))


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
    "密碼產生器": {"name": "Password Generator", "subtitle": "Strong random passwords, instantly", "features": ["Crypto-grade randomness", "Runs locally, no upload", "Live strength meter"]},
    "字數統計工具": {"name": "Word Counter", "subtitle": "Words, characters, reading time", "features": ["Live word/char count", "Reading-time estimate", "Runs locally"]},
    "複利計算機": {"name": "Compound Interest Calculator", "subtitle": "See your money grow", "features": ["Growth chart", "Recurring contributions", "5 languages"]},
    "單位換算工具": {"name": "Unit Converter", "subtitle": "Length, weight, temp, area…", "features": ["Instant conversion", "All common units", "Runs locally"]},
    "番茄鐘專注計時器": {"name": "Pomodoro Focus Timer", "subtitle": "Work/break focus cycles", "features": ["Custom work/break", "Desktop notifications", "Free, no install"]},
    "JSON・Regex 工具": {"name": "JSON & Regex Tools", "subtitle": "Format JSON, test regex live", "features": ["JSON beautify/validate", "Live regex matching", "Runs locally"]},
    "開發者工具箱": {"name": "Developer Tools", "subtitle": "Base64, JWT, UUID, SHA-256…", "features": ["Encode/decode suite", "JWT/UUID/hash", "Runs locally"]},
    "配色工具": {"name": "Color Tools", "subtitle": "Picker, converter, palette, gradient", "features": ["HEX/RGB/HSL convert", "Palette generator", "CSS gradient export"]},
    "QR Code 產生器": {"name": "QR Code Generator", "subtitle": "Links, text, Wi-Fi to QR", "features": ["Instant QR", "Download PNG", "Free, no signup"]},
    "圖片壓縮工具": {"name": "Image Compressor", "subtitle": "Compress & resize in-browser", "features": ["No upload, private", "Compress + resize", "JPG/PNG/WebP"]},
    "PDF 工具": {"name": "PDF Tools", "subtitle": "Images to PDF, merge PDFs", "features": ["Images to PDF", "Merge PDFs", "Local, no upload"]},
    "多功能計算機": {"name": "Everyday Calculators", "subtitle": "BMI, loan, %, age, tip", "features": ["Tabbed multi-calculator", "Instant results", "Free, no signup"]},
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
    f_free  = _find_font(30, bold=True)

    def cx(text, y, fnt, fill):
        w = draw.textlength(text, font=fnt)
        draw.text(((W - w) // 2, y), text, font=fnt, fill=fill)

    cx(EN_CARD.get(site["name"], {}).get("name", site["name"]), 195, f_title, WHITE)
    cx(EN_CARD.get(site["name"], {}).get("subtitle", site["subtitle"]), 260, f_sub, GRAY)

    # Divider
    draw.line([(120, 305), (W - 120, 305)], fill=BORDER, width=1)

    # FREE badge
    FREE_Y = 325
    draw.rounded_rectangle([W // 2 - 215, FREE_Y, W // 2 + 215, FREE_Y + 60], radius=30,
                           fill=(*accent_dim, 180), outline=accent, width=2)
    cx("FREE ONLINE TOOL", FREE_Y + 13, f_free, accent)

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
    tags = "#FreeTools  #AITools  #Investing  #NoSignup"
    cx(tags, 975, f_tag, tuple(c // 2 for c in accent))

    # QR code (scan to open) — bottom-left
    try:
        import urllib.request as _ur
        from io import BytesIO as _BIO
        _qrb = _ur.urlopen("https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=6&data=" + _ur.quote(site["url"], safe=""), timeout=20).read()
        _qri = Image.open(_BIO(_qrb)).convert("RGB").resize((120, 120))
        img.paste(_qri, (45, 935))
        draw.text((105, 1066), "Scan", font=_find_font(18), fill=(120, 130, 160), anchor="mm")
    except Exception as _qe:
        print(f"[img] qr failed: {_qe}", flush=True)

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

