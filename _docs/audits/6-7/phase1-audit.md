# Phase 1 Audit - Source Safety & Admin Control

**Date:** 2026-06-08  
**Branch:** source-safety-admin-ctrl  
**Spec:** `_docs/phases/phase-1-source-safety-and-admin-control-spec-dev-plan.md`  
**Audit purpose:** Validate the Phase 1 implementation, separate legitimate issues from noise, and provide an implementation guide for the remaining fixes.

---

## Executive Summary

The Phase 1 feature set is substantially implemented. The six requested admin capabilities exist:

- Source impact route: `/admin/sources/:id/impact`
- Source tier editing on source detail pages
- Confidence override inputs for entities and claims
- Disputed and archived status actions in admin managers
- Normalized URL uniqueness index plus form-level duplicate warning
- Relationship management route: `/admin/relationships`

The remaining issues are not missing whole features. They are correctness, durability, scale, and workflow problems around the implemented surfaces.

The highest-priority fixes are:

1. Source tier recomputation currently misses some affected entities and fans out edge-function calls incorrectly.
2. Manual relationship weights are overwritten by later confidence recomputations.
3. Archived relationships can still appear to admins on public graph/entity views because client queries do not explicitly filter active relationships.
4. Source impact actions can accidentally resurrect archived claims/entities.
5. Entity status changes zero confidence scores on `disputed` transitions and are not audit logged.

Do those first before ingesting large source batches.

---

## Validated Concerns

The original audit concerns were checked against the current code. These are legitimate and worth fixing:

- N separate confidence edge-function calls on source-tier recomputation.
- Entity confidence score being set to `0` when an entity is marked `disputed`.
- Relationship weight lacking a `<= 1.0` guard in both API and UI.
- URL duplicate check doing a full table scan instead of using the normalized URL index.
- Bulk source claim status actions making one RPC call per claim.
- Source impact page missing the requested status filter.
- Source impact rows linking to public pages instead of keeping admins in an admin workflow.
- Entity status changes missing `admin_audit_events`.
- Duplicate URL normalization helpers with different behavior.
- Claim status audit events only recording the new status.

The following original concern is acceptable as implemented:

- `src/lib/api/claims.ts` uses client-side sorting by `confidence_override ?? confidence_score` for entity-page claims. This is functionally correct for the current query shape. It does not need to be rewritten to database-level `COALESCE` ordering unless claim lists become large.

---

## Fix Guide

### P1-01 - Source Tier Recompute Misses Claim-Linked Entities

**Severity:** High  
**Area:** Source tier editability, confidence recomputation  
**Files:** `src/pages/admin/AdminSourceDetailPage.tsx`, `src/lib/api/admin.ts`

#### Context

Changing a source tier changes confidence scoring for every entity that depends on evidence from that source. That includes:

- Entities directly linked through `entity_source_anchors`.
- Entities linked to claims that have `claim_evidence` from the source.

The current source tier update path calls `getSourceImpact()` and then uses only:

```ts
impact.entities.map((entity) => entity.id)
```

That list comes from `entity_source_anchors`. It does not include entities that are only connected through source-backed claims.

#### Why It Matters

If a source contributes a claim about an existing entity, changing the source tier can leave that entity's `confidence_score` stale. The admin sees a successful tier update, but some affected ranking data remains based on the old tier.

#### Fix Approach

Add a source-impact affected-entity helper that returns the union of:

- `entity_source_anchors.entity_id` for the source's anchors.
- `claim_entities.entity_id` for claims reached through those anchors.

Recommended API shape:

```ts
export const getSourceAffectedEntityIds = async (sourceId: string): Promise<string[]>
```

Use this helper for:

- Source-tier recompute prompt counts.
- Source-tier recomputation.
- Any future source-level confidence repair operations.

Do not rely on display-only `entityNames` from claim rows. Return IDs explicitly.

#### Validation

