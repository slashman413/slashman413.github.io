#!/usr/bin/env python3
"""
generate_social_images.py — per-article social preview images (og.png).

Generates a branded 1200x630 Open Graph / Twitter Card image for every blog
article that does not already ship one, writing it into the article's page
bundle (content/blog/<slug>/og.png). layouts/partials/meta.html picks these up
via .Resources.GetMatch "og.png" (falling back to the site-root static/og.png),
so every article gets a unique, readable share card on X/LinkedIn/Reddit.

Style mirrors static/og.png: dark navy→teal gradient, indigo accent bar,
site wordmark. Titles are wrapped to fit; CJK + Latin both supported.

Usage:
  python3 scripts/generate_social_images.py            # all missing articles
  python3 scripts/generate_social_images.py --all      # regenerate everything
  python3 scripts/generate_social_images.py <slug...>  # specific articles
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BLOG_DIR = ROOT / "content" / "blog"
W, H = 1200, 630

# Fonts — Latin bold + CJK fallback (title may be zh/en/ja).
FONT_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

TOP = (10, 28, 45)      # dark navy
BOT = (10, 35, 49)      # teal-tinted navy
ACCENT = (99, 102, 241)  # indigo
TEXT = (240, 240, 248)
MUTED = (120, 120, 160)


def has_cjk(s: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]", s))


def load_font(size: int, cjk: bool):
    path = FONT_CJK if cjk else FONT_LATIN
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.truetype(FONT_LATIN, size)


def wrap(draw, text, font, max_w):
    """Wrap text to max_w pixels, word-aware for Latin, char-aware for CJK."""
    words = re.findall(r"\S+|\s+", text)
    lines, cur = [], ""
    for tok in words:
        trial = cur + tok
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur.strip())
            cur = tok.strip()
    if cur:
        lines.append(cur.strip())
    return lines


def render_card(title: str, subtitle: str) -> Image.Image:
    cjk = has_cjk(title)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    # Vertical gradient
    for y in range(H):
        t = y / (H - 1)
        color = tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=color)
    # Accent bar on the left
    d.rectangle([0, 0, 14, H], fill=ACCENT)

    font_title = load_font(58, cjk)
    font_sub = load_font(26, cjk)

    # Wordmark
    d.text((48, 44), "SLASHMAN TOOLS", font=load_font(24, False), fill=MUTED)

    # Title (up to ~4 lines)
    lines = wrap(d, title, font_title, W - 120)
    lines = lines[:4]
    y = 170
    for ln in lines:
        d.text((48, y), ln, font=font_title, fill=TEXT)
        y += 72

    # Subtitle line
    sub = f"  {subtitle}" if subtitle else ""
    if sub:
        d.text((48, min(y + 30, H - 70)), sub, font=font_sub, fill=MUTED)
    else:
        d.text((48, min(y + 30, H - 70)), "slashmantools.us", font=font_sub, fill=MUTED)
    return img


def frontmatter_title(bundle: Path) -> str:
    """Extract the EN (index.en.md) title; fall back to any index.*.md title."""
    for name in ("index.en.md", "index.md", "index.zh-cn.md", "index.zh-tw.md"):
        f = bundle / name
        if not f.exists():
            continue
        txt = f.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', txt, re.M)
        if m:
            return m.group(1).strip()
    return bundle.name.replace("-", " ").title()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*", help="specific article slugs")
    ap.add_argument("--all", action="store_true", help="regenerate all, overwriting")
    args = ap.parse_args()

    bundles = sorted(BLOG_DIR.iterdir()) if BLOG_DIR.is_dir() else []
    if args.slugs:
        bundles = [b for b in bundles if b.name in args.slugs]

    made, skipped = 0, 0
    for b in bundles:
        if not b.is_dir():
            continue
        out = b / "og.png"
        if out.exists() and not args.all:
            skipped += 1
            continue
        title = frontmatter_title(b)
        sub = f"slashmantools.us · {b.name}"
        render_card(title, sub).save(out, "PNG")
        print(f"  ✓ {b.name}: {title[:50]}")
        made += 1
    print(f"\nGenerated {made}, skipped {skipped} (of {len(bundles)} bundles)")


if __name__ == "__main__":
    sys.exit(main())
