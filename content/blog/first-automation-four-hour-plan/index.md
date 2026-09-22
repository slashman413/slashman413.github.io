---
title: "Your First Automation in Four Hours: An Hour-by-Hour Build Plan"
description: "A realistic four-hour plan for your first AI automation: scope it, build the happy path, handle the failure you'll hit, then schedule, log and disable it."
date: "2026-09-22T08:00:00+08:00"
draft: false
slug: "first-automation-four-hour-plan"
author: "Wayne Chang"
tags: ["automation", "tutorial", "cron", "logging", "n8n"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Your First Automation in Four Hours: An Hour-by-Hour Build P"
faq:
  - q: "Do I need to be able to code to follow this plan?"
    a: "No. A hosted workflow tool can cover the trigger, the transform and the destination without code. Writing code helps mainly when you need custom validation or a dead-letter path, which is what hours three and four are about."
  - q: "How do I decide which task to automate first?"
    a: "Pick the task you already repeat by hand more than twice a week and can describe with one trigger and one output. High value but vague is a worse first project than boring but well defined."
  - q: "Should I schedule the job before I add error handling?"
    a: "No. A job with no failure path that aborts silently on the third item looks perfectly healthy from the outside and will quietly produce nothing until someone asks where the output went."
---

Most first automation projects don't fail on day one. They work while you're watching, then quietly stop producing anything useful when you aren't. The four hours below are ordered so the unglamorous parts — scope, one failure path, a log line, an off switch — get finished before your interest runs out.

## Hour 1: Write the definition of done before you open a builder

Choose one task you already do by hand more than twice a week. Not the most valuable task, the most repetitive one. You want something with a clear trigger and a clear artifact at the end.

Then write four things down: the trigger, the output, the destination, and the person who owns it when it breaks. Put it in a file that lives next to the code, not in your head.

```yaml
# dod.yaml
task: summarize inbound support mail and log it
trigger: message arrives with the Gmail label "inbox/new"
output: one row in the "intake" sheet + one Slack message
definition_of_done: >
  For five real messages in a row: the row exists within three minutes,
  the summary is under 60 words, and no message appears twice.
out_of_scope:
  - attachments
  - anything not carrying the label
kill_switch: set ENABLED=false and restart the worker
owner: me
```

Two lines in that spec do most of the work. "No message appears twice" commits you to an idempotency key, which you will otherwise add after 400 rows are already in the sheet. "Under 60 words" is a bound you can test; "good summary" is not.

Time-box the whole hour. If you cannot fill in `out_of_scope`, you have a wish, not a scope. If you are still choosing between a hosted builder and a standalone script, decide now and stop revisiting it — the tradeoffs are laid out in [Zapier vs n8n vs AI Workflow Builder](/blog/zapier-vs-n8n-vs-ai-workflow-builder/). For the wider picture of where a single job fits once you have several, see the [Ultimate AI Automation Guide](/blog/ultimate-ai-automation-guide-2026/).

## Hour 2: Build the happy path, and only the happy path

No branches. No retries. No error handling. Fetch, transform, write, notify, in that order, in one function you can run by hand.

```python
# happy_path.py
import json, os
from openai import OpenAI

client = OpenAI()

def extract(text: str) -> dict:
    r = client.chat.completions.create(
        model=os.environ["MODEL"],
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": (
                "Return JSON with keys topic, urgency, summary. "
                "urgency is one of low, normal, high."
            )},
            {"role": "user", "content": text},
        ],
    )
    return json.loads(r.choices[0].message.content)

def run_once(message: dict) -> None:
    data = extract(message["body"])
    append_row("intake", {
        "message_id": message["id"],   # idempotency key, unused for now
        "topic": data["topic"],
        "urgency": data["urgency"],
        "summary": data["summary"],
    })
    notify_slack(f"[{data['urgency']}] {data['topic']}")
```

Notes on the parts that bite. `response_format={"type": "json_object"}` is not supported by every provider or model version, so check yours before you rely on it. `message_id` is written even though nothing reads it yet, because adding a key to a table with live data is worse than carrying a column you don't use. `append_row` and `notify_slack` are whatever your stack exposes: an API call, a webhook, a database insert.

Test against five real inputs, not invented ones. Save them under `fixtures/` with the exact message ids so hour three has something to replay. If the happy path works twice in a row on real data, close the editor and move on.

## Hour 3: Handle the one failure you will actually hit

Every pipeline has one failure that kills it and three that annoy it. Fix the killer.

For LLM-backed steps, the killer is usually malformed output: the model returns a sentence instead of JSON, or JSON with a renamed field. Validate, retry once, then dead-letter. That is the whole design.

```python
def extract_safe(text: str, message_id: str, attempts: int = 2) -> dict | None:
    for i in range(attempts):
        try:
            data = extract(text)
            if not isinstance(data, dict) or "summary" not in data:
                raise ValueError("missing summary")
            if data.get("urgency") not in {"low", "normal", "high"}:
                data["urgency"] = "normal"   # degrade, don't fail
            return data
        except Exception as e:
            log({"event": "extract_failed", "message_id": message_id,
                 "attempt": i, "error": str(e)})
    dead_letter(message_id, text)
    return None
```

`dead_letter` can be a file, a table, or a second label in your mail client. It does not need a queue with backoff, a dashboard, or a pager.

| Failure | How you notice | Cheap fix | Cost of ignoring |
|---|---|---|---|
| Prose instead of JSON | `json.loads` raises | JSON mode plus one retry | Run aborts partway through the batch |
| Timeout or 429 | Exception after 30s | One retry with jitter, then dead-letter | Silent gaps in the output |
| Same item twice | Duplicate row or message | Idempotency key plus upsert | You stop trusting the sheet |
| Zero output, no error | Nothing in the destination | Log a count per run, alert when 0 | Dead for a week before anyone asks |

Test the failure path the same way you tested the happy path: feed it a bad input on purpose and watch where the record lands. An untested fallback is just a comment.

## Hour 4: Schedule it, log it, and write the off switch

Pick the scheduling option that matches what you already run.

| Option | Setup | Retries | Secrets | Fits when |
|---|---|---|---|---|
| `cron` on a VPS | `crontab -e`, minutes | None built in | File on disk | You already run a box |
| `systemd` timer | Two unit files | `Restart=on-failure` | `EnvironmentFile=` | You want `journalctl` for free |
| GitHub Actions `schedule` | One YAML file | Manual | Repository secrets | No server, short runs |
| Hosted workflow tool | UI | Configurable | Built-in credential store | You want visibility without code |

Whichever you choose, wrap the run so two copies cannot overlap:

```bash
# crontab -e — every 10 minutes, single instance, appended JSONL log
*/10 * * * * cd /srv/intake && flock -n /tmp/intake.lock \
  ./venv/bin/python run.py >> /var/log/intake.jsonl 2>&1
```

`flock -n` is the highest-value flag in this article. A run that hangs on a slow API is the most common way a first automation turns into a stack of overlapping processes.

Log one JSON object per line with the same keys every time: `run_id`, `event`, `message_id`. Grep becomes your dashboard. This is the same reasoning behind [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/): the value is in what you can see when you are not watching.

Then write the off switch, in the same file as the definition of done, and wire it as the first check in the program.

```bash
# .env
ENABLED=true
```

```python
# first lines of main()
if os.environ.get("ENABLED", "true").lower() != "true":
    log({"event": "disabled_skip"})
    raise SystemExit(0)
```

Three lines of notes next to it: how to disable, where the dead-letter file lives, who to tell if it stops. A kill switch nobody can find is not a kill switch.

## What to do next

- Write `dod.yaml` for one task you do by hand more than twice a week. Cap it at 30 minutes, and include `out_of_scope` and `kill_switch`.
- Build the happy path and run it against five saved real inputs. No error handling yet.
- Add exactly one failure handler: validation, one retry, dead-letter. Test it with a deliberately bad input.
- Schedule the job with `flock` and confirm you get one JSON log line per run.
- Book ten minutes next week to read the log and check the dead-letter file.

If you would rather have the structure handed to you than assemble it yourself, Ship With AI is a four-hour practical course, $39 one-time, that takes a non-coder from zero to a first working AI automation project.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=blog&utm_medium=article&utm_campaign=first-automation-four-hour-plan) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
