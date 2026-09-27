---
title: "Respecting Remote APIs: Backoff, Queues and Caching"
description: "How to treat remote APIs as shared resources: jittered exponential backoff, queues for backpressure, caching stable responses, batching and concurrency caps."
date: "2026-09-27T08:00:00+08:00"
draft: false
slug: "respecting-remote-apis-backoff-queues-caching"
author: "Wayne Chang"
tags: ["api", "backoff", "caching", "queues", "reliability"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-ADS"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Respecting Remote APIs: Backoff, Queues and Caching"
faq:
  - q: "How long should I wait between retries?"
    a: "Start with a small base delay, double it per attempt, cap it around 30 seconds, and randomize the whole interval (full jitter). Always prefer a Retry-After header when the server sends one."
  - q: "Should I retry a 429 response?"
    a: "Yes, but only after the delay the server asks for, and through a limiter so retries from all workers are not synchronized. Never retry 400, 401, 403, 404 or 422 responses."
  - q: "Is caching API responses safe?"
    a: "Only if the response is not user-specific and the key includes everything that changes the answer, such as URL, params, tenant and model version. Honor Cache-Control and ETag, and treat per-tenant caches as sensitive data."
---

Every outbound HTTP call your service makes spends someone else's capacity. When your code retries in a tight loop, ignores 429s, or fans out a thousand parallel requests, you are drawing on a shared resource that other tenants depend on, and you are usually the first to get blocked. The fixes are unglamorous: jittered backoff, a queue, a cache, a concurrency cap, and logs that show throttling as a number rather than a mystery.

## The retry storm you build by default

A fixed `sleep(1)` between retries looks harmless until twenty workers share it. They fail together, wait together, and fire together, so the provider sees the same spike again, one second later. Retries also multiply across layers: three attempts in the client, three in the job runner, three in the gateway is 27 requests for one logical call. If your retry policy lives in more than one place, you have already lost track of it.

The other half of the problem is retrying things that should never be retried. Retry only on 429, 5xx, connection errors and timeouts. A 400, 401, 403, 404 or 422 will fail identically on attempt six, and now you have paid six times for the same rejection. Retrying a POST also risks duplicate writes unless the endpoint accepts an idempotency key. If it does not, retry the read path and reconcile the write path, or send the write through a queue that can persist and deduplicate it.

## Backoff with jitter, and reading Retry-After

Exponential backoff alone is not enough, because every client that starts failing at the same moment backs off by the same amount. Jitter breaks the synchronization. The simplest form that works well is full jitter: the wait is a random draw from zero to the exponentially grown ceiling.

```python
import random, time, httpx

RETRY_STATUS = {429, 500, 502, 503, 504}

def sleep_for(attempt, retry_after, base=0.5, cap=30.0):
    if retry_after:
        try:
            return min(float(retry_after), cap)   # seconds form
        except ValueError:
            pass                                  # HTTP-date form, use backoff
    return random.uniform(0, min(cap, base * 2 ** attempt))

def get_json(client, url, max_attempts=6, budget_s=90):
    started = time.monotonic()
    last = None
    for attempt in range(max_attempts):
        retry_after = None
        try:
            r = client.get(url, timeout=10.0)
            if r.status_code not in RETRY_STATUS:
                r.raise_for_status()
                return r.json()
            retry_after = r.headers.get("Retry-After")
            last = f"HTTP {r.status_code}"
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
            last = type(exc).__name__
        wait = sleep_for(attempt, retry_after)
        if time.monotonic() - started + wait > budget_s:
            raise TimeoutError(f"retry budget exhausted: {url} ({last})")
        time.sleep(wait)
    raise RuntimeError(f"gave up after {max_attempts} attempts: {url} ({last})")
```

Three details matter as much as the formula. First, `Retry-After` outranks your backoff; the server is telling you when it expects to be ready, and guessing lower is how you get escalated from throttled to blocked. Second, cap the total budget, not just the attempt count, so one slow endpoint cannot hold a worker for ten minutes. Third, retry inside one layer only. Pick the layer that owns the call and let the layers above it fail fast.

## A queue is backpressure, not a message bus

Backoff handles a single call. It does nothing for a burst of ten thousand jobs that all want to start now. That is a queue's job: it converts "fire everything" into a bounded worker pool running at a rate the downstream service can absorb. The main difference between a semaphore and a queue is durability; a semaphore dies with the process and takes the pending work with it.

| Approach | Survives restart | Backpressure | Extra infra | Good for |
|---|---|---|---|---|
| In-process semaphore | No | Yes, one process | None | One worker, a few endpoints |
| In-memory queue and workers | No | Yes | None | Bursty jobs you can afford to lose |
| Durable queue (Redis, SQS, Postgres) | Yes | Yes | Broker or a table | Anything that must not be dropped |
| Provider batch endpoint | Depends on provider | N/A | None | Bulk, latency-tolerant work |

Two queue habits prevent most incidents. Schedule the retry as a delayed message instead of sleeping inside the worker, so a throttled job frees its slot immediately. And send a job to a dead-letter queue after the last attempt rather than looping forever; a poison message that retries indefinitely is a slow denial of service against your own provider. The config belongs in one place:

```yaml
worker:
  queue: jobs:outbound
  concurrency: 4            # worker processes pulling jobs
  per_host_inflight: 2      # semaphore keyed by hostname
  rate_limit:
    tokens: 10              # burst allowance per host
    refill_per_second: 5
  retry:
    max_attempts: 6
    base_seconds: 0.5
    cap_seconds: 30
    jitter: full
    respect_retry_after: true
  visibility_timeout_seconds: 120
  dead_letter_after: 6
```

If your outbound work already runs through an agent loop, the queue discipline in the [AI automation guide](/blog/ultimate-ai-automation-guide-2026/) applies the same way.

## Cache what is stable, batch what is bulk, cap what is left

Caching is the cheapest way to reduce load, and the easiest to get wrong. Use HTTP caching where the provider supports it: an `ETag` plus a conditional request costs you a round trip but not a body.

```bash
curl -sS -H "If-None-Match: $ETAG" -D headers.txt \
  https://api.example.com/v1/catalog -o body.json
grep -q "304" headers.txt && echo "unchanged, no body transferred"
```

For local caches, the key must contain everything that changes the answer: URL, query params, tenant, and the model or version if the response is generated. Deterministic calls with temperature pinned to zero can be cached by a hash of the full request. Calls that depend on user context should not be cached at all unless the tenant is part of the key. `Cache-Control: no-store` from the provider means exactly that, and a cache keyed per tenant is holding credentials-adjacent data, so treat it like any other secret store.

Batching is the higher-leverage move when it is allowed. Embedding endpoints accept arrays, and most model providers offer a batch endpoint that trades turnaround time for cost and rate-limit headroom. Batching is also a common way to get throttled harder: an oversized batch fails as a unit, so chunk below the documented maximum and keep chunk sizes equal so retries are predictable. When a provider is hard-throttled, falling back to a smaller model for low-stakes calls often beats waiting, the same tradeoff covered in [swapping models on a single-GPU box](/blog/single-gpu-model-swap-without-downtime/).

Concurrency caps are the last line of defense. Keep a global in-flight limit, a per-host limit, and a token bucket for endpoints with published quotas. If the cap never binds in normal traffic, you have set it too high to protect anything.

## Logging throttling so it is visible

A throttling problem no one can see becomes a slow mystery. Emit a counter for every 429 and 503 by host and endpoint, a histogram of retry waits, queue depth, the age of the oldest job, in-flight requests per host, and cache hit ratio. Log one structured line per retry with `host`, `endpoint`, `status`, `attempt`, `retry_after`, `wait_ms` and the provider's request id. Alert on a sustained rate over a window, not on a single retry, because single retries are normal and paging on them trains people to ignore the alert. The triage habits in [handling automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/) apply here: a dashboard showing throttling next to queue depth tells you whether you are being paced or being rejected.

## What to do next

1. Grep for every retry loop in your codebase and delete all but one per call path. Put the remaining policy behind a single function with jitter, a cap and a total budget.
2. Add `Retry-After` handling and make every 429 increment a counter you can graph, tagged by host.
3. Move burst-prone jobs behind a durable queue, schedule retries as delayed messages, and add a dead-letter path after the final attempt.
4. Cap concurrency per host, then check whether the cap ever binds. If it does not, lower it until it does at peak.
5. Add conditional requests or a keyed local cache for your two most frequent read endpoints, and log the hit ratio.

If you would rather start from something already assembled, the AI Developer Stack Bundle ($79, one-time) packages a prompt library, an agent framework, deployment tooling and tutorials that are pre-configured to work together.

## Get AI Developer Stack Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=blog&utm_medium=article&utm_campaign=respecting-remote-apis-backoff-queues-caching) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-dev-stack/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
