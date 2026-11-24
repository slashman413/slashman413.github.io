---
title: "Grill-Me Prompt & Interaction Specification Design: Make AI Ask the Right Questions Before Coding"
seo_title: "Grill-Me Prompt & Spec Design: Spec-Driven AI Q&A (2026)"
date: "2026-08-03T11:00:00+08:00"
lastmod: 2026-11-24
description: "Copy-pasteable Grill-Me prompt and specification design guide: force AI agents to ask one question at a time across 6 dimensions before writing any code."
slug: "grill-me-spec-design"
tags: [ai, grill-me, spec, prompt-engineering, interaction-design, workflow]
keywords: ["grill-me prompt", "grill me skill", "grill-me interaction specification design", "spec-driven development AI prompt", "Claude Code grill-me prompt", "AI specification coverage"]
draft: false
schema: "Article"
faq:
  - q: "What is a Grill-Me prompt in AI coding workflows?"
    a: "A Grill-Me prompt is a spec-driven instruction that forbids an AI agent (such as Claude Code, Cursor, Codex CLI, or Gemini CLI) from writing code until it interviews you one question at a time to resolve every architectural, data, and edge-case ambiguity."
  - q: "Why should an AI specification loop ask only one question at a time?"
    a: "Asking 15–20 questions in a single message overloads the developer and leads to shallow answers. One-question-at-a-time interrogation lowers cognitive load, lets each answer prune the remaining decision tree, and produces higher-precision specifications."
  - q: "What are the six dimensions of Grill-Me specification coverage?"
    a: "The six dimensions are goal (single concrete deliverable), inputs (source and schema), outputs (shape and destination), constraints (budget, latency, allowed tools), success (verifiable pass/refusal rules), and edge_cases (retry, fallback, or dead-letter behavior)."
  - q: "How do I install a /grill-me slash command in Claude Code or Cursor?"
    a: "Save the Grill-Me prompt template as `.claude/commands/grill-me.md` in Claude Code or `.cursor/commands/grill-me.md` in Cursor. Pass your feature brief via `$ARGUMENTS`, and the agent will inspect your codebase before starting the one-at-a-time interview."
  - q: "When should you skip the Grill-Me Q&A loop?"
    a: "Skip Grill-Me for deterministic single-step tasks where the input, transformation, and output are already fully specified in the prompt (for example, converting a CSV file to JSON or renaming a variable across a module)."
---

**Quick answer:** A **Grill-Me prompt** is a spec-driven interaction pattern for AI coding agents (Claude Code, Cursor, Codex, and Gemini CLI) that prevents hallucinated architectures. Instead of writing code immediately or dumping twenty questions at once, the agent inspects your repo and asks **one genuinely ambiguous question at a time** until all six specification dimensions are locked into `spec.yaml`.

"Ask the right questions" is the most underrated capability in AI system design.

Most AI coding assistants and workflow builders fail in one of two ways: **ask 20 questions up front** (developers close the tab immediately), or **ask nothing and guess** (hidden assumptions silently compound until production breaks). The Grill-Me loop takes the third path: **inspect known facts first, ask only what is genuinely ambiguous, one question at a time, and block implementation until specification coverage is complete.**

This guide provides a copy-pasteable `/grill-me` prompt template for your daily CLI/IDE workflow and breaks down the 6-dimension specification engine powering [AI Workflow Builder](/blog/ai-workflow-builder/).

## Copy-Pasteable `/grill-me` Prompt Template (Claude Code, Cursor, Codex & Gemini CLI)

You can paste this prompt directly into any LLM chat or save it as a reusable custom command (see our [Slash Commands for Developers Guide](/blog/slash-commands-for-developers-guide-2026/) for exact `.claude/commands/` and `.cursor/commands/` file paths):

