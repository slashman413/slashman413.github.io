---
title: "What Data Freshness Means for a Dashboard Decision"
description: "How to reason about staleness in dashboards: source update times, timezone effects, end-of-day versus intraday, and which decisions are safe on stale data."
date: "2026-10-12T08:00:00+08:00"
draft: false
slug: "data-freshness-dashboard-decisions"
author: "Wayne Chang"
tags: ["data-freshness", "dashboards", "timezones", "decision-making"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/etf-dashboard"
product_price: "199"
product_brand: "Slashman Tools"
product_sku: "SMT-ETF"
product_category: "Software > Finance"
product_currency: "USD"
seo_title: "What Data Freshness Means for a Dashboard Decision"
faq:
  - q: "How do I know if my dashboard data is too stale?"
    a: "Compare the data's event time to the decision's tolerance, not to the dashboard refresh rate. If acting on the data is reversible and cheap, you can tolerate more staleness; if it is irreversible or expensive, set a tighter threshold."
  - q: "Should I use end-of-day or intraday data for backtesting?"
    a: "Use end-of-day data for daily-bar backtests and long-horizon signals, because it is finalized and adjusted. Intraday data is better for execution research, but it is provisional and requires careful timestamp alignment."
  - q: "Why do timezones matter for daily data?"
    a: "A daily bar labeled with the same calendar date in two timezones covers different UTC windows. Joining or comparing them by date string can shift one series by a day, especially around market holidays and daylight saving changes."
---

A dashboard decision is only as good as the age of the data behind it. Staleness is not a single number; it is a relationship between an upstream update schedule and the cost of acting on old information. This guide gives you a practical way to reason about source update times, timezone boundaries, end-of-day versus intraday data, and which decisions can safely run on stale data.

## Staleness Is a Decision Property, Not a Dashboard Property

Most teams treat freshness as a dashboard setting: refresh every five minutes, or every hour. That is backwards. The question is not how fresh the dashboard is, but how fresh the data must be for the decision you are about to make. A long-term allocation review can tolerate a week-old price. A stop-loss trigger cannot tolerate a minute-old price if the market moved.

Classify each decision before you set a threshold. Operational decisions affect something now: paging an on-call engineer, halting a job, sending an alert. Tactical decisions affect the next few days or weeks: rebalancing a portfolio, adjusting a budget, changing a campaign. Strategic decisions affect quarters: changing an allocation model, entering a market, rewriting a policy. Reporting decisions explain the past: monthly revenue, tax lots, compliance summaries.

The table below is a starting point. The exact numbers depend on your sources and your tolerance for being wrong.

| Decision class | Example question | Typical source cadence | Safe staleness | Main failure mode |
| --- | --- | --- | --- | --- |
| Operational | Should we page on-call? | Metrics every few seconds | Seconds to a few minutes | False alert or missed incident |
| Tactical | Should we rebalance this week? | Daily close | One trading day, if no boundary crossed | Acting on a price that will be revised |
| Strategic | What is our long-term allocation? | Monthly or quarterly | Days to weeks | Slow reaction, but rarely wrong from staleness |
| Reporting | What did we earn last month? | Batch after close | Until corrections settle | Reconciling against a provisional number |

If you are deciding whether to build the freshness check as a script or a workflow, see [Workflow Builder vs a Plain Script: When Each Is the Right Tool](/blog/workflow-builder-vs-plain-script/).

## Source Update Times, Timezones, and the Three Timestamps

Every data source has an update contract, even if it is undocumented. A market data feed may publish a final close after the exchange closes. A bank CSV may arrive by email at an unknown hour. An internal service may write to a table continuously but only commit every fifteen minutes.

You need three timestamps, not one. Event time is when the thing happened. Ingest time is when your system received it. Query time is when you read it. If you only look at query time, you cannot tell whether the source stopped updating or you are querying before the source's daily batch.

Timezones turn this into a trap. A daily bar labeled 2025-01-02 in Asia/Taipei covers a different UTC window than a daily bar labeled 2025-01-02 in America/New_York. If you join them by date string, you can shift one series by a day. Daylight saving time adds another boundary. Use IANA timezone names like Asia/Taipei and America/New_York, not fixed offsets like UTC+8.

A minimal SQL freshness check looks like this:

```sql
-- event_time and ingest_time should be timestamptz, not naive timestamp
SELECT
  source,
  max(event_time) AS latest_event,
  max(ingest_time) AS latest_ingest,
  now() AS query_time,
  age(now(), max(event_time)) AS event_age,
  age(now(), max(ingest_time)) AS ingest_age
FROM market_data
GROUP BY source;
```

To see the source's local clock, convert at query time:

```sql
SELECT
  source,
  max(event_time AT TIME ZONE 'Asia/Taipei') AS latest_event_taipei,
  now() AT TIME ZONE 'Asia/Taipei' AS now_taipei,
  age(now(), max(event_time)) AS event_age
FROM market_data
GROUP BY source;
```

A cron check should run after the expected source update, in the source's timezone:

```bash
# Run after the Taiwan close, in Taipei time
CRON_TZ=Asia/Taipei
30 15 * * 1-5 /usr/local/bin/check_freshness --source twse_daily --max-age 1d
```

If the source updates at an unknown time, do not guess. Log the first and last ingest time per day for a week, then set the check after the observed window. That is not a performance measurement; it is a schedule discovery step.

## End-of-Day vs Intraday: Two Different Contracts

End-of-day data and intraday data are not the same product at different resolutions. They have different contracts. End-of-day data is usually finalized after the market closes. It may include dividends, splits, and corrections that arrive hours or days later. Intraday data is provisional. A last price at 14:59 may be a single trade with almost no volume, and the bar may change when later trades arrive.

This matters for decision classes. EOD data is safe for strategic allocation, dividend reinvestment planning, tax lot review, and backtesting that uses daily bars. Intraday data is necessary for execution, stop-loss triggers, intraday risk limits, and any alert that must fire before the next daily close.

The dangerous middle ground is a dashboard that mixes both without labeling them. If a tile shows a daily close from yesterday next to an intraday quote from today, a reader may assume both are current. Label every tile with its event time and timezone. If a source is EOD, say so. If it is intraday, show the last tick time, not the dashboard refresh time.

Another failure mode is joining daily series from different timezones by date. A Taipei daily bar and a New York daily bar for the same calendar date do not cover the same period. If your backtest assumes they do, your signals can be misaligned. Store event_time as timestamptz and convert to the exchange's local date only when you build the bar.

## How to Set Freshness Thresholds Without Fooling Yourself

A freshness threshold is a budget. Start with the source's expected update time and add a grace period for normal latency. Then compare that budget to the decision's tolerance. If the decision is reversible and cheap, you can tolerate more staleness. If it is irreversible or expensive, demand fresher data.

Put the budget in config, not in code comments. A YAML file per environment keeps the rules visible:

```yaml
freshness:
  twse_daily_close:
    timezone: Asia/Taipei
    expected_after: '15:30'
    grace: '45m'
    max_age_for_rebalance: '1d'
    max_age_for_tax_report: '7d'
  us_intraday:
    timezone: America/New_York
    expected_after: '09:30'
    grace: '5m'
    max_age_for_alert: '2m'
```

Then assert freshness before the decision runs. A small Python helper:

```python
from datetime import datetime, timezone

def assert_fresh(event_time, max_age_minutes, now=None):
    now = now or datetime.now(timezone.utc)
    age = (now - event_time).total_seconds() / 60
    if age > max_age_minutes:
        raise RuntimeError(f'stale data: {age:.1f}m old')
    return age
```

Do not monitor only the latest row timestamp. A source can stop updating and keep serving the same old row. Monitor the last successful ingestion per source, and alert when the expected update window passes. For triage habits, see [Triage Habits for Automation That Fails While You Sleep](/blog/triage-automation-failures-while-you-sleep/). To keep the alert from flapping, see [Tuning a Watchdog So It Does Not Flap](/blog/tuning-watchdog-without-flapping/).

Finally, write the decision class into the alert or automation. An alert that says 'stale data' is not actionable. An alert that says 'twse_daily_close is stale for the rebalance job; last event 2025-01-02 13:30 Asia/Taipei' tells the responder what decision is blocked.

## What to do next

- Map every dashboard tile to its upstream source, and record the source's expected update time in an IANA timezone.
- Add a freshness check that compares event_time, ingest_time, and query time before any automated action.
- Label each decision as operational, tactical, strategic, or reporting, then set max staleness per decision instead of per dashboard.
- Use EOD data for rebalancing, tax, and backtesting; reserve intraday data for execution and alerting.
- If you want a concrete workbench where these boundaries are visible, ETF Dashboard ($199 one-time) is a Taiwan-ETF analytics workbench that combines price and dividend data, technical indicators and backtesting in one dashboard.

## Get ETF Dashboard

[**ETF Dashboard**](https://slashmaster6.gumroad.com/l/etf-dashboard?utm_source=blog&utm_medium=article&utm_campaign=data-freshness-dashboard-decisions) — **$199**, one-time payment, instant download. See the full breakdown on the [review page](/blog/etf-dashboard/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
