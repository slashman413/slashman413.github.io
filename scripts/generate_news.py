#!/usr/bin/env python3
"""Daily tech-news writer for /news/.

Fetches recent tech-news headlines from public RSS feeds, asks DeepSeek to write an
ORIGINAL, transformative analysis piece (not a copy) with source attribution, and
writes it as a Hugo page bundle under content/news/.

Env:
  DEEPSEEK_API_KEY   (required in CI)
  DEEPSEEK_MODEL     (optional; default "deepseek-v4-flash")
  NEWS_DATE          (optional, YYYY-MM-DD; default = today UTC via arg)

The /news/ section is noindex + no-ads + sitemap-excluded by the theme, so this
content does not affect the AdSense review until that guard is removed.
"""
import os, re, sys, json, time, urllib.request, urllib.error, xml.etree.ElementTree as ET, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
FEEDS = [
    "https://techcrunch.com/feed/",
    "https://www.theverge.com/rss/index.xml",
    "https://feeds.arstechnica.com/arstechnica/index",
    "https://hnrss.org/frontpage",
]
UA = {"User-Agent": "Mozilla/5.0 (IntellectualGuides news bot)"}
DEEPSEEK_BASE = "https://api.deepseek.com/chat/completions"
DEFAULT_MODEL = "deepseek-v4-flash"


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def collect_headlines(limit=8):
    items = []
    for feed in FEEDS:
        try:
            raw = fetch(feed)
            # XXE / billion-laughs mitigation: drop any DOCTYPE/entity declarations
            # before parsing untrusted feed XML with the stdlib parser.
            raw = re.sub(rb"<!DOCTYPE[^>]*(\[[^\]]*\])?[^>]*>", b"", raw, flags=re.I | re.S)
            if len(raw) > 5_000_000:
                raise ValueError("feed too large")
            root = ET.fromstring(raw)
        except Exception as e:
            print(f"  feed failed {feed}: {e}", file=sys.stderr)
            continue
        # RSS <item> or Atom <entry>
        for it in root.iter():
            tag = it.tag.split("}")[-1]
            if tag not in ("item", "entry"):
                continue
            title = link = desc = ""
            for c in it:
                ct = c.tag.split("}")[-1]
                if ct == "title":
                    title = strip_html(c.text)
                elif ct == "link":
                    link = c.get("href") or c.text or link
                elif ct in ("description", "summary", "content"):
                    desc = strip_html(c.text)[:400]
            if title and link:
                items.append({"title": title, "link": link, "summary": desc})
            if len(items) >= limit * 2:
                break
        if len(items) >= limit:
            break
    # de-dup by title
    seen, out = set(), []
    for i in items:
        k = i["title"].lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(i)
    return out[:limit]


def recent_titles(n=10):
    out = []
    for p in sorted(ROOT.glob("content/news/*/index.md")):
        m = re.search(r'^title:\s*"?(.*?)"?\s*$', p.read_text(encoding="utf-8"), re.M)
        if m:
            out.append(m.group(1))
    return out[-n:]


def deepseek(prompt, key, retries=3):
    model = os.environ.get("DEEPSEEK_MODEL") or DEFAULT_MODEL
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 8192,
        "stream": False,
        "response_format": {"type": "json_object"},
    }).encode()
    headers = {**UA, "Content-Type": "application/json", "Authorization": f"Bearer {key}"}
    last_err = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(DEEPSEEK_BASE, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:800]
            last_err = RuntimeError(f"DeepSeek HTTP {e.code}: {detail}")
            # Retry only transient statuses (rate limit / server errors).
            if e.code not in (429, 500, 502, 503, 504):
                raise last_err
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last_err = RuntimeError(f"DeepSeek request failed: {e!r}")
        else:
            ch = d["choices"][0]
            content = (ch["message"].get("content") or "").strip()
            finish = ch.get("finish_reason")
            if not content:
                last_err = RuntimeError(f"empty content (finish_reason={finish})")
            elif finish == "length":
                # Truncated => the JSON object is incomplete. This is exactly the
                # failure that broke run 30696496068 (parse_json got a '{' with no
                # matching '}'). Retrying often returns a complete object.
                last_err = RuntimeError("response truncated (finish_reason=length)")
            else:
                return content
        if attempt < retries:
            print(f"  DeepSeek attempt {attempt}/{retries} failed: {last_err}; retrying...", file=sys.stderr)
            time.sleep(2 * attempt)
    raise last_err


