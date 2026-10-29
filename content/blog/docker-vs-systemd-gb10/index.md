---
title: "Docker vs systemd on a GB10: Reboots, Logs and GPU Memory"
description: "A practical comparison of running vLLM in Docker versus a systemd unit on a single-GPU GB10 box: updates, GPU memory, log capture and reboot behaviour."
date: "2026-10-29T08:00:00+08:00"
draft: false
slug: "docker-vs-systemd-gb10"
author: "Wayne Chang"
tags: ["docker", "systemd", "vllm", "gb10", "self-hosting"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/bppdqp"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-DGX"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Docker vs systemd on a GB10: Reboots, Logs and GPU Memory"
faq:
  - q: "Can I run vLLM in Docker and still use systemd?"
    a: "Yes. Point a systemd unit at the container instead of the Python process, so PID 1 owns the lifecycle. That way `systemctl restart docker` and daemon upgrades do not silently change the state of your model server."
  - q: "Does a container stop vLLM from using too much GPU memory?"
    a: "No. A container sees the whole GPU, and on GB10 the GPU shares memory with the CPU, so a compose memory limit is not a VRAM budget. Bound usage with vLLM flags like `--gpu-memory-utilization`, `--max-model-len` and `--max-num-seqs`."
  - q: "Why does my model server not come back after a reboot?"
    a: "Usually one of three things: the systemd unit was never enabled, `Restart=on-failure` skipped a clean exit, or with Docker the container starts before the model disk is mounted or dockerd is fully up. Check `journalctl -u vllm` or `docker inspect` for the exit code first."
---

Everyone has a strong opinion about containers until the machine reboots at 2am and the model never comes back. On a single-GPU GB10 there is no second card, no scheduler, and nobody on call. The real difference between Docker and a systemd unit comes down to four things: update friction, GPU memory isolation, log capture, and what happens on reboot.

## Two ways to run the same process

vLLM is a Python process that reads weights onto the GPU and serves an OpenAI-compatible API on a port. Both options run that exact process. The difference is who owns it.

With systemd, the process is a child of PID 1. Python, CUDA and the driver all come from the host. Everything about the launch lives in one unit file you can read in ten seconds.

```ini
[Unit]
Description=vLLM server
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
User=llm
Environment=HF_HOME=/srv/models/hf
ExecStart=/opt/vllm/bin/vllm serve /srv/models/model-a \
  --served-model-name local \
  --host 0.0.0.0 --port 8000 \
  --gpu-memory-utilization 0.85 \
  --max-model-len 16384
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=vllm

[Install]
WantedBy=multi-user.target
```

No systemd service type knows when the weights finished loading. `systemctl start` returns long before `/health` answers, so treat the unit as "process launched", not "model ready" and put the readiness check somewhere else.

With Docker, dockerd owns the process. The image carries its own CUDA userspace, and nvidia-container-toolkit injects the driver at start. Two things bite everyone once: the Hugging Face cache must be a volume or every restart re-downloads tens of gigabytes of weights, and the default `/dev/shm` is too small for vLLM, which is why `ipc: host` appears in every serious compose file.

```yaml
services:
  vllm:
    image: vllm/vllm-openai:latest    # pin a digest for anything you rely on
    runtime: nvidia
    ipc: host
    environment:
      - HF_HOME=/models/hf
    volumes:
      - /srv/models:/models
    ports:
      - "8000:8000"
    command: >
      --model /models/model-a
      --served-model-name local
      --gpu-memory-utilization 0.85
      --max-model-len 16384
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/health"]
      interval: 30s
      start_period: 600s
      retries: 3
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
```

## Update friction and rollback

The systemd path is fast and slightly sloppy. Keep two virtualenvs and swap a symlink:

```bash
python3 -m venv /opt/vllm-next
/opt/vllm-next/bin/pip install "vllm==0.x.y"
ln -sfn /opt/vllm-next /opt/vllm     # the unit runs /opt/vllm/bin/vllm
systemctl restart vllm
```

Rollback is `ln -sfn /opt/vllm-prev /opt/vllm && systemctl restart vllm`. The cost: nothing records what is installed, torch wheels and the host driver can drift apart on the next system upgrade, and the venv quietly becomes a snowflake. This is the same problem as any other layer of a stack that upgrades itself in place — see [Upgrade One Layer of Your AI Stack Without Breaking the Rest](/blog/upgrade-one-layer-ai-stack/).

The Docker path is slower to iterate and far easier to audit. `docker compose pull && docker compose up -d`, rollback by changing the tag back. The image is a frozen artifact, so reinstalling the OS or moving hardware costs you a `pull`. The cost here: you inherit upstream's entrypoint, Python version and CUDA base image, and on ARM64 not every tag has a build. The fallback is compiling vLLM from source, which is a long build and a fight with the CUDA base image.

Rule of thumb: weekly tinkering favours systemd, quarterly updates favour containers.

## GPU memory: containers isolate nothing

A container gets the whole GPU. Without MIG partitions or separate devices, two processes on one card share the same memory pool, and no compose setting changes that. On GB10 the memory is unified — CPU and GPU draw from the same pool — so a `mem_limit` in compose is not a VRAM budget. Do not treat it as one.

The levers that actually bound usage are vLLM flags: `--gpu-memory-utilization`, `--max-model-len`, `--max-num-seqs`, and running one model per box. The classic failure is two services each set to `0.6` utilization. That is 1.2 of a card you do not have; the second one dies during load or gets killed later. Exit code 137 in `journalctl -u vllm` or in `docker inspect` is the tell.

## Logs and what happens on reboot

journald gives you `journalctl -u vllm -f` and `journalctl -u vllm --since "1 hour ago"`, with one place to search every service on the box. The default rate limiter can silently drop lines from a chatty server:

```bash
sudo tee /etc/systemd/journald.conf.d/vllm.conf >/dev/null <<'EOF'
[Journal]
RateLimitIntervalSec=0
SystemMaxUse=2G
EOF
sudo systemctl restart systemd-journald
```

Docker's default `json-file` driver has no size cap at all. A long-running server with request logging on can fill the disk and take the whole machine down. Set `max-size` and `max-file` as in the compose file above, or change the daemon default.

On reboot, the systemd unit you enabled comes back at `multi-user.target` with ordering you control. `Restart=always` beats `Restart=on-failure` here, because a process that exits 0 after a crash inside the serving loop would otherwise stay dead. With Docker, `restart: unless-stopped` only works if dockerd is enabled too, and `systemctl restart docker` bounces every container including the model — a routine daemon upgrade costs you a full weight reload. An unhealthy healthcheck does not restart a container on its own; Docker just reports the status. That is a watchdog's job, and a watchdog that restarts too eagerly is its own outage, which is the subject of [Tuning a Watchdog So It Does Not Flap](/blog/tuning-watchdog-without-flapping/).

| Concern | systemd unit | Docker container |
|---|---|---|
| Who supervises the process | PID 1, directly | dockerd, which systemd supervises |
| Update | new venv plus symlink swap | pull a new tag or digest |
| Rollback | re-point the symlink | previous tag |
| GPU memory isolation | none beyond the process | none beyond the process |
| Logs | journald, filtered by unit | json-file, needs rotation |
| Boot | `systemctl enable`, ordered targets | `restart:` policy, depends on dockerd |
| Blast radius of `systemctl restart docker` | not applicable | restarts every container |
| Reproducibility | venv state drifts over time | image is a pinned artifact |

## When each is the right answer

Choose systemd when the box has one job, when you want the shortest path from editing flags to a running server, and when boot ordering matters — model disk mounted, network up, then serve. It also keeps every log in journald, which matters when the machine is also your workstation. The design notes in [One Week of Watching a Home DGX LLM Server](/blog/watching-a-home-dgx-llm-server/) all assume this shape for good reason.

Choose Docker when you want the running artifact pinned, when a compose file doubles as your inventory of services on the box, when a reinstall or hardware move is likely, or when you want to test a new vLLM version next to the one that works.

There is a hybrid worth knowing: run the container from a systemd unit so PID 1 owns the lifecycle. You get the pinned image without inheriting dockerd restarts that silently change the model server's state. It is a few lines and it removes the worst Docker failure mode on a single-purpose box.

## What to do next

1. Write down what "up" means before you pick a supervisor: `curl -fsS http://localhost:8000/health` returning 200 within some deadline you choose. Everything else is decoration.
2. Cap the two things that can eat the box: `--gpu-memory-utilization` in your launch flags and a log size limit in journald or the `json-file` driver.
3. Do a real reboot test. Run `systemctl reboot` and watch how long until `/health` answers. Do not estimate it — you will be wrong, and the number changes what you build.
4. Decide what restarts an unhealthy-but-running server. Neither systemd nor Docker does this for you by default.
5. If you want the systemd side already worked out on a GB10 — unit files, memory planning for unified memory, health checks, a watchdog and a troubleshooting playbook — the DGX Spark LLM Deployment Kit is a $79 one-time download at https://slashmaster6.gumroad.com/l/bppdqp.

## Get DGX Spark LLM Deployment Kit

[**DGX Spark LLM Deployment Kit**](https://slashmaster6.gumroad.com/l/bppdqp?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=docker-vs-systemd-gb10) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/dgx-spark-kit/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
