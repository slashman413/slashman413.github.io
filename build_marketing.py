#!/usr/bin/env python3
"""
Marketing report builder — slashmantools.us  (NO AI / NO API KEY)
=================================================================
Data-driven, fully deterministic. Judges whether each tool meets market demand
from real signals, then auto-produces promo copy from curated strengths +
weekly-rotating templates.

Signals (both free, no key):
  - Abacus view counts scraped per tool page   (real engagement — reliable)
  - Google Trends interest via pytrends         (search demand — best-effort)

Outputs:
  - marketing/latest.md         (rendered by marketing/index.html)
  - marketing/report-<date>.md  (archive)
  - Discord ping with the URL (if DISCORD_WEBHOOK is set)

Run anywhere: python build_marketing.py   (no secrets required)
"""

import os
import re
import json
import datetime
import urllib.request

SITE = "https://slashmantools.us"
TODAY = datetime.date.today()
WEEK = TODAY.isocalendar()[1]

# slug, name, trends keyword, category, hook, strength, benefit, tagline, hashtags
DATA = [
    ("password-generator", "強密碼產生器", "password generator", "密碼工具",
     "密碼還在用生日？", "100% 在你瀏覽器產生，密碼不外傳", "3 秒產生一組破解不了的高強度密碼",
     "安全密碼，一鍵生成", "#資安 #密碼 #隱私 #infosec"),
    ("word-counter", "字數計算器", "word counter", "寫作工具",
     "文章到底夠不夠字？", "即時統計字數、字元與閱讀時間", "一邊打字一邊看字數，輕鬆達標",
     "即時字數，寫作必備", "#寫作 #字數 #部落格 #SEO"),
    ("compound-calculator", "複利計算器", "compound interest calculator", "理財工具",
     "你的錢到底會滾多大？", "把複利與定期投入視覺化", "看見時間如何讓資產翻倍",
     "複利的力量，一眼看懂", "#投資 #複利 #理財 #FIRE"),
    ("unit-converter", "單位換算器", "unit converter", "換算工具",
     "公斤磅還在用查的？", "長度、重量、溫度、體積一站搞定", "任何單位一秒換算",
     "所有單位，一站換算", "#工具 #換算 #生產力"),
    ("calculators", "計算器合集", "online calculator", "計算工具",
     "需要算一下？", "日常理財、數學、健康計算器都在這", "各種計算器一站找齊",
     "日常計算，一站搞定", "#計算器 #工具 #生產力"),
    ("pomodoro-focus-timer", "番茄鐘專注計時器", "pomodoro timer", "專注工具",
     "老是分心做不完？", "無干擾 25/5 番茄鐘，還能記錄專注時段", "用番茄鐘擊敗拖延、進入深度工作",
     "專注 25 分鐘，擊敗拖延", "#番茄鐘 #生產力 #專注 #讀書"),
    ("json-regex-devtools", "JSON & Regex 開發工具", "json formatter regex tester", "開發工具",
     "又在跟 JSON、Regex 搏鬥？", "格式化/驗證 JSON、即時測試 Regex，全在瀏覽器",
     "不用裝任何東西就能整理 JSON、測 Regex", "JSON 與 Regex，瀏覽器即測", "#webdev #json #regex #程式"),
    ("dev-tools", "開發工具合集", "developer tools online", "開發工具",
     "開發小工具到處找？", "開發者每天會用到的小工具都在這", "常用開發小工具一站備齊",
     "開發小工具，一站備齊", "#webdev #devtools #程式"),
    ("color-tools", "配色工具", "color picker hex converter", "設計工具",
     "配色一直喬不好？", "選色、HEX/RGB/HSL 互轉、產生調色盤", "快速搞定你的配色方案",
     "選色配色，一次到位", "#設計 #網頁設計 #配色 #UI"),
    ("qr-code-generator", "QR Code 產生器", "qr code generator", "QR 工具",
     "想做個 QR Code？", "連結、Wi-Fi、文字都能做，免費不過期", "幾秒做出一個 QR Code",
     "免費 QR，永久有效", "#qrcode #行銷 #小店家"),
    ("image-compressor", "圖片壓縮器", "compress image online", "圖片工具",
     "圖片太大上傳很慢？", "JPG/PNG/WebP 在瀏覽器壓縮，檔案不上傳", "把圖片變小，同時保有隱私",
     "壓縮圖片，檔案不外流", "#webdev #圖片優化 #隱私 #效能"),
    ("pdf-tools", "PDF 工具", "pdf tools online", "PDF 工具",
     "又要處理 PDF？", "合併、分割 PDF，全在瀏覽器、不上傳", "不用上傳就能處理 PDF",
     "PDF 處理，隱私無虞", "#pdf #生產力 #隱私"),
    ("ai-image-size-calculator", "AI 圖片尺寸計算器", "midjourney image size", "AI 工具",
     "AI 出圖尺寸老是猜？", "Midjourney、SD、SDXL 的最佳解析度與比例", "不再亂猜 AI 出圖尺寸",
     "AI 出圖尺寸，一查就懂", "#midjourney #stablediffusion #AI繪圖 #生成式AI"),
    ("ai-prompt-library", "AI 提示詞庫", "ai prompt library", "AI 工具",
     "提示詞每次都重打？", "可瀏覽、可重用的 AI 提示詞庫", "用驗證過的提示詞拿到更好結果",
     "好用提示詞，隨取隨用", "#AI提示詞 #chatgpt #promptengineering #ai"),
    ("token-cost-calculator", "Token 成本計算器", "llm token cost calculator", "AI 工具",
     "API 帳單怕爆？", "估算 token 數與 GPT/Claude/Gemini API 成本", "先抓預算再呼叫 LLM API",
     "LLM 成本，先算再用", "#llm #openai #api #ai"),
    ("llm-calc", "本地 LLM VRAM 計算器", "llm vram calculator", "AI 工具",
     "這顆模型我的顯卡跑得動嗎？", "算出 7B–405B 模型所需 VRAM（GGUF/AWQ/FP16）", "先確認顯卡能不能跑再下載",
     "本地 LLM，VRAM 先算", "#localllm #ai #顯卡 #機器學習"),
]
FIELDS = ("slug", "name", "kw", "cat", "hook", "strength", "benefit", "tagline", "tags")
TOOLS = [dict(zip(FIELDS, row)) for row in DATA]


