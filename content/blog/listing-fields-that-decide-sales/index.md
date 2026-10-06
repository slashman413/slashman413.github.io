---
title: "The Listing Fields That Decide Whether a Product Sells"
description: "A field-by-field pass over a product listing: title, first line, preview, screenshots, what's included, FAQ, refunds, delivery, and the mistakes in each."
date: "2026-10-06T08:00:00+08:00"
draft: false
slug: "listing-fields-that-decide-sales"
author: "Wayne Chang"
tags: ["product-listings", "copywriting", "digital-products", "sales-pages", "checkout"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "The Listing Fields That Decide Whether a Product Sells"
faq:
  - q: "Which field should I fix first if I only have an hour?"
    a: "The title. It controls whether anyone reads the rest of the page, and it is the cheapest field to change and re-test. Then rewrite the first description line, since that is the second-most visible text in search results."
  - q: "How many screenshots should a listing have?"
    a: "Three to six, all of the real interface rather than the marketing site or a mockup. Caption each one with what the buyer should notice, because a screenshot without a caption makes the reader guess what they are looking at."
  - q: "Should I offer refunds on a $39 digital product?"
    a: "Yes, and state the window, condition, and contact channel in plain text. On low-price information products a clear refund policy removes more friction than it costs you, and marketplace policies often override stricter terms anyway."
---

Most listings do not fail on price. They fail because one field, usually near the top, is answering a question the buyer never asked. A product page is a sequence of questions in a fixed order, and each field either moves the buyer to the next one or ends the session.

Here is that sequence, ordered by how much leverage each field has, and the mistakes that show up again and again.

## Title: it only has to answer "is this mine?"

The title is not where you sound impressive. It is where a buyer decides, in about two seconds, whether they are in the audience and whether they know what the artifact is.

Weak: *The Automation Blueprint*. There is no audience, no artifact, no outcome.
Better: *n8n Invoice Parser for Solo Consultants*. Artifact (parser), platform (n8n), audience (solo consultants).

Common mistakes:

- **Naming a philosophy instead of a thing.** People cannot install a philosophy. If the deliverable is a workflow, a template pack, or a course, say so in the title.
- **Pushing the artifact into the subtitle.** Many marketplaces truncate card titles somewhere near 60 characters, and cards are what people scroll. Front-load the noun.
- **Keyword stuffing until it reads like a search query.** If your title has three pipe separators and a year, cut two of them.
- **Words that carry no information.** "Ultimate", "Complete", "2026" are not specificity. Nobody searches for ultimate.

## First description line and the preview file

The first line of your description appears in search results. For a lot of buyers it is also the only line they read. It should answer: what do I get, in what format, and how long until it does something for me?

The most common mistake is opening with backstory. "I've been automating workflows for years and finally decided to package everything up..." The buyer has not yet decided they care about you. Earn that later.

A structure that works: deliverable, format or count, time to first result, and who it is for. For example: "An importable n8n workflow, a 20-minute setup video, and a preflight checklist. First invoice parsed in about half an hour, if your mailbox is already connected to something." That is the same discipline a good onboarding flow uses, and it is the reason the [full automation guide](/blog/ultimate-ai-automation-guide-2026/) spends so long on arrival experience rather than features.

The preview file answers a different question: is this real, and is the quality good enough to pay for? Preview formats trade off differently:

| Preview format | What it proves | What it costs you | Where it fails |
| --- | --- | --- | --- |
| PDF excerpt | Writing quality and structure | Low | Static. Cannot show a running system. |
| Short screen recording | The thing actually runs | Medium. You must re-record after updates | Silent footage with no narration explains nothing |
| Live demo or sandbox | It works on a machine that is not yours | High. Hosting, secrets, abuse handling | Silent breakage you never notice |
| Real sample file (workflow JSON, one template) | The actual deliverable | Low | Gives away the whole product when the product is small |

Preview a slice, not a summary. Forty seconds of the workflow failing on a malformed invoice, then handling it, beats a polished overview that shows nothing about the internals.

## Screenshots and the what-is-included block

Screenshots answer: what does it look like when I am inside this? The usual mistakes are screenshots of the marketing site, mockups with invented dashboards, stock photos of people at laptops, and dark gradients that hide the interface. Take pictures of the real thing: the n8n canvas with node names legible, your folder tree, the error message your README tells people to look for. Crop tight, use three to six images, and caption each one with what the reader should notice.

The what-is-included block answers: what lands in my inbox in the next sixty seconds, and in what format? A feature list is not an inventory. "Includes automation templates" tells me nothing. Counts, formats and prerequisites do.

Keep this block generated from a manifest, because the same file should drive your delivery check later:

```json
{
  "title": "n8n Invoice Parser for Solo Consultants",
  "deliverables": [
    { "name": "Workflow, importable JSON", "format": "json", "url": "https://cdn.example.com/wf.json" },
    { "name": "Setup walkthrough", "format": "mp4", "runtime": "20 min", "url": "https://cdn.example.com/setup.mp4" },
    { "name": "Preflight checklist", "format": "pdf", "url": "https://cdn.example.com/checklist.pdf" }
  ],
  "prerequisites": [
    "An n8n instance (cloud or self-hosted)",
    "A mailbox you can create an app password for"
  ],
  "refund": {
    "window_days": 14,
    "conditions": "no questions asked",
    "request_via": "refunds@example.com"
  }
}
```

Prerequisites are honesty, not a disclaimer. A buyer who discovers a hidden requirement after paying refunds and tells other people.

## FAQ, refund terms, and the delivery check

Write the FAQ from your support inbox, not your imagination. Open the last ten emails you answered manually and turn five of them into questions.

Bad: "Is this right for me?" answered with "Yes, if you are ready to take action." That is a non-answer wearing a suit.
Good: "Do I need to know Python?" answered with "No. Everything happens in the n8n interface. You edit JSON only when pasting a credential block." Product comparisons and tool choices are the questions that come up most, which is why the [Zapier vs n8n comparison](/blog/zapier-vs-n8n-vs-ai-workflow-builder/) is one of the most-read pages on this site.

Refund terms answer: what happens if this is not what I expected? The mistakes are burying it below the fold, contradicting the platform's own policy (marketplaces often enforce a window anyway, so a stricter policy is unenforceable and just reads as evasive), and writing "all sales final" on a low-price information product. State three things plainly: the window, the condition, and the channel. "14 days, no questions asked, email refunds@ and I process it manually." Do not require a reason, but do ask for one. That reply is the best product feedback you will get all quarter.

The delivery check is the field almost nobody treats as a field. It answers: did what I paid for actually arrive? This is not a support habit, it is a script that runs before you publish and after every update.

```bash
#!/usr/bin/env bash
set -euo pipefail

# One manifest feeds the listing copy and this check.
mapfile -t urls < <(jq -r '.deliverables[].url' listing.json)
fail=0

for u in "${urls[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 "$u")
  printf '%s  %s\n' "$code" "$u"
  [[ "$code" == "200" ]] || fail=1
done

# Copy that promises something with no file behind it.
if grep -niE 'bonus|lifetime updates|template pack' listing.json; then
  echo 'promise found in copy - confirm a deliverable exists for it'
fi

exit "$fail"
```

Run it against production URLs, not your local folder. Two failures show up constantly: signed download links that expire, because the storefront handed out a time-limited S3 or Drive URL, and copy that promises a bonus file that was never uploaded. Related failure modes are covered in the notes on [automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/). Then buy your own product once, with a real card, on a secondary account. The receipt email is a delivery field too, and it is the one you never see as the seller.

## What to do next

1. **Rewrite the title as artifact, audience, outcome.** Put the noun in the first 40 characters. Delete any word that would not appear in a buyer's search.
2. **Rewrite the first description line** so it states deliverables, format, and time to first result. Delete everything before that sentence and reattach the backstory lower down, if you keep it at all.
3. **Build `listing.json`** as the single source of truth for the what-is-included block, FAQ, and refund terms, then run the curl check before publishing and after every update.
4. **Add one unedited screen recording** of the workflow running, and caption your existing screenshots. If the buyer cannot see the inside of the thing, they assume there is no inside.
5. **Answer the three refund questions in writing,** and route them to a real mailbox you monitor.

If the listing is not the actual problem, and the thing behind it does not exist yet, the gap is usually the automation itself. Ship With AI is a four-hour practical course at $39 USD one-time that takes a non-coder from zero to a first working AI automation project. That is a reasonable place to start if you need a deliverable before you need a page describing it.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=blog&utm_medium=article&utm_campaign=listing-fields-that-decide-sales) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
