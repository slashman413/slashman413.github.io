---
title: "Case Study: An Internal Tool Built for Exactly Two Users"
description: "The design of a two-user internal tool: one job, one screen, one storage choice, one deploy path — and the exact triggers that end each deliberate skip."
date: "2026-09-29T08:00:00+08:00"
draft: false
slug: "internal-tool-for-two-users"
author: "Wayne Chang"
tags: ["internal-tools", "sqlite", "deployment", "minimalism", "case-study"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-ADS"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Case Study: An Internal Tool Built for Exactly Two Users"
faq:
  - q: "Do I need a database server for a two-user internal tool?"
    a: "Usually no. Count concurrent writers first: one writing process is a file-based database like SQLite, and anything more justifies a server. Reads from a second user are fine under WAL mode."
  - q: "When does basic auth stop being good enough?"
    a: "When access stops being all-or-nothing — a third person who should see only part of the data, or a requirement to attribute a change to a specific person. Replace it with real identity at that point, not before."
  - q: "How do you keep a small tool from growing into a CRUD app?"
    a: "Give it one screen with one decision per row, and treat every added filter, preference or settings page as a separate feature that needs its own justification. Most requests lose against the written job sentence."
---

Two users is a real product constraint, not an excuse to skip design work. It is the smallest audience that still needs a shared source of truth, which means most decisions have one obviously correct answer. This is the design of a small internal tool built for two people, and the list of things it deliberately does not do.

## Write the one job as a sentence before you write code

This tool exists because two people were comparing supplier price lists against current SKU costs by hand in a spreadsheet. Supplier files arrive as CSV or XLSX, with inconsistent column names and currency formatting. The job, written once and never widened:

> Take the newest supplier file, compare it to the cost already on file for each SKU, and let a human approve or reject each change.

That sentence rules out a lot. No editing SKUs. No supplier management. No emailing suppliers. No scheduler — the tool runs when someone drops a file in. Every feature request gets measured against the sentence, and most of them lose.

The ingest layer is deliberately brittle. It would rather throw than guess.

```python
# normalize.py — the whole ingest layer
import pandas as pd
from pathlib import Path

REQUIRED = {"sku", "cost"}

def normalize(path: Path) -> list[dict]:
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    missing = REQUIRED - set(df.columns)
    if missing:
        raise ValueError(f"{path.name}: missing {sorted(missing)}")
    df["cost"] = df["cost"].str.replace(r"[$,]", "", regex=True).astype(float)
    df["sku"] = df["sku"].str.strip().str.upper()
    return df[["sku", "cost"]].to_dict("records")
```

Two users can fix a malformed file by hand. A tolerant parser that silently coerces bad rows takes longer to debug than the error message costs.

## One screen that does not become a CRUD app

The entire UI is a table. Left column: the cost currently on file. Right column: the proposed cost from the file. A delta column, highlighted when it crosses a threshold set in the config file. Two buttons per row. An "apply all changed" button at the bottom, plus a required reason field.

No search. No pagination beyond a "changed only" toggle. No bulk edit. No undo button — the change log is the undo, and reverting means applying the old value from a previous row.

That sounds thin until you notice what it removes. Filters need saved filter state. Saved state needs per-user preferences. Preferences need identity. Identity needs roles. Each is small alone; together they are why internal tools turn into projects.

The same instinct shows up in [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/) — the tool should be boring at 2am, not flexible.

## One storage choice, made by counting writers

The question is not "Postgres or SQLite." It is "how many processes write at the same time." This tool has one writer: the web process handles apply clicks, one at a time, from two people who sit near each other.

| Option | Concurrent writers | Backup story | Query power | Ops burden |
|---|---|---|---|---|
| SQLite on a mounted volume | One writer, WAL mode; readers fine | Copy the file | Full SQL, no server | None |
| Managed Postgres | Many | Snapshots, point-in-time recovery | Full SQL, extensions | Connection strings, versions, cost |
| Google Sheets API | Effectively serialized, with latency | Revision history | Weak; formulas are not queries | Quotas, brittle auth |

SQLite won because the writer count is one and the backup story is `cp`. The schema is a few columns wider than the minimum:

```sql
create table if not exists cost_change (
  id integer primary key,
  sku text not null,
  old_cost real not null,
  new_cost real not null,
  supplier text not null,
  reason text not null,
  decided_by text not null,
  decided_at text not null default (datetime('now'))
);
pragma journal_mode = wal;
```

`decided_by` is a string, not a foreign key to a users table. There is no users table. You add one when the string stops being enough — see below.

SQLite is the default answer for tools with a handful of writers, but the same "one of everything" rule applies elsewhere. [Tool sprawl](/blog/solo-operator-tool-sprawl/) usually starts as a storage or integration decision nobody wanted to make.

## One deploy path, one auth decision

There is one Dockerfile, one image tag, one machine. The deploy is two commands plus a build tag, and the only variable is the git short hash.

```bash
TAG="registry.example.com/costwatch:$(git rev-parse --short HEAD)"
docker build -t "$TAG" . && docker push "$TAG"
fly deploy --image "$TAG"
```

Auth is HTTP basic auth terminated at the reverse proxy, with two credentials in a Caddyfile. No roles, no invites, no password reset flow, no session table.

That is correct when both users own the data and either one may apply a change. It stops being correct the moment one of those things is false.

## The moment a skip stops being acceptable

Skipping is only deliberate if you wrote down the condition that ends it. Put that condition in the README next to the skip, or it is not a design decision — it is debt you forgot you took on.

| Skipped | Safe while | Add it when |
|---|---|---|
| Auth roles | Both users can see and change everything | A third person needs read-only or partial access |
| Settings page | Config lives in a file one developer edits | A non-developer has to change behavior |
| Onboarding | The two users wrote the tool | Anyone else must use it without being walked through |
| Postgres | One writing process | Two processes write, or a job writes while a human clicks |
| Audit UI | You can grep the change log | Someone outside the pair asks who changed a number |
| Monitoring and alerts | Failures are noticed during the workday | The output feeds another system with no human in the loop |

Most triggers are "another person" or "another writer." Two users keeps both counts at one. That is the whole reason the design holds, and it is also the whole reason this shape does not survive a third user.

## What to do next

1. Write your tool's job as one sentence containing a verb and a decision. If it needs an "and," you have two tools and should build the smaller one.
2. List every feature you are skipping in the README, each with the trigger that ends the skip. No trigger means it is not a decision.
3. Count your writers before you pick a database. One writer means a file; anything more means a server.
4. Reduce deploys to one command with one variable. If shipping takes more than a minute, you will batch changes and lose the ability to revert one.
5. Make apply irreversible-proof: require a reason string and append an immutable row before the value changes. That habit replaces most of the audit UI you would otherwise build.

If the job your tool does turns out to be AI-shaped — classifying supplier files, extracting line items, normalizing messy columns — the AI Developer Stack Bundle ($79, one-time) collects a prompt library, an agent framework, deployment tooling and tutorials that are pre-configured to work together, which saves the week you would otherwise spend wiring four unrelated repos into one deploy path.

## Get AI Developer Stack Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=blog&utm_medium=article&utm_campaign=internal-tool-for-two-users) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-dev-stack/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
