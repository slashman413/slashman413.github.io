#!/usr/bin/env python3
"""Migrate hand-built HTML posts/pages into Hugo content. Run from worktree root."""
import os, re, html, glob, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]

def read(p): return pathlib.Path(p).read_text(encoding="utf-8")

def find_block(s, start_idx, open_tag):
    """Given s and index of the opening '<div'/'<a' at start_idx, return end index just after matching close."""
    tag = open_tag  # 'div' or 'a'
    i = start_idx
    depth = 0
    pat = re.compile(r"<(/?)%s\b" % tag, re.I)
    for m in pat.finditer(s, start_idx):
        if m.group(1) == "":
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                # find the '>' after this close tag
                gt = s.find(">", m.end())
                return gt + 1
    return len(s)

def remove_blocks(body, tag, cls):
    """Remove every <tag class='...cls...'>...</tag> block (depth-aware)."""
    out = body
    while True:
        m = re.search(r'<%s\b[^>]*class="[^"]*\b%s\b[^"]*"[^>]*>' % (tag, re.escape(cls)), out, re.I)
        if not m: break
        end = find_block(out, m.start(), tag)
        out = out[:m.start()] + out[end:]
    return out

def inner_wrap(bodyhtml):
    m = re.search(r'<div\b[^>]*class="[^"]*\bwrap\b[^"]*"[^>]*>', bodyhtml, re.I)
    if not m: return bodyhtml
    end = find_block(bodyhtml, m.start(), "div")
    inner = bodyhtml[m.end():]
    # end index was relative to full; recompute inner close
    endinner = find_block(bodyhtml, m.start(), "div")
    inner = bodyhtml[m.end():endinner]
    inner = re.sub(r'</div>\s*$', '', inner.rstrip())
    return inner

def clean_body(full):
    m = re.search(r'<body[^>]*>(.*)</body>', full, re.S | re.I)
    b = m.group(1) if m else full
    b = re.sub(r'<script\b.*?</script>', '', b, flags=re.S | re.I)
    b = inner_wrap(b)
    # strip leading h1 + meta dateline (theme renders these)
    b = re.sub(r'<h1\b[^>]*>.*?</h1>', '', b, count=1, flags=re.S | re.I)
    b = re.sub(r'<div\b[^>]*class="[^"]*\bmeta\b[^"]*"[^>]*>.*?</div>', '', b, count=1, flags=re.S | re.I)
    # demote in-article tool CTAs
    b = remove_blocks(b, "a", "cta")
    b = remove_blocks(b, "div", "cta")
    b = remove_blocks(b, "div", "ad-slot")
    b = remove_blocks(b, "div", "footer")
    return b.strip()

def meta(full, name, attr="name"):
    m = re.search(r'<meta\s+%s="%s"\s+content="([^"]*)"' % (attr, name), full, re.I)
    return html.unescape(m.group(1)) if m else ""

def jsonld(full, key):
    m = re.search(r'"%s"\s*:\s*"([^"]*)"' % key, full)
    return m.group(1) if m else ""

def title_of(full):
    m = re.search(r'<title>(.*?)</title>', full, re.S | re.I)
    t = html.unescape(m.group(1).strip()) if m else "Untitled"
    t = re.split(r'\s+[—|–\-]\s+', t)[0].strip()
    return t

def yesc(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def fm(title, desc, date, lastmod, slug=None, extra=""):
    lines = ["---", "title: " + yesc(title)]
    if desc: lines.append("description: " + yesc(desc))
    lines.append("date: " + (date or "2026-07-01"))
    if lastmod: lines.append("lastmod: " + lastmod)
    if slug: lines.append("slug: " + yesc(slug))
    if extra: lines.append(extra)
    lines.append("---\n")
    return "\n".join(lines)

# --- blog posts ---
n = 0
for d in sorted(glob.glob(str(ROOT / "blog" / "*"))):
    idx = os.path.join(d, "index.html")
    if not os.path.isfile(idx): continue
    slug = os.path.basename(d)
    full = read(idx)
    title = title_of(full)
    desc = meta(full, "description")
    dp = jsonld(full, "datePublished") or "2026-07-01"
    dm = jsonld(full, "dateModified") or dp
    body = clean_body(full)
    out = ROOT / "content" / "blog" / slug / "index.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(fm(title, desc, dp, dm, slug) + body + "\n", encoding="utf-8")
    n += 1
print("migrated %d blog posts" % n)

# --- flat pages ---
for name in ["about", "contact", "privacy", "terms"]:
    p = ROOT / (name + ".html")
    if not p.exists(): continue
    full = read(str(p))
    title = title_of(full)
    desc = meta(full, "description")
    # these use a lighter theme; grab body text minus scripts/nav/footer
    m = re.search(r'<body[^>]*>(.*)</body>', full, re.S | re.I)
    b = m.group(1) if m else full
    b = re.sub(r'<script\b.*?</script>', '', b, flags=re.S | re.I)
    b = remove_blocks(b, "nav", "")  # no-op if none
    b = re.sub(r'<h1\b[^>]*>.*?</h1>', '', b, count=1, flags=re.S | re.I)
    (ROOT / "content" / (name + ".md")).write_text(fm(title or name.title(), desc, "2026-07-01", "2026-07-20") + b.strip() + "\n", encoding="utf-8")
print("migrated flat pages")

# --- news section ---
(ROOT / "content" / "news").mkdir(parents=True, exist_ok=True)
(ROOT / "content" / "news" / "_index.md").write_text(
    fm("News & Notes", "Evergreen explainers and site updates — not breaking news.", "2026-07-20", "2026-07-20") +
    "This section collects evergreen explainers and occasional updates about the site. We deliberately avoid breaking or sensitive news.\n",
    encoding="utf-8")
starter = ROOT / "content" / "news" / "getting-started-with-slashman-guides" / "index.md"
starter.parent.mkdir(parents=True, exist_ok=True)
starter.write_text(
    fm("Getting Started with Slashman Guides", "What this site is, how it's organized, and how to get the most from it.", "2026-07-20", "2026-07-20", "getting-started-with-slashman-guides") +
    "<p>Welcome to <strong>Slashman Guides</strong> — a growing library of practical, evergreen guides on personal finance, productivity, developer tooling, and the web.</p>\n"
    "<h2>How the site is organized</h2>\n"
    "<ul><li><strong>Blog</strong> — in-depth how-tos and explainers.</li>"
    "<li><strong>News &amp; Notes</strong> — evergreen explainers and site updates (no breaking news).</li>"
    "<li><strong>Tools</strong> — a small set of free, privacy-first web utilities.</li></ul>\n"
    "<p>Everything here is written to stay useful over time. Use the sidebar to jump between sections.</p>\n",
    encoding="utf-8")
print("created news section")

# --- old-URL redirect stubs in static/ ---
for name in ["about", "contact", "privacy", "terms"]:
    stub = ('<!DOCTYPE html><html><head><meta charset="utf-8">'
            '<meta http-equiv="refresh" content="0; url=/%s/">'
            '<link rel="canonical" href="https://slashmantools.us/%s/">'
            '<title>Redirecting…</title></head><body>'
            '<p>This page has moved to <a href="/%s/">/%s/</a>.</p></body></html>' % (name, name, name, name))
    (ROOT / "static" / (name + ".html")).write_text(stub, encoding="utf-8")
print("wrote redirect stubs")
