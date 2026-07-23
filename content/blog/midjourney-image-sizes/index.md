---
title: "Best Image Sizes & Aspect Ratios for Midjourney, Stable Diffusion & SDXL (2026)"
description: "The right resolutions and aspect ratios for Midjourney, Stable Diffusion and SDXL — native sizes, common ratios, why multiples of 64 matter, and a free size calculator."
date: 2026-06-06
lastmod: 2026-06-06
slug: "midjourney-image-sizes"
---
<p>Generating AI art at the wrong dimensions is the single most common reason images come out wrong — stretched faces, awkward crops, duplicated limbs, and compute wasted on a picture you'll delete. The fix is almost always to pick a size the model was actually trained to produce. This guide covers the native resolutions and the best aspect ratios for Midjourney, Stable Diffusion 1.5 and SDXL, explains the "multiples of 64" rule that trips people up, and points you at our <a href="https://slashmantools.us/ai-image-size-calculator/">free AI image size calculator</a> for ready-to-paste dimensions in any ratio.</p>

  <h2>Why dimensions matter so much</h2>
  <p>Diffusion models are trained on images at particular resolutions, and they perform best when you generate close to those. Push far past the model's training size in a single pass and quality degrades in a very recognizable way: the classic "two heads" or duplicated-torso artifact comes from generating a canvas so tall or wide that the model tries to fill the extra space by repeating a subject. Go too small and you lose detail the model needs to compose a coherent scene.</p>
  <p>There's also a technical constraint. Diffusion models don't work on your pixels directly — they operate in a compressed <strong>latent space</strong> that is downsampled by a factor of 8. That's why dimensions should always be <strong>multiples of 8, and ideally multiples of 64</strong>: a width or height that doesn't divide cleanly forces the model to pad or crop the latent grid, which shows up as soft edges or seams.</p>

  <h2>Native resolutions by model</h2>
  <table>
    <tr><th>Model</th><th>Native (1:1)</th><th>Total pixels</th><th>Note</th></tr>
    <tr><td>Stable Diffusion 1.5</td><td>512 × 512</td><td>~0.26 MP</td><td>Generate small, then upscale for detail</td></tr>
    <tr><td>SDXL / SDXL Turbo</td><td>1024 × 1024</td><td>~1.0 MP</td><td>Best results near a ~1MP budget</td></tr>
    <tr><td>Midjourney v6 / v7</td><td>~1024 base</td><td>~1.0 MP</td><td>Set shape with <code>--ar</code>, then Upscale</td></tr>
    <tr><td>FLUX-class models</td><td>1024 × 1024</td><td>~1.0 MP</td><td>Handle up to ~2MP better than older models</td></tr>
  </table>
  <p>The key takeaway: SD 1.5 wants roughly a quarter-megapixel, while SDXL, Midjourney and the newer FLUX-family models are happiest around one megapixel total. Keep the <em>total pixel count</em> near that budget and reshape it into whatever aspect ratio you need.</p>

  <h2>Common aspect ratios (SDXL / ~1MP-friendly)</h2>
  <p>Each of these holds close to the one-megapixel budget while giving you a different shape. All dimensions are multiples of 64.</p>
  <table>
    <tr><th>Ratio</th><th>Use</th><th>Dimensions</th></tr>
    <tr><td>1:1</td><td>Avatars, Instagram grid, album art</td><td>1024 × 1024</td></tr>
    <tr><td>16:9</td><td>Wallpaper, YouTube thumbnails, video</td><td>1344 × 768</td></tr>
    <tr><td>9:16</td><td>Phone wallpaper, Shorts / Reels / Stories</td><td>768 × 1344</td></tr>
    <tr><td>3:2</td><td>Photography, prints</td><td>1216 × 832</td></tr>
    <tr><td>2:3</td><td>Portrait, posters, book covers</td><td>832 × 1216</td></tr>
    <tr><td>4:3</td><td>Classic screen, presentations</td><td>1152 × 896</td></tr>
    <tr><td>21:9</td><td>Cinematic, ultrawide banners</td><td>1536 × 640</td></tr>
  </table>

  <h2>How Midjourney handles size differently</h2>
  <p>Midjourney doesn't ask you for a pixel width and height. Instead you set the shape with the <code>--ar</code> flag — for example <code>--ar 16:9</code> or <code>--ar 2:3</code> — and Midjourney chooses sensible base dimensions around its ~1MP budget for that ratio. You then use the <strong>Upscale</strong> buttons to render the final higher-resolution image. So for Midjourney the mental model is "pick a ratio, then upscale," whereas for Stable Diffusion and SDXL you specify exact width × height yourself. If you're moving prompts between the two, translate your <code>--ar</code> ratio into the matching pixel dimensions from the table above.</p>

  

  <h2>Platform-specific target sizes</h2>
  <p>Once you have a clean generation, match the delivery format to where it's going. Generate near the model budget in the closest ratio, then upscale or crop to the exact platform spec:</p>
  <table>
    <tr><th>Platform / use</th><th>Ratio</th><th>Final target</th></tr>
    <tr><td>Instagram post</td><td>1:1 or 4:5</td><td>1080 × 1080 / 1080 × 1350</td></tr>
    <tr><td>Instagram / TikTok Story, Reels, Shorts</td><td>9:16</td><td>1080 × 1920</td></tr>
    <tr><td>YouTube thumbnail</td><td>16:9</td><td>1280 × 720</td></tr>
    <tr><td>Desktop wallpaper</td><td>16:9</td><td>1920 × 1080 (upscaled)</td></tr>
    <tr><td>Print (A-series, photo)</td><td>3:2 or 2:3</td><td>Upscale to 300 DPI</td></tr>
  </table>

  <h2>Tips for clean generations</h2>
  <ul>
    <li><strong>Stay near the model's pixel budget.</strong> SDXL and Midjourney like ~1MP; SD 1.5 likes ~0.26MP. Going much larger in one pass invites duplication artifacts.</li>
    <li><strong>Generate, then upscale.</strong> For large prints or 4K wallpapers, render at the native budget and use a dedicated upscaler rather than generating huge directly.</li>
    <li><strong>Match the platform up front.</strong> Choose 9:16 for vertical video, 16:9 for thumbnails and wallpapers, 1:1 or 4:5 for the Instagram grid — reshaping later means re-cropping and lost detail.</li>
    <li><strong>Keep every dimension divisible by 64.</strong> It costs nothing and eliminates a whole class of padding and seam artifacts.</li>
    <li><strong>Don't fight extreme ratios.</strong> Very wide (21:9) or very tall panoramas are more prone to repetition — consider generating in a milder ratio and outpainting the edges.</li>
  </ul>

  

  <h2>FAQ</h2>
  <p><strong>Why do multiples of 64 matter?</strong> Diffusion models operate on a latent grid downsampled by 8×. Dimensions aligned to 8 — and ideally 64 — map cleanly onto that grid, so the model doesn't have to pad or crop, which is what causes soft edges and seams.</p>
  <p><strong>What's the best size for SDXL?</strong> Aim for about one megapixel total: 1024 × 1024 for square, or one of the ratio equivalents in the table above. Straying far from ~1MP in a single pass is where quality drops.</p>
  <p><strong>Can I just generate at 4K directly?</strong> Usually not in one pass — you'll get artifacts and repeated elements. Generate at the native budget, then upscale with a tool built for it. Newer FLUX-class models tolerate up to ~2MP better, but upscaling is still the reliable route to 4K.</p>
  <p><strong>How do Midjourney's <code>--ar</code> ratios map to pixels?</strong> Midjourney picks base dimensions around ~1MP for whatever ratio you request, then you upscale. To reproduce a Midjourney shape in SDXL, use the matching pixel dimensions from the aspect-ratio table above.</p>
  <p><strong>What if I need an unusual ratio?</strong> Use our <a href="https://slashmantools.us/ai-image-size-calculator/">AI image size calculator</a> — enter any ratio and it returns model-friendly dimensions snapped to multiples of 64 at your chosen pixel budget.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
