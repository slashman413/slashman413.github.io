---
title: "Case Study: Automating Intake and Follow-Up for a Solo Consultant"
description: "An operating design for intake, proposal drafting and reply-aware follow-up, plus the first piece that broke and the log that caught it."
date: "2026-09-29T08:00:00+08:00"
draft: false
slug: "solo-consultant-intake-follow-up"
author: "Wayne Chang"
tags: ["automation", "consulting", "intake", "follow-up", "workflow"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/lapcqb"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-AIS"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Case Study: Automating Intake and Follow-Up for a Solo Consu"
faq:
  - q: "Do I need a CRM to run this?"
    a: "No. SQLite plus one email account covers intake, briefs, sequences and reply state at solo scale. A CRM becomes worth the overhead once more than one person touches the same pipeline."
  - q: "How do I stop follow-ups if the client replies from a different address?"
    a: "Match on the normalized domain of every participant in the thread, not just the tracked thread id, and keep a domain allowlist for assistants. Keep the daily digest running as the backstop for anything the rules miss."
  - q: "Should the model write the whole proposal?"
    a: "No. Situation, success definition and scope are safe to draft. Fees, assumptions, client responsibilities and the next step are written by a human every time, because those are commitment and price decisions."
---

This is not a story about a tool. It is the description of the pipeline one independent consultant runs between a prospect filling in a web form and a signed scope of work, built so a single person can keep two dozen live conversations alive without a CRM administrator. The interesting design question is not what the model writes; it is where the automation is required to stop and hand the keyboard back.

## Start from the brief schema, then design the form

The usual mistake is starting with the form questions. Start with the fields you need in order to write a proposal, then delete every question that does not feed one.

This pipeline's brief has seven substantive fields. Four are required. Two are nullable, and the normalizer is explicitly forbidden from guessing them.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["client_name", "problem_statement", "success_definition", "decision_maker"],
  "properties": {
    "client_name":        { "type": "string" },
    "problem_statement":  { "type": "string", "maxLength": 1500 },
    "success_definition": { "type": "string", "maxLength": 1500 },
    "decision_maker":     { "type": "string" },
    "deadline":           { "type": ["string", "null"], "format": "date" },
    "budget_band":        { "type": ["string", "null"],
                            "enum": ["under_10k", "10k_to_25k", "25k_plus", null] },
    "out_of_scope_notes": { "type": ["string", "null"] },
    "client_words":       { "type": "string" }
  }
}
```

The form itself is Tally, Fillout, or a plain HTML form in front of a Cloudflare Worker if you want to own the data. Long-answer boxes get a visible character counter, because a client who writes one line under "what does success look like" is telling you something the proposal should reflect rather than paper over. `client_words` is the raw concatenation of every free-text answer, kept verbatim and never truncated. It is the raw material for the first section of the draft.

The form also carries fields the model never touches: submission timestamp, referrer, form version. When a question starts producing useless answers, the version number is how you find out which change caused it. If you are still choosing where this runs, the setup in the [AI automation guide](/blog/ultimate-ai-automation-guide-2026/) covers the hosting choices; resist adding a CRM at this stage, for the reasons in [the tool sprawl writeup](/blog/solo-operator-tool-sprawl/).

## One normalization pass, and no cleverness

After submission, a single model call does three things: split compound answers into separate fields, expand obvious acronyms, and copy the raw answer into `client_words`. It does not summarize. Summaries lose the client's own phrasing, and that phrasing is what makes the generated proposal read like it was written by someone who actually read the form.

```yaml
# intake.yaml
model: <your provider, any capable instruction-tuned model>
temperature: 0
response_format: json_schema
schema_ref: ./brief.schema.json
rules:
  - never invent a value for a nullable field
  - if two answers contradict each other, set needs_review: true
  - client_words stays verbatim; no truncation, no cleanup
