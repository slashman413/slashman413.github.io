---
title: "Versioning a Template So Buyers Do Not Lose Their Customisations"
description: "Semver, changelogs and migration notes for template sellers: how to ship new versions without overwriting the customisations your buyers already made."
date: "2026-10-11T08:00:00+08:00"
draft: false
slug: "versioning-templates-without-losing-customisations"
author: "Wayne Chang"
tags: ["versioning", "templates", "semver", "changelog", "release-management"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xohjh"
product_price: "19"
product_brand: "Slashman Tools"
product_sku: "SMT-FSH"
product_category: "Software > Productivity"
product_currency: "USD"
seo_title: "Versioning a Template So Buyers Do Not Lose Their Customisat"
faq:
  - q: "Does semver really make sense for something that is not code?"
    a: "Yes, because a template has a named interface that buyers write formulas and automations against. Semver is just a shorthand for how much of that interface changed, so map MAJOR to edits a buyer must make, MINOR to additive changes and PATCH to cosmetic ones."
  - q: "What if a buyer renamed all my properties before I shipped the update?"
    a: "You cannot write a migration note for someone else's rename, so ship a mapping sheet with the release and offer a support window. State in the note which original names you changed, and let the buyer map those to their own names."
  - q: "Do I need a MAJOR bump for adding a required property?"
    a: "Yes, if it has no default, because existing records will be empty and anything validating on that property will fail. If you want to keep the release MINOR, add the property as optional first and make it required in a later MAJOR."
---

When you sell a template, what you are actually selling is a fork point. The buyer copies it, renames your fields, wires their own views and automations on top, and from that moment their copy, not yours, is the source of truth. Ship version two as an overwrite and you have deleted work they paid for.

## Treat the template as a public API

A template has a schema, even if nobody calls it that: property names, types, relations, select options, view filters, formulas, automation triggers. Those names are an interface. Buyers write `prop("Stage")` inside formulas, reference a status option in an automation condition, and paste the same names into dashboards and reports.

Semver gives you a vocabulary for describing change against that interface. The mapping is not identical to software, because "breaking" is defined by the buyer's edits, not by how much code you touched:

| Change | Bump | Effect on a customised copy | How to announce |
|---|---|---|---|
| Add an optional property, view or sample row | MINOR | None | Changelog |
| Fix labels, descriptions, a typo in a formula | PATCH | None | Changelog |
| Rename, delete or retype a property | MAJOR | Formulas, filters, rollups and automations break | Migration note, before release |
| Rename or remove a select option | MAJOR | Filters and automation conditions silently stop matching | Migration note |
| Reorder views, adjust a view filter | PATCH | Brief confusion; nothing breaks | Changelog |
| Add a required property with no default | MAJOR | Existing records are empty; validation fails | Migration note |

Two rules keep this honest. First, a change is MAJOR because of what it does to a customised copy, not because of how much work it took. Second, never publish a MAJOR silently. If you are unsure which bucket a change belongs in, ask what a buyer would have to edit after upgrading; if the answer is "nothing", it is not MAJOR. This is the same discipline behind [why team workspace templates beat one-off documents](/blog/workspace-templates-beat-one-off-docs/): shared structure only pays off if it can change without breaking everyone downstream.

If your template is still pre-1.0.0, say so in the listing. Before 1.0.0 you reserve the right to break things in a MINOR bump, and buyers tolerate that when they have been warned.

## One repository, one tag per release

Versioning is only cheap if there is a single canonical source. Keep the template in git, tag every release, and never edit a tag after publishing. The tag is the contract.

```bash
# tag the release
VERSION="v2.3.0"

git tag -a "$VERSION" -m "$VERSION: optional Owner property on Tasks"
git push origin "$VERSION"

# build a distributable that carries its own version
mkdir -p dist/"$VERSION"
cp -r templates/project-tracker dist/"$VERSION"/
tar -czf dist/"$VERSION".tar.gz -C dist "$VERSION"
git archive --format=tar HEAD templates/project-tracker > dist/"$VERSION".src.tar
```

Put the version inside the artefact as well as in the filename. Buyers rename files. A support thread that starts with "which version am I on" costs more time than the template sold for.

```yaml
# dist/v2.3.0/template.yaml - ships inside the product
# keep these values and the code won't be misread on re-import
template: project-tracker
version: 2.3.0
released: 2026-02-14
requires_buyer_action: false
upgrade_from: ["2.2.x", "2.1.x"]
breaks:
  - property: Status
    change: "renamed from Stage"
    fix: "update formulas referencing prop(\"Stage\"); re-point automation conditions"
changelog: ./CHANGELOG.md
migration: ./MIGRATION-2.0.0.md
```

`requires_buyer_action` is the most useful field in that file. It lets a buyer decide in five seconds whether they can import the new version over a quiet afternoon or need to schedule the work.

## Changelogs and migration notes are different documents

A changelog is cumulative and written for everyone: one line per change, grouped under Added, Changed, Deprecated, Removed, Fixed. A migration note is written only for people who already customised the old version, and it exists only for MAJOR bumps.

A migration note that works has five parts: what changed, why it changed, the exact edit the buyer must make, how to verify it worked, and how to roll back to the previous tag. Keep it under one screen of text. If it needs more, the release is too big and should be split.

The hard part is not writing the note. It is noticing that one is required. Diff your schemas in CI:

```python
# tools/diff_schema.py - exits non-zero when a release needs a MAJOR bump
import json, sys

old = json.load(open("schemas/2.2.0.json"))
new = json.load(open("schemas/2.3.0.json"))

old_p = {p["name"]: p for p in old["properties"]}
new_p = {p["name"]: p for p in new["properties"]}

removed = sorted(set(old_p) - set(new_p))
retyped = sorted(
    n for n in old_p.keys() & new_p.keys()
    if old_p[n]["type"] != new_p[n]["type"]
)
required_added = sorted(
    n for n in set(new_p) - set(old_p) if new_p[n].get("required")
)
options_changed = sorted(
    n for n in old_p.keys() & new_p.keys()
    if set(old_p[n].get("options", [])) - set(new_p[n].get("options", []))
)

if removed or retyped or required_added or options_changed:
    print("breaking change detected - bump MAJOR and write a migration note")
    print("removed:", removed)
    print("retyped:", retyped)
    print("newly required:", required_added)
    print("options removed or renamed:", options_changed)
    sys.exit(1)
```

Export the schema to JSON on each release and commit it under `schemas/`. The diff then runs on every pull request, before you have promised anyone a date. It will only catch a renamed select option if options are in the export, so include them. The same instinct behind [choosing between a workflow builder and a plain script](/blog/workflow-builder-vs-plain-script/) applies here: the value is in the boundary you draw, not in the tool you pick.

## Announcing a breaking change without losing trust

Announce where the buyer actually is. That is usually the purchase receipt or the delivery email, not a blog post they will never revisit. Keep a permanent version-history page for the template and link it from the download.

Give a window. Two weeks is the practical minimum for a MAJOR, and keep the old tag downloadable and supported for at least one more MINOR cycle. Publish the support horizon in the listing, for example "1.x receives fixes until the next MAJOR ships".

Say the break in the first line. "v2.0.0 renames Stage to Status, update your formulas before upgrading" tells a buyer more than a paragraph about general improvements. Never describe a rename as polish.

Finally, do not auto-update a copy the buyer has edited. If you must push changes, push them to a staging view or a scratch table and let the buyer merge deliberately. Silent updates destroy the one asset that matters here: the assumption that their customisations are safe. The failure modes are predictable and all avoidable. Changelogs that only say "fixes and improvements". Version numbers that live only in a filename. A required property added in a PATCH. A support reply that starts by asking the buyer to re-download the whole thing.

## What to do next

1. Add `version` and `requires_buyer_action` to every template manifest you ship, then re-cut your current release so the version travels inside the artefact rather than beside it.
2. Create `CHANGELOG.md` at the root of the template repo using Keep a Changelog headings (Added, Changed, Deprecated, Removed, Fixed) and backfill the last two releases.
3. Export your schema to `schemas/<version>.json` on each release, including select options, and wire the diff script above into CI so a breaking change fails the build.
4. Write a one-page policy for your listing: what triggers MAJOR, how buyers are notified, and how long old tags stay supported.
5. If you want to study a mature set of layouts before writing your own version contract, Feishu Template Marketplace is a $19 USD one-time pack of twenty-plus ready-made Feishu/DingTalk templates covering project tracking, OKRs, meeting notes and documentation.

## Get Feishu Template Marketplace

[**Feishu Template Marketplace**](https://slashmaster6.gumroad.com/l/xohjh?utm_source=blog&utm_medium=article&utm_campaign=versioning-templates-without-losing-customisations) — **$19**, one-time payment, instant download. See the full breakdown on the [review page](/blog/feishu-templates/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
