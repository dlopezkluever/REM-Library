# Phase 1 Round 2 Audit - Source Safety & Admin Control

**Date:** 2026-06-10  
**Branch/worktree:** local Phase 1 fix implementation  
**Spec:** `_docs/phases/phase-1-source-safety-and-admin-control-spec-dev-plan.md`  
**Prior audit:** `_docs/audits/phase1-audit.md`  
**Audit purpose:** Verify that the Phase 1 fix-plan items were actually addressed and identify any remaining bugs or cleanup required before calling Phase 1 complete.

---

## Executive Summary

Most high-risk Phase 1 audit findings were addressed well:

- Source tier recomputation now uses the union of directly anchored entities and claim-linked entities.
- Confidence recomputation is batched at 200 entity IDs per edge-function call.
- Relationship weight edits now persist as `weight_override` and public/admin display uses effective weight.
- Archived relationships are explicitly filtered from public relationship API helpers and confidence recomputation.
- Relationship weight validation is bounded to `0..1`.
- Source impact rows exclude archived claims/entities and show effective confidence.
- Entity disputed/archived transitions preserve existing confidence scores.
- Entity status changes and claim status changes now include old/new status audit details.
- URL duplicate lookup now uses a Postgres RPC matching the normalized unique index.
- Source impact status filters and admin-context links were added.
- Source detail claim ordering now uses effective confidence.

However, Phase 1 is not quite ready to sign off. Two correctness issues remain, plus one durability/audit ordering issue worth fixing before large ingestion.

The most important remaining issue is that public relationship helpers still rely on RLS for "published backing claim" filtering. Admin users bypass that RLS path, so an admin viewing the public graph can still see active relationships that no longer have any published backing claim. This is the same class of role-dependent public-view bug that the first audit identified for archived relationships.

---

## Findings

### P1-RD2-01 - Public Relationship APIs Still Leak Unsupported Relationships To Admin Sessions

**Severity:** High  
**Area:** Public graph correctness, relationship/archive safety  
**Files:** `src/lib/api/relationships.ts`, `src/lib/api/entities.ts`

#### Problem

The public relationship helpers now explicitly filter active relationships:

```ts
supabase.from('relationships').select('*').eq('status', 'active')
```

That fixes archived relationships, but it does not replicate the rest of the public RLS rule. Public RLS only exposes relationships when:

- the relationship is active,
- both endpoint entities are published,
- at least one backing claim is published.

Admins satisfy `has_internal_access()`, so the database policy can return active relationships regardless of backing claim publication state. The client helpers are named and used as public helpers, but they only apply the active-status part.

Affected code:

- `src/lib/api/relationships.ts:11-22`
- `src/lib/api/relationships.ts:25-37`
- `src/lib/api/entities.ts:93-97`
- `src/lib/api/entities.ts:118-122`

#### Why It Matters

After a source impact "Unpublish all claims" action, a relationship may remain `active` while all of its backing claims are now `draft` or `disputed`. Anonymous users are protected by RLS, but admins viewing the normal public graph can still see that unsupported edge because the client query does not explicitly require a published backing claim.

This makes admin QA unreliable: the admin public graph can differ from the actual public graph.

#### Recommended Fix

Do not rely on RLS for public-view semantics in client helpers. Use one of these approaches:

1. Add a `get_public_relationships()` RPC that returns only active relationships with published endpoints and at least one published backing claim, with `weight = coalesce(weight_override, weight)`.
2. Or update relationship helpers to fetch/filter backing claim statuses explicitly before returning rows.

Apply this consistently to:

- `getAllPublishedRelationships()`
- `getRelationshipsForEntity()`
- `getEntityNeighborhood()`

#### Validation

- Create or use an active relationship between two published entities.
- Set all backing claims to `draft` or `disputed`.
- While logged in as admin, open the public graph.
- Confirm the relationship is absent.
- Publish one backing claim.
- Confirm the relationship returns.

---

### P1-RD2-02 - Source Bulk Claim Actions Ignore The Visible/Published Scope

**Severity:** Medium  
**Area:** Source impact workflow, disputed status lifecycle  
**Files:** `src/lib/api/admin.ts`, `src/pages/admin/AdminSourceImpactPage.tsx`, `supabase/migrations/20260608040000_phase1_audit_fixes.sql`

#### Problem

The bulk source action fetches every claim linked to the source:

```ts
const claimIds = await getSourceClaimIds(sourceId)
```

Then `bulk_update_claim_status()` updates every non-archived claim whose status differs from the target status:

```sql
where claims.id = any(coalesce(claim_ids, '{}'::uuid[]))
  and claims.status <> 'archived'
  and claims.status <> next_status
```

The source impact page status filter is only visual. The bulk action bar uses `allClaims.length`, not the filtered claim list, and calls the source-level bulk action without passing a displayed/published claim scope.

Affected code:

- `src/lib/api/admin.ts:1432-1458`
- `src/pages/admin/AdminSourceImpactPage.tsx:124-128`
- `src/pages/admin/AdminSourceImpactPage.tsx:212-215`
- `src/pages/admin/AdminSourceImpactPage.tsx:296-309`
- `supabase/migrations/20260608040000_phase1_audit_fixes.sql:91-104`

