#!/usr/bin/env python3
"""
Marketing Agents Team — slashmantools.us
=========================================
A 3-persona Claude pipeline that reviews the tools on slashmantools.us, judges
whether each meets real market demand, and auto-produces promotion copy that
plays up each tool's strengths.

Personas (sequential, each its own Claude call):
  1. 市場分析師  Market Analyst    — search demand / competition / opportunity score
  2. 行銷企劃專家 Marketing Strategist — USP, target audience, channels, weekly spotlight
  3. 文案專家    Copywriter        — ready-to-post promo copy (multi-platform + hashtags)

Free data sources (best-effort, never fatal):
  - Abacus view counts scraped from each tool page  (real engagement signal)
  - Google Trends interest via pytrends             (search-demand signal)

Outputs:
  - marketing/latest.md         (overwritten each run, rendered by marketing/index.html)
  - marketing/report-<date>.md  (archive)
  - Discord summary with the dashboard URL (concise, per project convention)

Env: ANTHROPIC_API_KEY (required), DISCORD_WEBHOOK (optional).
"""

import os
import re
import json
import datetime
import urllib.request
import urllib.error

import anthropic

SITE = "https://slashmantools.us"
MODEL = "claude-opus-4-8"
TODAY = datetime.date.today().isoformat()

# --- The tool catalog on slashmantools.us -----------------------------------
# slug -> (display name, primary search keyword, one-line description)
TOOLS = [
    ("password-generator",      "Strong Password Generator", "strong password generator", "Generates high-entropy passwords & passphrases entirely client-side."),
    ("word-counter",            "Word Counter",              "word counter",               "Counts words, characters, sentences & reading time as you type."),
    ("compound-calculator",     "Compound Interest Calculator", "compound interest calculator", "Projects investment growth with compounding & contributions."),
    ("unit-converter",          "Unit Converter",            "unit converter",             "Converts length, weight, temperature, volume and more."),
    ("calculators",             "Calculators Hub",           "online calculator",          "A hub of everyday calculators (finance, math, health)."),
    ("pomodoro-focus-timer",    "Pomodoro Focus Timer",      "pomodoro timer",             "A distraction-free 25/5 focus timer with session tracking."),
    ("json-regex-devtools",     "JSON & Regex DevTools",     "json formatter regex tester","Format/validate JSON and test regex patterns instantly."),
    ("dev-tools",               "Dev Tools Hub",             "developer tools online",     "A hub of small utilities developers reach for daily."),
    ("color-tools",             "Color Tools",               "color picker hex converter", "Pick colors, convert HEX/RGB/HSL, build palettes."),
    ("qr-code-generator",       "QR Code Generator",         "qr code generator",          "Creates QR codes for links, Wi-Fi and text, free."),
    ("image-compressor",        "Image Compressor",          "compress image online",      "Shrinks JPG/PNG/WebP in-browser without uploading files."),
    ("pdf-tools",               "PDF Tools",                 "pdf tools online",           "Merge, split and handle PDFs privately in the browser."),
    ("ai-image-size-calculator","AI Image Size Calculator",  "midjourney image size",      "Best resolutions/aspect ratios for Midjourney, SD, SDXL."),
    ("ai-prompt-library",       "AI Prompt Library",         "ai prompt library",          "A browsable library of reusable AI prompts."),
    ("token-cost-calculator",   "Token Cost Calculator",     "llm token cost calculator",  "Estimate token counts & GPT/Claude/Gemini API cost."),
    ("llm-calc",                "LLM VRAM Calculator",       "llm vram calculator",        "How much VRAM a local LLM needs (7B–405B, GGUF/AWQ/FP16)."),
]


# --- Data gathering (best-effort) -------------------------------------------
def _get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (marketing-agents)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def fetch_views(slug):
    """Scrape the Abacus counter key off the tool page, then read its value."""
    try:
        html = _get(f"{SITE}/{slug}/")
    except Exception:
        return None
    m = re.search(r"abacus\.jasoncameron\.dev/(?:hit|get)/([\w.-]+)/([\w.-]+)", html)
    if not m:
        return None
    ns, key = m.group(1), m.group(2)
    try:
        data = json.loads(_get(f"https://abacus.jasoncameron.dev/get/{ns}/{key}"))
        return int(data.get("value"))
    except Exception:
        return None


