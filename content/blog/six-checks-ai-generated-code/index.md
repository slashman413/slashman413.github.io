---
title: "Six Checks Before AI-Generated Code Goes Out the Door"
description: "A short ship gate for AI-written code: ticket match, chosen failure mode, a real regression test, controlled input, readable errors, and one human read."
date: "2026-10-31T08:00:00+08:00"
draft: false
slug: "six-checks-ai-generated-code"
author: "Wayne Chang"
tags: ["code-review", "ai-coding", "testing", "shipping"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Six Checks Before AI-Generated Code Goes Out the Door"
faq:
  - q: "Is a six-item checklist too slow for a small team?"
    a: "It takes about ten minutes and replaces a much longer review argument. Answer the items in the PR template before anyone opens the diff, so review covers judgement calls rather than facts."
  - q: "What if the AI-generated code fails a check but works?"
    a: "Working is one check out of six. Code that passes the ticket but fails open on a timeout works until it does not, and the cost lands on whoever is on call."
  - q: "Do I need all six checks for a throwaway script?"
    a: "No. A throwaway script gets one check: did a human read it. The full gate applies to anything on a schedule, in a queue, or touching data you would have to explain to a customer."
---

Most AI-generated code does not fail review because it is wrong. It fails because nobody agreed on what "done" means before the diff landed, so the review turns into a debate about taste. A six-question gate replaces the debate: each question takes a yes or a no, and six yeses is the ship condition.

## The ship condition: six yeses, no partial credit

AI diffs are hard to review on instinct. They are consistently formatted, syntactically clean and locally sensible, which defeats the "does anything look weird" reflex that works on human code. The mistakes are relational: the function is fine but runs before the validation, the retry is correct but wraps an operation that should never be retried, the enum is right but the new value was never added to it.

A checklist short enough to run in ten minutes catches most of that, provided "mostly" is not an accepted answer. Put the questions in the pull request template so they are answered before anyone reads the diff. The answers are usually more informative than the code.

```yaml
ship_gate:
  matches_ticket: no
  failure_mode: ""        # fail-open | fail-closed, and why
  regression_test: ""     # path::test_name that fails without the fix
  input_source: ""        # bounded enum | our own form | external
  error_path: ""          # exact log line emitted on failure
  human_read: no          # who read it line by line, and when
```

If the change lives in a workflow canvas rather than a script, the same gate applies with the exported definition attached; the tradeoffs between those two shapes are covered in [workflow builder vs a plain script](/blog/workflow-builder-vs-plain-script/).

## Six checks, and what a no looks like

| # | Check | Pass looks like | Fails like |
|---|-------|----------------|-----------|
| 1 | Matches the ticket | Diff touches only the files the ticket implies | Bonus retries, silent refactors, redefined rules |
| 2 | Fails the way you chose | PR says fail-open or fail-closed, and the code agrees | Timeout swallowed, request "succeeds" with no data |
| 3 | Next regression is caught | Test fails when you revert the fix | Asserts the mock was called |
| 4 | Input is controllable | Bounded enum or a field your own form produces | Free text from a webhook, PDF or scraped page |
| 5 | Error path readable | Log names operation, id, expected vs actual | `Error: undefined`, bare except |
| 6 | One human read it | Someone can explain every line | "Looks good to me" on a 400-line diff |

**Check 1.** Read the ticket with the diff closed, then open the diff. Scope creep is the cheapest defect to catch and the most common: a logging refactor nobody asked for, a helper renamed across six files. Watch also for quiet reinterpretation. The ticket says reject duplicate emails; the code lowercases and strips plus-addressing first. That may be right, but it is a product decision, and product decisions do not belong inside an implementation diff.

**Check 2.** Every outbound call has three outcomes: success, retryable failure, permanent failure. Ask what happens on a timeout at 03:00 while the queue is backing up. Fail-open means the record goes through unchecked. Fail-closed means it stops and someone gets paged. Both are defensible. Unexplained is not.

**Check 3.** The question is not whether tests exist. It is whether the next person who breaks this behaviour sees red before they see production. A test that asserts the mock was called, or that the function returned a dict, does not answer that question.

**Check 6.** Skimming hunk by hunk hides the failure AI code produces most: plausible glue between two functions that each work. One read-through, in file order rather than diff order, with the right to say "I cannot explain this line" out loud.

The gate is a narrow slice of the wider build order in [the 2026 automation guide](/blog/ultimate-ai-automation-guide-2026/); here it is only about the last ten minutes before merge.

## Checks 2 and 4 need code, not opinions

A chosen failure mode looks like this, and the three things worth pointing at are the explicit timeout, the narrowed exception, and the identifier in the log before the error propagates:

```python
def place_order(order, risk_client):
    try:
        verdict = risk_client.check(order.id, timeout=2.0)
    except (TimeoutError, ConnectionError) as exc:
        log.error("risk_check_unavailable order_id=%s action=block", order.id)
        raise OrderBlocked("risk check unavailable") from exc
    if verdict.decision != "allow":
        return Rejected(verdict.reason)
    return Accepted()
```

The AI default is usually `except Exception: pass` with a comment promising to handle it later. That is a fail-open decision nobody made.

For input control, the question is who can supply the value. A field your own form produces from a bounded set, you can gate cheaply. A user-uploaded PDF, a scraped page, a webhook payload or a Slack message is attacker-shaped, and you cannot validate what you cannot enumerate. If the input is free text from the internet, the honest answer is that validation is not the control; treat everything in the model's window as untrusted data, which is the argument in [what is context engineering](/blog/what-is-context-engineering/).

```python
class Channel(str, Enum):
    email = "email"
    sms = "sms"

class NotifyRequest(BaseModel):
    user_id: int = Field(gt=0)
    channel: Channel
    body: str = Field(min_length=1, max_length=480)
```

The enum is the whole point. Adding a fourth channel now requires a code change, a test and a review, which is exactly the friction you want. A free-text `channel: str` would have accepted whatever the model felt like generating.

## The test, the error line, and the one human read

Check 3, the regression test. Write it so it fails when you revert the fix:

```python
def test_duplicate_email_rejected_before_write(db, mailer):
    create_user(db, mailer, email="a@b.co")
    with pytest.raises(DuplicateEmail):
        create_user(db, mailer, email="A@B.co")
    assert mailer.sent == []
    assert db.count_users() == 1
```

The capital A is deliberate: it pins the normalisation decision from check 1. Assert on the side effects you care about, nothing sent and nothing written, rather than on the shape of a return value. If you cannot make the test fail by undoing the fix, it is decoration.

Check 5, the error path. A log line should carry the operation, the identifier, and the gap between expected and actual. `ERROR send_failed user_id=8841 provider=twilio status=429 retry_after=30` is a fix at 03:00. `Error: undefined` is a second incident. If the generated code catches broadly and re-raises a generic exception, that is the review.

Check 6, the read. One human, one pass, file order. Not a stamp on a 400-line diff; if it is 400 lines, it should have been three diffs. Reading in file order catches what hunks hide: an import used once in a place it should not be, an early return that makes the next ten lines dead, a new endpoint with no auth decorator.

## What to do next

1. Paste the `ship_gate` block into your pull request template today, and make `human_read` a merge blocker until a name is in it.
2. Take the last three AI-generated PRs and answer the six questions retroactively. The ones you cannot answer are your next refactors.
3. Before fixing any bug this week, write the one test that fails without the fix, then apply the fix.
4. Add an explicit timeout and a narrowed `except` to every outbound call merged in the last month.
5. If you are the person who reviews this code but has never built one of these automations end to end, Ship With AI is a four-hour practical course that takes a non-coder from zero to a first working AI automation project, $39 one-time, available at https://slashmaster6.gumroad.com/l/mgtpcn.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=six-checks-ai-generated-code) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
