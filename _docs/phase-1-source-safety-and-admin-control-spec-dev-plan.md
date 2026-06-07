# Phase 1 — Source Safety & Admin Control
## Spec and Dev Plan

**Document type:** Implementation planning document  
**Scope:** Must fix before uploading large volumes of source material  
**Source of truth:** `_docs/system-audit.md`  
**Status:** Planning only — no implementation yet

---

## 1. Executive Summary

The Mythograph extraction pipeline — ingestion → transcription → chunking → extraction → review → publish — is architecturally sound. The `review_extraction_item()` gate ensures AI-extracted content is always reviewed before becoming public, and `admin_audit_events` provides a full audit trail. These are good foundations.

However, the system is currently unsafe for large-scale source ingestion because of six specific gaps:

1. **No source impact view.** Once a source is processed and its downstream claims are published, there is no admin tool to find and roll back everything that source contributed. The chain exists in the database (`source_anchors → claim_evidence → claims → entities`), but it is not surfaced anywhere in the UI. A bad source ingested at scale becomes a manual DB recovery problem.

2. **Source tier is immutable post-creation.** Source tier (`primary` vs `secondary`) directly drives confidence scores for every downstream entity and claim. If a source is misclassified, there is no correction path through the UI. The contamination is silent and permanent until a developer issues a raw SQL UPDATE.

3. **No confidence override UI.** The `confidence_override` columns exist on both `entities` and `claims` in the database schema, but no admin input accesses them. Admins cannot manually promote an important under-evidenced claim or demote a spurious high-confidence one. The only option is triggering a full recomputation.

4. **Disputed status is orphaned.** The `disputed` value exists in the `content_status` enum and can be filtered on in the admin UI, but there is no button to SET it. The publish/draft toggle is explicitly disabled when a claim is already disputed. Disputed content cannot be set through any normal workflow.

5. **No URL uniqueness constraint.** URL-format sources have no deduplication at the database level. Re-ingesting the same URL creates duplicate source records silently. The only dedup check is a case-insensitive title match, which misses URL duplicates with different titles.

6. **No relationship management UI.** AI extraction creates relationships as side effects of claim confirmation. If a spurious relationship is created between two entities, there is no admin surface to view, correct, re-weight, or remove it. The RLS policy permits writes at the DB level; the application layer just never exposes them.

**The core risk:** ingest 50+ sources before fixing items 1–3, and cleaning up a single bad actor source will require manual SQL queries through five join tables. That is not sustainable editorial practice.

**Phase 1 goal:** build exactly the six things listed above and nothing more. After Phase 1, admins can safely ingest source material at scale knowing that any bad source can be found, rolled back, and corrected through normal admin UI without touching the database directly.

---

## 2. Current State Relevant to Phase 1

### 2.1 Source & Pipeline Tables

| Table | Key Columns | Notes |
|---|---|---|
| `public.sources` | `id`, `title`, `url`, `tier`, `format`, `pipeline_stage`, `file_path`, `authors text[]`, `publication_date`, `duration_seconds` | `tier` is `source_tier` enum (`primary`/`secondary`). No `UNIQUE` on `url`. Set once at `createAdminSource()`. |
| `public.source_anchors` | `id`, `source_id`, `chunk_id`, `start_timestamp_sec`, `end_timestamp_sec` | Links a claim's evidence to a specific moment in a source. |
| `public.claim_evidence` | `claim_id`, `source_anchor_id` | Join table: many-to-many between claims and source anchors. This is the primary provenance chain. |
| `public.entity_source_anchors` | `entity_id`, `source_anchor_id`, `extraction_id` | Links entity creation back to the specific extraction and source anchor. |
| `public.extractions` | `id`, `source_id`, `status`, `extraction_data jsonb` | Holds AI output per chunk. `status` transitions from `pending` to confirmed/rejected. |
| `public.chunks` | `id`, `source_id`, `raw_text`, `start_sec`, `end_sec` | Immutable once created. No per-chunk accept/reject status. |

### 2.2 Entity & Claim Tables

| Table | Key Columns | Notes |
|---|---|---|
| `public.entities` | `id`, `name`, `slug`, `type`, `description`, `confidence_score`, `confidence_override`, `status`, `position_x`, `position_y` | `confidence_override` column exists; no UI writes to it. `status` is `content_status` enum. |
| `public.claims` | `id`, `statement`, `confidence_score`, `confidence_override`, `status`, `source_id` | Same — `confidence_override` exists, no UI. `disputed` is a valid `content_status` but unreachable via UI. |
| `public.claim_entities` | `claim_id`, `entity_id` | Join table: claims to entities. |
| `public.relationships` | `id`, `from_entity_id`, `to_entity_id`, `type`, `weight`, `claim_ids uuid[]` | No `status` column. No soft-delete path. Weight is not editable through any admin surface. |

### 2.3 Relevant Migrations

| File | What it contains |
|---|---|
| `supabase/migrations/20260523010000_enums.sql` | `content_status` enum (includes `disputed`, `archived`), `source_tier` enum, `admin_role` enum |
| `supabase/migrations/20260523020000_core_tables.sql` | `entities` (line 17: `confidence_override`), `claims` (line 50: `confidence_override`), `relationships` (line 33: `weight`), `source_anchors`, `sources` |
| `supabase/migrations/20260523040000_rls.sql` | `is_admin()` function, `relationships admin write` policy (lines 82–88) |
| `supabase/migrations/20260531130000_review_queue_hardening.sql` | `review_extraction_item()` (line 417), `update_claim_status()` (line 1058, blocks archiving at 1074–1076), `admin_audit_events` (line 36), `entity_source_anchors` table |

### 2.4 Relevant API Layer

