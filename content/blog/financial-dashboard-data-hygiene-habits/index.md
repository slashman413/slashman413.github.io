---
title: "Five Data Hygiene Habits That Keep a Financial Dashboard Honest"
description: "Five routines that keep a market dashboard honest: pinned sources, raw snapshots, fallback flags, reconciliation checks and a written column contract."
date: "2026-11-05T08:00:00+08:00"
draft: false
slug: "financial-dashboard-data-hygiene-habits"
author: "Wayne Chang"
tags: ["data-hygiene", "dashboards", "finance", "etl", "provenance"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/etf-dashboard"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-ETF"
product_category: "Software > Finance"
product_currency: "USD"
seo_title: "Five Data Hygiene Habits That Keep a Financial Dashboard Hon"
faq:
  - q: "How often should I reconcile dashboard totals?"
    a: "As often as the dashboard refreshes, and at minimum once per reporting period. Run it automatically and keep the output so drift appears as a trend instead of a surprise."
  - q: "Does keeping a raw copy of every payload waste disk space?"
    a: "Raw JSON or CSV is small next to the cost of being unable to prove what a vendor sent. Compress it and set a written retention policy rather than pruning ad hoc."
  - q: "What if I only have one data source?"
    a: "An independent check can still come from exchange publications, a broker statement, or a manual snapshot you saved yourself. The point is that the reference number never passed through your own code path."
---

A market dashboard is a set of claims about the world, and those claims decay silently. A vendor backfills a month of prices, an endpoint starts serving cached JSON, someone renames a column while fixing an unrelated bug, and a number on screen changes without anyone deciding it should. The habits below are what let you answer "where did this number come from" six months later without trusting your memory.

## Pin the source and its update time

Every panel needs more than one timestamp. Record when you fetched, what the source declares as its "as of" time, and a content hash. Fetch time alone is misleading: a job that runs at 08:00 every morning will happily pull yesterday's payload and stamp it with today's date, and nothing in the UI will look wrong.

Write the answer into a manifest that travels with the data, not into a comment in the ETL script:

```python
import datetime, hashlib, json, pathlib

def snapshot(payload: bytes, source_id: str, source_as_of: str) -> dict:
    fetched = datetime.datetime.now(datetime.timezone.utc)
    stamp = fetched.strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha256(payload).hexdigest()
    path = pathlib.Path(f"raw/{source_id}/{stamp}_{digest[:8]}.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    manifest = {
        "source_id": source_id,
        "fetched_at": fetched.isoformat(),
        "source_as_of": source_as_of,   # what the vendor says the data covers
        "sha256": digest,
        "path": str(path),
    }
    path.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest
```

Then surface it in the UI. A price with no visible age invites the reader to assume it is current. If `source_as_of` is older than the expected cadence, render the panel as stale instead of rendering the number alone. This is the same discipline as logging the input, the decision and the output of an automated workflow ([/blog/add-observability-to-a-workflow/](/blog/one-sentence-to-runnable-workflow/)): the log is not decoration, it is the only reason you can debug the thing later.

## Keep a raw copy before you transform

Treat the raw layer as write-once, and store bytes rather than parsed objects. Parsing is where information quietly dies: floats lose decimal precision, missing values collapse into `NaN`, timestamps become naive local time, and columns you judged to be noise get dropped before anyone has decided they are noise.

Once the bytes are gone, you cannot prove what the vendor sent. And you often cannot re-fetch it either, because vendors restate history. A price that was 102.40 last month may be 102.35 today with no announcement, and if you only kept the transformed table you have no way to show that it changed, let alone when.

Two practical rules follow from that:

- Never write a second fetch to the same path. The filename includes a timestamp and a content hash, so a same-day re-run produces a new file rather than an overwrite.
- Compare hashes across runs and log the mismatch. Two different payloads for the same `source_as_of` is a restatement, and it is worth knowing about before a chart moves on its own.

Keep a retention policy written down. Compression is cheap; deleting the raw layer because a directory looked large is the expensive option.

## Flag the rows that came from a fallback

Every pipeline ends up with a fallback eventually: a cached response, a second vendor, a hand-edited CSV, a scraper that fills a gap. Using a fallback is not the mistake. The mistake is letting fallback rows become indistinguishable from primary rows by the time they reach a total.

Add provenance columns at the point of merge, not in a later cleanup pass:

```python
import pandas as pd

def merge_with_provenance(primary: pd.DataFrame, fallback: pd.DataFrame) -> pd.DataFrame:
    primary = primary.assign(
        source_id="vendor_a", is_fallback=False, fallback_reason=None
    )
    missing = fallback[~fallback["trade_date"].isin(primary["trade_date"])].copy()
    missing = missing.assign(
        source_id="vendor_b",
        is_fallback=True,
        fallback_reason="primary_missing",
    )
    return (
        pd.concat([primary, missing], ignore_index=True)
        .sort_values("trade_date")
        .reset_index(drop=True)
    )
```

Then decide what the dashboard does with those rows. There are only three honest options:

| Strategy | What the reader sees | Failure it hides | Reasonable when |
|---|---|---|---|
| Silent fill | The number, unmarked | An outage of any length; decisions get made on stale data | Essentially never for money |
| Carry forward plus badge | Last good value with its age and source | Nothing, if the badge is visible and totals can exclude it | Short gaps in a series that must stay continuous |
| Hard gap | Null or an explicit hole | Nothing, but charts break and alerts fire | Series where a wrong number is worse than a missing one |

Whichever you pick, put the count of fallback rows on the dashboard somewhere. A single number like "3 of 240 rows from fallback" tells the reader more about reliability than any amount of styling.

## Reconcile totals against an independent source

Independent means the number did not travel through your pipeline. Same vendor, same parser, same join path is not a check, it is a rehearsal. Good independent references are an exchange's published figures, a broker statement, a regulator's fund data, or a manual snapshot you saved yourself.

Reconcile on three things, in this order:

1. **Row counts and date coverage.** A bad join or a duplicated trading day shows up here long before it shows up in a price. Compare the number of trading days in the window, the minimum date and the maximum date.
2. **Totals.** Sum of dividends over a quarter, sum of closing prices over a sample, count of instruments with a non-null close.
3. **A few derived values.** Market value equals shares times price, and it should tie to a position report to the cent.

Set a tolerance per metric and write it down. A dividend total should match exactly; a price sample might allow a small rounding difference depending on decimal places. Store every reconciliation result with its timestamp, and chart the difference over time. A gap that is stable is a definitional difference you can live with. A gap that widens is a bug you have not found yet.

## Write down what each column means

Most silent number changes are not crashes. They are semantic: a column switches from adjusted to unadjusted close, a currency changes, a timestamp moves from exchange local time to UTC, a nullable field starts defaulting to zero. Nothing fails. The total just moves.

The fix is a column contract, checked into the repository and tested in CI, so a rename or a dtype change breaks a test instead of changing a number. It is the same versioning discipline you would apply to any artefact buyers depend on ([/blog/versioning-a-template-so-buyers-do-not-lose-their-customisations/](/blog/selling-a-feishu-template-product/)).

```yaml
# contracts/etf_prices.v3.yaml
table: etf_prices
version: 3
columns:
  trade_date:
    type: date
    timezone: Asia/Taipei
    note: exchange trading day, not the fetch time
  close:
    type: decimal(12,4)
    unit: TWD
    adjusted: false
    note: unadjusted close; adjustments live in adj_close
  adj_close:
    type: decimal(12,4)
    unit: TWD
    adjusted: true
    method: back-adjusted on ex-dividend date
  source_id:
    type: string
    enum: [vendor_a, vendor_b, manual_csv]
  is_fallback:
    type: boolean
    note: true when the row did not come from the primary pull
allow_new_columns: false
```

Run a lightweight check at load time: every column present, types match, no unexpected additions. Set `allow_new_columns: false` on purpose. When a new column appears, you want the build to stop so a human decides whether it belongs in a total.

## What to do next

1. Add a manifest to your next fetch job: source id, `fetched_at`, `source_as_of`, SHA-256, path. Render `source_as_of` in the UI next to the price.
2. Move raw payloads to a write-once directory keyed by timestamp and hash, and stop re-fetching a second time when the hash matches an existing file.
3. Add `is_fallback` and `fallback_reason` to your merge step this week, then display the fallback row count on the dashboard.
4. Pick one independent reference and automate a weekly reconciliation on row counts and one total. Save the output even when it passes.
5. Write a YAML contract for your most-edited table and wire a load-time check to it before the next schema change.

If you want a working example of a dashboard that treats price, dividend and indicator data as separate, auditable inputs, the ETF Dashboard is a Taiwan-ETF analytics workbench with price and dividend data, technical indicators and backtesting in one dashboard. It is $29 USD one-time, available at https://slashmaster6.gumroad.com/l/etf-dashboard.

## Get ETF Dashboard

[**ETF Dashboard**](https://slashmaster6.gumroad.com/l/etf-dashboard?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=financial-dashboard-data-hygiene-habits) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/etf-dashboard/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
