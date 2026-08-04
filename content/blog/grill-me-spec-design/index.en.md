---
title: "Grill-Me Interaction Specification Design: Let AI Ask Only the Right Questions"
date: "2026-08-03T11:00:00+08:00"
description: "Full design breakdown of the Grill-Me interaction specification loop: how AI asks only genuinely ambiguous questions, how dimensions and criticality flags track specification coverage, and why one-question-at-a-time is the golden rule of interaction design."
slug: "grill-me-spec-design"
tags: [ai, grill-me, spec, prompt-engineering, interaction-design, workflow]
draft: false
schema: "Article"
---

# Grill-Me Interaction Specification Design: Let AI Ask Only the Right Questions

**SEO Keywords**: Grill-Me, interaction specification design, AI Q&A design, specification coverage, prompt engineering, spec-driven development, interaction design for AI

"Ask the right questions" is the most underrated capability in AI system design.

Most "AI workflow" tools on the market have interaction designs in two flavors: **ask 20 questions up front** (users close the tab immediately), or **ask nothing** (misunderstandings silently compound after launch). The Grill-Me loop is the third path: **only ask what is genuinely ambiguous, one question at a time, until specification coverage is full.**

This article breaks down the Grill-Me design — and serves as the specification for the core interaction engine of [AI Workflow Builder](https://slashmantools.us/blog/ai-workflow-builder/).

## Core Concepts: Dimensions and Criticality

Grill-Me structures "ambiguity" into six dimensions:

| Dimension | Question to Nail Down |
|-----------|----------------------|
| goal | What single concrete deliverable must a successful execution produce? |
| inputs | Where do inputs come from? What is the format? |
| outputs | What is the output shape? Where does it go? |
| constraints | Are there hard constraints? (budget, time, tools, regulations) |
| success | How do you know it ran correctly? When should it refuse output? |
| edge_cases | What is the behavior on failure? |

Each dimension carries two tags: **criticality** (critical or not) and **coverage** (answered or not). The specification is only ready when "all critical dimensions are covered" — this is a programmable definition of done.

```json
{
  "coverage": { "goal": true, "inputs": true, "outputs": false,
                "constraints": false, "success": false, "edge_cases": false },
  "ready": false,
  "missing": ["outputs", "success"],
  "warnings": ["constraints", "edge_cases"]
}
```

## Design Principle 1: One Question at a Time

Human tolerance for a "wall of questions" is zero. One-at-a-time has four advantages:

1. **Low cognitive load**: Each question can be answered thoughtfully
2. **Higher answer quality**: Single question → single focus → more precise answer
3. **Adaptable path**: Decide what the next question is based on the previous answer
4. **Low abandonment cost**: The user always knows "how many are left"

## Design Principle 2: Only Ask What Is Genuinely Ambiguous

Grill-Me is not a lie detector — it is **differential Q&A**:

- Dimensions already clear in the prompt → **skip** (e.g., "send to team@company.com" means do not ask again about the output target)
- Partially ambiguous dimensions → ask only the missing piece
- Completely omitted critical dimensions → always ask (critical)

The judgment of "ambiguity" comes from the spec builder: each dimension has a threshold, and insufficient answers get flagged as missing.

## Design Principle 3: Questions Must Be Answerable

A bad question looks like this: "Does your system need good scalability?" — a pointless question; who would say no?

A good question looks like this: "How many competitors does each execution handle? Under 10, or over 100?" — it forces the user to make a **concrete, architecture-affecting choice**.

The criterion: if the answer being "yes" or "no" does not change the workflow structure, the question should not be asked.

## Design Principle 4: Answers Go into a Versioned Specification

Every answer is written to a versioned specification (spec.yaml) in real time. The specification is the single source of truth:

- **Auditable**: Every design decision has a lineage
- **Reproducible**: Same spec → same DAG → same code
- **Evolvable**: Requirements change → edit spec → regenerate, instead of hacking glue code

## Practical: From "Market Research" to Buildable Specification

```
Q1 (goal): What single concrete deliverable must a successful execution produce?
A1: A daily Markdown report containing pricing for 5 competitors

Q2 (inputs): Where does the competitor list come from?
A2: I provide a URL list, stored in project settings

Q3 (success): How do you know it ran correctly this time?
A3: All 5 have prices, and a sample matches the source pages

Q4 (edge_cases): What happens when one site blocks scraping?
A4: Flag "pending manual review," do not interrupt the other 4

→ coverage: goal✓ inputs✓ outputs✓(from prompt) success✓ edge_cases✓ → ready: true
```

Note: outputs was not asked — because the prompt already said "send a daily summary." This is **only ask what is genuinely ambiguous**.

## How It Differs from Traditional Spec-First

| | Traditional spec-first | Grill-Me |
|---|---|---|
| Start | Blank document | A single prompt |
| Questions | List all at once (wall) | One at a time (adaptive) |
| Ambiguity handling | Ask everything | Ask only what is missing |
| Definition of done | Human judgment | Coverage-based (programmatic) |
| Spec evolution | Rewrite the document | Versioned incrementals |

## When Not to Use Grill-Me

Honestly: tasks where the goal is clear, inputs and outputs are fixed, and there are no failure paths (e.g., "convert this CSV to JSON") do not need Q&A. Grill-Me's value is in high-ambiguity tasks — multi-agent systems, automated pipelines, research agents. The criterion: if the prompt itself is already a complete specification, build directly.

## Get Started

The Grill-Me engine is the open-source core of [AI Workflow Builder](https://slashmaster6.gumroad.com/l/amwkf?utm_source=blog&utm_medium=seo&utm_campaign=aiwb) (MIT license), the domain layer has zero framework dependencies, and you can read the source directly to learn or fork it to build your own Q&A engine.

Further reading: [How to Design Multi-Agent AI Workflows](/blog/designing-multi-agent-ai-workflows-guide/) · [Build Your First AI Workflow with AI Workflow Builder](/blog/ai-workflow-builder-tutorial/)