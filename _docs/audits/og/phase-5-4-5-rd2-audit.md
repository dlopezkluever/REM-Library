# Phase 5 — Features 4 & 5: Round 2 Verification Audit

**Branch:** `admin-injester`  
**Date:** 2026-05-31  
**Scope:** Verification that all issues from the first-pass audit (`phase-5-4-5-audit.md`) were addressed. Includes a fresh regression check.

---

## Summary Table

| Issue ID | Title                                                            | Status              |
| -------- | ---------------------------------------------------------------- | ------------------- |
| P0-1     | Review actions are not atomic                                    | **Fixed**           |
| P0-2     | Entity source evidence not canonically represented               | **Fixed**           |
| P0-3     | Claim review can create permanently under-linked claims          | **Partially Fixed** |
| P0-4     | Publication semantics incomplete / draft-backed graph edges      | **Fixed**           |
| P1-1     | Entity creation slug/name race conditions                        | **Fixed**           |
| P1-2     | Admin review mutations lack server-side validation               | **Fixed**           |
| P1-3     | `compute-confidence` PostgREST injection via interpolated filter | **Fixed**           |
| P1-4     | Relationship weight uses only one endpoint score                 | **Fixed**           |
| P1-5     | Review queue fetches all pending JSON without pagination         | **Fixed**           |
| P1-6     | Entity manager fetches and renders all entities                  | **Fixed**           |
| P1-7     | Validation-failed extractions not actionable                     | **Fixed**           |
| P1-8     | Little targeted test coverage                                    | **Not Fixed**       |
| P2-1     | Rate limiting implemented twice                                  | **Fixed**           |
| P2-2     | Failed Claude batch raw response on first row only               | **Fixed**           |
| P2-3     | Max-token estimate uses unique word set                          | **Fixed**           |
| P2-4     | Highlighting fails for paraphrased evidence                      | **Not Fixed**       |
| P2-5     | Destructive review actions lack guardrails                       | **Fixed**           |
| P2-6     | Search LIKE metacharacter injection                              | **Fixed**           |
| P2-7     | Stage failure handling leaves source in previous stage           | **Fixed**           |
| NEW-1    | Split against published entity name fails ambiguously            | **New**             |
| NEW-4    | Bulk entity publish is non-atomic                                | **New**             |

---

## Detailed Findings

### P0-3 — Partially Fixed: Claim resolution blocks but no repair path

**What was fixed:** `review_extraction_item` now calls `find_review_entity_id` then falls back to `find_extraction_entity_input` before raising an error. Claims whose involved entities appear in the same extraction chunk can be confirmed without pre-reviewing those entities — the RPC auto-creates them as drafts. Multi-entity relationship pairs are now all created via a nested loop.

**Remaining gap:** There is no repair RPC for claims created before this fix that have missing `claim_entities` rows. The audit doc called for a reconciliation path — none was added. If any claims were ingested on an earlier version of this branch, they may have permanently incomplete `claim_entities` entries. This is a data migration concern, not a code correctness issue going forward.

**Severity:** Low (only affects pre-fix data, not new ingestion). Recommend adding a one-time repair migration before merging to main if the branch was used for any real ingestion sessions.

---

### P1-8 — Not Fixed: No targeted tests

No test files were found for:

- RPC transaction rollback behavior (`review_extraction_item`, `create_or_update_review_entity`)
- Confidence scoring edge cases (zero source anchors, single entity, disconnected graph)
- Review action validation (rejected names, invalid types, missing involved entities)
- Publication side effects (confidence recomputation trigger)

This remains the largest long-term risk. A regression in the RPC transaction logic or confidence scoring would be invisible until it produces bad data.

**Recommendation:** At minimum add pgTAP tests for the `review_extraction_item` RPC covering: happy path confirm, confirm with auto-entity-creation, duplicate entity name conflict, claim with unresolvable entity, split with published name conflict, rollback on mid-RPC failure.

---

### P2-4 — Not Fixed: Evidence highlighting is substring-only