| File | Relevant function | Notes |
|---|---|---|
| `src/lib/api/admin.ts:484` | `createAdminSource()` | Inserts source with `tier` set once; no update path for tier. |
| `src/lib/api/admin.ts:529` | `updateEntityTimelineDates()` | Only post-creation entity edit currently available. |
| `src/lib/api/admin.ts:597` | `getPipelineRerunAction()` | Returns `disabledReason` for URL format sources. |
| `src/lib/api/admin.ts:918` | `updateAdminEntityStatus()` | Status toggle only. |
| `src/lib/api/admin.ts:1008` | `updateAdminClaimStatus()` | Calls `update_claim_status()` SQL function. |
| `src/lib/api/admin.ts:1070` | `triggerConfidenceComputation()` | Triggers `compute-confidence` edge function. |
| `src/lib/api/admin.ts:1135` | `adminSourceTitleExists()` | Title-only `ilike` dedup — no URL check. |

### 2.5 Relevant UI Pages & Components

| File | What it renders | What's missing |
|---|---|---|
| `src/pages/admin/AdminSourceNewPage.tsx` | Source creation form with tier selector | No tier edit on detail page |
| `src/components/admin/ExtractionReviewPanel.tsx` | Per-item confirm/edit/reject/merge/split | No source impact view |
| `src/pages/admin/AdminClaimManagerPage.tsx` | Claim list with status filter and publish toggle | `disputed` toggle disabled at line 261; no "Mark disputed" button |
| `src/pages/admin/AdminEntityManagerPage.tsx` | Entity list with status toggle | No confidence override input |
| `src/pages/admin/AdminSourceDetailPage.tsx` | Source detail (if it exists) | No tier edit dropdown |

### 2.6 Confidence Formula (for context)

`supabase/functions/compute-confidence/index.ts:87–106`:

```
score = 0.18 (base)
      + 0.22 per primary-tier source anchor
      + 0.12 per secondary-tier source anchor
      + 0.04 per any evidence item
```

Source tier flows directly into this formula. A misclassified `primary` source inflates every downstream score by 0.10 per anchor relative to the correct `secondary` classification.

### 2.7 The Disputed Status Problem in Detail

`content_status` enum has: `draft`, `published`, `archived`, `disputed`.

- `AdminClaimManagerPage.tsx:261`: the publish/draft toggle is `disabled` when `claim.status === 'disputed'`. There is no button to enter the `disputed` state.
- `update_claim_status()` (`review_queue_hardening.sql:1058`): the function explicitly raises an exception if the target status is `archived` (lines 1074–1076): `'Claims cannot be archived through this action.'`
- `archived` and `disputed` are both unreachable through normal admin workflows. They exist in the enum but are dead code at the application layer.

---

## 3. Phase 1 Goals

After Phase 1 is complete, an admin must be able to:

1. **View all downstream impact of any source** — given a `source_id`, see every entity and claim created from that source, with status indicators, and perform bulk operations (unpublish all, mark all disputed).

2. **Correct a source's tier after creation** — change `primary` to `secondary` or vice versa via a dropdown on the source detail page, triggering re-computation of downstream confidence scores.

3. **Override confidence scores** — type a numeric override (0.0–1.0) for any entity or claim that bypasses the computed score in display and ranking.

4. **Mark claims or entities as disputed** — use a dedicated "Mark disputed" button on both manager pages. Disputed content should be visually distinct from draft and should be reachable and leaveable via normal UI actions.

5. **Prevent URL duplicate sources** — enforce a normalized URL uniqueness constraint at the database level so the same web article cannot be ingested twice, even if a re-crawl is attempted later.

6. **View, re-weight, and remove relationships** — access a paginated admin table of all relationship rows, see their backing claims, edit their weight, and soft-delete spurious ones.

---

## 4. Problems / Gaps Being Solved

### Gap 1 — No source impact view (Critical)

**Problem:** An admin ingests a source, reviews extractions, and publishes dozens of claims. Later, they discover the source was low quality or was misclassified. There is no UI tool to identify all downstream effects. The provenance chain exists in the DB (`source_anchors → claim_evidence → claims`, `entity_source_anchors → entities`) but requires multi-table SQL joins to query manually.

**Risk:** One bad source in a corpus of 100 contaminates an unknown portion of the graph with no practical rollback path.

### Gap 2 — Immutable source tier (High)

**Problem:** Source tier is set at creation time in `createAdminSource()` and cannot be changed afterward. Since tier directly affects confidence score weighting (0.22 vs 0.12 per anchor), a source misclassified as `primary` inflates confidence scores for every entity it touches, making those entities rank higher than they should. The inflation is silent — admins cannot even see which sources are contributing to a given entity's score from the entity detail page.

### Gap 3 — No confidence override UI (High)

**Problem:** `confidence_override` columns exist on both `entities` and `claims` with the clear intent of allowing admin correction of AI-computed scores. No admin input writes to these columns. The computed score is the only ranking signal for claims on entity pages (`src/lib/api/claims.ts:77`: `.order('confidence_score', { ascending: false })`). There is no way for an admin to promote a well-evidenced-but-thin claim or demote a spurious high-confidence one without re-running the entire computation.

### Gap 4 — Disputed status is dead code (High)

**Problem:** The `disputed` enum value cannot be set through any normal admin workflow. The UI button is disabled. The function blocks `archived`. Both states serve important editorial functions: `disputed` signals contested content that should remain visible-but-flagged, and `archived` is needed as a terminal state for content that was wrong and should not appear anywhere. Currently, the only options are `draft` (invisible to public) and `published` (fully visible) — no middle ground.

### Gap 5 — No URL deduplication (High)

**Problem:** The `sources.url` column has no uniqueness constraint. `adminSourceTitleExists()` only checks for matching titles via `ilike`. If the same article URL is submitted twice — whether by accident or during a re-crawl — two separate source records are created. Both advance through the pipeline independently, producing duplicate extractions, duplicate claims, and inflated confidence scores for entities that appear in both.

### Gap 6 — No relationship management (High)

**Problem:** Relationships are created as a side effect of claim confirmation inside `review_extraction_item()`. If the AI creates a spurious or incorrect relationship, there is no way to: (a) view it in isolation in the admin UI, (b) remove it, (c) adjust its weight, or (d) inspect which claims back it. The `relationships admin write` RLS policy allows writes at the DB level, but no application surface exposes it. Removing a bad relationship currently requires either un-publishing all claims that reference it (a destructive workaround) or direct DB access.

---

## 5. Desired End State

At the end of Phase 1, the admin dashboard includes:

- A **Source Impact page** accessible from any source's detail view, showing a flat list of all entities and claims that originated from that source, each with current status, with bulk "Unpublish all" and "Mark all disputed" actions.
- A **tier dropdown** on the source detail page that updates the source's tier and optionally triggers confidence re-computation for all affected entities.
- **Confidence override inputs** — a small numeric input next to the displayed confidence score on both the entity manager and claim manager pages. When set, the override value is used in place of the computed score for ranking. When cleared, the computed score resumes.
- A **"Mark disputed" button** on claim and entity manager pages that transitions content to `disputed` status. Disputed content is visible to admins, distinct from draft, and can be transitioned back to `published` or `draft`.
- A **normalized URL uniqueness constraint** at the DB level on `sources.url` so duplicate URLs fail at insertion time with a clear error surfaced in the admin form.
- A **Relationships admin page** (`/admin/relationships`) with a paginated table of all relationship rows, showing entity endpoints, type, weight, backing claim count, and status. Actions: edit weight, archive (soft-delete), view backing claims.

Nothing in the public-facing site changes. All Phase 1 work is admin-only.

---

## 6. Feature Specs

---

### Feature 1 — Source Impact View

**Purpose:** Give admins a single page to see and control everything a source contributed to the graph.

**Route:** `/admin/sources/:id/impact`

**Access:** `is_admin()` only (existing pattern, no new RLS needed).

**Page behavior:**

The page fetches two result sets using the source's `id`:

**Set A — Claims from this source:**
```
sources
  → source_anchors (where source_anchors.source_id = :id)
  → claim_evidence (where claim_evidence.source_anchor_id = source_anchors.id)
  → claims (where claims.id = claim_evidence.claim_id)
  → claim_entities → entities (for entity names)
```
Return columns: `claim.id`, `claim.statement`, `claim.status`, `claim.confidence_score`, entity names linked to claim.

**Set B — Entities from this source:**
```
sources
  → source_anchors (where source_anchors.source_id = :id)
  → entity_source_anchors (where entity_source_anchors.source_anchor_id = source_anchors.id)
  → entities (where entities.id = entity_source_anchors.entity_id)
```
Return columns: `entity.id`, `entity.name`, `entity.type`, `entity.status`, `entity.confidence_score`.

**Display:**
- Section 1: "Entities (N)" — table of entities with status badge and a toggle to unpublish individually.
- Section 2: "Claims (N)" — table of claims with status badge, confidence score, and linked entity names.
- Bulk action bar at top: "Unpublish all claims (N)", "Mark all disputed (N)". Requires confirmation dialog before executing.
- Status filter: show All / Published / Draft / Disputed.
- Each row links to the entity or claim's existing detail/manager page.

**Data loading strategy:** Two separate queries at page load, displayed independently so one slow join does not block the other. Both queries should use the existing Supabase client pattern from `src/lib/api/admin.ts`.

**Empty state:** "No entities or claims have been confirmed from this source yet." Shown when source is still in pipeline stages before `review`.

**Navigation entry point:** Add a "View impact" link/button on the source's existing detail page or row in the source manager table.

---

### Feature 2 — Source Tier Editability

**Purpose:** Allow admins to correct a source's tier (`primary` / `secondary`) after creation.

**No schema change required.** The `sources.tier` column is `source_tier` enum type and supports UPDATE at the DB level. The restriction is purely in the application layer (no update function exists).

**UI change:** On `AdminSourceDetailPage.tsx` (or wherever the source detail is rendered), replace the static tier display with a `<select>` element containing `Primary` and `Secondary` options. On change, call a new `updateSourceTier()` API function.

**Confidence recomputation prompt:** After a successful tier update, show a confirmation prompt: "This source's tier has been updated. Would you like to recompute confidence scores for all affected entities and claims? This may take a moment." If yes, trigger `triggerConfidenceComputation()` for each affected entity. The list of affected entity IDs comes from Set B of the impact query (Feature 1 query logic, reused).

**Audit logging:** The tier change should be recorded in `admin_audit_events` with `action = 'update_source_tier'`, `target_table = 'sources'`, `target_id = source.id`, and `details = { old_tier, new_tier }`.

---

### Feature 3 — Confidence Override UI

**Purpose:** Allow admins to manually set a display/ranking score on any entity or claim, bypassing the AI-computed value.

**Schema:** Both columns already exist:
- `public.entities.confidence_override numeric`
- `public.claims.confidence_override numeric`

**UI change — Entity manager (`AdminEntityManagerPage.tsx`):**
Add a small numeric input field next to the displayed `confidence_score`. Label: "Override". Placeholder: "auto". Range: 0.00–1.00, step 0.01. When a value is entered and the field is blurred, call `updateEntityConfidenceOverride(entityId, value)`. When the field is cleared (empty), call with `null` to unset the override. Display the override value distinctly from the computed score (e.g., different color or "(overridden)" label).

**UI change — Claim manager (`AdminClaimManagerPage.tsx`):**
Same pattern for claims, calling `updateClaimConfidenceOverride(claimId, value)`.

**How the override is used for ranking:** The public claims query at `src/lib/api/claims.ts:77` currently orders by `confidence_score`. Update this query to use `COALESCE(confidence_override, confidence_score) DESC` so the override takes precedence when set. Same update on any entity ranking query that uses `confidence_score`.

**Audit logging:** Record override set/clear in `admin_audit_events`.

---

### Feature 4 — Disputed Status Workflow

**Purpose:** Make `disputed` and `archived` reachable content states through normal admin UI.

**Current broken state:**
- `AdminClaimManagerPage.tsx:261`: toggle `disabled` when `status === 'disputed'`
- `update_claim_status()` SQL function (line 1074–1076): throws exception on `archived` target

**Required changes:**

**4a. "Mark disputed" button:**
On `AdminClaimManagerPage.tsx` and `AdminEntityManagerPage.tsx`, add a "Mark disputed" button per row (separate from the existing publish/draft toggle). This button calls `updateAdminClaimStatus(id, 'disputed')`. The existing `updateAdminClaimStatus()` function in `admin.ts` already wraps the `update_claim_status()` RPC — no API layer change needed if the SQL function is fixed.