- Create or find a source that contributes a claim to a pre-existing entity.
- Change the source tier.
- Confirm that entity ID is included in the recompute list.
- Confirm its confidence score changes after recomputation when the source tier changes from `primary` to `secondary` or the reverse.

---

### P1-02 - Source Tier Recompute Fans Out Edge-Function Calls

**Severity:** High  
**Area:** Source tier editability, edge-function load  
**File:** `src/pages/admin/AdminSourceDetailPage.tsx`

#### Context

Current code:

```ts
await Promise.all(entityIds.map((entityId) => triggerConfidenceComputation([entityId])))
```

`triggerConfidenceComputation()` already accepts an array of entity IDs and invokes the `compute-confidence` edge function once.

#### Why It Matters

For 50 affected entities this fires 50 simultaneous Supabase function invocations. For large sources this can hit concurrency limits, create slow UI behavior, or fail partially.

There is also a hard edge-function request limit:

```ts
const maxEntityIdsPerRequest = 200
```

So the correct fix is not simply "send every ID in one request" for all cases. It should batch into chunks of at most 200.

#### Fix Approach

Create a shared batching helper:

```ts
const recomputeConfidenceInBatches = async (entityIds: string[]) => {
  for (const batch of chunk(uniqueStrings(entityIds), 200)) {
    await triggerConfidenceComputation(batch)
  }
}
```

Use it in `AdminSourceDetailPage.tsx` and consider reusing it in admin API paths that can recompute large sets.

#### Validation

- Change a source with multiple affected entities.
- Confirm one edge-function call per batch, not one per entity.
- Confirm an input list over 200 IDs is split before invoking the edge function.

---

### P1-03 - Manual Relationship Weights Are Not Durable

**Severity:** High  
**Area:** Relationship management  
**Files:** `src/lib/api/admin.ts`, `supabase/functions/compute-confidence/index.ts`, new migration likely required

#### Context

The relationship manager lets admins edit `relationships.weight`. However, the confidence edge function recomputes relationship weights whenever endpoint entity confidence is recomputed:

```ts
await updateRelationshipWeights(supabase, scores)
```

That function fetches all relationships touching affected entities and writes a new weight derived from endpoint confidence scores.

#### Why It Matters

An admin can manually set a relationship weight, but that edit is overwritten by any later confidence recomputation for either endpoint entity. Phase 1 promised that admins could "re-weight" relationships. As implemented, the edit is temporary.

#### Fix Approach

Add an explicit manual override path. Recommended schema:

```sql
alter table public.relationships
  add column weight_override double precision
    check (weight_override is null or (weight_override >= 0 and weight_override <= 1));
```

Then choose one of these approaches:

- Keep `weight` as the computed value and use `coalesce(weight_override, weight)` everywhere relationships are displayed or graphed.
- Or add `weight_is_manual boolean not null default false` and skip those rows in `updateRelationshipWeights()`.

The first option is clearer because it preserves both the computed value and the admin override.

Update `updateRelationshipWeight()` to write `weight_override`, not the computed `weight`, or rename the API to `updateRelationshipWeightOverride()`.

Update public graph and relationship queries to expose the effective weight:

```ts
relationship.weight_override ?? relationship.weight
```

#### Validation

- Set a relationship override to `0.10`.
- Trigger confidence recomputation for one endpoint entity.
- Confirm the admin-visible effective relationship weight remains `0.10`.
- Clear the override.
- Confirm the relationship returns to computed weighting.

---

### P1-04 - Public Relationship Queries Need Explicit Active Filtering

**Severity:** High  
**Area:** Relationship archive behavior, public graph correctness  
**Files:** `src/lib/api/relationships.ts`, `src/lib/api/entities.ts`, possibly graph tests

#### Context

The migration added `relationships.status` and updated the public RLS policy to expose only active relationships to public users. But the client query functions do not filter status:

```ts
supabase.from('relationships').select('*').order('created_at')
```

and:

```ts
supabase
  .from('relationships')
  .select('*')
  .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`)
```

Admins have an admin policy for all relationship rows. That means an admin viewing the normal public graph or entity page can still see archived relationships.

#### Why It Matters

Archive should mean "not visible in the public graph." Relying only on RLS makes behavior dependent on who is logged in. Admins testing the public graph can see a different graph than normal users.

#### Fix Approach

Add explicit filters to public query helpers:

```ts
.eq('status', 'active')
```

Update at least:

- `getAllPublishedRelationships()`
- `getRelationshipsForEntity()`
- `getEntityNeighborhood()`

Also update `compute-confidence` relationship fetches to skip archived relationships unless there is a reason to recompute archived rows.

#### Validation

- Archive a relationship as admin.
- While still logged in as admin, open the public graph.
- Confirm the archived edge is absent.
- Restore it and confirm it returns.

---

### P1-05 - Relationship Weight Allows Values Above 1.0

**Severity:** Medium  
**Area:** Relationship management validation  
**Files:** `src/lib/api/admin.ts`, `src/pages/admin/AdminRelationshipManagerPage.tsx`

#### Context

The API checks only that relationship weight is non-negative:

```ts
requireNonNegativeNumber(weight, 'Relationship weight')
```

The UI input has `min={0}` and `step={0.01}`, but no `max={1}`.

#### Why It Matters

The spec defines relationship weight as `0.0` to `1.0`. Values such as `5` or `100` can be saved and may distort graph rendering or ranking logic.

#### Fix Approach

Use the existing bounded validator:

```ts
requireBoundedNumber(weight, 'Relationship weight', 0, 1)
```

Add UI constraints:

```tsx
min={0}
max={1}
step={0.01}
```

If P1-03 adds `weight_override`, apply the bound to the override column and API instead.

#### Validation

- Try to save `1.01` and `-0.01`; both should be rejected.
- Try to save `0`, `0.5`, and `1`; all should work.

---

### P1-06 - Impact Page Can Resurrect Archived Claims and Entities

**Severity:** High  
**Area:** Source impact view, status lifecycle  
**Files:** `src/pages/admin/AdminSourceImpactPage.tsx`, `src/lib/api/admin.ts`

#### Context

`getSourceImpact()` fetches all linked claims and entities without excluding archived rows. The impact page action logic treats every non-published row as publishable:

```ts
const nextStatus: ContentStatus = isPublished ? 'draft' : 'published'
```

Bulk claim actions also fetch all source-linked claims and set them to `draft` or `disputed`, regardless of current status.

#### Why It Matters

Archived content can be accidentally restored through the impact page:

- Archived entity row gets a `Publish` button.
- Archived claim row gets `Publish` and `Mark disputed`.
- Bulk "Unpublish all" can turn archived claims into drafts.
- Bulk "Mark all disputed" can turn archived claims into disputed claims.

This conflicts with manager behavior, where archived rows are excluded, and with the spec's impact filter set of `All / Published / Draft / Disputed`.

#### Fix Approach

Use one of these approaches:

1. Exclude archived content from `getSourceImpact()` by default.
2. Include archived content in a separate read-only section with no publish/dispute/draft controls.

For the MVP, prefer option 1 because the spec did not request archived as an impact filter.

For bulk operations, filter claim IDs to active editorial statuses:

```ts
status in ('published', 'draft', 'disputed')
```

or more narrowly:

- Unpublish all: only `published` and maybe `disputed`, depending on desired workflow.
- Mark all disputed: only `published` and `draft`.
- Never update `archived` through these bulk actions.

#### Validation

- Archive a claim linked to a source.
- Open that source's impact page.
- Confirm the archived claim is not actionable.
- Run bulk actions and confirm the archived claim remains archived.

---

### P1-07 - Entity Disputed Status Zeroes Confidence Score

**Severity:** Medium  
**Area:** Disputed status workflow  
**File:** `src/lib/api/admin.ts`

#### Context

Current code:

```ts
const updateValues = status === 'published' ? { status } : { confidence_score: 0, status }
```

Any non-published entity status transition sets `confidence_score` to `0`, including `disputed` and `archived`.

#### Why It Matters

`disputed` is not the same as `draft`. It means contested, not scoreless. A disputed entity can show `0.00` in admin views even though it previously had evidence. If it then moves from disputed to draft, the zero score persists until the entity is republished and recomputed.

Claims do not have this issue because `update_claim_status()` updates only status and timestamp.

#### Fix Approach

Preserve score for disputed transitions:

```ts
const updateValues = status === 'draft' ? { confidence_score: 0, status } : { status }
```

Decide whether archived should preserve score for audit/history purposes. Recommendation: preserve score for `archived` too unless there is a strong reason to erase it.

#### Validation

- Publish an entity with a nonzero score.
- Mark it disputed.
- Confirm the score remains unchanged.
- Move it to draft.
- Confirm only draft zeroing happens if that remains the intended behavior.

---

### P1-08 - Entity Status Changes Are Not Audit Logged

**Severity:** Medium  
**Area:** Admin audit trail  
**File:** `src/lib/api/admin.ts`

#### Context

`updateAdminEntityStatus()` updates entity status but does not insert an `admin_audit_events` row.

Claims get audit entries through `update_claim_status()`. Source tier, confidence overrides, and relationship changes also log audit events.

#### Why It Matters

Entity publish, draft, dispute, and archive actions are editorially significant. They should be traceable like claim status changes.

#### Fix Approach

Fetch current entity status before update and log:

```json
{
  "old_status": "published",
  "new_status": "disputed"
}
```

Use:

- `action = 'update_entity_status'`
- `target_table = 'entities'`
- `target_id = entityId`

#### Validation

- Mark an entity disputed.
- Confirm one audit row is inserted with old and new status.
- Confirm bulk or manager workflows do not double-log the same single status update.

---

### P1-09 - Claim Status Audit Events Need Old Status

**Severity:** Low  
**Area:** Admin audit trail  
**File:** `supabase/migrations/20260608030000_fix_claim_status_transitions.sql`

#### Context

The SQL function logs:

```sql
jsonb_build_object('status', next_status)
```

It does not capture the previous status.

#### Why It Matters

For audit review, "status is disputed" is less useful than "published -> disputed".

#### Fix Approach

Update the function to select the current status before the update and log:

```json
{
  "old_status": "published",
  "new_status": "disputed"
}
```

Preserve the returned affected entity IDs.

#### Validation

- Change a claim from published to disputed.
- Confirm the audit row contains both status values.

---

### P1-10 - Bulk Source Claim Status Updates Are N RPC Calls

**Severity:** Medium  
**Area:** Source impact bulk actions, scale  
**File:** `src/lib/api/admin.ts`, new migration recommended

#### Context

Bulk source actions call `update_claim_status` once per claim:

```ts
const affectedEntityIdGroups = await Promise.all(
  claimIds.map((claimId) => setAdminClaimStatus(claimId, status))
)
```

Then they invoke confidence recomputation once with all affected entity IDs.

#### Why It Matters

For large sources this creates many concurrent RPC calls. It also risks partial status updates if some calls fail. The subsequent recompute can also exceed the edge function's 200-ID request limit.

#### Fix Approach

Add a SQL function:

```sql
bulk_update_claim_status(claim_ids uuid[], next_status content_status)
returns uuid[]
```

The function should:

- Require admin access.
- Ignore archived claims unless an explicit restore flow is added.
- Update all eligible claims in one statement.
- Log one bulk audit row with claim IDs and status transition metadata.
- Return distinct affected entity IDs.

Then use the confidence batching helper from P1-02.

#### Validation

- Run bulk unpublish for a source with multiple claims.
- Confirm a single RPC call updates all eligible claims.
- Confirm affected entity confidence recomputes in batches.
- Confirm archived claims are unchanged.

---

### P1-11 - URL Duplicate Check Does a Full Table Scan

**Severity:** Medium  
**Area:** URL deduplication, source creation performance  
**Files:** `src/lib/api/admin.ts`, new migration or RPC recommended

#### Context

The database has a normalized unique index:

```sql
lower(regexp_replace(url, '/$', ''))
```

But `adminSourceUrlExists()` fetches every source URL in pages of 1,000 and normalizes in JavaScript until it finds a match.

#### Why It Matters

This is acceptable for a tiny source library, but it gets slower as the library grows. It also ignores the index created specifically for this lookup.

#### Fix Approach

Add an RPC that performs the same normalized lookup in Postgres:

```sql
create or replace function public.find_source_by_normalized_url(input_url text)
returns table (id uuid, title text, url text)
language sql
stable
security invoker
set search_path = public
as $$
  select sources.id, sources.title, sources.url
  from public.sources
  where sources.url is not null
    and lower(regexp_replace(sources.url, '/$', '')) =
        lower(regexp_replace(trim(input_url), '/$', ''))
  limit 1;