def fetch_trends(keywords):
    """Best-effort Google Trends interest. Returns {keyword: avg_interest}. Empty on failure."""
    out = {}
    try:
        from pytrends.request import TrendReq
        pt = TrendReq(hl="en-US", tz=0, timeout=(10, 25))
        # pytrends allows max 5 keywords per payload; batch them.
        for i in range(0, len(keywords), 5):
            batch = keywords[i:i + 5]
            try:
                pt.build_payload(batch, timeframe="today 3-m")
                df = pt.interest_over_time()
                if df is None or df.empty:
                    continue
                for kw in batch:
                    if kw in df.columns:
                        out[kw] = round(float(df[kw].mean()), 1)
            except Exception:
                continue  # one bad batch shouldn't kill the rest
    except Exception:
        pass  # pytrends missing or Google blocked the runner IP
    return out


# --- Claude persona runner ---------------------------------------------------
def run_persona(client, system, user, max_tokens=8000):
    """One Claude call with adaptive thinking, streamed, returning the text."""
    with client.messages.stream(
        model=MODEL,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        msg = stream.get_final_message()
    return "".join(b.text for b in msg.content if b.type == "text").strip()


# --- Pipeline ---------------------------------------------------------------
def build_data_block(views, trends):
    rows = ["| Tool | URL | Views | Trend (3-mo avg) | Keyword |",
            "|------|-----|------:|----------------:|---------|"]
    for slug, name, kw, _desc in TOOLS:
        v = views.get(slug)
        t = trends.get(kw)
        rows.append(f"| {name} | {SITE}/{slug}/ | {v if v is not None else '—'} | "
                    f"{t if t is not None else '—'} | {kw} |")
    return "\n".join(rows)


def tool_catalog_text():
    return "\n".join(
        f"- {name} ({SITE}/{slug}/) — {desc} [primary keyword: {kw}]"
        for slug, name, kw, desc in TOOLS
    )


def main():
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY

    print("Gathering data…")
    views = {slug: fetch_views(slug) for slug, *_ in TOOLS}
    trends = fetch_trends([kw for _slug, _n, kw, _d in TOOLS])
    data_block = build_data_block(views, trends)
    catalog = tool_catalog_text()
    print(f"views collected: {sum(1 for v in views.values() if v is not None)}/{len(TOOLS)} | "
          f"trends collected: {len(trends)}")

    # ---- 1. Market Analyst -------------------------------------------------
    print("Persona 1/3: Market Analyst…")
    analyst = run_persona(
        client,
        system=(
            "You are a senior Market Analyst on a marketing team. You assess whether "
            "free web tools meet real market demand using search-demand intuition, "
            "competition level, and real engagement signals (page view counts). "
            "Be concrete and decisive — give numbers and a recommendation, not a survey."
        ),
        user=(
            "Here is the catalog of tools on slashmantools.us:\n\n"
            f"{catalog}\n\n"
            "Engagement & search-demand data (Views = real Abacus page views; "
            "Trend = Google Trends 3-month average interest 0-100; '—' means no data "
            "this run — judge from your own knowledge of the category):\n\n"
            f"{data_block}\n\n"
            "For EACH tool, output one compact block:\n"
            "**<Tool name>** — Demand: <High/Medium/Low> · Competition: <High/Medium/Low> "
            "· Opportunity score: <1-10>\n"
            "One sentence: does it meet market demand, and why.\n\n"
            "Then end with a short '## 結論' section in Traditional Chinese: the 3 tools "
            "with the best opportunity (best demand-to-competition ratio) and the 2 "
            "weakest, with one line each on what to do."
        ),
    )

    # ---- 2. Marketing Strategist (行銷企劃專家) ----------------------------
    print("Persona 2/3: Marketing Strategist…")
    strategist = run_persona(
        client,
        system=(
            "你是一位資深行銷企劃專家。你根據市場分析，找出每個工具的差異化賣點(USP)與強項，"
            "定義目標受眾與最適推廣管道，並挑出『本週主打』。務實、可執行，用繁體中文輸出。"
        ),
        user=(
            "工具清單：\n\n" + catalog + "\n\n"
            "市場分析師的分析如下：\n\n" + analyst + "\n\n"
            "請輸出：\n"
            "1. 對機會分數最高的工具，逐一列出：強項/USP、目標受眾、最適推廣管道(平台)。\n"
            "2. 一個『## 本週主打』區塊：挑 2-3 個工具作為本週重點推廣對象，說明為什麼是這幾個"
            "（結合需求、數據、季節性/時事），並給每個一句推廣切角(angle)。"
        ),
    )

    # ---- 3. Copywriter (文案專家) -----------------------------------------
    print("Persona 3/3: Copywriter…")
    copywriter = run_persona(
        client,
        system=(
            "你是一位社群文案專家。你依據行銷策略，為『本週主打』工具產出可直接發佈的推廣文案，"
            "凸顯工具強項。語氣自然、不浮誇。用繁體中文。"
        ),
        user=(
            "行銷企劃專家的策略如下：\n\n" + strategist + "\n\n"
            "只針對『本週主打』的工具，為每一個產出 3 種平台的文案，標題用工具名：\n"
            "- **Threads / X (短)**：≤ 280 字，含 1 個吸睛開頭 + 連結 + 3-5 個 hashtags。\n"
            "- **Facebook / IG (中)**：3-5 句，帶情境與好處 + 連結 + hashtags。\n"
            "- **一句話標語 (tagline)**。\n"
            "每個工具都要附上正確網址（https://slashmantools.us/<slug>/）。"
        ),
    )

    # ---- Assemble report ---------------------------------------------------
    report = f"""# 市場契合度與推廣分析報告

_由「行銷 Agents 團隊」自動生成 · 市場分析師 × 行銷企劃專家 × 文案專家 · {TODAY}_

> 分析對象：[slashmantools.us]({SITE}) 上的免費工具。資料來源：Abacus 實際瀏覽數 + Google Trends 搜尋熱度（公開、免費）。

## 📊 數據快照

{data_block}

---

## 1️⃣ 市場需求分析 — 市場分析師

{analyst}

---

## 2️⃣ 推廣策略 — 行銷企劃專家

{strategist}

---

## 3️⃣ 推廣文案 — 文案專家

{copywriter}

---

_本報告每週自動更新。模型：{MODEL}。_
"""

    os.makedirs("marketing", exist_ok=True)
    with open("marketing/latest.md", "w", encoding="utf-8") as f:
        f.write(report)
    with open(f"marketing/report-{TODAY}.md", "w", encoding="utf-8") as f:
        f.write(report)
    print(f"Wrote marketing/latest.md and marketing/report-{TODAY}.md")

    # ---- Discord summary (concise + URL) -----------------------------------
    webhook = os.environ.get("DISCORD_WEBHOOK")
    if webhook:
        # Pull the '本週主打' tool names heuristically for a short ping.
        spot = re.findall(r"本週主打[\s\S]{0,600}", strategist)
        spotlight = (spot[0][:400] + "…") if spot else "見報告"
        content = (
            f"📊 **行銷分析報告已更新** ({TODAY})\n"
            f"🔗 {SITE}/marketing/\n\n"
            f"本週重點（行銷企劃挑選）：\n>>> {spotlight}"
        )
        try:
            req = urllib.request.Request(
                webhook, method="POST",
                data=json.dumps({"content": content[:1900]}).encode(),
                headers={"Content-Type": "application/json", "User-Agent": "cc"},
            )
            urllib.request.urlopen(req, timeout=30)
            print("Discord notified.")
        except Exception as e:
            print(f"Discord notify failed: {e}")
    else:
        print("No DISCORD_WEBHOOK; skipping Discord.")


if __name__ == "__main__":
    main()