**4b. Fix `update_claim_status()` SQL function:**
Remove the exception block that prevents `archived` as a target status. Add `disputed` as a valid target status. The valid transition map should be:
- `pending → draft` (already works)
- `draft → published` (already works)
- `published → draft` (already works)
- `published → disputed` (new)
- `draft → disputed` (new)
- `disputed → draft` (new — allows un-disputing)
- `disputed → published` (new — direct re-publish after resolution)
- `any → archived` (re-enable — terminal state)

**4c. Visual distinction for disputed content:**
In the claim and entity manager tables, show `disputed` status with a yellow/amber badge distinct from the orange "draft" and green "published" badges. In the bulk filter panel, ensure "Disputed" filter shows disputed items.

**4d. Same fix for entities:**
`AdminEntityManagerPage.tsx` and `updateAdminEntityStatus()` (`admin.ts:918`) should receive the same disputed/archived treatment as claims.

---

### Feature 5 — URL Deduplication Constraint

**Purpose:** Prevent the same article URL from creating multiple source records.

**Schema change:**

```sql
CREATE UNIQUE INDEX sources_url_normalized_unique
  ON public.sources (lower(regexp_replace(url, '/$', '')))
  WHERE url IS NOT NULL;
```

This indexes only non-null URLs (audio/video/text/book sources have null URLs) and normalizes by lowercasing and stripping a trailing slash. Two URLs that differ only in trailing slash or letter case are treated as identical.

**Application layer change (`src/lib/api/admin.ts`):**
Update `adminSourceTitleExists()` (or add a parallel `adminSourceUrlExists()` function) to check for URL duplicates before attempting the insert. Return a specific error type that the UI can display as "A source with this URL already exists: [title of existing source]." Include a link to the existing source record so the admin can review it.

**Form change (`AdminSourceNewPage.tsx`):**
On URL field blur (for URL-format sources), call `adminSourceUrlExists()` and show an inline warning if a match is found, before the form is submitted. This surfaces the duplicate before the DB constraint fires, giving a friendlier UX than a raw constraint violation.

**Edge case — same URL different formats:** If someone submits the same URL as both a `url`-format source (cataloging stub) and as a manual text transcription, the constraint will block the second. This is correct behavior — one URL should map to one source record, regardless of format.

---

### Feature 6 — Relationship Management Page

**Purpose:** Give admins visibility into and control over all graph relationships.

**Schema change — soft-delete support:**

```sql
ALTER TABLE public.relationships
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.profiles(id);
```

Update the existing `relationships` public read RLS policy to add `AND rel.status = 'active'` so archived relationships are excluded from the public graph.

**Route:** `/admin/relationships`

**Page behavior:**

Paginated table (50 rows per page) with columns:
- From entity (linked to entity detail)
- To entity (linked to entity detail)
- Relationship type
- Weight (editable inline — see below)
- Backing claims (count, expandable to list)
- Status (`active` / `archived`)
- Actions: Edit weight | Archive

**Filtering:** Filter by `from_entity` name, `to_entity` name, relationship type, status. Search box for entity names.

**Inline weight editing:** Each row shows the current `weight` as an editable number input. On blur/enter, call `updateRelationshipWeight(id, newWeight)`. Weight range: 0.0–1.0.

**Archive action:** "Archive" button per row triggers a confirmation dialog: "Archive this relationship? It will be removed from the public graph but can be restored." Calls `archiveRelationship(id)` which sets `status = 'archived'`, `archived_at = now()`, `archived_by = current_user_id`.

**Restore action:** For rows with `status = 'archived'`, show a "Restore" button instead of "Archive." This sets `status = 'active'` and clears `archived_at`.

**Backing claims panel:** Expandable row detail showing the list of claims in `claim_ids[]` with their current status. Links to each claim in the claim manager. This allows an admin to see whether a relationship is supported by published claims or only draft ones.

**Navigation entry point:** Add "Relationships" to the admin sidebar nav alongside Entities, Claims, Sources.

---

## 7. Database / Schema Plan

### Migration 1 — URL uniqueness constraint

```sql
-- supabase/migrations/20260608010000_sources_url_unique.sql

CREATE UNIQUE INDEX sources_url_normalized_unique
  ON public.sources (lower(regexp_replace(url, '/$', '')))
  WHERE url IS NOT NULL;
```

**Risk:** Check for existing duplicate URLs before applying. Run this query first:
```sql
SELECT lower(regexp_replace(url, '/$', '')), count(*)
FROM public.sources
WHERE url IS NOT NULL
GROUP BY 1
HAVING count(*) > 1;
```
If any duplicates exist, resolve them (merge or delete the duplicates) before applying the migration.

---

### Migration 2 — Relationship soft-delete columns

```sql
-- supabase/migrations/20260608020000_relationship_soft_delete.sql

ALTER TABLE public.relationships
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.profiles(id);

-- Existing rows are all 'active' by the DEFAULT above.

-- Update the public read RLS policy to exclude archived rows.
-- The existing policy in 20260523040000_rls.sql or review_queue_hardening.sql
-- needs a WHERE/USING clause: status = 'active'
DROP POLICY IF EXISTS "relationships public read" ON public.relationships;

CREATE POLICY "relationships public read" ON public.relationships
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = ANY(relationships.claim_ids)
        AND c.status = 'published'
    )
  );
```

---

### Migration 3 — Fix `update_claim_status()` to allow `disputed` and `archived`

```sql
-- supabase/migrations/20260608030000_fix_claim_status_transitions.sql

-- Replace the existing update_claim_status() function.
-- Key changes:
--   1. Remove the RAISE EXCEPTION block that blocks 'archived'
--   2. Add 'disputed' as a valid target status
--   3. Allow transitions: disputed → draft, disputed → published, any → archived

CREATE OR REPLACE FUNCTION public.update_claim_status(
  p_claim_id uuid,
  p_new_status public.content_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  UPDATE public.claims
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_claim_id;

  -- Log the action
  INSERT INTO public.admin_audit_events (actor_id, action, target_table, target_id, details)
  VALUES (
    auth.uid(),
    'update_claim_status',
    'claims',
    p_claim_id,
    jsonb_build_object('new_status', p_new_status)
  );
END;
$$;

-- Apply same fix to update_entity_status() if it has similar restrictions.
```

