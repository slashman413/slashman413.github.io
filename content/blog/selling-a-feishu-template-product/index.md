---
title: "Selling a Feishu Template as a Product: Design Notes"
description: "Packaging, versioning, licensing, delivery and the support loop for a paid Feishu template, plus the places buyers actually got stuck."
date: "2026-10-11T08:00:00+08:00"
draft: false
slug: "selling-a-feishu-template-product"
author: "Wayne Chang"
tags: ["feishu", "templates", "product-design", "licensing", "support"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/xohjh"
product_price: "19"
product_brand: "Slashman Tools"
product_sku: "SMT-FSH"
product_category: "Software > Productivity"
product_currency: "USD"
seo_title: "Selling a Feishu Template as a Product: Design Notes"
faq:
  - q: "Do I need a paid storefront to sell a Feishu template?"
    a: "No. A payment link plus an automated delivery email is enough; the template itself is a share link. The useful investment is a manifest, a changelog and a migration note per release, not storefront features."
  - q: "How do I handle buyers who want updates applied to a customised base?"
    a: "There is no merge, so answer honestly: ship migration notes with the steps the buyer applies by hand. State this in the license so it is a known boundary rather than a surprise after purchase."
  - q: "Can I stop buyers from resharing the template link?"
    a: "Not reliably. Design around it by pricing for leakage and putting ongoing value in patch notes and a maintained known-failures document rather than in link secrecy."
---

A Feishu template looks like a document but behaves like software. It has a schema, permissions, automation rules and a lifecycle, and the moment you charge for it, all four become your problem. What follows is the operating design I settled on while selling one, and the friction that showed up in the support inbox.

## What actually goes in the bundle

The thing you build in and the thing you ship cannot be the same object. Keep a working workspace where you iterate freely, then export a clean copy for buyers. Every time I skipped that step, I shipped a template with my own group chat baked into an automation rule.

The strip list is short and non-negotiable:

- Member fields holding your name or a colleague's
- Webhook URLs and chat targets inside automation steps
- API tokens or app credentials in custom scripts
- Realistic sample rows that could be mistaken for client data — use obvious placeholders
- Your own branding in document headers

Then describe the payload in a manifest. Buyers ask "what do I actually get" before anything else, and the manifest answers that in one screen. It also gives you a diff target: when 2.3.0 ships, you compare manifests instead of opening two workspaces side by side.

```json
{
  "name": "project-tracker",
  "version": "2.3.0",
  "platform": "feishu",
  "components": {
    "tables": ["Projects", "Tasks", "Risks"],
    "views": ["This week", "By owner", "Blocked"],
    "dashboards": ["Delivery health"],
    "automations": ["Notify owner on due-date change", "Daily digest"]
  },
  "requires": ["Bitable", "Automation", "Docs"],
  "last_breaking_change": "2.0.0",
  "sample_data": "placeholders-only",
  "automations_ship_disabled": true
}
```

Ship automations switched off. A rule that fires on install and posts to a chat the buyer does not own is the fastest way to generate a refund request. One install step — "open this rule, point it at your group, enable it" — costs you a line of documentation and saves a conversation.

## Versioning: pick MAJOR/MINOR/PATCH and mean it

Feishu templates are copied, not upgraded. A buyer duplicates your base into their tenant, customises it, and from then on there is no upgrade channel. Your version number is not a release label; it is the label on a decision the buyer has to make by hand. That is also why the patch mechanics deserve their own thinking — see [Versioning a Template So Buyers Do Not Lose Their Customisations](/blog/versioning-templates-without-losing-customisations/).

Set the rules before the first sale:

- **MAJOR** — removed or renamed fields, renamed tables, changed automation triggers. Buyers must migrate manually.
- **MINOR** — new tables, views or optional fields. Additive; a buyer can apply it in a few minutes.
- **PATCH** — labels, filters, formula corrections, README fixes. Safe to apply by hand.

| Approach | Buyer upgrade path | Your maintenance cost | What breaks | Use when |
|---|---|---|---|---|
| One rolling template link | None; they get today's file | Lowest | Silently, whenever you edit | The structure never changes |
| Dated snapshots (2026-03, 2026-06) | Re-copy and redo setup | Low | Predictably, at copy time | The product is still finding its shape |
| Semver plus migration notes | Additive patch, guided | Highest | Only on MAJOR | Structure is stable, buyers customise heavily |

Migration notes are the cheapest artefact you can write and the most requested. Keep one file per release:

```yaml
# migrations/2.3.0.md
from: 2.2.x
to: 2.3.0
breaking: false
steps:
  - Add field "Risk owner" (Person, single) to table Risks
  - "Update view Blocked: Status is Blocked OR Risk severity is High"
  - "Automation Daily digest: replace chat target with your own group, then enable"
manual_checks:
  - Confirm the timezone on the OKR cycle end date field
  - Test any field rename in a scratch copy before touching the live base
```

That last check matters. Formulas often reference fields by name, and a locale change or a rename is the same thing to the formula engine. Buyers who rename `Owner` to `负责人` and then find a rollup showing blank will email you, and they will be right to.

## Licensing and delivery without a storefront

The license page should fit on one screen and say five things: one-time payment; internal use within one workspace; no redistribution, resale, or inclusion in a paid course or client deliverable; no warranty, since the buyer copies it into their own tenant and owns the data there; and what support covers. Draw that last boundary explicitly — install questions and defects in the shipped structure, not customisation of fields the buyer added.

Delivery should be instant, because the delivery is a link. Feishu template share links can be forwarded, and you cannot prevent that. Price and design around it: the durable value is the update log and the known-failures documentation, not the secrecy of a base you already published once. A small script keeps per-buyer artefacts tidy:

```python
# deliver.py — stamp a buyer-specific README next to the template export
import json, pathlib, sys

order_id = sys.argv[1]
manifest = json.loads(pathlib.Path("manifest.json").read_text())
license_key = f"FSM-{order_id[:8].upper()}"

readme = f"""# {manifest['name']} {manifest['version']}
License key: {license_key}
Scope: internal use, one workspace. No redistribution.
Install: open the template link, choose "Use as template", pick a team workspace.
Automations ship disabled. Enable them only after repointing chat targets.
Changelog and migrations: see migrations/ and CHANGELOG.md
"""

pathlib.Path("dist/README.md").write_text(readme)
```

Step one of that README is not decoration. Copying a template into a personal space is the most common install mistake, and team-scoped automation permissions fail there in ways that look like a broken product rather than a wrong workspace. If you are still deciding whether a shared workspace template is the right shape at all, [Why Team Workspace Templates Beat One-Off Documents](/blog/workspace-templates-beat-one-off-docs/) covers that tradeoff from the buyer's side.

## The support loop and where buyers got stuck

Four failures accounted for most of the inbox:

1. **Personal workspace install.** Automation steps needing team scope fail quietly. Fix: the install guide names the requirement in the first line.
2. **Chat targets still pointing at my group.** Fixed by shipping automations disabled, then documenting the one edit needed.
3. **Field renames breaking formulas.** Fixed by marking load-bearing fields in the README and telling buyers to test renames in a scratch copy.
4. **Timezone drift on date fields.** OKR cycle boundaries shift by a day for buyers in another region. Fixed by making the timezone explicit in the setup checklist instead of assuming it.

There is a fifth request that is not a defect: buyers asking for updates to be applied to a base they have already customised. There is no merge. The honest answer is migration notes plus a note in the license that applying a MINOR or MAJOR is manual work. Saying that up front costs a few sales and saves a great deal of correspondence.

The loop itself is boring on purpose: one inbox, a public FAQ document shipped inside the bundle, answers batched once a week, and a rule that a defect becomes a patch rather than a longer email. Questions that are really consulting get a short reply and a pointer to the license boundary. The same instinct that keeps automations from flapping applies here — you want a stable response to a known failure, not a fresh diagnosis each time. [Triage Habits for Automation That Fails While You Sleep](/blog/triage-automation-failures-while-you-sleep/) is about machines, but the triage pattern transfers directly to a support queue.

## What to do next

1. Split your build workspace from your ship workspace this week, then walk the strip list. Check every automation for a hard-coded chat target or token.
2. Write `manifest.json` and adopt MAJOR/MINOR/PATCH in a `CHANGELOG.md`. Decide what counts as a breaking change before your first buyer, not after.
3. Draft the one-page license and a known-failures section for the FAQ. Ship automations disabled and say so in the first install step.
4. Set the support boundary in writing: one inbox, weekly batch, defects become patches, customisation is out of scope.
5. If you want to see what a finished bundle looks like before assembling your own, Feishu Template Marketplace is $19 one-time and ships twenty-plus ready-made Feishu/DingTalk templates covering project tracking, OKRs, meeting notes and documentation.

## Get Feishu Template Marketplace

[**Feishu Template Marketplace**](https://slashmaster6.gumroad.com/l/xohjh?utm_source=blog&utm_medium=article&utm_campaign=selling-a-feishu-template-product) — **$19**, one-time payment, instant download. See the full breakdown on the [review page](/blog/feishu-templates/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
