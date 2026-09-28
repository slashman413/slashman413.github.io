---
title: "What a Prompt Library Should Actually Contain"
description: "Organise prompt libraries by job to be done, not by model. Here is the structure, metadata and maintenance routine that keeps one usable."
date: "2026-09-28T08:00:00+08:00"
draft: false
slug: "prompt-library-organised-by-job"
author: "Wayne Chang"
tags: ["prompt-engineering", "tooling", "automation", "documentation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/diwoc"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-APL"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "What a Prompt Library Should Actually Contain"
faq:
  - q: "Should prompt entries live in code or in a shared document?"
    a: "Files in a git repository work best for a working developer, because you get diffs, review and a pre-commit checker for free. A shared document is acceptable only if it supports comments and version history you actually read."
  - q: "How often should I re-test a prompt?"
    a: "Re-test when you change the surrounding context, when you swap models, or when the stale-list checker flags the entry. The date matters more than the interval."
  - q: "Do I need a separate entry for each model?"
    a: "Usually not. Keep one entry per job with model-specific quirks in the model_notes field, and only split into separate entries when the prompts genuinely diverge."
---

Most prompt libraries fail at the same point: they are organised around the tool instead of the work. You end up with a folder called `gpt-4-prompts` and another called `claude-prompts`, and when a real task lands you have no idea which one holds what you need. The organising principle should be the job to be done.

## Organise by job, not by model

A prompt is a means to a repeated outcome. "Turn a messy support thread into a changelog entry" is a job you will do again next month. "Best GPT-4 prompts" is a description of a purchase decision you made once.

File by model and you are filing by the most volatile variable in the stack. File by prompt style — chain-of-thought, few-shot, persona — and you are filing by an implementation detail nobody, including you in three weeks, will think to search for.

The test is simple. Hand the library to a colleague who has never seen it, give them only the task description, and see whether they find the right entry in under a minute. If they need to know which model you ran, the taxonomy is wrong.

A tree that survives model swaps looks like this:

```
library/
  writing/
    changelog-from-commits/
    release-notes-from-issues/
  coding/
    review-diff-for-error-handling/
  research/
    summarise-source-with-quotes/
  ops/
    incident-timeline-from-logs/
```

Names are verb-first and specific. "Extract action items from meeting notes" beats "summarisation." Two levels is usually enough; a third level is a sign you are describing rather than filing.

Prompt wording is the smallest part of the result anyway. What surrounds it — retrieved context, examples, output constraints — carries most of the weight, which is why the entry needs to describe the whole setup and not just the sentence you paste. That is the same shift covered in [what is context engineering](/blog/what-is-context-engineering/).

## The categories a working library needs

Four to six top-level categories cover almost everything a solo operator or small team does repeatedly: writing, coding, research, ops, and optionally data or customer support if those are genuinely daily. Categories should map to distinct outputs, not to tools or teams.

Which scheme you pick matters less than applying it consistently. The tradeoff looks like this:

| Scheme | Survives a model swap | Findable from the task description | Maintenance cost |
|---|---|---|---|
| By job to be done | Yes | Yes | Low — entries stay, model notes change |
| By model | No, every entry needs review | Only if you remember the model | High, spikes at each release |
| By prompt style | Yes | No | Medium — duplicate entries for one task |

Inside a category, each entry is one job and one prompt, or a short numbered sequence when the job genuinely needs two calls. If a prompt does three unrelated things, split it. If two entries differ only by a sentence, merge them and note the variation.

Exclude anything you ran once out of curiosity. A library is a set of tools you reach for, not a record of everything you have typed.

## The metadata every entry must carry

A prompt without metadata is a screenshot with extra steps. Each entry is a small spec, and six fields do most of the work.

```yaml
---
job: Extract action items from a meeting transcript
inputs:
  - transcript: plain text, speaker labels optional
  - today: ISO date, used to resolve phrases like "next Friday"
output:
  format: JSON array
  shape: [{ task, owner, due_date|null, source_quote }]
model_notes:
  - claude-sonnet: tolerates missing speaker labels
  - gpt-4o: needs an explicit "return only JSON, no prose" instruction
failure_modes:
  - Invents an owner when the transcript is ambiguous
  - Drops items with no stated deadline
  - Merges two similar tasks into one
last_tested: 2026-01-14
---
```

Why each field earns its place:

- **inputs** stops you pasting the wrong thing. It also tells a future you whether the prompt expects raw logs or cleaned ones.
- **output** shape is what makes a prompt composable. If you know the entry returns JSON with those keys, you can chain it in a script without re-reading the prompt body.
- **model_notes** is where model-specific knowledge lives, so the prompt itself stays portable.
- **failure_modes** saves the most time. Write down what you have actually watched go wrong, not a generic warning. "Invents an owner" tells you to add a rule; "may be inaccurate" tells you nothing.
- **last_tested** is the honesty field. A date set when you first wrote the entry and never touched again is a lie you tell yourself.

A convention nobody enforces decays within weeks, so add a checker:

```python
import datetime, pathlib, sys, yaml

REQUIRED = {"job", "inputs", "output", "model_notes", "failure_modes", "last_tested"}
STALE_DAYS = 90

broken, stale = [], []
for path in pathlib.Path("library").rglob("*.md"):
    text = path.read_text()
    if not text.startswith("---"):
        broken.append((path, "no frontmatter")); continue
    meta = yaml.safe_load(text.split("---")[1])
    missing = REQUIRED - meta.keys()
    if missing:
        broken.append((path, f"missing {sorted(missing)}")); continue
    age = (datetime.date.today() - meta["last_tested"]).days
    if age > STALE_DAYS:
        stale.append((path, age))

for path, why in broken:
    print(f"BROKEN {path}: {why}")
for path, age in stale:
    print(f"STALE  {path}: last tested {age} days ago")
sys.exit(1 if broken else 0)
```

Run it as a pre-commit hook so a malformed entry cannot be committed. Treat the stale list as a work queue, not an error: re-test the prompt or delete it.

## How to tell a maintained library from a pile of screenshots

Screenshots are the default failure mode because they are easy to take and impossible to search. You cannot diff an image, you cannot tell when it was tested, and you cannot tell which part of it was your prompt and which part was the model's output.

A maintained library has a few properties that are hard to fake:

- Entries get deleted. A folder that only grows is a hoard. The signal is a count that goes down as you cut prompts no longer earning their place.
- Failure modes read like observations, not disclaimers.
- Prompts are model-neutral by default, with provider quirks pushed into `model_notes`, so switching models is a metadata edit rather than a rewrite. If you run more than one model, the same discipline behind [triage habits for automations that fail overnight](/blog/triage-automation-failures-while-you-sleep/) applies to prompts.
- There is a checker in the repo, or at minimum a dated review you actually run.
- Git history shows edits after model releases, not a single import commit.

An unmaintained pile looks like: one long document titled "Prompts," sections named after tools, entries with no test date, three near-duplicates of the same prompt, and no record of what input each one expects. Nobody can use it under pressure, which is the only time it matters.

## What to do next

1. List the five tasks you repeat most and create one folder per task in a two-level tree. Delete any existing folder named after a model.
2. Add the six metadata fields to those five entries. If you cannot fill in failure modes, run the prompt on a deliberately hard input until you can.
3. Save the checker as `scripts/check_library.py` and wire it as a pre-commit hook.
4. Delete every screenshot and every entry you have not used in the last quarter. Then tag the release in git so you can see the pruning happened.
5. If an empty tree is what is blocking you, the AI Prompt Library ($29, one-time) is a curated library of ready-to-use AI prompts organised by job — writing, coding, research, ops — delivered as copy-paste templates. Import the entries matching your five tasks, then replace the generic failure modes and last-tested dates with your own, and delete the rest.

## Get AI Prompt Library

[**AI Prompt Library**](https://slashmaster6.gumroad.com/l/diwoc?utm_source=blog&utm_medium=article&utm_campaign=prompt-library-organised-by-job) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-prompt-library/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