**Note:** The current function blocks `archived` with an explicit exception. Before removing that block, verify whether any application logic depends on that exception to show an error message. Search `src/lib/api/admin.ts` for the error string `'Claims cannot be archived'` to confirm no catch block depends on it.

---

### No Schema Changes Needed For

- **Source tier editability** — `sources.tier` supports UPDATE at DB level. Application layer only.
- **Confidence override** — columns exist (`confidence_override` on `entities` and `claims`). Application layer only.
- **Source impact view** — purely a read-side query over existing tables. No new columns or tables.

---

## 8. API / Service Layer Plan

All new and changed functions belong in `src/lib/api/admin.ts` unless noted.

### 8.1 Source Impact Query

```typescript
// New function
export async function getSourceImpact(sourceId: string): Promise<{
  entities: SourceImpactEntity[];
  claims: SourceImpactClaim[];
}> {
  // Query A: entities via entity_source_anchors
  const { data: entities } = await supabase
    .from('entity_source_anchors')
    .select(`
      entity:entities (id, name, type, status, confidence_score, slug)
    `)
    .eq('source_anchors.source_id', sourceId) // via join
    ...

  // Query B: claims via claim_evidence → source_anchors
  const { data: claims } = await supabase
    .from('claim_evidence')
    .select(`
      claim:claims (id, statement, status, confidence_score,
        claim_entities (entity:entities (name)))
    `)
    .eq('source_anchors.source_id', sourceId) // via join
    ...

  return { entities, claims };
}
```

The exact query structure depends on whether Supabase's nested select syntax can traverse these joins in one call or requires two separate queries with a manual join. Given the two-hop depth (e.g., `claim_evidence.source_anchor_id → source_anchors.source_id`), two separate queries may be simpler and more readable.

### 8.2 Bulk Status Operations (Source Impact page)

```typescript
export async function unpublishSourceClaims(sourceId: string): Promise<void>
export async function markSourceClaimsDisputed(sourceId: string): Promise<void>
```

These operate on the result set of Query B above. They can be implemented as:
1. Fetch all `claim_id`s from the impact query.
2. Batch-call `update_claim_status()` RPC per claim (or a new batch version of the RPC).

For MVP, individual calls are acceptable. If performance is a concern with large sources, add a `bulk_update_claim_status(claim_ids uuid[], new_status content_status)` SQL function.

### 8.3 Source Tier Update

```typescript
export async function updateSourceTier(
  sourceId: string,
  tier: 'primary' | 'secondary'
): Promise<void> {
  await supabase
    .from('sources')
    .update({ tier })
    .eq('id', sourceId)
    .throwOnError();
  // Log to admin_audit_events
}
```

### 8.4 Confidence Override

```typescript
export async function updateEntityConfidenceOverride(
  entityId: string,
  override: number | null
): Promise<void>

export async function updateClaimConfidenceOverride(
  claimId: string,
  override: number | null
): Promise<void>
```

Both write to the existing `confidence_override` column. `null` clears the override.

### 8.5 URL Duplicate Check

```typescript
export async function adminSourceUrlExists(url: string): Promise<{
  exists: boolean;
  existingSource?: { id: string; title: string };
}> {
  const normalized = url.toLowerCase().replace(/\/$/, '');
  const { data } = await supabase
    .from('sources')
    .select('id, title')
    .ilike('url', normalized)
    .maybeSingle();
  return { exists: !!data, existingSource: data ?? undefined };
}
```

### 8.6 Relationship Management

```typescript
export async function getAdminRelationships(opts: {
  page: number;
  pageSize: number;
  status?: 'active' | 'archived';
  search?: string;
}): Promise<{ data: AdminRelationship[]; count: number }>

export async function updateRelationshipWeight(
  relationshipId: string,
  weight: number
): Promise<void>

export async function archiveRelationship(relationshipId: string): Promise<void>
export async function restoreRelationship(relationshipId: string): Promise<void>
```

### 8.7 Claims Ranking Query Update

In `src/lib/api/claims.ts:77`, update the order clause:

```typescript
// Before
.order('confidence_score', { ascending: false })

// After
.order('confidence_override', { ascending: false, nullsFirst: false })
.order('confidence_score', { ascending: false })
```

Or use a computed column approach:
```sql
-- Alternative: use raw SQL via RPC if the ORM doesn't support COALESCE ordering
ORDER BY COALESCE(confidence_override, confidence_score) DESC
```

---

## 9. UI / UX Plan

### 9.1 Source Impact Page (`AdminSourceImpactPage.tsx`)

**Layout:**
```
[Back to source] Source: "[Title]" — Impact View

Entities affected (N)  [Unpublish all] [Mark all disputed]
┌─────────────────────────────────────────────────────────────┐
│ Name          │ Type    │ Status    │ Confidence │ Actions   │
│ Lightning     │ symbol  │ published │ 0.74       │ Unpublish │
│ Snake         │ symbol  │ draft     │ 0.41       │ Publish   │
└─────────────────────────────────────────────────────────────┘

Claims from this source (N)  [Unpublish all] [Mark all disputed]
┌──────────────────────────────────────────────────────────────────┐
│ Statement          │ Entities     │ Status    │ Score │ Actions   │
│ "Lightning is..."  │ Lightning    │ published │ 0.62  │ Unpublish │
└──────────────────────────────────────────────────────────────────┘
```

Bulk action buttons show a count badge (e.g., "Unpublish all (12)"). Confirmation modal before executing bulk actions.

**Navigation:** Add a "View impact →" button/link on the source detail page and as a secondary action in the source manager table row.

### 9.2 Source Detail — Tier Dropdown

On `AdminSourceDetailPage.tsx`, replace the static tier display:

```
Tier: [Primary ▼]   [Save tier]
```

On save: show inline success/error. Offer a "Recompute confidence scores for affected entities?" prompt after save.

### 9.3 Confidence Override Inputs

On entity and claim manager rows (or row expansion panels):

