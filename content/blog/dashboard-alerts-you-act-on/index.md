---
title: "Set Up Dashboard Alerts You Will Actually Act On"
description: "Design one dashboard alert with a real action, a quiet window and an escalation path, then tune the threshold until it nudges, not screams."
date: "2026-11-03T08:00:00+08:00"
draft: false
slug: "dashboard-alerts-you-act-on"
author: "Wayne Chang"
tags: ["alerts", "dashboards", "monitoring", "thresholds", "finance"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/etf-dashboard"
product_price: "29"
product_brand: "Slashman Tools"
product_sku: "SMT-ETF"
product_category: "Software > Finance"
product_currency: "USD"
seo_title: "Set Up Dashboard Alerts You Will Actually Act On"
faq:
  - q: "How many alerts should a personal financial dashboard have?"
    a: "Start with one, and add a second only after the first has fired and you actually acted on it. Each alert is a promise of an action, so a dashboard with eight rules usually has zero that get read."
  - q: "What is a quiet window in alerting?"
    a: "It is the combination of a hold period, a clear gap and a cooldown that sits between the metric crossing a line and a message reaching you. The hold period proves the condition is real, the clear gap stops flapping, and the cooldown caps how often you can be interrupted."
  - q: "My alert fired and nothing bad happened. What now?"
    a: "That is normal early on. Log it, then widen the clear gap or the cooldown before touching the threshold. If a rule keeps firing and never produces an action, delete it rather than adding another severity."
---

Most dashboard alerts are written to describe a number, not to trigger a decision. Two weeks later you are swiping them away without reading, and the one that mattered goes with the rest. Fixing that is not a notification-tool problem, it is a rule-design problem, and it has three parts: one threshold you will act on, a quiet window that stops the alert firing on a touch, and an escalation path that ends somewhere other than your own anxiety.

## Write the action before you write the rule

Every alert is a promise that you will do something when it fires. So write the promise first, in one sentence, and only then pick the metric:

> If \_\_\_ happens and holds for \_\_\_ , I will \_\_\_ within \_\_\_ .

If you cannot fill the middle blank with a specific action (trim a position, move cash, call the broker, read a filing), the number belongs on the page you read when the dashboard is already open. Dashboards are pull. Alerts are push. Push spends a finite resource, and the price of a noisy push channel is that you stop trusting all of it.

Bad rule: notify when RSI goes above 70. There is no action in that sentence, only a state. Good rule: if drawdown from peak passes 8% for a full trading day, I review position size and decide whether to trim before the next session.

Start with exactly one rule. Not one per metric, not one per position: one for the dashboard. Add a second only after the first has fired at least once and you actually did the thing it asked for. This is the same discipline as [keeping a dashboard from going stale](/blog/dashboard-refresh-never-goes-stale/): the value is in what you leave out.

When you do need a second rule, pick its shape deliberately:

| Rule shape | Fires when | Usual failure | Good for |
|---|---|---|---|
| Static level | value crosses a fixed line | the line goes stale as your situation changes | hard floors: cash runway, position stop |
| Percent move | value changes by X% over N days | normal volatility in a jumpy series | drawdown, a single bad day |
| Band with hysteresis | value leaves a band and stays out | slow drift that never quite leaves | allocation drift, trend change |
| Rolling z-score | value sits N deviations from its own mean | calm periods make small moves look large | exploring data, not making decisions |

For the one alert you will act on, take the static level or the percent move. Both map to a sentence you can finish. The z-score is an alert generator, not an alert.

## Put a quiet window between the number and the interruption

The difference between the price touched my line and the price is below my line is a timer. You need three of them, and they do different jobs:

- **Hold**: the condition must be true on N consecutive evaluations before anything is sent.
- **Clear gap**: after firing, the rule does not re-arm until the value recovers past a second, higher line. This is hysteresis, and it kills the flapping you get from a single threshold.
- **Cooldown**: after firing, the rule stays silent for a fixed period even if the condition re-triggers. This is what stops a bad week from becoming forty messages.

```yaml
# alerts.yaml - deliberately two rules, both with timers
rules:
  - name: cash_runway_short
    metric: cash_days_remaining
    fire_below: 90
    clear_above: 105        # hysteresis: a gap, not a single line
    hold: 3d                # true on 3 consecutive daily runs
    cooldown: 7d
    severity: page
    route: phone

  - name: position_drawdown
    metric: drawdown_from_peak_pct
    fire_below: -8
    clear_above: -4
    hold: 1d
    cooldown: 3d
    severity: notify
    route: email
```

The gap between `fire_below` and `clear_above` is the part people skip. Without it, a value sitting on the line produces an alert on every evaluation, and you learn to delete the rule rather than fix it. Set the gap wide enough that the value has to make a real move to re-arm. For daily data, a few percentage points or about a week of runway is a reasonable starting judgement; it is a judgement call, not a calculation.

## Give the alert a place to go

Two severities are enough for a personal or small-team dashboard. **Notify** goes to a channel you read within a day. **Page** interrupts you and must stay rare enough that it still does. If your chat client is muted, it is not a channel. The [observability habit of logging the decision, not just the event](/blog/workflow-observability-log-input-decision-output/) applies here in a smaller form: record what fired, when, and what you did.

Three rules keep a channel trustworthy:

1. An alert stays open until it is acknowledged or the condition clears. No silent auto-close.
2. Only `page` may wake you, and only the cash-runway-style rule earns that severity.
3. Stale data is itself an alert. A dashboard that stopped updating two days ago looks identical to a calm market.

That last one is the failure mode people miss: silence reads as good news. Add a heartbeat check that fails loudly when the data is old:

```bash
#!/usr/bin/env bash
# stale-data check: run once a day from cron
set -euo pipefail
last=$(curl -fsS "$HEALTH_URL" | jq -r '.last_updated')
age=$(( $(date +%s) - $(date -d "$last" +%s) ))
if [ "$age" -gt 172800 ]; then
  printf 'dashboard data is %sh stale\n' "$(( age / 3600 ))" \
    | mail -s "stale dashboard" "$ALERT_EMAIL"
fi
```

## Tune the level until it nudges instead of screaming

A threshold is a guess until you test it against history you already have: the same series the dashboard charts. The point of this sweep is not to find an optimum. It is to see how often each candidate level would have interrupted you.

```python
import csv, datetime as dt

def load(path):
    with open(path) as f:
        return [(dt.date.fromisoformat(r["date"]), float(r["value"]))
                for r in csv.DictReader(f)]

def fires(series, level, hold, cooldown):
    hits, last, run = [], None, 0
    for day, value in series:
        run = run + 1 if value < level else 0
        if run == hold and (last is None or (day - last).days >= cooldown):
            hits.append(day)
            last = day
    return hits

series = load("cash_days.csv")
for level in (120, 105, 90, 75, 60):
    hits = fires(series, level, hold=3, cooldown=7)
    print(f"{level:>4} days -> {len(hits):>2} fires, first few: {hits[:4]}")
```

Read the output as a budget, not a score. A level that fires most weeks is wallpaper, not a nudge. A level that never fires is not safe, it is untested, and probably set where the number sat during the calmest stretch in your data. Move it toward the edge until it fires on the bad periods and stays quiet on the ordinary ones. Then tighten the cooldown until the message count is something you would tolerate in your worst week.

Finally, keep a fire log. The format, with example rows:

| Date | Rule | Action taken | Worth it |
|---|---|---|---|
| 2026-01-14 | position_drawdown | trimmed 10% of position | yes |
| 2026-01-22 | position_drawdown | nothing, recovered same day | no, widen clear gap |
| 2026-02-03 | cash_runway_short | moved a client invoice forward | yes |

After a month, rules whose rows all say nothing get deleted or re-tuned. That is the entire maintenance loop, and it costs about two minutes a week.

## What to do next

- Delete every alert on the dashboard that does not have a fillable I will \_\_\_ sentence. You will probably be left with one or two.
- Add the three timers to that rule this week: a hold period, a clear gap wider than the fire level, and a cooldown.
- Add a stale-data check so a broken pipeline cannot masquerade as a quiet market.
- Sweep three or four candidate levels against your own history and pick the one that would have fired during the periods you actually care about.
- If you need clean historical series to sweep, price and dividend history plus indicators for Taiwan ETFs is what ETF Dashboard covers: a workbench with price and dividend data, technical indicators and backtesting in one dashboard, $29 one-time at https://slashmaster6.gumroad.com/l/etf-dashboard.

## Get ETF Dashboard

[**ETF Dashboard**](https://slashmaster6.gumroad.com/l/etf-dashboard?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=dashboard-alerts-you-act-on) — **$29**, one-time payment, instant download. See the full breakdown on the [review page](/blog/etf-dashboard/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
