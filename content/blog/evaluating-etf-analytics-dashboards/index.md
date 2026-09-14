---
title: "What to Look For in an ETF Analytics Dashboard"
description: "A buyer's checklist for ETF analytics tools: data provenance, dividends and total return, survivorship bias, indicator correctness, and export."
date: "2026-09-14T08:00:00+08:00"
draft: false
slug: "evaluating-etf-analytics-dashboards"
author: "Wayne Chang"
tags: ["etf", "backtesting", "data-quality", "analytics", "taiwan"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/etf-dashboard"
product_price: "199"
product_brand: "Slashman Tools"
product_sku: "SMT-ETF"
product_category: "Software > Finance"
product_currency: "USD"
seo_title: "What to Look For in an ETF Analytics Dashboard"
faq:
  - q: "Should indicators be calculated on adjusted or unadjusted prices?"
    a: "Total-return series keep signals clean across ex-dates, while raw prices match the levels you actually trade at. The important thing is that the tool states which series it uses and lets you switch between them."
  - q: "Why does survivorship bias matter for ETF backtests?"
    a: "ETFs get merged, liquidated or delisted. If the tool builds its universe from funds listed today, those failures vanish from history and the backtest looks better than it could have been in real time."
  - q: "What is the minimum export format worth accepting?"
    a: "Machine-readable CSV or Parquet with ISO timestamps, an adjusted/raw flag, a currency and source column, plus a config hash and data as-of date so a run can be reproduced later."
---

Most ETF analytics tools open with the same screenshot: a candlestick chart, two moving averages, and a backtest equity curve that only goes up. None of that tells you whether the numbers are reproducible, or whether the backtest would have survived the ETFs that no longer trade. Below is a checklist you can run against a tool before you pay for it.

## Data provenance and update cadence

Provenance is the question a landing page never answers. Ask where a daily bar actually comes from, and keep pushing until you get a named source: an exchange disclosure feed, a commercial vendor, or a scraper pointed at a public chart page. Each fails differently.

| Source type | Typical failure mode | What to verify |
|---|---|---|
| Exchange / official disclosure site | Corporate actions and distributions must be parsed separately; fetch jobs break quietly | As-of date per ticker; a dividend table with ex-dates, not just a chart |
| Commercial vendor feed | Silent revisions to historical values; licence limits on redistribution | Revision policy; whether the raw vendor payload is retained |
| Scraped chart page | Layout changes break the fetch; adjusted values are undocumented | Whether the series is price or total return, and who says so |

Cadence matters as much as origin. A tool that refreshes once a day after close is fine for swing analysis; one that shows delayed intraday quotes should label the delay explicitly. Ask for a status page or a last-successful-refresh timestamp per dataset. Then ask the awkward questions: what happens to a fund that is suspended for weeks, and what happens to one that is being terminated? If delisted tickers simply disappear from the universe, your backtest is already biased before you write a single rule.

There is also a calendar problem. Taiwan trades 09:00 to 13:30 local time. If the refresh job is driven by a US market calendar, it will skip Taiwan-only trading days and may insert bars for dates when nothing traded locally. Run a gap check against the official trading calendar rather than trusting a row count:

```python
import pandas as pd

def missing_sessions(bars: pd.DataFrame, calendar: pd.DatetimeIndex) -> list[str]:
    """bars: index = session date (Asia/Taipei), calendar: official trading days."""
    have = pd.DatetimeIndex(bars.index).normalize().unique()
    return [d.strftime("%Y-%m-%d") for d in calendar.difference(have)]

def stale_tail(bars: pd.DataFrame, max_lag_days: int = 3) -> bool:
    """True when the newest bar is older than expected (holiday-aware checks aside)."""
    return (pd.Timestamp.today().normalize() - bars.index.max()).days > max_lag_days
```

## Dividend, splits and total return

This is where most dashboards quietly become wrong. Price return only tracks the close. Total return adds distributions back on the ex-date, chained multiplicatively, so that a 5 percent yield fund does not look like it fell 5 percent every time it paid out.

The formula is not exotic. For each ex-date, `R_t = (P_t + D_t) / P_{t-1} - 1`, then compound the series:

```python
import pandas as pd

def total_return_index(close: pd.Series, dividends: pd.Series) -> pd.Series:
    """Both series indexed by ex-date; dividends fill missing dates with 0."""
    dist = dividends.reindex(close.index, fill_value=0.0)
    r = (close + dist) / close.shift(1) - 1
    r.iloc[0] = 0.0
    return (1 + r).cumprod()
```

What to check in the product, not the formula:

- Is there a switch between price return and total return for both the chart and the backtest, or only for one of them?
- Does the dividend table carry ex-date, pay-date, amount and a type flag (cash distribution versus return of capital)? Funds differ, and lumping them together distorts yield figures.
- Are indicators computed on the adjusted series or the raw close? A 200-day average drawn through unadjusted prices will step down on every ex-date, which produces false oversold signals that a backtest then trades on.
- Is the choice documented in the export, or do you have to guess from column names? See how other tool evaluations frame this kind of comparison in our [workflow tool breakdown](/blog/zapier-vs-n8n-vs-ai-workflow-builder/).

## Survivorship bias and backtest honesty

The most common reason a backtest looks good is that the losing funds were removed from history. An ETF that was merged, liquidated or delisted is invisible in a universe built from today's listings. Point-in-time universes cost more to maintain, which is exactly why you should ask whether the tool has one.

Look for four things in the backtest configuration. First, listing status filters that include terminated funds. Second, size or liquidity filters applied at each rebalance date rather than against today's assets under management. Third, an explicit execution model, because a signal computed on the close of day t and filled at that same close is not tradable. Fourth, a reproducibility block, so a run can be repeated months later and diffed.

```yaml
universe:
  source: point_in_time
  listing_status: [listed, delisted, terminated]
  min_aum_twd: 2000000000   # applied at each rebalance date, not today
  include_leveraged: false
period:
  start: 2015-01-01
  end: 2025-12-31
execution:
  fill: next_open            # trade after the signal bar, not on it
  slippage_bps: 15
  fee_bps: 5
  dividend_reinvestment: true
reproducibility:
  emit_config_hash: true
  emit_data_asof: true
```

If a tool cannot emit the config hash and the data as-of date alongside the equity curve, treat the curve as a demo, not a result.

## Indicator correctness you can verify

Indicator names are shared; indicator implementations are not. Four places where tools silently diverge:

1. **EMA seeding.** Some libraries seed with a simple average of the first n values, others with the first value. On a 200-period EMA over a few years of data, the two versions stay apart for a long time. Ask which one a tool uses, or check the first few hundred values yourself.
2. **RSI smoothing.** Wilder's smoothing (alpha = 1/n) and a plain average of gains and losses both get labelled RSI(14) and produce different numbers.
3. **MACD signal line.** EMA of MACD versus a simple average of MACD is a real difference, and the default is rarely stated.
4. **Look-ahead.** Any signal that uses the same bar's close to enter at that close is untradeable. Check for a next-open fill option and whether it is on by default.

The verification method is boring and effective: build a fixture of a few hundred fixed bars, pin the expected SMA, EMA, RSI and MACD values, and diff every tool against it. A tool that cannot reproduce your fixture should not be trusted with arrows on a chart.

## Export, schema and lock-in

You will eventually want the data outside the dashboard. Accept CSV or Parquet with ISO 8601 timestamps, an explicit adjusted/raw flag, a currency column, a source column and an as-of column. Require stable column names across releases, or a schema version you can check. Backtest artifacts should include trades, positions, the equity curve and the config hash.

Red flags: export limited to a screenshot, values that round to two decimals for TWD but lose precision in the API, no machine-readable dividend table, and licence terms that forbid you from publishing or redistributing anything you computed. If you plan to feed exports into a larger pipeline, the plumbing patterns in our [automation guide](/blog/ultimate-ai-automation-guide-2026/) apply directly.

## What to do next

1. Build the fixture first. Take a fixed slice of daily bars, hard-code the expected SMA, EMA, RSI and MACD values, and keep it as a test file. Every tool you trial gets diffed against it.
2. Ask three questions of any vendor: name your data source, state your revision policy, and show me the dividend table with ex-dates. Vague answers are answers.
3. Run the gap and staleness checks above against a raw CSV export, not the UI, and compare against the official trading calendar for the market you trade.
4. Re-run one backtest twice with the same config and check that the equity curve is identical. If it is not, find out why before you trust any of it.
5. Check the price against the maintenance cost. A one-time fee with no data subscription is a different commitment than a monthly seat. If you work with Taiwan-listed ETFs, ETF Dashboard is one example to benchmark against: a $199 one-time Taiwan-ETF analytics workbench that puts price and dividend data, technical indicators and backtesting in one dashboard. Test it with your fixture, your gap check and your export requirements, and see how it answers the questions above.

## Get ETF Dashboard

[**ETF Dashboard**](https://slashmaster6.gumroad.com/l/etf-dashboard?utm_source=blog&utm_medium=article&utm_campaign=evaluating-etf-analytics-dashboards) — **$199**, one-time payment, instant download. See the full breakdown on the [review page](/blog/etf-dashboard/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