```
Confidence: 0.74 (computed)   Override: [0.85____] [Clear]
```

When override is set, display:
```
Confidence: 0.85 (override) ← 0.74 computed
```

### 9.4 Disputed Status Controls

On `AdminClaimManagerPage.tsx` and `AdminEntityManagerPage.tsx`, add alongside the existing publish/draft toggle:

```
[Draft] [Publish] [Mark Disputed] [Archive]
```

Status badge colors:
- `draft` → gray
- `published` → green
- `disputed` → amber/yellow
- `archived` → red/muted

When viewing a `disputed` item, show the toggle as:
```
[Draft] [Publish] [← Disputed] [Archive]
```
So the admin can move it back to draft or publish it.

### 9.5 Source Creation — URL Duplicate Warning

On `AdminSourceNewPage.tsx`, add inline duplicate check on URL field blur:

```
URL: [https://blog.example.com/article-1______________]
⚠ A source with this URL already exists: "Article One (2024)" → View
```

### 9.6 Relationship Manager (`AdminRelationshipManagerPage.tsx`)

**Layout:**
```
Relationships (1,247)   [Search entities...] [Type ▼] [Status ▼]

┌───────────────────────────────────────────────────────────────────────┐
│ From Entity  │ To Entity │ Type     │ Weight       │ Claims │ Actions  │
│ Snake        │ Eden      │ appears_ │ [0.65_] Save │ 4      │ Archive  │
│              │           │ in       │              │        │          │
│ Lightning    │ Zeus      │ symbol_  │ [0.80_] Save │ 2      │ Archive  │
│              │           │ of       │              │        │          │
└───────────────────────────────────────────────────────────────────────┘

[← Prev] Page 1 of 25 [Next →]
```

Expandable row shows backing claims:
```
▼ Snake → Eden (appears_in)
  Backing claims:
  • "The serpent appears in the Garden of Eden narrative" [published] → View
  • "Eden contains a serpent figure" [draft] → View
```

---

## 10. Step-by-Step Development Plan

Work items are ordered by dependency and risk. Items 1–3 are fully independent and can be done in any order or in parallel. Items 4–6 can begin once their prerequisite schemas are applied.

---

### Step 1 — Database migrations (Day 1)

Apply all three migrations in sequence before any UI work begins. These are additive and non-breaking.

**1a.** Apply `20260608010000_sources_url_unique.sql` (URL constraint).
- Before applying: run the duplicate-URL detection query and confirm zero results.
- After applying: verify with a test INSERT of a duplicate URL that it is rejected.

**1b.** Apply `20260608020000_relationship_soft_delete.sql` (relationships schema + RLS fix).
- After applying: verify existing relationships still appear in the public graph.
- Verify the RLS policy update does not break the 2D or 3D graph canvas data fetch.

**1c.** Apply `20260608030000_fix_claim_status_transitions.sql` (`update_claim_status()` fix).
- After applying: test via Supabase SQL editor that `update_claim_status(some_claim_id, 'disputed')` succeeds.
- Test that `update_claim_status(some_claim_id, 'archived')` now succeeds.
- Test that existing `draft → published` and `published → draft` transitions still work.

---

### Step 2 — API layer additions (Day 1–2)

Add all new functions to `src/lib/api/admin.ts`. No UI work yet.

**2a.** `getSourceImpact(sourceId)` — implement and test with a known source that has confirmed claims.

**2b.** `updateSourceTier(sourceId, tier)` — implement and test with a `SELECT ... WHERE id = :id` before/after.

**2c.** `updateEntityConfidenceOverride(entityId, override | null)` and `updateClaimConfidenceOverride(claimId, override | null)`.

**2d.** `adminSourceUrlExists(url)` — implement with normalization logic.

**2e.** `getAdminRelationships(opts)`, `updateRelationshipWeight(id, weight)`, `archiveRelationship(id)`, `restoreRelationship(id)`.

**2f.** `unpublishSourceClaims(sourceId)` and `markSourceClaimsDisputed(sourceId)` bulk operations.

**2g.** Update `src/lib/api/claims.ts:77` to use `COALESCE(confidence_override, confidence_score) DESC` ordering.

---

### Step 3 — Disputed status UI fix (Day 2)

This is the simplest UI change and unblocks editorial workflow immediately.

**3a.** `AdminClaimManagerPage.tsx:261`: Remove the `disabled` condition for `disputed`. Change the toggle behavior so that `disputed → draft` and `disputed → published` are valid transitions via the existing toggle.

**3b.** Add "Mark disputed" button per claim row. Wire to `updateAdminClaimStatus(id, 'disputed')`.

**3c.** Add "Archive" button per claim row. Wire to `updateAdminClaimStatus(id, 'archived')`. Show a confirmation dialog: "Archive this claim? It will no longer appear publicly and cannot be easily restored."

**3d.** Add status badge color for `disputed` (amber) and `archived` (muted red).

**3e.** Repeat 3b–3d for `AdminEntityManagerPage.tsx`.

**3f.** Test: mark a draft claim as disputed → confirm amber badge appears. Then mark it published → confirm green badge. Then archive it → confirm it disappears from the published filter.

---

### Step 4 — Confidence override UI (Day 2–3)

**4a.** Decide UI pattern: inline input on table row vs. row expansion panel. Given that the managers are table-based, recommend a compact inline approach: a small text input in a "Score" column that shows `0.74 (auto)` normally and becomes editable on click.

**4b.** `AdminEntityManagerPage.tsx`: Add override input. On blur with valid value, call `updateEntityConfidenceOverride()`. On blur with empty value, call with `null`. Show loading state during save. Show success/error inline.

**4c.** `AdminClaimManagerPage.tsx`: Same pattern.

**4d.** Test: set an override on a claim. Navigate to the entity's public page. Confirm the claim appears in the correct position (overridden score used for ranking).

**4e.** Test: clear the override. Confirm the claim returns to AI-computed rank position.

---

### Step 5 — Source tier editability (Day 3)

**5a.** Locate `AdminSourceDetailPage.tsx` (or identify where source detail is rendered — it may be a modal or panel rather than a full page).

