---
title: "Five Routines That Keep a One-Person Studio From Drowning"
description: "Five cheap routines for a solo AI automation studio: daily queue review, one agent per deliverable, a handoff check, a weekly stack audit, and an edge-case drop rule."
date: "2026-11-14T08:00:00+08:00"
draft: false
slug: "one-person-studio-delivery-routines"
author: "Wayne Chang"
tags: ["solo-studio", "automation", "routines", "delivery", "agents"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/one-person-studio"
product_price: "12"
product_brand: "Slashman Tools"
product_sku: "SMT-OPS"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Five Routines That Keep a One-Person Studio From Drowning"
faq:
  - q: "How long should each of these routines take?"
    a: "The queue review and the verification pass are minutes per day; the stack audit is about twenty minutes a week. Spec files take roughly five minutes each and are written once per deliverable."
  - q: "What if a client insists on an edge case I planned to drop?"
    a: "Quote it as separate scoped work instead of absorbing it into the current delivery. If the fix touches shared code or the shared prompt, the quote has to include retesting every other deliverable that depends on it."
  - q: "Do I need a project management tool to run the queue review?"
    a: "No. A tab-separated text file plus a shell script covers a solo studio fine. Move to a real tool when a second person needs to edit the queue at the same time."
---

It is rarely one dramatic failure that sinks a one-person studio. It is the deliverable that sat unanswered in a thread for nine days, the pipeline nobody can name, and the edge case that ate a Tuesday afternoon. The five routines below are cheap standing habits — minutes a week — aimed squarely at those three failure modes.

## Run a ten-minute queue review before you build anything

Keep one append-only file with one row per deliverable, and open it before you open your editor. Not a project management tool; a tool is where work goes to hide, while a file you read every morning is where work gets seen.

Six columns are enough: id, client, deliverable, state, next action, last touched. Keep the state vocabulary small — `queued`, `building`, `verifying`, `blocked`, `handed_off`, `done` — because a longer one lets you avoid deciding.

```
id	client	deliverable	state	next_action	last_touched
014	acme	monthly-report	verifying	run handoff checklist	2026-03-02
013	northfield	lead-router	blocked	need API key from client	2026-02-24
012	harbor	onboarding-sequence	building	draft step 3 copy	2026-03-01
```

The review answers two questions: what is blocked, and what is stale. Blocked items are today's work, because a block is almost always a decision only you can make. Stale items are the ones that rot quietly. A five-day idle threshold is a reasonable default:

```bash
#!/usr/bin/env bash
set -euo pipefail
Q="$HOME/studio/queue.tsv"
LIMIT=5   # days idle before an open item is printed as STALE

while IFS=$'\t' read -r id client deliverable state next_action last_touched; do
  [ "$id" = "id" ] && continue
  [ "$state" = "done" ] && continue
  idle=$(( ( $(date +%s) - $(date -d "$last_touched" +%s) ) / 86400 ))
  [ "$idle" -ge "$LIMIT" ] && printf 'STALE %sd  %s  %s  %s -> %s\n' \
    "$idle" "$id" "$client" "$state" "$next_action"
done < "$Q"
```

Cheap to keep: one file, one script, ten minutes, no vendor and no sync conflict. Expensive to skip: the failure mode is silence. A client assumes you are working, you assume they are reviewing, and two weeks pass. You also cannot scope or price work you cannot list.

## Give every deliverable exactly one owning agent

Multi-agent setups fail on attribution before they fail on capability. When three pipelines can write into `out/acme/`, the question "which process produced this number" costs an afternoon. The routine: every deliverable has exactly one agent or workflow that writes its final artifact, and a spec file names it. Helper scripts are fine; only one component may write the artifact.

| Shape | Time to first delivery | Debugging a wrong output | Scope creep |
| --- | --- | --- | --- |
| One agent per deliverable | setup per client, then fast | you know which process wrote the file | bounded by the spec file |
| One general agent for everyone | lowest to start | bisect prompts and branches by hand | grows with every new client |
| Manual every time | predictable | trivial | none, but the ceiling is your calendar |

The spec is short and boring on purpose:

```yaml
id: acme-monthly-report
client: acme
owner_agent: acme-report-builder        # the only writer of out/acme/
inputs:
  - gmail:label/acme-export
  - sheet:acme_metrics
outputs:
  - out/acme/monthly-report.md
  - out/acme/monthly-report.pdf
limits:
  max_runtime_min: 20
  max_llm_calls: 40
  external_writes: false
handoff:
  checklist: handoff-v3
```

Cheap to keep: five minutes per deliverable, and the file doubles as the client-facing description of what the agent does. Expensive to skip: you lose fast answers to three questions — who wrote this, what did it read, and what breaks if I disable it. If you want that trail to survive contact with a real client, log input, decision and output per run; see [Add Observability to a Workflow](/blog/workflow-observability-log-input-decision-output/).

## Verify before handoff, with a check that fails loudly

Every handoff gets two passes. The human pass is a short checklist: does the artifact answer the actual brief, is the client name spelled the way they spell it, is the headline number the same one in the source sheet, does the file open on a machine that is not yours. The machine pass is a script that returns non-zero and blocks the send.

Machine checks should be dull and specific: placeholder tokens, truncated outputs, and an artifact older than the data it claims to summarise.

```python
# verify.py — called from handoff.sh; non-zero exit blocks the send
import pathlib, re, sys

PLACEHOLDER = re.compile(r"\{\{|TODO|FIXME|lorem ipsum", re.I)

def problems(artifact: pathlib.Path, source: pathlib.Path) -> list[str]:
    text = artifact.read_text(encoding="utf-8")
    found = [f"placeholder: {hit}" for hit in PLACEHOLDER.findall(text)]
    if len(text.split()) < 150:
        found.append("output looks truncated")
    if artifact.stat().st_mtime < source.stat().st_mtime:
        found.append("artifact older than its source data")
    return found

if __name__ == "__main__":
    artifact, source = map(pathlib.Path, sys.argv[1:3])
    issues = problems(artifact, source)
    print("\n".join(issues) if issues else "ok")
    sys.exit(1 if issues else 0)
```

Cheap: thirty lines you write once. Expensive: rework after the client has already forwarded the file, and the unrecoverable damage of a `{{client_name}}` token in a deliverable. The pass is not about catching everything; it is about making the cheapest class of error impossible to ship.

## Audit the stack on Friday, twenty minutes, no exceptions

Once a week, list every tool you pay for or depend on: name, cost, the one job it does, the date you last used it. Two rules follow. Anything unused for thirty days is cancelled or downgraded to free. Anything doing two jobs gets a decision about which job wins. The same one-job-per-layer thinking appears in [How to Wire an AI Dev Stack So Each Layer Has One Job](/blog/upgrade-one-layer-ai-stack/).

Cheap: a text file and twenty minutes. Expensive: renewal surprises, credential sprawl across ten dashboards, and the panic of a tool changing its pricing or deprecating an endpoint while you cannot remember which client workflows depend on it. When you do replace something, replace one layer rather than the whole stack — [Upgrade One Layer of Your AI Stack Without Breaking the Rest](/blog/upgrade-one-layer-ai-stack/).

## Decide which edge cases you drop, before they arrive

Edge cases do not need to be solved. They need to be dispositioned, quickly, using criteria you set while calm. Write the rule down once: an edge case is dropped and logged unless it hits at least two high signals below.

| Signal | Drop and log | Fix in config | Fix in shared code or prompt |
| --- | --- | --- | --- |
| Frequency | once, one client | twice or more, same client | recurs across clients |
| Blast radius | cosmetic | wrong but caught by verify | wrong and visible to the client |
| Cost to fix | minutes to patch a single run | a parameter change | hours plus retesting other deliverables |

The default that saves the most time: if the fix touches the shared prompt or shared code for one client's one run, it is a no. Log it with a date and a client, tell the client the workaround, and move on. You can always sell it later as scoped work.

Cheap: one table and the discipline to write a two-line log entry. Expensive: the week that disappears into one weird PDF, and the slow decay of an agent whose prompt has become a museum of special cases nobody — including you — can predict.

## What to do next

1. Create `~/studio/queue.tsv` with the six columns and paste in every open deliverable today, including the ones living only in a DM.
2. Add the idle-check script to your morning shell alias or a cron entry, and run the review before opening your editor for one week.
3. Write one spec YAML for your next deliverable that names the single agent allowed to write its artifact.
4. Call `verify.py` from your handoff script and make a non-zero exit stop the send, then test it by planting a `TODO` in a draft.
5. Book twenty minutes on Friday for the stack audit and cancel the first subscription you have not touched in thirty days.

If you want the whole delivery loop in one place rather than assembled from notes, *The One-Person Studio* is a 5-page PDF playbook for running an AI automation studio solo with AI, low-code tools and agents: mindset, core tech stack and when to pick each tool, orchestrator choice, and the solo delivery loop. It is $12 one-time at https://slashmaster6.gumroad.com/l/one-person-studio.

## Get The One-Person Studio

[**The One-Person Studio**](https://slashmaster6.gumroad.com/l/one-person-studio?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=one-person-studio-delivery-routines) — **$12**, one-time payment, instant download. See the full breakdown on the [review page](https://slashmaster6.gumroad.com/l/one-person-studio).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
