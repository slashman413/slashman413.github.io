---
title: "A Daily News Desk Run as a Scheduled Pipeline"
description: "An operating design for a scheduled pipeline that drafts and publishes a daily news item, with a human gate, duplicate screening, and failure checks."
date: "2026-09-15T08:00:00+08:00"
draft: false
slug: "daily-news-pipeline-operating-design"
author: "Wayne Chang"
tags: ["automation", "pipeline", "publishing", "dedupe", "human-in-the-loop"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/mgtpcn"
product_price: "39"
product_brand: "Slashman Tools"
product_sku: "SMT-SWA"
product_category: "Online Course"
product_currency: "USD"
seo_title: "A Daily News Desk Run as a Scheduled Pipeline"
faq:
  - q: "Why not let the model publish directly and clean up later?"
    a: "Because the publisher is the one stage you cannot rewind cheaply. Keeping publish as a separate job that only reads approved rows means a bad prompt, a bad source, or a hallucinated quote cannot reach readers at all."
  - q: "How strict should the duplicate threshold be?"
    a: "Strict enough that you would defend it to a reader who saw both items. Tune it against your own published archive rather than copying a number, since short items and long investigative pieces behave very differently under the same hash."
  - q: "What is the most common reason these pipelines quietly die?"
    a: "Gate fatigue. If the review card is long or the queue is deep, approvals become reflexive and the human check stops being a check. Capping drafts per run and shortening the card matter more than any model upgrade."
---

Most write-ups about AI news desks show the output and skip the machine. The machine is the interesting part: a scheduled job that collects, screens, drafts, and then stops and waits for a person. What follows is an operating design, not a results report — the parts that have to exist before a daily item can publish itself without you watching it.

## The run has four stages and one gate

A daily item is not one prompt. It is a pipeline with a durable state row per candidate, and every stage is idempotent against a `run_id`.

1. **Collect** — pull configured feeds on cron. Write raw payloads to disk before parsing anything.
2. **Screen** — canonicalize URLs, hash bodies, compare against everything published inside the retention window.
3. **Draft** — one model call per surviving candidate, with the fetched source text as the only permitted evidence.
4. **Gate** — a human approves, holds, or kills. Nothing skips this.
5. **Publish** — a separate job, restricted to a time window, reading only approved rows.

Splitting collect from draft matters: if the model call fails at 05:40 you still have the raw payloads and can re-draft without refetching. Splitting draft from publish matters more — the publisher never talks to a model, so a bad prompt cannot reach production. If you already run other jobs on a scheduler, the same shape applies; the [automation guide](/blog/ultimate-ai-automation-guide-2026/) covers how the pieces fit together.

```yaml
# desk.yaml
schedule: "30 5 * * *"          # collect + screen + draft only
publish_window: "09:00-09:15"   # publisher refuses to run outside this
sources:
  - id: regulator-filings
    url: https://example.gov/feeds/press.xml
    type: rss
    trust: primary
  - id: vendor-blog
    url: https://example.com/blog/feed.xml
    type: rss
    trust: secondary
budgets:
  max_candidates: 40
  max_drafts: 3
dedupe:
  url_normalize: true
  simhash_hamming: 3
  embedding_threshold: 0.86
publish:
  require_approval_token: true
  approval_ttl_minutes: 90
  canary_url: https://staging.example.com/news/
```

`approval_ttl_minutes` is the value people forget. An approval granted at 08:00 for a story that has moved on by 11:00 should expire rather than ship stale.

## What gets templated, and what must not be

The dividing line is shape versus judgment. Template the container; never template the claim.

| Templated | Never templated |
|---|---|
| Feed parsing, canonical URL, slug | The lede sentence |
| Frontmatter keys, tag allowlist | The "why this matters" paragraph |
| Attribution line, license note | The decision to publish |
| Image credit, internal link slot | The headline verb and framing |
| RSS and sitemap entries, timestamps | Whether the story deserves a daily item |

Frontmatter is the highest-value template because it is also a validation surface. If `slug`, `date`, `tags`, and `source_urls` are generated from a schema, a draft that fails the schema never reaches the reviewer's screen. This is context engineering in a small, boring form: you are deciding what the model can see, not asking it to be careful. The [context engineering primer](/blog/what-is-context-engineering/) covers the reasoning in more depth.

The one template worth resisting is the opening line. A generated lede collapses into the same three sentence shapes within a week, and readers notice before you do.

## Screening duplicates before the model writes a word

Duplicates enter a news desk from four directions: syndicated reposts, rewrites of the same wire copy, updated versions of a story you already ran, and two outlets covering one filing. No single check catches all four, so the screen is layered — cheapest first, and each layer short-circuits the rest.

```python
import hashlib, re
from urllib.parse import urlsplit, urlunsplit, parse_qsl

TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term",
            "utm_content", "ref", "fbclid", "gclid"}

def canonical_url(raw: str) -> str:
    p = urlsplit(raw.strip())
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
         if k.lower() not in TRACKING]
    path = re.sub(r"/+$", "", p.path) or "/"
    query = "&".join(f"{k}={v}" for k, v in sorted(q))
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), path, query, ""))

def simhash64(text: str) -> int:
    bits = [0] * 64
    for tok in re.findall(r"[a-z0-9]{3,}", text.lower()):
        h = int.from_bytes(hashlib.blake2b(tok.encode(), digest_size=8).digest(), "big")
        for i in range(64):
            bits[i] += 1 if (h >> i) & 1 else -1
    return sum(1 << i for i in range(64) if bits[i] > 0)
```

| Layer | Catches | Cost | Typical failure mode |
|---|---|---|---|
| Canonical URL match | Syndicated reposts with the same link | Free | AMP and print variants, tracking params |
| SimHash of body text, Hamming <= 3 | Rewrites of one wire story | Local, cheap | Short items where the hash is unstable |
| Embedding cosine >= threshold over N days | Same event, different outlet, different wording | One embedding call per item | Two genuinely distinct items collapse into one |
| Title token overlap | Morning and afternoon updates of one story | Free | Boilerplate titles from a single publisher |

Treat every threshold as a policy choice, not a default to copy. Tune against your own published archive: a threshold that feels strict on someone else's corpus will either let duplicates through or silently kill your second story of the day.

## The gate: cheap enough to actually happen

A gate only works if reviewing one item takes about a minute. The reviewer gets a single card containing: headline, a 60-word summary, the source links, the dedupe verdict with the closest prior match, the diff against that match, and three actions — approve, hold, kill. Approve writes a token to the state store with a TTL. The publisher reads only rows with a valid, unexpired token.

Two countermeasures against gate fatigue. First, cap drafts per run (`max_drafts: 3`). A queue of twenty trains someone to rubber-stamp. Second, give hold a real meaning: a hold lane for stories that need a second source, reviewed weekly. If a held item is still interesting a week later, it was never a daily item.

```bash
# What is waiting at the gate right now?
ship-news queue --state ./desk.db --status pending --format table

# See exactly what would publish, without publishing
ship-news publish --run-id "$(date -u +%Y-%m-%d)" --dry-run --explain

# Approve one item; the token expires in 90 minutes
ship-news approve --item 2026-02-11-regulator-filing --ttl 90m
```

## Catching a bad run before it publishes

Preflight runs before any drafting. It asserts that every feed returned at least one item, that no item is older than 36 hours, that every candidate has a resolvable canonical URL, and that source domains are on an allowlist. A failed preflight writes a `FAILED` row and stops. Nobody gets paged at 05:30; the morning job either publishes nothing or falls back to an evergreen backlog you maintain for exactly this case.

Post-draft validation runs before the gate card is built:

- Every quoted string appears verbatim in the fetched source text. If not, the quote is dropped and the item is flagged.
- Every named entity in the draft appears somewhere in the source. An unmatched entity blocks the item.
- Frontmatter validates against a schema: unique slug, parseable date, tags from the allowlist, at least one source URL.
- Body length falls inside a band, and internal links resolve. A link that returns a 404 gets removed rather than shipped.
- The dedupe screen re-runs against anything published while the draft was being written.

At publish time, the window lock is enforced in code, not in the cron expression, and the item goes to the canary URL first. Rollback is a flag flip: `published: false` removes the item from the sitemap and the feed on the next pass. If an item was live for more than a few minutes, keep the URL and attach a correction note rather than returning a 404 to readers who already linked it.

One soft signal is worth wiring up: if every item is approved untouched for a full week, that is not a healthy pipeline, it is a reviewer who stopped reading. Look at the held and killed counts the same way you look at failed runs.

## What to do next

1. Build the state table and `run_id` handling first, before you write a single prompt. Every later decision depends on being able to re-run a stage safely.
2. Start with two sources and one dedupe layer — canonical URL only. Add SimHash or embeddings the first time a duplicate actually ships, not preemptively.
3. Prototype the gate card as plain Markdown and time yourself reviewing it. If one item takes more than three minutes, cut the item down instead of adding reviewers.
4. Add preflight assertions and a `--dry-run` publish flag on day one. A pipeline with no dry run is a pipeline you will be afraid to schedule.
5. If you want the fetch-draft-gate chain wired end to end in one sitting rather than from scattered docs, Ship With AI is a four-hour practical course at $39 one-time that takes a non-coder from zero to a first working AI automation project.

## Get Ship With AI

[**Ship With AI**](https://slashmaster6.gumroad.com/l/mgtpcn?utm_source=blog&utm_medium=article&utm_campaign=daily-news-pipeline-operating-design) — **$39**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ship-with-ai/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
