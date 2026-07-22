---
title: "How to Make a QR Code for Free (Links, Wi-Fi & More)"
description: "How to create a QR code for free in seconds — for URLs, text and Wi-Fi — whether QR codes expire, and tips for printing. With a free no-signup QR generator."
date: 2026-06-28
lastmod: 2026-07-20
slug: "how-to-make-qr-code"
---
<p>QR codes are everywhere — restaurant menus, event posters, product packaging, business cards, payment terminals — because they instantly bridge the physical and digital world. A person points a camera, and a second later they're on your website or connected to your Wi-Fi. The best part: making one is completely free and takes about ten seconds. This guide walks through exactly how to create one, explains the technical bits that actually matter (error correction, static vs. dynamic, sizing for print), and answers the questions people ask most often. If you just want to get started, our <a href="https://slashmantools.us/qr-code-generator/">free QR code generator</a> needs no sign-up and downloads instantly.</p>

  <h2>How a QR code actually works</h2>
  <p>A QR ("Quick Response") code is a two-dimensional barcode. Where a traditional barcode stores data in one direction — the widths of vertical lines — a QR code stores it in a grid of black and white squares (called <em>modules</em>), so it can hold far more information in a small space. The three large squares in the corners are <strong>finder patterns</strong>; they let a camera detect the code and figure out its orientation no matter which way you hold your phone. Everything you encode — a link, a phrase, Wi-Fi credentials — is converted to binary and painted into that grid, along with redundant "recovery" data so the code still scans even if part of it is dirty or damaged.</p>
  <p>Because the data lives <em>in the pattern itself</em>, a basic (static) QR code doesn't depend on any server or account. It's just an image. That has real consequences for cost, privacy and longevity, which we'll get to below.</p>

  <h2>What can a QR code contain?</h2>
  <ul>
    <li><strong>A website link (URL)</strong> — by far the most common use: send people to a landing page, menu, form or app-store listing.</li>
    <li><strong>Plain text</strong> — a message, serial number, coupon code or short note that shows up when scanned.</li>
    <li><strong>Wi-Fi credentials</strong> — encode the network name (SSID), security type and password so guests join by scanning instead of typing a 20-character password.</li>
    <li><strong>Contact details (vCard / MeCard)</strong> — name, phone, email and company that save straight into the phone's contacts.</li>
    <li><strong>Email, SMS or phone number</strong> — open a pre-filled email, text message or dialer with one scan.</li>
    <li><strong>Calendar events, geo-locations and payment links</strong> — useful for RSVPs, "find us here" pins and tip jars.</li>
  </ul>

  <h2>How to make one (3 steps)</h2>
  <ol>
    <li>Enter the URL or text you want to encode.</li>
    <li>The QR code is generated instantly as you type — no button to press.</li>
    <li>Download the image (PNG for screens, or a higher-resolution export for print) and share or print it.</li>
  </ol>
  <p>For a Wi-Fi code, pick the "Wi-Fi" input type and enter your network name, security type (usually WPA/WPA2) and password. For a link, paste the full URL including <code>https://</code> so phones open it directly instead of treating it as a search.</p>

  

  <h2>Error correction levels: which one to choose</h2>
  <p>Every QR code carries redundant data so it still scans when part of it is scratched, smudged or covered by a logo. You choose how much redundancy via the <strong>error correction level</strong>. Higher levels survive more damage but make the pattern denser (more modules), which means it must be printed larger to stay scannable. Here's the trade-off:</p>
  <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">
    <tr>
      <th style="border:1px solid rgba(255,255,255,.1);padding:9px 11px;text-align:left;background:rgba(234,179,8,.16);color:#fde047">Level</th>
      <th style="border:1px solid rgba(255,255,255,.1);padding:9px 11px;text-align:left;background:rgba(234,179,8,.16);color:#fde047">Recovers up to</th>
      <th style="border:1px solid rgba(255,255,255,.1);padding:9px 11px;text-align:left;background:rgba(234,179,8,.16);color:#fde047">Best for</th>
    </tr>
    <tr><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">L (Low)</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~7% damage</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Clean digital display, maximum data capacity</td></tr>
    <tr><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">M (Medium)</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~15% damage</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">The sensible default for most links</td></tr>
    <tr><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Q (Quartile)</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~25% damage</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Business cards, stickers, outdoor use</td></tr>
    <tr><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">H (High)</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~30% damage</td><td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Codes with a logo in the center, harsh environments</td></tr>
  </table>
  <p>Practical rule: use <strong>M</strong> for a normal on-screen or clean printed link, and step up to <strong>H</strong> if you're placing a logo in the middle of the code or printing on something that will get handled, folded or weathered.</p>

  <h2>Do QR codes expire?</h2>
  <p><strong>Static QR codes don't expire.</strong> A static code encodes your content directly into the pattern, so it works forever, has no scan limits, and reports no tracking data. It will scan the same in 2026 as it does in 2036. Some commercial <strong>dynamic</strong> QR services instead encode a short redirect URL that points to their server, then forward the scan to your real destination. That lets you edit the target later and see scan analytics — but it also means the code stops working if you stop paying, and every scan passes through a third party. For a simple menu, business card or Wi-Fi code, a static code is the safer, free choice.</p>

  <h2>Real-world use cases</h2>
  <ul>
    <li><strong>Restaurants &amp; cafés</strong> — a table tent linking to the menu or an online-ordering page.</li>
    <li><strong>Events &amp; conferences</strong> — badges that share a vCard, or posters linking to the schedule and RSVP form.</li>
    <li><strong>Retail &amp; packaging</strong> — product pages, setup instructions or warranty registration printed on the box.</li>
    <li><strong>Home &amp; office Wi-Fi</strong> — a small printed card by the door so guests join without asking for the password.</li>
    <li><strong>Small business marketing</strong> — flyers and shop windows linking to reviews, a booking page or social profiles.</li>
  </ul>

  <h2>Tips for QR codes that always scan</h2>
  <ul>
    <li><strong>Test before you print.</strong> Scan the final image with two different phones (one iPhone, one Android) using the built-in camera app — not just a QR app.</li>
    <li><strong>Keep strong contrast.</strong> A dark code on a light background is the most reliable. Avoid low-contrast color combinations and never invert to light-on-dark unless you've tested it.</li>
    <li><strong>Don't print too small.</strong> A rough guideline is a minimum of about 2 × 2 cm at arm's length, scaling up with distance — roughly the scan distance divided by 10 gives a usable code width (a poster read from 3 m wants a code about 30 cm wide).</li>
    <li><strong>Leave a quiet zone.</strong> Keep a clear margin of at least four modules of empty space around the code so the camera can isolate it.</li>
    <li><strong>Shorten long links.</strong> A shorter URL means fewer modules and a cleaner, easier-to-scan pattern, especially at small print sizes.</li>
  </ul>

  

  <h2>FAQ</h2>
  <p><strong>Is it really free?</strong> Yes — our generator is free with no watermark and no account, and the codes it produces are yours to use commercially.</p>
  <p><strong>Can I make a Wi-Fi QR code?</strong> Yes — choose the Wi-Fi input, enter your network name and password, and guests join by scanning. No app required on modern iOS or Android.</p>
  <p><strong>Are scans tracked?</strong> Not with a static code — it points straight to your content with no analytics, redirects or scan limits. Only dynamic (paid, server-based) codes track scans.</p>
  <p><strong>What image format should I download?</strong> PNG is perfect for screens and most printing. If your printer wants vector art for large signage, export at the highest resolution available and confirm it still scans after printing.</p>
  <p><strong>Can I put my logo in the middle?</strong> Yes, if you raise the error-correction level to H and keep the logo small (under ~20% of the code area), then re-test on real devices before publishing.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
