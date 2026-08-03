---
title: "Feishu (Lark) Templates for Team Efficiency — A Complete Playbook"
description: "How to turn Feishu (Lark) into your team's operating system: documentation structure, project trackers, meeting workflows, approval flows, and the template library we built."
date: 2026-08-03
slug: feishu-templates-team-efficiency-guide
tags: [templates, feishu, productivity, teams, project-management, notion]
---

# Feishu (Lark) Templates for Team Efficiency — A Complete Playbook

## Why Tooling Isn't the Problem — Structure Is

Every team has the tools. What most teams lack is a structure that makes the right information easy to find, easy to update, and impossible to lose. Feishu (known as Lark internationally) is unusually good at this because it combines docs, spreadsheets, project management, chat, and approvals in one system — but only if you build the templates. Without templates, a collaborative tool just means everyone formats things differently.

This playbook is the structure we use: how to organize documentation, run projects, run meetings that produce decisions, and automate the approvals that otherwise live in chat threads.

## Chapter 1: The Documentation Architecture

The number-one structural decision is where things live. We use a three-layer model:

1. **Wiki (Feishu Docs space)** — permanent knowledge: policies, guides, onboarding, architecture decisions.
2. **Working space** — in-progress artifacts: meeting notes, drafts, project scratchpads.
3. **Databases (Base)** — structured, queryable information: tasks, projects, clients, inventory.

The rule that keeps it healthy: **documents graduate from working space to wiki**, and anything that needs filtering or sorting lives in Base, not in a doc.

### The Template Set

| Template | Purpose | Location |
|----------|---------|----------|
| Team Wiki Index | The home page linking every permanent doc | Wiki |
| Project One-Pager | Goals, scope, owner, status, next milestone | Wiki (per project) |
| Meeting Notes | Agenda → decisions → action items | Working space |
| Task Board | What's being done, by whom, until when | Base |

The Wiki Index is the most important doc in the company: a single page with a link to every other permanent doc, organized by function. If someone cannot find something in two clicks from the index, the structure failed, not the person.

## Chapter 2: Project Management in Base

Feishu Base (their database product) replaces the spreadsheet-that-became-a-project-manager. The project tracker template:

```
Fields: Task | Owner | Status (To do/In progress/Blocked/Done)
        | Priority | Due date | Project | Linked docs
Views:  By project (kanban) | By owner | By due date (this week) | Overdue
```