#### Why It Matters

This can unintentionally clear editorial state:

- "Unpublish all" changes disputed claims back to `draft`.
- "Mark all disputed" changes draft claims to `disputed`.
- If an admin is on the Published/Draft/Disputed filter, the action still applies to all non-archived source claims, not just the visible rows.

The Phase 1 acceptance criteria describe bulk operations over published/displayed claims. The current behavior is broader than that and can surprise an admin triaging a mixed-status source.

#### Recommended Fix

Make the bulk action scope explicit.

Recommended API:

```ts
unpublishSourceClaims(sourceId, claimIds)
markSourceClaimsDisputed(sourceId, claimIds)
```

From the impact page, pass the visible/eligible claim IDs:

- Unpublish: `claims.filter(status === 'published')`
- Mark disputed: either only `published`, or `published + draft` if that is the chosen product behavior.
- Never include archived claims.

If the backend remains source-scoped, add an `eligible_statuses content_status[]` argument to `bulk_update_claim_status()` and enforce it in SQL.

#### Validation

- Source has one `published`, one `draft`, and one `disputed` claim.
- With the Published filter selected, "Unpublish all" changes only the published claim to `draft`.
- Existing disputed claims remain disputed.
- With the Draft filter selected, no hidden published/disputed rows are changed unless explicitly included by the selected action scope.

---

### P1-RD2-03 - Entity Publish Can Succeed Without An Audit Event If Recompute Fails

**Severity:** Low  
**Area:** Admin audit durability  
**File:** `src/lib/api/admin.ts`

#### Problem

`updateAdminEntityStatus()` updates the entity row, then recomputes confidence when publishing, then writes the audit event:

```ts
const { data, error } = await supabase.from('entities').update(updateValues)...

if (status === 'published') {
  await recomputeConfidenceInBatches([entityId])
}

await insertAdminAuditEvent('update_entity_status', ...)
```

Affected code:

- `src/lib/api/admin.ts:1219-1249`

#### Why It Matters

If the entity update succeeds but `compute-confidence` fails, the entity status has changed and the function throws before inserting `admin_audit_events`. That leaves an editorial status transition without the audit event Phase 1 intended to add.

Claim status transitions do not have this exact issue because the SQL RPC updates status and writes the audit event before client-side recomputation.

#### Recommended Fix

Insert the entity status audit event immediately after the entity update succeeds and before any recomputation. Alternatively, move entity status transitions into a SQL RPC that performs the row update and audit insert transactionally, then returns affected entity IDs for client-side recomputation.

#### Validation

- Mock or force `compute-confidence` failure during a publish transition.
- Confirm the entity status update has a corresponding `update_entity_status` audit row.
- Confirm normal publish still triggers confidence recomputation.

---

## Fix-Plan Checklist Review

### Completed To Satisfaction

- **P1-01 Source tier affected entity union:** Implemented via `getSourceAffectedEntityIds()`.
- **P1-02 Batched confidence recompute:** Implemented via `recomputeConfidenceInBatches()` with a 200-ID batch size.
- **P1-03 Durable relationship weights:** Implemented with `relationships.weight_override` and effective weight display.
- **P1-04 Archived relationship active filtering:** Implemented for active status. See P1-RD2-01 for the remaining published-backing-claim gap.
- **P1-05 Relationship weight bounds:** API and UI now enforce `0..1`.
- **P1-06 Archived source impact resurrection:** Archived claims/entities are excluded from source impact result sets, and bulk SQL ignores archived claims.
- **P1-07 Entity disputed score preservation:** Fixed. Only draft transitions zero `confidence_score`.
- **P1-08 Entity status audit logging:** Implemented, but see P1-RD2-03 for audit ordering.
- **P1-09 Claim status old/new audit details:** Implemented in the claim status RPC.
- **P1-10 Bulk source claim RPC:** Implemented. See P1-RD2-02 for scope behavior.
- **P1-11 URL duplicate lookup RPC:** Implemented via `find_source_by_normalized_url()`.
- **P1-12 Shared URL normalization helpers:** Implemented via `src/lib/sourceUrl.ts`.
- **P1-13 Source impact status filter:** Implemented.
- **P1-14 Source impact admin-context links:** Implemented with manager search query params.
- **P1-15 Source impact effective confidence display:** Implemented.
- **P1-16 Source detail effective confidence ordering:** Implemented.
- **P1-17 Focused automated coverage:** Some coverage was added and core checks pass, but the remaining findings need targeted regression tests.

---

## Verification Performed

The following checks passed:

```text
npm run typecheck
npm test
npm run build
npm run lint
```

Results:

- TypeScript typecheck passed.
- Vitest passed: 11 test files passed, 1 skipped; 110 tests passed, 4 skipped.
- Production build completed.
- ESLint completed with zero warnings.

---

## Final Recommendation

Do not call Phase 1 complete until P1-RD2-01 and P1-RD2-02 are fixed. P1-RD2-01 directly affects public graph QA under admin sessions, and P1-RD2-02 can unintentionally clear disputed status during source cleanup.

P1-RD2-03 is smaller, but it is cheap to fix and should be handled before signoff because Phase 1 explicitly adds auditability around editorial status changes.
