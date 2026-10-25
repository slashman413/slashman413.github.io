---
title: "A Change Discipline for Multi-Layer Stacks: Four Rules That Hold"
description: "Four standing rules for changing a multi-layer AI stack: snapshot the dependency map, smoke the seam, write the revert point, bump the contract."
date: "2026-10-25T08:00:00+08:00"
draft: false
slug: "change-discipline-multi-layer-stacks"
author: "Wayne Chang"
tags: ["devops", "change-management", "ai-stacks", "testing", "versioning"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/nulyms"
product_price: "79"
product_brand: "Slashman Tools"
product_sku: "SMT-ADS"
product_category: "Software > Developer Tools"
product_currency: "USD"
seo_title: "A Change Discipline for Multi-Layer Stacks: Four Rules That "
faq:
  - q: "What counts as a layer in a multi-layer stack?"
    a: "Anything with an interface another part consumes: the prompt library, the agent runtime, the tool gateway, the deploy target. If you can name what a component reads from its neighbor, it is a layer for the purpose of these rules."
  - q: "Is a git tag a good enough revert point?"
    a: "Only when the change is invisible outside the layer you edited. As soon as another layer can observe it, you need the written note covering config values, model IDs and contract versions, because git does not track any of those."
  - q: "How is a seam smoke test different from an integration test?"
    a: "It is narrower and faster: fixed inputs, shape assertions, only the interfaces the bundle touched. Its value comes from being written before the change, so it is capable of failing rather than just confirming what you already did."
---

No single edit to a multi-layer stack is dangerous. Each edit is small, reviewed, and locally correct. What breaks these systems is accumulation: the seventh change, made three weeks after the first, by someone who can no longer reconstruct which layer silently started depending on it.

That is the whole argument. Below is the standing rule set I would apply to any bundle of layers, whether it is a prompt library feeding an agent runtime feeding a tool gateway feeding a deploy target.

## The unit of change is the bundle, not the file

Git tracks files. Incidents arrive as bundles. A change bundle is every edit that has to land together for the system to stay coherent: a new output field in the prompt layer, the parser in the runtime that reads it, the deploy variable that turns it on. Each of those commits passes review on its own. Together they define a state nobody described out loud.

Two costs sit on either side of this. Uniform discipline on every edit is too expensive, and nobody writes a revert point for a typo in a README. No discipline at all is cheap until the first incident, and then you spend the incident reconstructing dependencies from memory and shell history. The rules below are the cheap side of that trade: minutes per bundle, scaling with blast radius rather than line count.

There is a related problem in deciding which layer is allowed to know about which. [How to wire an AI dev stack so each layer has one job](/blog/upgrade-one-layer-ai-stack/) covers boundary drawing. This article assumes the boundaries exist and asks what you do when you touch them.

## Four rules that hold for every bundle

**1. Snapshot the dependency map before the change.**

A lockfile records versions. A dependency map records edges: which layer reads which field of which contract. Those are different artifacts, and only the second one explains incidents. Keep the map in the repo, small enough to read on one screen, with an owner and a contract version on every edge. If it doesn't fit on a screen, the layer boundaries are wrong, not the map.

```yaml
# .stack/map.yaml
layer: agent-runtime
depends_on:
  - {layer: prompt-library, consumes: [input_schema, output_schema], contract: prompt-library@2}
  - {layer: tool-gateway,   consumes: [tool_name, args_schema],    contract: tool-gateway@1}
  - {layer: deploy-target,  consumes: [env_vars, health_path],    contract: deploy-target@3}
owned_files: [agents/**, contracts/agent-runtime@*]
```

Then, before you start editing, record what you believed was true:

```bash
mkdir -p .stack/snap
git rev-parse HEAD > .stack/snap/head
git ls-files 'prompts/*' 'agents/*' 'deploy/*' | xargs sha256sum > .stack/snap/sums
pip freeze > .stack/snap/pip.txt 2>/dev/null || true
npm ls --all --json > .stack/snap/npm.json 2>/dev/null || true
```

The snapshot is not for rollback; git does that better. It is the record you diff against when something breaks two layers away. The difference between the map then and the map now is your incident timeline, written before you needed it.

**2. Run the seam smoke test after.**

Not the full suite. The full suite is slow, and slow tests are the ones skipped before a push. The seam test hits only the interfaces the bundle touched, with fixed inputs, and asserts shape rather than quality. You cannot gate prompt quality with an exit code. You can gate that the runtime still receives an object with a `text` field and that the tool registry still answers.

The rule that gets missed: the seam test has to exist before the change. A test written afterward encodes the new behavior and can never fail. Write it against the pre-change state, watch it pass, then edit.

```bash
#!/usr/bin/env bash
# .stack/seam-smoke.sh <seam>...  exits 0 only if every named seam still answers
set -euo pipefail
for seam in "$@"; do
  case "$seam" in
    prompt->runtime)
      curl -fsS -X POST "$AGENT_URL/run" -H 'content-type: application/json' \
        -d '{"prompt_id":"smoke/hello","input":{"name":"seam"}}' \
      | jq -e '.output.text | type == "string"' >/dev/null ;;
    runtime->tool)
      curl -fsS "$AGENT_URL/tools" \
      | jq -e '[.tools[] | select(.name == "search")] | length == 1' >/dev/null ;;
    *) echo "unknown seam: $seam" >&2; exit 2 ;;
  esac
  echo "ok: $seam"
done
```

Two seams, one script, no framework. If you later need a framework, the case statement ports without drama.

**3. Write the revert point.**

A revert point is not `git revert`. Git holds code. It does not hold the environment variable you flipped in a dashboard, the model ID you pinned, the provider tier you moved to, or the prompt ID you re-pointed in a registry. If a revert note has no value for every layer the bundle touched, it is a wish, not a plan.

```yaml
# .stack/reverts/0007-tool-timeout.yaml
change: raise tool gateway timeout, allow one retry on tool_timeout
layers_touched: [agent-runtime, deploy-target]
revert_to:
  git_sha: 9f2c1ab
  contracts: {prompt-library: 2, tool-gateway: 1}
  config: {AGENT_TOOL_TIMEOUT_S: "10", AGENT_TOOL_RETRIES: "0"}
  external: none
verify_after_revert: [prompt->runtime, runtime->tool]
```

Write it before the change, in the same bundle, and have a second person read it. The note doubles as the decision document at 2am: revert or roll forward.

**4. Update the layer contract when the interface moves.**

Interface means the shape a neighboring layer can rely on: field names, types, required keys, error codes, auth. Changing a regex inside a function is not an interface move. Returning `{"text": "..."}` where you used to return a bare string is, and it needs a version bump plus a run of the neighbor's seam test, not because the neighbor is probably wrong but because that run is the only thing proving it is still right.

Bump minor for additive changes, major for anything a consumer would have to edit code to survive. Never patch a contract version in place; a number that changes meaning underneath itself defeats the point of versioning. The same reasoning applies to [versioning a template so buyers do not lose their customisations](/blog/selling-a-feishu-template-product/).

## Where the rules scale down

Applying all four to every edit is the fastest way to make the discipline collapse, because people skip the whole thing rather than apply a quarter of it. This is the practical form of what [upgrading one layer without breaking the rest](/blog/upgrade-one-layer-ai-stack/) argues: scale the ceremony to the blast radius.

| Change | Map snapshot | Seam smoke test | Revert point | Contract bump |
| --- | --- | --- | --- | --- |
| Prompt text only | no | one seam | tag only | no |
| Prompt output shape | yes | prompt -> runtime | full | minor |
| Tool signature | yes | runtime -> tool | full | major |
| Model or provider swap | yes | all seams | full, including provider settings | usually no |
| Deploy env var | yes | health + one seam | config only | no |

"Tag only" means the change lives inside one layer and no other layer can observe it, so a git tag is enough. Everything else needs the written note. The map snapshot is required whenever a bundle crosses a layer boundary, which is most bundles that matter and very few that are urgent.

Keep contracts short enough to move. A contract that cannot change is one people route around.

```yaml
# contracts/tool-gateway@1.yaml
owner: tools
status: stable
input:  {required: [tool_name, args]}
output: {required: [ok], optional: [result, error]}
errors:
  - {code: tool_not_found, retryable: false}
  - {code: tool_timeout, retryable: true}
```

Notice what is absent: prose about intent, and examples of every call site. Both rot faster than the shape does. The shape is what the neighbor's test asserts against, and a test that fails on a shape change is the mechanism working correctly.

## What to do next

1. Write `.stack/map.yaml` for one repo today. List the layers and the two or three fields each one actually consumes from its neighbor. If you cannot fill in a contract version for an edge, that edge is the next thing to investigate.
2. Write one seam test before your next change, and watch it pass against the current code before you touch anything. A test you write afterward is documentation with extra steps.
3. Add a revert-note template to your PR template. Make it mergeable only if every touched layer has a recorded value, including config, model IDs and pinned prompt IDs.
4. Bump contract versions on shape changes only, and wire the bump into the neighbor's seam test so the two move together.
5. If you would rather start from a stack where the seams are already named, the AI Developer Stack Bundle is $79 one-time at https://slashmaster6.gumroad.com/l/nulyms: a prompt library, agent framework, deployment tooling and tutorials, pre-configured to work together. You still owe it a dependency map, but the edges are at least drawn for you.

## Get AI Developer Stack Bundle

[**AI Developer Stack Bundle**](https://slashmaster6.gumroad.com/l/nulyms?utm_source=slashmantools&utm_medium=blog-article&utm_campaign=change-discipline-multi-layer-stacks) — **$79**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-dev-stack/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
