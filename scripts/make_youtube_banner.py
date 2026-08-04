#!/usr/bin/env python3
"""
make_youtube_banner.py — generate a Gentle Soul channel banner with a
newsletter QR code + shortlink, sized for YouTube's 2048x1152 spec.

The banner is generated locally (no upload) — the caller uploads it via
YouTube Studio (Customize channel → Branding → Banner image) because the
Data API channelBanners.insert flow needs the final URL and Studio is the
reliable path. The script also prints the recommended upload flow.

Usage:
  python3 scripts/make_youtube_banner.py [--out /tmp/gentle-soul-banner.png]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 2048, 1152
SAFE_W, SAFE_H = 1546, 423  # desktop safe area (centered)
NEWSLETTER_URL = "https://slashmantools.us/newsletter/"

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

BG_TOP = (10, 28, 45)
BG_BOT = (10, 35, 49)
ACCENT = (99, 102, 241)
TEXT = (240, 240, 248)
MUTED = (140, 140, 180)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/gentle-soul-banner.png")
    args = ap.parse_args()

    import qrcode

    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)

    # Accent bar
    d.rectangle([0, 0, 16, H], fill=ACCENT)

    # Headline (centered in safe area)
    f_head = ImageFont.truetype(FONT_BOLD, 96)
    f_sub = ImageFont.truetype(FONT_REG, 44)
    f_cta = ImageFont.truetype(FONT_CJK, 40)
    f_url = ImageFont.truetype(FONT_REG, 36)

    cx = W // 2
    safe_top = (H - SAFE_H) // 2

    d.text((cx, safe_top + 90), "Gentle Soul — Lofi & Ambient", font=f_head, fill=TEXT, anchor="mm")
    d.text((cx, safe_top + 200), "Deep focus music for study, work & quiet nights", font=f_sub, fill=MUTED, anchor="mm")

    # QR code (newsletter URL) on the right side of the safe area
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(NEWSLETTER_URL)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#f0f0f8", back_color="#0a0a0f").convert("RGB")
    qr_size = 300
    qr_img = qr_img.resize((qr_size, qr_size))
    qr_x = cx + SAFE_W // 2 - qr_size - 40
    qr_y = safe_top + 260
    img.paste(qr_img, (qr_x, qr_y))

    # CTA text next to QR
    d.text((qr_x - 60, qr_y + 40), "📬 Free weekly AI tips", font=f_cta, fill=TEXT, anchor="rm")
    d.text((qr_x - 60, qr_y + 110), NEWSLETTER_URL, font=f_url, fill=ACCENT, anchor="rm")

    out = Path(args.out)
    img.save(out, "PNG")
    print(f"Banner saved: {out} ({W}x{H})")
    print("Upload: YouTube Studio → Customize channel → Branding → Banner image")
    return 0


if __name__ == "__main__":
    sys.exit(main())