$$;
```

Then replace the paged scan with one RPC call.

#### Validation

- Duplicate URL warning still appears on blur.
- Lookup remains fast with many sources.
- The submit-time unique constraint remains the hard stop.

---

### P1-12 - URL Normalization Is Split Across Two Helpers

**Severity:** Low  
**Area:** URL deduplication maintainability  
**Files:** `src/lib/sourceUpload.ts`, `src/lib/api/admin.ts`

#### Context

There are two `normalizeSourceUrl()` functions:

- `src/lib/sourceUpload.ts`: uses `new URL(value)`, validates protocol, returns `url.toString()`.
- `src/lib/api/admin.ts`: trims, lowercases, strips one trailing slash, no protocol validation.

#### Why It Matters

The behavior currently works because both input and stored URLs are normalized in the duplicate scan. But future changes can easily make form validation, duplicate lookup, and database uniqueness disagree.

#### Fix Approach

Create one shared URL utility with two explicit operations:

```ts
parseAndNormalizeSourceUrlForStorage(value: string): string
normalizeSourceUrlForDedup(value: string): string
```

The storage normalizer should validate `http` and `https`. The dedup normalizer should match the database index expression exactly.

Use that shared utility from source upload and admin duplicate lookup.

#### Validation

- `https://example.com/path` remains valid.
- `ftp://example.com` is rejected.
- `https://example.com/path` and `https://example.com/path/` collide for dedup.
- Behavior matches the database RPC or index expression.

