---
title: "The Maintenance Rhythm That Keeps a Prompt Library Trustworthy"
description: "A monthly re-test pass, a dated verdict per prompt, and the difference between documenting drift and actually fixing it."
date: "2026-10-18T08:00:00+08:00"
draft: false
slug: "prompt-library-maintenance-rhythm"
author: "Wayne Chang"
tags: ["prompts", "maintenance", "llm", "workflow", "documentation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/diwoc"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-APL"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "The Maintenance Rhythm That Keeps a Prompt Library Trustwort"
faq:
  - q: "How often should I re-test prompts if my model provider ships updates often?"
    a: "Monthly is enough for most working libraries. The exception is any prompt whose failure a customer would see, which should be re-tested whenever the model id it runs against changes, not on a fixed date."
  - q: "What if I cannot find out when a prompt was last tested?"
    a: "Mark it unknown rather than stamping today's date. Unknown entries count as unverified until they come up in a pass, which keeps the date field meaningful for everything else."
  - q: "Does a prompt passing the monthly test mean it is good?"
    a: "No. The pass only confirms the prompt still does what its description claims. Quality is a separate judgment, and a mediocre prompt can pass every month."
---

A prompt library does not fail loudly. The model shifts underneath it, the template still returns text, and the one-line description above it keeps promising behavior the output no longer delivers. Trustworthiness in a collection is not a measure of how clever the prompts are; it is the match between what each entry claims and what it actually does on the model you are calling today. That match decays on its own, which is why it needs a standing appointment rather than a heroic cleanup.

## Trustworthy means the description is not fiction

Every entry makes a claim: `turns a support thread into a 120-word reply that opens with the customer's own words, states the fix in one sentence, offers one next step, and never quotes pricing`. Someone reads that, fills three slots, and gets something back. The library is trustworthy when the something matches the claim, entry by entry, on the model id you are actually sending traffic to.

That breaks in three ways, and they are worth naming separately because each needs a different response:

- **Drift.** Same prompt, same input, new model version, different output. A constraint gets dropped, a tone rule gets softened, a format gets partially obeyed.
- **Overreach.** The prompt gets reused for a job it was not written for, and the description is stretched to cover the new use. The entry now claims more than it was ever tested for.
- **Staleness.** Nothing changed except time. The entry was last checked before two model releases and nobody knows whether it still holds.

The third one is the quiet killer, and it is the one most libraries never fix, because nothing records when a prompt was last verified. A collection with no dates is not untrustworthy in the dramatic sense — it is unverifiable, which for practical purposes is the same problem. Whoever copies a prompt into production needs to know whether the description was checked this month or written from memory in 2023. The discipline of [versioning a template so buyers do not lose their customisations](/blog/selling-a-feishu-template-product/) is the same idea applied to the file rather than to its accuracy.

## A cleanup is a snapshot, and snapshots start decaying immediately

The instinct after one bad output is to spend a Saturday re-testing everything and reorganizing folders. That produces a clean library and a false sense of completion. The reorganisation protects nothing; the model moves again, and the next bad output arrives with no process attached to it.

Two choices separate a cleanup from a rhythm:

**Cadence over intensity.** A 90-minute pass once a month catches drift while it is cheap to fix. A quarterly deep clean lets two model releases land between checks, so you end up debugging several changes at once with no way to tell which one broke which prompt. Weekly is overkill for most libraries, but it is the right call for the few entries whose failure a customer would see.

**Scope by usage, not by count.** You do not need to re-test 200 prompts. You need to re-test the ones carrying the work. Rank by actual calls, or by honest memory if you have no logs, and pass the top 10 to 20. Everything below that line gets tested when it is touched. This is the same argument as [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/): put the attention where the blast radius is.

## The monthly pass, in a fixed order

An agenda-free pass turns into browsing. Write the order down once and repeat it:

1. **Rank.** Pull the top 15 entries by usage. With no usage data, list the 15 you would be annoyed to lose.
2. **Pin the model.** Record the exact model id you test against. `current model` is not a fact anyone can check next month.
3. **Re-run with a saved input.** One stored test case per entry, so the comparison is about the prompt and not about a fresh sample.
4. **Compare against the stated behavior**, not against last month's output. Diffing outputs makes harmless variation look like drift and hides real drift inside rewording.
5. **Assign a verdict.** The pass is not finished until every entry in scope has one.
6. **Stamp the date and commit.** It ends with a git commit, not a mental note.

The verdicts:

| Verdict | What you observed | What you do | Effect on the entry |
|---|---|---|---|
| keep | Output matches the stated behavior | Stamp the new date | None |
| patch | Format, length or tone drifted; substance intact | Edit instructions, re-run the same test case the same day | New version, date stamped |
| quarantine | A hard constraint is ignored, or output makes claims the prompt cannot support | Pull it from the ready-to-use list, keep the file, add a warning flag | Unavailable until fixed |
| retire | The model now does this by default, or the job no longer exists | Move to an archive folder, remove from the index | History kept, no longer offered |

A runner that keeps the pass to one command:

```bash
#!/usr/bin/env bash
# monthly-pass.sh - re-test only the top-used prompts, against a pinned model
set -euo pipefail

MODEL="$(cat .model-current)"          # exact model id, committed to the repo
RUNNER="${RUNNER:?set RUNNER to your own eval command}"
TODAY="$(date -u +%Y-%m-%d)"
OUT="passes/${TODAY}"
mkdir -p "$OUT"

# manifest: slug <TAB> usage_rank <TAB> test_case_file
while IFS=$'\t' read -r slug rank case_file; do
  [ "$rank" -gt 15 ] && continue
  echo "== ${slug} (rank ${rank})"
  $RUNNER --prompt "prompts/${slug}.md" \
           --input "cases/${case_file}" \
           --model "${MODEL}" \
           > "${OUT}/${slug}.txt"
done < prompts/_manifest.tsv

echo "Outputs in ${OUT}. Fill in verdicts, then commit."
```

## Recording the pass so it outlives your memory

The date is the point. Put it where someone copying the prompt will see it, not only in the git log.

```yaml
# prompts/support-reply-tone.md (frontmatter)
slug: support-reply-tone
job: writing
expected_behavior: >
  A 120-word reply that opens with the customer's own words,
  states the fix in one sentence, offers one next step,
  and never quotes pricing.
test_case: support-thread-01.json
model_tested: your-pinned-model-id
last_pass: 2026-02-04
verdict: keep
notes: ""
```

Three rules keep that field honest:

- **Do not backfill.** Unknown dates stay unknown. Stamping today's date on an untested prompt destroys the only signal the library has.
- **Name the model.** A date without a model id tells you when, not what.
- **Never rewrite the description to match what the prompt now does.** This is the failure mode that makes a library decorative: drift gets documented instead of fixed, and the entry stays green while the behavior it promised is gone. If the output changed and the claim did not, the prompt is broken.

A stale check in CI does the nagging:

```python
from datetime import date, timedelta
import pathlib, sys, yaml

STALE_AFTER = timedelta(days=45)   # one missed monthly pass plus slack
today = date.today()
stale = []

for path in sorted(pathlib.Path("prompts").glob("*.md")):
    front = path.read_text().split("---")[1]
    meta = yaml.safe_load(front)
    last = date.fromisoformat(str(meta.get("last_pass", "1970-01-01")))
    if today - last > STALE_AFTER:
        stale.append(f"{path.name}: last pass {last}")

print("\n".join(stale))
sys.exit(1 if stale else 0)
```

That check will not tell you whether a prompt still works. It tells you which entries nobody has looked at, which is the question a date field exists to answer. For the part of prompt work that concerns what goes inside the template rather than upkeep, see [what is context engineering](/blog/what-is-context-engineering/). The pass itself is deliberately boring: it assumes the prompts are decent and asks only whether they still do what they say.

## What to do next

1. **Add two fields to every entry this week**: `last_pass` and `model_tested`. Leave the date as `unknown` for anything you have not actually re-run. Do not fill the gap with today.
2. **Run the first pass on ten prompts.** Not the whole library. Save one test input per prompt, re-run against the model id you use in production, and write a verdict for each: keep, patch, quarantine, retire.
3. **Put the pass on the calendar as a recurring 90-minute block**, with the agenda from this article pasted into the event description so you do not reinvent it each time. End every pass with a commit.
4. **Add the stale-date check to CI** with a threshold slightly longer than your cadence, so a missed month shows up as a failing job instead of a surprise in production.
5. **Start from prompts you did not have to write, if writing them is the bottleneck.** AI Prompt Library is a curated library of ready-to-use AI prompts organised by job (writing, coding, research, ops), delivered as copy-paste templates, $39 USD one-time, at https://slashmaster6.gumroad.com/l/diwoc. Whichever prompts you start from, the monthly pass is still yours to run — the date field is what makes the collection yours rather than just a download.

## Get AI Prompt Library

[**AI Prompt Library**](https://slashmaster6.gumroad.com/l/diwoc?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=prompt-library-maintenance-rhythm) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-prompt-library/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
