---
title: "How to Wire an AI Dev Stack So Each Layer Has One Job"
description: "Separate your prompt library, agent framework and deploy config so each layer owns one job, with naming and folder rules that keep the seam small."
date: "2026-10-21T08:00:00+08:00"
draft: false
slug: "wire-ai-stack-without-spaghetti"
author: "Wayne Chang"
tags: ["prompt-library", "agent-framework", "deployment", "architecture"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-ADS"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "How to Wire an AI Dev Stack So Each Layer Has One Job"
faq:
  - q: "Do I need a prompt management service to keep this clean?"
    a: "No. A folder of versioned Markdown files in the same repo as the agent code is the right default. Move to a service only when non-engineers must change wording faster than you can deploy."
  - q: "Where should model choice and temperature live?"
    a: "In deployment config, resolved through a role name like fast or deep. Prompts should never contain a vendor model string, or every provider swap becomes a diff across the whole library."
  - q: "Should the prompt include retry or fallback instructions?"
    a: "No. Retries, fallbacks and tool calls are decisions with side effects, so they belong in the agent framework where you can count them, log them and test them."
---

Most AI stacks rot from the middle out. The prompt file grows a small script, the script grows a retry loop, the retry loop grows a copy of the system message, and six weeks later nobody can change the tone of an answer without redeploying an agent. The fix is not a better framework. It is deciding once which layer is allowed to know what, then enforcing that decision with names and folders instead of willpower.

## Three layers, three jobs

Define the jobs before you touch the folder structure.

| Layer | Owns | Must not contain |
| --- | --- | --- |
| Prompt library | instructions, examples, output contract, tone | branching, retries, tool calls, secrets |
| Agent framework | control flow, tool invocation, schema validation, retries | paragraphs of prose guidance, environment config |
| Deployment tooling | env vars, pinned versions, scaling, logs | prompt text, business rules |

The test for any line you write: can it change without forcing a reader to open the other two layers? If a prompt edit requires a code deploy, the seam is in the wrong place. If a code change requires editing prompt wording, you have two sources of truth. Prompts are data, code is behaviour, deployment is repetition. Anything repeated — model name, temperature default, retry budget — belongs in deployment config, not pasted into forty prompt files.

## Put the seam at validated text

The boundary between prompt library and agent framework is a contract, not a convention. The prompt produces text that conforms to a schema; the framework parses it and refuses to guess.

```yaml
---
id: support.reply.drafter
version: 3
model_role: fast
output: json
schema: support.reply.v2
---
You draft a single reply to a support ticket.
Use only facts present in the ticket. Never promise a refund date.
Return JSON matching the schema. No prose outside the JSON.
```

Note what is absent: no tool list, no retry instructions, no API keys, no tenant names. The prompt does not know what calls it. The agent loads it by id and version, never by filename.

```python
from pydantic import BaseModel, ValidationError
from registry import load_prompt

class Reply(BaseModel):
    body: str
    confidence: float

def draft(ticket: str, attempt: int = 0) -> Reply:
    text, meta = load_prompt("support.reply.drafter", version="3")
    raw = client.complete(system=text, user=ticket, role=meta.model_role)
    try:
        return Reply.model_validate_json(raw)
    except ValidationError:
        if attempt >= LIMITS.max_retries:
            return fallback(ticket)          # code decides, not the prompt
        return draft(ticket, attempt + 1)
```

Two rules fall out of this. Retries, fallbacks and tool calls live in code because they are decisions with side effects; a prompt that says "if the tool fails, try again" is asking the model to count on a counter it cannot see. And the model comes from `model_role`, resolved at deploy time, so swapping providers never touches a prompt file.

If a prompt needs to know something about the world, it gets it as an input variable. Retrieved context, ticket history, tenant policy — all inputs, never a hardcoded paragraph. That is the same discipline described in the site's piece on [context engineering](/blog/what-is-context-engineering/), applied at the boundary instead of inside the window.

## Naming and folders that survive a rename

Model names change, product names change, team names change. Name things after the task and the boundary, never after the vendor.

```bash
stack/
├── prompts/                  # data, versioned, language-agnostic
│   ├── support/
│   │   ├── reply.drafter.v3.md
│   │   └── reply.drafter.v2.md   # kept while traffic still lands on it
│   └── eval/
│       └── reply.judge.v1.md
├── agents/                   # code, imports prompts by id
│   ├── support_agent.py
│   └── tools/
│       └── ticket_lookup.py
├── config/
│   ├── model_roles.yaml
│   └── deploy.prod.yaml
└── evals/
    └── support/reply.cases.yaml
```

Conventions worth enforcing in CI:

- The filename is `<task>.<variant>.v<N>.md`. The frontmatter `id` is the address; the filename is for humans. Both must match, and the build fails if they drift.
- Old versions stay. Deleting `v2` while a queue still holds jobs pinned to it is how you get errors at 2am. See how a tiny team handled this in [the prompt-library case study](/blog/two-people-one-prompt-library/).
- Agent modules describe the boundary: `support_agent.py`, not `main.py` or `agent2.py`.
- Tool modules are verbs: `ticket_lookup.py`, not `utils.py`.
- Config keys carry a role, not a model: `model_role: fast`, not a vendor model string scattered in five places.

The folder tree is the architecture diagram. If `prompts/` imports nothing and `agents/` contains no `.md` files, anyone can read the top level and know where everything lives.

## Deployment tooling pins the seam, not the text

Deployment's job is to take the same code and the same prompt versions and produce an identical running system. That means declaring which prompt versions an agent requires and failing the deploy when they are missing.

```yaml
# config/deploy.prod.yaml
service: support-agent
prompts_required:
  - id: support.reply.drafter
    version: 3
model_roles:
  fast: {provider: openai, model: PINNED_MODEL_ID, temperature: 0.2}
  deep: {provider: anthropic, model: PINNED_MODEL_ID, temperature: 0.0}
limits:
  max_retries: 2
  timeout_s: 30
logging:
  prompt_id_and_version: true   # every line carries both
```

Two operational consequences. Log the prompt id and version on every call, never the rendered prompt text — you need to know which version answered, and you do not want ticket content in logs. And keep prompt text in the repo until you have a real reason to move it out.

| Approach | Works when | Breaks when |
| --- | --- | --- |
| Prompts in repo, shipped with code | one team, deploys are cheap | non-engineers must edit prompts hourly |
| Prompts fetched from a service at runtime | wording changes must ship in seconds | version skew against agent code |
| Prompts in a database table | per-tenant phrasing | nobody can diff or review a change |

Start in the repo. Move out only when edit latency is the actual bottleneck, not an imagined one.

## Where the rule bends

Two honest exceptions. Tool-using agents sometimes need a short instruction attached to the tool itself — "call this before quoting a price" — so put it in the tool's description field inside the agent layer, not in the system prompt. And multi-turn conversations need state: keep it in the agent as a typed message list and pass the prompt only a rendered summary. Never let a prompt file accumulate a `conversation_so_far` variable plus conditional prose.

Three symptoms mean the seam has already moved: a prompt that grows an `if` block, an agent file that inlines a system message "just for now", a deploy that resolves `latest` instead of a version. Fix the seam, not the symptom.

## What to do next

1. Write the three-column table for your own stack and put it in the repo root README, so the next person inherits the rule and not just the code.
2. Rename one prompt file to the `<task>.<variant>.v<N>.md` pattern and add the matching frontmatter `id`. Do it for the one prompt you edit most, not all of them at once.
3. Move every retry, fallback and tool call out of prompt text and into the agent module, then delete the instruction from the file.
4. Add `prompts_required` to your deploy config and make the build fail when a referenced prompt version is missing.
5. If you would rather start from a stack that already keeps these layers apart, the AI Developer Stack Bundle ($79, one-time) bundles a prompt library, agent framework, deployment tooling and tutorials pre-configured to work together; it is a download from https://slashmaster6.gumroad.com/l/nulyms. For the wider picture of where automation fits, the [automation guide](/blog/ultimate-ai-automation-guide-2026/) is a reasonable next read.

## Get AI Developer Stack Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=wire-ai-stack-without-spaghetti) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-dev-stack/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