`highlightPassage` in `ExtractionReviewPanel.tsx` (lines 120–142) uses `indexOf` on lowercased strings. If Claude paraphrased or shortened the evidence quote, the highlight returns nothing and the panel renders unhighlighted text. This is a UX-only limitation — no data correctness impact — but it makes evidence review harder when the extraction model paraphrases.

**Recommendation:** Fuzzy matching (e.g., longest common subsequence or a simple sliding window similarity check) would substantially improve reviewability for paraphrased evidence.

---

### NEW-1 — New: Split against a published entity name gives ambiguous error

**Location:** `create_or_update_review_entity` in `20260531130000_review_queue_hardening.sql`

When an admin splits an extraction into two entities, the RPC calls `create_or_update_review_entity` for both. If either entity name matches an existing published entity, the function raises:

```
Entity "%" already exists as published. Use Merge instead.
```

**Problems:**

1. The error does not indicate which of the two split entities caused the conflict.
2. The entire split fails atomically — no partial result, but the admin must re-enter both entity names.
3. The UI surfaces the raw RPC error with no contextual guidance.

**Recommendation:** Return a structured error payload (e.g., `{ field: 'entity_a' | 'entity_b', code: 'ENTITY_EXISTS_PUBLISHED' }`) so the UI can highlight the specific field that conflicted.

---

### NEW-4 — New: Bulk entity publish is still non-atomic

**Location:** `src/lib/api/admin.ts` — `publishAdminEntities` (lines 898–918)

```ts
await supabase.from('entities').update({ status: 'published' }).in('id', uniqueEntityIds)
// ^ step 1 — entities are now published
await triggerConfidenceComputation(supabaseAdmin, uniqueEntityIds)
// ^ step 2 — a failure here leaves published entities with stale confidence scores
```

If the confidence trigger fails (Edge Function unavailable, network timeout), entities are published but confidence scores are not recomputed. Unlike the review actions (which are now fully transactional via RPC), this path was not in scope for the fix plan.

**Severity:** Low — publishing is idempotent; a retry will recompute confidence correctly. But there is no retry mechanism in the UI, and the user sees no indication that confidence scores may be stale.

**Recommendation:** Wrap publish + confidence trigger in an RPC, or at minimum add a UI-level retry with a warning toast when the confidence trigger step fails.

---

### Minor Code Issue: `isObjectRecord` declared after first use

**Location:** `src/lib/api/admin.ts`

`isObjectRecord` is declared with `const` at line ~1190 but is referenced by `isReviewActionResult` (~line 1038) and `getAdminContentStats` (~line 1127) earlier in the file. In ES modules, `const` variables have a temporal dead zone — calling those functions during module initialization would throw. Since they are only called at runtime (after full module evaluation), this does not cause a live bug, but it is a code organization smell.

**Recommendation:** Move `isObjectRecord` above its first use, or convert to a `function` declaration which is hoisted.

---

### Stale UI Copy: Raw response fallback message

**Location:** `ExtractionReviewPanel.tsx`

The fallback text "Raw response is stored on another row in this failed batch or was not captured" is now inaccurate — the fix ensures every failed row in a batch stores the full raw response. The message should be updated to reflect the current behavior.

---

## Overall Verdict

**Conditionally Ready for Internal Use.**

All critical atomicity and data integrity issues from the first audit are closed. The review pipeline is transactional, entity evidence is canonically tracked, injection vectors are patched, claim and entity managers are implemented, and validation-failed extractions are actionable.

Remaining gaps before general availability:

| Gap                                             | Blocking?                                           |
| ----------------------------------------------- | --------------------------------------------------- |
| P0-3 partial — no repair RPC for pre-fix claims | Only if branch was used for real ingestion sessions |
| P1-8 — no focused tests                         | No, but a long-term risk                            |
| P2-4 — substring-only highlight                 | No (UX only)                                        |
| NEW-1 — ambiguous split error                   | No (usability only)                                 |
| NEW-4 — non-atomic bulk publish                 | No (idempotent, low frequency)                      |

Safe to merge for trusted internal admin use. Track the above in the backlog before promoting to production with external users.
