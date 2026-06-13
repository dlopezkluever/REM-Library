# Phase 1 Round 3 Audit — Source Safety & Admin Control

**Date:** 2026-06-13
**Branch:** source-safety-admin-ctrl
**Spec:** `_docs/phases/phase-1-source-safety-and-admin-control-spec-dev-plan.md`
**Prior audits:** `_docs/audits/phase1-audit.md`, `_docs/audits/phase-1-rd2-audit.md`
**Audit purpose:** Verify all rd2 fix-plan items were completed correctly and check for any remaining new issues before calling Phase 1 done.

---

## Executive Summary

All three rd2 findings have been addressed correctly. All six Phase 1 features are implemented, wired up end-to-end, and the test suite passes (112 tests, 4 skipped). The implementation is sound enough to call Phase 1 complete.

One minor UI correctness issue was found in the relationship manager's backing claims panel. It does not affect data integrity, audit trails, or any public-facing behavior, but it does undercut the visual purpose of that panel, so it is worth a one-line fix before calling Phase 1 completely done.

---

## rd2 Fix Verification

### P1-RD2-01 — Public Relationship APIs Leak Unsupported Relationships To Admin Sessions

**Status: Fixed.**

`src/lib/api/relationships.ts` exports `filterPublicRelationships()`, which:

1. Filters to `status === 'active'` relationships only.
2. Fetches all endpoint entity IDs and all backing claim IDs from those active relationships.
3. Queries `entities` for published endpoint status.
4. Queries `claims` for published backing claim status.
5. Keeps only relationships where both endpoint entities are published AND at least one backing claim is published.
6. Applies `weight_override ?? weight` before returning.

`getAllPublishedRelationships()`, `getRelationshipsForEntity()`, and `getEntityNeighborhood()` all pipe their raw DB results through `filterPublicRelationships()`. Admin sessions no longer see relationships that anonymous sessions cannot see.

---

### P1-RD2-02 — Source Bulk Claim Actions Ignore The Visible/Published Scope

**Status: Fixed.**

`unpublishSourceClaims(sourceId, claimIds)` and `markSourceClaimsDisputed(sourceId, claimIds)` both accept an explicit claim ID list. `AdminSourceImpactPage.tsx` computes:

```typescript
const unpublishClaimIds = claims.filter(c => c.status === 'published').map(c => c.id)
const disputeClaimIds  = claims.filter(c => c.status === 'published' || c.status === 'draft').map(c => c.id)
```

Where `claims` is already the status-filtered view (respects the current tab selection). The API-layer `updateSourceClaimsStatus()` then cross-checks that every passed claim ID actually belongs to the source before calling `bulk_update_claim_status`, so neither a UI bug nor a direct API call can affect out-of-scope claims.

---

### P1-RD2-03 — Entity Publish Can Succeed Without An Audit Event If Recompute Fails

**Status: Fixed.**

`updateAdminEntityStatus()` (`src/lib/api/admin.ts`) now inserts the `admin_audit_events` row immediately after the entity row update and before calling `recomputeConfidenceInBatches()`. A `compute-confidence` failure no longer leaves a status transition without an audit record. The ordering is asserted by the existing test in `admin.test.ts`.

---

## Full Phase 1 Feature Verification

| Feature | Route / UI | API | DB | Status |
|---|---|---|---|---|
| Source impact view | `/admin/sources/:id/impact` | `getSourceImpact`, `unpublishSourceClaims`, `markSourceClaimsDisputed` | Queries via `entity_source_anchors`, `claim_evidence` | ✅ |
| Source tier editability | Tier `<select>` on source detail page | `updateSourceTier` + `getSourceAffectedEntityIds` + recompute prompt | `sources.tier` UPDATE | ✅ |
| Confidence override UI | `ConfidenceOverrideInput` on entity and claim manager pages | `updateEntityConfidenceOverride`, `updateClaimConfidenceOverride` | `entities.confidence_override`, `claims.confidence_override` | ✅ |
| Disputed status workflow | "Mark disputed" + "Set draft" + "Archive" buttons on entity and claim managers | `updateAdminEntityStatus`, `updateAdminClaimStatus` | `update_claim_status()` RPC, entity direct update | ✅ |
| URL deduplication | Inline blur warning + submit-time error on `AdminSourceNewPage` | `adminSourceUrlExists` → `find_source_by_normalized_url()` RPC | `sources_url_normalized_unique` index | ✅ |
| Relationship management | `/admin/relationships`, sidebar nav entry | `getAdminRelationships`, `updateRelationshipWeight`, `archiveRelationship`, `restoreRelationship` | `relationships.status`, `weight_override`, `archived_at`, `archived_by` | ✅ |

Navigation: "Relationships" nav entry added to `AdminShell.tsx`. "View impact" link present on source detail page.

Test suite: 112 tests pass, 4 skipped, 0 failures.

---

## Findings

### P1-RD3-01 — Backing Claim Badge Color Is Always Green In Relationship Detail Panel

**Severity:** Low
**Area:** Relationship manager, UX correctness
**File:** `src/pages/admin/AdminRelationshipManagerPage.tsx:433`

#### Problem

The expandable backing claims panel uses `statusClassNames.active` (green/verdigris) for every claim badge, regardless of the claim's actual status:

```tsx
<Badge className={cn('mt-1', statusClassNames.active)}>
  {claim.status}
</Badge>
```

`statusClassNames` on this page is typed as `Record<RelationshipStatus, string>` with only `active` (green) and `archived` (terracotta). Backing claims have a `ContentStatus` — `draft`, `published`, `disputed`, or `archived` — but the badge always shows green. The text content is correct (it renders `claim.status`), so the status label is readable, but the color contradicts it for draft and disputed claims.

#### Why It Matters

The primary use of the backing claims panel is to determine whether a relationship is supported by published claims or only draft/disputed ones. If a relationship's only backing claim is `draft`, the green badge makes it visually indistinguishable from a `published` claim. An admin doing a quick visual scan cannot tell at a glance which relationships are weakly supported.

#### Fix

Define a claim-status color map inline (or import a shared one) and use it for the badge:

```tsx
const claimStatusClassNames: Record<ContentStatus, string> = {
  archived: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
  disputed: 'border-amber-300/70 bg-amber-50 text-amber-800',
  draft: 'border-iris/30 bg-iris-light text-iris-dark',
  published: 'border-verdigris bg-verdigris-light text-verdigris-dark',
}

// In the backing claims list:
<Badge className={cn('mt-1', claimStatusClassNames[claim.status])}>
  {claim.status}
</Badge>
```

These color values are consistent with the claim manager and entity manager pages.

---

## Final Recommendation

Phase 1 is functionally complete. All six spec goals are implemented, all three rd2 findings are fixed, and the test suite passes.

Fix P1-RD3-01 (one-line color map swap) before marking Phase 1 done. The fix is cosmetic but the panel's purpose is specifically to distinguish published from draft/disputed backing claims — the wrong badge color undermines that purpose even if the text label is correct.

After that fix, Phase 1 is ready to sign off.
