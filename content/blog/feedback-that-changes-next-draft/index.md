---
title: "Give Learners Feedback That Actually Changes Their Next Draft"
description: "A three-part feedback note: name the failing move, show the smallest fix, assign one next action, plus a two-minute review routine you can keep."
date: "2026-10-20T08:00:00+08:00"
draft: false
slug: "feedback-that-changes-next-draft"
author: "Wayne Chang"
tags: ["feedback", "teaching", "review-routine", "course-design", "prompting"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/vzalgb"
product_price: "69"
product_brand: "Slashman Tools"
product_sku: "SMT-AIC"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Give Learners Feedback That Actually Changes Their Next Draf"
faq:
  - q: "How long should written feedback on a learner's draft be?"
    a: "Three lines: the specific move that failed, the smallest fixed version, and one next action. If you need more, the assignment is usually the problem, not the note."
  - q: "What do I write when the work is genuinely good and nothing failed?"
    a: "Still name a move and still give one action. Say which move worked and hand back a harder version of the same test, such as running the prompt on a messier input, so the learner keeps checking rather than stopping."
  - q: "Should I send the same feedback to a whole cohort?"
    a: "Only when the identical move fails across most submissions. Put that in one shared note and keep individual three-line notes for everyone else, otherwise you are back to writing verdicts at scale."
---

Most feedback a learner gets is a verdict, not an instruction. 'Nice work' and 'not there yet' feel like opposites, but they push the next draft in the same direction: toward whatever the learner already knows how to write. Feedback changes a draft when it names one specific move, shows the smallest version of the fix, and ends with a single action.

## Why blanket praise and blanket criticism both freeze improvement

Both are unanchored. They record your reaction to the artifact instead of locating a mechanism inside it, so the learner has nothing to edit and nothing to test.

Blanket praise does specific damage in a course. It tells the learner the current shape is acceptable, so they stop looking for the failing move. If a prompt says 'translate this email' and returns plausible text, 'this looks great' confirms a habit that breaks on the first email containing a term the model does not know. The learner repeats the same prompt five more times and then finds lesson nine hard for reasons that feel mysterious.

Blanket criticism fails differently. 'This isn't at the level we need' tells the learner something is wrong without telling them where, so they rewrite everything, including the parts that worked, and reintroduce the same flaw in new words. It also trains the wrong reflex: optimise for the reviewer's mood rather than the output. Learners who receive verdicts start producing shorter, safer drafts that are easier to defend and less useful to test.

The end-of-course writeup has the same defect plus a timing problem. By the time a learner reads three paragraphs about their patterns across seventeen lessons, the draft that would have taught them something is cold and the course is over. Feedback is a tool for the next attempt, not a summary of the last one.

## The three-part note

Every note has exactly three fields: the move, the fix, the action. Three lines is a working limit, not a stylistic preference. The limit is what forces you to choose the one move that matters.

**Name the specific move that failed.** Quote the line and describe what it does, not how it feels. 'The prompt names a task but no output shape, so the model picks a format' is a move. 'The prompt is weak' is a verdict. Avoid adjectives; if your sentence needs unclear or thin, you have not found the move yet.

**Show the smallest fixed version.** Not your rewrite. The smallest edit that removes the failure and leaves the rest of the learner's artifact intact:

```diff
- Summarise this meeting transcript.
+ Summarise this meeting transcript for a project manager who missed the call.
+ Return 5 bullet points, each under 20 words, then one line of open questions.
```

If the fix is longer than the original, you are teaching your artifact rather than the move, and the learner cannot reproduce it on the next piece.

**Hand back one concrete next action.** One, and it must be checkable by the learner alone: re-run both versions and paste the outputs side by side; rewrite the second paragraph with the glossary line added; run the workflow once with an empty input and report what the log says. 'Think about your structure' is not an action. Neither is a list of four.

Here is the note as a file, which is how it should exist if you review more than two submissions a week:

```yaml
# feedback-note.yaml -- exactly three fields, one file per submission
submission: submissions/ana/lesson-4-translate-email.md
move: Prompt asks for a translation but names no audience and no glossary.
fix: |
  Add one line before the task:
  Audience: a client. Keep these terms in Traditional Chinese: 合約, 發票.
next_action: Re-run both prompts on the same email, paste both outputs, mark which is usable.
```

| What you write | What the learner does next | Effect on the next draft |
| --- | --- | --- |
| 'Great work, really coming along.' | Nothing specific; repeats the same move. | Freezes: the flawed habit is confirmed. |
| 'This isn't where it needs to be yet.' | Guesses, rewrites everything, keeps the same flaw in new words. | Freezes: effort goes into defence, not diagnosis. |
| 'Prompt names a task but no output shape. Fix: add the shape line. Next: re-run, paste both.' | Makes one edit and one comparison. | Moves: the next draft tests the specific change. |

## A two-minute routine you can hold for a whole course

The review is a fixed sequence with a timer, not an open-ended read. Two minutes per submission, every submission, the day it arrives.

- **0:00-0:20, read once, hands off.** No edits, no notes. You are looking for the single place where the artifact stops doing what the lesson asked.
- **0:20-1:20, write the three fields.** Quote the line, write the smallest fix, name one action. If you cannot fill the fix field, the failure is conceptual and the answer is a pointer, not a rewrite.
- **1:20-1:50, queue the action.** Copy it into one list the learner sees, so nothing depends on them remembering a thread.
- **1:50-2:00, stop.** No line editing, no prose polish, no second pass.

Work the queue oldest-first so nobody waits three days for a note that would have helped on day one. This is the same triage discipline you would apply to [automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/): the item that has been waiting longest is the one costing the most.

```bash
# Oldest unreviewed submission first, one line per learner.
find submissions -name '*.md' -newer .last_review -printf '%T@ %p\n' \
  | sort -n \
  | awk '{print $2}' \
  | while read -r f; do
      printf '%s\t%s\n' "$(basename "$(dirname "$f")")" "$f"
    done \
  | awk -F'\t' '!seen[$1]++'
```

The routine wins on two counts. The note reaches the learner while the draft is still warm, so the edit happens the same week rather than after the certificate. And the time cap does the editorial work for you: two minutes cannot accommodate a survey of everything wrong, so you are forced to pick the move that is blocking progress. That choice is most of the skill, and a long writeup at the end of the course hides it behind volume. If you have run a cohort, you already know the failure mode from [the notes on a first course run](/blog/traditional-chinese-ai-course-cohort/): the learners who improved were not the ones with the longest end-of-course document.

## When the smallest fix is not obvious

- **You want to rewrite the piece.** Stop. A note that says 'adopt my version' teaches your artifact, not the move, and the learner cannot apply it on the next lesson.
- **You have three actions.** Pick the one that blocks everything else. The other two will still be there on the next submission.
- **The failure is conceptual.** A learner who does not know what an output-length limit does cannot write the fix. Point at one section of the material and give one exercise: run the same prompt with and without the limit, compare. Still one action.
- **The learner disagrees.** Do not argue the note. Ask them to run both versions and paste the outputs. The comparison settles it, and they learn to trust evidence over the reviewer's preference.
- **You cannot keep to three lines.** The assignment is probably asking for too much at once, and splitting it is a better fix than longer feedback. The same reasoning applies earlier, when you [design the assignment you can actually grade](/blog/design-gradeable-course-assignment/).

## What to do next

1. Take your last five pieces of feedback and rewrite each as three lines: move, smallest fix, one action. Any note you cannot compress is the one that should have been written.
2. Add a `feedback-note.yaml` per submission to the folder where you already collect work, and stop writing feedback in chat threads where it disappears.
3. Set a two-minute timer for your next review session and cap yourself at three lines per learner. Track how many notes you complete; that number matters more than the polish of any single note.
4. Pick one failing move that repeats across learners, add a 20-second example of the fixed version to the top of the next lesson, and delete the paragraph it replaces.
5. If your learners need the prompting habits this loop depends on, naming an audience, pinning output shape, testing an edge case, the Traditional-Chinese AI Course is a four-unit, seventeen-lesson course that takes a beginner from zero to applied AI workflows, priced at $69 USD one-time and available at https://slashmaster6.gumroad.com/l/vzalgb.

## Get Traditional-Chinese AI Course

[**Traditional-Chinese AI Course**](https://slashmaster6.gumroad.com/l/vzalgb?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=feedback-that-changes-next-draft) — **$69**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-course/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
