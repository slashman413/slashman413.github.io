---
title: "Handling Secrets When There Is No Platform Team"
description: "A practical baseline for solo developers: one source of truth, least-privilege keys, a rotation you have rehearsed, and a revocation list for the day something leaks."
date: "2026-09-27T08:00:00+08:00"
draft: false
slug: "handling-secrets-without-platform-team"
author: "Wayne Chang"
tags: ["secrets", "security", "devops", "solo-operator", "rotation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Handling Secrets When There Is No Platform Team"
faq:
  - q: "Is a private git repository safe for secrets?"
    a: "No. Clones, forks, CI caches and anyone who ever had read access keep the value, and rewriting history does not reliably reach all of them. Assume anything committed is public and rotate it."
  - q: "How often should I rotate keys if nothing has leaked?"
    a: "Rotate on personnel changes, on any suspected exposure, and on a schedule you will actually keep, such as quarterly for high-scope credentials. The rehearsed procedure matters more than the calendar."
  - q: "What is the first thing to do when a key leaks?"
    a: "Revoke it at the provider before investigating. Killing the credential limits exposure immediately; log review and cleanup can happen afterward without a live key sitting in the wild."
---

Most teams of one don't think about secrets until the day they have to. A token in a commit, a key pasted into a support chat, a `.env` that three services read with the same admin credential. Nobody is going to catch that for you, so the baseline has to be small enough to survive a busy week and specific enough to act on at 2am.

Here is that baseline: never in git or chat, one source of truth, least scope per key, separate keys per environment, a rotation you have actually run, and a revocation list for the day something leaks.

## The rules that cost nothing to follow

**Never in git, never in chat.** Not in a private repo, not in a DM to yourself, not in a screenshot of a terminal. The test is mechanical: if `grep -r` finds it, or you can scroll to it, it is leaked. Treat pasting a live key into Slack as equivalent to posting it publicly, because the export and indexing story is out of your hands.

**One source of truth.** Two copies of a secret means one is stale, and stale secrets are how rotations turn into outages. Pick one place, reference it from everywhere else.

**Least scope per key.** Separate read-only from read-write credentials, and separate them per service. A log-shipping job does not need the same database user as your application. If a key's blast radius is "everything," you cannot rotate it on a Tuesday afternoon without risk.

**Separate keys per environment.** Dev, staging and production never share a credential. Shared keys mean a debugging session on a Thursday can touch production data, and it means you cannot revoke a compromised dev machine without taking down the site.

**A rotation you have rehearsed.** A rotation plan you have never executed is a guess. Run it once on a low-stakes key and time it.

**A revocation list.** One page listing every credential you own, where to kill it, and what breaks when you do.

## Choosing where the source of truth lives

There is no single right answer, but there are clearly wrong answers for a given team size.

| Option | Good fit when | Rotation cost | The catch |
| --- | --- | --- | --- |
| Cloud secret manager (AWS Secrets Manager, GCP Secret Manager) | You already run in one cloud | One API call or console click; versions retained | Per-secret and per-API-call billing; IAM becomes part of your security model |
| SOPS + age, ciphertext committed to git | GitOps, no cloud lock-in, reviewable diffs | Re-encrypt and commit; service reloads on deploy | The age private key is itself a secret — keep it on disk at mode 0600 and nowhere else |
| systemd or Docker env file, mode 0600 | One box, one operator, no CI | Edit the file, `systemctl restart` | Breaks the moment a second machine or a CI job needs the same value |
| HashiCorp Vault | Many services, dynamic short-lived credentials | Lease-based, largely automatic | Operationally heavy for one person |
| Provider-native (`gh secret set`, CI variables) | CI only | CLI one-liner | Does not cover local development |

The pragmatic default for a solo operator already in a cloud is that cloud's secret manager, with the CI's own secret store for pipeline values. Everything else is a variation on those two.

A fetch wrapper that never writes to disk:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Used as a systemd ExecStart, or run directly in a shell.
export DB_PASSWORD="$(aws secretsmanager get-secret-value \
  --secret-id prod/api/db-password \
  --query SecretString --output text)"

export STRIPE_KEY="$(security find-generic-password -s stripe-prod -w)"  # macOS keychain

exec /opt/app/venv/bin/python -m app
```

One caveat worth knowing: environment variables are readable by any process running as the same user via `/proc/<pid>/environ`. That is acceptable on a single-tenant box and not acceptable on a shared host.

## Wiring secrets into services without leaving copies

On Linux, systemd's `LoadCredential` puts a secret in a per-unit directory readable only by that service, which is better than an environment file that any process of the same user can read:

```ini
[Unit]
Description=api
After=network-online.target

[Service]
User=svc-api
EnvironmentFile=/etc/app/api.env
LoadCredential=db_password:/etc/credstore/api-db-password
ExecStart=/opt/app/venv/bin/python -m app
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
```

The credential file itself should be `chmod 600` and owned by root. Inside the process it appears as a path in `$CREDENTIALS_DIRECTORY`, not as an environment variable.

Whatever the source, applications should fail loudly when a secret is missing rather than falling back to a default:

```python
import os
import sys


def required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"missing required secret: {name}")
    return value


