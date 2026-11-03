---
title: "Design a Dashboard Refresh That Never Goes Stale"
description: "A practical guide to timestamps that mean something, source-health checks, and a written rule for when a dashboard must stop trusting its own numbers."
date: "2026-11-03T08:00:00+08:00"
draft: false
slug: "dashboard-refresh-never-goes-stale"
author: "Wayne Chang"
tags: ["dashboards", "data-freshness", "observability", "etl", "monitoring"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/etf-dashboard"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-ETF"
product_category: "Software > Finance"
product_currency: "USD"
seo_title: "Design a Dashboard Refresh That Never Goes Stale"
faq:
  - q: "Should staleness be measured from the source timestamp or from my fetch time?"
    a: "Both, but for different decisions. The source timestamp tells you whether the numbers are old; fetch time only tells you whether your job is running. A job running every five minutes can still serve week-old data indefinitely."
  - q: "How do I pick a warn threshold that is not arbitrary?"
    a: "Measure the publisher's normal delay for that specific source, then set warn at roughly 1.5x and block at 2-3x. A single global rule such as 24 hours will misfire on weekly or monthly feeds."
  - q: "Is hiding the numbers worse than showing old ones?"
    a: "Only if the state is unlabeled. Keep the last known good snapshot visible with its own timestamp and an explicit untrusted label. The failure to avoid is old numbers that look current."
---

A dashboard that shows yesterday's prices behind a confident green badge is worse than no dashboard, because you will act on it. The fix is not more charts. It is three pieces of plumbing: a timestamp that records when the data was true, a health check that runs against the source rather than the HTTP connection, and a written rule for how old a number may be before the screen stops pretending. None of it is hard, but all of it has to exist before the first stale morning.

## Three clocks, and only one of them is honest

Most dashboards stamp the render time. That number is always fresh, which makes it useless for judging the numbers sitting next to it.

| Clock | Question it answers | Where it comes from |
| --- | --- | --- |
| `render_ts` | When did this screen load? | Server or browser, at request time |
| `fetch_ts` | When did my job last pull the source successfully? | Your pipeline, written at write time |
| `source_ts` | As of when was this data true? | The newest `as_of` or `trade_date` in the payload |

`source_ts` is the only one that says anything about the numbers. `fetch_ts` says whether your job is running. `render_ts` says whether the browser is alive. A job that runs perfectly every five minutes can still serve week-old prices, and that is precisely the failure a render timestamp conceals.

Make `source_ts` a real column on every row, not a line in a changelog. Take it from the publisher's own as-of field when one exists; when it does not, derive it from the batch date and mark it as derived so nobody mistakes it for an official date. Write ISO-8601 with an explicit offset, `2026-02-13T13:30:00+08:00`, and render it in the exchange's local time with the timezone spelled out. "08:30" is not a timestamp; it is a guess about which 08:30.

## Health-check the source, not the connection

An HTTP 200 with an empty body is the classic dashboard failure, and no uptime monitor will catch it because nothing technically went down. Check the payload itself on every run:

- **Row count** inside the band you expect for that source.
- **Advance**: the newest `source_ts` is strictly greater than the previous run's.
- **Schema**: required keys are still present, because publishers rename columns.
- **Digest**: a hash of the values differs from last run, which catches a feed re-serving the same payload with a fresh `200`.
- **Plausibility**: no nulls in the price column, no negative values, no `source_ts` in the future.

```python
# fetch_source.py - run inside the scheduled job, write one status row per run
from datetime import datetime, timezone
import hashlib, json

REQUIRED = ['as_of', 'close', 'volume']

def stamp_and_check(name, rows, previous):
    status = {
        'source': name,
        'fetch_ts': datetime.now(timezone.utc).isoformat(),
        'row_count': len(rows),
        'source_ts': max((r['as_of'] for r in rows), default=None),
        'state': 'ok',
    }
    if not rows:
        status['state'] = 'empty'
        return status
    missing = [k for k in REQUIRED if k not in rows[0]]
    if missing:
        status['state'] = 'schema_drift'
        status['detail'] = missing
        return status
    digest = hashlib.sha256(
        json.dumps([r['close'] for r in rows]).encode()
    ).hexdigest()[:12]
    status['digest'] = digest
    if digest == previous.get('digest'):
        status['state'] = 'frozen'          # 200 OK, identical payload
    if status['source_ts'] <= previous.get('source_ts', ''):
        status['state'] = 'no_advance'      # newest row did not move
    return status
```

Run these checks inside the fetch job and write a `source_status` row on every run, failures included. The dashboard reads that table. Do not let the renderer re-derive freshness from the data itself: an empty table and a table untouched for three days look identical from the outside, and only one of them is a problem. This is the same discipline as logging input, decision and output in an automation workflow, covered in [/blog/add-observability-to-a-workflow-log-input-decision-output/], applied to data instead of agent steps.

## Write the staleness rule down before you need it

Staleness is a policy, not a property of data. Prices that lag 20 hours are normal; a dividend calendar that lags 20 hours is early. So the threshold belongs next to the source definition, in a file you commit:

```yaml
# freshness.yaml - one block per source, versioned with the code
sources:
  daily_price:
    expected_lag: 18h      # normal publisher delay after close
    warn_at: 28h
    block_at: 60h
    min_rows: 100
  dividend_calendar:
    expected_lag: 168h     # published weekly
    warn_at: 240h
    block_at: 480h
    min_rows: 1
```

Three numbers per source, not one. `expected_lag` is the publisher's normal delay, measured rather than assumed. `warn_at` is roughly 1.5x that, `block_at` is 2-3x. A single global rule like "24 hours is stale" will either scream every weekend or never fire at all. Keep this file stable when you change the fetch layer, the same way you would isolate one layer of a stack as described in [/blog/upgrade-one-layer-of-your-ai-stack-without-breaking-the-rest/].

## Delayed is not wrong, and the UI has to say which

These are two different failures and they need different screens.

| State | What is true | What the reader sees |
| --- | --- | --- |
| Fresh | `source_ts` within `expected_lag` | Numbers, plus the source timestamp |
| Delayed | Source advanced, but lag is past `warn_at` | Amber banner with lag and `source_ts`; numbers stay |
| Untrusted | No advance past `block_at`, or any health check failed | Series hidden or greyed, with last-good timestamp |

A delayed feed is old but real: a public holiday, a slow publisher, a backfill still running. Those rows are correct for the moment they describe, so keep showing them and make the lag loud. An untrusted feed may be wrong, not merely old: the job died silently, the schema changed, the payload froze. Those numbers should not be readable at a glance, because the whole point is to interrupt you.

The most dangerous case sits between the two. A feed stops advancing on Friday afternoon and stays under `block_at` all weekend, so it renders as fresh for two days. Fix that by counting consecutive runs with no advance and escalating on the count, independent of the clock.

Keep a last-known-good snapshot with its own `source_ts` attached. An untrusted panel should read "last good: 2026-02-11 13:30 +08:00, 3 days old" rather than going blank, so you can tell whether the problem is minutes or days old. And alert from the status table, not from the page:

```bash
#!/usr/bin/env bash
# exit non-zero when any source is delayed or untrusted; cron/CI alerts on that
set -euo pipefail
curl -fsS "$HEALTH_URL" \
  | jq -e '[.sources[] | select(.state != "fresh")] | length == 0' > /dev/null
```

Wire that into cron or CI so a non-zero exit is the alert itself, then test it by pointing the job at a cached fixture and watching the alarm fire on purpose.

## What to do next

1. Add `source_ts` and `fetch_ts` columns to the table that feeds the dashboard, backfill what you can, and mark derived timestamps as derived.
2. Move the five health checks into the fetch job and write a `source_status` row on every run, including failures. The dashboard reads that table only.
3. Commit a `freshness.yaml` with `expected_lag`, `warn_at`, `block_at` and `min_rows` per source. Measure `expected_lag` from your own history instead of picking a round number.
4. Ship the three-state renderer. Untrusted hides the series by default, delayed shows an amber banner, fresh shows the source timestamp next to the number.
5. Add one alert on consecutive runs with no advance, and verify it by breaking a source deliberately.

If you would rather not build the price and dividend side yourself while you wire this up, ETF Dashboard is a Taiwan-ETF analytics workbench: price and dividend data, technical indicators and backtesting in one dashboard. It is $29 USD, one-time, at https://slashmaster6.gumroad.com/l/etf-dashboard.

## Get ETF Dashboard

[**ETF Dashboard**](https://slashmaster6.gumroad.com/l/etf-dashboard?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=dashboard-refresh-never-goes-stale) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/etf-dashboard/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
