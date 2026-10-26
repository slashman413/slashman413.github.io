---
title: "Case Study: Designing the Upgrade from Starter Bundle to Full Course"
description: "How to design an upgrade path from a starter bundle to a full course, using the learner's own project as the trigger instead of a countdown."
date: "2026-10-12T08:00:00+08:00"
draft: false
slug: "designing-course-upgrade-path"
author: "Wayne Chang"
tags: ["course-design", "education", "automation", "product-design"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-AIS"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Case Study: Designing the Upgrade from Starter Bundle to Ful"
faq:
  - q: "How do I know when a learner has outgrown a starter bundle?"
    a: "When their own project shows a seam: a second step that depends on the first, a scheduled run, or a prompt edit they cannot undo. That is a state of their work, not a number of days since purchase."
  - q: "Should the upgrade offer appear inside the starter course?"
    a: "Yes, but only in the lesson that answers the question the learner just asked, and after the fix rather than before it. An offer attached to an error message reads as a toll booth."
  - q: "What if a learner never hits a seam?"
    a: "Then the trigger stays silent and you recommend nothing. Not every learner needs the next product, and a path that fires for everyone is a discount rather than a curriculum."
---

A starter bundle sells a first win: one prompt, one output, one task finished by hand. A full course sells a second win, and the distance between the two is not a curriculum gap. It is a project gap. Learners move when their own work stops fitting the tool they already bought, and an upgrade path that ignores this becomes a marketing sequence instead of a teaching one.

## What the starter bundle teaches, and what it deliberately leaves out

The starter scope is one complete loop: pick a small task, write a prompt, get usable output, put it where it belongs. Every lesson ends with something the learner can look at. That completeness matters more than coverage. A bundle that ends with a half-built workflow teaches the learner that the tool is difficult, which is the opposite of what an entry product is for.

What it leaves out is not advanced material. It is material that stays invisible until a project has more than one step and more than one run:

- state passed between steps, and what shape that state takes
- what happens when step three fails at 02:00 and nobody is watching
- how to tell whether a prompt edit made output better or only different
- what a run costs, and which part of it costs the most
- how to change a prompt without invalidating everything produced before the change

Teaching these inside a beginner bundle is a known failure mode. The learner has no place to put the lesson, so they nod through it and forget it. By the time they need it, they are not looking at the bundle anymore. They are looking at their own broken project. That sentence is the whole design brief.

## Where the gap shows up

The gap never announces itself as "I need to learn about state." It arrives as one specific sentence: *now I also need it to...*

- ...also send the result to a channel instead of printing it.
- ...also run at 07:00 without me opening a terminal.
- ...also handle the second input format, because one client sends PDFs.
- ...also stop re-posting everything when it fails halfway through.

Each of those is a seam. A seam is any point where the starter bundle's core abstraction — prompt in, text out, run by hand — stops holding.

The useful property of a seam is that the learner can point at it. Nobody can point at "architecture." They can point at the line in their script where they need the output of step one. That is why this upgrade path is built on artifacts instead of a syllabus. For a fuller look at where a script stops being the right shape, [Workflow builder vs a plain script](/blog/workflow-builder-vs-plain-script/) covers the tradeoff directly.

## The upgrade path: four seams and the modules behind them

Four seams carried most of the weight. Each has a signal the learner can detect in their own directory, a module that answers it, and an exercise that takes their project as input rather than a toy sample.

| Seam | Signal in the learner's own project | Module | Exercise input |
|---|---|---|---|
| Multi-step | Step two needs step one's output | 03-pipelines-and-state | Their flow, rebuilt as explicit steps |
| Failure | A scheduled run dies overnight | 05-retries-and-idempotency | One step made safe to repeat |
| Evaluation | A prompt edit made output worse | 07-evals-and-regression-sets | Ten saved input/output pairs |
| Versioning | Old outputs no longer match the prompt | 09-versioning-and-cost | One pinned prompt version |

The manifest below is the actual structure. Keeping it as data rather than prose means the probe script and the site can read the same source of truth.

```yaml
# curriculum.yaml — one entry per seam between the bundle and the full course
version: 3

seams:
  - id: multi-step
    taught_in_bundle: "one prompt, one output, run by hand"
    gap_signal: "step two needs the output of step one"
    module: 03-pipelines-and-state
    exercise: "rebuild your own flow as three steps with an explicit, typed handoff"

  - id: failure
    taught_in_bundle: "if it breaks, run it again"
    gap_signal: "a scheduled run fails while nobody is watching"
    module: 05-retries-and-idempotency
    exercise: "make one step safe to run twice, then prove it by running it twice"

  - id: evaluation
    taught_in_bundle: "read the output and judge it"
    gap_signal: "the same input gives a worse answer after a prompt edit"
    module: 07-evals-and-regression-sets
    exercise: "save ten inputs from your project with the output you accept as correct"

  - id: versioning
    taught_in_bundle: "edit the prompt in place"
    gap_signal: "old outputs no longer match the prompt that produced them"
    module: 09-versioning-and-cost
    exercise: "pin one prompt version and record which version produced which output"
```

The learner-facing half is a probe, not a quiz. It runs inside their own repository, prints what it found, and links to exactly one module. A quiz asks the learner to self-assess; a probe reports on the thing they actually built.

```bash
#!/usr/bin/env bash
# gap-probe.sh — run this inside the learner's project, not inside the course repo.
set -euo pipefail

calls=$(grep -rE '\.(chat|messages)\.create' --include='*.py' --include='*.ts' . 2>/dev/null | wc -l | tr -d ' ')
echo "model calls found: $calls"

[ -f .env ] && echo "secrets: .env present" || echo "secrets: none (likely hardcoded)"

[ -d runs/ ] && echo "run log: present" || echo "run log: missing — nothing to replay after a failure"

if [ -f .github/workflows/run.yml ] || crontab -l 2>/dev/null | grep -q .; then
  echo "schedule: present"
else
  echo "schedule: none — everything runs by hand"
fi
```

## The trigger is the learner's own project

A five-day email drip assumes the learner's project advances on the same schedule as the sequence. It will not. If the drip fires before the seam appears, the full course reads as extra content, and extra content gets ignored. If it fires long after, the learner has already solved the problem badly and built habits around the bad solution.

So the trigger is a state of the artifact, not a date. The smallest workable version is a pure function that reads the probe output and returns at most one module.

```python
# trigger.py — maps a detected project state to one module, or to none

def next_module(project: dict) -> str | None:
    if project["model_calls"] > 1 and not project["passes_state"]:
        return "03-pipelines-and-state"
    if project["runs_on_schedule"] and not project["safe_to_replay"]:
        return "05-retries-and-idempotency"
    if project["prompt_edits"] and not project["has_eval_set"]:
        return "07-evals-and-regression-sets"
    if project["has_production_users"] and not project["prompt_pinned"]:
        return "09-versioning-and-cost"
    return None  # no seam detected: recommend nothing
```

The `return None` line is the most important one in the file. An upgrade path that fires for everyone is a discount, not a path. Two other constraints matter. Queue depth stays at one: recommend a single module, never a bundle of four. And the trigger is refusable — a learner who says "not now" should not be shown the same offer on every subsequent run.

## Failure modes when the path is built for conversion

**Pitching at the moment of confusion.** The seam is not the moment to sell. It is the moment to hand over the fix. Attach the module link to the end of the repair, not to the error message.

**Re-teaching the bundle.** Any full-course module that repeats the bundle's first lesson signals that the first purchase was filler. Modules should start where the bundle stopped.

**Framing the full course as "the real one."** That framing devalues what the learner already paid, and it makes the entry product harder to sell later.

**No exit for learners who never hit a seam.** Some will solve it themselves, some will stay small forever. A curriculum that requires everyone to upgrade is a funnel wearing a course's clothes. When a seam is specifically about pinning prompts and protecting customisations, the mechanics matter as much as the concept — [versioning a template so buyers do not lose their customisations](/blog/versioning-templates-without-losing-customisations/) is the same problem from the product side.

**Ignoring what happens after failure.** A learner whose scheduled run dies at night needs triage language before they need architecture. The habits in [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/) belong in the retry module, not in an appendix.

## What to do next

1. **List your seams.** Write down the four to six sentences your entry product's abstraction cannot answer. If you cannot produce them, you do not know what your entry product actually teaches.
2. **Ship a probe, not a quiz.** Make it runnable inside the learner's own project, have it print what it found, and have it link to one module.
3. **Write the exercise before the module.** Every full-course module should require the learner's own project as input. If the exercise works on a toy dataset, it does not belong in the upgrade path.
4. **Move the offer.** Delete upgrade language from lesson one. Put it in the final lesson of the module that just answered the learner's question.
5. **Audit the sales page for honesty.** If you sell an entry kit like the AI Developer Stack Bundle — $79 USD one-time, the entry-level course plus a prompt library, aimed at people starting from no technical background — say plainly what it does not cover. Naming the boundary is what makes the next step legible instead of pushy.

## Get AI Starter Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=blog&utm_medium=article&utm_campaign=designing-course-upgrade-path) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-starter/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
