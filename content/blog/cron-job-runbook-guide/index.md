---
title: "How to Write a Runbook for Every Cron Job You Own"
description: "One page per cron job: what it does, what it depends on, how you know it failed, how to re-run it safely, and who to wake up. With a filled-in example."
date: "2026-09-30T08:00:00+08:00"
draft: false
slug: "cron-job-runbook-guide"
author: "Wayne Chang"
tags: ["cron", "runbooks", "automation", "ops", "reliability"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "How to Write a Runbook for Every Cron Job You Own"
faq:
  - q: "How long should one runbook page be?"
    a: "One screen, roughly 150 to 300 words plus the entrypoint. If it needs more, the cron entry is usually two jobs sharing one script, and you should split them before writing more prose."
  - q: "Should the runbook live in the repo or in a wiki?"
    a: "In the repo next to the script, at runbooks/<job-name>.md. That way a change to the schedule or an env var shows up in code review, and the page cannot drift silently for months."
  - q: "My job is idempotent, so do I still need a re-run section?"
    a: "Yes, and the section should be short: the exact command plus the constraint that makes it safe, such as a unique index on a log table. Writing the reason down saves the next person from re-deriving it under pressure."
---

A cron job you cannot describe on one page is a cron job you cannot fix at 3am. The answer is not a bigger monitoring stack; it is one short markdown file per job, committed next to the script that runs it. Below is the page format, a filled-in example, and a checklist for auditing the cron table you already have.

## One page per job, stored next to the job

Most teams keep a runbook wiki that drifts within a month, for the same reason a shared document beats no document but loses to a template that lives where the work happens: nobody edits the wiki during a pull request. Store the page at `runbooks/<job-name>.md` in the same repo as the entrypoint. When someone changes the schedule, an env var, or a query, the diff shows whether the page was updated. That alone catches most drift.

One file per cron entry, not per script. If `sync.sh` runs at 02:00 for the EU region and again at 14:00 for the US, that is two entries and either two pages or one page with two clearly labelled schedules. The audit checklist later assumes you can go from a crontab line to a file, so pick a convention and stay with it.

## The six things every page must state

1. **What it does** — one sentence in business terms. "Sends overdue invoice reminders," not "runs reminders.py."
2. **What it depends on** — database, API keys, upstream job that must have finished, timezone assumption.
3. **How to tell it failed** — the exact signal, including the silent case where it exits 0 and does nothing.
4. **How to re-run it safely** — the command, the flags, whether it is idempotent, and what happens if it is not.
5. **What state it touches** — tables, buckets, queues, external services, and which writes are safe to duplicate.
6. **Who to tell** — an owner, a channel, and what that person needs to know when they get paged.

Use bold labels (`**Fails when:**`) so the page is greppable from a terminal during an incident.

## A filled-in page

```markdown
# nightly-invoice-reminders

**Runs:** 03:15 UTC daily — `15 3 * * *` — on worker-2, not in the app containers.
**Entrypoint:** `bash /opt/jobs/reminders/send.sh --window 14d`
**Owner:** dana@example.com / #billing-ops

**What it does:** Finds invoices more than 14 days overdue and emails the
billing contact one reminder. Maximum one reminder per invoice per day.

**Depends on:** billing-primary (Postgres, read), Postmark API key in
/etc/jobs/reminders.env, the `invoices` schema (id, customer_id, due_on,
status), and worker-2 having outbound HTTPS.

**Fails when:** exit code is non-zero; OR the log line shows `sent=0` while
the overdue count is greater than zero. The second case is the dangerous
one — the job exits 0 having sent nothing, usually because the Postmark key
expired or the `status` enum changed upstream.

**Re-run safely:** `send.sh --date 2026-03-11` re-runs one day. Safe,
because sends are guarded by a unique index on
`reminder_log (invoice_id, sent_on)` — duplicates are skipped, not sent.
Do not re-run with `--window 30d` to "catch up"; that changes which
invoices qualify, not just how many days are processed.

**State it touches:** reads `invoices`; inserts into `reminder_log`; adds a
`reminder_sent` tag in Postmark. Nothing is deleted. The only irreversible
action is an email leaving the building.

**Who to tell:** page #billing-ops with the run id and the log tail. If more
than one day was missed, tell the billing lead before re-running — customers
will receive two reminders in one week.
```

Note the shape of that page: the re-run section names the constraint that makes the re-run safe, and the state section says out loud that email is unrecoverable. Those two sentences are what separate a runbook from a description.

## Detect failure, including the silent kind

Cron's default failure reporting is mail to the local user, which usually goes nowhere. Three approaches, in increasing order of usefulness:

| Approach | Catches | Misses | Setup cost |
| --- | --- | --- | --- |
| Exit code plus `MAILTO` | Non-zero exits | Silent success, and anything if mail is unrouted | One crontab line |
| Wrapper with a dead-man's switch ping on success | Crashes, missing runs, dead host | Runs that exit 0 and do nothing | About 20 lines |
| Wrapper plus an assertion on expected output | Also catches "ran but did nothing" | Nothing, if you know the expected shape | Assertion per job |

The wrapper is where the assertion belongs, because cron gives you no place to put one. For the broader habit of separating urgent from non-urgent automation failures, see [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/).

```bash
#!/usr/bin/env bash
set -euo pipefail
JOB="nightly-invoice-reminders"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
LOCK="/var/lock/${JOB}.lock"
exec 9>"$LOCK"
flock -n 9 || { echo "SKIP: already running ($RUN_ID)"; exit 75; }

trap 'rc=$?; logger -t "$JOB" "run=$RUN_ID rc=$rc"; exit $rc' EXIT

out="$(/opt/jobs/reminders/send.sh --window 14d)"
echo "$out"
logger -t "$JOB" "run=$RUN_ID $out"

# Assert the shape of a healthy run, not just the exit code.
overdue="$(psql -Atc "select count(*) from invoices where due_on < now() - interval '14 days' and status = 'open'")"
sent="$(sed -n 's/.*sent=\([0-9]*\).*/\1/p' <<<"$out" | tail -1)"
if [ "${overdue:-0}" -gt 0 ] && [ "${sent:-0}" -eq 0 ]; then
  echo "FAIL: ${overdue} overdue, 0 sent" >&2
  exit 1
fi

# Only ping on success, so silence means something went wrong.
curl -fsS -m 5 "https://hc-ping.com/<uuid>" >/dev/null
```

Exit 75 for a skipped run is deliberate: the dead-man's switch should treat it as neither success nor failure, so decide that policy once in the switch's settings rather than in each wrapper. The lock also matters — if a job can still be running when the next tick fires, the wrapper needs it, or you will discover the overlap through duplicate writes.

## Audit the cron table you already have

Dump everything that actually executes, including system entries and systemd timers, because most cron tables people think they have are incomplete:

```bash
# user crontabs
for u in $(cut -f1 -d: /etc/passwd); do
  crontab -l -u "$u" 2>/dev/null | sed "s|^|$u: |"
done
# system entries
cat /etc/crontab
ls -1 /etc/cron.d /etc/cron.daily /etc/cron.hourly 2>/dev/null
# schedulers that are not cron
systemctl list-timers --all
```

Then walk the list and check each criterion:

- [ ] Every entry has a matching file in `runbooks/`.
- [ ] Every page names an owner who still works here.
- [ ] Every page has a failure signal that fires without a human looking.
- [ ] Every re-run command is one someone has actually executed recently; a stale command is worse than an empty field, because it looks trustworthy.
- [ ] Every write listed under "state it touches" is labelled safe-to-duplicate or not.
- [ ] No entry has `MAILTO` pointing at a dead address with no other alert path.
- [ ] Jobs with no owner get disabled, not documented. A disabled job is honest; an unowned job that runs is a future outage.
- [ ] Timezone is explicit via `CRON_TZ=` or a comment, never assumed.

For jobs that also write data — backups, exports, syncs — pair this audit with the restore procedure, since a cron job whose state you cannot rebuild is a liability: [how to back up and restore a self-hosted automation stack](/blog/backup-restore-self-hosted-automation/). If you are still mapping jobs to business value in the first place, the [2026 automation guide](/blog/ultimate-ai-automation-guide-2026/) covers where cron fits against queue workers and agent runners.

## What to do next

1. Pick the three jobs you would least like to debug half-asleep and write their pages this week, in the repo, using the filled-in example above as the template.
2. Add one output assertion to each wrapper — not just an exit code check — and make the dead-man's switch ping fire only after it passes.
3. Run the crontab dump, then put a checkbox beside every entry that has no page. Disable anything with no owner rather than documenting it.
4. Move your schedules to explicit UTC (`CRON_TZ=UTC`) and fix any `MAILTO` address that has never received a message.

If your cron entries are increasingly just "kick off an agent and check later," the run-history question gets harder than cron itself. Cowork Pro ($59, one-time) is a dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history — the run history is the part that maps to what these pages assume, namely a run id and a log you can point a colleague at.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=blog&utm_medium=article&utm_campaign=cron-job-runbook-guide) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