```markdown
You are a strict technical specification architect running a Grill-Me interview.
Your job is to eliminate every critical ambiguity in my request BEFORE any code or workflow is generated.

Follow these 6 rules without exception:
1. Recon First (Facts vs. Decisions): Inspect the current repository, files, and prompt first. Never ask me a question you can answer by reading the workspace.
2. Track 6 Dimensions: Evaluate coverage across [goal, inputs, outputs, constraints, success, edge_cases]. Mark each dimension as covered or missing.
3. One Question at a Time: Ask ONLY ONE question per turn targeting the highest-impact missing dimension. Wait for my reply before asking the next.
4. Force Concrete Trade-Offs + Recommend a Default: Phrase every question with concrete architectural choices and include your "(Recommended)" default so I can confirm in one word or override it.
5. Phase Gate (No Premature Code): Do NOT write implementation code or scaffold files while any critical dimension is uncovered.
6. Emit Versioned Spec: Once all critical dimensions are covered (ready: true), output the finalized `spec.yaml` and coverage JSON.

Feature / workflow request: $ARGUMENTS
```

## Core Concepts: Dimensions and Criticality

Grill-Me structures ambiguity into six machine-checkable dimensions:

| Dimension | Question to Nail Down | Example Architectural Decision |
|-----------|----------------------|--------------------------------|
| `goal` | What single concrete deliverable must a successful execution produce? | Daily Markdown diff report vs. database upsert |
| `inputs` | Where do inputs come from and what is their exact schema? | Static URL list in config vs. live webhook payload |
| `outputs` | What is the closed output shape and destination? | Typed JSON schema sent to Slack webhook or email |
| `constraints` | What hard boundaries apply (budget, latency, allowed tools, auth)? | Max 3 LLM retries, local models only, read-only DB user |
| `success` | How do we verify a run succeeded, and when must it refuse output? | All 10 targets parsed + schema valid; refuse on partial data |
| `edge_cases` | What is the exact failure path when an upstream dependency breaks? | Route failed item to dead-letter queue; continue remaining items |

Each dimension carries two flags: **criticality** (`critical: true | false`) and **coverage** (`covered: true | false`). The specification reaches `ready: true` only when every critical dimension is covered — turning "do we understand the requirements?" into a programmable definition of done:

```json
{
  "coverage": {
    "goal": true,
    "inputs": true,
    "outputs": false,
    "constraints": false,
    "success": false,
    "edge_cases": false
  },
  "ready": false,
  "missing": ["outputs", "success"],
  "warnings": ["constraints", "edge_cases"]
}
```

## Design Principle 1: One Question at a Time

Human tolerance for a wall of 15 bulleted questions is zero. Enforcing a single question per turn gives you four structural advantages:

1. **Low cognitive load**: The developer evaluates one trade-off at a time instead of juggling six subsystems in prose.
2. **Higher answer precision**: Single question $\rightarrow$ single focus $\rightarrow$ concrete constraint instead of hand-waving.
3. **Adaptive decision tree**: Answer $N$ prunes irrelevant branches before Question $N+1$ is ever asked.
4. **Transparent stopping point**: Showing coverage (`4/6 dimensions locked`) tells the user exactly how close the spec is to completion.

## Design Principle 2: Only Ask What Is Genuinely Ambiguous

Grill-Me is not an interrogation for its own sake — it is **differential Q&A**:

- **Facts discoverable in the repo or prompt $\rightarrow$ skip.** If `package.json` already shows PostgreSQL and Prisma, or the prompt already states *"send to `team@company.com`"*, never ask which database or output destination to use.
- **Partially specified dimensions $\rightarrow$ ask only the delta.** If the user specified an email output, ask only about the schema or failure notification, not the transport.
- **Omitted critical dimensions $\rightarrow$ block and ask.** Missing `success` criteria or `edge_cases` are where production workflows fail; see [From One Sentence to a Runnable Workflow: A Refund Triage Spec](/blog/one-sentence-to-runnable-workflow/) for a worked example of turning a one-line prompt into typed failure paths.

## Design Principle 3: Questions Must Change the Architecture

A bad question looks like: *"Does your system need good scalability and error handling?"* — nobody says no, and the answer changes zero lines of code.

A good Grill-Me question forces a concrete branch:

> *"When one competitor's pricing page returns HTTP 403, should the run (A, Recommended) flag that competitor for manual review and send the remaining 9 prices, or (B) abort the entire daily report and page on-call?"*

**The litmus test:** If answering option A vs. option B does not change the generated `spec.yaml`, data schema, or DAG topology, delete the question.

## Design Principle 4: Answers Compile into a Versioned `spec.yaml`

