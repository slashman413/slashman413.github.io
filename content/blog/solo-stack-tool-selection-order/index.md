---
title: "How to Pick Tools for Each Layer of a Solo Stack"
description: "A fixed order of decisions for a one-person stack: when an orchestrator beats a script, when low-code wins, and how to document the seam."
date: "2026-11-11T08:00:00+08:00"
draft: false
slug: "solo-stack-tool-selection-order"
author: "Wayne Chang"
tags: ["automation", "orchestration", "low-code", "solo-dev", "architecture"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/one-person-studio"
product_price: "12"
product_brand: "Slashman Tools"
product_sku: "SMT-OPS"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "How to Pick Tools for Each Layer of a Solo Stack"
faq:
  - q: "Do I need an orchestrator if I only have one workflow?"
    a: "Usually not. A single fixed sequence with one input and one output is cheaper to own as a script with a cron entry and a run ID, unless the run must hold state between steps or wait for human approval."
  - q: "What should a seam note contain?"
    a: "The input and output contract, why the logic lives on that side, the condition that would make you move it, and the test command. Those four lines answer the question you will actually ask next year."
  - q: "When should logic move out of a low-code tool?"
    a: "When you want to test it with a fixture, when a change needs code review, or when the code node inside the canvas has grown past a page. Move it into a module and call it over HTTP."
---

A solo stack rarely fails because one tool was bad. It fails because the tools were chosen in the wrong order — an orchestrator picked before anyone knew what had to be sequenced, a database added before there was any state to keep. What follows is the order I use, the single question that settles each layer, and the note I write at every point where two tools touch.

## Decide in dependency order, not by enthusiasm

Most people start with the glue, because the glue is the fun part. Start instead with the thing that leaves the system. Each layer below constrains the one after it, so answering them out of order means paying for the same decision twice.

| Layer | Question that settles it | Default if you cannot answer |
|---|---|---|
| Output contract | What exact file, row, or message leaves this, and can I check it by hand? | One JSON file per run, on disk |
| Trigger | What starts a run, and what stops it starting twice? | Cron plus an idempotency key |
| Judgment | Is the decision rule code I can read, or does it need a model on messy input? | Plain code until it demonstrably fails |
| State | If the process dies halfway, what must I resume from? | Nothing; no database yet |
| Glue | How many outside systems does one run touch, and who changes the step order next? | One Python file |
| Observability | At 2am, which single line tells me which step broke? | Append-only JSONL log, one line per step |

Two details in that order matter. The judgment layer sits above the glue layer: decide whether you need a model before you decide which canvas will call it, because a canvas that is good at connectors is not automatically good at prompt iteration. And observability is a layer, not a cleanup task — you choose its format alongside the output contract, since the log line and the artifact share a shape.

## Orchestrator or hand-wired script

The question is not which is better. It is how many failure points one run touches, and who will edit the order of steps after you. Hand-wiring wins when the run is one process, one input, one output, a fixed sequence, and the job fits in a file you can read in one screen. That covers more of a solo studio than tool marketing implies.

An orchestrator earns its place when any of these holds: the run must hold state for hours or days between steps; a step needs per-step retries and backoff you do not want to write yourself; a human must approve something in the middle; or someone who does not read diffs needs to change the order. That last one is the real test for a one-person shop — if you are the only editor, the canvas buys less than it costs.

Hand-wiring has a bill too: you own the scheduler, secret rotation, retry policy, and the machine that must stay up. Keep the entry point boring so the bill stays visible.

```bash
#!/usr/bin/env bash
set -euo pipefail
RUN_ID="digest-$(date -u +%Y%m%dT%H%M%SZ)"
LOG=/var/log/studio/digest.jsonl
printf '{"run":"%s","step":"start"}\n' "$RUN_ID" >> "$LOG"
python -m jobs.digest --out "out/$RUN_ID.json"
printf '{"run":"%s","step":"done"}\n' "$RUN_ID" >> "$LOG"
```

```bash
# crontab -e
15 6 * * * cd /srv/studio && ./run.sh >> /var/log/studio/cron.log 2>&1
```

The run ID is the whole trick. Without it a rerun and a scheduled run look identical in the log, and the first real debugging session turns into guesswork.

## Low-code or code

The settling question: does the builder's canvas express the whole decision, or does it hide a decision you need to see when it fails? A visual tool is a strong answer for connector work — OAuth refresh, webhook intake, a client intake form — because that work is repetitive, documented, and dull to own. It is a weak answer for logic you would want to unit test, and a bad answer where reviewing the change matters more than the speed of making it.

| Concern | Low-code builder | Hand-written code |
|---|---|---|
| Connector setup | Fast; credentials handled in the UI | You write and rotate the auth |
| Debugging a failure | Node-level logs, limited local repro | Stack trace, breakpoints, fixtures |
| Testing | Manual runs against live data | Fixtures and a test command |
| Reviewing a change | Diff of a JSON export | Ordinary code review |
| Ceiling | Hits a wall at branching or data reshaping | Bounded by your patience |
| Cost at volume | Per-task pricing on hosted plans | Your compute bill |

The failure that costs most is not picking wrong; it is splitting one decision across both sides. A code node that grows into a small application inside a canvas is the most expensive object in a solo stack, because your test command cannot see it and the canvas's own logs barely can.

Keep the seam narrow: the canvas decides when and in what order, the code decides what the content is. One code node, one HTTP call, one job.

```json
{
  "name": "digest",
  "nodes": [
    {"name": "Webhook", "type": "n8n-nodes-base.webhook",
     "parameters": {"path": "digest", "httpMethod": "POST"}},
    {"name": "Shape", "type": "n8n-nodes-base.code",
     "parameters": {"jsCode": "/* SEAM -> summarise service */ return items.map(i => ({json: {body: i.json.body, ids: i.json.ids}}));"}},
    {"name": "Summarise", "type": "n8n-nodes-base.httpRequest",
     "parameters": {"url": "http://localhost:8080/summarise", "method": "POST"}}
  ],
  "connections": {"Webhook": {"main": [[{"node": "Shape", "type": "main", "index": 0}]]}}
}
```

For the wider tradeoff between canvases and scripts, the [onboarding and ceiling comparison](/blog/visual-workflow-builder-vs-scripts/) goes deeper. When you later swap one side, do it as a single-layer change — [upgrading a layer in place](/blog/upgrade-one-layer-ai-stack/) is a much smaller job than a rebuild.

## Document the seam, not the tools

Next year you will not wonder how the webhook node works. You will wonder why the summarise step is a separate service instead of three nodes, and whether it is safe to delete. That is a question about the seam, so write the answer at the seam.

Put a block like this above the code that crosses the boundary, and keep a copy in `stack.md` at the repo root so it is greppable:

```yaml
# seam: webhook -> summarise-service
owner: me
contract_in:  { body: string, ids: string[] }
contract_out: { summary: string, model: string }
lives_here_because: retries and OAuth live in the builder; prompt logic needs fixtures
would_move_if: prompt logic exceeds one file, or per-run token cost needs tracking
fails_loudly: HTTP node retries twice, then the run is marked failed and logged
test: make test-seam   # posts a fixture, asserts the response matches contract_out
reviewed: 2026-01-12
```

Four lines carry the weight. The contract is what actually breaks when either side changes. "Lives here because" records the reason you would otherwise re-argue with yourself later. "Would move if" turns a vague migration itch into a trigger you can check. The test command proves the seam is still a seam and not two copies of the same logic drifting apart.

Write it the day you build the seam. The reason is fresh for about a week.

## What to do next

1. Write the output contract for one workflow — the exact artifact — as three lines in `stack.md`. Every other layer is judged against it.
2. List each outside system a single run touches. If the run holds state between steps or needs an approval in the middle, move it to an orchestrator; otherwise leave it in a script.
3. Move any canvas code node that has grown past a page into a module with a fixture and a test command, and call it from the HTTP node.
4. Paste the seam YAML block above every boundary crossing, and add a `make test-seam` target for it.
5. If you want these layer decisions collected in one place, *The One-Person Studio* is a 5-page PDF playbook for running an AI automation studio solo: mindset, core tech stack and when to pick each tool, orchestrator choice, and the solo delivery loop. It is $12 one-time at https://slashmaster6.gumroad.com/l/one-person-studio.

## Get The One-Person Studio

[**The One-Person Studio**](https://slashmaster6.gumroad.com/l/one-person-studio?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=solo-stack-tool-selection-order) — **$12**, one-time payment, instant download. See the full breakdown on the [review page](https://slashmaster6.gumroad.com/l/one-person-studio).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