on_needs_review: tag_thread_and_email_owner
```

If `needs_review` is true, the brief goes to a "read this first" folder instead of the proposal queue. Contradictions are common: a six-week deadline alongside a scope that reads like six months, or a decision maker who is not the person who filled in the form. Both are worth your eyes before any text is drafted.

## Draft the proposal in sections, not in one prompt

A single prompt asking for a full proposal produces a document with a plausible-sounding middle and no spine. Generate into a Markdown scaffold section by section, then assemble:

1. Situation as understood — built almost entirely from `client_words`
2. What done looks like — from `success_definition`
3. Scope and not-in-scope — required fields plus `out_of_scope_notes`
4. Approach and phases — draftable once you paste in your own standard phase list
5. Fees
6. Assumptions and client responsibilities
7. Next step

Sections 1 through 3 are machine drafts. Section 4 is half-draftable, because the ordering logic is yours but the prose can be generated. Sections 5, 6 and 7 are written by a human every single time. That boundary is the whole design: the model handles recall and formatting, the human handles commitment and price.

## Follow-up that stops the moment someone replies

Cadence: day 3, day 7, day 14, then stop. Each message is a send on the same email thread, with `In-Reply-To` and `References` headers pointing at the previous message id, and the state lives in SQLite rather than in the mail client.

```python
# followup_tick.py — run on cron every 15 minutes
STEPS = {1: 3, 2: 7, 3: 14}   # step -> days after last send

DUE = """
SELECT s.id, s.thread_id, s.step, s.client_email
FROM sequences s
WHERE s.status = 'active'
  AND s.next_send_at <= :now
  AND NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.thread_id = s.thread_id
        AND m.direction = 'inbound'
        AND m.received_at > s.last_send_at
  )
"""

def tick(db, now):
    for row in db.execute(DUE, {"now": now}):
        send_followup(row)          # sets In-Reply-To from last outbound message
        step = row["step"] + 1
        db.execute(
            """UPDATE sequences
               SET step = ?, last_send_at = ?, next_send_at = ?, status = ?
               WHERE id = ?""",
            (step, now, now + STEPS.get(step, 0) * 86400,
             "active" if step in STEPS else "exhausted", row["id"]),
        )
```

The stop condition is that `NOT EXISTS` clause, and it is the part people get wrong. A same-thread check alone is not enough.

| Stop rule | Catches | Misses | Upkeep |
|---|---|---|---|
| Any inbound message on the tracked thread | Normal replies, Gmail and Outlook threading | New-subject replies, replies from a different address, an assistant replying from their own mailbox | One query |
| Inbound sender matches a domain allowlist | Assistants and colleagues on the client domain | Anyone replying from a personal address | Maintain the list |
| Manual review in a daily digest | Whatever the rules missed | Only as fast as you read the digest | One email a day |

Run all three. The thread rule is cheap and handles most cases; the domain rule catches the office manager; the digest is the backstop for the situation you did not imagine.

## What broke first, and how it was caught

The stop-on-reply logic. A prospect replied from a new subject line, from her work address, after the original thread had been started from a personal one. The thread check saw no inbound message on the tracked thread. The domain allowlist had a typo in the domain, so it did not match either. The day-7 message went out to someone who had already answered.

What caught it was the digest, not the logic. Every morning the cron wrote one email listing each follow-up sent in the last 24 hours, the query used to decide it was due, and the message id it was threaded to. That list takes two minutes to read. The bad send was visible in it the next morning, and the fix was small: normalize addresses to their domain before matching and treat any thread with overlapping participants as replied. The deeper lesson is that the digest is the monitoring layer. A stop condition you cannot audit is a stop condition you do not have. That is the same reasoning behind the [triage habits for failing automations](/blog/triage-automation-failures-while-you-sleep/).

A quieter break came earlier. The normalizer filled `budget_band` with `10k_to_25k` when the client had left it blank, and the draft proposal opened with a fee band nobody had agreed to. Nullable fields need an explicit leave-this-null instruction plus a validation step that rejects a non-null value for any field with no matching source text.

## What to do next

1. Write the brief schema before the form. Mark two fields nullable, and delete every form question that does not feed a field. The schema is the product; the form is a view of it.
2. Route contradictions to a `needs_review` path and treat that folder as a hard gate in front of the proposal queue.
3. Split your proposal template into seven sections and mark sections 5, 6 and 7 as human-only. Do not let a generated fee paragraph reach a client.
4. Implement all three stop rules from the table above, and log the deciding query and message id with every send. Without the log, the stop condition is a guess.
5. Run the cadence in dry-run mode for two weeks before it sends anything: write the messages you would have sent into the digest instead. If you are starting from no technical background, the AI Starter Bundle ($49, one-time) is the entry-level course plus a prompt library — it will not build this pipeline for you, but it is the cheapest way to get the vocabulary before you wire anything to a live client inbox.

## Get AI Starter Bundle

[**AI Starter Bundle**](https://slashmaster6.gumroad.com/l/lapcqb?utm_source=blog&utm_medium=article&utm_campaign=solo-consultant-intake-follow-up) — **$49**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-starter/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