**5b.** Replace the static tier text with a `<select>` containing "Primary" and "Secondary" options. Set initial value from `source.tier`.

**5c.** On change event, call `updateSourceTier(sourceId, newTier)`. Show loading state on the select. Show success/error inline.

**5d.** After successful tier update: show a prompt "Would you like to recompute confidence scores for entities affected by this source? (N entities)" with Yes/No. If Yes, fetch the impacted entity IDs via `getSourceImpact()` and call `triggerConfidenceComputation()` for each.

**5e.** Test: change a source from primary to secondary. Verify the confidence scores of downstream entities reflect the change after recomputation.

---

### Step 6 — Source impact view (Day 3–4)

**6a.** Create `src/pages/admin/AdminSourceImpactPage.tsx`.

**6b.** Add route to the router: `/admin/sources/:id/impact`.

**6c.** Implement data fetching using `getSourceImpact(sourceId)`. Show loading skeleton while fetching.

**6d.** Render the entities table (Section 1) with status badges and individual Unpublish/Publish actions.

**6e.** Render the claims table (Section 2) with status badges, confidence scores, linked entity names, and individual Unpublish/Mark Disputed actions.

**6f.** Implement bulk action bar: "Unpublish all claims (N)" and "Mark all disputed (N)" buttons. Both require a confirmation modal.

**6g.** Add navigation entry point: on the source detail page (wherever the tier dropdown from Step 5 lives), add a prominent "View impact →" button/link.

**6h.** Add a secondary "Impact" link in the source manager table row actions (if the table has an actions column).

**6i.** Test with a known source that has 5+ published claims. Verify all expected claims and entities appear. Test "Unpublish all" and confirm claims go to draft.

---

### Step 7 — URL duplicate detection in form (Day 4)

**7a.** `AdminSourceNewPage.tsx`: add an `onBlur` handler to the URL field that calls `adminSourceUrlExists(url)`.

**7b.** If a duplicate is found, render an inline warning below the URL field: "⚠ A source with this URL already exists: [title] → View source". The form can still be submitted (the DB constraint is the hard stop), but the warning should be prominent enough to prevent accidental duplicates.

**7c.** On form submit, if the Supabase INSERT fails with a unique constraint violation error, catch it and display: "This URL already exists in the source library. Please check the existing source before adding a new one."

**7d.** Test: submit a source with the URL of an existing source. Confirm the warning appears on blur and the submit fails with a clear error message.

---

### Step 8 — Relationship management page (Day 4–5)

**8a.** Create `src/pages/admin/AdminRelationshipManagerPage.tsx`.

**8b.** Add route: `/admin/relationships`.

**8c.** Add "Relationships" entry to the admin sidebar navigation.

**8d.** Implement paginated data fetch using `getAdminRelationships()`. Show count in page header.

**8e.** Render table with columns: From Entity, To Entity, Type, Weight (editable), Claim Count (expandable), Status, Actions.

**8f.** Implement inline weight editing (blur to save).

**8g.** Implement expandable row showing backing claims list with links.

**8h.** Implement Archive button per row with confirmation dialog. Wire to `archiveRelationship()`.

**8i.** Implement Restore button for archived rows. Wire to `restoreRelationship()`.

**8j.** Add status filter (Active / Archived / All) and entity name search.

**8k.** Test: archive a relationship. Confirm it no longer appears in the public graph (2D and 3D canvas). Restore it. Confirm it reappears.

---

## 11. Testing Plan

### Unit tests (API layer)

- `adminSourceUrlExists()` with normalized URL variations (trailing slash, case differences).
- `updateSourceTier()` — mock Supabase UPDATE and verify correct column and value.
- `updateEntityConfidenceOverride(id, null)` — verify NULL is written, not empty string.
- `getSourceImpact()` — mock query responses and verify both entity and claim sets are returned.

### Integration tests (admin UI)

- Source creation with duplicate URL: warning appears on blur, submit fails with clear error.
- Source tier change: tier updates, recomputation prompt appears.
- Claim disputed status: mark disputed → amber badge. Move back to published → green badge.
- Confidence override: set override, verify ranking changes on entity public page, clear override, verify rank returns to computed position.
- Relationship archive: archive a relationship, load graph, confirm edge is absent. Restore, load graph, confirm edge is present.

### Manual smoke test checklist before marking Phase 1 complete

- [ ] Submit a source URL that already exists — get a duplicate warning
- [ ] Change a source's tier from primary to secondary — recompute — verify score change
- [ ] Set `confidence_override = 1.0` on a low-scoring claim — verify it appears first on entity page
- [ ] Mark a published claim as "disputed" — verify amber badge, not visible to public
- [ ] "Unpublish all claims" on a source impact page — verify all claims go to draft
- [ ] Archive a relationship — load graph — verify edge is gone
- [ ] Restore the relationship — verify it reappears
- [ ] View relationship backing claims — verify all claim links resolve correctly

---

## 12. Acceptance Criteria

Each Phase 1 item is complete when all of the following are true:

**Source impact view:**
- [ ] Given any `source_id`, the impact page displays all entities and claims downstream of that source with accurate status indicators.
- [ ] "Unpublish all claims" transitions all displayed published claims to `draft` in a single operation.
- [ ] "Mark all disputed" transitions all displayed published claims to `disputed`.
- [ ] Each entity and claim row links to its existing manager page.
- [ ] Navigation from the source detail page to the impact page works.

**Source tier editability:**
- [ ] Admin can change a source's tier from `primary` to `secondary` or vice versa on the source detail page.
- [ ] The change is persisted to the DB.
- [ ] A recomputation prompt is offered after the change.
- [ ] The change is logged in `admin_audit_events`.

**Confidence override:**
- [ ] Admin can enter a numeric value (0.0–1.0) for `confidence_override` on any entity or claim.
- [ ] The override is persisted to the DB.
- [ ] Claims with an override rank by the override value rather than the computed score on entity pages.
- [ ] Clearing the override (empty input) sets the column to NULL and restores computed ranking.

