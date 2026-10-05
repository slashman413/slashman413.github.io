---
title: "How to Design Structured Output a Model Can Actually Fill"
description: "Field-by-field rules for LLM output schemas: enums over free text, honest optionality, defined empty values, and a validation loop that retries."
date: "2026-10-05T08:00:00+08:00"
draft: false
slug: "designing-structured-output-schemas"
author: "Wayne Chang"
tags: ["llm", "structured-output", "json-schema", "validation", "prompting"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/diwoc"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-APL"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "How to Design Structured Output a Model Can Actually Fill"
faq:
  - q: "Should I use a nested schema if my data really is hierarchical?"
    a: "Usually no. Flatten it into prefixed field names first, because each nesting level adds failure modes without adding information the model can use. Only nest when a field genuinely repeats and you need per-item structure."
  - q: "Is provider-side strict JSON schema mode enough on its own?"
    a: "No. It guarantees the shape, not that the values are checkable or true. You still need enums, defined empty values, and a retry path for cases where the input simply does not contain the answer."
  - q: "How many retries before I should give up?"
    a: "Two or three. Beyond that, the same field usually keeps failing, which means the schema asks for something the input cannot supply. At that point fix the field or route the item to a human instead of raising the retry budget."
---

Structured output fails in production for boring reasons. The schema asked for something the input never contained, or it collected a judgement call into a free-text field that every downstream consumer then had to parse again. Valid JSON is not the finish line; a payload your code can act on without guessing is.

## Why verbose schemas fail

A schema is a prompt. Every property name, type, description and required marker is instruction text the model has to hold while it writes. When that text gets long, two things happen.

First, the model starts servicing the schema rather than the input. If `root_cause_analysis` is required and the ticket says only "login broken," the model writes a plausible root cause, because from its perspective an invented value is a better outcome than an empty required field. You get a filled field that is fiction, and nothing in your validation catches fiction.

Second, structural errors multiply with depth. A flat object with six fields has six places to go wrong. A nested object with three levels has eleven, plus the possibility of an unbalanced brace that invalidates the whole payload. Schema, input and output share one context window, so truncation mid-object is a common parse failure. This is the same attention arithmetic that governs everything else in the prompt; /blog/what-is-context-engineering/ covers the background.

Redundancy is the third trap. Fields like `summary`, `key_points` and `takeaway` overlap, so the model writes one sentence three times with different punctuation and you pay for all three.

## Field-by-field rules

Walk the schema property by property and ask two questions: does my code read this, and can the input always answer it? If either answer is no, change the field.

| Field shape | Use it when | Common failure | What to do instead |
|---|---|---|---|
| enum | The value comes from a closed set | Model invents a category | List every allowed value explicitly |
| boolean | You act on yes/no and nothing else | Model hedges into a wrong `true` | Split into enum: yes / no / unclear |
| free text | The field is genuinely open prose | Unbounded length, restating the input | Cap length, one sentence per field |
| number | You threshold or do arithmetic on it | Model returns "around 12" | Integer type, state the unit |
| array of enum | Multi-select from a known set | Model returns a comma-separated string | Say whether an empty array is allowed |
| nested object | Almost never | One typo kills the whole payload | Flatten it |

Beyond the types, five habits do most of the work.

**Prefer enums over free text whenever the value set is closed.** Sentiment, category, priority, status, intent: these are enums. Free text is where models are most confident and least checkable. If you need a reason, add one separate optional string beside the enum, not instead of it.

**Make optional genuinely optional.** Optional means the model may omit it, so say that in the prompt and allow `null` in the schema. A field described as optional but typed as a required string will be filled with something. Under strict JSON schema modes the schema is the contract; the model does not read your intent.

**Give one filled example.** One complete, realistic output teaches more about granularity and enum choice than three paragraphs of field descriptions. Keep it short, keep it valid against the schema, and make the example cover an awkward case rather than a tidy one.

**Define what an empty value means.** `null` should mean one specific thing, and an explicit enum member such as `unknown` or `not_stated` should mean "the source is silent." Those are different facts, and merging them costs you a debugging session later. Same for arrays: `[]` means "I looked and found none," never "I did not check."

**Drop fields you never consume.** Every field is another validation failure waiting to happen, and it dilutes attention on the fields you do read.

## A schema with one filled example

Six fields, no nesting, four enums, one nullable string, one array.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["category", "severity", "sentiment", "needs_human"],
  "properties": {
    "category": { "enum": ["billing", "auth", "integration", "performance", "other"] },
    "severity": { "enum": ["blocker", "degraded", "cosmetic"] },
    "sentiment": { "enum": ["neutral", "frustrated", "angry", "unknown"] },
    "needs_human": { "type": "boolean" },
    "blocker_summary": { "type": ["string", "null"], "maxLength": 160 },
    "affected_components": { "type": "array", "items": { "type": "string" }, "maxItems": 3 }
  }
}
```

The semantics: `sentiment` uses `unknown` when the customer expressed none, so "no signal" never collapses into `neutral`. `blocker_summary` is `null` unless severity is `blocker`. `affected_components` is `[]` when the message names no component. A filled example:

```json
{
  "category": "auth",
  "severity": "blocker",
  "sentiment": "frustrated",
  "needs_human": true,
  "blocker_summary": "SSO login returns 403 after IdP certificate rotation",
  "affected_components": ["sso", "identity-provider"]
}
```

The same schema on a cosmetic ticket, showing both empty branches:

```json
{
  "category": "other",
  "severity": "cosmetic",
  "sentiment": "unknown",
  "needs_human": false,
  "blocker_summary": null,
  "affected_components": []
}
```

If that second payload keeps returning a non-empty `affected_components`, the field is asking for something the input does not have. Delete it or widen the enum.

## Validate, then retry with the error

Generation is a request that may fail. Put a validator between the model and your database.

```python
import json
from jsonschema import Draft202012Validator