Three views are enough: **kanban by status** (what's moving), **by owner** (who is overloaded), and **overdue/due-soon** (what needs attention today). Everything else is a filter you can add later.

### Automation That Pays for Itself

- Status change → notify the project owner
- Due date approaching (48h) → remind the assignee
- Blocked status → notify the manager
- Task completed → auto-log to the weekly report view

These three automations replace most status-meeting agendas — the meeting becomes "review the exceptions" instead of "everyone reports."

## Chapter 3: Meetings That Produce Decisions

Most meetings fail before they start because the agenda is in someone's head. The meeting notes template enforces the four sections that matter:

1. **Agenda** — written before the meeting; the meeting follows it.
2. **Decisions** — the resolutions, stated as facts, with the owner.
3. **Action items** — owner + deadline, synced to the task board.
4. **Open questions** — parked here so they are not lost, with a follow-up date.

The discipline: notes are taken during the meeting (not after), decisions are read back before the meeting ends, and action items are moved to Base the same day. Feishu's docs have native meeting integrations — start the notes from the calendar event so the attendees and link are already there.

## Chapter 4: Approvals and Workflows

The approvals that used to live in chat — expense requests, leave, content sign-off, publishing — belong in Feishu's approval flows. The template design rules:

- **One flow per decision type** — not a generic "approval" flow with free-text purpose.
- **Explicit fields** — amount, reason, deadline, attachment; the approver should never have to ask what they are approving.
- **Escalation** — if no response in 48 hours, escalate automatically. Silent approvals are the #1 workflow killer.

### Content Approval Example

```
Content sign-off: Title | Channel | Draft link | Publish date
Flow: Editor → Marketing lead → Publish (auto-tagged in the calendar)
```

This turns "who approved this?" into a searchable audit trail instead of a chat scroll.

## Chapter 5: Building Your Template Library

Templates only compound if they are shared. The system:

1. **Create** — build the template once, in the team space, with fields documented.
2. **Publish** — set it as the space template so "new doc" starts from structure, not blank.
3. **Iterate** — after a month, review which fields were actually used; delete the rest.
4. **Onboard** — new members learn the structure from the Wiki Index, not from tribal knowledge.

This is exactly the approach behind the [Feishu Template Marketplace](/blog/feishu-templates/): a tested library of docs, Base tables, and workflows — wiki structures, project trackers, meeting systems, and approval flows — so a team starts with a working operating system instead of an empty workspace. It is the same playbook a Notion team would follow, applied to Feishu's native tools.

## Remote and Hybrid Team Routines

Structure matters most exactly when the team is not in the same room. For remote and hybrid teams, the templates get two additions:

1. **Async status channel** — a Base view or doc where every owner posts a daily one-liner (done / blocked / next). It replaces the "what are you working on" check-in and gives the weekly report its raw material for free.
2. **Decision log** — a permanent doc recording every significant decision: what was decided, why, by whom, when. Remote teams lose decisions to chat scroll; a decision log makes them searchable and prevents the same debate from re-running every quarter.
3. **Handover template** — owner, context, current state, next steps, and open questions. Used whenever work changes hands (PTO, project transfer), it converts tribal knowledge into a document.

The remote-specific rule: **anything that was said in a meeting must also exist as a document or a database row.** Chat is for conversation, not memory. Teams that follow this rule can absorb a teammate's two-week absence without losing a week of context — which is the real test of whether your structure works.

## Migrating From Notion or Google Docs

Most teams adopting Feishu are migrating from Notion or Google Docs, and most migrations fail by trying to move everything. The successful sequence:

1. **Move the wiki, not the archives** — migrate the pages people actually open weekly. Historical archives stay where they are, linked from the index.
2. **Recreate structure in Base, don't import tables** — a Notion database import lands as a pile of rows; rebuilding the views (kanban, by owner, due-soon) in Base is what makes the data usable.
3. **Run both systems for two weeks** — the migration window is a feature, not a bug: it lets the team discover which Feishu workflows are better before the old system is shut off.
4. **Cut over on a date, not a feeling** — a firm deadline is what forces the muscle memory. The [Feishu Template Marketplace](/blog/feishu-templates/) exists precisely because this sequence is painful to invent from scratch; the templates remove the "what should the structure even look like" phase of the migration.

### The Weekly Team Rhythm

Templates work on a cadence. The default team rhythm that keeps every template alive:

| Day | Routine | Template used |
|-----|---------|---------------|
| Monday | Plan the week: priorities, owners, deadlines | Project one-pager + task board |
| Wednesday | Midweek check: blockers surfaced, not buried | Async status channel |
| Friday | Wrap: decisions logged, docs graduated to wiki | Meeting notes + decision log |

The pattern to notice: each routine is short (15–30 minutes), uses a template that already exists, and produces a permanent artifact. Nothing in the rhythm requires remembering to format anything — the template does the formatting, and the artifact does the memory. Teams that run this rhythm for a month find that their Monday planning meeting shrinks to a review of exceptions, because the structure has already done the reporting.

## Chapter 6: The Anti-Patterns

- **The mirror** — duplicating the same information in docs, Base, and chat. One source of truth per fact; everything else links to it.
- **Template hoarding** — twenty templates nobody uses is worse than three that are enforced.
- **Permission sprawl** — structure without access control is noise. Review who can edit what quarterly.
- **The orphan wiki** — a wiki nobody updates becomes a liability. The Wiki Index review is a standing agenda item.

## Conclusion

Feishu becomes a team operating system when structure precedes usage: a three-layer documentation model, Base-driven project tracking with a few high-value automations, meetings that end with decisions and action items, and approval flows with explicit fields and escalation.

Build the four core templates — Wiki Index, project one-pager, meeting notes, task board — publish them as space templates, and enforce them for a month. Structure is the productivity feature.

**Related:**
- [Feishu Template Marketplace](/blog/feishu-templates/) — The ready-made template library
- [AI Prompt Engineering for Productivity](/blog/ai-prompt-engineering-productivity-guide/) — Prompt templates for team workflows
- [AI Productivity Toolkit](/blog/ai-productivity-toolkit-guide/) — Prompts plus workflow templates
- [Productivity Topic Hub](/categories/productivity/) — All productivity guides & tools
