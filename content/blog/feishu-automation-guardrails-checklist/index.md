---
title: "Guardrails for a Feishu Automation That Touches Real Data"
description: "A pre-flight checklist for Feishu automations that write to real records: scoping, minimum permissions, dry runs, audit logs, rollback, and approval gates."
date: "2026-10-07T08:00:00+08:00"
draft: false
slug: "feishu-automation-guardrails-checklist"
author: "Wayne Chang"
tags: ["feishu", "automation", "audit-logs", "permissions", "rollback"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xohjh"
product_price: "19"
product_brand: "Slashman Tools"
product_sku: "SMT-FSH"
product_category: "Software > Productivity"
product_currency: "USD"
seo_title: "Guardrails for a Feishu Automation That Touches Real Data"
faq:
  - q: "Does a Feishu bot need bitable:app just to read records?"
    a: "No. bitable:app:readonly covers reads, and you should add bitable:app only for the tables in your manifest after a clean dry run."
  - q: "How do I roll back a Feishu automation that wrote bad data?"
    a: "Store before/after values per field in an append-only log and replay the inverse batch update. For deletes, confirm the recycle bin and version history retention window in your tenant first."
  - q: "When should a Feishu automation require human approval?"
    a: "When it writes to watched fields such as owner, status or budget, when it posts to a chat with external guests, and for any delete, archive or cross-base move."
---

The first version of a Feishu automation usually works. The trouble starts on day three, when it writes into the wrong table, pings an external group at 02:00, or overwrites a field a human was editing. Tool selection is the easy part (the [2026 automation guide](/blog/ultimate-ai-automation-guide-2026/) covers that); what follows is the pre-flight checklist for a flow that is about to touch live records.

## 1. Scope the blast radius before you request a token

Write a manifest before you write code: the base token, the table ids, and the field names the flow may touch. Anything not in the manifest is a bug, not a feature.

Two rules do most of the work:

- **Read scope is wider than write scope.** Reading a whole base so you can compute a diff is fine. Writing should be limited to a named list of fields and nothing else.
- **No dynamic target discovery.** The moment your code does "find every table whose name matches /OKR/" you have turned a logic error into an incident. Hardcode the ids; keep them in config, not in a regex.

Decide identity early too. A tenant token acts as the app: stable, unaffected by staff changes, and broad. A `user_access_token` inherits one person's permissions and silently breaks when they change roles or leave. Scheduled flows should use the tenant token and constrain scope in code.

## 2. Permission minimums

Feishu scopes are granted per app, so over-granting is permanent until someone remembers to revoke it. Request the smallest set that survives a dry run.

| Capability | Scope | Grant when |
|---|---|---|
| Read one base | `bitable:app:readonly` | Always, for the base in the manifest |
| Write records | `bitable:app` | Only after a clean dry run |
| Send group messages | `im:message:send_as_bot` | Only if the flow posts, and only to named chats |
| Resolve names to `open_id` | `contact:user.base:readonly` | Only if you actually map people |
| Refresh user tokens | `offline_access` | Only for user-identity flows |

Avoid `drive:drive` unless you are genuinely manipulating files across the drive. Avoid running the app as a tenant administrator. Verify what you actually got:

```bash
# Tenant token for a custom app. Keep the secret in a secret manager, not in the repo.
resp=$(curl -s -X POST \
  'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"'"$FEISHU_APP_ID"'","app_secret":"'"$FEISHU_APP_SECRET"'"}')
TOKEN=$(echo "$resp" | jq -r .tenant_access_token)

# Probe the exact table you plan to write to. If this 403s, stop here.
curl -s "https://open.feishu.cn/open-apis/bitable/v1/apps/$APP_TOKEN/tables/$TABLE_ID/records?page_size=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items[0].fields | keys'
```

## 3. A dry-run pass is a mode, not a test you ran once

A dry run means the flow computes every intended operation, logs them, and executes none. It is not "call the API and undo it." Build it as a first-class mode that shares the same code path as the real run. If the dry run lives on a separate branch, it validates a program you will never ship.

Three passes, in order:

1. **Plan-only.** No network reads beyond schema. Output the operation list.
2. **Diff against live.** Read current records, compute what would change, print before/after per field.
3. **Apply with approval.** The same operations, plus a human gate.

```yaml
# flow.yaml
feishu:
  app_token: !env FEISHU_APP_TOKEN
  table_id: tblXXXXXXXXXXXX
  write_fields: [status, owner_open_id, due_date]   # manifest: nothing else
mode: dry_run          # dry_run | apply
approval:
  require_human: true
  channels: [ops-review]
limits:
  max_records_per_run: 50
  abort_on_field_mismatch: true
```

Idempotency belongs here too. Give every row a stable business key (`project_id + period`) and store the last-written value. Run the flow twice; the second run should produce an empty operation list. If it does not, you have non-determinism, and no amount of logging will fix ordering problems. That same discipline is what makes an [unattended agent runbook](/blog/runbook-for-unattended-ai-agents/) readable.

## 4. Audit logs you can actually query

One JSON line per operation, appended, never edited. The fields that earn their keep: `run_id`, `trace_id` (Feishu returns it in the `X-Tt-Logid` response header), `app_token`, `table_id`, `record_id`, `field`, `before`, `after`, `actor`, `dry_run`. Without `trace_id` you cannot ask Feishu support what happened; without `before` you cannot rebuild the rollback.

```python
import json, time

def log_op(sink, run_id, trace_id, record_id, field, before, after, dry_run):
    sink.write(json.dumps({
        "ts": time.time(), "run_id": run_id, "trace_id": trace_id,
        "table_id": TABLE_ID, "record_id": record_id, "field": field,
        "before": before, "after": after, "dry_run": dry_run,
    }, ensure_ascii=False) + "\n")
    sink.flush()

def rollback_entry(op):
    # For every forward write, emit the inverse update.
    return {"record_id": op["record_id"], "fields": {op["field"]: op["before"]}}
```

Write to a sink the automation cannot modify inside its own logic: a separate base, a log bucket, or a file opened append-only. A log the flow can rewrite will eventually agree with the bug.

## 5. Rollback and the human-approval threshold

Some writes are reversible, some are not. Batch field updates can be inverted with the values in your audit log. A message that already landed in a group chat cannot. A deleted record may be recoverable from the Bitable recycle bin or a record's version history, but check the retention window in your tenant before you depend on it, and export the affected records to JSON before any batch mutation.

Set the approval threshold by consequence, not by volume:

| Situation | Default action |
|---|---|
| Field updates inside the manifest, within row limits | Apply, log, report |
| Writes to a watched field (owner, status, budget) | Queue for human approval |
| Message to a chat with external guests | Always human |
| Delete, archive, or move between bases | Always human |
| Failures after midnight | Queue until morning; do not retry blindly |

Pair the threshold with [triage habits](/blog/triage-automation-failures-while-you-sleep/) so the 03:00 failure path is a queue, not a page. Re-run the full dry run after every scope change, because permission changes are code changes.

## What to do next

1. Write the manifest, base token, table id and field list, and delete every code path that discovers targets dynamically.
2. Request read-only scopes, run the probe request above, and only then add `bitable:app` for the tables you named.
3. Implement `dry_run` as a shared code path, then run the plan and diff passes against a staging base that mirrors production.
4. Add the append-only JSON log with `trace_id` and `before`/`after`, and generate the rollback file in the same run.
5. Set one approval rule this week, a watched field or any external chat, and confirm it actually blocks.

If standing up the bases your flow writes into is still ahead of you, the Feishu Template Marketplace ($19 one-time) collects twenty-plus ready-made Feishu/DingTalk templates for project tracking, OKRs, meeting notes and documentation. Starting from a template gives your manifest a stable table and field structure instead of one invented at 1 a.m.

## Get Feishu Template Marketplace

[**Feishu Template Marketplace**](https://slashmaster6.gumroad.com/l/xohjh?utm_source=blog&utm_medium=article&utm_campaign=feishu-automation-guardrails-checklist) — **$19**, one-time payment, instant download. See the full breakdown on the [review page](/blog/feishu-templates/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