DB_PASSWORD = required("DB_PASSWORD")
```

A silent default like `os.environ.get("DB_PASSWORD", "postgres")` is how staging credentials end up in production.

Finally, block the mistake at the source with a pre-commit check:

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/usr/bin/env bash
gitleaks protect --staged --redact -v || {
  echo "possible secret staged; commit blocked"; exit 1;
}
EOF
chmod +x .git/hooks/pre-commit
```

This is a speed bump, not a guarantee. Patterns miss things, and a determined paste will get through.

## A rotation you have rehearsed

Single-key rotation causes downtime, because the old key stops working the moment you replace it. Use a two-key window instead:

1. Issue a new credential alongside the old one; nothing is revoked yet.
2. Deploy the new value to every consumer. Verify with a request that exercises the credential, not just a successful restart.
3. Wait through one full deploy cycle and one cron interval, so long-running jobs pick up the change.
4. Revoke the old key at the provider.
5. Delete the old value from the secret store, so nobody reuses it by habit.

Time this once. If step 2 takes forty minutes because you have to remember which three repos read the key, that is the finding: consolidate consumers before you need the speed.

## The revocation list and recovery procedure

The revocation list is a private page, no secret values, that tells you where to kill each credential and what dies with it.

| Service | Credential | Revoke at | What breaks | Replacement path |
| --- | --- | --- | --- | --- |
| AWS | `prod/api/db-password` (RDS user `api_rw`) | IAM console or `aws iam` | API returns 500s | Rotate in Secrets Manager, restart unit |
| Stripe | Restricted key, charges write | Dashboard, API keys | Checkout fails | Create restricted key, deploy, restart |
| GitHub | PAT `deploy-bot` | Settings, Developer settings | CI deploy step fails | New fine-grained token, `gh secret set` |

Recovery, in order. The order matters more than the steps.

1. **Revoke first, investigate second.** Every minute a live key exists is a minute of exposure. Do not spend twenty minutes reading logs before killing it.
2. **Sweep the scope.** Find every place the key was used: `grep -r` across repos, CI environment variables, cloud functions, local shells, `~/.aws/credentials`, `~/.netrc`, `.env` files outside the project.
3. **Rotate and deploy.** Follow the two-key window above.
4. **Rewrite history, and treat it as cosmetic.** `git filter-repo --replace-text` plus a force push removes the string from your remote, but forks, clones, CI caches and archived logs may still hold it. The key is burned regardless; the rewrite is only about stopping the next person from copying it.
5. **Watch for use.** Check provider access logs for requests from unfamiliar addresses, and set a billing alert on the account behind the key. A leaked key is often used for compute, not data.
6. **Add the guardrail.** Whatever let the secret escape gets a rule: `.gitignore` entry, pre-commit hook, secret scanning on push, or a policy that keys never go in chat.

It also helps to write down what a leak costs you in time, so the next one is faster. That is the same reason recurring operational tasks deserve a written playbook — see [Triage Habits for Automation That Fails While You Sleep](/blog/triage-automation-failures-while-you-sleep/) for the general shape, and [The Solo Operator's Tool Sprawl Problem](/blog/solo-operator-tool-sprawl/) for deciding when another secret store is one tool too many.

## What to do next

- **Audit this week.** Run `gitleaks detect --source . --redact -v` against every repo you own, and search your chat history for `sk-`, `AKIA`, `ghp_` and `-----BEGIN`. Rotate anything you find before you clean up the history.
- **Write the revocation list.** One page, the table above as the template, stored in a private repo or a password manager note. Fill in the "revoke at" column with actual URLs, not "AWS console."
- **Pick one source of truth and migrate one key.** Start with the credential with the widest scope, which is usually the one your main service uses.
- **Rehearse a rotation on a low-stakes key.** A staging API token, not the production database. Write down every consumer you had to touch.
- **If you self-host inference on a GB10 box, keep the same discipline for its API keys.** The systemd-unit pattern above is the one used by the [DGX Spark LLM Deployment Kit](/products/dgx-spark-llm-deployment-kit/) ($49, one-time), which ships systemd units, memory planning, health checks, a watchdog and a troubleshooting playbook for running vLLM models on an NVIDIA GB10 (DGX Spark) — including where to put the token that fronts the endpoint so it never lands in a shell history.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=article&utm_campaign=handling-secrets-without-platform-team) — **$49**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
