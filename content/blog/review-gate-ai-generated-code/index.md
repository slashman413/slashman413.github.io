---
title: "Set Up a Review Gate So AI-Written Code Does Not Ship Blind"
description: "A reusable checklist, a CI script, and clear rules for when a human must actually read an AI-written diff before it merges."
date: "2026-10-28T08:00:00+08:00"
draft: false
slug: "review-gate-ai-generated-code"
author: "Wayne Chang"
tags: ["code-review", "ai-coding", "ci", "workflow"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Set Up a Review Gate So AI-Written Code Does Not Ship Blind"
faq:
  - q: "Should a human approve every AI-generated pull request?"
    a: "Approve every merge, yes, but not every line. Route human attention to sensitive paths, new dependencies and anything the automated gate flags, and skip the full read for generated fixtures, lockfiles and formatting."
  - q: "How many items should the review checklist have?"
    a: "Five or fewer, each with a yes/no pass condition answerable from the diff. Anything a script can decide should move into CI instead of sitting on the human list."
  - q: "What should happen when the reviewer does not respond?"
    a: "Have a named default owner and a deadline, and treat silence as a no rather than a yes. The owner then either merges after the flags are addressed or closes the PR."
---

The model's code compiles, the tests it wrote alongside it pass, and the diff is 600 lines across nine files. None of that means the change is correct. A review gate is the small, written set of checks that stands between "the model wrote it" and "it is in production" — and it only survives if it is short enough that people actually run it.

## Decide what the gate is checking

A gate answers three questions in a fixed order: does the diff match the intent, how far does a mistake travel, and how do we undo it. That is the whole job. If you find yourself adding a fourth purpose, you are probably building a quality culture, not a gate. For the wider picture of where this fits in an automation pipeline, see the [automation framework guide](/blog/ultimate-ai-automation-guide-2026/).

AI-written code fails differently from human code. It is rarely sloppy; it is plausible. It matches your style, imports your helpers, and names variables the way the rest of the repo does. The failures that survive a skim are narrow ones: a `catch` block that swallows the error, a parameter the real SDK does not accept, a retry loop that never sleeps, a quiet new dependency, a hardcoded key, and a test that asserts the implementation it was handed rather than the behavior you asked for.

So the gate is not "read everything carefully." It is a routing decision about where human attention buys the most.

| Gate model | What it catches | What it misses | Cost per PR | Use when |
|---|---|---|---|---|
| Full human read of every line | Intent mismatch, odd structure, quiet scope creep | Very little, but it does not scale | High | Low volume, high blast radius: auth, billing, migrations |
| Checklist only, no code read | Process gaps: no test, no rollback plan, undeclared dependency | Logic errors of every kind | Low | Generated docs, fixtures, formatting, config |
| Automated gate plus targeted human read of flagged hunks | Secrets, missing tests, dependency drift, sensitive paths | Subtle bugs in unflagged code | Medium | Default for any repo where the model writes most of the diff |
| Sign-off from someone who never opened the diff | Nothing | Everything | Looks free, is not | Never. This is ceremony |

The right-hand column is the decision you are actually making. Most teams drift into the last row by accident.

## Write the checklist once, as a file

A wiki page gets stale and nobody reads it twice. A checklist in the repo gets versioned, gets reviewed itself, and appears in the diff. Keep it to five items or fewer. Anything longer than a screen is skimmed, and a skimmed checklist is worse than none because it manufactures confidence.

```yaml
# gate-checklist.yml — repo root, reviewed like code
version: 1
questions:
  - id: intent
    ask: Does every changed hunk serve the ticket linked in the PR description?
    pass: No drive-by refactors, no renamed files the ticket did not ask for.
  - id: surface
    ask: What new surface did this add — dependency, network call, credential read, file write, migration?
    pass: Each new surface is named in the PR description and approved by the owner of that area.
  - id: failure
    ask: What happens on timeout, an empty response, or malformed JSON?
    pass: The error path is visible in the diff, not swallowed by a bare except or an empty catch.
  - id: rollback
    ask: Can this be undone with a single revert commit?
    pass: Yes, or the PR states the migration needed and who runs it.
  - id: proof
    ask: What command shows this works?
    pass: A test or runnable script in the repo, quoted in the PR body with its output.
```

Every question has a yes/no pass condition that a reviewer can answer from the diff alone. If a question requires the reviewer to run something, say that explicitly — otherwise it silently becomes a no-op. And when a check cannot be answered yes/no, it is not a checklist item, it is a discussion, and discussion belongs in a design note.

## Automate the mechanical half so people review judgment

Anything a script can decide should never cost human attention. Secrets, sensitive paths, dependency changes and source-without-test are all mechanical. Put them in a script that runs on every pull request and fails loudly in seconds.

```bash
#!/usr/bin/env bash
# gate.sh — run from CI on pull_request
set -euo pipefail
BASE="${BASE_REF:-origin/main}"
CHANGED=$(git diff --name-only "$BASE"...HEAD)
FAIL=0

# 1. Sensitive paths require a named owner on the PR
if echo "$CHANGED" | grep -Eq '^(src/auth/|src/billing/|migrations/|infra/)'; then
  if [[ -z "${GATE_OWNER:-}" ]]; then
    echo "BLOCK: sensitive path changed, GATE_OWNER not set"; FAIL=1
  fi
fi

# 2. Credential-shaped strings in the diff
if echo "$CHANGED" | xargs -r grep -nE '(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16})' 2>/dev/null; then
  echo "BLOCK: credential-shaped string in the diff"; FAIL=1
fi

# 3. Source changed, no test touched
SRC=$(echo "$CHANGED" | grep -E '^src/.*\.(ts|py)$' | grep -v '\.test\.' || true)
TESTS=$(echo "$CHANGED" | grep -E '(^tests/|\.test\.|_test\.py$)' || true)
if [[ -n "$SRC" && -z "$TESTS" ]]; then
  echo "BLOCK: source changed with no test change"; FAIL=1
fi

# 4. Dependency lines changed — flag, do not block
if git diff "$BASE"...HEAD -- package.json | grep -qE '^\+\s+"[^"]+":\s*"'; then
  echo "NOTE: dependency block changed; reviewer must confirm pinning and package identity"
fi

exit "$FAIL"
```

Start with three rules, not fifteen. A gate that fires on everything gets bypassed with an admin merge within a month, and once bypass is normal the gate is decorative. Treat the script as one job in a stack where each layer has [exactly one responsibility](/blog/upgrade-one-layer-ai-stack/).

## Where a human has to look, and where sign-off is ceremony

A human must read the diff when intent is ambiguous, when the change touches auth, billing, migrations or infrastructure, when a new dependency appears, when the model's prompt or tool definitions change, or when the code writes to production data. Those are the cases where a wrong answer costs more than the minutes it takes to find it.

Sign-off is ceremony in all of these cases: formatting-only changes, lockfile churn, regenerated fixtures, doc typos, and version bumps that CI already validated. So is an approval from someone who never opened the diff, a second approval on a twenty-line change, and any approval step that happens after merge. A signature that costs nothing to give protects nothing — it just moves the blame later.

The tell is simple. Ask the approver what they checked. If the answer is "it looked fine," the step is not a gate.

## Keep the gate from becoming the stall

Gates fail by getting slow, not by getting wrong. Four rules keep the queue moving:

**Cap the diff size.** If a PR is too large to judge in a sitting, send it back to be split rather than approving it on trust. Model output tends to arrive as one giant commit; split the ticket instead. Milestone-sized changes are easier to gate than one heroic merge, which is the argument in [break an AI build into milestones](/blog/ai-build-milestones-that-ship/).

**Timebox the review.** Give the reviewer a fixed window. If judgment does not form inside it, the problem is the PR, not the reviewer.

**Name a default owner and a deadline.** If the assigned reviewer has not responded in one business day, the owner decides: merge with the flags addressed, or close. Silence is a no, never an implicit yes.

**Rotate and prune.** The same person reviewing every AI-written diff becomes a rubber stamp quickly. Once a month, look at which rules actually blocked something; a rule that never fires either never mattered or is broken.

## What to do next

1. Add `gate-checklist.yml` to your repo root today, trimmed to five questions, each with a yes/no pass condition.
2. Write `gate.sh` with three rules only — secrets, sensitive paths, source-without-test — and wire it to `pull_request` in CI.
3. List your sensitive paths explicitly, with a named owner next to each one, and add that list to the PR template.
4. Delete one approval step this week that nobody on the team can justify in a sentence.
5. Set the escalation rule in writing: one business day, then the owner decides.

If you are the person on the team who is not the one reading diffs — a founder or a non-coding operator wiring automations yourself — it helps to have built one end to end. Ship With AI is a four-hour practical course that takes a non-coder from zero to a first working AI automation project. It is $39 USD, one-time, at https://slashmaster6.gumroad.com/l/mgtpcn.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=review-gate-ai-generated-code) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
