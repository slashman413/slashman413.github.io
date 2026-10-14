---
title: "Designing an Assignment You Can Actually Review"
description: "Write course exercises with checkable deliverables, a three-band rubric, and a review budget that a precheck script enforces before a human ever reads them."
date: "2026-10-14T08:00:00+08:00"
draft: false
slug: "designing-reviewable-course-assignments"
author: "Wayne Chang"
tags: ["course-design", "grading", "rubrics", "automation", "tutorial"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/vzalgb"
product_price: "69"
product_brand: "Slashman Tools"
product_sku: "SMT-AIC"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Designing an Assignment You Can Actually Review"
faq:
  - q: "How many criteria should a grading rubric have?"
    a: "Three or four criteria across three bands is enough for a technical exercise. Beyond that you re-read every submission to stay consistent, which is the review time the rubric was supposed to save."
  - q: "Should students be allowed to pick their own project topic?"
    a: "Only if you still fix the deliverable shape and the input fixture. The artifact contract, not the topic, is what makes a submission checkable."
  - q: "What if students cannot run the exercise environment?"
    a: "Mock the network, pin runtime and dependency versions in the spec, and run the assignment yourself on a clean machine before the cohort starts. A setup failure is an assignment bug, not a student failure."
---

Most course assignments are written from the wrong end. You start with a topic, write a paragraph of instructions, and only then ask how you will grade thirty submissions without giving up a weekend. Flip the order: design the artifact you will inspect, then write the instructions that produce it.

## Put the deliverable before the topic

A checkable deliverable has four properties. It has a fixed name and shape, so you can find it without reading a directory listing. It runs against a fixture you supply, so every submission is measured against the same input. It produces an observable result, so "it worked" is a fact rather than an opinion. And it requires at least one controlled failure, so a student who copied a working example still has to show what happens when the happy path breaks.

That last requirement does more work than any other. An exercise that only asks for a working automation can be satisfied by pasting code from a tutorial. An exercise that says "force a 429 from the API and show your retry logic and the log line it produced" cannot.

Write the assignment as a spec file rather than a paragraph. Students read the same document every cohort, and your autochecks read it too.

```yaml
# assignments/04-retry-wrapper.yaml
id: 04-retry-wrapper
title: Wrap a flaky call with retry and backoff
deliverable:
  workflow: workflow.json       # importable, no credentials inside
  log: run-log.md               # 3 runs: commands, exit codes, timestamps
  notes: notes.md               # <= 200 words: one decision and its tradeoff
fixtures:
  input: fixtures/orders.json
  mock_server: fixtures/flaky_server.py    # fails the first two calls
requirements:
  must_fail_once: true          # show the retry, not just the green path
  no_network: true              # everything runs against the fixture
  pinned: versions.txt          # runtime and dependency versions
budget:
  student_minutes: 45
  reviewer_minutes: 6
autochecks:
  - json_valid:workflow.json
  - secret_scan:all_files
  - run_log_has_nonzero_exit:true
```

Note the `budget` block. Writing your review budget into the assignment is what stops the deliverable from slowly growing into something ungradable. If a submission cannot be reviewed inside the budget, the spec is wrong, not the student.

Screenshots are not deliverables. Neither are videos. They prove effort, not behavior, and you cannot diff them.

## What a usable rubric looks like

A rubric is a set of decisions you can make in a fixed order, not a list of adjectives. Three bands cover most technical exercises: does not run; runs but ignores the required failure; runs and explains the tradeoff it chose. Score the artifact first. Prose only matters if the artifact passes the gate.

Before you write criteria, decide which deliverable shape you are actually asking for. Each one has a different cost structure, and mixing them is how review time escapes — the same tradeoff you weigh when picking between [a workflow builder and a plain script](/blog/workflow-builder-vs-plain-script/).

| Deliverable | What you verify | Review cost | Resists copying | Breaks when |
|---|---|---|---|---|
| Artifact run against your fixture | That it works | Low, once scripted | High | Environment differs between machines |
| Run log with commands and exit codes | That the student ran it and hit the failure | Low | Medium (logs can be typed by hand) | You ship no fixture to re-run |
| Decision memo under 200 words | Reasoning and tradeoffs | Medium | Low | You grade prose quality instead of decisions |
| Screenshot or screen recording | Presence of effort | High | Low | Always |

Keep the criteria count small. Four criteria across three bands is enough for a technical exercise. Twelve criteria means you read every submission twice to stay consistent, which is exactly the review time you were trying to bound. Cap the written component by word count and put that number in the spec.

If your cohort has mixed technical backgrounds, assume setup is the bottleneck rather than the concept. The usual fixes are in [teaching AI to non-technical people](/blog/teaching-ai-to-non-technical-learners/): a mocked network, a pinned runtime, and an assignment you have run on a clean machine.

## The failure shapes you will keep seeing

**The topic-shaped assignment.** "Explore prompt chaining and write about what you learned." There is no artifact, so every submission gets graded on vibes. Fix: name the output file.

**The unbounded artifact.** "Build something useful." You cannot reproduce it, so you cannot check it. Fix: fix the input fixture and the expected output shape.

**The hidden prerequisite.** The exercise needs a paid API tier, a specific OS, or a dependency that broke last month. The exercise stalls before any logic gets written. Fix: mock the network and pin versions.

**The unverifiable claim.** "Explain why your approach is better than the alternative." Better by what measure? Fix: ask for the decision and the constraint that drove it.

**The copy-paste answer.** The reference solution is the first search result. Fix: local fixtures plus a required failure mode.

**Grading creep.** The rubric grows every cohort as you notice new problems. Fix: route new observations into the spec, not the rubric. If it is not in the spec, it is not graded.

Version drift deserves its own line. A fixture that changes silently breaks reproducibility for every past submission, so treat fixtures like any other published asset and version them the way you would [version a customer template](/blog/selling-a-feishu-template-product/).

## Bound the review with a precheck script

The cheapest review is the one a script does. Write an autocheck that gates every submission before a human sees it, and return failures with the exact error line.

```bash
#!/usr/bin/env bash
# usage: review.sh submissions/student-01
set -euo pipefail
d="${1:?usage: review.sh <submission-dir>}"

fail() { echo "FAIL: $1"; exit 1; }

[ -f "$d/workflow.json" ] || fail "missing workflow.json"
python3 -m json.tool "$d/workflow.json" >/dev/null || fail "workflow.json is not valid JSON"
[ -f "$d/run-log.md" ] || fail "missing run-log.md"
[ -f "$d/versions.txt" ] || fail "missing versions.txt"

# a live credential inside a submitted zip is a support problem
if grep -RniE 'sk-[A-Za-z0-9]{16,}|api[_-]?key[[:space:]]*[:=]' "$d"; then
  fail "possible credential in submission"
fi

grep -qE 'exit code: [1-9]' "$d/run-log.md" \
  || fail "no non-zero exit shown; required failure missing"

words=$(wc -w < "$d/notes.md")
[ "$words" -le 250 ] || echo "WARN: notes.md is $words words, budget is 200"

echo "PASS: send to human review"
```

Run it across the batch and sort the output into three buckets: autocheck failed, passed the gate, needs a judgment call. The first bucket gets a template reply quoting the error line. The second gets a short pass note. Only the third costs you reading time.

```bash
for d in submissions/*/; do
  printf '%-28s ' "$d"
  ./review.sh "$d" 2>&1 | head -n1 || true
done | tee triage.txt
```

Two rules keep this honest. Run your own reference solution through the same script; it should pass, and a deliberately broken copy should fail at the line you expect. And when a submission fails the gate, stop reading it. Tightening the gate is faster than grading around it.

## What to do next

1. Take one existing assignment and rewrite it as a spec file: named deliverable files, a fixture, one required failure, and a reviewer time budget.
2. Write the autocheck script and run it against both your reference solution and a copy with one thing deliberately broken. If the broken copy passes, the check is too loose.
3. Cut the rubric to three bands and four criteria, and cap any written component at 200 words inside the spec itself.
4. Replace every screenshot requirement with a run log that shows commands and exit codes.
5. If your cohort works in Traditional Chinese, the Traditional-Chinese AI Course is a four-unit, seventeen-lesson path from zero to applied AI workflows at $69 USD one-time, which is a reasonable reference for how far a beginner track can go before exercises should split into separate paths.

## Get Traditional-Chinese AI Course

[**Traditional-Chinese AI Course**](https://slashmaster6.gumroad.com/l/vzalgb?utm_source=blog&utm_medium=article&utm_campaign=designing-reviewable-course-assignments) — **$69**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-course/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
