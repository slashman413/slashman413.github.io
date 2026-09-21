---
title: "How a Two-Person AI News Desk Publishes Daily Without Burnout"
description: "A two-person AI news desk runs on one fixed daily loop: machines collect and draft, a human clears four gates, and failures alert on absence, not errors."
date: "2026-09-21T08:00:00+08:00"
draft: false
slug: "two-person-ai-news-desk-rhythm"
author: "Wayne Chang"
tags: ["automation", "editorial", "cron", "small-team", "workflow"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "How a Two-Person AI News Desk Publishes Daily Without Burnou"
faq:
  - q: "Do you really need two people, or can one person run this loop?"
    a: "One person can run it, but then the same brain does selection and framing, and the claim gate is the first thing to get skipped on a busy morning. Two people keep the gates from collapsing into each other."
  - q: "How do you stop the machine from publishing something wrong?"
    a: "The build only runs when a human creates an `APPROVED` file, and drafts containing unverified claims refuse to render at all. Both are enforced in code, not in a policy document."
  - q: "What should happen when the drafting job fails on a weekday morning?"
    a: "Fall back to a shorter format you can produce by hand, post one line about what broke, and move the failed input to a quarantine directory instead of retrying silently."
---

Two people, one desk, something published every weekday morning. What makes that sustainable is not a clever prompt chain; it is a fixed daily loop with a deadline, four human gates, and alerts that fire when a job *doesn't* run. Here is the loop in the order the day actually happens.

## The daily loop is a schedule, not a mood

The whole cadence lives in one YAML file in the same repo as the templates. If it is not in the file, it does not happen. Nothing is triggered by someone remembering.

```yaml
# desk.yaml
timezone: America/New_York
jobs:
  - name: ingest
    cron: "10 6 * * 1-5"
    run: ./bin/ingest --sources feeds.yaml --out queue/raw/
    timeout: 20m
    writes: queue/raw/
  - name: cluster
    cron: "35 6 * * 1-5"
    run: ./bin/cluster --in queue/raw/ --out queue/clusters.json
  - name: draft
    cron: "0 7 * * 1-5"
    run: ./bin/draft --clusters queue/clusters.json --tpl tpl/ --out drafts/
  - name: linkcheck
    cron: "20 8 * * 1-5"
    run: ./bin/linkcheck drafts/*.md
  - name: build
    cron: "45 9 * * 1-5"
    run: ./bin/build --publish-flag drafts/APPROVED
    on_failure: page
```

Two things matter in that file. First, every job writes to a directory, so a failure shows up as a missing or stale artifact rather than a stack trace nobody reads. Second, `build` only runs when a file named `drafts/APPROVED` exists, and only a human creates that file.

The division of labor is narrow on purpose. One person is the operator: feeds, jobs, logs, the build. The other is the editor: what runs, what the headline says, what gets killed. The desk is designed so neither role needs more than an hour on a normal morning. When it takes longer, that is the signal something upstream broke, not that the day was busy.

## The four gates a human has to clear

Automation is good at volume and bad at judgment. So the desk only automates up to the point where judgment becomes necessary, and stops there.

| Gate | Machine | Human | What breaks if skipped |
|---|---|---|---|
| Selection | dedupe, cluster, rank by source trust | pick three to five items from the queue | the desk republishes press releases |
| Claim check | extract quotes, confirm links resolve | open the primary source and read it | a number is attributed to the wrong report |
| Framing | fill the template body | write headline and first sentence | the story is technically true and still misleading |
| Publish | build, render, schedule | create `APPROVED` | the wrong draft goes live |

The claim gate is the one people try to remove first, and it is the one that causes the most damage. A language model can tell you a link returns HTTP 200. It cannot tell you the linked page says something different from the summary it just wrote.

Note the asymmetry: only the last gate is irreversible. Everything before it writes to scratch space that can be deleted. That is deliberate. Cheap reversibility upstream buys the editor the right to move fast.

## What gets templated, and what never does

Five story shapes cover most days: release, funding, policy, model launch, roundup. Each shape is a markdown file with required fields and a matching prompt. Template and prompt version together in git, so you can tell which draft came from which instructions at the time it was generated.

```markdown
<!-- tpl/release.md -->
## What shipped
{{ claim }}  <!-- must cite primary_url -->
Source: {{ primary_url }} (retrieved {{ retrieved_at }})

## Why it matters
{{ consequence }}   <!-- human-written; render fails without it -->

## What is unverified
{{ open_questions }}
```

Drafts leave the machine as JSON with every claim tied to a source, then get rendered only if the build check passes:

```json
{
  "story_id": "2026-02-11-vendor-x",
  "shape": "release",
  "primary_url": "https://example.com/changelog",
  "claims": [
    { "text": "...", "supported_by": "https://example.com/changelog#v4", "verified": false }
  ],
  "status": "draft"
}
```

`verified` flips to `true` only when a human opens the URL. The build refuses to render a draft with unverified claims. That is the entire enforcement mechanism: a boolean and a build check, not a policy document.

Never templated: the headline, the first sentence, and the "why it matters" line. Those three carry the desk's judgment, and templating them is how you end up with a feed that reads like a feed.

## Failures surface as absence, not error messages

A cron job that crashes is easy. A cron job that silently does not run is what kills a daily publication. So the health check watches for absence and lives outside the pipeline, on a different box, under a different scheduler.

```bash
#!/usr/bin/env bash
# heartbeat.sh -- cron: */15 * * * *
set -euo pipefail
MARK=/var/lib/desk/last_success
MAX_AGE=5400   # 90 minutes

if [[ ! -f "$MARK" ]]; then
  curl -fsS "$ALERT_WEBHOOK" -d 'text=desk: no successful run on record'
  exit 0
fi

age=$(( $(date +%s) - $(stat -c %Y "$MARK") ))
if (( age > MAX_AGE )); then
  curl -fsS "$ALERT_WEBHOOK" -d "text=desk: pipeline stale ${age}s"
fi
```

Three other habits keep failures visible:

- **Quarantine instead of retry.** A job that fails twice writes its input to `queue/quarantine/` and exits. Silent retries hide the shape of a problem; a growing quarantine directory does not.
- **One line a day.** After publish, the operator posts a single line to the shared channel: what ran, what did not, what was quarantined. No dashboard nobody opens.
- **A fallback that is worse but always available.** If drafting fails, the desk publishes a short annotated link roundup. A weaker post beats a missing day, and it keeps the deadline honest.

The general pattern, what to do at 6am when something broke overnight, is worth reading separately: see [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/). The short version is to decide in advance what degrades, what stops, and who gets woken up. For a two-person desk the answer is that nothing wakes anyone before 7am except a stale heartbeat.

## What to do next

1. **Write the schedule before you write any prompts.** Create one `desk.yaml` with a handful of jobs and the directory each one writes. If you cannot name the artifact, you cannot tell whether the job worked. The [ultimate AI automation guide](/blog/ultimate-ai-automation-guide-2026/) covers the scheduling basics if you are starting from nothing.
2. **Make exactly one gate irreversible.** Everything upstream writes to scratch space; only the publish step requires a human-created file. That single choice removes most of the anxiety about running automation unattended.
3. **Add a heartbeat that alerts on staleness, not on exceptions.** Ninety minutes of silence should reach a human; a failed HTTP request at 3am should not.
4. **Version templates next to prompts.** One file per story shape, with required fields the renderer enforces, so a bad draft can be traced back to the instructions that produced it.
5. **If you are the non-coder in the pair, the operator role is learnable.** Ship With AI is a four-hour practical course, $39 one-time, that takes a non-coder from zero to a first working AI automation project. Scheduling, artifacts and failure handling are the parts worth doing first, because they are what let the editor stop thinking about the pipeline at all.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=blog&utm_medium=article&utm_campaign=two-person-ai-news-desk-rhythm) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