Every answer updates a versioned specification file (`spec.yaml`) in real time. Treating `spec.yaml` as the single source of truth gives your team:

- **Auditability**: Every architectural boundary traces back to an explicit human decision.
- **Reproducibility**: Same `spec.yaml` $\rightarrow$ same validated DAG $\rightarrow$ same typed code scaffold.
- **Clean evolution**: When business rules change, you edit `spec.yaml` and re-compile instead of patching brittle glue code across ten files.

## Worked Walkthrough: From Vague Prompt to Buildable Specification

Suppose a developer enters: *"Scrape 5 competitor pricing pages every morning and send a daily summary."*

```text
Q1 (goal): What single concrete deliverable must each morning run produce?
   (Recommended: A Markdown table comparing current vs. previous day prices for all 5 competitors)
A1: A daily Markdown report containing current pricing and 24h deltas for the 5 competitors.

Q2 (inputs): Where does the competitor URL list come from?
   (Recommended: A versioned YAML config file in the repo)
A2: I provide a URL list stored in project settings.

Q3 (success): What is the pass condition before the report is emailed?
   (Recommended: All 5 pages parsed with non-null numeric prices verified against schema)
A3: All 5 have valid numeric prices, and sampled values match the source HTML selector.

Q4 (edge_cases): What happens when one site blocks scraping (403/timeout)?
   (Recommended: Flag that URL as "pending manual review" and deliver the other 4)
A4: Flag "pending manual review" in the table; do not block the other 4.

→ coverage: goal✓ inputs✓ outputs✓(from prompt) success✓ edge_cases✓ → ready: true
```

Notice that `outputs` was never asked because *"send a daily summary"* was already present in the initial prompt.

## How Grill-Me Compares to Vibe Coding and Traditional Spec-First

| Dimension | Unstructured "Vibe Coding" | Traditional Spec-First RFC | Grill-Me Spec Loop |
|---|---|---|---|
| **Starting point** | Vague 1-sentence prompt | Blank RFC template | Vague 1-sentence prompt + repo recon |
| **Clarification flow** | None (AI silently guesses) | Wall of 20 static questions | **1 adaptive question at a time** |
| **Ambiguity handling** | Discovered via runtime bugs | Author writes everything manually | Differential: asks only missing dimensions |
| **Definition of done** | "Code compiles / looks right" | Manual peer review | **Programmatic 6-dimension coverage (`ready: true`)** |
| **Artifact produced** | Unverified code | Static prose document | **Versioned `spec.yaml` $\rightarrow$ Verified DAG** |

## When Not to Use Grill-Me

If a task has a fixed input, a deterministic transformation, and zero branching failure modes — such as *"convert this CSV to JSON"* or *"write unit tests for `parseDate()`"* — running an interactive Q&A loop is pure overhead. Use Grill-Me when ambiguity is expensive: multi-agent systems, external API integrations, data pipelines, and new product features.

## Get Started

The Grill-Me specification engine is the open-source domain core of [AI Workflow Builder](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=seo&utm_campaign=aiwb) (MIT license, zero framework dependencies in the spec layer) and integrates cleanly with the broader [AI Developer Stack](/blog/ai-dev-stack/).

**Related guides in the Spec-Driven & Developer CLI cluster:**
- [Slash Commands for Developers: Custom Command Guide (2026)](/blog/slash-commands-for-developers-guide-2026/) — Package `/grill-me` as a project slash command in Claude Code, Cursor, Gemini CLI, or Codex
- [From One Sentence to a Runnable Workflow: A Refund Triage Spec](/blog/one-sentence-to-runnable-workflow/) — See how a specification compiles into typed inputs, outputs, and dead-letter queues
- [How to Design Multi-Agent AI Workflows: From Prompt to Verified DAG](/blog/designing-multi-agent-ai-workflows-guide/) — Static DAG validation after Grill-Me completes
- [Build Your First AI Workflow with AI Workflow Builder: Complete Tutorial](/blog/ai-workflow-builder-tutorial/) — Step-by-step walkthrough from prompt to GitHub repo
- [Best AI Developer Stack Toolkit for Builders in 2026](/blog/ai-dev-stack/) — Complete prompt, framework, and deployment toolchain
