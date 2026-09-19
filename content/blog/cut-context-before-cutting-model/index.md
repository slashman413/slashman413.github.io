---
title: "Six Ways to Cut Context Before You Cut the Model"
description: "Practical ways to shrink what you send to a model: retrieval, history summaries, state files, prefix caching, trimmed tool output and splitting tasks."
date: "2026-09-19T08:00:00+08:00"
draft: false
slug: "cut-context-before-cutting-model"
author: "Wayne Chang"
tags: ["context-engineering", "llm", "prompting", "cost", "agents"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/diwoc"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-APL"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Six Ways to Cut Context Before You Cut the Model"
faq:
  - q: "Does shrinking context hurt answer quality?"
    a: "It can, if you trimmed something that was actually relevant. That is why you cap retrieval with a budget and keep a small set of real questions with known answers, so silent misses show up immediately."
  - q: "Is prompt caching worth it for short prompts?"
    a: "Usually not. Caching pays off when a long, stable prefix repeats across many calls; below the provider's minimum prefix length there is nothing to cache."
  - q: "When should I switch to a bigger model instead?"
    a: "After the six steps above, and mainly for tasks that need multi-step reasoning rather than more facts. A bigger model fed the same bloated context often fails in the same place."
---

When an agent starts producing worse output, the reflex is to reach for a bigger model. That is the most expensive lever you have, and it is rarely the binding constraint. Most long-context failures come from what you put in the window, not from the model's ability to read it.

## Retrieve instead of dumping

Dumping a knowledge base into the prompt "just in case" is the most common cause of bloated context. It also degrades output: irrelevant text competes with the paragraph that actually mattered, and the model has to decide which of twenty documents applies. If the vocabulary here is new to you, [the basic framing](/blog/what-is-context-engineering/) is worth ten minutes.

Retrieval only helps if the ranking is good. Two-stage retrieval, a cheap lexical or vector pass followed by a reranker over the top candidates, costs less than the tokens you save. Then cap the result with an explicit budget instead of trusting the ranker to be polite.

```python
def build_context(candidates, budget_tokens, count_tokens):
    """candidates: [{"text": str, "score": float}], already ranked."""
    chosen, used = [], 0
    for item in sorted(candidates, key=lambda c: -c["score"]):
        cost = count_tokens(item["text"])
        if used + cost > budget_tokens:
            continue
        chosen.append(item["text"])
        used += cost
    return "\n\n---\n\n".join(chosen)
```

| Approach | What gets sent | Where it breaks |
|---|---|---|
| Full dump | Everything in the index | Cost scales with corpus, not with the question |
| Top-k similarity | k nearest chunks | Misses answers that are spread across chunks |
| Retrieve then rerank | A small ranked set | Reranker latency; needs a real eval set |
| Structured lookup | Rows or fields from SQL or an API | Requires a schema and a query step per task |

The failure mode to watch for is silent misses: the prompt gets smaller and the answer gets wrong without erroring. Keep a handful of real questions with known answers and re-check them whenever you touch the retriever or the budget.

## Summarise history instead of replaying it

Long chats go wrong for a dull reason: you keep re-sending every turn. A rolling summary fixes the shape of the problem. Summarise everything older than the last few turns, keep the recent turns verbatim, and the transcript stops growing without losing the decisions.

Two rules make it work. Put the summary in a system-level block rather than a user message, so the model treats it as context instead of something to reply to. And tell the summariser what to keep and what to drop, or you get a bland paragraph that has quietly lost the file paths.

```python
def compress(messages, keep_last=6, summarise=call_model):
    if len(messages) <= keep_last:
        return messages
    old, recent = messages[:-keep_last], messages[-keep_last:]
    summary = summarise(
        "Summarise this transcript for a future session.\n"
        "Keep: decisions, file paths, names, constraints, open questions.\n"
        "Drop: greetings, restated goals, reverted attempts.\n\n"
        + render(old)
    )
    return [{"role": "system", "content": f"Earlier session:\n{summary}"}, *recent]
```

Summaries drift. A summary of a summary loses specifics, so re-compress from the raw log when you can, and keep the original transcript on disk. Any detail that matters enough to survive several compressions belongs in a state file, not in prose.

## Keep state in structured files

The model does not need to remember that Stripe is the billing source of truth. It needs that fact at the step that touches billing. Store it on disk and pass only the slice the step requires.

```json
{
  "task": "migrate billing webhooks",
  "status": "in_progress",
  "decisions": [{"id": "d1", "text": "Stripe remains source of truth"}],
  "files_touched": ["src/billing/webhook.ts"],
  "open_questions": ["retry policy for 5xx?"]
}
```

Then pull just what the step needs with `jq`, instead of pasting the whole file back in:

```bash
jq -c '{task, status, open_questions}' .agent/state.json
```

Validate writes. A model that appends to a JSON file will eventually append invalid JSON, and the failure surfaces three steps later as a confusing error. Schema-check on write and keep the last known-good copy. Also worth saying plainly: a state file nobody updates is worse than no state file, because it lies with confidence.

## Cache stable prefixes

Most requests in an agent loop start with the same system prompt, the same tool definitions and the same style guide. Providers will cache that prefix, and the price gap between a cached and an uncached input token is large enough to matter at volume. The mechanics vary: some APIs take an explicit cache directive on a content block, others cache automatically the longest prefix that matches a previous request above some minimum length. Check your provider's documented minimum prefix size, which differs by model.

The rule that does not vary is ordering. Stable content first, volatile content last, and nothing request-specific before the cached block. A timestamp, session ID or counter placed above it invalidates everything below.

```python
messages = [{
    "role": "user",
    "content": [
        {"type": "text", "text": TOOL_DEFS + STYLE_GUIDE,
         "cache_control": {"type": "ephemeral"}},  # stable prefix
        {"type": "text", "text": current_request},  # changes every call
    ],
}]
```

Caching has a write cost and a lifetime. If your prefix changes on every request you pay for writes and never read. Instrument cache reads before assuming it is helping.

## Trim tool output, then split the task

Tool output is where context quietly explodes. A raw API response with forty fields, a full log file, a page of HTML. The model needs the error code, not the payload. Shape it at the tool boundary:

```bash
curl -s "$API_URL" | jq '{status, error, ids: [.items[].id]}'

journalctl -u worker --since "1 hour ago" \
  | grep -Ei "error|panic|timeout" \
  | tail -n 40
```

Two traps. Truncating with `head` can cut the error that only appears at the end, so filter for failure patterns instead. And summarising tool output with another model call adds latency to every step, so do the deterministic trimming first.

When trimming is done and the step is still too large, the problem is the step. Split it into two: research then write, plan then execute, extract then transform. Pass a checkpoint file between them rather than a conversation. A focused second call with a small context beats one call guessing at both halves, and each half is debuggable on its own. This is also the point where a subagent earns its place, not because it is smarter but because it starts with a clean window. If you are choosing the layer that runs these two calls, [the orchestration comparison](/blog/zapier-vs-n8n-vs-ai-workflow-builder/) covers the tradeoffs of passing small payloads between steps.

If you have done all six and quality is still short, then change the model. In that order.

## What to do next

1. Log input tokens per step for one day, then look at the single largest step.
2. Replace one full-document dump with retrieval plus an explicit token budget.
3. Add a rolling summary with a fixed keep-last window, and re-derive it from the raw log when it starts losing detail.
4. Move three persistent facts out of the prompt and into a validated state file.
5. Reorder one prompt so stable content leads, then mark that block for caching.

If you would rather start from prompts that are already scoped to a job instead of a blank page, the AI Prompt Library is a $29 one-time library of ready-to-use, copy-paste templates organised by writing, coding, research and ops. For the wider picture of where these steps fit, [the automation guide](/blog/ultimate-ai-automation-guide-2026/) is the longer read.

## Get AI Prompt Library

[**AI Prompt Library**](https://slashmaster6.gumroad.com/l/diwoc?utm_source=blog&utm_medium=article&utm_campaign=cut-context-before-cutting-model) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-prompt-library/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
