---
title: "Five Fields Every Agent Task Needs to Be Auditable"
description: "Owner, definition of done, verification, failure path and destination: the five fields that turn agent runs into a record you can actually audit later."
date: "2026-10-24T08:00:00+08:00"
draft: false
slug: "five-fields-agent-task-auditable"
author: "Wayne Chang"
tags: ["ai-agents", "task-design", "automation", "audit", "run-history"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Five Fields Every Agent Task Needs to Be Auditable"
faq:
  - q: "Do all five fields have to be filled in before the first run?"
    a: "Owner, done and destination should be set before the first run; verification and a basic failure path can be added after a run or two once you know how the task usually breaks. Leaving verification out permanently is the failure mode worth avoiding."
  - q: "Can a model check its own output as the verification step?"
    a: "It can, but it should be an advisory second layer behind a deterministic check, and it should return a structured verdict. A model grading its own answer shares the same blind spots as the original attempt."
  - q: "What is the difference between a run log and a run history?"
    a: "A log is a time-ordered stream of lines, while a history has columns you can query by, such as owner, verdict and destination. The five fields are what give it those columns."
---

An agent task fails quietly more often than it fails loudly. The output looks finished, gets pasted somewhere, and two weeks later nobody can say whether it was correct or who was supposed to check. The five fields below are the smallest set that fixes this: owner, definition of done, verification, failure path, destination.

They are not prompt engineering. They are the record around the prompt.

## The five fields and the question each one answers

| Field | Question it answers | What you lose without it |
| --- | --- | --- |
| Owner | Who is accountable when this run is wrong? | Failures get noticed but assigned to nobody |
| Definition of done | What must be true for this task to be finished? | The agent stops when output looks complete, not when it is correct |
| Verification | How do we check the result without trusting the agent? | "Done" becomes the agent's own opinion of itself |
| Failure path | Who or what takes over when verification fails? | Failed runs get quietly posted with a caveat |
| Destination | Where does the verified result land? | Work is redone because the output lives in a chat scroll |

Each field maps to a column in the run record. Miss one and the record still fills up with rows, but the rows answer only "when did something run". If you are still deciding what belongs in your automation stack at all, the [AI automation framework write-up](/blog/ultimate-ai-automation-guide-2026/) covers the layer below this one; this article is about the task level.

## Owner and definition of done

"Who runs it" has two answers and both belong in the task. The first is the accountable human: a named person who gets pinged, not a team name. The second is the machine identity — model, tools enabled, and the config version — because a task that behaved yesterday can behave differently after someone edits a tool description.

Definition of done is where most tasks die. If it contains an adjective, it is not a definition. "A clear summary" cannot be checked by anyone; "one line per changed file, each line ending in the file path" can be checked by a script that has never seen your prompt.

```yaml
task: pr-summary
owner: dana                 # accountable human, receives escalations
agent:
  model: claude-sonnet
  tools: [read_file, grep]
  config_version: 2026-02-11
done_when:
  - every changed file appears exactly once, by path
  - each entry is a single line, no line over 140 characters
  - no entry without a file path reference
```

Those `done_when` lines are prose, but every one of them is testable. That is the bar. A task with six vague criteria is worse than a task with three that a script can evaluate.

## Verification that does not trust the agent

The most common shortcut is asking the model to grade its own output: "review your answer for accuracy." That is a second guess, not a check, and it inherits the same blind spots as the first.

Put deterministic checks first. They are cheap, they are boring, and they fail in ways you can read.

```bash
#!/usr/bin/env bash
set -euo pipefail
out=summary.md

# every changed file appears exactly once
for f in $(git diff --name-only origin/main...HEAD); do
  count=$(grep -c -- "$f" "$out" || true)
  [ "$count" -eq 1 ] || { echo "FAIL missing-or-dup $f"; exit 1; }
  done

# no runaway lines
awk 'length > 140 { print "FAIL long-line " NR; exit 1 }' "$out"

echo "PASS $out"
```

Store the exit code and that last line in the run record. The rule that makes this work: a verification step must emit one machine-readable verdict, so the history can be filtered on it. A check that only prints commentary is decoration.

Model-based checks are allowed as a second layer — a rubric pass over tone, or whether the summary omits an obvious risk. Label them as advisory, require a structured verdict, and never let them be the only gate. This is the same layering argument as [giving each layer of your stack one job](/blog/upgrade-one-layer-ai-stack/), applied inside a single task.

## Failure path and destination

Most task definitions stop at success. Then the first real failure arrives and the decision gets made live, under time pressure, usually as "post it anyway."

| Strategy | Use when | What it costs |
| --- | --- | --- |
| Retry once with the verification output appended | The failure is an omission or formatting slip | Double token cost on that run |
| Retry with a narrower scope | Output is partially valid and the task was too broad | You need a way to split the task |
| Escalate to the owner with prompt, output and failing check | The failure is semantic and a human must judge it | Human time, and it requires a real owner |
| Fall back to a manual step | The task is rare and cheap to do by hand | Nothing, but the record must say "fallback" |

No failure path may end in "publish it with a note." If the fallback is a human doing it manually, write that in the task so the run record shows it.

```yaml
on_fail:
  retries: 1
  retry_with: verification_output
  escalate_to: dana
  escalate_with: [prompt, output, failing_check]
  max_runtime: 8m

destination:
  path: docs/pr-summaries/{{pr_number}}.md
  notify: "#eng-reviews"
```

Destination is a path or a channel, never "the chat". Writing it as a template before the run buys you three things: two runs cannot silently collide, a rerun either overwrites predictably or is refused, and every row in the history links out to the artifact it produced. Deciding the destination after the output looks good is how you end up with three versions of the same document and no idea which one shipped.

## A log becomes a history

A log is a stream of lines in time order. A history is a table you can ask questions of. The five fields are what turn one into the other, because they are the columns.

With all five, you can ask things a log cannot answer: which tasks owned by Dana failed verification twice this week; which destinations on disk were written by a fallback run; which tasks have an empty verify list and are therefore unverified by design. That last query is the useful one — writing `verify: []` explicitly is better than leaving the field out, because the omission shows up in a query instead of hiding in someone's memory.

Omit a field and the task becomes a guess with a prompt attached. Keep all five and a boring log turns into evidence: what ran, who owned it, whether it passed, what happened when it did not, and where the result went.

## What to do next

1. Pull up the three agent tasks you run most often. Write the owner and destination for each. If you cannot name one person for either, that is the finding, not a formatting problem.
2. Rewrite one `done_when` line per task so a script could check it. Delete any criterion that needs the word "good" or "clear" to make sense.
3. Add a single deterministic check to each task and record its exit code alongside the output.
4. Pick one row from the failure table and write it into the task, including a maximum runtime. A task with no timeout is a task that can hang all weekend.
5. Query last week's runs for two lists: tasks with no verification, and tasks whose destination is a chat channel. Fix the second list first.

If you would rather not maintain the schema and the run history by hand, Cowork Pro is a dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history. It is a one-time $59 USD and downloads from https://slashmaster6.gumroad.com/l/xfhfps. The reason it is relevant here is the run history, not the routing: it is the part that makes the five fields pay off.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=five-fields-agent-task-auditable) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
