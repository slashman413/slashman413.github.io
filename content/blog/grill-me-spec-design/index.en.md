---
title: "Grill-Me Spec Design: Getting AI to Ask Only the Right Questions"
date: "2026-08-03T11:00:00+08:00"
description: "A complete breakdown of the Grill-Me interactive spec loop: dimensions and criticality tracking, coverage-based readiness, and why one-question-at-a-time is the golden rule of AI interaction design."
slug: "grill-me-spec-design"
tags: [ai, grill-me, spec, prompt-engineering, interaction-design, workflow]
draft: false
schema: "Article"
---

# Grill-Me Spec Design: Getting AI to Ask Only the Right Questions

**SEO Keywords**: Grill-Me, interactive spec design, AI Q&A design, spec coverage, spec-driven development, AI interaction design

"Asking the right questions" is the most underrated capability in AI system design.

Most "AI workflow" tools fall into two interaction patterns: **ask all 20 questions at once** (the user closes the tab), or **ask nothing** (silent misinterpretation in production). The Grill-Me loop is a third path: **ask only what is genuinely ambiguous, one question at a time, until spec coverage is complete.**

This article dissects Grill-Me's design — it is also the documentation for the core interaction engine of [AI Workflow Builder](https://slashmantools.us/blog/ai-workflow-builder/).

## Core Concepts: Dimensions and Criticality

Grill-Me structures "ambiguity" into six dimensions:

| Dimension | The question it pins down |
|-----------|---------------------------|
| goal | What single concrete outcome must a successful run produce? |
| inputs | Where do inputs come from? What format? |
| outputs | What is the output shape? Where does it go? |
| constraints | What hard limits exist? (budget, time, tools, compliance) |
| success | How do you know a run was correct? When do you reject output? |
| edge_cases | What is the behavior on failure? |

Every dimension carries two flags: **critical** and **covered**. The spec is `ready` only when all critical dimensions are covered — that is a programmatic definition of done.

```json
{
  "coverage": { "goal": true, "inputs": true, "outputs": false,
                "constraints": false, "success": false, "edge_cases": false },
  "ready": false,
  "missing": ["outputs", "success"],
  "warnings": ["constraints", "edge_cases"]
}
```

## Principle 1: One Question at a Time

Human tolerance for a wall of questions is zero. One-at-a-time wins on four axes:

1. **Low cognitive load**: each question gets a real answer
2. **Higher answer quality**: single question → single focus → sharper answers
3. **Adaptive paths**: the next question depends on the previous answer
4. **Low abandonment cost**: the user always knows how many questions remain

## Principle 2: Ask Only What's Genuinely Ambiguous

Grill-Me is not an interrogation — it is **differential questioning**:

- Dimensions already explicit in the prompt → **skip** (e.g. "email it to team@company.com" — don't re-ask the output target)
- Partially ambiguous dimensions → ask only the missing piece
- Critical dimensions never mentioned → **always ask** (critical)

"Ambiguity" is decided by the spec builder: each dimension has thresholds; insufficient answers land in `missing`.

## Principle 3: Questions Must Be Answerable

An invalid question: "Should your system scale well?" — obviously yes.

A valid question: "How many competitors per run — under 10 or over 100?" — it forces a **concrete choice that changes the architecture**.

Test: if "yes" and "no" produce the same workflow, the question should not be asked.

## Principle 4: Answers Land in a Versioned Spec

Every answer is written into a versioned spec (spec.yaml). The spec is the single source of truth:

- **Auditable**: every design decision has provenance
- **Reproducible**: same spec → same DAG → same code
- **Evolvable**: requirements change → edit spec → regenerate, instead of patching glue code

## Worked Example: From "Market Research" to a Constructible Spec

```
Q1 (goal): What single concrete outcome must a successful run produce?
A1: A daily Markdown report of competitor pricing across 5 companies

Q2 (inputs): Where does the competitor list come from?
A2: I provide a URL list, stored in the project settings

Q3 (success): How do you know a run was correct?
A3: All 5 priced, sampled values match source pages

Q4 (edge_cases): What if one site blocks scraping?
A4: Flag "needs human review", continue the other 4

→ coverage: goal✓ inputs✓ outputs✓(from prompt) success✓ edge_cases✓ → ready: true
```

Note that `outputs` was never asked — the prompt already said "email a summary". That is **asking only what's genuinely ambiguous**.

## Grill-Me vs Traditional Spec-First

| | Traditional spec-first | Grill-Me |
|---|---|---|
| Starting point | blank document | one prompt |
| Questions | listed all at once (a wall) | one at a time (adaptive) |
| Ambiguity handling | ask everything | ask only gaps |
| Definition of done | human judgment | coverage (programmatic) |
| Spec evolution | rewrite the document | versioned increments |

## When Not to Use Grill-Me

Honest answer: tasks with **clear goals, fixed inputs/outputs, and no failure paths** (e.g. "convert this CSV to JSON") don't need Q&A. Grill-Me pays off on high-ambiguity work — multi-agent systems, automation pipelines, research agents. Rule of thumb: if the prompt already IS a complete spec, build directly.

## Build It Yourself

The Grill-Me engine is the open-source core of [AI Workflow Builder](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=seo&utm_campaign=aiwb) (MIT license). The domain layer has zero framework imports — read the source to learn, or adapt it into your own Q&A engine.

Further reading: [Designing Multi-Agent AI Workflows](/blog/designing-multi-agent-ai-workflows-guide/) · [Build Your First AI Workflow with AI Workflow Builder](/blog/ai-workflow-builder-tutorial/)