# --- data gathering ---------------------------------------------------------
def _get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (marketing-bot)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def fetch_views(slug):
    try:
        html = _get(f"{SITE}/{slug}/")
        m = re.search(r"abacus\.jasoncameron\.dev/(?:hit|get)/([\w.-]+)/([\w.-]+)", html)
        if not m:
            return None
        d = json.loads(_get(f"https://abacus.jasoncameron.dev/get/{m.group(1)}/{m.group(2)}"))
        return int(d.get("value"))
    except Exception:
        return None


def fetch_trends(keywords):
    """Returns {kw: (avg_interest, direction)}; empty if Google blocks the runner."""
    out = {}
    try:
        from pytrends.request import TrendReq
        pt = TrendReq(hl="en-US", tz=0, timeout=(10, 25))
        for i in range(0, len(keywords), 5):
            batch = keywords[i:i + 5]
            try:
                pt.build_payload(batch, timeframe="today 3-m")
                df = pt.interest_over_time()
                if df is None or df.empty:
                    continue
                for kw in batch:
                    if kw not in df.columns:
                        continue
                    s = df[kw].astype(float)
                    avg = round(float(s.mean()), 1)
                    third = max(1, len(s) // 3)
                    delta = s.tail(third).mean() - s.head(third).mean()
                    direction = "↑" if delta > 3 else ("↓" if delta < -3 else "→")
                    out[kw] = (avg, direction)
            except Exception:
                continue
    except Exception:
        pass
    return out


# --- scoring (deterministic) ------------------------------------------------
def bucket_traction(views, vmax):
    if views is None or vmax == 0:
        return "?"
    r = views / vmax
    return "High" if r >= 0.5 else ("Med" if r >= 0.15 else "Low")


def bucket_demand(trend):
    if trend is None:
        return "?"
    avg = trend[0]
    return "High" if avg >= 40 else ("Med" if avg >= 15 else "Low")


VERDICT = {
    ("High", "Low"): "🔥 強需求、曝光不足 → 最佳推廣機會",
    ("High", "Med"): "📈 強需求、成長中 → 加碼推廣",
    ("High", "High"): "✅ 需求強、表現亮眼 → 維持曝光",
    ("Med", "Low"): "🌱 中度需求 → 可小量測試推廣",
    ("Med", "Med"): "➡️ 穩定發展中",
    ("Med", "High"): "✅ 受眾已找到 → 維持",
    ("Low", "Low"): "🔎 小眾 → 綁在合集頁帶流量",
    ("Low", "Med"): "🔎 小眾但有人用 → 維持",
    ("Low", "High"): "⭐ 小眾卻高曝光 → 隱藏招牌",
    ("?", "High"): "✅ 高曝光、受歡迎",
    ("?", "Med"): "➡️ 穩定使用中",
    ("?", "Low"): "🌱 待推廣",
    ("?", "?"): "—",
}


# --- copy templates (weekly-rotating) ---------------------------------------
SHORT_TPL = [
    "{hook} {name}：{strength}。免費、免註冊，開瀏覽器就能用 👉 {url}\n{tags}",
    "{benefit}。{name} 免費幫你搞定 → {url}\n{tags}",
    "{name} — {tagline}。免費工具，不用註冊：{url}\n{tags}",
]
MED_TPL = (
    "{name}｜{tagline}\n\n"
    "{benefit}。{strength}。\n\n"
    "免費使用、無需註冊，馬上試試 👉 {url}\n{tags}"
)


def make_copy(t):
    url = f"{SITE}/{t['slug']}/"
    short = SHORT_TPL[WEEK % len(SHORT_TPL)].format(url=url, **t)
    med = MED_TPL.format(url=url, **t)
    return (
        f"### {t['name']}\n"
        f"**Threads / X（短）**\n```\n{short}\n```\n"
        f"**Facebook / IG（中）**\n```\n{med}\n```\n"
        f"**一句話標語**：{t['tagline']}\n"
    )


# --- main -------------------------------------------------------------------
def main():
    print("Gathering data…")
    for t in TOOLS:
        t["views"] = fetch_views(t["slug"])
    trends = fetch_trends([t["kw"] for t in TOOLS])
    for t in TOOLS:
        t["trend"] = trends.get(t["kw"])  # (avg, dir) or None
    vmax = max([t["views"] for t in TOOLS if t["views"] is not None] or [0])
    trends_ok = len(trends) > 0
    print(f"views: {sum(1 for t in TOOLS if t['views'] is not None)}/{len(TOOLS)} | "
          f"trends: {len(trends)} ({'ok' if trends_ok else 'unavailable — views-only'})")

    for t in TOOLS:
        t["traction"] = bucket_traction(t["views"], vmax)
        t["demand"] = bucket_demand(t["trend"])
        t["verdict"] = VERDICT.get((t["demand"], t["traction"]), "—")
        # opportunity: reward strong demand + room to grow
        if t["trend"] is not None:
            tn = t["trend"][0] / 100.0
            vn = (t["views"] or 0) / vmax if vmax else 0
            t["opp"] = tn + 0.4 * (1 - vn)
        else:
            t["opp"] = None

    # spotlight: data-driven if trends present, else weekly rotation for fair coverage
    if trends_ok:
        spotlight = sorted(TOOLS, key=lambda x: x["opp"] or 0, reverse=True)[:3]
        spot_reason = "依『搜尋需求 + 成長空間』綜合排序選出"
    else:
        n = len(TOOLS)
        start = (WEEK * 3) % n
        spotlight = [TOOLS[(start + i) % n] for i in range(3)]
        spot_reason = "本週輪播（Trends 暫不可用時，輪流推廣以確保每個工具都有曝光）"

    # ---- build report ----
    snap = ["| 工具 | 瀏覽數 | 搜尋熱度 | 趨勢 | 需求 | 曝光 | 判讀 |",
            "|------|------:|--------:|:--:|:--:|:--:|------|"]
    for t in sorted(TOOLS, key=lambda x: (x["views"] or 0), reverse=True):
        tr = t["trend"]
        snap.append(
            f"| [{t['name']}]({SITE}/{t['slug']}/) | {t['views'] if t['views'] is not None else '—'} | "
            f"{tr[0] if tr else '—'} | {tr[1] if tr else '—'} | {t['demand']} | {t['traction']} | {t['verdict']} |"
        )

    spot_md = "\n".join(make_copy(t) for t in spotlight)
    spot_names = "、".join(t["name"] for t in spotlight)

    report = f"""# 市場契合度與推廣報告

_資料驅動自動產生（無需 AI）· {TODAY.isoformat()}（第 {WEEK} 週）_

> 分析對象：[slashmantools.us]({SITE}) 上的免費工具。
> 訊號：**瀏覽數**＝Abacus 實際頁面瀏覽（真實互動）；**搜尋熱度**＝Google Trends 近 3 個月平均（0–100）；**趨勢**＝近期 vs 前期方向。

## 📊 數據快照

{chr(10).join(snap)}

判讀說明：**需求**由搜尋熱度分級、**曝光**由瀏覽數相對分級，兩者交叉得到行動建議。

## 🔥 本週主打（{spot_names}）

{spot_reason}。

{spot_md}

---

_每週一自動更新。資料來源：Abacus + Google Trends（皆免費公開）。_
"""

    os.makedirs("marketing", exist_ok=True)
    with open("marketing/latest.md", "w", encoding="utf-8") as f:
        f.write(report)
    with open(f"marketing/report-{TODAY.isoformat()}.md", "w", encoding="utf-8") as f:
        f.write(report)
    print(f"Wrote marketing/latest.md (+archive). Spotlight: {spot_names}")

    webhook = os.environ.get("DISCORD_WEBHOOK")
    if webhook:
        content = (f"📊 **行銷分析報告已更新** ({TODAY.isoformat()})\n"
                   f"🔗 {SITE}/marketing/\n本週主打：{spot_names}")
        try:
            req = urllib.request.Request(
                webhook, method="POST",
                data=json.dumps({"content": content[:1900]}).encode(),
                headers={"Content-Type": "application/json", "User-Agent": "cc"})
            urllib.request.urlopen(req, timeout=30)
            print("Discord notified.")
        except Exception as e:
            print(f"Discord notify failed: {e}")


if __name__ == "__main__":
    main()
