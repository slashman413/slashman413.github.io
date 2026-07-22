---
title: "How Much VRAM Do You Need to Run a Local LLM? (2026 Guide)"
description: "A practical 2026 guide to LLM VRAM requirements: how much GPU memory you need to run 7B, 13B, 70B and 405B models in GGUF, AWQ and FP16 — with a free calculator."
date: 2026-06-22
lastmod: 2026-07-20
slug: "llm-vram-requirements"
---
<p>Running a large language model on your own machine comes down to one thing above all else: <strong>memory</strong>. If the model's weights, plus its context cache and a little overhead, fit inside your GPU's VRAM, it runs fast and entirely on the card. If they don't, you either spill part of the model into much slower system RAM or you can't load it at all. This guide gives you practical numbers for every common model size and quantization, the math behind them, and a <a href="https://slashmantools.us/llm-calc/">free VRAM calculator</a> to check any specific model instantly.</p>

  <h2>The quick formula</h2>
  <p>The bulk of your VRAM goes to the weights, and that part is easy to estimate:</p>
  <p><strong>Weight VRAM ≈ (number of parameters) × (bytes per parameter)</strong></p>
  <p>On top of the weights you add a buffer for the KV cache (which grows with context length), CUDA/runtime overhead, and activations. Bytes per parameter is set by the quantization you choose:</p>
  <table>
    <tr><th>Precision</th><th>Bytes / param</th><th>Quality</th><th>Notes</th></tr>
    <tr><td>FP16 / BF16</td><td>2.0</td><td>Reference</td><td>Full quality, largest footprint</td></tr>
    <tr><td>8-bit (Q8, INT8)</td><td>~1.0</td><td>Near-lossless</td><td>Great when you have the room</td></tr>
    <tr><td>6-bit (Q6_K)</td><td>~0.75</td><td>Excellent</td><td>Hard to distinguish from Q8</td></tr>
    <tr><td>4-bit (Q4_K_M, AWQ, GPTQ)</td><td>~0.5</td><td>Very good</td><td>Best size/quality trade-off</td></tr>
    <tr><td>3-bit (Q3_K)</td><td>~0.4</td><td>Noticeable loss</td><td>Only when desperate for space</td></tr>
  </table>
  <p>To sanity-check: a 7B model at FP16 is 7 × 2 = 14 GB of weights; the same model at 4-bit is 7 × 0.5 ≈ 3.5 GB, plus overhead. That roughly-4× reduction from FP16 to 4-bit is why quantization is the first tool people reach for.</p>

  <h2>VRAM by model size and quantization</h2>
  <p>These figures include a modest buffer for a short-to-medium context and runtime overhead. They're realistic planning estimates, not exact guarantees — your numbers shift with context length, batch size, and the specific runtime.</p>
  <table>
    <tr><th>Model size</th><th>FP16</th><th>8-bit</th><th>4-bit</th><th>4-bit fits on</th></tr>
    <tr><td>7–8B</td><td>~16 GB</td><td>~9 GB</td><td>~5–6 GB</td><td>RTX 3060 12GB / most laptops</td></tr>
    <tr><td>13–14B</td><td>~28 GB</td><td>~15 GB</td><td>~9–10 GB</td><td>RTX 4070 / 3080</td></tr>
    <tr><td>34B</td><td>~68 GB</td><td>~36 GB</td><td>~20–22 GB</td><td>RTX 3090 / 4090 24GB</td></tr>
    <tr><td>70B</td><td>~140 GB</td><td>~72 GB</td><td>~42–48 GB</td><td>2× 24GB or one 48GB card</td></tr>
    <tr><td>405B</td><td>~810 GB</td><td>~410 GB</td><td>~230 GB</td><td>Multi-GPU server (8× 40GB+)</td></tr>
  </table>
  <p>A useful shortcut: at 4-bit, a model needs roughly <strong>0.6–0.7 GB of VRAM per billion parameters</strong> once overhead is included. Double that for 8-bit, and quadruple it for FP16.</p>

  <h2>Don't forget the KV cache</h2>
  <p>The number everyone forgets is the context cache. As the model processes tokens it stores a key/value entry for each one, and that cache grows linearly with your context length and with the model's size. On a small 7B model a few thousand tokens of context is negligible, but on a 70B model a long 32K-token context can add several extra gigabytes on top of the weights. If you plan to feed the model long documents or hold long conversations, budget for it explicitly rather than assuming the weight figure is the whole story.</p>

  

  <h2>GGUF vs. AWQ vs. GPTQ: which format?</h2>
  <p>Quantized weights come in a few competing formats, and the right one depends on how you run the model:</p>
  <ul>
    <li><strong>GGUF</strong> (llama.cpp, Ollama, LM Studio) is the most flexible. Its killer feature is <em>CPU offload</em>: you can push some layers to the GPU and keep the rest in system RAM, so you can run models that are far larger than your VRAM — just slower. The <code>Q4_K_M</code> variant is the community default sweet spot.</li>
    <li><strong>AWQ</strong> is optimized for pure-GPU inference on serving engines like vLLM. If the model fits entirely in VRAM, AWQ typically delivers higher throughput than GGUF.</li>
    <li><strong>GPTQ</strong> is an older but still widely available 4-bit GPU format, well supported across many toolchains.</li>
  </ul>
  <p>Rule of thumb: if it fits in VRAM and you want maximum speed, use AWQ (or GPTQ) with vLLM. If it doesn't fit, or you want the simplest setup and CPU-offload flexibility, use GGUF with Ollama or llama.cpp.</p>

  <h2>Four ways to fit a bigger model</h2>
  <ul>
    <li><strong>Quantize harder.</strong> Dropping from FP16 to 4-bit roughly quarters the memory with minimal quality loss for most everyday tasks.</li>
    <li><strong>Use GGUF with CPU offload.</strong> Split layers between GPU and RAM so an oversized model still runs; expect a speed hit proportional to how much lives on the CPU.</li>
    <li><strong>Shorten the context window.</strong> If you're memory-bound, a smaller max context shrinks the KV cache directly.</li>
    <li><strong>Add a second GPU.</strong> Tensor or layer parallelism across two cards is the standard way hobbyists reach 70B-class models at 4-bit.</li>
  </ul>

  

  <h2>FAQ</h2>
  <p><strong>Can I run a 70B model on a 24 GB card?</strong> Not fully in VRAM — at 4-bit it needs roughly 42–48 GB. You <em>can</em> run it with GGUF CPU offload, keeping some layers in system RAM, but generation will be noticeably slower. Two 24 GB cards, or a single 48 GB card, is the smoother path.</p>
  <p><strong>Does context length matter for VRAM?</strong> Yes. The KV cache grows with both context length and model size, so long prompts and long chats need meaningful extra memory on top of the weights — sometimes several gigabytes on larger models.</p>
  <p><strong>Is 4-bit noticeably worse than FP16?</strong> For most chat, summarization and coding-assist tasks the difference is small, especially with modern <code>Q4_K_M</code> and AWQ methods. For precision-sensitive work you may prefer 6-bit or 8-bit if you have the room.</p>
  <p><strong>What about Apple Silicon and unified memory?</strong> Macs share one pool of memory between CPU and GPU, so the "VRAM" ceiling is effectively your total unified RAM minus what the system uses. A 64 GB Mac can comfortably run 4-bit models that would need a high-end discrete GPU on a PC.</p>
  <p><strong>How do I get an exact number for my setup?</strong> Plug the model size, quantization and context into our <a href="https://slashmantools.us/llm-calc/">LLM VRAM Calculator</a> — it accounts for the KV cache and overhead so you can see instantly whether a model fits your card.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">AI工具人 (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