validator = Draft202012Validator(SCHEMA)

def fill(system_prompt, ticket_text, max_attempts=3):
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": ticket_text},
    ]
    for _ in range(max_attempts):
        raw = call_model(messages, response_format={"type": "json_object"})
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            messages += [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": f"Invalid JSON: {exc}. Return only the object."},
            ]
            continue

        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
        if not errors:
            return data

        problems = "\n".join(f"- {list(e.path)}: {e.message}" for e in errors)
        messages += [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": f"Fix these and return the full object:\n{problems}"},
        ]
    raise ValueError("schema not satisfied after retries")
```

Three details carry the weight. Send the validator's own error text back instead of "try again" — it names the failing path and the violated constraint. Ask for the whole object again rather than the single field, because partial regeneration drifts out of sync with the rest. Cap attempts at two or three and log which field fails, because a field that fails repeatedly is a schema bug: either the input lacks the answer or your enum is missing a real category.

Keep temperature low for extraction, and use provider-side strict schema modes where they exist. Those enforce structure, not truth, so the retry loop still earns its place. For what to do when these jobs fail while nobody is watching, /blog/triage-habits-for-automation-that-fails-while-you-sleep/ covers the alerting side.

## What to do next

1. Open your worst-performing extraction or classification prompt and delete every field your code never reads. Re-run it and compare the failure pattern.
2. Convert your top three free-text fields to enums. Write the allowed values as a literal list, and add `unknown` wherever the source may be silent about the answer.
3. Add one complete filled example to the prompt, matching a hard input rather than an easy one, and check it against the schema.
4. Wire in the validate-and-retry loop above with a cap of three attempts, and log the failing field path on every retry.
5. If you would rather start from working prompt text than a blank editor, the AI Prompt Library is a $29 one-time set of copy-paste templates organised by job (writing, coding, research, ops). It supplies the prompt wording; the schema, empty-value semantics and validation loop are still yours to build.

## Get AI Prompt Library

[**AI Prompt Library**](https://slashmaster6.gumroad.com/l/diwoc?utm_source=blog&utm_medium=article&utm_campaign=designing-structured-output-schemas) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-prompt-library/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
