---
title: "Cron, Queue or Event Trigger: Choosing a Scheduler That Fits"
description: "Cron, queues and event triggers compared on retries, ordering, duplication and ops burden, plus the hybrid scheduling pattern most small teams should run."
date: "2026-10-05T08:00:00+08:00"
draft: false
slug: "cron-queue-event-trigger-scheduler"
author: "Wayne Chang"
tags: ["scheduling", "cron", "queues", "reliability", "webhooks"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Cron, Queue or Event Trigger: Choosing a Scheduler That Fits"
faq:
  - q: "Do I need a queue if I already run everything on cron?"
    a: "Only when a job can overlap with itself, outlive its schedule, or needs automatic retries. For single-host periodic jobs, a lock plus a heartbeat monitor covers most of what a queue would give you."
  - q: "Can I get exactly-once delivery from a broker or webhook?"
    a: "No. Standard queues and webhook providers are at-least-once, so duplicates are a design assumption rather than a bug. You get effectively-once side effects by making the handler idempotent with a unique key."
  - q: "How do I handle events that arrive out of order?"
    a: "Store a monotonic version on the affected row and reject writes with a lower version than what is already stored. Alternatively, key the queue per entity so ordering is guaranteed within that entity rather than globally."
---

Every automation needs something to decide when it runs, and most teams pick that something by habit rather than by what it guarantees. Cron, a queue with workers, and event triggers look similar in a diagram and behave nothing alike on a bad Tuesday. Here is what each one actually promises, where each one breaks, and the mixed setup that covers the large majority of small-team workloads.

## The three shapes and their delivery promises

**Cron** is a clock. A daemon reads a schedule and runs a command. It has no memory of the previous run, no retry, no backpressure, and no record of failure beyond whatever the command writes to stdout. If the host is down at the scheduled minute, the run simply never happened.

**A queue** is a buffer plus workers. A producer writes a message to a broker (Redis, SQS, RabbitMQ, or a Postgres-backed option like pgmq); a worker takes the message, does the work, and acknowledges it. Most brokers give you at-least-once delivery, which is a polite way of saying duplicates are expected and retries are built in.

**An event trigger** is someone else's clock. Stripe, GitHub, Slack or your own service calls your endpoint when something happens. The delivery semantics belong to the sender: retries on non-2xx responses, possible duplicate deliveries, and no ordering guarantee across events.

| | Cron | Queue + workers | Event trigger |
|---|---|---|---|
| Who decides timing | You (schedule) | Producer | External sender |
| Retries | None built in | Broker-level, configurable | Sender's policy |
| Ordering | Absolute, by clock | Per-queue only, not global | Not guaranteed |
| Duplicate risk | Overlapping runs, double-fire on DST | Redelivery after timeout or crash | Sender retries |
| Backpressure | None | Natural (queue depth) | None; you must ack-and-enqueue |
| Ops burden | Lowest | Highest | Low on your side, invisible on theirs |
| Typical silent failure | Job never ran | Poison message loop | Handler returns 200 but drops work |

## Failure modes worth designing against

**Cron overlap.** A job that takes longer than its interval starts a second copy while the first is still running. Two processes writing the same rows, doubled API spend, rate limits from a provider you cannot call again cheaply. The fix is a lock: `flock -n` on the command, or a Redis `SET key value NX EX 300` guard at the top of the job. Run schedules in UTC as well, because `0 2 * * *` in a local timezone fires twice or not at all across a daylight-saving transition. And since cron has no dead-letter queue, pair every job with a heartbeat: if the job does not ping an external monitor on success, you get alerted. This is the same triage problem covered in [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/).

**Queue poison messages and timeouts.** A message that always throws will be retried forever unless you set a maximum receive count and route it to a dead-letter queue. A worker that crashes after doing the work but before acknowledging causes redelivery, so the work happens twice. A job that runs longer than the visibility timeout gets picked up by a second worker while the first is still going. Ordering is per-queue at best; a single standard queue will not preserve the order you imagined. One slow job class blocks everything behind it unless you split queues by priority or job type.

**Event duplicate and out-of-order delivery.** Providers retry on your timeout, on a 5xx, and sometimes on a network blip you never observed. The only safe handler verifies the signature, acknowledges quickly, and enqueues the real work. Out-of-order arrival is normal: an `updated` event can land before the matching `created`. Treat events as "something changed, go look", not as a complete ordered log.

## Duplication and idempotency, concretely

All three styles converge on the same fix: make the unit of work idempotent and record what you have already processed. A unique constraint does the hard part.

```python
# worker.py — at-least-once delivery, effectively-once side effects
import psycopg

def handle(job: dict) -> None:
    key = job["idempotency_key"]   # e.g. f"{event_id}:{step}"
    with psycopg.connect(DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO processed_jobs (key) VALUES (%s) "
            "ON CONFLICT (key) DO NOTHING RETURNING key",
            (key,),
        )
        if cur.fetchone() is None:
            return                  # an earlier delivery already did this
        do_the_work(cur, job)
        conn.commit()
```

For ordering, prefer not needing it. When you do, put a monotonic version on the row and reject stale writes:

```sql
UPDATE invoices SET status = %(status)s, version = %(version)s
WHERE id = %(id)s AND version < %(version)s;
```

Zero rows updated means a newer version already landed. Discard the stale write instead of retrying it.

## Deciding questions for a small team

Work through these in order; the first one with an obvious answer usually settles the design.

1. **Is the trigger a time or a fact?** A time goes to cron. A fact in another system goes to an event trigger. Neither goes straight to a queue, because the queue is the destination, not the trigger.
2. **What happens if it runs twice?** If the answer involves money, email, or an external API with side effects, idempotency is mandatory and should shape the design before anything else.
3. **How long does the longest run take?** Longer than the interval means cron alone is wrong; you need a lock at minimum, a queue at best.
4. **Who owns retries?** If you do, a queue hands you backoff, max attempts and a dead-letter queue. If the sender does, you must dedupe on their event ID.
5. **Does order matter?** If yes, you need a per-entity queue key or a version column, not one global queue.
6. **Who gets woken up?** Ops burden is the real currency for a two-person team. A queue you cannot observe is worse than cron plus a heartbeat.

If you are picking between managed workflow tools, the same criteria decide it — the comparison in [Zapier vs n8n vs a custom AI workflow builder](/blog/zapier-vs-n8n-vs-ai-workflow-builder/) mostly comes down to who operates the retry logic.

## The hybrid pattern that covers most cases

Cron is your only clock. Events are your fast path. The queue is your buffer, retry engine and audit trail. Everything funnels into the queue.

```bash
# crontab (UTC) — the only place a clock lives
*/5 * * * * /usr/bin/flock -n /tmp/sync.lock /app/bin/run sync-invoices
0  3 * * *  /usr/bin/flock -n /tmp/nightly.lock /app/bin/run nightly-digest
```

`flock -n` exits immediately if the previous run still holds the lock, which turns silent overlap into a skipped run you can count.

```python
@app.post("/webhooks/provider")
def receive(payload: bytes, signature: str = Header(...)):
    event = verify_signature(payload, signature)   # 400 on failure
    enqueue({
        "kind": event["type"],
        "idempotency_key": event["id"],
        "payload": event["data"]["object"],
    })
    return {"ok": True}   # ack fast; retries stop; work happens in the worker
```

The worker owns one retry policy for everything: max attempts, exponential backoff, dead-letter queue on exhaustion. Use one queue per failure domain rather than one giant queue, so a broken email job does not stall payment reconciliation. Record every job with its idempotency key and outcome, so run history is queryable instead of reconstructed from log files at 2am.

## What to do next

1. List every recurring job you own with its interval and worst-case runtime. Anything whose runtime can exceed its interval gets a lock this week.
2. Add a `processed_jobs` table with a unique key column and route every webhook and queue consumer through it. This single change removes most duplicate-side-effect bugs.
3. Move webhook handlers to ack-then-enqueue. Return 2xx in under a second and do the work in a worker.
4. Point each cron job at a heartbeat monitor and alert on missed pings, not on lines that look scary in the log.
5. If the queue is healthy but you cannot see what ran, when, or why it failed, a run-history dashboard helps. Cowork Pro ($59 one-time) is a dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history. Use it for visibility, not as a replacement for your broker.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=blog&utm_medium=article&utm_campaign=cron-queue-event-trigger-scheduler) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
