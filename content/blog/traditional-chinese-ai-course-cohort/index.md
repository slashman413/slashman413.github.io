---
title: "Running a First Traditional-Chinese AI Course Cohort: Notes"
description: "A practical case study of a first live Traditional-Chinese AI cohort: lesson shape, exercises, homework review, student stalls, and revisions."
date: "2026-10-03T08:00:00+08:00"
draft: false
slug: "traditional-chinese-ai-course-cohort"
author: "Wayne Chang"
tags: ["ai-course", "cohort-based", "traditional-chinese", "course-design", "automation"]
schema: "ProductReview"
product_url: "https://slashmaster6.gumroad.com/l/vzalgb"
product_price: "69"
product_brand: "Slashman Tools"
product_sku: "SMT-AIC"
product_category: "Online Course"
product_currency: "USD"
seo_title: "Running a First Traditional-Chinese AI Course Cohort: Notes"
faq:
  - q: "How large should a first live cohort be?"
    a: "Start smaller than you think. The homework review loop, not the lecture, sets the real limit on how many students you can support."
  - q: "Should I teach Traditional Chinese prompts or English prompts?"
    a: "Teach both. Use Traditional Chinese for the learner's domain and English for keys, commands, or tool documentation when that is what the software expects."
  - q: "What is the hardest part of running a Traditional-Chinese AI cohort?"
    a: "Setup friction and terminology drift. A preflight script and a shared glossary remove more problems than adding extra lecture time."
---

I ran the first live cohort for a Traditional-Chinese AI course aimed at beginners who wanted applied workflows. This is not a victory lap. It is a record of the lesson shape, the homework loop, the places students stopped moving, and the revisions I made before the next session. I did not collect satisfaction scores or completion percentages, so everything below comes from session notes, homework threads, and live Q&A.

## Cohort shape and lesson design

The cohort followed a four-unit, seventeen-lesson outline. Each live lesson was 75 minutes and had the same shape: 10 minutes recap and questions, 15 minutes concept, 20 minutes demo, 20 minutes guided exercise, 10 minutes review and next-step instructions. The constraint was deliberate. Beginners do not need more lecture; they need one repeatable action.

Every lesson had exactly one exercise. The exercise was not a project. It produced one artifact: a prompt file, a JSON output, a short script, or a workflow diagram. For example, unit 1 lesson 3 asked students to turn a messy customer email into a structured JSON object with fixed keys. Unit 3 lesson 2 asked them to wire a prompt into a small Python function and run it from the command line. The artifact had to be submitted even if it was wrong.

I used three lesson formats and switched between them based on the material.

| Format | When it worked | Tradeoff |
|---|---|---|
| Demo-first | Tool setup, API calls, file handling | Students copy the demo without understanding the error path |
| Exercise-first | Prompt design, structured output, review loops | Students stall earlier and need more live triage |
| Hybrid | Unit 4 workflows | More preparation, but fewer abandoned exercises |

The table is not a ranking. It is a decision aid. Demo-first reduced early frustration with environment issues. Exercise-first exposed misconceptions faster. Hybrid worked when the exercise depended on two earlier skills.

## Exercise pattern and homework review loop

The homework loop was simple on paper: submit, triage, review, revise. In practice, it needed rules. Each submission had three required files: `prompt.md`, `output.json`, and `reflection.md`. The reflection had to answer two questions: what did you expect, and what actually happened. That one file gave reviewers more signal than the output alone.

Triage happened in a shared queue. I used three labels: `blocked`, `needs-review`, and `pass`. Blocked meant the student could not run the exercise. Needs-review meant it ran but produced the wrong shape or a weak result. Pass meant it met the stated artifact requirements. The live session reviewed two or three submissions, not all of them. The rest received written feedback.

The preflight script below became mandatory before lesson 1. It catches the most common setup failures before they consume live time.

```bash
#!/usr/bin/env bash
set -euo pipefail

command -v python3 >/dev/null || { echo 'python3 missing'; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3,10), sys.version' || { echo 'python3 too old'; exit 1; }
command -v curl >/dev/null || { echo 'curl missing'; exit 1; }

test -n '${OPENAI_API_KEY:-}' || { echo 'OPENAI_API_KEY not set'; exit 1; }
echo 'preflight ok'
```

The lesson template kept exercise scope fixed. I wrote it in YAML so each lesson could be reviewed before it went live.

```yaml
lesson:
  id: u2-l03
  title_zh: 用結構化輸出整理客服郵件
  outcome: 學生能將一封客服郵件轉成固定欄位的 JSON
  demo: 先用 curl 呼叫模型，再切換到 Python SDK
  exercise:
    type: constrained-prompt
    artifact: output.json
    required_fields:
      - customer_name
      - issue_category
      - urgency
      - next_action
  review:
    rubric:
      - JSON 可被解析
      - 欄位沒有缺漏
      - urgency 有合理理由
```

