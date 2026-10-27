---
title: "How to Route Multi-Agent Tasks Without a Bottleneck Agent"
description: "How to route tasks between AI agents: the three fields every task needs, readable routing rules, and how to stop one agent absorbing the whole queue."
date: "2026-10-27T08:00:00+08:00"
draft: false
slug: "routing-multi-agent-tasks"
author: "Wayne Chang"
tags: ["ai-agents", "routing", "orchestration", "automation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "How to Route Multi-Agent Tasks Without a Bottleneck Agent"
faq:
  - q: "How many agents can one routing table cover before it gets unreadable?"
    a: "Readability tracks capabilities, not agent count. A handful of glob patterns with two or three agents each stays readable as long as the rules are ordered and first match wins; the table gets unusable when rules overlap and nobody documented the order."
  - q: "Can I just let an LLM decide which agent gets the task?"
    a: "Only for low-volume triage, and only if you log its reasoning. Use the model to propose a rule, then encode that rule in a file so the same task routes the same way twice."
  - q: "What if the agent passes the verify check but the output is still bad?"
    a: "The check is too weak. Tighten `verify` or move the missing requirement into it — do not add retries, which just produce more bad output that already passes."
---

Most multi-agent failures are dispatch failures, not model failures. A task arrives, nobody wrote down which skill it needs, so it goes to the strongest agent available, and that agent becomes a queue. Good routing is mostly paperwork: three fields per task, one rule list you can read out loud, and a check that can fail.

## The three fields every task needs

**Who** is a capability, not an agent name. `copy.edit` survives a model swap; `editor-pro` does not. If tasks name agents, your routing table rots the first time you change a deployment.

**What** is a deliverable with a shape. "Improve the landing page" cannot be routed or verified. "Edited markdown at `drafts/landing.md`, H2 sections only, length within 10% of the input" can be both.

**Verify** is a check that returns pass or fail without a human reading the output: a command with an exit code, a schema validation, a required-keys assertion. If you cannot name the check, the task is not ready to route. It is ready to think about.

```yaml
id: tsk-0417
capability: copy.edit
deliverable: drafts/post-12.md
accept:                       # instructions for the agent
  - "frontmatter keeps title, description, slug"
  - "no new H2 sections"
verify:                       # gate for the router
  run: python tools/check_post.py drafts/post-12.md
  expect_exit: 0
budget:
  max_minutes: 20
  max_attempts: 2
```

Keep `accept` and `verify` separate. The first is a prompt, and prompts can be argued around. The second runs after the agent returns and does not care what the agent believed it did. That separation is what makes routing reversible: a misrouted task costs one failed run, not a corrupted document. The layers around this one — context, storage, review — are covered in the [AI automation guide](/blog/ultimate-ai-automation-guide-2026/).

## Write routing rules you can read back

A rule list is readable when a teammate can predict where a task lands without running it. Three properties buy that: ordered rules, first match wins, and a reason string on every decision. If your router sorts agents by a capability score, you cannot answer "why did task 417 go to editor-pro?" without stepping through the scorer, which means you cannot fix it either.

```yaml
# routing.yaml — top to bottom, first match wins
default: fallback.general
agents:
  editor-pro:
    capabilities: ["copy.edit", "copy.rewrite"]
    max_concurrent: 1
  copy.light:
    capabilities: ["copy.edit"]
    max_concurrent: 3
  indexer:
    capabilities: ["data.*"]
    max_concurrent: 4
  fallback.general:
    capabilities: ["*"]
    max_concurrent: 2
rules:
  - match: {capability: "data.*"}
    route: indexer
    reason: "bulk data work; cheap and parallel"
  - match: {capability: "copy.*", priority: "high"}
    route: editor-pro
    reason: "high-priority copy needs style memory"
  - match: {capability: "copy.*"}
    route: copy.light
    reason: "routine edits pass a linter, not an editor"
```

```python
import fnmatch, yaml

CFG = yaml.safe_load(open("routing.yaml"))

def route(task: dict) -> tuple[str, str]:
    for rule in CFG["rules"]:
        if all(fnmatch.fnmatch(str(task.get(k, "")), v)
               for k, v in rule["match"].items()):
            return rule["route"], rule["reason"]
    return CFG["default"], "no rule matched"
```

Log both return values on every dispatch. "Why did this go to copy.light" then costs one grep instead of an afternoon. If you are still deciding whether this layer should be a workflow builder or a plain script, that tradeoff is covered in [workflow builder vs a plain script](/blog/workflow-builder-vs-plain-script/).

| Router style | Picks by | Breaks when | Use it when |
|---|---|---|---|
| Static map | task type to agent, literal | you add a type and forget the entry | few, stable task types |
| Capability match | first rule whose glob matches | rules overlap and order is undocumented | most multi-agent setups |
| Score or rank | highest capability score | one agent scores high on everything | you have real per-agent cost data |
| LLM judge | a model reads the task | you cannot reproduce the choice | low-volume, one-off triage |

## The over-capable agent bottleneck

The failure looks like this: one agent appears in most of the run history, its queue depth climbs while the others idle, and short-timeout tasks fail only to succeed an hour later. Nothing is broken. The router is doing what "be safe" told it to do.

Causes, roughly in order of frequency:

1. Unmatched tasks fall back to the strongest agent, because it will "probably handle it".
2. The broad `*` capability is claimed by the best model rather than the cheapest adequate one.
3. No per-agent concurrency limit, so the queue grows where nobody is looking.
4. Cheap work never got an explicit rule, so it inherits the default.

The fix is a capability ceiling. Give the strongest agent a deliberately narrow list — the things only it can do — and let a weaker agent claim the broad glob. Fallback should be the cheapest agent that can pass the `verify` check, not the smartest one you have. Then make overflow a written policy instead of an accident:

```yaml
agents:
  editor-pro:
    max_concurrent: 1
    overflow: spill
    spill_target: copy.light
    spill_after: 10m
```

Queue or spill is a judgment call about quality risk, and either is defensible. Silent upgrade is not: it hides a routing bug inside a successful run. A blunt check is to disable the strongest agent in a staging config and see which tasks have no route left. Those are the rules you never wrote. The same discipline applies further out — one job per layer, as argued in [wiring an AI dev stack so each layer has one job](/blog/upgrade-one-layer-ai-stack/).

## Read the history before you add an agent

Before you introduce a fifth agent, read the run history for four things: runs per agent, verify pass rate per route, median queue wait per agent, and how often the default rule fired. Pass rate per route is the one people skip. A route with a poor pass rate is a rule sending work to an agent that cannot do it, and retries do not fix a mismatch — change the rule, or split the capability into two narrower ones.

If one agent holds most of the runs, routing is decoration. If the default fires often, your rule list is missing a case; your agents are fine. Because the envelope carries everything the router reads, you can also dry-run new rules against stored task envelopes before switching them on, which is far cheaper than discovering a bad overlap in production.

## What to do next

1. Add `capability`, `deliverable` and `verify` to your task template, and reject any task missing one of the three.
2. Replace agent names with capabilities in the router, then put every rule in one ordered file where the first match wins and each rule carries a written reason.
3. Give your strongest agent a capability ceiling, an explicit `max_concurrent`, and an overflow policy of either queue or spill.
4. Log route and reason on every dispatch, and read the run history once a week for pass rate per route and how often the default fired.
5. If you would rather keep routing and run history in a dashboard than in a YAML file plus a grep, Cowork Pro is a $59 one-time dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history. It is available at https://slashmaster6.gumroad.com/l/xfhfps.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=routing-multi-agent-tasks) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
