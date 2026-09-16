---
title: "From One Sentence to a Runnable Workflow: A Refund Triage Spec"
description: "Turn a plain-English request into a runnable workflow: fix the trigger, type each step, add validation and a failure path, then run it once by hand."
date: "2026-09-16T08:00:00+08:00"
draft: false
slug: "one-sentence-to-runnable-workflow"
author: "Wayne Chang"
tags: ["automation", "workflow-design", "ai-agents", "specs", "validation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/amwkf"
product_price: "99"
product_brand: "Slashman Tools"
product_sku: "SMT-AWB"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "From One Sentence to a Runnable Workflow: A Refund Triage Sp"
faq:
  - q: "How detailed should the spec be before I start building?"
    a: "Detailed enough that a second person could run it by hand: trigger, ordered steps, and one declared input and output shape per step. You will revise it after the first manual run anyway, so do not polish it first."
  - q: "What is the difference between a dead-letter queue and a failure alert?"
    a: "The queue stores the payload, the step ID and the raw output that failed so you can replay or repair it. An alert only tells you something broke. You want both, because an alert without a stored payload means the work is gone."
  - q: "Can I reuse the same spec across different automation tools?"
    a: "The step names, schemas and failure paths transfer cleanly. The bindings do not, meaning which HTTP client, model or queue each step actually calls. Keep the spec tool-neutral and write bindings separately, so a tool swap touches only the bindings."
---

Most automation projects do not fail at the code. They fail at the sentence. "Handle refund emails for me" is a wish with a subject line attached, and no amount of tooling turns it into something you can debug on a Tuesday afternoon.

Below is the conversion, done in five passes: trigger, decomposition, types, validation, and a single manual run. The example is refund triage, but the passes are identical whether you are routing leads, summarizing tickets, or watching a pricing page.

## Pass 1: Fix the trigger before anything else

The trigger is the only part of a workflow you do not control, so it should be the dumbest part. Answer four questions: what event, from what source, what does the payload look like, and how often can it fire?

"Emails about refunds" is not a trigger. It is a trigger plus a classifier glued together. The test is simple: can you reproduce the trigger without running a model? If not, you can never tell whether a misfire came from the trigger or from the classifier.

Prefer a dedicated inbox, a form, a table row, or a webhook. Classification belongs in step one, where you can log its input alongside its output.

| Trigger | Fires on | Replayable by hand | Failure visibility |
| --- | --- | --- | --- |
| Dedicated inbox | Message arrival | Yes, replay a saved `.eml` | High: the message just sits there |
| Shared inbox + label | A human applies a label | Yes | Medium: depends on label discipline |
| Classifier over all mail | A model decision | No | Low: misfires look like silence |
| Webhook form | HTTP POST | Yes, one `curl` | High: a non-200 is logged |

Chosen: new unread message in the support mailbox. Nothing else fires the workflow.

## Pass 2: Decompose into one verb per step

Rewrite the sentence as a sequence where each step does one thing and can be tested alone.

1. Classify intent.
2. Extract the order ID.
3. Fetch the order.
4. Apply the refund policy.
5. Draft a reply.
6. Route for human approval.

Six steps, seven with the trigger. Small enough to hold in your head, large enough to be worth automating.

Two failure modes appear at this stage. Over-decomposition splits "fetch the order" into parse ID, build URL, call API, parse response, which gives you four steps you will never test individually. Under-decomposition collapses "handle the refund" into one step, so a policy rejection and a network timeout land in the same bucket.

Write the spec down before you build anything. YAML is fine. The point is that it is reviewable and versionable.

```yaml
name: refund-triage
trigger:
  type: imap.new_message
  mailbox: support@
  filter: { unread: true }

steps:
  - id: classify_intent
    uses: llm.classify
    input:
      text: string            # from trigger.body_plain
    output:
      intent: enum[refund, other]
      confidence: number      # advisory, never used to branch alone
    on_invalid_output: dead_letter

  - id: extract_order_id
    uses: llm.extract
    input:
      text: string
    output:
      order_id: string
    on_missing: ask_human

  - id: fetch_order
    uses: http.get
    input:
      order_id: string
    output:
      order: object           # guaranteed keys: id, status, total_cents, purchased_at
    on_error: retry(max=3, backoff=exponential)

  - id: policy_check
    uses: fn.evaluate
    input:
      order: object
      ruleset: string         # "refund-policy-v3"
    output:
      decision: enum[approve, reject, escalate]
      reason: string

  - id: draft_reply
    uses: llm.generate
    input:
      decision: enum
      reason: string
      order: object
    output:
      subject: string
      body: string
    on_invalid_output: dead_letter

  - id: route_approval
    uses: human.approve
    input:
      draft: object
    output:
      approved: boolean
      edited_body: string?
```

If your per-step prompts are growing past a paragraph, the contents of the context are worth designing deliberately. [Context engineering](/blog/what-is-context-engineering/) covers what to include and what to leave out at each step.

## Pass 3: Type the inputs and outputs

Untyped steps pass prose to each other and fail three steps later inside a prompt, where the error message is a paragraph. Give every step a declared input shape and output shape.

Two rules keep this honest:

- **Outputs are a closed set of fields.** If a step outputs `order: object`, list the keys the next step may rely on. "Some JSON" is not a type.
- **A step either produces its declared output or fails.** No "returns text that probably contains JSON."

The payoff is at the boundary. A missing order ID stops at `extract_order_id`, not inside the reply generator where you have to read English to find out what went wrong.

```python
from jsonschema import validate, ValidationError

ORDER = {
    "type": "object",
    "required": ["id", "status", "total_cents", "purchased_at"],
    "properties": {
        "id": {"type": "string"},
        "status": {"enum": ["paid", "shipped", "refunded"]},
        "total_cents": {"type": "integer"},
        "purchased_at": {"type": "string", "format": "date-time"},
    },
    "additionalProperties": False,
}

def guard(step_id, payload, schema):
    try:
        validate(payload, schema)
        return payload, None
    except ValidationError as err:
        return None, {"step": step_id, "reason": err.message, "payload": payload}
```

Typed outputs are also what let you swap a model or a provider without rewriting the steps around it.

## Pass 4: Validation and the failure path

Every step needs a defined destination when it fails, and failures should be grouped by class rather than by step, because different classes want different responses.

| Failure class | Detected by | Action | Where it lands |
| --- | --- | --- | --- |
| Bad input | Input schema | Stop before the step runs | Dead letter |
| Bad model output | Output schema | Retry once with a stricter prompt, then stop | Dead letter |
| Business rejection | Policy step | Continue: rejection is a valid outcome | Approval queue with reason |
| External error (5xx, timeout) | HTTP status | Retry with backoff, cap attempts | Dead letter after the cap |
| Missing fact | Required field absent | Ask a human, do not guess | Human queue |

One detail matters more than it looks: a policy rejection is not an error. A workflow that treats "declined" as a failure will bury real decisions in the error queue, and you will stop reading that queue within a week.

A dead-letter record should contain the workflow name, step ID, the input that entered the step, the raw output that failed validation, and a timestamp. A stack trace alone is not replayable.

```bash
# Replay a saved sample with no outbound calls and per-step tracing.
workflow run refund-triage --input ./fixtures/refund-01.json --dry-run --trace

# Run every fixture and print each step's typed output in order.
for f in fixtures/*.json; do
  workflow run refund-triage --input "$f" --trace
done
```

## Pass 5: Run it once by hand

Before you schedule anything, run three inputs manually:

- A clean refund request.
- A message with no order ID in it.
- An order that deliberately fails the policy.

Watch each step's output as it moves. Check that the trigger fires exactly once, that classification is logged with the text it saw, that the malformed input stops at the boundary instead of reaching the model, and that the drafted reply is something you would actually send.

Then schedule it, with a concurrency limit of one and an alert on the dead-letter queue. Concurrency of one means two refund emails arriving together do not race on the same order record, which is the kind of bug that only shows up in production.

If you want the wider map of where this fits, [the automation framework guide](/blog/ultimate-ai-automation-guide-2026/) covers the surrounding pieces, and [the solopreneur guide](/blog/solopreneur-ai-automation-2026-guide/) covers what is worth automating first.

## What to do next

1. **Pick one request you currently handle by hand** and write it as a single sentence. Do not edit it for elegance yet.
2. **Extract the trigger into its own line** and confirm you can replay it without running any model.
3. **Write the spec as YAML** with six steps or fewer, and one declared input and output shape per step.
4. **Hand-run the failure path first**, not the happy path. A malformed input is the fastest way to find untyped boundaries.
5. **If writing the spec is the part you keep skipping**, AI Workflow Builder ($99 USD, one-time) turns a plain-English prompt into validated multi-agent workflow definitions you can inspect, version and run. Treat its output as a draft spec to review line by line, not a finished workflow.

## Get AI Workflow Builder

[**AI Workflow Builder**](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=article&utm_campaign=one-sentence-to-runnable-workflow) — **$99**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-workflow-builder/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
