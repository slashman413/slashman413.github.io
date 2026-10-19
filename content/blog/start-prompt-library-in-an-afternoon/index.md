---
title: "Start a Prompt Library in One Afternoon: A First-Session Plan"
description: "A one-afternoon plan for keeping prompts: pick one recurring task, adapt three starter templates to your context, and save only the two versions that worked."
date: "2026-10-19T08:00:00+08:00"
draft: false
slug: "start-prompt-library-in-an-afternoon"
author: "Wayne Chang"
tags: ["prompts", "templates", "workflow", "ai-automation", "getting-started"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/diwoc"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-APL"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Start a Prompt Library in One Afternoon: A First-Session Pla"
faq:
  - q: "How many prompts should the first session produce?"
    a: "Two, for one task. A library grows by reuse, not by collection, and a folder you trust is worth more than a folder with more entries in it."
  - q: "Do saved prompts go stale when models change?"
    a: "Sometimes, and usually in the output format rather than the content. When a saved prompt starts drifting, re-read its output contract and tighten it instead of rewriting the whole file."
  - q: "Can I keep prompts in a note app instead of plain files?"
    a: "Yes, if you only ever copy them by hand. Flat Markdown files win as soon as you want to grep for unfilled placeholders or call a prompt from a script."
---

Most developers who say they have never kept a prompt library are still retyping the same paragraph of instructions every week, just in a fresh chat window. The fix does not need a taxonomy, a naming convention, or a new subscription. It needs one afternoon, one task you already repeat, and the willingness to throw away almost everything you write in that afternoon.

## Pick a task you will still be doing next month

The first decision is the only one that matters, and it is easy to get wrong. A good candidate has three properties: the input arrives in roughly the same shape every time (meeting notes, a bug report, a changelog, a support thread), the output has a format you can describe in one sentence, and you can judge the result in under a minute.

Bad candidates: naming a product, writing a pitch to one specific client, anything you do twice a year. These feel like they need AI help, but each run is bespoke, so a saved prompt saves you nothing.

Before you open any library, write four lines in a scratch file:

```text
task:      weekly client status update from meeting notes
input:     raw notes, messy, mixed speakers, 300-800 words
output:    markdown, four fixed sections, under 400 words
correction I always make: it opens with praise and buries the risk
```

That last line is the most valuable thing you will write today. The correction you make every single time is the constraint your prompt is missing.

## Take three starter prompts and read them for structure

You want three templates of different shape, not three that do the same job. From any curated collection, or from a colleague's folder, pull:

- a role-and-constraints prompt (persona, audience, what to avoid)
- a schema prompt that forces a specific output shape (fixed headings or JSON keys)
- a critic prompt that reviews a draft against a checklist

Then read each one twice. The first time, read the words. The second time, cover the prose and look at only three things: the output contract, the constraints (what it forbids), and the placeholders. On most templates the structure is the reusable part and the prose is someone else's context.

Here is a typical generic template, before you touch it:

```markdown
You are an experienced {{role}} writing for {{audience}}.

Context:
- Product: {{product}}
- Goal of this document: {{goal}}

Input:
{{raw_notes}}

Output requirements:
- Format: {{format}}
- Length: {{length}}
- Do not use these words: {{banned}}

Before writing, list any information in the input that is missing or contradictory.
```

Almost every line will be wrong for you, and that is the point. The last line, the instruction to surface gaps before writing, is probably the only part worth keeping on the first pass. That kind of structural move is what you are shopping for when you read a library, not better adjectives. The same reasoning applies at a larger scale when you wire prompts into a pipeline: the [automation framework guide](/blog/ultimate-ai-automation-guide-2026/) covers where a saved prompt sits relative to the rest of the system.

## Fill in what is fixed, leave what changes

There are two kinds of placeholder. Ones that describe you (product, audience, tone, banned phrases) should be filled in permanently and inlined, so you never type them again. Ones that change per run (raw input, a client name, a date range) stay as placeholders you fill at copy time.

That distinction is most of [context engineering](/blog/what-is-context-engineering/) at small scale: a saved prompt is a context bundle with the stable half already written.

Save it as a Markdown file with a short frontmatter block. The metadata is not bureaucracy; it tells you six months later why the file exists and which fields you still have to supply.

```markdown
---
id: client-update
task: weekly-client-update-from-notes
variable_inputs: [client_name, sprint_scope, raw_notes]
format: markdown
---

Write the weekly status update for {{client_name}} covering {{sprint_scope}}.

Audience: the client's engineering manager. Reads on a phone, skims.
Tone: factual. No praise openers, no enthusiasm filler.

Rules:
- Lead with anything that slipped or is at risk. If nothing slipped, say so in one line.
- Group work under: Shipped, In progress, Blocked, Decisions needed.
- One sentence per item. No adjectives about effort.
- Never invent a date, owner, or ticket number. Write MISSING if the notes
  do not contain it.

Input notes:
{{raw_notes}}
```

Add a small shell helper so you open the file instead of retyping from memory:

```bash
# add to ~/.bashrc
pl() {
  f="$HOME/prompts/$1.md"
  [ -f "$f" ] || { echo "no prompt: $1"; return 1; }
  echo "-- unfilled --"
  grep -o '{{[a-z_]*}}' "$f" | sort -u
  echo "-- body --"
  cat "$f"
}
```

`pl client-update` prints the remaining placeholders first. If you see `{{raw_notes}}` and nothing else, you know exactly what to paste.

Where to keep the folder:

| Store | Works well when | Breaks when |
|---|---|---|
| Local folder, synced by git | you want history and diffs of prompt edits | you mostly edit on a phone |
| Note app (Obsidian, Notion) | you want search, backlinks, mobile access | you need to pipe prompts into scripts |
| Shared doc or wiki | two or more people use the same prompts | nobody owns cleanup and it fills with dead entries |

Pick one. Moving between them later is cheap. Not saving anything is expensive.

## Keep two versions and delete the rest

End the session with at most two saved files for that one task: the version that produced your best first draft, and the version that produced usable output with no editing at all. Often they are the same file with one line changed. Keep both, label them, and delete the other drafts, because a folder of nine half-tuned variants is how people stop trusting their own library.

A prompt is ready to save when it passes a boring test: run it on three real inputs you already know the answer to. If you rewrite more than a sentence or two of the output, it is not a library entry yet, it is a draft. Note in frontmatter which model and settings it was tuned against if the prompt is sensitive to either.

Two failure modes are worth naming. First, saving the prompt but not a sample input and output pair, so you cannot tell later whether it ever worked. Second, hand-editing a mediocre output into a good one and remembering the prompt as better than it was. Both are fixed by keeping one real example next to the file.

## What to do next

1. Write the four-line task note, including the correction you make every time. Do this before you look at any template.
2. Pull three prompts of different shape from a collection. If you do not have one, the [AI Prompt Library](https://slashmaster6.gumroad.com/l/diwoc) is a curated library of copy-paste templates organised by job (writing, coding, research, ops) for $39 USD one-time. Take one writing template and one ops template from it and ignore the rest for now.
3. Create `~/prompts/`, add the `pl` helper to your shell profile, and save exactly two files.
4. Run both files against three real inputs this week. Rewrite the ones that fail, and delete the ones you never open.

The rule for adding your own entry instead of reaching for a template: reach for a template when the task is new to you, or when you can describe the output in one sentence. Write your own entry the third time you correct the model the same way, or the first time you notice you are keeping a template only for its structure and rewriting everything else. At that point the template has stopped teaching you, and a ten-line file with your own context will beat anything you download.

## Get AI Prompt Library

[**AI Prompt Library**](https://slashmaster6.gumroad.com/l/diwoc?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=start-prompt-library-in-an-afternoon) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-prompt-library/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
