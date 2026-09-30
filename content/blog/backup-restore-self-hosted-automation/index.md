---
title: "How to Back Up and Restore a Self-Hosted Automation Stack"
description: "Inventory the stateful parts of your stack, get copies off the machine, and run a restore drill that proves the backup before you need it."
date: "2026-09-30T08:00:00+08:00"
draft: false
slug: "backup-restore-self-hosted-automation"
author: "Wayne Chang"
tags: ["backup", "self-hosting", "docker", "restore", "postgres"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "49"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "How to Back Up and Restore a Self-Hosted Automation Stack"
faq:
  - q: "How often should I back up a self-hosted automation stack?"
    a: "Match the schedule to how much work you are willing to redo: daily is the common default for databases, and hourly only if you already have a tested restore path. Frequency matters less than having one copy that leaves the machine and one drill that proves it restores."
  - q: "Do I still need volume backups if I dump the database?"
    a: "Yes, for anything not in the database — uploaded files, workflow state that lives on disk, broker persistence files and app config. A SQL dump only covers what the database engine knows about."
  - q: "How do I know my backup is actually restorable?"
    a: "Restore it to a different host under different paths and different container names, then verify functionally: send one request through the restored stack and confirm the database row and the queue both reflect it. Record the elapsed time and any step you had to invent."
---

Most self-hosted automation stacks get backed up exactly once: the day someone writes the script. The failure mode is rarely a missing file — it is a backup that restores 90% of the stack and leaves you guessing at the other 10% at 2am. Here is what to capture, how many copies to keep, and how to prove a restore works before you need it.

## Inventory the stateful pieces first

Everything else is rebuildable from git and a `docker compose up`. The trick is being honest about which parts are stateful. A container image is disposable; the named volume it writes to is not. A workflow JSON export looks complete until you notice it carries no credentials.

Start by listing what you actually have:

```bash
docker volume ls
docker ps --format '{{.Names}}\t{{.Image}}'
crontab -l
systemctl list-timers --all
```

Then map each item to where its data really lives. The usual forgotten pieces:

| Piece | Where it hides | How to capture it |
|---|---|---|
| Postgres / MySQL | Named volume, or a data dir inside the container | Logical dump: `pg_dump -Fc`, `mysqldump --single-transaction` |
| SQLite | A single file mounted into the app | `sqlite3 app.db ".backup out.db"` or `VACUUM INTO` |
| Secrets | `.env`, `EnvironmentFile=` in a unit, docker secrets | Copy the file into the encrypted archive, key stored elsewhere |
| Named volumes | `/var/lib/docker/volumes` | `docker run --rm -v vol:/from -v $PWD:/to alpine tar czf /to/vol.tgz -C /from .` |
| Cron and timers | Per-user crontabs, `/etc/cron.d`, `/etc/systemd/system/*.timer` | `crontab -l`, copy the unit files, `systemctl list-timers --all` |
| Reverse proxy config | `/etc/nginx`, `/etc/traefik`, `Caddyfile` | `nginx -T` dumps the full merged config; copy Traefik dynamic config |
| Broker state | Redis `appendonly.aof`, RabbitMQ mnesia dir | Snapshot the directory; accept that in-flight jobs vanish |

Two heuristics cut the list down fast: if you would have to reconstruct it by hand, back it up; and if a compose file or systemd unit points at a path, back up the file as well as the data, because the restore will need to know what the path was.

## How many copies, and where they live

The old convention is three copies, on two kinds of media, with one off-site. Treat it as a starting point, not a law. The part that matters for a small stack is simpler: at least one copy must live somewhere the production host cannot reach or delete. A cron job writing tarballs to the same disk it is protecting is not a backup — a bad `rm -rf`, a failing disk or a compromised container takes both at once.

So the minimum for a solo operator is three copies in three failure domains: the live data, a snapshot on a different physical device you control (NAS, second box, external disk), and an encrypted copy in object storage run by a different provider than your server. Encryption is not optional for the off-site copy; use `restic`, `borg`, or `age` plus your own sync.

One rule that gets ignored: a backup whose key you cannot find is not a backup. Keep the repository password in a password manager and on paper in a drawer, not only on the box that might die.

| Tool | Good fit | Trade-off |
|---|---|---|
| `restic` | Encrypted, deduplicated off-site to S3-compatible storage | Needs the repo password to be findable off-machine |
| `borg` | Local or NAS targets, similar model | Repository format version is a lock-in you must remember |
| `rsync` + `tar` | Very small stacks, fully transparent output | No dedupe, no encryption, hard-link tricks for incrementals are fragile |

A backup script that covers the inventory above, run from the host:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/srv/backups/automation/$STAMP
mkdir -p "$DEST"

# 1. Databases: compressed custom format, restored with pg_restore
docker exec pg pg_dump -U app -Fc -d automation > "$DEST/automation.pgdump"

# 2. Config and secrets, which never live in git
cp -a /srv/automation/.env /srv/automation/docker-compose.yml "$DEST/"

# 3. Named volumes not covered by a SQL dump (uploads, workflow state)
docker run --rm -v automation_n8n_data:/from -v "$DEST":/to \
  alpine tar czf /to/n8n_data.tgz -C /from .

# 4. Scheduler and proxy config
crontab -l > "$DEST/crontab.txt" 2>/dev/null || true
systemctl list-timers --all > "$DEST/timers.txt"
nginx -T > "$DEST/nginx.conf" 2>/dev/null || true

# 5. Manifest, so restore day is not guesswork
docker ps --format '{{.Names}}\t{{.Image}}' > "$DEST/images.txt"
sha256sum "$DEST"/* > "$DEST/SHA256SUMS"
```

Then push `$DEST` off-machine with `restic backup "$DEST"` and prune on a schedule, for example `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`.

## Run a restore drill that proves something

An untested backup is a failure scheduled for later. The drill has one rule: restore to a different host, under a different path, with different container names. Never restore over production to "check" it.

Restoring successfully is the low bar. The point of the drill is to measure how long the service takes to come back and to find the steps that were never written down:

- Ownership and permissions on restored volumes (`postgres` uid mismatches are common).
- Missing `.env` values, or values that reference the old hostname in an nginx upstream.
- `pg_dump` from a newer major version than the server you restore into — the dump format is one-way.
- Redis started with a different `appendonlydir`, silently losing history.
- Health checks that pass while the queue processor is dead.

A drill you can run on a scratch host or VM:

```bash
restic -r s3:s3.example.com/automation-backups restore latest \
  --target /srv/restore-test
cd /srv/restore-test && sha256sum -c SHA256SUMS

docker run -d --name pg-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
sleep 5
PGPASSWORD=test pg_restore -h 127.0.0.1 -p 55432 -U postgres -d postgres \
  --clean --if-exists automation.pgdump

psql -h 127.0.0.1 -p 55432 -U postgres -c 'select count(*) from workflows;'
```

Verify functionally, not by exit codes: send one webhook through the restored stack and confirm the row lands in the database and the job leaves the queue. If the stack fails quietly in normal operation, it will fail quietly after a restore too — the same discipline described in [triage habits for automation that fails while you sleep](/blog/triage-automation-failures-while-you-sleep/) applies here.

## Record the result in the repo

The drill is only worth the note it produces. Keep a small log next to your runbook, committed to git, and update it after every drill. This is what turns a yearly panic into a twenty-minute task.

```yaml
# restore-log.yaml
drill_date: 2026-02-14
artifact: s3:s3.example.com/automation-backups @ 20260214T031500Z
target: scratch-vm-2 (never production)
started_utc: "03:20:11"
service_up_utc: "03:41:02"
result: pass
verified:
  - row counts match production snapshot
  - webhook round-trip wrote a row
  - queue drained within the drill window
failed_steps: []
not_backed_up:
  - in-flight queue jobs (accepted loss)
  - TLS certificates (ACME reissues on first request)
```

The `not_backed_up` list matters as much as the pass line. Writing down what you deliberately do not protect stops you from rediscovering it during an incident, and it makes the next drill a checklist instead of a project. If you are rebuilding the wider stack rather than just the backup layer, the [automation guide for 2026](/blog/ultimate-ai-automation-guide-2026/) covers how the pieces fit together.

## What to do next

1. Run `docker volume ls`, `docker ps`, `crontab -l` and `systemctl list-timers --all` on the production host, and write the output into a file in your repo. That file is your backup scope.
2. Turn the script above into a systemd timer or cron entry, run it once by hand, and confirm the archive extracts and the checksums verify.
3. Add an encrypted off-site target with restic or borg, and confirm you can unlock it using only credentials that are not stored on the server.
4. Do one restore drill this week on a scratch host or container, and record the wall-clock time from `restore` to a successful functional check.
5. If part of the stack is a GPU inference host, remember that the model server has state too: launch flags, memory settings and health-check thresholds. On an NVIDIA GB10 (DGX Spark) box, the DGX Spark LLM Deployment Kit ($49, one-time) ships systemd units, memory planning, health checks, a watchdog and a troubleshooting playbook — which is what you want in hand when the restored service has to come back exactly as it was configured.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=blog&utm_medium=article&utm_campaign=backup-restore-self-hosted-automation) — **$49**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
