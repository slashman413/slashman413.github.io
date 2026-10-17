---
title: "Four Wording Fixes That Make Assignments Less Ambiguous"
description: "Four concrete wording swaps — checkable verbs, named artifacts, stopping conditions, and one example of good — that remove ambiguity from assignments."
date: "2026-10-17T08:00:00+08:00"
draft: false
slug: "four-wording-fixes-for-assignments"
author: "Wayne Chang"
tags: ["writing", "course-design", "documentation", "feedback", "precision"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/vzalgb"
product_price: "69"
product_brand: "Slashman Tools"
product_sku: "SMT-AIC"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Four Wording Fixes That Make Assignments Less Ambiguous"
faq:
  - q: "Isn't this just a rubric?"
    a: "A rubric grades the work after it is submitted. These four fixes live in the assignment text, so the student can decide what to produce while they are still working. Rubrics and specs solve different halves of the same problem."
  - q: "Does naming the artifact and the stopping condition make students less creative?"
    a: "It constrains the output format, not the thinking. You can leave the method and the choice of source material completely open and still say that the result is one markdown file at a named path."
  - q: "How do I show an example of good work without it being copied back?"
    a: "Keep the shape and change the input. Use a different document, dataset or query from the one you are grading, and label the example as a format reference rather than a model answer."
---

Most "I thought you meant something else" feedback is not a reading problem. It is a writing problem, and it comes from four specific sentences that instructors believe are clear. Fixing them does not require better students or a longer brief — it requires you to decide, before you publish, what counts as done.

## Replace open verbs with checkable ones

An open verb describes a mental state. A checkable verb describes an output.

"Understand how the retry logic works" cannot be verified by you or by the student. There is no artifact, no boundary, no way to fail. Verbs that behave this way: understand, explore, look into, be aware of, get familiar with, think about, improve, consider.

Checkable verbs: list, name, quote, compare, rank, rewrite, delete, run, annotate, reproduce, sketch. Each one implies something a second person could look at and agree or disagree with.

The test is one line long: can you write a check for it? "Rewrite the retry block so it backs off on HTTP 429" produces a diff. "Look into retry handling" produces anything from three sentences to three pages.

Failure mode: when the verb is open, students substitute the cheapest visible action, usually a summary of the reading. That is not laziness. It is the rational response to an unverifiable instruction.

If you cannot write a check for a verb, it is a goal, not an assignment. Goals belong in the syllabus. Assignments belong in the week's brief.

## Name the artifact

Every assignment should answer three questions in the first two lines: what file, at what path, in what format.

"Submit your comparison" is not an artifact. "Add a table to notes/retrieval-comparison.md with columns Strategy, Change, Query where they differ" is. If the answer is a reply in the thread, say so. If it is a screenshot, say what has to be visible in it.

A spec block keeps this honest and reusable:

```yaml
# week-03.yaml
deliverable: notes/retrieval-comparison.md
format: markdown, one H2 per strategy, one table
do:
  - list two retrieval strategies runnable with tools already in the repo
  - for each, quote the config block that would change
  - name one query where the two return different context
stop_when:
  - the table has at least 3 rows
  - a reviewer can reproduce each query from the commands you list
out_of_scope: building anything, cost estimates, benchmark numbers
```

The path matters for a boring reason: it makes the work findable later. [Reusing a template](/blog/workspace-templates-beat-one-off-docs/) for these specs means the format questions get answered once instead of every week.

Note the trap: naming the artifact does not mean naming the answer. You are fixing the container, not the contents.

## State the stopping condition

"Done" has two useful forms.

Countable: the table has three rows, every query in the list reproduces, all four sections are present. Time-boxed: stop after 45 minutes, submit what you have, and write one sentence about what is still open.

Pick one and write it. Both beat the alternative, which is leaving "done" undefined and finding out later that your diligent student spent nine hours and your busy one spent twenty minutes. Neither of them did the assignment you thought you set.

Then write the out-of-scope list. One line — "do not build anything, do not estimate cost" — removes more ambiguity than any amount of encouragement. Most scope creep in course work is not ambition. It is a student guessing at the boundary and guessing wide.

A stopping condition also makes the assignment compatible with automation, which matters if you or your students hand work to a script later. A task that can be handed over cleanly is [a task whose context is written down](/blog/what-is-context-engineering/).

## Say what "good" looks like, with an example

Adjectives do not calibrate. "Clear", "thorough" and "well-reasoned" mean different things to everyone in the room. One short example does more than a paragraph of criteria.

Show the shape, not the solution:

```markdown
# Not this
We compared the two strategies and one seemed better.

# This
A: 3 chunks per query, all from the policy page.
B: 8 chunks per query; for "refund window for EU orders" it also returns
   the shipping FAQ, which is off-topic.
```

That example does not tell anyone which strategy is correct. It tells them the level of detail, the length, and whether numbers or quotes belong in the answer.

Two rules keep this from backfiring. First, do not show a worked example of the exact problem you are grading, or you will get it copied back. Change the input, keep the shape. Second, a labeled weak example with one sentence on why it fails teaches the boundary faster than a strong example alone.

## The four fixes in one place

| Vague wording | Checkable replacement | Artifact | Done when |
|---|---|---|---|
| Explore retry options | List two backoff strategies | notes/retry.md | Two H2 sections, each with a config quote |
| Improve error messages | Rewrite the messages in errors.py | a diff | Each message names the failing field |
| Be aware of rate limits | Annotate the client call with the limit | inline comment | Comment cites the header name |
| Understand chunking | Compare two chunk sizes on one document | table in notes/ | 3 rows, one query per row |

You can then check the submission mechanically, which is the point:

```bash
#!/usr/bin/env bash
set -euo pipefail
f=notes/retrieval-comparison.md
test -s "$f" || { echo "missing or empty: $f"; exit 1; }
grep -q '^## Queries' "$f" || { echo "no Queries section"; exit 1; }
rows=$(grep -c '^| ' "$f" || true)
[ "$rows" -ge 4 ] || { echo "need at least 3 strategy rows"; exit 1; }
echo "ok"
```

A checker like this is not a grading machine. It is a smoke test that tells you the brief and the submission agree on basic shape before you read for quality.

The tradeoff is real: the tighter the spec, the more students optimise for the spec. Keep the do-list short and leave the method open where the method is what you are actually teaching.

## What to do next

1. Pick one assignment you are shipping in the next seven days and rewrite only the verb. If you cannot write a one-line check for it, move that sentence to a learning goal.
2. Add a deliverable block with path, format and the do list — the yaml above is enough, and it takes about four minutes.
3. Add stop_when and out_of_scope. Two lines total.
4. Paste one short example of the shape you want. Use a different input from the one you grade.
5. Save the result as a template so next week starts from the fixed version rather than the vague one. If your prompt and template files have already drifted, [the habits here](/blog/five-prompt-library-maintenance-habits/) apply to assignment specs as well.

One note if your exercises are written for a Chinese-speaking audience: none of this depends on the language. If you are starting from zero and want a worked path into applied AI workflows, the Traditional-Chinese AI Course is a four-unit, seventeen-lesson program, $69 USD one-time, available at https://slashmaster6.gumroad.com/l/vzalgb.

## Get Traditional-Chinese AI Course

[**Traditional-Chinese AI Course**](https://slashmaster6.gumroad.com/l/vzalgb?utm_source=blog&utm_medium=article&utm_campaign=four-wording-fixes-for-assignments) — **$69**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-course/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