The `curl` first approach was a revision. In the first version, students started with an SDK and a virtual environment. Too much failed before the model was called. Starting with `curl` separated network and key problems from code problems.

## Where students stalled

The stalls were consistent. Environment setup was the first wall: missing API keys, wrong Python version, shell differences, and package installation behind a proxy. The preflight script removed some of that, but not all. Students on Windows with PowerShell needed different commands, and I did not have a parallel script ready in the first session.

The second wall was language. Traditional-Chinese learners often read English documentation, then write prompts in Traditional Chinese. That is reasonable, but model output sometimes mixed Simplified Chinese, English keys, and Traditional Chinese values. The fix was not a better prompt alone. It was a schema. Once the exercise required a fixed JSON shape, students could see exactly where the model drifted. This is context engineering in practice, not prompt decoration. The site's guide on [context engineering](/blog/what-is-context-engineering/) covers the same principle: the surrounding structure matters as much as the instruction.

The third wall was evaluation. Beginners can tell when output feels wrong, but they cannot always say why. They needed a rubric. Without one, homework review turned into taste debates. With one, feedback became specific: the field is missing, the category is too broad, the next action is not actionable.

The fourth wall was transfer. Students could complete the lesson exercise but not apply it to their own work. The gap appeared when the exercise was too open. 'Build a workflow for your job' produced blank pages. 'Take this sample invoice and produce these five fields' produced submissions. In unit 4, I narrowed the final exercise to one workflow from a list of three.

I also saw a review bottleneck. Open-ended reflections created long feedback threads. I later required a structured reflection with three short answers, which made triage faster. For a related look at teaching non-technical learners, the [non-technical teaching notes](/blog/teaching-ai-to-non-technical-learners/) match what I saw: concrete artifacts beat abstract explanations.

## Revisions between sessions

I revised between sessions instead of waiting for the next cohort. The changes were small and testable.

First, I added the preflight script and a Windows PowerShell version. Second, I split the longest lesson into two shorter lessons without changing the unit count. The original lesson tried to cover API calls, JSON parsing, and error handling in one block. Students could follow the demo but could not reproduce it. The split let each lesson keep one artifact.

Third, I added a glossary table for terms that were being translated inconsistently: prompt, completion, token, context window, schema, and temperature. The glossary lived in the course repo, not in a slide. Students used it during exercises, which is the point.

Fourth, I changed the first API exercise from SDK-first to `curl`-first. This reduced setup noise. Fifth, I added a minimum viable submission rule: if the exercise does not run, submit the error message, the command, and the file that failed. That rule turned blocked students into reviewable cases instead of silent drop-offs.

Sixth, I added a homework triage script to check required files and basic JSON validity before human review. It did not judge quality. It only prevented obviously incomplete submissions from entering the queue.

## What to do next

If you are planning a small live cohort, these are the actions worth taking this week.

1. Run a 20-minute preflight session before lesson 1. Have students run the environment check and paste the output. Fix keys and versions before teaching.
2. Make every lesson produce one artifact. Reject exercises that end with 'discuss' or 'explore' unless the discussion produces a file.
3. Write a three-label triage rubric for homework: blocked, needs-review, pass. Use it to decide what gets live review and what gets written feedback.
4. Record a two-minute fix video for the common setup errors you see. Link it in the lesson template so students can self-serve.
5. Review your first exercise after the live session. If students stalled before the actual skill, move the setup earlier or replace the tool.

For a self-paced path, the Traditional-Chinese AI Course is a four-unit, seventeen-lesson Traditional-Chinese course priced at $69 USD one-time, taking a beginner from zero to applied AI workflows. It is not a replacement for live triage, but it holds the same artifact-first structure. If you want the broader automation context behind these exercises, the [ultimate AI automation guide](/blog/ultimate-ai-automation-guide-2026/) is the place to start.

## Get Traditional-Chinese AI Course

[**Traditional-Chinese AI Course**](https://slashmaster6.gumroad.com/l/vzalgb?utm_source=blog&utm_medium=article&utm_campaign=traditional-chinese-ai-course-cohort) — **$69**, one-time payment, instant download. See the full breakdown on the [review page](/blog/ai-course/).

## Related reading

- [The Ultimate Guide to AI Automation 2026](/blog/ultimate-ai-automation-guide-2026/)
- [How I Built a 10-Product Digital Business](/blog/ai-agents-digital-business-case-study/)
- [Building an AI Content Factory](/blog/build-ai-content-factory-technical-guide/)