def build_prompt(headlines, avoid):
    hl = "\n".join(f"- {h['title']} ({h['link']})" + (f" — {h['summary']}" if h['summary'] else "") for h in headlines)
    avoid_s = "\n".join(f"- {t}" for t in avoid) or "(none yet)"
    return f"""You are a technology writer for "Intellectual Guides". Using the real headlines below as raw material, write ONE original, transformative analysis article (do NOT copy or closely paraphrase any single source — synthesize across them and add your own clear explanation and context). Neutral, sober, informative tone. ~650-850 words.

Today's tech headlines:
{hl}

Do not repeat the angle of these already-published pieces:
{avoid_s}

Return a single strict json object only (no markdown fences), with keys:
  "title": a specific, non-clickbait headline (<= 70 chars),
  "description": a 1-sentence meta description (<= 160 chars),
  "slug": short kebab-case slug (<= 6 words),
  "body_md": the article in Markdown. Start with a 1-2 sentence intro, use 2-4 "## " sections, be concrete, explain WHY it matters. End with a "## Sources" section as a Markdown bullet list linking the specific source URLs you drew from. Include this exact line at the very end: "*This is an AI-assisted analysis compiled from public reporting; verify details with the linked sources.*"
"""


def parse_json(text):
    t = text.strip()
    t = re.sub(r"^```(json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()
    # Fast path: a clean JSON object (the json_object response format should give
    # us this directly).
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    # Fallback: extract the outermost {...} span. Guard against a missing '{' or
    # '}' (start == -1, or end <= start) which previously produced an empty slice
    # and the opaque "Expecting value: line 1 column 1" error.
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end <= start:
        raise ValueError(
            "DeepSeek response contained no complete JSON object "
            f"(len={len(text)}): {text[:300]!r}"
        )
    return json.loads(t[start:end + 1])


def main():
    date = os.environ.get("NEWS_DATE") or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not date:
        print("ERROR: pass a date (YYYY-MM-DD) as arg or NEWS_DATE env", file=sys.stderr)
        return 2
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        # Not an error: the feature is simply dormant until a key is provided.
        # Exit 0 so scheduled/dispatch runs stay green and produce no article.
        print("DEEPSEEK_API_KEY not set — skipping (no article generated).")
        return 0

    print("Fetching headlines...")
    hl = collect_headlines()
    if not hl:
        # Best-effort feature: a transient feed outage must not fail the daily
        # build + deploy. Skip today's article and stay green.
        print("WARNING: no headlines fetched — skipping today's article.", file=sys.stderr)
        return 0
    print(f"  got {len(hl)} headlines")

    try:
        art = parse_json(deepseek(build_prompt(hl, recent_titles()), key))
        for k in ("title", "description", "slug", "body_md"):
            if not art.get(k):
                raise ValueError(f"DeepSeek response missing required key: {k!r}")
    except Exception as e:
        # Article generation is best-effort. A DeepSeek outage, rate limit, or a
        # malformed/truncated response must NOT block the Hugo build + Pages
        # deploy — that step failing is what took down run 30696496068 (the deploy
        # job was skipped and the site never updated). Log loudly and exit 0 so
        # the rest of the pipeline still runs; no article gets committed today.
        print(f"WARNING: article generation failed, skipping today's article: {e}", file=sys.stderr)
        return 0

    topic = re.sub(r"[^a-z0-9-]", "", art["slug"].lower().replace(" ", "-"))[:60] or "tech-news"
    slug = f"{date}-{topic}"   # dated slug => unique URL, matches directory name
    out = ROOT / "content" / "news" / slug / "index.md"
    if out.exists():
        print(f"already exists: {out}")
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)

    def esc(s):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'

    fm = (
        "---\n"
        f"title: {esc(art['title'])}\n"
        f"description: {esc(art['description'])}\n"
        f"date: {date}\n"
        f"lastmod: {date}\n"
        f"slug: {esc(slug)}\n"
        "tags: [tech-news]\n"
        "---\n\n"
    )
    out.write_text(fm + art["body_md"].strip() + "\n", encoding="utf-8")
    print(f"WROTE {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
