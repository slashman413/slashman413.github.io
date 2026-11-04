---
title: "Self-Hosting an ETF Dashboard vs a Hosted One: The Real Tradeoff"
description: "Self-hosted vs hosted ETF dashboards: data control, refresh cadence and holdings privacy against the upkeep cost of keeping the thing alive."
date: "2026-11-04T08:00:00+08:00"
draft: false
slug: "self-host-vs-hosted-etf-dashboard"
author: "Wayne Chang"
tags: ["self-hosting", "etf", "privacy", "automation", "backtesting"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/etf-dashboard"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-ETF"
product_category: "Software > Finance"
product_currency: "USD"
seo_title: "Self-Hosting an ETF Dashboard vs a Hosted One: The Real Trad"
faq:
  - q: "Do I need position sizes in my ETF dashboard?"
    a: "Only if you want per-position P&L and dividend totals. For allocation and trend checks, tickers plus weights are enough, and asking for less data limits what any hosted service or backup copy exposes."
  - q: "How often should a self-hosted ETF dashboard refresh?"
    a: "Once per trading day after the close is enough for most portfolios, plus a catch-up run if the machine was off. Intraday refreshes add failure modes and rarely change a decision you make monthly."
  - q: "What breaks first in a self-hosted setup?"
    a: "The data fetch, not the chart. Exchange file formats, column names and holiday calendars change, and a job that fails silently leaves you reading stale prices without noticing."
---

Every ETF dashboard answers three questions: what do I own, what did it pay me, and is the trend still intact. The choice between running your own and paying someone to run it is not really about features. It is about who owns the fetch pipeline, who decides when data refreshes, and who gets woken up when the job silently stops.

## The four axes that actually differ

Strip away the UI and a dashboard is a price series, a dividend table, a few indicators, and a scheduler. That is a small application. The reason self-hosting is contentious is that the application is small and the care and feeding is not.

Four things genuinely differ between the two options:

1. **Data source control.** Self-hosted means you choose the feed: exchange end-of-day files, a broker CSV export, a paid API. Hosted means you inherit whatever the vendor licensed, including its coverage limits and its lag.
2. **Refresh cadence.** You either set the schedule or you accept theirs.
3. **Privacy of holdings.** Someone's database holds your positions, weights and the timestamps of when you looked.
4. **Maintenance.** One of you owns schema drift, holiday calendars, corporate actions and backups.

Most comparisons stop at point 1 and pretend the other three are equal. They are not, and the third one is the one people underestimate.

## Refresh cadence is a scheduling problem

Hosted dashboards refresh on the vendor's clock. If the job runs at a fixed hour and your market closes at a different hour, you are looking at stale prices every morning and there is nothing to configure. That is fine for a monthly rebalancer and wrong for anyone checking a breakout.

Self-hosting makes cadence a line in a timer file. A weekday job after the close, with catch-up if the machine was off:

```ini
# ~/.config/systemd/user/etf-refresh.timer
[Unit]
Description=Refresh ETF price and dividend tables after the close

[Timer]
OnCalendar=Mon..Fri 14:45 Asia/Taipei
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

```ini
# ~/.config/systemd/user/etf-refresh.service
[Service]
Type=oneshot
WorkingDirectory=%h/etf
ExecStart=%h/etf/.venv/bin/python refresh.py --since-last
```

The important part is not `Persistent=true`. It is that a scheduled job which fails quietly is worse than no job at all. Write every run to a table so you can diff yesterday against today, the same way you would [add observability to any workflow](/blog/workflow-observability-log-input-decision-output/):

```python
# refresh.py — one job, one row per run, idempotent writes
import sqlite3, datetime as dt, sys

con = sqlite3.connect("etf.db")
con.execute("""create table if not exists run_log(
    ran_at text, as_of text, rows integer, status text)""")

def run(as_of: dt.date) -> None:
    try:
        rows = fetch_closes(as_of)            # exchange EOD or broker CSV
        upsert_prices(con, rows)              # unique on (ticker, trade_date)
        status = "ok"
    except Exception as exc:
        rows, status = [], f"error: {exc}"
    con.execute("insert into run_log values(?,?,?,?)",
                (dt.datetime.now().isoformat(timespec="seconds"),
                 as_of.isoformat(), len(rows), status))
    con.commit()
    if status != "ok":
        sys.exit(1)
```

Two details matter more than they look. Unique keys on `(ticker, trade_date)` make reruns safe, so a backfill after three days offline does not double-count dividends. And `--since-last` beats a hardcoded date range, because holiday calendars are the single most common source of empty result sets.

## Who sees your holdings

A holdings file is a fingerprint. A portfolio built from a handful of Taiwan ETFs, plus two odd positions and a cash weight, identifies a person at a small firm more reliably than a name does. So the question to ask a hosted service is not "do you sell data" but "what is the smallest unit of my portfolio you store."

Three checks worth doing before you trust any hosted dashboard:

- **Storage granularity.** Does it need share counts, or just tickers and weights? If it asks for units when weights would do, that is a design choice, not a requirement.
- **Deletion.** Can you delete an account and get a real answer about what happens to the rows? "Contact us" is an answer.
- **Access path.** If the dashboard pulls from your broker through an aggregator, the aggregator also sees the account, and your privacy posture is now two vendors deep.

Self-hosting moves the trust rather than eliminating it. A SQLite file on your laptop is yours. The same file on a rented VPS is on someone else's disk, subject to their snapshots and their support staff. If holdings privacy is the reason you are self-hosting, host it at home or on hardware you control, and encrypt the backups with something like `age` before they leave the machine.

## The maintenance ledger

Here is the honest comparison. Read the middle column as recurring work, not one-time setup.

| | Self-hosted | Hosted |
|---|---|---|
| First useful chart | An afternoon to a weekend | Minutes |
| Data source | Your problem, including parse changes | Vendor's problem |
| Refresh cadence | Whatever cron or systemd says | Fixed by vendor |
| Corporate actions | You handle splits and dividend adjustments | Usually handled |
| Backups and restore | Yours, and untested until you test it | Vendor's |
| Failure detection | You notice stale data | Vendor may notice; you may not be told |
| Custom indicators, own backtests | Yes, directly on your data | Limited to the roadmap |
| Cost | Hosting plus your evenings | Subscription, often per seat |

Self-hosting pays for itself when at least two of these are true: you already run a cron-based stack and the incremental work is small, you hold accounts across several brokers and want one merged view, you need a cadence or indicator the vendor does not offer, or you want to backtest on your own history rather than a sample. It becomes a maintenance tax when the opposite holds: one portfolio, standard indicators, and a data source that changes format twice a year. The tell is the fetch step. If you cannot get prices into a table in one sitting, the upkeep is real and it will not shrink.

This is the same pattern that shows up in any home server project: the interesting part is the first day, and the cost is in the [weeks of watching it afterward](/blog/watching-a-home-dgx-llm-server/). Budget for the watching.

## What to do next

1. **List the three numbers you check weekly.** If a hosted free tier shows all three at a cadence you accept, stop here. Self-hosting a dashboard you barely open is pure cost.
2. **Time-box a spike to one afternoon.** One data source, one table, one timer. If the fetch is not landing rows by the end of it, treat that as the answer and either buy a tool or accept a hosted service.
3. **Write the timer before the UI.** Cadence is the part you cannot retrofit, and `Persistent=true` plus a `run_log` table is cheaper than discovering a week of stale prices later.
4. **Encrypt one backup and restore it once.** A backup you have never restored is a wish. If your holdings leave the machine, they should leave encrypted.
5. **Consider a local workbench before building one.** If what you want is Taiwan-ETF analytics on your own machine without writing the parser, ETF Dashboard is a $29 one-time download: price and dividend data, technical indicators and backtesting in one dashboard. It is available at https://slashmaster6.gumroad.com/l/etf-dashboard.

## Get ETF Dashboard

[**ETF Dashboard**](https://slashmaster6.gumroad.com/l/etf-dashboard?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=self-host-vs-hosted-etf-dashboard) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/etf-dashboard/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
