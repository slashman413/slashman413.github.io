---
title: "UTM Parameters Explained: How to Track Campaigns the Right Way"
description: "What UTM parameters are, what each one (source, medium, campaign, term, content) does, naming conventions, common mistakes, and how they show up in GA4 — plus a free UTM builder."
date: 2026-07-18
lastmod: 2026-07-18
slug: "utm-builder-guide"
---
<p>You post the same link on Instagram, in a newsletter and in a paid ad. A week later analytics says you got 400 visitors — but where did they actually come from? Without a way to tag each link, you can't tell. That's exactly the problem <strong>UTM parameters</strong> solve. They're small bits of text you bolt onto the end of a URL so your analytics tool can attribute every visit to the specific campaign, channel and creative that produced it.</p>

  <p>This guide walks through what each parameter means, a naming convention that will save you future headaches, the mistakes that quietly ruin your data, and how it all surfaces in GA4. If you'd rather not hand-type query strings, there's a <a href="https://slashmantools.us/utm-builder/">free UTM builder</a> at the end.</p>

  <h2>What is a UTM parameter?</h2>
  <p>UTM stands for <em>Urchin Tracking Module</em> — a leftover name from Urchin, the analytics company Google bought that became Google Analytics. A UTM parameter is just a <code>key=value</code> pair added to a URL after a <code>?</code>. Multiple pairs are joined with <code>&amp;</code>. A fully tagged link looks like this:</p>
  <p><code>https://example.com/pricing?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=summer_sale</code></p>
  <p>The part before the <code>?</code> is your normal page. Everything after it is metadata the browser passes along; your page loads the same, but analytics reads those values and files the visit accordingly. There are five recognized parameters, three of which you'll use almost every time.</p>

  <h2>The five parameters, one at a time</h2>
  <table>
    <tr><th>Parameter</th><th>Answers</th><th>Required?</th><th>Example value</th></tr>
    <tr><td><code>utm_source</code></td><td>Where is the traffic coming from?</td><td>Yes</td><td><code>google</code>, <code>newsletter</code>, <code>linkedin</code></td></tr>
    <tr><td><code>utm_medium</code></td><td>What type of channel is it?</td><td>Yes</td><td><code>cpc</code>, <code>email</code>, <code>social</code>, <code>referral</code></td></tr>
    <tr><td><code>utm_campaign</code></td><td>Which specific campaign or promo?</td><td>Recommended</td><td><code>summer_sale</code>, <code>launch_2026</code></td></tr>
    <tr><td><code>utm_term</code></td><td>Which paid keyword?</td><td>Optional</td><td><code>running+shoes</code></td></tr>
    <tr><td><code>utm_content</code></td><td>Which creative/link variant?</td><td>Optional</td><td><code>hero_button</code>, <code>banner_a</code></td></tr>
  </table>
  <p><strong>Source</strong> is the specific origin — the newsletter name, the ad network, the referring site. <strong>Medium</strong> is the broad category that source belongs to. Together they answer "this visit came from <em>this place</em> via <em>this kind of channel</em>." <strong>Campaign</strong> groups everything under one initiative so you can total up a launch or a seasonal push regardless of channel. <strong>Term</strong> is mostly for paid search keywords, and <strong>content</strong> is your A/B differentiator — use it when the same campaign has two buttons, two images or two placements and you want to know which one won.</p>

  <h2>A naming convention that scales</h2>
  <p>The single biggest source of messy UTM data is inconsistency. Analytics treats <code>Facebook</code>, <code>facebook</code> and <code>FB</code> as three different sources, so your one channel gets split into three rows that never add up. Pick rules and never break them:</p>
  <ul>
    <li><strong>Always lowercase.</strong> UTM values are case-sensitive; lowercase everything so <code>Email</code> and <code>email</code> never diverge.</li>
    <li><strong>No spaces.</strong> Use underscores or hyphens (<code>summer_sale</code>, not <code>summer sale</code>). Spaces get encoded to <code>%20</code> and look ugly.</li>
    <li><strong>Standardize your medium list.</strong> Decide on a small fixed vocabulary — <code>email</code>, <code>social</code>, <code>cpc</code>, <code>referral</code>, <code>affiliate</code> — and reuse it forever.</li>
    <li><strong>Keep a shared spreadsheet.</strong> One tab listing every UTM you've generated stops teammates from inventing <code>newsletter</code> while you use <code>email-list</code>.</li>
  </ul>

  

  <h2>Common mistakes</h2>
  <ul>
    <li><strong>Tagging internal links.</strong> Never put UTMs on links between pages of your own site — it overwrites the original session source and makes your own site look like the traffic origin.</li>
    <li><strong>Using the wrong medium for paid.</strong> Paid clicks should use a paid medium like <code>cpc</code> or <code>paid_social</code>, not <code>social</code>, or you'll lump free and paid together.</li>
    <li><strong>Redundant values.</strong> <code>utm_source=facebook&amp;utm_medium=facebook</code> tells you nothing new; medium should be the category, not a repeat of source.</li>
    <li><strong>Manually typing them.</strong> One typo — a stray capital, a missing ampersand — creates a phantom row. Generate links from a tool or template.</li>
    <li><strong>Forgetting to shorten.</strong> Long tagged URLs look spammy in social posts; run them through a shortener after building.</li>
  </ul>

  

  <h2>How UTMs show up in GA4</h2>
  <p>Google Analytics 4 maps the parameters to dimensions you'll filter and group by in reports:</p>
  <ul>
    <li><code>utm_source</code> → <strong>Session source</strong></li>
    <li><code>utm_medium</code> → <strong>Session medium</strong></li>
    <li><code>utm_campaign</code> → <strong>Session campaign</strong></li>
    <li><code>utm_content</code> → <strong>Manual ad content</strong></li>
    <li><code>utm_term</code> → <strong>Manual term</strong></li>
  </ul>
  <p>You'll find them under <em>Reports → Acquisition → Traffic acquisition</em>, or build a free-form exploration and add "Session source / medium" as the dimension. GA4 attributes on a session basis, so give it a little time — freshly tagged links may take a few hours to appear, and attribution can differ slightly from the raw click counts your ad platform reports because the two count in different ways.</p>

  <h2>FAQ</h2>
  <p><strong>Do UTM parameters slow down or break my page?</strong> No. They're ignored by the page itself; only analytics reads them. The page loads identically with or without them.</p>
  <p><strong>Are UTMs case-sensitive?</strong> Yes — <code>Email</code> and <code>email</code> are counted separately, which is why sticking to lowercase matters.</p>
  <p><strong>Which parameters are actually required?</strong> Source and medium are the practical minimum; campaign is strongly recommended. Term and content are optional extras for paid keywords and A/B variants.</p>
  <p><strong>Can I use UTMs on links I don't own?</strong> Only if the destination is a page whose analytics you control. Tagging a link to someone else's site does nothing for you.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
