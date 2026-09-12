---
title: "Five Orchestration Habits That Stop Agent Runs Burning Tokens"
description: "Five habits that keep multi-agent runs cheap: narrow per-agent context, cache stable instructions, cap retries, fail fast on schemas, route cheap models."
date: "2026-09-12T08:00:00+08:00"
draft: false
slug: "orchestration-habits-stop-agent-token-burn"
author: "Wayne Chang"
tags: ["ai-agents", "cost-control", "orchestration", "prompt-caching", "llm-ops"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Five Orchestration Habits That Stop Agent Runs Burning Token"
faq:
  - q: "Does prompt caching actually save money on multi-agent runs?"
    a: "It reduces the cost of repeated prefix tokens, but only when the prefix is byte-identical between calls. Any interpolated timestamp, run id or reordered tool list invalidates the cache and you pay full price again."
  - q: "How many retries should an agent step get?"
    a: "Two attempts total is usually enough: the original call plus one repair that sends only the error and the schema. If a step still fails, fix the prompt or the schema instead of adding attempts."
  - q: "When should I use a frontier model in an agent pipeline?"
    a: "For steps where errors compound or reach the user, such as code generation, final answers and conflict adjudication. Prefer escalating to it after a cheaper step fails validation rather than making it the default for every step."
---

A multi-agent run rarely gets expensive because one model call is too big. It gets expensive because the same context, the same instructions and the same retry loop get paid for twenty times. Cost discipline in agent systems is mostly plumbing and routing, not prompt cleverness, and five habits cover most of the waste.

## Hand each agent the smallest context that can do the job

The default multi-agent pattern is a supervisor that forwards the full conversation to every worker. The code reviewer gets the research notes, the formatter gets the planning debate, and the summariser gets everything. Every one of those calls re-bills context that has nothing to do with the step.

Treat context as an input you construct per agent, not a history you accumulate. The useful move is an explicit contract: what this agent receives, what it deliberately does not receive, and a hard input ceiling. The `excluded` list matters more than the `inputs` list, because it is the part that stops accidental growth.

```yaml
# agents/reviewer.yaml
name: reviewer
inputs:
  - diff            # the change under review, nothing else
  - review_rules    # stable, cacheable
  - output_schema
excluded:
  - full_conversation_history
  - planner_scratchpad
  - previous_reviews_of_other_files
max_input_tokens: 6000
```

One debugging note: when an agent gives a bad answer, the instinct is to add context. Usually the missing piece is one field, not ten files. Add the field, keep the ceiling. This overlaps with the wider discipline covered in [/blog/what-is-context-engineering/](/blog/what-is-context-engineering/).

## Cache the stable parts, version the variable parts

Prompt caching is offered by the major providers, and it only pays when the cached prefix is byte-identical between calls. The most common way to break it is interpolating a timestamp, run id or username into the system prompt.

```python
# breaks the cache on every call
system = f"Today is {datetime.utcnow().isoformat()}. You are a code reviewer. {REVIEW_RULES}"

# cacheable: stable prefix first, volatile data after
system = [{"type": "text", "text": REVIEW_RULES, "cache_control": {"type": "ephemeral"}}]
user = f"Today is {date.today().isoformat()}.\n\n{diff}"
```

Same rules apply to tool definitions and few-shot examples: they should sit in the same position, in the same order, on every run. Keep instructions in files, hash them, and store the hash alongside each run record. Otherwise you will eventually compare two runs produced by different instruction versions and draw the wrong conclusion from the difference.

Stable content first, volatile content last, no exceptions.

## Cap retries and fail fast on schema violations

Two separate leaks live here.

Retry storms: a step returns malformed JSON, the orchestrator says "your output was invalid, try again", and re-sends the entire context. Three retries on a 20k-token step is 60k tokens of failure, and a model that failed once often fails the same way again.

Silent bad output: the step "succeeds" with a plausible-looking object missing a required field, and the next two agents burn tokens building on it.

Fix both by validating at the boundary and keeping the repair path short.

```python
import json
from jsonschema import validate, ValidationError

def run_step(agent, context, schema, max_attempts=2):
    for attempt in range(1, max_attempts + 1):
        raw = agent.call(context)
        try:
            parsed = json.loads(raw)
            validate(instance=parsed, schema=schema)
            return parsed
        except (json.JSONDecodeError, ValidationError) as err:
            if attempt == max_attempts:
                raise StepFailed(agent.name, str(err))  # let the supervisor decide
            # repair with the error and the schema only - not the whole context
            context = {"schema": schema, "error": str(err), "previous_output": raw}
```

Note that the repair call drops the original context on purpose. If the model could not produce a valid object with full information, repeating that full information usually repeats the failure.

Then treat repeated violations as a signal rather than a nuisance. If one agent keeps blowing its schema, the problem is the prompt or an over-specified schema, not the retry count. Also put a hard ceiling on the run itself: a maximum token or cost budget, checked before each step, with defined behaviour on breach (halt the run, or degrade the remaining steps to a cheaper tier).

## Route cheap models to cheap steps

Most pipelines send every step to the same frontier model, including steps whose entire output is a label or a fixed-shape object.

| Step | Tier | Why |
|---|---|---|
| Intent classification, routing | Small / fast | Short output, fixed label set, a mistake only costs a re-route |
| Field extraction from documents | Small / fast | Schema-bound, mechanically verifiable, cheap to retry |
| Summarising long inputs | Mid | Needs compression judgment, not the strongest model |
| Drafting code or user-facing text | Frontier | Errors compound downstream or reach a customer |
| Adjudicating conflicts between agents | Frontier | Requires holding two positions at once |

The routing rule that matters: escalate on evidence, not in advance. Start each step on the cheap tier and move up only after that step fails validation, as flagged by the previous habit. That gives you a log of which steps genuinely needed the expensive model, instead of a guess written into the config on day one.

```yaml
routing:
  defaults:
    model: mid
  rules:
    - match: {step: classify_intent}
      model: small
    - match: {step: extract_invoice_fields}
      model: small
    - match: {step: draft_code, attempts_gte: 2}  # escalating after a schema failure
      model: frontier
  budget:
    per_run_tokens: 250000  # placeholder - set this from your own logged runs
    on_exceed: halt
```

None of this works without per-step accounting. If run history only shows total tokens for a run, you cannot tell whether the cost sits in the PDF reader or the code writer, and you will optimise the wrong thing. If you are still deciding between wiring this by hand and running it inside an automation platform, the tradeoffs are compared in [/blog/zapier-vs-n8n-vs-ai-workflow-builder/](/blog/zapier-vs-n8n-vs-ai-workflow-builder/).

## What to do next

1. Audit your three most expensive prompts. For each, list what actually influenced the output and delete everything else from the input contract.
2. Move timestamps, run ids and usernames out of system prompts. Keep the stable prefix byte-identical so provider prompt caching can hit.
3. Add schema validation before any step returns, set `max_attempts: 2`, and make the repair call send only the schema and the error.
4. Write the routing table as config rather than habit. Assign a tier per step and escalate only on validation failure. The broader build sequence around orchestration and deployment is covered in [/blog/ultimate-ai-automation-guide-2026/](/blog/ultimate-ai-automation-guide-2026/).
5. Log tokens and model per step, per run. If you want that on one screen instead of across four log files, Cowork Pro ($59 one-time) is a dashboard for organising and orchestrating multiple agents on real projects, with task routing and run history.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=blog&utm_medium=article&utm_campaign=orchestration-habits-stop-agent-token-burn) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
