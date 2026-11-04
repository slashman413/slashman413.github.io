---
title: "Specialist Agents vs One General Agent: Who Catches What"
description: "A practical comparison of a scoped agent team and one general agent: what each catches, how failures spread, and when coordination cost is worth paying."
date: "2026-11-04T08:00:00+08:00"
draft: false
slug: "specialist-agents-vs-one-general-agent"
author: "Wayne Chang"
tags: ["ai-agents", "orchestration", "multi-agent", "prompting", "workflow-design"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Specialist Agents vs One General Agent: Who Catches What"
faq:
  - q: "Do specialist agents need a coordinator agent?"
    a: "No. Routing can be a script, a queue or a person. What a scoped team cannot skip is a conflict rule and one place where handoffs are recorded, because otherwise you cannot tell which step corrupted the output."
  - q: "Can one general agent review its own work?"
    a: "Poorly, within the same run — it tends to confirm decisions it already made. Use a separate pass that sees only the artifact plus a written checklist, or a deterministic check that returns an exit code."
  - q: "How many agents before coordination cost dominates?"
    a: "There is no fixed number, because cost scales with boundaries rather than agents. Two roles sharing one handoff and one check behave like a single agent with two phases, and merging them is usually cheaper."
---

The split-or-single question comes up on almost every project that survives its first draft: should this run as a team of scoped agents, or as one strong general agent with a careful task description? Capability is rarely the deciding factor. What decides it is where you want failures to surface, and how much coordination you are willing to pay to get them there.

## What each setup actually catches

A scoped team is a coordinator plus N agents with narrow jobs, explicit handoff artifacts and a conflict rule. A general agent is one context, one task description, one run log. The structural difference is the number of boundaries. Every handoff is a place a fact can be dropped, paraphrased or invented, and also a place where you can put a check — which is the entire argument for splitting.

Specialists catch category errors, because a narrow rubric is easier to follow than a broad one. A reviewer role with six written checks ("every number traces to a source", "every link resolves", "no unhandled error path") catches those six things more consistently than a general agent reviewing its own work against thirty vague criteria. That is the same reasoning behind giving each layer of a stack exactly one job.

A general agent catches cross-cutting inconsistency, because a single context sees both sides of a contradiction. It notices that a helper in one file disagrees with its call site, or that two modules define the same config key, or that the intro promises something the conclusion drops. A writer agent that only received `claims.json` cannot notice that the claims contradict a draft it never saw.

| What you need | One general agent | Scoped team |
|---|---|---|
| Change confined to one file or module | Usually enough | Coordination cost exceeds the work |
| Verification is a command you already have | Enough — run the command afterwards | A reviewer agent adds little over `npx tsc --noEmit` |
| Cross-file consistency, naming, tone | Strong: sees everything at once | Weak: each agent sees a slice |
| Several independent subtrees | Serialises | Strong: real parallelism |
| Different permissions per step | Must self-police | Strong: read-only reviewer, network-only researcher |
| Work longer than one context window | Degrades; state must be re-summarised | Strong if handoff artifacts stay small and validated |
| Debugging a bad result | One run log | You must attribute failure across N logs and a router |

## How failures propagate

With one general agent, failures are correlated but visible. A wrong assumption usually shows up as a wrong plan step, and the transcript records it. The ugly case is drift: after enough steps the agent quietly violates a constraint from the top of the brief, and nothing marks the moment it happened. The fixes are cheap — keep runs short, keep constraints in a file the agent re-reads before editing, and finish with deterministic checks rather than a self-assessment.

With a scoped team, failures get laundered through boundaries. Concretely: the researcher pulls a price from a page last updated a quarter ago, the writer cites it, the reviewer confirms the link resolves. Three green runs, one wrong page. No single log contains the error, because each agent's output is internally consistent. That is the characteristic multi-agent failure, and it is why at least one check at a boundary should hit the outside world — re-fetch, re-run, re-validate — instead of asking a peer agent to agree.

The second pattern is conflict. Two agents edit the same file or assert different facts, and the coordinator must choose. If the coordinator is itself a model with a vague prompt, the choice is arbitrary and will not reproduce on the next run. Decide the rule before the run (last-writer-wins is fine for drafts, never for facts) and cap handoffs so a ping-pong loop fails loudly instead of burning budget.

## The coordination bill you are signing up for

You pay per boundary, not per agent. Each boundary needs a schema for the artifact, an owner, a check, a version and a conflict rule. Two roles that share one boundary and one check are really one agent with two phases, and merging them is usually the cheaper move.

```yaml
# agents/pricing-page.yaml — three roles with their boundaries made explicit
project: pricing-page-rewrite
coordinator:
  max_handoffs: 4              # hard stop; more than this means the split is wrong
  state: state/context.json
  on_conflict: human           # never let the router invent a tie-break
agents:
  - id: researcher
    tools: [fetch_url]
    scope: [competitor-pricing-pages]
    exits: [claims.json]       # schema-checked; nothing else crosses the boundary
  - id: writer
    tools: [read_file, write_file]
    inputs: [claims.json]
    scope: [draft.md]
    exit_check: "every number in draft.md maps to an id in claims.json"
  - id: reviewer
    tools: [read_file]
    inputs: [draft.md]
    rubric: review/rubric.md   # six checks, not thirty
    advisory: true             # model judgement; the exit_check above is the gate
```

The manifest is short. Maintaining it is not. Every field is something you will debug later, and note which ones are trustworthy: the writer's `exit_check` is mechanical, the reviewer's rubric is a model judgement, so only the first is a gate. Run history is the other non-negotiable. If you cannot attribute a bad output to one agent and one handoff, you have made debugging harder than the single-agent version you replaced. The same logging habits described in [adding observability to a workflow](/blog/workflow-observability-log-input-decision-output/) apply, just with an agent id added to each line.

## Where the split earns its cost

Three conditions, and all of them should hold:

- Each role owns a check you can run without consulting another model: a compile, a test suite, a schema validation, a link check.
- The roles need different permissions or tools, so the boundary doubles as a security boundary. A read-only reviewer and a network-enabled researcher are genuinely different agents; two writers with identical tools are not.
- The work is parallel, or longer than one context window, and the handoff artifacts are small enough to validate.

When all three hold, the split is doing real work: it contains blast radius, it lets a cheap model handle extraction while an expensive one writes, and it produces the review gate you would otherwise skip. When only the first holds, you have rebuilt a linter with extra steps.

## Where one general agent is simpler and safer

Skip the split when the work is one artifact under one directory, when verification is a command you already have, or when the real risk is a vague brief rather than a division of labour. In those cases, invest in the task description instead of the org chart.

```python
# run_one_agent.py — one agent, one brief, deterministic checks at the end
import json, pathlib, subprocess, sys

brief = pathlib.Path("task.md").read_text()   # goal, non-goals, done-when, files in scope
scope = ["src/pricing/"]                      # the agent may touch nothing else

resp = client.messages.create(                # your provider's SDK
    model=MODEL,
    max_tokens=8000,
    system=(
        "You are the only agent on this task. Read the brief, write a plan, then "
        "edit files under scope only. If the brief is ambiguous, stop and name "
        "the ambiguous sentence instead of guessing."
    ),
    messages=[{"role": "user", "content": f"{brief}\n\nscope={scope}"}],
)

out = pathlib.Path("runs/latest")
out.mkdir(parents=True, exist_ok=True)
(out / "response.json").write_text(json.dumps(resp.model_dump(), indent=2))

checks = [["npx", "tsc", "--noEmit"], ["node", "scripts/check-links.mjs"]]
failed = [c for c in checks if subprocess.run(c).returncode != 0]
sys.exit(1 if failed else 0)
```

A single agent given a goal, explicit non-goals, a file scope, done-when criteria and permission to stop on ambiguity beats a three-agent pipeline that was handed a one-line brief. Most "the agents are dumb" reports are brief problems. The discipline that used to be called prompt engineering now looks more like [context engineering](/blog/what-is-context-engineering/): deciding what the model sees, what it must never see, and when it is allowed to fail loudly.

One honest caveat: a general agent will not reliably catch its own mistakes in the same run, because self-review in the same context tends to confirm decisions already made. If you want review without a second agent, run a clean pass that sees only the artifact and a written checklist — or, better, a check that returns an exit code.

## What to do next

1. Write the brief before you split anything: goal, non-goals, files in scope, done-when, and the exact condition under which the agent must stop and ask. If you cannot write the done-when line, no topology will save the run.
2. List the verification oracles per step. Any proposed role without its own machine-runnable check is coordinator overhead wearing a job title; fold it back into the main agent.
3. Start with one agent and add a second only when you can name both the boundary and the check that sits on it. Two agents is a commitment, not a starting point.
4. Log one JSONL file per run with agent id, input artifact hash, output artifact hash and exit status. That single habit makes the multi-agent version debuggable instead of mysterious.
5. If you are already juggling several agents across projects and cannot say which run produced which file, Cowork Pro is a dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history. It is $59 USD, one-time, and downloads from https://slashmaster6.gumroad.com/l/xfhfps.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=specialist-agents-vs-one-general-agent) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
