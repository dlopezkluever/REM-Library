
I want to turn the _docs/system-audit.md document into a set of focused **Spec-and-Dev-Plan** documents.

The audit itself is strong, especially the current-sys tem audit, gap analysis, and recommended product design. But the implementation plan is too high-level. I want more detailed, standalone planning documents that a developer or coding agent can use to actually build each section of work.

We will eventually create one Spec-and-Dev-Plan document for each major implementation phase in the audit:

1. Must fix before uploading lots of source material
2. Should build before public/community launch
3. Can build after launch
4. Nice-to-have later

For now, create only the first one:

# `phase-1-source-safety-and-admin-control-spec-dev-plan.md`

Focus only on the audit section titled:

**“Phase 1: Must fix before uploading lots of source material.”**

Your job is to read the full audit and extract every relevant detail for this phase, including relevant current implementation details, gaps, desired behavior, risks, schema notes, UI notes, and implementation recommendations.

Do not just copy the audit. Turn it into a clean standalone document with two main parts:

---

## Part 1 — Product / Technical Spec

Explain:

* What this phase is meant to accomplish
* Why it needs to happen before uploading many sources
* What problems it solves
* What the desired end state is
* What features need to exist after this phase is complete
* What current files, components, database tables, migrations, functions, or API layers are relevant
* What should remain out of scope for this phase

The main theme is:

**Make the system safe for large-scale source ingestion by giving admins better source-impact visibility, rollback ability, confidence control, disputed-status control, URL deduplication, and relationship management.**

---

## Part 2 — Detailed Dev Plan

Create a step-by-step implementation plan.

For each major feature or change, include:

* Goal
* Current state
* Desired behavior
* Likely files/tables/functions affected
* Implementation steps
* Subtasks (detailed)
* Acceptance criteria
* Risks or edge cases

Use the audit as the source of truth, but make the plan more detailed and actionable than the audit’s original implementation plan.

Do not invent unnecessary features. Do not overbuild. Stay focused on what the audit says belongs in Phase 1.

---

## Suggested Document Structure

Use this structure unless you find a better one:

1. Executive Summary
2. Current State Relevant to Phase 1
3. Phase 1 Goals
4. Problems / Gaps Being Solved
5. Desired End State
6. Feature Specs
7. Database / Schema Plan
8. API / Service Layer Plan
9. UI / UX Plan
10. Step-by-Step Development Plan
11. Testing Plan
12. Acceptance Criteria
13. Risks and Mitigations
14. Out of Scope
15. Final Recommendation

---

## Phase 1 Work Items to Cover

At minimum, cover the work items named in the audit’s Phase 1 section:

* Source impact view
* Source tier editability
* Confidence override UI
* Disputed status workflow
* URL deduplication constraint
* Relationship management page

If the audit contains related details elsewhere, pull them into the plan where useful.

---

## Output Requirements

Return the full contents of the new document:

**`phase-1-source-safety-and-admin-control-spec-dev-plan.md`**

Do not implement anything yet. Just produce the planning document.

The final result should be focused, implementation-ready, and not cluttered with other info unless needed for context.