---

### P1-13 - Source Impact Page Missing Status Filter

**Severity:** Medium  
**Area:** Source impact view usability  
**File:** `src/pages/admin/AdminSourceImpactPage.tsx`

#### Context

The spec requires a status filter:

```text
All / Published / Draft / Disputed
```

The page currently renders all loaded entities and claims in flat tables.

#### Why It Matters

For a source with many downstream items, admins cannot quickly isolate published content to unpublish, disputed content to review, or draft content to ignore.

#### Fix Approach

Add local filter state:

```ts
const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'disputed'>('all')
```

Filter both arrays client-side after loading. Exclude archived from this filter set unless P1-06 chooses to add a read-only archived section.

Update counts to show filtered counts while preserving total context if useful.

#### Validation

- All filter shows all non-archived impact rows.
- Published filter shows only published rows.
- Draft filter shows only draft rows.
- Disputed filter shows only disputed rows.

---

### P1-14 - Source Impact Links Leave Admin Context

**Severity:** Low  
**Area:** Source impact workflow  
**File:** `src/pages/admin/AdminSourceImpactPage.tsx`

#### Context

Impact rows link to public pages:

- Entity rows: `/entity/${entity.slug}`
- Claim rows: `/claim/${claim.id}`

The spec says rows should link to existing detail or manager pages. There are no dedicated admin detail pages for individual claims/entities, so the best current target is the relevant manager with search or status context.

