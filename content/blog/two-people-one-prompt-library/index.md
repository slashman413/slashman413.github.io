---
title: "Case Study: Two People Maintaining One Prompt Library"
description: "How two maintainers run a shared prompt library: ownership rules, review cadence, duplicate resolution, and a deprecation policy that keeps prompts from rotting."
date: "2026-10-14T08:00:00+08:00"
draft: false
slug: "two-people-one-prompt-library"
author: "Wayne Chang"
tags: ["prompts", "process", "documentation", "case-study", "governance"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/diwoc"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-APL"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Case Study: Two People Maintaining One Prompt Library"
faq:
  - q: "Do you really need two owners for a prompt library used by one person?"
    a: "No. The value of the two-role split appears the moment a prompt is used in an automated flow, because someone other than the author needs to check that inputs, outputs and failure modes are stated. For solo work, drop the reviewer role and keep the frontmatter."
  - q: "Why deprecate a prompt instead of just deleting it?"
    a: "Deletion breaks anything that still references the prompt, often silently. A stale window plus a reference check lets you remove it with evidence that nothing imports it, which is cheaper than debugging an empty prompt response later."
  - q: "What is the simplest way to detect duplicate prompts?"
    a: "Start with the output shape. If two prompts take the same input but return different structures, they are not duplicates, they are two tools. If they return the same structure for the same task, keep the newer one and deprecate the other with a superseded_by field."
---

Most prompt libraries die the same way. One person builds a tidy folder, everyone copies prompts into their own notes, and six months later nobody knows which version is real. This is a design writeup of the opposite approach: a shared library maintained by exactly two people, with rules written down before the library had anything worth stealing. No effectiveness claims here, just the operating design.

## The two roles, and why they are not equal

Two maintainers does not mean two owners. Every prompt has one accountable owner and one reviewer. The owner is whoever first shipped a prompt that works in production. The reviewer is the other person, and their job is narrow: check that the prompt states its input shape, its output shape, and its failure mode.

We wrote this into the frontmatter of every prompt file, so ownership is visible without asking anyone.

```yaml
# prompts/ops/incident-summary.prompt.md
id: ops.incident-summary
version: 3
owner: mara
reviewer: devin
status: active            # active | deprecated | draft
created: 2025-11-04
last_reviewed: 2026-02-10
review_interval_days: 60
replaces: []              # ids this prompt supersedes
superseded_by: null
inputs:
  - incident_log: raw text, one incident per block
outputs:
  - json: {severity, timeline[], customer_impact}
known_limits: fails on logs with mixed timezones; ask for UTC first.
```

The reviewer never rewrites the prompt. They file a note and the owner decides. That single rule killed most of our arguments before they started, because "this prompt is wrong" became "this prompt is unclear about X," which is a much cheaper thing to fix.

## Review cadence that survives a busy month

A calendar-based review fails the moment both people get busy, because skipping a week feels harmless. We tied review to change instead: any edit to a prompt bumps `version` and resets `last_reviewed`. Reviews are not a weekly meeting, they are a pull request.

What we do commit to is a quarterly sweep, done on the same day by both people, with a script that finds prompts that have aged out.

```bash
#!/usr/bin/env bash
# stale-prompts.sh — list prompts past their review interval
set -euo pipefail

TODAY=$(date +%s)
find prompts -name '*.prompt.md' -print0 | while IFS= read -r -d '' f; do
  reviewed=$(grep -m1 '^last_reviewed:' "$f" | awk '{print $2}')
  interval=$(grep -m1 '^review_interval_days:' "$f" | awk '{print $2}')
  status=$(grep -m1 '^status:' "$f" | awk '{print $2}')
  [ "$status" = "active" ] || continue
  age=$(( (TODAY - $(date -j -f %Y-%m-%d "$reviewed" +%s 2>/dev/null || date -d "$reviewed" +%s)) / 86400 ))
  if [ "$age" -gt "$interval" ]; then
    printf '%s\tage=%sd\tinterval=%sd\n' "$f" "$age" "$interval"
  fi
done
```

The output is short by design. If the sweep returns more than a dozen prompts, the intervals are wrong, not the maintainers. We set intervals by blast radius: prompts that touch customer-facing text get 30 days, internal research prompts get 120.

## When two prompts do the same job

The first duplicate is always accidental. Someone writes a summarizer that overlaps an existing one, and both survive because neither is obviously worse. Left alone, this becomes the real maintenance cost of a shared library.

Our rule: overlapping prompts are not merged by default. They are resolved by picking a winner and deprecating the loser, because merging two prompt texts produces a prompt neither owner understands. Here is the decision table we actually use.

| Situation | Action | Who decides |
|---|---|---|
| Same task, same output shape | Keep newer, deprecate older, add `superseded_by` | Owner of the newer prompt |
| Same task, different output shape | Keep both, rename to encode the shape (`-json`, `-prose`) | Both, in a PR |
| Same task, one has known limits not covered by the other | Keep both until limits are documented on the winner | Reviewer flags, owner decides |
| Prompt is a strict subset of another | Delete outright, no deprecation window | Owner |
| Unclear which is better | Both go to `draft`, neither is used in automation | Both, within one week |

The last row matters more than it looks. "Unclear" is a valid state, and parking both prompts as drafts stops the library from accumulating two competing answers to the same question. Drafts are not callable by any script; the runner only loads `status: active`.

## The deprecation policy

Deprecation without a sunset date is just hoarding. Every prompt we retire gets the same three-step treatment, and the steps are cheap enough that we never skip them.

1. Mark `status: deprecated`, set `superseded_by`, and leave the file in place. Never delete on day one.
2. Add a `removal_date` 90 days out for anything referenced by a script, 30 days for anything only used interactively. If you are still standing up a small internal automation pipeline, the tracking habits in [/blog/triage-habits-for-automation-that-fails-while-you-sleep/](/blog/triage-automation-failures-while-you-sleep/) are worth copying before you promise a library to anyone else.
3. On the removal date, run the reference check. If anything still imports the prompt, it fails loudly instead of silently resolving to nothing.

```python
# check_refs.py — refuse to delete a prompt that is still referenced
import sys, pathlib, re

def refs(prompt_id: str) -> list[str]:
    hits = []
    for p in pathlib.Path(".").rglob("*"):
        if p.suffix not in {".py", ".yaml", ".yml", ".json"} or not p.is_file():
            continue
        text = p.read_text(errors="ignore")
        if re.search(rf"\b{re.escape(prompt_id)}\b", text):
            hits.append(str(p))
    return hits

if __name__ == "__main__":
    target = sys.argv[1]
    found = refs(target)
    if found:
        print(f"{target} still referenced in:")
        print("\n".join(found))
        sys.exit(1)
    print(f"{target} is safe to remove")
```

The check returns exit code 1 on purpose, so it can sit in CI or a pre-commit hook. A deprecation that cannot fail a build is a suggestion, not a policy.

Two more rules keep this from drifting. First, the library is plain files in one git repo, no database, no UI. Two people can review a diff; nobody reviews a row. Second, the changelog is the git log, and the commit message format is `prompt: <id> v<n> — <reason>`. That is enough history to answer "why did this change" without maintaining a separate document.

## What to do next

- Write the frontmatter schema before the second prompt exists. Owner, reviewer, status, review interval, and supersession fields are the whole contract.
- Pick blast-radius intervals today: 30 days for anything customer-facing, 90-120 for internal. Put them in the file, not in someone's head.
- Commit `stale-prompts.sh` and `check_refs.py` to the repo this week. Even with two maintainers, the scripts decide what gets reviewed, not mood.
- Resolve the first duplicate by deprecating, not merging. Rename by output shape when both prompts deserve to live.
- Set a default sunset window (90 days for scripted prompts, 30 for interactive) so removal dates are automatic instead of negotiated.

If you would rather start from prompts that already state their inputs, outputs and limits than write that frontmatter yourself, the AI Prompt Library ($39 one-time) is a set of copy-paste templates grouped by job: writing, coding, research and ops. The structure described above is what we added on top of it.

## Get AI Prompt Library

[**AI Prompt Library**](https://slashmaster6.gumroad.com/l/diwoc?utm_source=blog&utm_medium=article&utm_campaign=two-people-one-prompt-library) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-prompt-library/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
