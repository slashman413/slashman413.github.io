---
title: "How a Multi-Agent Dashboard Routes Work Without Chaos"
description: "How routing rules are built from platform, match, owner and priority, how conflicts resolve, and how run history makes agent failures debuggable."
date: "2026-10-09T08:00:00+08:00"
draft: false
slug: "multi-agent-dashboard-task-routing"
author: "Wayne Chang"
tags: ["ai-agents", "orchestration", "task-routing", "observability", "automation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "How a Multi-Agent Dashboard Routes Work Without Chaos"
faq:
  - q: "What happens when two routing rules match the same task?"
    a: "The router applies a defined tiebreaker, usually an ordered list plus a priority integer. Two rules with equal priority that can both match should be treated as a configuration error rather than resolved silently, because the outcome otherwise changes when someone reorders the file."
  - q: "Why log rules that were skipped instead of only the one that matched?"
    a: "Because skipped rules with a reason string are the only way to tell whether the router selected the right agent or fell through to the wrong one. Without them, run history shows that an agent ran but not why it was chosen."
  - q: "Should routing rules live in code or in a dashboard UI?"
    a: "Treat them like firewall rules: declarative, ordered, and reviewed in diffs. A UI is fine for editing as long as the exported config is the single source of truth and priority ties fail loudly at load time."
---

Routing is the part of multi-agent orchestration that looks trivial until two rules match the same task. A multi-agent dashboard is, mechanically, an ordered list of conditions, a destination for each match, and an audit log of what happened. The audit log is what separates a system you can debug from one you can only restart.

## What a routing rule is actually made of

Four fields do the real work. Two more decide what happens when nothing matches.

| Field | What it holds | Why it exists |
|---|---|---|
| Platform | Where the event arrives: GitHub, Slack, email, webhook, cron | Constrains which fields you are allowed to match on |
| Match | The condition: label, keyword, regex, sender domain, channel | Decides whether this rule applies |
| Owner | The agent or human queue that receives the task | Determines available tools and expected output |
| Priority | An integer | Breaks ties when more than one rule matches |
| Fallback | Where unmatched tasks go | Prevents silent drops |
| Terminal | Whether a match stops further evaluation | Prevents accidental fan-out |

Platform comes first because it constrains everything else. A GitHub issue gives you labels, title, body and author. An email gives you sender domain and subject. Slack gives you channel and message text. Matching on structured fields (labels, channels, sender domains) is durable; matching on free text is not, because people change how they write and you will not notice the rule stopped firing.

A minimal route table in YAML looks like this:

```yaml
routes:
  - id: gh-bug-regression
    platform: github
    match:
      event: issues.opened
      label_any: [bug, regression]
    owner: triage-agent
    priority: 20
    terminal: true
    fallback: manual-queue

  - id: gh-docs
    platform: github
    match:
      event: issues.opened
      title_regex: "(?i)^docs:"
    owner: docs-agent
    priority: 10
    terminal: true
```

Owners should be single agents with a defined toolset and a defined output contract. "Send it to whichever agent is free" is not an owner; it is a scheduling decision pretending to be routing.

## When two rules conflict

Take an issue titled `docs: fix broken link` that also carries the label `bug`. Both routes above match. Three resolutions are defensible, and they are not equal.

| Strategy | How it resolves | Failure mode | Good fit |
|---|---|---|---|
| Ordered list, first match wins | Evaluated top to bottom; first match ends evaluation | Reordering the file silently changes behaviour | Small rule sets reviewed in diffs |
| Specificity score | Counts matched conditions, weighted | Weighting is arbitrary and hard to predict | Rarely worth the complexity |
| Explicit priority integer | Highest number wins | Ties, with no defined order inside a priority | Large rule sets with stable categories |

The practical combination is an ordered list whose sort key is the priority integer, plus a documented rule that priority ties are a configuration error. A router that silently picks one of two equal-priority matches is a router you will spend a Friday night debugging. If you cannot tell which rule wins by reading the file top to bottom, the router is doing too much work.

Two more mechanics to decide early. First, terminal versus non-terminal: the default should be that the first match stops evaluation, and deliberate fan-out (run a summariser and notify a human) should be an explicit flag per rule rather than something that emerges. Second, self-authorship: if your agent posts a comment that triggers a new event, and that event matches the same rule, you have a loop. Most routers let you ignore events authored by the agent's own identity. Turn that on before you turn on anything else.

## Run history is the debugging interface

A run record that is not useful six weeks later is not a run record. The fields that earn their storage:

```json
{
  "run_id": "8f3c1a4e",
  "route_id": "gh-bug-regression",
  "owner": "triage-agent",
  "matched_on": ["label:bug"],
  "evaluated": [
    {"route_id": "gh-docs", "result": "skipped", "reason": "title_regex no match"},
    {"route_id": "gh-bug-regression", "result": "matched"}
  ],
  "input_ref": "sha256:1f9b...",
  "tools_called": ["github.issue.get", "github.comment.create"],
  "status": "failed",
  "error": {"class": "transient", "stage": "github.comment.create", "message": "secondary rate limit", "retryable": true},
  "retry_of": null
}
```

The `evaluated` array is the part people skip and the part that saves the most time. Without it, run history tells you an agent ran. With it, run history tells you why the router chose that agent, and which rule would have been a better fit. The second question is the one you actually ask the morning after a pipeline misfired.

What you keep in the input snapshot is a context engineering decision in miniature; see /blog/what-is-context-engineering/ for how much input an agent genuinely needs versus what you keep for replay. Store enough to reproduce the failure, not the whole payload.

Retry policy should be per error class, not global:

- **transient** — rate limits, timeouts, 5xx. Retry with backoff.
- **configuration** — missing credential, unknown tool name, malformed route. Do not retry; notify the owner.
- **input** — payload the agent cannot parse, empty body, unexpected schema. Do not retry without transforming first.
- **model** — refusal, truncated output, schema violation on structured output. Retry once with a stricter instruction, then hand off.

A blanket "retry three times" sends configuration errors through three identical failures and buries the real cause in the log.

## Failure modes that look like agent problems

Most incidents blamed on an agent are route table incidents. The recurring ones:

**Double execution.** Two non-terminal rules match and both fire. The task is done twice, possibly differently. Symptom: duplicate comments, duplicate tickets.

**Self-triggered loops.** The agent's own output re-enters as an event. Symptom: a thread that grows without human input. The containment habits in /blog/triage-automation-failures-while-you-sleep/ apply directly here.

**Stale routes.** A channel gets renamed or a label is retired, the rule stops matching, and everything falls through to fallback. Nobody notices because fallback works. Symptom: an agent that has not run in weeks.

**Fallback black holes.** Fallback points at a human inbox nobody owns. Unmatched work accumulates quietly until someone looks.

**Truncated input snapshots.** The run record keeps a hash or a clipped body, so a failure is unreproducible. Symptom: bugs that only reproduce in production.

If you are still deciding where routing should live, /blog/workflow-builder-vs-plain-script/ covers when a workflow engine earns its overhead. Route tables sit closer to firewall rules than to business logic: declarative, ordered, reviewed in diffs, and boring on purpose.

## What to do next

1. **Write every routing rule into one ordered file** this week, even if the rules currently live in three places. Ordering them will surface at least one conflict you did not know you had.
2. **Make priority ties a load-time error.** If two rules can match the same task with equal priority, fail loudly instead of picking one silently.
3. **Add an `evaluated` array to run records**, logging skipped rules with a reason string. This is the highest-value single change to debugging, and it is cheap.
4. **Split retry policy by error class.** Transient retries, configuration notifies, input transforms, model retries once. One global retry count is not a policy.
5. **Audit for loops and stale routes.** Enable self-authorship filtering, then grep your route table for channel names and labels that no longer exist in the source system.

Cowork Pro is a $59 one-time dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history — useful if you would rather configure an ordered route table and inspect per-run match decisions than build that layer yourself.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=blog&utm_medium=article&utm_campaign=multi-agent-dashboard-task-routing) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