#### Why It Matters

Admins triaging a source are taken out of the admin workflow and must navigate back manually.

#### Fix Approach

Either:

- Link to manager pages with search query params, e.g. `/admin/entities?search=Name`.
- Add dedicated admin detail routes later.

The manager pages may need to read query params for this to be useful.

#### Validation

- Clicking an entity impact row keeps the admin in `/admin`.
- The target view makes the clicked row easy to find.

---

### P1-15 - Source Impact Scores Ignore Confidence Overrides

**Severity:** Low  
**Area:** Confidence override display consistency  
**File:** `src/pages/admin/AdminSourceImpactPage.tsx`

#### Context

The impact page displays:

```ts
entity.confidence_score.toFixed(2)
claim.confidence_score.toFixed(2)
```

It does not show `confidence_override` or the effective score.

#### Why It Matters

After Phase 1, admins can override confidence. The impact page can show stale-looking scores that disagree with entity pages, claim pages, and manager rows.

#### Fix Approach

Display effective confidence:

```ts
const effectiveScore = row.confidence_override ?? row.confidence_score
```

If an override exists, show both values in the same style used by `ConfidenceOverrideInput`, for example:

```text
0.90 override, auto 0.42
```

#### Validation

- Set an override on a claim.
- Open source impact for the source backing that claim.
- Confirm the impact page shows the override clearly.

---

### P1-16 - Source Detail Claim Ranking Ignores Confidence Overrides

**Severity:** Medium  
**Area:** Confidence override ranking consistency  
**File:** `src/lib/api/sources.ts`

#### Context

`getSourceExtractedContent()` fetches claims for a source and orders them by raw score:

```ts
.order('confidence_score', { ascending: false })
```

Entity-page claims already sort by `confidence_override ?? confidence_score`.

#### Why It Matters

The same claim can rank differently depending on whether it is viewed from an entity page or a source detail page. That weakens the promise that confidence overrides control ranking.

#### Fix Approach

Fetch claims without raw confidence ordering and sort client-side by effective confidence, mirroring `src/lib/api/claims.ts`:

```ts
const getEffectiveClaimConfidence = (claim: Tables<'claims'>) =>
  claim.confidence_override ?? claim.confidence_score
```

For larger source claim lists, move this to an RPC with `order by coalesce(confidence_override, confidence_score) desc`.

#### Validation

- Set a low-computed-score claim override to `1.0`.
- Open the source detail page.
- Confirm it sorts above non-overridden lower effective scores.

---

### P1-17 - Phase 1 Lacks Focused Automated Coverage

**Severity:** Medium  
**Area:** Regression protection  
**Files:** `src/__tests__`, Supabase integration tests where practical

#### Context

Existing tests cover general API and graph behavior, but there are no focused tests for most Phase 1 controls:

- Source impact filtering/actions.
- Source tier affected entity computation.
- Relationship archive visibility under admin sessions.
- Relationship weight bounds and manual override durability.
- URL duplicate lookup behavior.
- Entity disputed status score preservation.

#### Why It Matters

Most remaining issues are regressions that can reappear easily during later phases. The Phase 1 features are admin safety controls, so they need basic coverage before large ingestion.

#### Fix Approach

Add focused tests around pure helpers and API query builders where mocking is practical. Add local Supabase integration tests for RLS/status behavior where mocks would hide the issue.

Recommended coverage:

- Unit test URL dedup normalizer.
- Unit test confidence recompute batching helper.
- Unit test impact-page filtering.
- Integration test archived relationship hidden from public relationship APIs while admin is logged in.
- Integration test bulk source status does not update archived claims.
- Integration test entity disputed transition preserves confidence score and logs audit event.

