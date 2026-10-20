---
title: "How to Design a Course Assignment You Can Actually Grade"
description: "Turn 'build something' into requirements with named checks, and write rubrics that grade cited evidence instead of vibes."
date: "2026-10-20T08:00:00+08:00"
draft: false
slug: "design-gradeable-course-assignment"
author: "Wayne Chang"
tags: ["grading", "rubrics", "course-design", "assignments", "teaching"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/vzalgb"
product_price: "69"
product_brand: "Slashman Tools"
product_sku: "SMT-AIC"
product_category: "Online Course"
product_currency: "USD"
seo_title: "How to Design a Course Assignment You Can Actually Grade"
faq:
  - q: "How many requirements should a graded build assignment have?"
    a: "Six to nine is a practical range for a build task. Past that, students optimise for the requirements they can see and you end up grading the rest by impression."
  - q: "Do I need to automate the checks?"
    a: "Only the scriptable ones. A short shell script that prints PASS or FAIL per requirement id covers configuration and file shape; judgement-based rows should stay manual with a cited file path."
  - q: "What if a criterion is genuinely subjective, like code quality?"
    a: "Either drop it or replace it with something observable: a named lint rule, a stated length limit, a required diff size. If you cannot name the artifact that shows it, it does not belong in the grade."
---

An assignment that costs an hour per submission to grade was usually under-specified on page one. When the task says “build something useful” and the rubric says “demonstrates understanding”, every real decision has been pushed onto the person holding the red pen. The fix is not a longer rubric; it is rewriting the task until each requirement points at a named check.

## “Build something” is not a requirement

“Build something useful” fails as a requirement because it names neither an artifact nor a pass condition. A grader can only respond by forming an opinion about effort, taste or confidence — which is the thing you are trying to remove from the process.

A requirement is a claim about a file you can open, and it needs two things named: where the evidence lives and what counts as pass.

| Task phrasing | Where the grader looks | Pass condition | Checkable in one reading? |
|---|---|---|---|
| “Add error handling” | `logs/errors.jsonl` | at least one line with `ts` and a non-null `error`, produced by the forced-failure fixture | yes |
| “Make the prompt robust” | `prompts/extract.md` + `tests/cases.jsonl` | all five fixture cases return parseable JSON with the required keys | yes |
| “Pick an appropriate model” | `config.yaml` | `model` names a specific model id, not `default` or `auto` | yes |
| “Build something useful for your team” | — | — | no |

The last row is the one to watch. If you cannot fill in the middle two columns, you do not have a requirement yet; you have a wish, and wishes get graded by feel. A second test: a requirement that every submission passes is decoration, so write the failure case down next to the pass case.

If the point of the exercise is that a plain script beats a visual builder for a three-node task, say that in the requirement and let students defend or reject it — /blog/workflow-builder-vs-plain-script/ gives you the tradeoff framing to hand out with the brief.

## Anatomy of a named check

Every requirement gets four fields: an id, a one-sentence claim written for the student, the evidence (path, field, expected value), and the check (script or manual step). The assignment ships as a spec file, not a paragraph of prose.

```yaml
# assignment.yaml — shipped with the brief
id: wf-101
title: Scheduled digest with retry and failure logging
artifact_layout:
  - workflow.json      # exported workflow definition
  - config.yaml        # model and endpoint settings
  - logs/errors.jsonl  # runtime failure log
  - fixtures/          # sample feeds and one forced-failure run

requirements:
  - id: R1
    claim: A schedule trigger fires daily at 07:00 UTC.
    evidence: 'workflow.json: trigger node cron == 0 7 * * *'
    check: manual
  - id: R2
    claim: A failed HTTP call retries once, then stops.
    evidence: 'workflow.json: retry.maxAttempts == 2'
    check: manual
  - id: R3
    claim: Failures are appended to logs/errors.jsonl with a timestamp.
    evidence: 'logs/errors.jsonl: one or more lines with ts and error keys'
    check: script
  - id: R4
    claim: The digest body has one section per source feed.
    evidence: 'fixtures/sample_run.md: heading count equals count of fixtures/sources/*.md'
    check: script
```

Two rules keep this honest. State the layout in the brief, because evidence you can only find if you wrote the assignment is not evidence. And keep every check under a minute for another instructor to run; anything slower gets skipped near a deadline, and skipped checks turn back into vibes.

Six to nine requirements is usually right for a build task. The level of detail in /blog/ultimate-ai-automation-guide-2026/ is a reasonable ceiling for what to require — do not require more than you will actually verify.

## Rubrics that grade evidence, not vibes

A rubric row should be answerable by pointing at a file and a line. Descriptors such as “excellent”, “solid understanding” or “shows effort” ask the grader to build a theory of the student's mind, and two graders will build different theories.

Add an evidence column and fix the scale: binary for scriptable checks, three levels for manual ones.

| Criterion | Evidence to cite | 2 — meets | 1 — partial | 0 — absent |
|---|---|---|---|---|
| R1 schedule | `workflow.json`, trigger node | cron present and equals `0 7 * * *` | trigger present, wrong cron | no schedule trigger |
| R2 retry | `workflow.json`, HTTP node | `maxAttempts` is 2 | retry set but unbounded | no retry field |
| R3 failure log | `logs/errors.jsonl` | one or more timestamped error lines | file exists, entries lack `ts` | file missing or empty |
| R4 digest shape | `fixtures/sample_run.md` | one heading per feed | headings present, count mismatched | no sectioning |

The marker writes the citation next to the score — `R3: logs/errors.jsonl line 4` — and the grade falls out of the table. If two markers cite different files for the same criterion, the brief is missing a canonical artifact path. Fix the brief, not the markers.

Run the scriptable checks before reading anything:

```bash
#!/usr/bin/env bash
# check.sh <submission-dir> — prints PASS/FAIL per requirement id
set -u
sub="$1"; fails=0

check() { local id="$1" desc="$2"; shift 2
  if "$@" >/dev/null 2>&1; then printf 'PASS  %-3s %s\n' "$id" "$desc"
  else printf 'FAIL  %-3s %s\n' "$id" "$desc"; fails=$((fails+1)); fi
}

check R3 "timestamped error line in logs/errors.jsonl" \
  grep -qF '"ts"' "$sub/logs/errors.jsonl"

feeds=$(find "$sub/fixtures/sources" -name '*.md' | wc -l)
heads=$(grep -c '^## ' "$sub/fixtures/sample_run.md")
check R4 "one digest section per feed" test "$heads" -eq "$feeds"

echo "--- $fails scriptable check(s) failed; grade R1 and R2 by hand"
```

Then read the submission once, with that output beside you, filling in the manual rows. Prompt-based tasks use the same shape: check the output against fixed cases instead of judging how the prompt file reads. /blog/what-is-context-engineering/ is useful here, because most “make the prompt better” requirements are really requirements about which context is supplied and in what order.

## Test the assignment before students see it

Write two submissions yourself: one that should pass every row, and a borderline one — seven of nine requirements met, one partial, one piece of evidence missing. Grade both against the rubric before you publish.

If you cannot write the borderline submission, that is the signal. It means at least one requirement has no clear failure mode and students will guess at it. If both submissions grade identically, the rubric is not discriminating and the evidence fields need sharpening.

Publish the rubric with the brief. Students who self-check against named evidence submit artifacts you can grade faster, and disputes collapse to “open the file” instead of “I felt it was solid”. Then time-box the marker: one run of `check.sh`, one reading of the submission, one pass over the manual rows. Anything that forces a second reading is a defect in the brief — log it and rewrite that requirement for the next run.

## What to do next

- List every requirement in your current assignment as a row and fill in evidence path and pass condition. Anything you cannot fill gets rewritten or cut this week.
- Ship the spec as `assignment.yaml` with ids, claims, evidence and check type, and put the artifact layout in the brief.
- Write `check.sh` for the scriptable requirements only. Keep judgement-based rows manual.
- Draft the passing submission and the borderline submission, grade both, and fix any row where the citation was ambiguous.
- Give students the rubric up front and ask for self-scored submissions with cited file paths.

If you are designing assignments inside a course rather than for your own cohort, the Traditional-Chinese AI Course is a four-unit, seventeen-lesson course that takes a beginner from zero to applied AI workflows; it is $69 USD one-time and downloads from https://slashmaster6.gumroad.com/l/vzalgb.

## Get Traditional-Chinese AI Course

[**Traditional-Chinese AI Course**](https://slashmaster6.gumroad.com/l/vzalgb?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=design-gradeable-course-assignment) — **$69**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-course/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
