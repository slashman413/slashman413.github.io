---
title: "Use Run History as an Audit Trail, Not a Log Dump"
description: "Filter agent runs by failure and changed artifacts, rebuild the decision chain for one task, and catch runs that report success with nothing to show."
date: "2026-10-27T08:00:00+08:00"
draft: false
slug: "agent-run-history-audit-trail"
author: "Wayne Chang"
tags: ["ai-agents", "audit-trail", "observability", "automation", "run-history"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xfhfps"
product_price: "59"
product_brand: "Slashman Tools"
product_sku: "SMT-CWP"
product_category: "Software > AI Tools"
product_currency: "USD"
seo_title: "Use Run History as an Audit Trail, Not a Log Dump"
faq:
  - q: "What should a single agent run record contain?"
    a: "A run id, a parent id or request id, the digest of the prompt and context that ran, tool calls with the paths they touched, the hash of every artifact written, the verifier result, and the exit status. Without the artifact hashes and the verifier result, you have a log, not an audit trail."
  - q: "How do I audit an agent that only returns chat text?"
    a: "Treat the reply as an artifact: store it, hash it, and define a check such as required fields, schema validity, or a length floor. If the output is never stored and never checked, there is nothing to audit and a success status means only that the model responded."
  - q: "The dashboard says the run succeeded but the file is empty. Which is right?"
    a: "The file. Compare the artifact hash and the file size to the run record; a zero-byte file with a fresh modification time means the write happened and produced nothing. The dashboard row is a summary derived from the agent's self-reported status, so a disagreement is a reporting bug on the dashboard side."
---

Most agent dashboards give you a green checkmark, a duration, and a truncated blob of output. That is a claim, not evidence. An audit trail is the smallest set of records that lets you answer, days later, what an agent actually changed and how you know it changed.

## Separate the log dump from the audit trail

A log is chronological text written for a human debugging right now: `starting task`, `calling tool`, `done`. An audit trail is keyed and joinable. Every run points at a task, every task points at one or more artifacts, and every artifact has a content hash you can check without trusting the agent.

The gap shows up when you ask a question the log was never built for: which runs this week touched the pricing page and wrote nothing? A log has no answer. A run record does. If your current setup is a pile of scripts and cron entries, the framing in the [automation guide](/blog/ultimate-ai-automation-guide-2026/) applies here too: the wiring is the easy part, the record of what ran is the part you keep.

| Field | Typical log | Why the audit needs it |
|---|---|---|
| `run_id` | sometimes | joins the run to artifacts and to the next run downstream |
| `parent_run_id` | almost never | lets you walk the chain backwards to the request |
| input digest | no | proves which prompt and which context version ran |
| tool calls with paths | partial | shows which files were touched, not just which tools were named |
| artifact hashes | no | proves output changed, and whether it changed back |
| verifier result | no | separates "process exited" from "work is correct" |

Keep one record per run, append-only. Do not edit a record after the fact; write a second record that references the first. A minimal shape that survives a real dashboard:

```json
{
  "run_id": "run_01J8QK",
  "parent_run_id": "req_4471",
  "task_id": "draft_refund_policy",
  "agent": "writer@v3",
  "started_at": "2026-02-11T09:14:02Z",
  "ended_at": "2026-02-11T09:16:41Z",
  "exit_status": "ok",
  "inputs": {"prompt_sha256": "9f1c0e...", "context_ids": ["doc_812", "doc_815"]},
  "tool_calls": [
    {"tool": "read_file", "args_sha256": "3ab7d1..."},
    {"tool": "write_file", "path": "drafts/refund.md", "bytes_written": 0}
  ],
  "artifacts": [
    {"path": "drafts/refund.md", "sha256": "e3b0c442...", "changed": false}
  ],
  "verifier": {"ran": true, "passed": false, "reason": "empty_file"}
}
```

Two details carry more weight than the rest. `bytes_written: 0` sitting next to `exit_status: ok` is the contradiction you are hunting. And `e3b0c442...` is the SHA-256 of the empty string; when that hash appears as an artifact, the file was created and never written.

## Filter to failed or changed runs

No one reviews four thousand rows. Three filters do most of the work, and each misses something different.

| Filter | Catches | Misses |
|---|---|---|
| `exit_status != "ok"` | crashes, timeouts, auth failures | silent no-ops that exit 0 |
| no artifact changed | the agent that finished and wrote nothing | tasks whose job is to decide, not write |
| artifact hash equals the previous run | re-emitting last week's output | first-time failures |
| `verifier.ran == false` | work nobody checked | a verifier that checks the wrong thing |
| duration far from the task's own median | hangs and retry storms | clock skew, async callbacks |

One query for a JSONL run log, one for a SQLite table, covers a daily pass:

```bash
jq -r 'select(
    .exit_status != "ok"
    or ([.artifacts[].changed] | any | not)
    or (.verifier.ran == false)
  )
  | [.run_id, .task_id, .exit_status, (.verifier.reason // "-")] | @tsv' runs.jsonl
```

```bash
sqlite3 runs.db <<'SQL'
SELECT r.run_id, r.task_id, r.exit_status,
       COUNT(a.path) AS artifacts,
       COALESCE(SUM(a.changed), 0) AS changed
FROM runs r
LEFT JOIN artifacts a ON a.run_id = r.run_id
WHERE r.started_at >= datetime('now', '-7 days')
GROUP BY r.run_id
HAVING changed = 0
ORDER BY r.started_at DESC;
SQL
```

The second query is the one that earns its keep. Runs that exited cleanly and changed nothing are exactly the ones a pass/fail dashboard hides.

## Reconstruct the decision chain for one task

Pick one run, ideally one that looked fine, and rebuild it by hand. The goal is to find where the record goes silent, because that silence is the part you cannot audit. Do it in this order:

1. Read `inputs` before `artifacts`. Was the expected prompt version and context actually passed?
2. Walk `tool_calls` in sequence. A write with zero bytes, or a read of a path you did not expect, is a finding.
3. Compare each artifact hash to the hash for the same path in the previous run. Same hash means the file did not change, whatever the summary claims.
4. Read the verifier last. If it did not run, everything above is description rather than proof.
5. Follow `parent_run_id` backwards to the request, then forwards to whoever consumed the artifact. Multi-agent chains break most often at that handoff, which is the same problem covered in [routing tasks without a bottleneck agent](/blog/routing-multi-agent-tasks/).

A small script makes step 2 and 3 mechanical:

```python
import json

def explain(run, prev_hashes):
    lines = [f"{run['run_id']} task={run['task_id']} agent={run['agent']}"]
    for c in run["tool_calls"]:
        target = c.get("path") or c.get("args_sha256", "?")
        written = c.get("bytes_written", "")
        lines.append(f"  tool {c['tool']:<10} {target} {written}")
    for a in run["artifacts"]:
        old = prev_hashes.get(a["path"])
        state = "unchanged" if old == a["sha256"] else "changed"
        lines.append(f"  artifact {a['path']} {state} sha={a['sha256'][:8]}")
    v = run.get("verifier") or {}
    lines.append(f"  verifier ran={v.get('ran')} passed={v.get('passed')} reason={v.get('reason')}")
    return "\n".join(lines)
```

## The succeeded-but-produced-nothing pattern

This is the expensive failure mode because it is invisible on a dashboard and costly downstream: the next agent consumes an empty or stale file and builds on top of it. The signature is consistent, a run with `exit_status: ok`, a completion message in prose, and no artifact you can point at. The usual variants:

- **Empty write.** The file exists at zero bytes. Often a template rendered with a missing variable.
- **Wrong path.** The agent wrote `output/final_v2.md` while the consumer reads `output/final.md`. Both exist; only one is current.
- **Prose-only deliverable.** The task asked for a file and the agent answered in chat. Chat is not in the artifact list, so nothing verifiable exists.
- **Re-emit.** The agent could not decide, so it wrote back the previous version under a fresh timestamp.
- **Unverified write.** Real content, no verifier configured. The file changed but nobody knows whether it is right.

The fix is to fail closed in the wrapper, not in the prompt. If a task declares an output path, mark the run failed when that path is missing, zero bytes, or identical to the previous hash. "Check your own work" written into a prompt is not a check, because the agent grades itself. If you are still deciding whether that wrapper should be a script or a graph, [this comparison](/blog/workflow-builder-vs-plain-script/) covers the tradeoff.

## When the dashboard row and the artifact disagree

Trust order: the artifact first, then the run record, then the dashboard. Not because dashboards lie, but because of what each one measures. The row is usually derived from the agent's self-reported status, written by the same process that may have failed. "Completed" often means the process exited, not that the work met spec. Retries collapse into one row per task, so the dashboard shows the last attempt while the file on disk came from the first. Async writes can land the row before the file is flushed.

Reconcile in this order: hash the file and compare it to the artifact hash in the record; check size and mtime, since a zero-byte file with a fresh mtime means the write happened and wrote nothing; check the downstream consumer's input list; only then open the dashboard. If a hash match contradicts the dashboard, the dashboard is wrong, and that is a reporting bug worth fixing quickly, because a dashboard that disagrees with disk teaches people to ignore it.

## What to do next

1. Add four fields to your run record this week: `parent_run_id`, input digest, artifact hash list, and verifier result. Backfill nothing; start with new runs.
2. Run the zero-changed-artifacts query daily for a week and read the results. You will find at least one agent that has been reporting success into an empty file.
3. Rebuild one recent run by hand using the five steps above, and write down every place the record was silent. That list is your schema backlog.
4. Put the trust order in writing wherever your team handles incidents: artifact, then run record, then dashboard. When they disagree, open the file first.
5. If run history is scattered across cron jobs and shell scripts, Cowork Pro ($59 USD, one-time) is a dashboard for organising and orchestrating multiple AI agents on real projects, with task routing and run history. It is available at https://slashmaster6.gumroad.com/l/xfhfps.

## Get Cowork Pro

[**Cowork Pro**](https://slashmaster6.gumroad.com/l/xfhfps?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=agent-run-history-audit-trail) — **$59**, one-time payment, instant download. See the full breakdown on the [review page](/blog/cowork-pro/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