#### Validation

- `npm test` passes.
- `npm run typecheck` passes.
- Local Supabase integration tests pass when `VITE_SUPABASE_INTEGRATION_TESTS=true`.

---

## Battle Plan

### Step 1 - Fix Relationship Visibility and Weight Safety

1. Add explicit `.eq('status', 'active')` filters to public relationship APIs.
2. Update `getEntityNeighborhood()` to filter active relationships before graph assembly.
3. Update `compute-confidence` to skip archived relationships when recomputing weights.
4. Add relationship weight upper-bound validation in API and UI.
5. Run graph/API tests and manually archive/restore one relationship while logged in as admin.

### Step 2 - Make Relationship Weight Edits Durable

1. Add a migration for `relationships.weight_override` or `weight_is_manual`.
2. Update generated database types.
3. Change relationship manager saves to write the override/manual field.
4. Change graph and admin display code to use effective weight.
5. Change confidence recomputation so it does not overwrite manual effective weights.
6. Test manual weight edit -> confidence recompute -> weight remains overridden.

### Step 3 - Repair Source Tier Recompute

1. Add `getSourceAffectedEntityIds(sourceId)` with entity-source and claim-entity union logic.
2. Use it after `updateSourceTier()`.
3. Replace per-entity edge-function fanout with a shared 200-ID batching helper.
4. Reuse the batching helper anywhere a source or bulk claim operation can recompute many entities.
5. Test a source that affects existing entities only through claims.

### Step 4 - Lock Down Archived Content Lifecycles

1. Exclude archived rows from source impact actions.
2. Prevent impact row buttons from publishing/disputing archived entities or claims.
3. Update bulk source claim operations to ignore archived claims.
4. Decide whether archived rows should be hidden entirely or displayed read-only.
5. Test that archived claims/entities remain archived after all source impact bulk actions.

### Step 5 - Fix Entity Status Semantics and Auditing

1. Update `updateAdminEntityStatus()` so disputed does not zero `confidence_score`.
2. Decide whether draft should still zero score. Preserve archived scores unless intentionally clearing them.
3. Add entity status audit events with old and new status.
4. Update `update_claim_status()` audit details to include old and new status.
5. Test entity and claim status transitions plus audit rows.

### Step 6 - Improve URL Deduplication

1. Add `find_source_by_normalized_url(input_url text)` RPC matching the unique index expression.
2. Replace the JavaScript full table scan with one RPC call.
3. Consolidate URL normalization helpers into a shared utility.
4. Test duplicate URL warning and submit-time constraint handling.

### Step 7 - Complete Source Impact UX

1. Add status filter tabs for all, published, draft, and disputed.
2. Update counts and empty states for filtered results.
3. Link rows to admin manager workflows instead of public pages.
4. Show effective confidence scores with override indicators.
5. Manually test impact triage on a source with published, draft, disputed, and archived downstream content.

### Step 8 - Normalize Confidence Override Ranking

1. Update source detail claim ordering to use `confidence_override ?? confidence_score`.
2. Confirm entity pages, source pages, search, graph, and exports use effective score consistently where a score is displayed or used for ordering.
3. Add regression tests for effective confidence sorting.

### Step 9 - Add Regression Tests

1. Add focused unit tests for helpers and filtering.
2. Add local Supabase integration tests for status/RLS behavior.
3. Run `npm test`.
4. Run `npm run typecheck`.
5. Run `npm run build` as the final check.

---

## Final Recommendation

Do not treat Phase 1 as ingestion-ready until Steps 1 through 5 are complete. Those steps address the real safety issues: stale confidence after tier changes, archived content leaking or being resurrected, relationship archive visibility, relationship override durability, and missing audit trails.

Steps 6 through 9 are still worth doing before large-scale ingestion, but they are less likely to corrupt editorial state immediately.
