
I want to turn the _docs/system-audit.md document into a set of focused **Spec-and-Dev-Plan** documents.

The audit itself is strong, especially the current-system audit, gap analysis, and recommended product design. But the implementation plan is too high-level. I want more detailed, standalone planning documents that a developer or coding agent can use to actually build each section of work.

We will create one Spec-and-Dev-Plan document for each major implementation phase in the audit:

1. Must fix before uploading lots of source material
2. Should build before public/community launch
3. Can build after launch
4. Nice-to-have later

For this session create:

# **`phase-4-community-feedback-and-nice-to-have-spec-dev-plan.md`**

Focus only on the audit section titled:

**“Phase 4: Nice-to-have later.”**

And any information relveant to the work related to the section attached.

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

**Add community interaction and non-critical polish after the canonical graph, source safety, public launch readiness, and post-launch growth features are already stable.**

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

Do not invent unnecessary features. Do not overbuild. Stay focused on what the audit says belongs in Phase 4.

---

## Suggested Document Structure

Use this structure unless you find a better one:

1. Executive Summary
2. Current State Relevant to Phase 4
3. Phase 4 Goals
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

### Phase 4 Work Items to Cover

At minimum, cover the work items named in the audit’s Phase 4 section:

* Comment system
* Pre-moderated comments on entity, claim, and source pages
* Voting / feedback signals
* `content_votes` table
* Community score display separate from canonical confidence score
* Admin review prioritization using votes, flags, or other signals
* Entity relationship visualization on claim pages
* Claim-centered mini-graph or relationship visualization

If the audit contains related details elsewhere, pull them into the plan where useful.
---

## Output Requirements

Return the full contents of the new document:

**`phase-4-community-feedback-and-nice-to-have-spec-dev-plan.md`**

Do not implement anything yet. Just produce the planning document.

The final result should be focused, implementation-ready, and not cluttered with other info unless needed for context.
