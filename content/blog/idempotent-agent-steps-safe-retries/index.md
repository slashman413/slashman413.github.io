---
title: "Idempotent Agent Steps: Making Retries Safe by Default"
description: "How to make agent steps safe to retry: idempotency keys, run-id dedupe, ordering side effects after the commit point, and replay tests."
date: "2026-09-20T08:00:00+08:00"
draft: false
slug: "idempotent-agent-steps-safe-retries"
author: "Wayne Chang"
tags: ["idempotency", "agents", "reliability", "retries", "automation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-ADS"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Idempotent Agent Steps: Making Retries Safe by Default"
faq:
  - q: "What is the difference between an idempotency key and a dedupe key?"
    a: "They are usually the same value doing the same job. An idempotency key is the key your step checks before acting; a dedupe key is the same key used by a downstream consumer or queue to recognise a repeat delivery. Both must be derived from the intent, not from the current attempt."
  - q: "Should the idempotency key live in the database or in memory?"
    a: "In durable storage that survives a process restart, with a unique constraint on the key column. An in-memory cache or Redis instance without persistence only protects against retries within the same process lifetime, which is where duplicate sends come from."
  - q: "How long should I keep idempotency keys?"
    a: "At least as long as any client or queue could redeliver the step, plus a margin. Payment APIs typically expect 24 hours; long-running agent runs with manual retries need weeks. Deleting keys early reintroduces exactly the bug you added them to prevent."
---

A retry is the cheapest reliability feature you can bolt onto an agent step, and the fastest way to send the same invoice twice. Timeouts, 429s and container restarts all push the orchestrator into "try again", and none of them tell the step whether the first attempt already did its work. Idempotency makes that question irrelevant: the step can run as often as it likes, and the outside world only sees the effect once.

## Retries corrupt state in four predictable ways

Agent steps fail non-idempotently in a small number of recognisable patterns:

- **Duplicate sends.** The step calls an email or chat API, the response is slow, the orchestrator retries on timeout, and the recipient gets two copies.
- **Double charges.** A payment call succeeds but the network drops the response. From the step's point of view the call failed; from the ledger's point of view it did not.
- **Overwritten files.** An agent writes `report.md` from a partial run, the run is retried, and the second attempt clobbers the first with worse output. Last write wins and the good version is gone.
- **Duplicated rows and fan-out.** One retry of a step that loops over a batch produces the batch twice, because the loop restarts from zero and nothing downstream recognises the first pass.

The root cause is usually the same: the effect and the record of the effect are two separate writes, and only one of them is durable. If the effect goes to Stripe and the record goes to your database, a crash between them guarantees that a retry duplicates whichever one landed first. No ordering fixes that on its own, which is why the dedupe key comes first. This is the same class of problem covered in [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/), only at the level of a single step instead of a whole pipeline.

## An idempotency key is a contract, not a trick

The contract is simple: before doing anything observable, the step computes a key that identifies the intent, checks whether that key has already been executed, and either returns the stored result or does the work and stores the result next to the key. Two rules matter more than the storage engine.

1. The key must describe the intent, not the attempt. A `uuid4()` generated inside the step is the classic self-defeating choice, because every retry looks like brand new work.
2. The key must outlive the retry window. A key that expires in five minutes while your queue redelivers after ten has been silently deleted, not honoured.

A minimal store looks like this:

```python
import hashlib, json

def step_key(run_id: str, step: str, payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{run_id}:{step}:{canonical}".encode()).hexdigest()

def run_once(conn, key: str, fn):
    row = conn.execute(
        "SELECT result FROM idempotency WHERE key = ?", (key,)
    ).fetchone()
    if row:
        return json.loads(row["result"])      # replay: no work performed

    result = fn()                               # do the work exactly here
    conn.execute(
        "INSERT OR IGNORE INTO idempotency (key, result, created_at)"
        " VALUES (?, ?, datetime('now'))",
        (key, json.dumps(result)),
    )
    conn.commit()
    return result
```

Two implementation details bite in production. First, check-then-write is a race: two workers can both read an empty result. Make the key column a primary key or unique index and treat the insert conflict as "someone else won" — re-read the stored row rather than raising. Second, store the full result, not a boolean. A boolean forces every caller to invent a return value for the replay path, and those inventions drift.

## Dedupe on the run id, not on wall-clock time

The most reliable key you can build is `run_id + step_name + hash(canonical_inputs)`. The run id is minted once at the start of the run and carried through step context, queue message metadata and downstream HTTP headers.

| Key source | Stable across retries | Stable across restarts | Failure mode |
|---|---|---|---|
| `uuid4()` per call | no | no | Every retry is treated as new work |
| Wall-clock timestamp | no | no | Keys differ by seconds, dedupe never hits |
| Request id from the edge | sometimes | yes | Client retries arrive as new upstream requests |
| `run_id + step + input hash` | yes | yes | Requires discipline when resuming vs starting fresh |

One rule keeps this honest: resuming a crashed run must reuse the run id, and genuinely new work must get a new one. Getting that backwards turns dedupe into silent data loss, because real work gets swallowed and reported as already done.

LLM steps add a wrinkle. The rendered prompt is not a stable input — if the template interpolates a timestamp, a session id or the current date, the hash changes on every attempt and the key never matches. Hash the canonical inputs (the user request, document ids, model name, temperature) and treat the rendered prompt as a derived value. If you want the model to actually re-run on a new attempt, that is a deliberate choice, not something a stray `f"{datetime.now()}"` should decide for you.

## Order side effects after the point of no return

Every step has a point of no return: the moment an effect becomes observable outside your process. Everything before that point should be pure computation that is cheap to repeat. The shape to aim for is read, decide, commit, emit — in that order, with only the last step touching the outside world.

The outbox pattern makes the ordering enforceable:

```yaml
step: send_invoice
idempotency:
  key: "${run_id}:send_invoice:${invoice_id}"
  store: postgres://app/idempotency
  ttl: 30d
side_effect:
  mode: outbox              # write intent, dispatch separately
  table: outbox
  provider_header: Idempotency-Key   # honoured by Stripe and most payment APIs
retry:
  max_attempts: 5
  backoff: exponential
  on_conflict: return_stored_result
```

The transaction writes the intent row and the state change together. A separate dispatcher reads pending rows, calls the provider with the idempotency key, then marks the row done. If the process dies after the call but before the mark, the dispatcher retries — and the provider recognises the key and returns the original charge instead of creating a second one. This is the same reasoning behind [placing approval gates before irreversible actions](/blog/approval-gates-agent-workflow/): decide cheaply, act once, record durably.

If a provider has no idempotency key support, you become the dedupe layer, which means you must own the send for that provider and never let two processes call it concurrently. File writes have the same shape. Either write to a temporary path and rename atomically, or sidestep the problem with versioned names like `report-<run_id>.md` so overwriting is structurally impossible and the "latest" pointer is just metadata.

## Test the step twice without doing its work twice

The test you want is not whether the step works, but whether it behaves identically the second time. Build a fake sink that records calls in memory and inject it:

```python
def test_step_is_safe_to_replay(fake_sink):
    ctx = {"run_id": "run_42"}
    payload = {"id": "inv_9", "amount_cents": 2000}

    first = execute_step(ctx, invoice=payload)
    second = execute_step(ctx, invoice=payload)

    assert first == second                      # replay returns stored result
    assert fake_sink.charges == ["inv_9"]       # one effect, not two
```

Extend that into a replay test: after the first successful run, execute the step several more times and assert the sink length is unchanged. Then cover the crash window by killing the process between commit and emit and asserting the dispatcher produces exactly one effect.

A dry-run flag only counts if it routes through the same code path with the sink swapped. An early `if dry_run: return` at the top of the function tests nothing, because the real path never executes it. Treat dry-run as a dependency injection point, not an escape hatch. If you are still deciding where automation should be allowed to run unattended, the broader framework in the [ultimate AI automation guide](/blog/ultimate-ai-automation-guide-2026/) covers the surrounding decisions.

## What to do next

1. List the irreversible steps in your system — charges, sends, publishes, deletes, file overwrites. Everything else can be retried freely, so this list is your real work surface.
2. Ship an `idempotency` table with a unique key column, a result column and a created-at column, and run the migration this week rather than in the middle of an incident.
3. Take one direct send and move it to the outbox pattern above, including the provider idempotency header, so the decision to retry stops living in application code.
4. Add the replay assertion to CI for one step and watch it fail before you fix it — that failure is cheaper than the duplicates you have not noticed yet.
5. If you would rather start from a working skeleton than assemble the pieces yourself, the AI Developer Stack Bundle ($79, one-time) collects a prompt library, an agent framework, deployment tooling and tutorials that are pre-configured to work together, which is a reasonable base to apply these patterns to.

## Get AI Developer Stack Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=blog&utm_medium=article&utm_campaign=idempotent-agent-steps-safe-retries) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-dev-stack/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