**Disputed status:**
- [ ] "Mark disputed" button exists and works on claim and entity manager pages.
- [ ] Claims and entities can transition: `draft → disputed`, `published → disputed`, `disputed → draft`, `disputed → published`, `any → archived`.
- [ ] Disputed content shows an amber badge in admin UI.
- [ ] Disputed content is not returned in public-facing queries.
- [ ] Archived claims are excluded from public queries.

**URL deduplication:**
- [ ] Submitting a source with a URL that matches an existing source (case-insensitive, trailing slash normalized) is blocked by the DB constraint.
- [ ] The admin form shows a warning on URL field blur before submit.
- [ ] A clear error message is shown on submit if the constraint fires.

**Relationship management:**
- [ ] `/admin/relationships` page exists and is accessible from the admin nav.
- [ ] All relationships are listed with pagination.
- [ ] Weight can be edited inline.
- [ ] Archived relationships do not appear in the public 2D or 3D graph.
- [ ] Restored relationships reappear in the graph.
- [ ] Backing claims are expandable per row.

---

## 13. Risks and Mitigations

### Risk 1 — Existing duplicate URLs before migration
**Scenario:** Running the URL uniqueness migration fails because duplicate URLs already exist in `sources`.
**Mitigation:** Run the duplicate detection query listed in Section 7, Schema Plan, before applying the migration. If duplicates exist, identify the correct canonical record and soft-delete or merge the others before applying the constraint.

### Risk 2 — Relationship RLS change breaks graph
**Scenario:** The updated `relationships public read` policy (adding `status = 'active'`) causes a query error on the graph canvas if the ORM or query doesn't handle the new column correctly for rows that existed before the migration.
**Mitigation:** All existing rows get `status = 'active'` from the `DEFAULT 'active'` clause. Test the graph canvas immediately after applying the migration in a staging environment. Verify the SQL policy references the column by its full table-qualified name (`relationships.status`) to avoid ambiguity.

### Risk 3 — Confidence recomputation after tier change is slow
**Scenario:** A source has 200+ downstream entities. Triggering recomputation for all of them after a tier change is slow and may time out.
**Mitigation:** For MVP, batch the recomputation calls with a small delay between batches (e.g., 10 at a time, 200ms apart). If this proves too slow, add a background job approach: queue a recomputation task and notify the admin when done rather than waiting inline. Do not block the tier change itself on recomputation success.

### Risk 4 — Bulk "Unpublish all" on a large source
**Scenario:** A source has 500+ published claims. The bulk unpublish fires 500+ individual `update_claim_status()` calls.
**Mitigation:** Implement `bulk_update_claim_status(claim_ids uuid[], new_status content_status)` as a SQL function that updates all rows in a single statement. This is safer and faster than individual calls and avoids partial-update states if the client disconnects mid-operation.

### Risk 5 — Archiving a claim that backs a relationship
**Scenario:** An admin archives a claim, but that claim is in `relationships.claim_ids[]`. The relationship remains `active` but now has an archived backing claim, which creates an inconsistency.
**Mitigation:** When archiving a claim, check if it appears in any `relationships.claim_ids`. If the relationship would have zero remaining non-archived claims after the archive, prompt the admin: "This is the only claim backing the relationship [Entity A → Entity B]. Archiving this claim will leave the relationship unsupported. Archive anyway?" Do not auto-archive the relationship — that should be an explicit admin action.

### Risk 6 — Override value persists after source or claim deletion
**Scenario:** An admin sets `confidence_override = 0.9` on a claim, then later wants to understand why it ranks so high. The override is not visually obvious.
**Mitigation:** Make the override visually distinct on the entity's public claim list (a small "(overridden)" label visible to admins when logged in). Ensure the admin manager always shows both the computed score and the override value side by side so the distinction is never ambiguous.

---

## 14. Out of Scope for Phase 1

The following items are explicitly NOT part of Phase 1. They are mentioned here to prevent scope creep during implementation:

- **URL ingestion / web crawling** — the URL pipeline stub (`trigger-url-fetch` edge function) is Phase 2. Phase 1 only adds a URL deduplication constraint for future use.
- **Interpretation framing** (`interpretation_frame` enum and column on claims) — Phase 2.
- **`is_canonical` flag on claims** — Phase 2.
- **Entity page claim grouping** by interpretive frame — Phase 2.
- **Manual entity/claim creation forms** (outside AI pipeline) — Phase 2.
- **Side panel claim preview** in `GraphSidePanel.tsx` — Phase 2.
- **`source_category` enum expansion** beyond primary/secondary — Phase 2.
- **Community accounts, suggestions, comments, voting** — Phase 3 and 4.
- **Inline media embed** on entity/claim pages — Phase 3.
- **Entity images** (`image_url` column, entity-images bucket) — Phase 3.
- **Copyright/license fields** on sources — Phase 2.
- **Blog/site crawling** — Phase 3.
- Any changes to public-facing pages (entity detail, claim detail, graph, source detail for public users). All Phase 1 work is admin-only.

---

## 15. Final Recommendation

**Build Phase 1 in full before resuming source ingestion.** The six items in this plan are not nice-to-have polish — they are the minimum editorial control surface for responsible curation at scale. Without them:

- One bad source creates an unauditable mess (no impact view).
- A misclassified source silently corrupts rankings across the graph (no tier edit).
- Admins cannot correct AI-computed scores manually (no confidence override).
- The `disputed` workflow is blocked at the UI level (disabled button).
- Re-crawls create silent duplicates (no URL constraint).
- Spurious AI-generated relationships have no removal path (no relationship manager).

None of these require large architectural changes. Features 2, 3, and 4 (tier edit, confidence override, disputed status) are primarily UI wiring over already-existing schema. Feature 5 (URL constraint) is a single index migration. Feature 6 (relationship manager) requires a small schema addition and a new admin page. Feature 1 (source impact view) is the most complex — two multi-table join queries plus a new page — but it is also the most critical.

**Estimated total effort: 4–6 development days** for a developer familiar with the codebase.

After Phase 1 is complete, the system is safe for large-scale ingestion. Phase 2 (interpretation framing, `is_canonical`, manual creation forms, source category expansion) can then proceed — those items improve the editorial quality of the graph but do not create safety risks at the ingestion level.
