---
title: "Six Naming Rules That Keep a Multi-Piece AI Stack Readable"
description: "Six naming rules that keep a multi-piece AI stack readable: prefix by layer, protect the seam, and give yourself one name you may change."
date: "2026-10-24T08:00:00+08:00"
draft: false
slug: "six-naming-rules-ai-stack"
author: "Wayne Chang"
tags: ["naming", "ai-stack", "conventions", "maintenance", "bundles"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-ADS"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "Six Naming Rules That Keep a Multi-Piece AI Stack Readable"
faq:
  - q: "Should the layer prefix live in the filename or in a directory name?"
    a: "Either works if it is consistent across the whole bundle, but filenames are more durable: a copied file keeps its name, while a directory disappears the moment someone drags a folder into a chat window or a flat archive."
  - q: "What if two layers genuinely need the same helper file?"
    a: "Then it belongs to neither. Move it into a shared layer with its own prefix, or let one layer own it and have the other import it through the seam. Two copies under two names always costs more later."
  - q: "How do I rename a frozen name without breaking buyers?"
    a: "Add the new name alongside the old one, keep the old one working for at least a release cycle, then remove it with a changelog note. Editing a frozen name in place is a breaking change even when the contents are identical."
---

A multi-piece AI stack is not one product. It is a prompt library, an agent framework, deployment scripts and tutorials that ship in the same download, each with a different owner and a different change rate. The people who open it later will not have your mental map — they will have a directory listing, a few config files and whatever the names tell them, so the names have to carry the structure.

## Rule 1: Prefix every name with its layer

A prefix earns its place because it is checkable. `prompt.registry.yaml` sorts next to `prompt.render.py` and nowhere near `deploy.target.yaml`, so a directory listing groups work by layer without a folder hierarchy doing it for you. In grep, `agent\.` returns every name in the agent layer and nothing else — which is what you want when you are about to change one layer and need to know the blast radius. That habit pairs with wiring each layer to one job, which is the point of [how to wire an AI dev stack so each layer has one job](/blog/upgrade-one-layer-ai-stack/).

Decide the prefix list once and write it down as data, not prose:

```yaml
# stack.manifest.yaml — the single source of truth for layer names
layers:
  - id: prompt
    prefix: prompt
    owns: [registry, render, evals, templates]
  - id: agent
    prefix: agent
    owns: [tools, loop, policy]
  - id: deploy
    prefix: deploy
    owns: [target, rollback, smoke, entrypoint]
```

Anything not in `owns` for a layer is a naming bug, and you can review the manifest in a pull request. Keep prefixes short and pronounceable; `prompt_` beats `prmpt_` because people will say the name out loud in a standup.

## Rule 2: No name may appear in two layers

This is the rule people break first, because `config.yaml` is the obvious name in every directory and duplication feels harmless until something fails. When a log line says `config.yaml: key not found`, three people look at three different files. Two layers with a `run.py` produce the question "run what?" in every code review, and the answer is never in the filename.

| Name | Where it collides | What goes wrong | Rename to |
| --- | --- | --- | --- |
| `config.yaml` | repo root and each layer | logs and editor tabs are ambiguous | `prompt.config.yaml`, `agent.config.yaml` |
| `run.py` | prompt and agent | "run which stage?" in reviews | `prompt.run_evals.py`, `agent.run_loop.py` |
| `templates/` | tutorials and prompt library | copy-paste lands in the wrong tree | `tutorial.templates/`, `prompt.templates/` |
| `version` | manifest and prompt header | two values, one word, in the same error | `bundle_version`, `prompt_revision` |
| `main` | entry script and branch | ambiguous in chat and docs | `deploy.entrypoint` (branch stays `main`) |

You do not have to trust discipline here. Find the collisions:

```bash
# List basenames that appear in more than one layer (GNU find).
# Each hit is either a collision you fix today or one you accept on purpose.
find . -type f -not -path './.git/*' -printf '%f\t%p\n' \
  | sort \
  | awk -F'\t' '$1 == prev { print prev " -> " prevpath " | " $2 } { prev = $1; prevpath = $2 }'
```

Run it before you publish a bundle, not after. A short mechanical check catches the class of mistake that otherwise gets caught by a confused buyer.

## Rule 3: Name the job, not the material

`json_transformer_pipeline.py` tells you what the file is made of. `normalize_ticket_fields.py` tells you what it does, and stays true when the format changes. Material names rot fast: a `yaml_loader` that later reads TOML is not a vague name, it is a wrong one, and wrong names are worse than vague ones because people trust them and stop reading the code.

The same test applies above the file level. A tool called `agent.tool.query_vector_store` names an implementation; call it `agent.tool.lookup_docs` and you can swap the store, add a cache in front, or run a keyword fallback without renaming anything or updating a tutorial. Ask the question "if I replaced the inside of this tomorrow, would the name still be correct?" If the answer is no, the name describes the material.

The exception is genuinely external things — protocol names, file extensions you do not control, vendor API names. `openai.chat.completions` is fine to keep verbatim, because that is the thing, not a choice you made.

## Rules 4 to 6: Freeze the core, stabilise the seam, leave one name loose

Three names in a bundle are not ordinary names, and they need different rules from everything else.

**The seam gets one stable name.** The seam is the boundary between two layers — the contract file, the schema, the single function the agent layer calls into the prompt layer. Give it a plain name like `stack.contract.json` and never put a version number in the filename; put the version inside the file. If the seam's name changes, every layer's reference breaks at once, which is the opposite of what a boundary is for. Layer swaps should be boring, and [upgrading one layer without breaking the rest](/blog/upgrade-one-layer-ai-stack/) depends on the seam holding still while the code behind it moves.

**The core gets a name marked "do not rename".** Some names leak outside the bundle: environment variables buyers set in their own shells, names referenced in published tutorials, paths in their CI files. Pick a small set, list them in a `NAMING.md` with the word frozen next to each, and treat renaming as a breaking change that needs a new name and an alias instead of an edit.

**You get one name you are allowed to change.** Without a release valve, people rename the frozen things. Reserve a scratch space — `agent.experimental.*`, or a `_wip/` directory — and state that anything in it must be renamed or deleted before it is promoted out. That is where exploration belongs.

| Class | Who may rename it | Expected lifespan | Example |
| --- | --- | --- | --- |
| Frozen core | nobody; add an alias and a new name | life of the bundle | `AI_STACK_HOME`, `prompt.registry.yaml` |
| Stable seam | layer owner, with a deprecation note on both sides | months | `stack.contract.json` |
| Free / scratch | whoever is working in that layer, any time | days | `agent.experimental.plan_b` |

## The payoff: the map becomes optional

A newcomer who sees `deploy.rollback.sh` next to `deploy.smoke.sh` does not need you to explain the deployment layer, and someone editing `prompt.templates/` will not accidentally reach into a tutorial they were supposed to leave alone. That is the whole return on the rules: fewer interruptions, fewer wrong-file edits, and review comments about behaviour instead of about where a file lives.

There is a second payoff when the bundle is sold or handed over. Naming is what makes a layer removable. If everything in a layer shares a prefix, deleting a layer is a grep and a check, not an archaeology project. The same discipline is what lets [versioning a template](/blog/selling-a-feishu-template-product/) work without clobbering the buyer's own edits, because you can tell your files from theirs at a glance.

## What to do next

1. Write `stack.manifest.yaml` with four or five layer ids and their prefixes. Ten minutes, and it becomes the review checklist.
2. Run the collision check above on your current tree and fix the top hits — usually `config.yaml`, `run.py`, `utils.py`, `main.py` and a `templates/` directory.
3. Create `NAMING.md` with two lists: the names marked frozen, and the single scratch namespace where renaming is free.
4. Rename one seam file to a version-free name and move the version inside the file. Update both sides in the same commit.
5. If you would rather start from pieces that already follow these rules, the AI Developer Stack Bundle — prompt library, agent framework, deployment tooling and tutorials, pre-configured to work together — is $79 USD one-time at https://slashmaster6.gumroad.com/l/nulyms.

## Get AI Developer Stack Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=six-naming-rules-ai-stack) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-dev-stack/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
