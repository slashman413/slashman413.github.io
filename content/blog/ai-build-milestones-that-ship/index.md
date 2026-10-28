---
title: "Break an AI Build Into Milestones That Actually Ship"
description: "A practical method for slicing an AI project into milestones that end in something a human can use and reject, ordered so early slices kill the real risk."
date: "2026-10-28T08:00:00+08:00"
draft: false
slug: "ai-build-milestones-that-ship"
author: "Wayne Chang"
tags: ["milestones", "ai-automation", "project-planning", "shipping"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Break an AI Build Into Milestones That Actually Ship"
faq:
  - q: "How many milestones should a small AI project have?"
    a: "As many as you have real risks, which for a solo build usually means four to six. Each one should be usable and rejectable in a single sitting, so if a slice takes more than a day or two, split it."
  - q: "What if a milestone cannot be tested until another one is finished?"
    a: "Then it is a phase, not a milestone. Keep splitting until each piece can be judged on its own, even if judging means running it by hand on a saved input file."
  - q: "Is it ever fine to build a demo instead of a milestone?"
    a: "Yes, when you need a stakeholder decision rather than a verdict on quality. Just label it: a demo chooses its own inputs, a milestone runs on inputs you saved before the build started."
---

Most AI builds do not fail at the model. They fail in the gap between "the demo worked" and "someone uses this on Tuesday." The fix is not a better prompt or a bigger context window, it is a different unit of progress: a milestone that ends in an artifact one human can operate, judge and reject.

Here is how to define that unit, order the slices so the early ones kill the risk, and diagnose the milestone that keeps coming back almost done.

## What counts as a milestone

A milestone has three parts, and if any is missing you have a demo instead.

1. **A result someone outside the build can operate.** Not "model integrated," but "I paste a support email into a terminal command and get a draft reply." The person operating it should be the person who will judge it.
2. **An acceptance check that fails loudly.** Written before the build starts, over inputs you chose in advance and saved to disk.
3. **A reject action.** What happens when the check fails. Usually: keep the manual workflow, do not add a UI. A milestone you cannot reject is not a milestone, it is a commitment.

The difference shows up in the input set. A demo picks its own inputs, so it always looks good. A milestone runs on the ten real cases you saved, including the ones with a typo, a forwarded chain and a customer who is annoyed. That is the only test that predicts whether the thing survives contact with work.

## Pick the slice order so early milestones kill risk

List every assumption the project rests on, then rank them by what happens to the plan if the assumption is wrong. The ones that force a redesign go first, even when they are the least impressive to build.

For AI work the assumptions are usually these, roughly in order of damage:

- **Taste:** is the output good enough that a human would accept it, not just admire it?
- **Data:** does the input exist, in a usable shape, and are you allowed to use it?
- **Repeatability:** can the same run be reproduced tomorrow without babysitting?
- **Cost per run:** does it fit inside what the task is worth?
- **Adoption:** does the output arrive where the human already works?

A slice order that follows that list looks like this: milestone one is a manual run with a human copying input and pasting output, which tests taste and costs a day. Milestone two puts the same run behind a script with a log file. Milestone three schedules it with a kill switch and an error channel. Milestone four moves the output into the tool the human already opens. Note that milestone one contains no automation at all, and that is the point.

| Slice order | First milestone proves | Hides | Pick it when |
|---|---|---|---|
| Risk-first (taste, then plumbing) | Whether a human accepts the output | Nothing important; looks unimpressive longest | Output quality is the open question |
| Plumbing-first (queue, retries, logging) | That the system runs unattended | Whether anyone wants the output | You have already done this task by hand many times |
| Feature-first (whole flow for one user) | One user's complete path | Cost per run at volume, and edge cases | You have one design partner and a hard date |

The common failure is plumbing-first on a task nobody has done by hand. You end up with retry logic for a problem you have not confirmed is worth solving. If you are choosing between a script and a visual workflow builder for a given slice, that decision belongs to the slice that touches scheduling, not to milestone one — [the comparison here](/blog/workflow-builder-vs-plain-script/) is worth reading before you commit, because migrating mid-build is expensive.

## Write the acceptance check before the build

Keep the milestone spec in the repository next to the code. It is short enough that you will actually maintain it.

```yaml
# milestones/02-draft-reply-script.yaml
id: 02-draft-reply-script
goal: One pasted support email in, one draft reply out, from the terminal.
user: me, on my own inbox, not the team
input: 10 real emails answered last month, saved as inbox/*.txt
output: draft.txt beside the input, plus model name and token count on stderr
acceptance:
  - I would send at least 6 of the 10 drafts with a one-line edit at most
  - Script exits non-zero when the model returns empty text
  - One email finishes while I wait, no background process
reject_action: keep the manual paste flow, do not add a UI
out_of_scope: scheduling, Slack delivery, multi-user, retries
timebox: one working day
```

The `out_of_scope` line does more work than the rest of the file. Most scope creep in AI builds is not someone adding features on purpose, it is the builder solving the interesting adjacent problem at 11pm.

Then keep a checker that a human runs, not a CI job that a human ignores:

```python
# check_milestone.py - exit 0 means "ready for a human verdict", not "shipped"
import pathlib, subprocess, sys

for src in sorted(pathlib.Path("inbox").glob("*.txt")):
    r = subprocess.run(["python", "draft.py", str(src)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"fail: {src.name} exited {r.returncode}")
    draft = pathlib.Path("draft.txt").read_text().strip()
    if not draft:
        sys.exit(f"fail: empty draft for {src.name}")
    if "model=" not in r.stderr:
        sys.exit(f"fail: no model/token log for {src.name}")

print("pass: open draft.txt and judge the 10 cases yourself")
```

Passing the checker only removes the boring reasons to reject. The verdict on taste is still yours, and that is correct.

## When a milestone keeps coming back almost done

Three or more "almost there" rounds is a signal about the milestone, not about the model. In practice it is one of four things.

**The acceptance check was never written down.** "Feels good enough" cannot fail, so it never passes either. Rewrite the check as a yes/no over fixed files. If you cannot phrase it that way, the milestone is not defined yet.

**Two milestones got fused.** If the reviewer cannot accept half the result, the slice is too big. Keep what passes, move the failing part into a new milestone with its own reject action.

**The risk is not technical.** Taste, rights to the data, or an unmotivated user cannot be closed by more code. Doing the task by hand once is the cheapest test: if the manual version is tedious in a way the automated version would not fix, the target is wrong, not the implementation.

**The builder is also the reviewer, and the builder is tired.** Change the vocabulary. Three verdicts only: accept, reject, reject-and-narrow. "Almost done" is not a verdict. Before you touch the milestone again, tag the last state that a human accepted, so the reject action is one command:

```bash
git tag -a m02-baseline -m "last state a human accepted"
git switch -c m02-retry
# if the timebox expires: git switch main, keep the tag, write down what you learned
```

Rejecting a milestone on schedule is progress. Silently extending it for a week is the thing that ends projects. If you want a wider frame for how the pieces of an AI build fit together before you start slicing, the [2026 framework guide](/blog/ultimate-ai-automation-guide-2026/) covers the layers, and [context engineering](/blog/what-is-context-engineering/) explains why the input set matters more than the prompt text.

## What to do next

1. Write down the five assumptions your current build rests on. Mark the one that would hurt most if it were wrong. That is milestone one, even if it is a script you run by hand.
2. Rewrite your current milestone into the YAML shape above: goal, user, input, output, acceptance, reject_action, out_of_scope, timebox. If `reject_action` is blank, what you have is a demo.
3. Save ten real inputs as files and commit them. Every acceptance check from now on runs against that folder, not against an example you typed into a chat window.
4. Set the timebox today and pre-commit to the reject action. When it expires, run the reject action and record what you learned in the milestone file.
5. If you are not a coder and the blocker is the first milestone, Ship With AI is a four-hour practical course that takes a non-coder from zero to a first working AI automation project, priced at $39 one-time, available at https://slashmaster6.gumroad.com/l/mgtpcn. Start it with your assumption list in hand, not before.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=ai-build-milestones-that-ship) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
