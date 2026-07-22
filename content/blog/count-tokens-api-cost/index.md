---
title: "How Many Tokens Is My Text? (And How to Estimate API Cost)"
description: "What an LLM token is, a quick way to estimate how many tokens your prompt uses, and how to calculate GPT, Claude & Gemini API cost — with a free token & cost calculator."
date: 2026-06-22
lastmod: 2026-07-20
slug: "count-tokens-api-cost"
---
<p>If you're building anything on top of the OpenAI, Anthropic or Google APIs, your bill isn't measured in words, characters or requests — it's measured in <strong>tokens</strong>. Every prompt you send and every response you get back is chopped into these little chunks, counted, and billed. Understanding how tokens work is the single most useful thing you can do to predict your monthly cost, avoid blowing through a model's context window, and stop overpaying for capacity you don't need. Here's the practical version, with worked numbers and a <a href="https://slashmantools.us/token-cost-calculator/">free token &amp; cost calculator</a> you can use as you read.</p>

  <h2>What exactly is a token?</h2>
  <p>A token is a fragment of text that a model's tokenizer treats as one unit. It's usually a whole common word, a word piece, or a bit of punctuation. The word "hello" is typically one token; "tokenization" might split into two or three; a space usually attaches to the word that follows it. Models don't read letters the way we do — they read these numbered chunks, which is why your bill and your context limits are both counted in tokens rather than words.</p>
  <p>For rough, back-of-the-envelope English estimates, these rules of thumb are close enough for budgeting:</p>
  <ul>
    <li>~1 token ≈ <strong>4 characters</strong> of English text</li>
    <li>~1 token ≈ <strong>0.75 words</strong>, so 100 tokens ≈ about 75 words</li>
    <li>1,000 tokens ≈ ~750 words ≈ roughly a page and a half</li>
    <li>A typical chat message is 20–60 tokens; a dense page of documentation is 600–900</li>
  </ul>
  <p>These are estimates, not guarantees. Code, JSON, tables, emoji, and non-English text all tokenize less efficiently — Chinese, Japanese, Korean, and many other scripts frequently use more than one token per character. When precision matters, run your actual text through a real tokenizer rather than trusting the 4-characters rule.</p>

  <h2>Input tokens vs. output tokens</h2>
  <p>Every API call has two token counts that are billed separately, almost always at different rates:</p>
  <ul>
    <li><strong>Input (prompt) tokens</strong> — everything you send: the system prompt, conversation history, retrieved documents, tool definitions, and the user's message.</li>
    <li><strong>Output (completion) tokens</strong> — everything the model generates in its reply.</li>
  </ul>
  <p>Output almost always costs more per token than input — often three to five times more — because generation is the expensive part. That single fact drives most cost-optimization decisions: a chatty assistant that writes long answers can cost far more than a retrieval system that stuffs a big document into the prompt and asks for a two-sentence summary.</p>

  <h2>How to estimate API cost</h2>
  <p>The formula is simple:</p>
  <p><strong>Cost = (input tokens × input price) + (output tokens × output price)</strong></p>
  <p>Prices are quoted per <strong>1 million tokens</strong>. So the workflow is: estimate your input tokens (prompt plus any context you attach), estimate the output tokens you expect the model to generate, multiply each by that model's respective price, and add them together. Do it once for a single call, then multiply by your expected call volume to get a monthly figure.</p>

  <h2>Approximate 2026 pricing by model tier</h2>
  <p>The table below groups the major providers into rough tiers. <strong>These are approximate, illustrative figures for planning only</strong> — vendors change prices frequently, offer discounts for cached input and batch jobs, and price each specific model differently. Always confirm the current number on the provider's own pricing page before committing a budget.</p>
  <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">
    <tr>
      <th style="border:1px solid rgba(255,255,255,.1);padding:9px 11px;text-align:left;background:rgba(99,102,241,.15);color:#c7c7f0">Tier / example</th>
      <th style="border:1px solid rgba(255,255,255,.1);padding:9px 11px;text-align:left;background:rgba(99,102,241,.15);color:#c7c7f0">Input (~$/1M)</th>
      <th style="border:1px solid rgba(255,255,255,.1);padding:9px 11px;text-align:left;background:rgba(99,102,241,.15);color:#c7c7f0">Output (~$/1M)</th>
      <th style="border:1px solid rgba(255,255,255,.1);padding:9px 11px;text-align:left;background:rgba(99,102,241,.15);color:#c7c7f0">Good for</th>
    </tr>
    <tr>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Flagship (GPT-class, Claude Sonnet-class)</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~$2.50–5</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~$10–15</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Hard reasoning, code, nuanced writing</td>
    </tr>
    <tr>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Mid (Gemini Pro-class)</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~$1–2</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~$4–8</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Balanced quality and cost at scale</td>
    </tr>
    <tr>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Small / fast (mini, Haiku, Flash)</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~$0.10–0.80</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">~$0.40–4</td>
      <td style="border:1px solid rgba(255,255,255,.1);padding:9px 11px">Classification, extraction, high volume</td>
    </tr>
  </table>
  <p>The 20–50× spread between the cheapest and most expensive tiers is why model selection is usually your biggest lever. A task that a small model handles well can cost pennies where a flagship would cost dollars for identical volume.</p>

  <h2>A worked example</h2>
  <p>Say you're summarizing a 2,000-word support document into a short paragraph, using a flagship model at roughly $3 / 1M input and $15 / 1M output.</p>
  <ul>
    <li><strong>Input:</strong> 2,000 words ≈ 2,700 tokens, plus a ~300-token system prompt = ~3,000 input tokens.</li>
    <li><strong>Output:</strong> a 120-word summary ≈ ~160 output tokens.</li>
    <li><strong>Cost per call:</strong> (3,000 ÷ 1,000,000 × $3) + (160 ÷ 1,000,000 × $15) = $0.009 + $0.0024 ≈ <strong>$0.011</strong>.</li>
  </ul>
  <p>About one cent per document. Run it across 100,000 documents and you're looking at roughly <strong>$1,100</strong>. Switch to a small model at a tenth of the price and the same batch drops toward $100 — the kind of decision worth making deliberately rather than by accident.</p>

  

  <h2>Seven ways to cut token cost</h2>
  <ul>
    <li><strong>Trim the system prompt.</strong> It's sent on every single call, so every word you remove is multiplied by your total request volume.</li>
    <li><strong>Cap output length</strong> with a max-tokens setting. Since output is the pricey side, this directly limits your worst-case bill per call.</li>
    <li><strong>Right-size the model.</strong> Use a small model for extraction, classification and routing; reserve flagships for tasks that genuinely need them.</li>
    <li><strong>Use prompt caching.</strong> Most providers now let you cache a large static prefix (instructions, a knowledge base) so repeated calls bill it at a steep discount instead of full price each time.</li>
    <li><strong>Batch offline work.</strong> Asynchronous batch endpoints are frequently discounted versus real-time calls for jobs that don't need an instant answer.</li>
    <li><strong>Prune conversation history.</strong> In long chats, summarize or drop old turns instead of resending the entire transcript every message.</li>
    <li><strong>Retrieve, don't dump.</strong> Fetch only the few relevant passages for a RAG query rather than pasting whole documents into context.</li>
  </ul>

  

  <h2>FAQ</h2>
  <p><strong>Is the token count the same across models?</strong> No. Different model families use different tokenizers, so the identical text can come out to slightly different token counts on OpenAI, Anthropic and Google. Budget with each model's own tokenizer.</p>
  <p><strong>Does output really cost more than input?</strong> Almost always, yes — commonly three to five times more per token. That's why capping response length and preferring concise outputs saves the most money.</p>
  <p><strong>Do spaces and punctuation count as tokens?</strong> Yes. Leading spaces usually attach to the following word, and punctuation marks are frequently their own tokens, so formatting-heavy text costs a bit more than plain prose of the same word count.</p>
  <p><strong>Why is my non-English text so much more expensive?</strong> Tokenizers are optimized for English. Many other scripts — Chinese, Japanese, Arabic, Thai and more — use more tokens per character, sometimes several per glyph, which inflates both cost and context usage.</p>
  <p><strong>How do I get an exact count instead of an estimate?</strong> Run your real text through a tokenizer. Our <a href="https://slashmantools.us/token-cost-calculator/">Token Cost Calculator</a> does this in the browser and shows the side-by-side cost across GPT, Claude and Gemini tiers.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
