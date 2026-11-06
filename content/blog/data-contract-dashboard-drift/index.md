---
title: "The Data Contract That Keeps a Dashboard From Drifting"
description: "A standing rule for dashboard data: every column has a meaning, a unit and a source, and changing any one of them is a versioned contract change."
date: "2026-11-06T08:00:00+08:00"
draft: false
slug: "data-contract-dashboard-drift"
author: "Wayne Chang"
tags: ["data-contracts", "dashboards", "data-quality", "etl"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/etf-dashboard"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-ETF"
product_category: "Software > Finance"
product_currency: "USD"
seo_title: "The Data Contract That Keeps a Dashboard From Drifting"
faq:
  - q: "What exactly counts as a data contract for a dashboard?"
    a: "A written record, per column, of the name, the meaning, the unit and the source field or transformation. Grain and null policy are usually part of it too, because joins and gaps are where silent errors start."
  - q: "How do I spot a source that changed units without telling anyone?"
    a: "Compare the median against a stored baseline and look at the ratio first. Values that land near 100, 1/100 or 24 point to a cents-versus-dollars or timezone change rather than a real shift in the underlying data."
  - q: "Do I need a dedicated data-contract tool to start?"
    a: "No. A YAML file next to the pipeline code plus a script that diffs column names, types and distributions catches most drift. Tooling matters once several teams write to the same tables and you need enforcement outside one repo."
---

Dashboards rarely break. They drift. A vendor starts sending cents where it used to send dollars, a form stops filling a currency field, an API quietly switches to UTC, and the chart keeps drawing a line that looks plausible. What stops this is not a better charting library; it is a written contract for every column that reaches the dashboard.

## Every column needs four facts

A column named `revenue` is a claim, not a fact. Four properties have to be written down before anyone can check the claim: name, meaning, unit, source.

**Name.** The least informative of the four, and the only one most dashboards have.

**Meaning.** One sentence a new hire can act on without asking a follow-up. "Revenue" is not a meaning. "Gross bookings, before refunds, recognised on the order date" is. If two people on the team answer "what does this include?" differently, the meaning is missing.

**Unit.** Currency, scale, denominator, and for anything time-based, the timezone. `close_price` is TWD per share. Volume is in shares, not lots — in Taiwan one lot is 1,000 shares, and that factor of 1,000 is a classic silent drift. Retention is a fraction, not a percentage. A unit that omits scale is half a unit.

**Source.** The system, the table or endpoint, the exact field, and the transformation applied. If you cannot name the field, you do not have a source; you have a habit.

Two more properties earn their keep as soon as a second feed appears: **grain** (one row per what — per symbol per trading day) and **null policy** (drop the row, carry the last value, or mark the period partial). Grain is where joins go wrong without anybody noticing.

## Write it where the pipeline can read it

A contract in a wiki rots in a quarter. A contract in the repo, parsed by a check that runs alongside the pipeline, stays honest because it fails loudly.

| Where the contract lives | Enforced on each run | Visible to dashboard readers | Catches a source change |
|---|---|---|---|
| Comment above the SQL | No | Only if they open the file | No |
| YAML file in the repo, parsed by a check script | Yes | If you print the version in the UI | Shape and unit heuristics |
| Field descriptions inside the BI tool | No | Yes | No |
| Warehouse schema tests | Yes, in CI | No | Yes, for the tests you wrote |

Start with the second row. It is the cheapest thing that both documents and enforces.

```yaml
# contracts/market_data/dividend_yield_daily.yml
contract: dividend_yield_daily
version: 1.2.0
grain: one row per (symbol, trade_date)
columns:
  symbol:
    meaning: ETF ticker as listed on the primary exchange
    unit: string, uppercase, no exchange suffix
    source: twse.daily_quotes.ticker (trim, upper)
  trade_date:
    meaning: Trading day the quote belongs to, local exchange date
    unit: date, Asia/Taipei, no time component
    source: twse.daily_quotes.date (parse %Y%m%d)
  close_price:
    meaning: Closing price, unadjusted for splits
    unit: TWD per share
    source: twse.daily_quotes.closing_price
    null_policy: drop row
  cash_dividend:
    meaning: Cash distribution per unit, on the ex-date
    unit: TWD per unit
    source: vendor.dividends.amount (vendor ships cents, divide by 100)
    null_policy: 0 only when ex_date == trade_date, otherwise null
freshness:
  max_lag: 1 trading day
```

The rule that makes this useful: any edit to `meaning`, `unit` or the `source` transformation is a contract change and gets a version note. Adding a column is a minor bump. Rewording that changes nothing observable is a patch. This is the same discipline as [versioning a template so buyers do not lose their customisations](/blog/selling-a-feishu-template-product/), applied to a table instead of a file.

## Adding a new source without bending the old contract

New feeds arrive with their own semantics while everyone is in a hurry, which is why they break contracts.

1. **Write the contract entry before the join.** Fill in meaning, unit and source for each column you intend to use, and leave anything unknown as `UNKNOWN`. Unknown fields in a merged commit are visible; unknown fields in someone's head are not.
2. **Resolve grain at the boundary.** If the new feed is per fund and the dashboard is per share class, map it in the ingest layer, not in the dashboard query. One grain per dashboard.
3. **Do not merge identically named columns until they agree.** Two vendors both ship `close_price`; that is two units until you show the series track each other on overlapping days.
4. **Choose the null policy explicitly.** Backfilled history from a second source is usually partial. Mark the range as partial instead of filling it silently; a gap you can see beats a number you cannot explain.
5. **Ship the version note in the same commit.** Major bump for anything that changes an existing meaning, unit or source; minor for additions.

Log the decision, not just the output. The pattern in [adding observability to a workflow](/blog/workflow-observability-log-input-decision-output/) — input, decision, output — applies to pipelines exactly as it does to agents.

## Catching drift when a source changes what it sends

Most source changes are announced to nobody. The goal is to make them break something small and early instead of something large and quiet. Start with the shape:

```bash
# fail the ingest if the source adds, drops or retypes a field
curl -s "$VENDOR_URL/dividends?date=latest" \
  | jq -r '.[0] | to_entries[] | "\(.key)\t\(.value|type)"' \
  | sort > "snapshots/dividends-$(date -u +%F).tsv"
diff -u snapshots/dividends-latest.tsv "snapshots/dividends-$(date -u +%F).tsv"
```

That catches renames and type flips. It does not catch the expensive case: same field name, same type, different unit. For that you check distributions against a stored baseline.

```python
# checks/drift.py — run after ingest, before the dashboard query
import statistics

def drift(rows, contract, baseline):
    problems = []
    for name, meta in contract["columns"].items():
        if name not in rows[0]:
            problems.append(f"{name}: column disappeared")
            continue

        # a unit change keeps the name and the type; only the shape moves
        median = statistics.median(r[name] for r in rows if r[name] is not None)
        was = baseline.get(name, {}).get("median")
        if was and not 0.2 < median / was < 5:
            problems.append(f"{name}: median {was} -> {median}")

        nulls = sum(r[name] is None for r in rows) / len(rows)
        if nulls > meta.get("max_null_rate", 0.0):
            problems.append(f"{name}: null rate {nulls:.0%}")

        distinct = len({r[name] for r in rows})
        if name in baseline and distinct < baseline[name]["distinct"] / 2:
            problems.append(f"{name}: collapsed to {distinct} values")
    return problems
```

When a check fires, look at the ratio before you look at the chart. A jump that lands near 100, 1/100 or 24 is a unit or timezone change, not a business event. A null rate stepping from near zero to a third is usually a required field that became optional upstream. Only after ruling those out do you go hunting for a real change in the world.

Two supporting habits. Keep a raw landing zone, because if you store only normalised values you cannot rebuild history after a contract fix or prove what the source actually sent. And print the contract version in the dashboard footer, so a reader can match what they see to what you promised.

## What to do next

1. Pick the one dashboard people argue about. List every column it reads from a source.
2. For each column, write meaning, unit and source into a YAML file in the pipeline repo. Mark anything you cannot answer as `UNKNOWN` and clear one per day.
3. Add the schema snapshot diff to the ingest job this week. It is a few lines and it catches renames before your readers do.
4. Bump the contract version on any change to meaning, unit or source, and surface the current version in the dashboard itself.

If you want a dashboard whose columns are pinned this way, ETF Dashboard is a Taiwan-ETF analytics workbench: price and dividend data, technical indicators and backtesting in one dashboard. It is a $29 one-time download from https://slashmaster6.gumroad.com/l/etf-dashboard.

## Get ETF Dashboard

[**ETF Dashboard**](https://slashmaster6.gumroad.com/l/etf-dashboard?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=data-contract-dashboard-drift) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/etf-dashboard/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
