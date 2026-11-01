---
title: "No Agent Output Ships Unverified: The Handle-and-Check Rule"
description: "Every artifact an agent claims to have made needs a handle you can open yourself, and the handler must run the check before calling it done."
date: "2026-11-01T08:00:00+08:00"
draft: false
slug: "agent-output-handle-verification-rule"
author: "Wayne Chang"
tags: ["ai-agents", "verification", "automation", "orchestration", "workflow"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "No Agent Output Ships Unverified: The Handle-and-Check Rule"
faq:
  - q: "What if an agent genuinely cannot produce a handle for the work?"
    a: "Then the work is not done. Treat the output as a draft, send it back with the contract attached, and do not let it move downstream until a handle resolves from outside the agent's context."
  - q: "Does verification make the pipeline too slow?"
    a: "The checks are cheap: a file stat, an HTTP status code, one row lookup. The expensive failure is a downstream agent spending a full run building on an artifact that never existed."
  - q: "Can the agent just verify its own output?"
    a: "It can self-check as a first pass, but the handler must run the check independently. A self-report reproduces the same optimism that produced the false completion message in the first place."
---

An agent that reports "file created and deployed" is telling you a story about work, not showing you the work. The house rule for multi-agent pipelines is short: no output ships until the handler has opened a checkable handle for it. Everything below is about making that rule mechanical instead of aspirational.

## Why the completion message is the weakest part of the pipeline

An agent's final message is generated after the action, in the same channel as its reasoning, tuned to sound finished. It is the one part of the run that is never checked by the thing that produced it. When four agents hand work to each other, that optimism compounds: agent A says it wrote the file, agent B trusts the summary and builds on it, agent C publishes a page referencing content that may be a paragraph of intent.

The fix is not a better prompt asking agents to be honest. Prompts are advisory and fail silently at exactly the moment you need them. The fix is a contract: the agent must return a handle, and the receiver must resolve that handle independently. If the handle does not resolve, the task is not done, regardless of how confident the message reads. This is the same discipline as giving each layer of a stack one job, covered in [how to wire an AI dev stack so each layer has one job](/blog/upgrade-one-layer-ai-stack/).

Define "handler" as whoever receives the handoff: a downstream agent, a script, or a human reviewer. The handler owns the check. The producer never grades its own paper.

## What counts as a handle, by artifact type

A handle is anything that can be resolved by a different process than the one that made it. A path, a URL, a row ID, a commit SHA, a job ID. What counts as verification changes with the artifact, and it always means reading the artifact, not the description of it.

| Artifact | Handle | Verification that counts | Does not count |
|---|---|---|---|
| Repo file | Absolute path | `test -s`, tracked by git, expected headings present | "I wrote the file" |
| Published page | URL | HTTP 200 plus a string from the body | "Deployed successfully" |
| Database row | Table + primary key | `SELECT` returns the expected column values | "Inserted the record" |
| Deploy / job | Build or run ID | Provider API reports the terminal state | "Should be live now" |
| Pull request | PR number or URL | Open, has a diff, base branch matches | A branch name only |
| Outbound email | Message ID | ID resolves in the provider's API | "Sent the email" |
| Generated asset | Path + hash | Size above a floor, hash recorded | A base64 blob in chat |

The pattern: handle resolves, content matches what the task asked for, and the evidence is stored next to the run. Record the hash or status code you saw. When something breaks three days later, the difference between "verified" and "reported" is the only thing that tells you where the fault started.

## Put the contract in the task, put the check in the code

Ask for the handle when you dispatch the task, not when the answer comes back. A YAML contract travels with the job and gives the handler something to parse. This is the same reason scripts win over visual builders once a workflow has real branching: the check has to be expressible, as argued in [visual workflow builders vs scripts](/blog/visual-workflow-builder-vs-scripts/).

```yaml
id: release-notes-2026-05
agent: writer-2
must_return:
  - name: body
    kind: file
    pattern: "notes/v*/release-*.md"
    min_bytes: 400
  - name: published
    kind: url
    require_status: 200
acceptance:
  - exists
  - non_empty
  - tracked_by_git
  - contains_heading
on_fail: requeue_once_then_escalate
```

```bash
# Handler-side gate. Any failure exits non-zero, so it cannot read as success.
set -euo pipefail
handle="notes/v3/release-2026-05.md"

[ -s "$handle" ]                        # exists, not zero bytes
git ls-files --error-unmatch "$handle"  # tracked, not a stray /tmp artifact
grep -q '^## ' "$handle"                # has structure, not a stub
[ "$(wc -c < "$handle")" -gt 400 ]      # above the size floor from the contract

code=$(curl -fsS -o /tmp/page.html -w '%{http_code}' "$PUBLISHED_URL")
[ "$code" = "200" ] && grep -q "Release 2026.05" /tmp/page.html
sha256sum "$handle" >> .run/handles.log
```

For pipelines with mixed artifact types, one small dispatcher keeps the check honest:

```python
import hashlib, os, subprocess, urllib.request

def verify(kind, handle, min_bytes=1):
    """Resolve the handle directly. Never trust the agent's summary."""
    if kind == "file":
        if not os.path.isfile(handle):
            return False, "missing"
        size = os.path.getsize(handle)
        if size < min_bytes:
            return False, f"too small: {size}B"
        digest = hashlib.sha256(open(handle, "rb").read()).hexdigest()[:12]
        return True, f"sha256:{digest} size:{size}"
    if kind == "git_path":
        r = subprocess.run(["git", "cat-file", "-e", f"HEAD:{handle}"],
                           capture_output=True)
        return r.returncode == 0, "git_object"
    if kind == "url":
        try:
            with urllib.request.urlopen(handle, timeout=10) as resp:
                body = resp.read()
                return 200 <= resp.status < 300, f"status:{resp.status} bytes:{len(body)}"
        except Exception as exc:
            return False, f"unreachable: {exc}"
    return False, f"unknown kind: {kind}"
```

The dispatcher returns a reason string, not a boolean. "too small: 12B" tells the next agent what to redo. "false" tells it nothing and invites a guess.

## The one question that catches simulated work

When a report looks suspicious but you cannot say why, ask this:

> Does this check read the artifact, or does it read your description of the artifact?

A run that passes only because the summary says it passed is not verified. It is a rumor with formatting. The question has a second use: it catches the case where an agent built a plausible simulation of the work. A directory listing it printed, a URL it described but never fetched, a database row it constructed in its own scratch context. Real handles resolve outside the agent's context, for a process that shares nothing with it.

Common tells of simulated work:

- The handle only resolves inside the agent's sandbox, or lives under a temp path that survives one turn.
- The path has a plausible name but the file is a stub or a copy of the prompt.
- The URL returns 200 because it is the agent's own log page, not the published artifact.
- The ID changes on every mention, which means it was composed rather than received.
- Success is described but the exit code, hash, or provider status is absent.

A single rule of thumb: if you deleted the agent's final message, would the evidence still be there? If the work only exists in prose, it does not exist.

## Failure modes and the two-step recovery

Verification failures are cheap and should be common early. Handle them in two steps.

First, requeue once with the contract attached and the failed reason quoted back. Most misses are a wrong path or a truncated write, and one retry fixes them. Second, if the retry fails, downgrade the artifact to `draft` and route it to a human queue. Do not let a third attempt run: repeated failures on the same contract usually mean the task is underspecified, not that the agent is unlucky.

Order the checks by cost. Existence first, then type and size, then content, then provenance such as git tracking or a recorded hash. A missing file should never trigger an HTTP request. And log every check with the run ID and the handle, because the run history is the only thing that distinguishes a pipeline you trust from one you hope works. If you are still assembling that pipeline layer by layer, the [AI automation guide](/blog/ultimate-ai-automation-guide-2026/) covers where verification sits in the overall stack.

One more failure worth naming: a valid handle can point at the wrong artifact. The path exists, the file is real, and it is last week's notes. Content checks catch this only if they assert something specific. "Has a heading" is weak. "Contains the release date from the task input" is not.

## What to do next

1. Add a `must_return` block with a handle to every task definition you dispatch today. If a prompt currently asks for "a summary of what you did," change it to "the path, URL or ID, plus one line of what it contains."
2. Write the gate script for your three most common artifact types. File, URL, database row. Run it manually against the last five agent reports you accepted and see which ones fail. Fix nothing yet, just count.
3. Rewrite one acceptance check so it reads the artifact instead of the claim. Replace "agent confirmed sent" with a provider API lookup on the message ID.
4. Put the question on the team wall: does this check read the artifact, or the description of it?
5. If you are tracking several agents by hand across a shared drive, a dashboard with task routing and run history saves the bookkeeping. Cowork Pro is a one-time $59 download at https://slashmaster6.gumroad.com/l/xfhfps that does exactly that. It does not replace the check, but it gives the check a place to live.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=agent-output-handle-verification-rule) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
