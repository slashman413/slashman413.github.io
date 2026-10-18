---
title: "Grading Evidence, Not Effort: A Standard for Course Assessments"
description: "A house rule for course assessments: every requirement maps to a named artifact the learner produces, and the rubric scores that artifact, not effort."
date: "2026-10-18T08:00:00+08:00"
draft: false
slug: "grading-evidence-not-effort"
author: "Wayne Chang"
tags: ["assessment", "rubrics", "course-design", "evidence"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/vzalgb"
product_price: "69"
product_brand: "Slashman Tools"
product_sku: "SMT-AIC"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Grading Evidence, Not Effort: A Standard for Course Assessme"
faq:
  - q: "Does this standard work for small assignments, or only graded projects?"
    a: "It scales down cleanly. A one-hour exercise gets one requirement and one named artifact; the rule is about naming the file, not about the size of the rubric."
  - q: "What if the evidence is genuinely a live demo or a conversation?"
    a: "Record it into a durable artifact — the transcript, the recorded run, the prompt and raw output text — and grade that. Anything that exists only in the room cannot be reviewed twice."
  - q: "How do I handle requirements that are prerequisites rather than skills?"
    a: "Give them evidence too. A prerequisite whose only proof is attendance is doing no work in the rubric; either name an artifact or move it out of the assessment entirely."
---

Most course assessments fail quietly. The requirement asks for understanding, the rubric rewards presence, and nobody can point to the file that proves anything happened. The fix is a standing rule you apply twice: once before an assignment ships, and once when you review it a year later.

## The rule: one requirement, one named artifact

Every requirement in an assessment must map to a named piece of evidence the learner produces, and the rubric scores that evidence — not the effort, not the enthusiasm, not the hours logged.

"Named" is doing the work here. A name means a path, a field, a commit hash, a file you can open without the learner in the room. If the evidence only makes sense with the learner narrating it, it is a note about the learner, not evidence of the work.

| Requirement | Not evidence | Evidence that counts |
|---|---|---|
| Revise a prompt without losing prior behaviour | "Discussed versioning in the forum" | `prompts/rewrite.v1.md`, `prompts/rewrite.v2.md`, `diff/v1-to-v2.patch` |
| Debug a workflow that fails overnight | "Attended the debugging session" | `run.log` with the failing node id, plus the commit that removed it |
| Choose between a script and a builder | "Chose correctly in class" | `decisions/build-vs-script.md` with the criteria table filled for their own case |
| Handle Chinese-language input | "Said it worked" | `fixtures/input-zh.txt` and `output.json` from the current run |

What the right column shares: durable, produced by the learner, inspectable by a third party. Three properties, no exceptions. A second reviewer should be able to grade the assignment without talking to the first.

## What "evidence" excludes

This list is most of the work, because the things that feel like evidence are usually the things that cannot be checked.

- **Effort proxies.** Hours logged, attempt counts, "actively participated". These describe the learner's calendar, and they reward people with more free time.
- **Self-report.** Reflections that restate the lesson, confidence ratings, "I feel comfortable with X". Useful as feedback, useless as a grade, because they cannot be wrong in a way anyone can inspect.
- **Presence signals.** Forum replies, reactions, meeting attendance. They correlate with engagement and nothing else.
- **Bare screenshots.** A screenshot of a chat window is evidence that a screen once displayed something. The prompt plus the raw output text is evidence of work. Ship the text.
- **Instructor artifacts.** If you wrote the config and the learner approved it, the config is yours.
- **Undifferentiated dumps.** "My whole repo" is not named evidence, it is a haystack. Name the two files.

One exclusion that gets missed: evidence produced under unstated conditions. If the assignment does not say whether AI assistance is allowed and how it must be disclosed, the artifact is uninterpretable and so is the grade. Put that in the assignment, not in a comment thread.

For a related version of this drift, see how prompt libraries rot when nobody names the artifacts: [The Maintenance Rhythm That Keeps a Prompt Library Trustworthy](/blog/prompt-library-maintenance-rhythm/).

## Designing a new assignment: map first, rubric second

Write the evidence map before you write the prompt prose. Prompt first means you end up with a paragraph of verbs — analyse, reflect, demonstrate — and the rubric inherits them.

Order of work:

1. State the requirement as an observable capability ("can revise a prompt without losing prior behaviour", not "understands versioning").
2. Name the artifact that would prove it.
3. Write the decision rule that separates pass from fail.
4. Only now write the learner-facing description, generated from the map.

Keep the map in a file beside the assignment so the two cannot drift:

```yaml
# assignment: prompt-versioning
requirements:
  - id: R1
    claim: "Revises a prompt without losing prior behaviour"
    evidence:
      - path: prompts/rewrite.v1.md
      - path: prompts/rewrite.v2.md
        must_contain: ["## changelog", "model:"]
      - path: diff/v1-to-v2.patch
  - id: R2
    claim: "Identifies which single change shifted behaviour"
    evidence:
      - path: notes/ablation.md
rubric:
  R1:
    pass: "v2 exists, changelog names the model and the change, patch applies cleanly"
    fail: "changelog missing, or patch does not apply"
  R2:
    pass: "ablation.md names one variable and the observed difference"
    fail: "more than one variable changed, or no observed difference recorded"
```

Two or three artifacts per requirement is the practical ceiling. Beyond that the grader starts sampling, and sampling is how a rubric becomes a vibe.

When the requirement is a judgement call — picking a tool for a job — the evidence is the written criteria, not the choice. [Workflow Builder vs a Plain Script](/blog/workflow-builder-vs-plain-script/) is the kind of comparison a learner should be able to reproduce against their own constraints, and `decisions/*.md` is where that shows up.

## Reviewing an old assignment: walk it backwards

Do not start from requirements. Start from rubric rows and ask, for each one, which evidence field it scores. A row with no citation is either an unmeasured requirement or an effort proxy. Both get deleted or repaired.

```python
import pathlib, sys, yaml

spec = yaml.safe_load(pathlib.Path("assignment.yaml").read_text())
declared = {e["path"] for r in spec["requirements"] for e in r["evidence"]}

problems = []
for req_id, bands in spec["rubric"].items():
    for band, row in bands.items():
        src = row.get("evidence")
        if not src:
            problems.append(f"{req_id}/{band}: no evidence cited")
        elif src not in declared:
            problems.append(f"{req_id}/{band}: cites undeclared path {src}")

if problems:
    print("\n".join(problems))
    sys.exit(1)
print("ok")
```

Run it in CI beside the course build. It is boring, it takes a minute, and it catches the failure mode that matters: a rubric that quietly drifted into adjectives while the assignment stayed still.

| Finding | What it usually means | Action |
|---|---|---|
| Rubric row cites no evidence | Forgotten requirement or effort proxy | Add the artifact or delete the row |
| Requirement has evidence but no rubric row | You collect files nobody reads | Add the row or drop the requirement |
| Two requirements share one artifact | Either one capability, or one overloaded file | Merge the requirements or split the artifact |
| Evidence path is a directory | Grading becomes sampling | Name the file |
| Evidence is a screenshot | Unverifiable claim | Require the prompt and raw output text |

Then read the rubric language out loud. Rows that describe the learner ("shows good understanding", "actively iterated") produce two graders who disagree, and both will be right.

| Scores the learner | Scores the artifact |
|---|---|
| "Shows good understanding of context limits" | "`config.yaml` states the context budget in tokens and names the truncation strategy" |
| "Thoughtful reflection" | "`notes/ablation.md` names one variable and the observed output difference" |
| "Actively iterated" | "`diff/v1-to-v2.patch` has one change per hunk, each with a changelog line" |
| "Clean implementation" | "The documented command runs from a clean checkout with no manual edits" |

If you want the background on why a context-budget row is worth grading at all, [What Is Context Engineering?](/blog/what-is-context-engineering/) covers the underlying skill.

## What to do next

- Take one existing assignment and build the requirement-to-evidence table. Any requirement you cannot name an artifact for gets deleted, not rewritten into softer language.
- Save the map as `assignment.yaml` and run the checker above against your current rubric. Expect two or three rows with no citation on the first pass.
- Rewrite five rubric rows that describe the learner so they describe a file instead. If a row survives the rewrite unchanged, it was already fine.
- Add one line to every assignment stating whether AI assistance is allowed and how it must be disclosed.

If you want to see the standard applied to a language course rather than a developer course, the Traditional-Chinese AI Course is $69 USD one-time: a four-unit, seventeen-lesson course that takes a beginner from zero to applied AI workflows. It is a download from https://slashmaster6.gumroad.com/l/vzalgb.

## Get Traditional-Chinese AI Course

[**Traditional-Chinese AI Course**](https://slashmaster6.gumroad.com/l/vzalgb?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=grading-evidence-not-effort) — **$69**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-course/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
