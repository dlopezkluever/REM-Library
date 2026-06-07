# Phase 2 — Public Launch Readiness: Spec & Dev Plan

**Project:** Alexandria / RemLib  
**Document version:** 2026-06-07  
**Source:** System Audit (`_docs/system-audit.md`)  
**Phase scope:** "Should build before public/community launch"

---

## 1. Executive Summary

Phase 1 established the safety controls needed before ingesting large volumes of source material: source impact traceability, tier editability, confidence override inputs, disputed-status buttons, URL deduplication, and a relationship management surface. Phase 2 is about making the curated graph worth showing to the public.

The central problem is that the graph has no interpretive structure. Every published claim on an entity is one undifferentiated flat list, sorted by an AI-computed confidence score. There is no way to express "this is the canonical interpretation," "this is supporting context," or "this is a disputed alternative reading." There is no way for an admin to create a stub entity or hand-write a claim without running a source through the AI extraction pipeline. And URL-format sources — the most common real-world source type — cannot advance through the pipeline at all.

Phase 2 addresses all of that. By the end of this phase, the system must:

- Express interpretive hierarchy on every entity page
- Allow admins to designate canonical claims
- Allow admins to create entities and claims manually, outside the AI pipeline
- Expand source categorization beyond the binary primary/secondary tier
- Process single URLs through the ingestion pipeline

This document is the complete technical and product specification for that work. It is written for a developer or coding agent implementing the changes from scratch.

---

## 2. Current State Relevant to Phase 2

### 2.1 Claims and Interpretive Structure

- **Table:** `public.claims` (`supabase/migrations/20260523020000_core_tables.sql`)
- **Columns:** `id`, `content`, `status` (`content_status` enum: `draft`, `published`, `disputed`, `archived`), `confidence_score`, `confidence_override`, `created_at`, `updated_at`
- **No `interpretation_frame` column.** No `is_canonical` column.
- All published claims for an entity are fetched in a single query at `src/lib/api/claims.ts:77`, ordered `confidence_score DESC`. No grouping, no sectioning.
- The `confidence_override` column exists on `claims` but no admin UI accesses it (this is being added in Phase 1).

### 2.2 Entity Detail Page

- **File:** `src/pages/entity/EntityDetailPage.tsx`
- Lines 148–219 render one flat "Claims" list. No grouping by frame, tradition, or interpretive category.
- The page has an encyclopedia layout: markdown prose, claims list, sources list via `SourceAnchorRow`, connected entities, and a `MiniGraph` sidebar.
- Canonical claim concept does not exist anywhere in the UI.

### 2.3 Graph Side Panel

- **File:** `src/components/graph/GraphSidePanel.tsx`
- Clicking a graph node opens this right-side drawer at `min(88vw, 320px)`.
- Currently shows: entity name, entity type badge, description, `AttestationBar` (confidence + source count), top 3 connected entities by relationship weight, "View full entry" link.
- **Shows no claims.** A user clicking a graph node sees zero interpretive content without navigating away to the full entity page.

### 2.4 Source Tier / Category

- **Enum:** `source_tier` in `supabase/migrations/20260523010000_enums.sql` — exactly two values: `primary`, `secondary`.
- **Table:** `public.sources` — has `tier source_tier` column.
- The two values map loosely to "core REM group material" vs "everything else" by UI label convention only. No semantic enforcement in the schema.
- No `source_category` column. No `crawl_date`, `license`, `rights_notes`, or `attribution` columns on `sources`.
- The confidence formula in `supabase/functions/compute-confidence/index.ts:87–106` weights claims differently based on source tier: `+0.22` per primary-tier anchor, `+0.12` per secondary-tier anchor, `+0.04` per any evidence item.

### 2.5 Manual Entity / Claim Creation

- No standalone "Create entity" or "Create claim" form exists anywhere in the codebase.
- Every entity and every claim must originate from AI extraction review.
- Admins cannot create a stub entity for a known important figure, write a claim by hand, or add a relationship they know to be true.
- **Files relevant if we add creation:** `src/pages/admin/`, `src/lib/api/admin.ts`, `src/components/admin/`

### 2.6 URL Ingestion

- **Enum value:** `url` exists in `source_format` enum (`supabase/migrations/20260523010000_enums.sql:16`).
- **Admin form:** `src/pages/admin/AdminSourceNewPage.tsx:38` accepts URL input.
- **Deferral notice:** explicit comments at lines 226–228 and 404–407 of that file.
- **Admin API:** `src/lib/api/admin.ts:597–602` returns `disabledReason: 'Automatic URL ingestion is not available yet.'` for any source with `format = 'url'`.
- **No edge function** exists under `supabase/functions/` for fetching, parsing, or chunking a URL.
- URL-format source records are created at `pipeline_stage = 'uploaded'` and stay there permanently.

### 2.7 Extraction Review Panel

- **File:** `src/components/admin/ExtractionReviewPanel.tsx`
- Supports confirm, edit, reject, merge, split per extraction item.
- Claim edit form exists around line 210. No `interpretation_frame` field is present.
- This is the primary place where frame assignment should be available at review time.

### 2.8 Relevant Existing Infrastructure

| Asset | Location | Notes |
|---|---|---|
| `claims` table | `20260523020000_core_tables.sql` | `confidence_override` column exists, unused in UI (Phase 1 adds UI) |
| `entities` table | `20260523020000_core_tables.sql` | Has `position_x/y`, `date_era`, `date_sort_year`, `description` |
| `review_extraction_item()` | `20260531130000_review_queue_hardening.sql:417` | Sole path for creating confirmed claims/entities |
| `source_tier` enum | `20260523010000_enums.sql` | `primary`, `secondary` only |
| `source_format` enum | `20260523010000_enums.sql` | Includes `url` |
| `content_status` enum | `20260523010000_enums.sql` | `draft`, `published`, `disputed`, `archived` |
| `admin_audit_events` | `20260531130000_review_queue_hardening.sql` | Logs every review/status action |
| `AdminClaimManagerPage.tsx` | `src/pages/admin/` | Claim list, status toggles |
| `AdminEntityManagerPage.tsx` | `src/pages/admin/` | Entity list, status toggles |
| `AdminSourceDetailPage.tsx` | `src/pages/admin/` | Source detail, tier dropdown (Phase 1) |
| `GraphSidePanel.tsx` | `src/components/graph/` | Node drawer |
| `GraphCanvas.tsx` | `src/components/graph/` | 2D graph, fires `setActiveNodeId:233` |
| `GraphCanvas3D.tsx` | `src/components/graph/` | 3D graph, fires `setActiveNodeId:148` |
| `getClaimsForEntity()` | `src/lib/api/claims.ts:77` | `confidence_score DESC`, no grouping |
| `compute-confidence` | `supabase/functions/compute-confidence/index.ts` | Confidence formula |

---

## 3. Phase 2 Goals

1. **Add interpretive framing** — introduce an `interpretation_frame` enum and column on `claims` so every claim can be categorized by its interpretive role.
2. **Add canonical claim designation** — introduce `is_canonical boolean` on `claims` so admins can designate the single most important claim per entity.
3. **Restructure the entity detail page** — replace the flat claims list with sections grouped by frame, with the canonical claim in a hero position.
4. **Show claims in the graph side panel** — surface 1–2 key claims in the node drawer so users see interpretive content without navigating away.
5. **Enable manual entity creation** — standalone form for admins to create stub entities outside the AI pipeline.
6. **Enable manual claim creation** — standalone form for admins to write claims by hand and attach them to entities.
7. **Expand source categorization** — add `source_category` enum with richer values beyond the binary primary/secondary, and add `crawl_date`, `license`, `rights_notes`, `attribution` to `sources`.
8. **Enable single-URL ingestion** — build the `trigger-url-fetch` edge function so URL-format sources can advance through the pipeline.

---

## 4. Problems / Gaps Being Solved

### P1. No interpretive hierarchy (Critical for product identity)

All published claims on an entity appear as one flat list sorted by `confidence_score DESC`. A claim backed by four secondary-tier sources will outrank a hand-curated canonical claim backed by one primary source. There is no narrative hierarchy, no way to say "this is the official interpretation," no visual distinction between a consensus reading and a disputed alternative. The product's core intellectual identity — curated, interpretively structured — is invisible to the public because the data model cannot express it.

### P2. No canonical claim designation

Admins have no way to pin or designate the authoritative interpretation of an entity. The only ranking mechanism is the AI-computed confidence score, which cannot be corrected through the UI (Phase 1 adds `confidence_override`, but setting a number is a workaround, not a semantic designation).

### P3. Graph side panel shows no interpretive content

The primary interactive surface for most users is the graph. Clicking a node shows metadata (name, type, description, neighbor entities) but zero interpretive content. Users must navigate away to the full entity page to see any claims. This is a significant engagement gap: the graph's visual interest should be paired with immediate interpretive payoff.

### P4. Everything must originate from AI extraction

Admins cannot create a stub entity for a known important figure, write a claim they know to be true, or add a relationship manually. The system is entirely dependent on the AI pipeline as the entry point for all content. This blocks the curation workflow for foundational entities that may not appear in source material yet.

### P5. Source categorization is too coarse

The binary `primary` / `secondary` tier conflates very different source types: a core REM document (`primary_rem`) is categorically different from a historical record (`historical_record`) or an external academic paper (`external_academic`). The confidence formula uses this binary, so misclassification has downstream scoring effects that cannot be expressed with more nuance.

### P6. URL sources are permanently stuck

Any source with `format = 'url'` is created at `pipeline_stage = 'uploaded'` and can never advance. The pipeline simply cannot process the most common real-world source format. Every external article or web resource must be manually cataloged as a stub that goes nowhere.

---

## 5. Desired End State

After Phase 2 is complete:

- Every claim in the database can have an `interpretation_frame` value (nullable — existing claims are unset until an admin assigns one).
- Every claim can be flagged `is_canonical = true`. At most one claim per entity should be canonical (soft-enforced at application level).
- The entity detail page shows claims in sections: **Core Interpretation** (canonical + canonical_rem frame), **Supporting Context**, **External Academic Perspectives**, **Historical Record**, **Literary & Artistic**, **Disputed Readings** (claims with `status = 'disputed'`, shown with a visual disclaimer). Sections with no claims collapse.
- The graph side panel shows 1–2 key claims (preferring `is_canonical`, falling back to top `confidence_score`) below the description.
- Admins can create a new entity from a standalone form without running any AI extraction.
- Admins can create a new claim from a standalone form, attach it to one or more entities, set its frame and canonical flag, and publish it directly.
- The `sources` table has a `source_category` enum column (`primary_rem`, `secondary_rem`, `external_academic`, `historical_record`, `literary_artistic`, `community_submitted`) alongside the existing `tier` column. New sources are assigned a category at creation time.
- Admins can assign or change a source's category after creation via `AdminSourceDetailPage.tsx`.
- The confidence computation references `source_category` for weighting (or continues to use `tier` — see risk note in §13).
- An admin can trigger URL ingestion on a URL-format source. The edge function fetches the URL, extracts readable content, creates chunks, and advances `pipeline_stage` to `chunking` (or `transcribing`/`extracting` — see implementation detail). URL-format sources are no longer permanently stuck.
- The admin source form no longer shows a "disabled" warning for URL format.

---

## 6. Feature Specs

### 6.1 `interpretation_frame` Enum and Claim Column

**What it is:** A typed enum that categorizes a claim by its interpretive role within the knowledge graph.

**Values:**

| Value | Meaning |
|---|---|
| `canonical_rem` | The core, authoritative REM interpretation |
| `supporting_context` | Context that supports or elaborates the canonical view |
| `external_academic` | Perspective from external academic scholarship |
| `historical_record` | Documented historical fact or record |
| `literary_artistic` | Literary, artistic, or symbolic interpretation |
| `disputed_alternative` | A reading that contradicts or disputes the canonical interpretation |

**Behavior:**
- The column is nullable on `claims`. Existing claims have `NULL` interpretation_frame.
- Admins assign the frame either during extraction review (`ExtractionReviewPanel.tsx`) or after the fact in `AdminClaimManagerPage.tsx`.
- The frame is distinct from `status`. A claim can be `published` with any frame value. A claim with `status = 'disputed'` and `interpretation_frame = 'disputed_alternative'` has overlapping but distinct signals.
- The public claim query (`getClaimsForEntity()`) returns frame values and uses them for grouping, not filtering. All published claims are still returned regardless of frame.

**Who can set `is_canonical`:** Only `super_admin`. This must be enforced at the function or RLS level, not just in the UI. The canonical flag is an editorial act of deliberate curation, not a routine admin operation. If set by any editor it will be contested.

---

### 6.2 `is_canonical` Flag on Claims

**What it is:** A boolean on `claims` that marks the single most important interpretive claim for a given entity.

**Behavior:**
- Default `false`. Admins explicitly set it `true`.
- At most one claim per entity should be canonical. This is soft-enforced at the application level (the UI warns if another canonical claim already exists for the entity). A DB-level unique partial index is impractical because claims link to entities via the `claim_entities` join table (one claim can relate to multiple entities).
- On the entity detail page, the canonical claim is always shown first in the "Core Interpretation" section, regardless of `confidence_score`.
- In the graph side panel, the canonical claim is shown as the primary preview claim.
- Only `super_admin` can toggle `is_canonical`. The admin API function should check `profiles.role = 'super_admin'`.

---

### 6.3 Entity Page Claim Grouping

**What it is:** Replace the flat claims list on `EntityDetailPage.tsx` with a sectioned layout driven by `interpretation_frame` and `is_canonical`.

**Section order:**

1. **Core Interpretation** — claims where `is_canonical = true` OR `interpretation_frame = 'canonical_rem'`. The `is_canonical` claim (if any) is rendered first in a hero style (larger text, distinct visual treatment). Remaining `canonical_rem` claims follow.
2. **Supporting Context** — `interpretation_frame = 'supporting_context'`
3. **External Academic Perspectives** — `interpretation_frame = 'external_academic'`
4. **Historical Record** — `interpretation_frame = 'historical_record'`
5. **Literary & Artistic** — `interpretation_frame = 'literary_artistic'`
6. **Unframed Claims** — `interpretation_frame IS NULL` and `is_canonical = false` — shown in a collapsible "Other claims" section to avoid hiding content that hasn't been categorized yet
7. **Disputed Readings** — claims with `status = 'disputed'` (requires Phase 1 disputed-status button to be useful). Shown with a visual disclaimer ("These readings are marked as disputed by curators").

**Behavior:**
- Sections with zero claims are not rendered (not even an empty heading).
- Each claim within a section continues to be ordered by `confidence_score DESC` as a secondary sort.
- The `disputed` claims section requires the public query to optionally return disputed claims. Currently `status != 'published'` claims are fully excluded. The public query for entity pages should be updated to include `disputed` claims in a separate field, not mixed with published ones.

---

### 6.4 Graph Side Panel Claims Preview

**What it is:** Add 1–2 key claims directly to the `GraphSidePanel.tsx` drawer.

**Behavior:**
- After the existing description paragraph, add a "Key interpretations" subsection.
- Show at most 2 claims. Priority: first the claim where `is_canonical = true` (if any), then the top `confidence_score` published claim.
- Each claim is rendered as a short excerpt (max ~120 characters) with an `interpretation_frame` badge if set.
- A "See all claims →" or "View full entry" link is already present; no change needed there.
- The entity preview query must be efficient — do not add a second network round-trip. Either extend the existing neighborhood query in `src/lib/api/entities.ts` or add a new `getEntityPreviewWithClaims()` function that returns entity + top claims in one call.

---

### 6.5 Manual Entity Creation Form

**What it is:** A standalone admin form to create a new entity without going through AI extraction.

**Fields:**
- `name` (required, text)
- `entity_type` (required, select from `entity_type` enum)
- `description` (optional, textarea, markdown)
- `date_era` (optional, select from era enum)
- `date_sort_year` (optional, number)
- `status` (select: `draft` / `published`, default `draft`)

**Behavior:**
- On submit, calls a new `createAdminEntity()` function in `src/lib/api/admin.ts`.
- The created entity has no claims, no source anchors, and no relationships. It is a stub.
- Redirects to the entity detail page in admin context after creation.
- Logs to `admin_audit_events`.

**Route:** `/admin/entities/new`

---

### 6.6 Manual Claim Creation Form

**What it is:** A standalone admin form to write a claim by hand and attach it to one or more entities.

**Fields:**
- `content` (required, textarea — the claim statement itself)
- `entities` (required, multi-select search: attach this claim to one or more existing entities)
- `interpretation_frame` (optional, select from `interpretation_frame` enum)
- `is_canonical` (boolean checkbox — `super_admin` only; hidden for `editor` role)
- `status` (select: `draft` / `published`, default `draft`)
- `source` (optional — allow attaching a source anchor to give it evidence at creation time; can also be added later)

**Behavior:**
- On submit, calls a new `createAdminClaim()` function in `src/lib/api/admin.ts`.
- Directly inserts into `claims` and `claim_entities` tables, bypassing the AI extraction pipeline.
- Does not create an extraction record. This is admin-authored content, not AI-extracted content.
- Logs to `admin_audit_events`.
- `is_canonical` write is restricted to `super_admin` — enforce in the API function, not just the UI.

**Route:** `/admin/claims/new`

---

### 6.7 `source_category` Expansion

**What it is:** A new `source_category` enum with richer values than the binary `source_tier`, added as a separate column on `sources` so existing `tier` data is not lost.

**Enum values:**

| Value | Meaning |
|---|---|
| `primary_rem` | Core REM group source material |
| `secondary_rem` | Adjacent or related REM material |
| `external_academic` | External academic scholarship |
| `historical_record` | Historical document or record |
| `literary_artistic` | Literary, artistic, or cultural source |
| `community_submitted` | Submitted by a community member (Phase 3 relevance) |

**Behavior:**
- The existing `tier` column (`source_tier`) remains on the table unchanged. It is not removed.
- `source_category` is a new nullable column. Backfill on migration: `primary tier → primary_rem`, `secondary tier → secondary_rem`.
- The source creation form (`AdminSourceNewPage.tsx`) gets a `category` dropdown replacing the current `tier` dropdown for new sources. The `tier` value is derived from `category` for backwards compatibility with the confidence formula: `primary_rem` and `secondary_rem` → `primary`, everything else → `secondary`.
- The `AdminSourceDetailPage.tsx` page (which Phase 1 already adds tier editability to) also exposes `category` as an editable dropdown.
- The confidence formula in `compute-confidence` continues to use `tier` for weighting in Phase 2. A more granular per-category weighting can be done in Phase 3+ once the category data is populated.

---

### 6.8 URL Ingestion Edge Function

**What it is:** A Supabase edge function (`supabase/functions/trigger-url-fetch/index.ts`) that fetches a URL, extracts readable text content, creates text chunks on the source record, and advances `pipeline_stage`.

**Trigger:** Admin manually triggers it from `AdminSourceDetailPage.tsx` for a URL-format source that is at `pipeline_stage = 'uploaded'`.

**Behavior (end-to-end):**

1. Admin presses "Fetch URL" button on a URL-format source detail page.
2. Frontend calls the edge function with `{ sourceId }`.
3. Edge function:
   a. Reads the source record from `sources` to get the `url`.
   b. Checks `url` against a `url_ingestion_config` domain allowlist table (see §7.6). If the domain is not allowlisted, returns an error.
   c. Fetches the URL (`fetch(url, { headers: { 'User-Agent': '...' } })`).
   d. Extracts readable content — either via a readability library or an LLM extraction call. Minimum extracted word count: 200 words. If below threshold, sets source to a `fetch_failed` state with a reason and returns an error to the admin.
   e. Splits the extracted text into chunks (by paragraph or fixed token window — consistent with how uploaded text files are chunked).
   f. Inserts chunk records into the `chunks` table linked to this source.
   g. Updates `sources.pipeline_stage` to `'chunking'` (or the appropriate next stage in the pipeline).
   h. Updates `sources.crawl_date` to `now()`.
4. Admin sees the source advance in `AdminSourceDetailPage.tsx` and can then trigger the normal extraction pipeline.

**Safety constraints:**
- Domain allowlist is required. No arbitrary external requests without explicit admin configuration.
- The function must not auto-trigger extraction. After fetching and chunking, the source waits at the pre-extraction stage for explicit admin approval.
- Handle common failure modes: 404, 403, paywall signals (thin content), JavaScript-rendered pages returning empty HTML.
- URL-format sources already have a `UNIQUE` constraint on `sources.url` (Phase 1 item 1.5). No duplicate check is needed here — it was enforced at creation.

**Route config table (`url_ingestion_config`):**
- `id`, `domain text UNIQUE NOT NULL`, `enabled boolean DEFAULT true`, `added_by uuid`, `created_at timestamptz`
- Admin-only insert/update via RLS.
- Edge function reads this table before fetching.

---

## 7. Database / Schema Plan

### 7.1 `interpretation_frame` Enum

```sql
-- New migration: 20260608000000_interpretation_frame.sql (or next timestamp)

CREATE TYPE public.interpretation_frame AS ENUM (
  'canonical_rem',
  'supporting_context',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'disputed_alternative'
);

ALTER TABLE public.claims
  ADD COLUMN interpretation_frame public.interpretation_frame,
  ADD COLUMN is_canonical boolean NOT NULL DEFAULT false;
```

No unique index can cleanly enforce "one canonical per entity" because claims relate to entities through the `claim_entities` join table. Enforce this at the application layer: before setting `is_canonical = true` on a claim, check whether any other claim already has `is_canonical = true` for any of the same entities. If yes, warn the admin and require them to confirm (or automatically unset the old canonical).

### 7.2 `source_category` Enum and Column

```sql
CREATE TYPE public.source_category AS ENUM (
  'primary_rem',
  'secondary_rem',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'community_submitted'
);

ALTER TABLE public.sources
  ADD COLUMN category public.source_category,
  ADD COLUMN crawl_date timestamptz,
  ADD COLUMN license text,
  ADD COLUMN rights_notes text,
  ADD COLUMN attribution text;

-- Backfill from existing tier values
UPDATE public.sources
  SET category = CASE tier
    WHEN 'primary'   THEN 'primary_rem'::public.source_category
    WHEN 'secondary' THEN 'secondary_rem'::public.source_category
  END;
```

The `tier` column is NOT removed. The confidence formula still uses it. Derive `tier` from `category` on writes: `primary_rem` and `secondary_rem` map to `primary`; all others map to `secondary`. This mapping is done in the API layer (`createAdminSource()` and any new `updateSourceCategory()`).

### 7.3 `url_ingestion_config` Table

```sql
CREATE TABLE public.url_ingestion_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      text NOT NULL UNIQUE,
  enabled     boolean NOT NULL DEFAULT true,
  notes       text,
  added_by    uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.url_ingestion_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "url_ingestion_config admin read"
  ON public.url_ingestion_config FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "url_ingestion_config super_admin write"
  ON public.url_ingestion_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));
```

### 7.4 Public Claim Query — Disputed Claims Surfacing

Currently `getClaimsForEntity()` filters `status = 'published'` only. Update to optionally return `disputed` claims in a separate array so the entity page can render the "Disputed Readings" section without mixing them into the main published list.

No schema change required — this is a query change in `src/lib/api/claims.ts`.

### 7.5 `is_canonical` Enforcement (Application Layer)

No DB unique constraint. Before setting `is_canonical = true` on a claim, the `setClaimCanonical()` API function should:

1. Fetch all entity IDs linked to the target claim via `claim_entities`.
2. Query whether any other claim with `is_canonical = true` is linked to any of those entities.
3. If yes: either return a conflict error (UI prompts admin to confirm replacement), or automatically unset the existing canonical claim in the same transaction.

Recommend the confirm-replacement pattern to prevent accidental overwrites.

---

## 8. API / Service Layer Plan

All new and modified functions live in `src/lib/api/admin.ts` unless otherwise noted.

### 8.1 New functions

| Function | Description |
|---|---|
| `createAdminEntity(data)` | Insert into `entities`, log to `admin_audit_events`. |
| `createAdminClaim(data)` | Insert into `claims` + `claim_entities`, log to audit. `is_canonical` write gated to `super_admin`. |
| `updateClaimInterpretationFrame(id, frame)` | Set `interpretation_frame` on a claim. Any `is_admin()`. |
| `setClaimCanonical(id, value)` | Set `is_canonical` on a claim. `super_admin` only. Conflict-check before setting `true`. |
| `updateSourceCategory(id, category)` | Set `category` (and derive `tier`) on a source. Also updates `tier` for confidence formula compatibility. |
| `triggerUrlFetch(sourceId)` | Calls the `trigger-url-fetch` edge function. Returns status and any errors. |
| `createUrlIngestionDomain(domain)` | Insert into `url_ingestion_config`. `super_admin` only. |
| `listUrlIngestionDomains()` | Read `url_ingestion_config`. Any admin. |

### 8.2 Modified functions

| Function | Change |
|---|---|
| `getClaimsForEntity()` in `src/lib/api/claims.ts` | Add `interpretation_frame`, `is_canonical` to SELECT. Add optional `includeDisputed` parameter that returns disputed claims in a separate field. Order: `is_canonical DESC, confidence_score DESC`. |
| `getEntityPreview()` or neighborhood query in `src/lib/api/entities.ts` | Add top-2 claims (by `is_canonical DESC, confidence_score DESC`) to the return payload for graph side panel use. |
| `createAdminSource()` | Accept `category` field in addition to `tier`. Derive `tier` from `category` if category is provided. |

### 8.3 Edge Function

**`supabase/functions/trigger-url-fetch/index.ts`**

- Input: `{ sourceId: string }`
- Auth: valid admin JWT (same pattern as other edge functions)
- Steps: read source → allowlist check → fetch URL → content extraction → quality check (word count ≥ 200) → chunk → insert chunks → update `pipeline_stage` and `crawl_date`
- Output: `{ success: boolean, chunksCreated: number, error?: string }`

Content extraction: use a simple HTML-to-text approach first (strip tags, preserve paragraph structure). If the result is empty or below the word count threshold, return a `fetch_failed` error rather than creating empty chunks. A more sophisticated readability pass (Mozilla Readability via WebAssembly, or an LLM extraction call) can be added in Phase 3 when crawling is built.

---

## 9. UI / UX Plan

### 9.1 `ExtractionReviewPanel.tsx` — Frame Selector

- In the claim edit form (around line 210), add an `interpretation_frame` dropdown.
- Default: null / unset (labeled "— No frame —").
- Options: all six enum values with human-readable labels.
- Also add `is_canonical` checkbox (visible to `super_admin` only, hidden for `editor`).
- These fields are saved when the admin confirms or edits the extraction item.

### 9.2 `AdminClaimManagerPage.tsx` — Frame and Canonical Controls

- Add `interpretation_frame` column to the claims table display.
- Add an inline `<select>` for frame that fires `updateClaimInterpretationFrame()` on change.
- Add an `is_canonical` badge/toggle (visible and editable only for `super_admin`). Display a lock icon for `editor` role indicating this field is read-only.

### 9.3 `EntityDetailPage.tsx` — Sectioned Claim Display

Replace the current flat claims list (lines 148–219) with a sectioned component:

```
<ClaimSection title="Core Interpretation" claims={canonicalClaims} heroFirst />
<ClaimSection title="Supporting Context" claims={supportingClaims} />
<ClaimSection title="External Academic Perspectives" claims={academicClaims} />
<ClaimSection title="Historical Record" claims={historicalClaims} />
<ClaimSection title="Literary & Artistic" claims={literaryClaims} />
<ClaimSection title="Other Claims" claims={unframedClaims} collapsible />
<ClaimSection title="Disputed Readings" claims={disputedClaims} disputed />
```

`ClaimSection` renders null if its `claims` array is empty. The `heroFirst` prop on Core Interpretation renders the `is_canonical` claim with larger typography and a distinct visual treatment (e.g., accent border, slightly elevated card).

### 9.4 `GraphSidePanel.tsx` — Claims Preview

After the description block, add a "Key interpretations" subsection:
- Fetch top claims via `getEntityPreviewWithClaims()` (or extend the existing neighborhood query).
- Render at most 2 claims as compact cards: frame badge (if set) + truncated content (max 120 chars).
- If neither claim has `is_canonical = true`, show the top 2 by `confidence_score`.

No new route or page required. This is a data-fetch extension to the existing side panel.

### 9.5 `/admin/entities/new` — Manual Entity Creation

New page at `src/pages/admin/AdminEntityNewPage.tsx`.

Form fields: name, entity_type (select), description (textarea), date_era (select), date_sort_year (number), status (draft/published).

On submit: `createAdminEntity()` → redirect to the new entity's admin detail page.

Add route to admin router. Add "Create entity" button to `AdminEntityManagerPage.tsx` header.

### 9.6 `/admin/claims/new` — Manual Claim Creation

New page at `src/pages/admin/AdminClaimNewPage.tsx`.

Form fields: content (textarea), entities (multi-select with search against `entities` table), interpretation_frame (select), is_canonical (checkbox, `super_admin` only), status (draft/published).

On submit: `createAdminClaim()` → redirect to the new claim's admin detail page.

Add route to admin router. Add "Create claim" button to `AdminClaimManagerPage.tsx` header.

### 9.7 `AdminSourceDetailPage.tsx` — Category Dropdown

- Add `source_category` dropdown alongside the existing tier display (Phase 1 adds tier editability; Phase 2 adds the richer category selector).
- On change: call `updateSourceCategory()`. The `tier` column is automatically derived and updated.
- Display `crawl_date` if set (read-only, populated by the URL fetch function).
- Add optional `license`, `rights_notes`, `attribution` text inputs. These can be blank; no validation required.

### 9.8 `AdminSourceDetailPage.tsx` — URL Fetch Trigger Button

For sources with `format = 'url'` and `pipeline_stage = 'uploaded'`:
- Show a "Fetch URL" button.
- On click: call `triggerUrlFetch(sourceId)` → show loading state → on success, refresh the page to show updated `pipeline_stage`.
- On error: show the error message returned by the edge function (e.g., "Domain not in allowlist", "Content below minimum word count").

Remove the existing `disabledReason` warning message once the edge function exists.

### 9.9 URL Ingestion Domain Management (Minimal UI)

A simple admin-only table view under `/admin/settings/url-domains` (or added to a settings/config section):
- List all domains in `url_ingestion_config`.
- Add domain form (text input + submit).
- Toggle enabled/disabled.
- `super_admin` only — hide from `editor` role.

---

## 10. Step-by-Step Development Plan

### Step 1 — Database Migrations

**1.1** Write migration `20260608000000_interpretation_frame.sql`:
  - Create `interpretation_frame` enum with 6 values.
  - `ALTER TABLE public.claims ADD COLUMN interpretation_frame public.interpretation_frame`.
  - `ALTER TABLE public.claims ADD COLUMN is_canonical boolean NOT NULL DEFAULT false`.

**1.2** Write migration `20260608000100_source_category.sql`:
  - Create `source_category` enum with 6 values.
  - `ALTER TABLE public.sources ADD COLUMN category public.source_category`.
  - `ALTER TABLE public.sources ADD COLUMN crawl_date timestamptz`.
  - `ALTER TABLE public.sources ADD COLUMN license text`.
  - `ALTER TABLE public.sources ADD COLUMN rights_notes text`.
  - `ALTER TABLE public.sources ADD COLUMN attribution text`.
  - Backfill `category` from existing `tier` values.

**1.3** Write migration `20260608000200_url_ingestion_config.sql`:
  - Create `url_ingestion_config` table.
  - Enable RLS.
  - Add admin read policy.
  - Add super_admin write policy.

**1.4** Apply migrations to the online Supabase project (`mbnepcnvjbrtamvwlicl.supabase.co`). Verify with a quick `SELECT column_name FROM information_schema.columns WHERE table_name = 'claims'` to confirm new columns.

---

### Step 2 — API / Service Layer

**2.1** In `src/lib/api/claims.ts`:
  - Update `getClaimsForEntity()`:
    - Add `interpretation_frame`, `is_canonical` to the SELECT.
    - Update ORDER BY to `is_canonical DESC, confidence_score DESC`.
    - Add optional `includeDisputed?: boolean` parameter. When true, run a second query for `status = 'disputed'` claims and return them as `disputedClaims` in the result object.

**2.2** In `src/lib/api/entities.ts`:
  - Update the neighborhood/preview query (or add `getEntityPreviewWithClaims(entityId)`):
    - Join to `claim_entities` → `claims` for the preview, filtered to `status = 'published'`, ordered `is_canonical DESC, confidence_score DESC LIMIT 2`.
    - Return both the entity data and `previewClaims: Claim[]`.

**2.3** In `src/lib/api/admin.ts`:
  - Add `createAdminEntity(data: { name, entity_type, description?, date_era?, date_sort_year?, status })` — INSERT into `entities`, log to `admin_audit_events`.
  - Add `createAdminClaim(data: { content, entity_ids, interpretation_frame?, is_canonical?, status })`:
    - INSERT into `claims`.
    - INSERT into `claim_entities` for each entity_id.
    - If `is_canonical = true`, run conflict check first (see §7.5). Restrict to `super_admin`.
    - Log to `admin_audit_events`.
  - Add `updateClaimInterpretationFrame(id, frame)` — UPDATE claims SET interpretation_frame.
  - Add `setClaimCanonical(id, value)`:
    - If `value = true`: run conflict check, return `{ conflict: true, existingCanonicalClaimId }` if conflict found; accept a `forceReplace: boolean` parameter to unset the old canonical in the same update.
    - Restrict to `super_admin` by checking calling user's role.
    - UPDATE claims SET is_canonical.
  - Add `updateSourceCategory(id, category)`:
    - Derive `tier` from `category`: `primary_rem`/`secondary_rem` → `primary`; all others → `secondary`.
    - UPDATE sources SET category = $1, tier = $2.
  - Add `triggerUrlFetch(sourceId)` — POST to Supabase edge function `trigger-url-fetch`.
  - Add `createUrlIngestionDomain(domain)` — INSERT into `url_ingestion_config`.
  - Add `listUrlIngestionDomains()` — SELECT from `url_ingestion_config`.
  - Modify `createAdminSource()` to accept `category?: source_category` and derive `tier` from it.

---

### Step 3 — Edge Function: `trigger-url-fetch`

**3.1** Create `supabase/functions/trigger-url-fetch/index.ts`.

**3.2** Implementation outline:
```
1. Parse request body: { sourceId }
2. Authenticate: verify admin JWT (same pattern as existing edge functions)
3. Read source from DB: SELECT url, format, pipeline_stage FROM sources WHERE id = sourceId
4. Validate: format must be 'url', pipeline_stage must be 'uploaded'
5. Domain allowlist check: parse URL, extract hostname, query url_ingestion_config WHERE domain = hostname AND enabled = true
6. Fetch: fetch(url, { headers: { 'User-Agent': 'AlexandriaBot/1.0' } })
7. Parse HTML: extract readable text (strip tags, preserve paragraphs)
8. Quality check: word count >= 200; if not, UPDATE sources SET pipeline_stage = 'fetch_failed' (new value or use a metadata field), return error
9. Chunk: split by paragraph or fixed 500-word windows
10. Insert: INSERT INTO chunks (source_id, raw_text, start_index, ...) for each chunk
11. Update: UPDATE sources SET pipeline_stage = 'chunking', crawl_date = now() WHERE id = sourceId
12. Return: { success: true, chunksCreated: N }
```

**3.3** Add `fetch_failed` handling — either a new `pipeline_stage` enum value or a `fetch_error_message` metadata column. Confirm which approach is less disruptive to existing pipeline logic.

**3.4** Deploy function to the Supabase project.

---

### Step 4 — Extraction Review Panel Update

**4.1** In `src/components/admin/ExtractionReviewPanel.tsx`, around the claim edit form (line 210 area):
  - Add `interpretation_frame` `<select>` dropdown with the six enum values plus a "No frame" option.
  - Add `is_canonical` checkbox, rendered only when `currentUser.role === 'super_admin'`.
  - Wire both fields into the item edit state and include them in the `review_extraction_item()` call payload (or the post-confirmation update call).

---

### Step 5 — Claim Manager Update

**5.1** In `src/pages/admin/AdminClaimManagerPage.tsx`:
  - Add `interpretation_frame` column to the table (inline `<select>` that fires `updateClaimInterpretationFrame()` on change).
  - Add `is_canonical` column — badge display for all admins, toggle for `super_admin` only.
  - Add "Create claim" button in the page header linking to `/admin/claims/new`.

---

### Step 6 — Entity Manager Update

**6.1** In `src/pages/admin/AdminEntityManagerPage.tsx`:
  - Add "Create entity" button in the page header linking to `/admin/entities/new`.

---

### Step 7 — New Admin Pages

**7.1** Create `src/pages/admin/AdminEntityNewPage.tsx` with the manual entity creation form (§9.5). Wire to `createAdminEntity()`.

**7.2** Create `src/pages/admin/AdminClaimNewPage.tsx` with the manual claim creation form (§9.6). Wire to `createAdminClaim()`. Include the `is_canonical` conditional visibility for `super_admin`.

**7.3** Add routes for both pages to the admin router.

---

### Step 8 — Source Detail Page Updates

**8.1** In `src/pages/admin/AdminSourceDetailPage.tsx`:
  - Add `source_category` dropdown (fires `updateSourceCategory()`).
  - Display `crawl_date` if set (read-only, formatted date string).
  - Add `license`, `rights_notes`, `attribution` text inputs (optional, no validation).
  - For URL-format sources at `pipeline_stage = 'uploaded'`: render a "Fetch URL" button that calls `triggerUrlFetch()`.
  - Remove or replace the `disabledReason` "not available yet" message.

---

### Step 9 — Entity Detail Page Refactor

**9.1** In `src/pages/entity/EntityDetailPage.tsx`:
  - Replace the flat claims list (lines 148–219) with the sectioned component layout (§9.3).
  - Create a `ClaimSection` component (can live in `src/components/entity/ClaimSection.tsx` or inline).
  - Pass `includeDisputed: true` to `getClaimsForEntity()` and route the `disputedClaims` result to the Disputed Readings section.

---

### Step 10 — Graph Side Panel Update

**10.1** In `src/components/graph/GraphSidePanel.tsx`:
  - Update the data fetch to use `getEntityPreviewWithClaims()` (from Step 2.2).
  - Add the "Key interpretations" subsection after the description block.
  - Render at most 2 claims as compact cards with frame badge and truncated content.

---

### Step 11 — URL Domain Management UI

**11.1** Create `src/pages/admin/AdminUrlDomainsPage.tsx` or add a domain config section to an existing admin settings page.
  - List table from `listUrlIngestionDomains()`.
  - Add domain form wired to `createUrlIngestionDomain()`.
  - Toggle enabled/disabled.
  - Accessible only for `super_admin` role.

**11.2** Add route to admin router. Add link in admin navigation.

---

## 11. Testing Plan

### 11.1 Migration Tests

- After applying migrations, verify:
  - `SELECT interpretation_frame, is_canonical FROM claims LIMIT 1` returns without error (columns exist, values are null/false).
  - `SELECT category, crawl_date FROM sources LIMIT 1` returns without error.
  - Backfill: `SELECT category FROM sources WHERE tier = 'primary'` returns only `primary_rem`.
  - `url_ingestion_config` table exists and RLS is active.

### 11.2 API Function Tests

- `createAdminEntity()`: creates entity, appears in `entities` table, `admin_audit_events` row created.
- `createAdminClaim()`: creates claim, `claim_entities` row created, audit log entry present.
- `setClaimCanonical(id, true)` when no conflict: sets `is_canonical = true`.
- `setClaimCanonical(id, true)` when conflict exists: returns conflict data, does NOT set `is_canonical` without `forceReplace`.
- `setClaimCanonical()` called by `editor` role: returns authorization error.
- `updateSourceCategory(id, 'external_academic')`: sets `category = 'external_academic'` and `tier = 'secondary'`.
- `getClaimsForEntity(entityId, { includeDisputed: true })`: returns `publishedClaims` and `disputedClaims` as separate arrays.

### 11.3 Edge Function Tests

- `trigger-url-fetch` with a domain not in `url_ingestion_config`: returns error.
- `trigger-url-fetch` with a valid URL on an allowlisted domain: creates chunk records, sets `pipeline_stage = 'chunking'`, sets `crawl_date`.
- `trigger-url-fetch` with a URL that returns thin content (< 200 words): returns error, does NOT create chunk records.
- `trigger-url-fetch` on a non-URL-format source: returns validation error.

### 11.4 UI / Integration Tests

- Entity detail page: navigate to an entity with claims having mixed `interpretation_frame` values. Verify each section renders the correct claims. Verify empty sections are not rendered.
- Entity detail page: verify the `is_canonical` claim renders in the "Core Interpretation" section with hero styling.
- Entity detail page: verify disputed claims render only in the "Disputed Readings" section, not mixed into published sections.
- Graph side panel: click a node for an entity with a canonical claim. Verify the claim appears in the "Key interpretations" subsection.
- Admin claim manager: as `super_admin`, set `is_canonical = true` on a claim. Verify it appears correctly on the entity detail page.
- Admin claim manager: as `editor` role, verify the `is_canonical` field is not editable (read-only or hidden).
- Manual entity creation: submit the form with valid data. Verify the entity appears in the entity manager and on the entity list page.
- Manual claim creation: submit the form with valid data attached to an entity. Verify the claim appears on the entity detail page.
- URL fetch: add a domain to `url_ingestion_config`. Navigate to a URL-format source detail page. Click "Fetch URL". Verify the source advances to `pipeline_stage = 'chunking'` and chunks appear.

---

## 12. Acceptance Criteria

- [ ] `interpretation_frame` column exists on `claims` with all 6 enum values available.
- [ ] `is_canonical` boolean exists on `claims`, defaults to `false`.
- [ ] `source_category` enum and column exist on `sources` with all 6 values. Existing rows are backfilled.
- [ ] `crawl_date`, `license`, `rights_notes`, `attribution` columns exist on `sources`.
- [ ] `url_ingestion_config` table exists with RLS restricting writes to `super_admin`.
- [ ] Admins can assign `interpretation_frame` to a claim in both `ExtractionReviewPanel.tsx` and `AdminClaimManagerPage.tsx`.
- [ ] `super_admin` users can set `is_canonical = true` on a claim. `editor` users cannot.
- [ ] Setting `is_canonical = true` when a conflict exists shows a conflict warning and requires confirmation before replacing the previous canonical claim.
- [ ] `EntityDetailPage.tsx` renders claims in named sections by `interpretation_frame`. Empty sections are not rendered.
- [ ] The `is_canonical` claim in "Core Interpretation" is rendered with hero styling and appears first in that section.
- [ ] Disputed claims appear only in the "Disputed Readings" section with a visual disclaimer.
- [ ] `GraphSidePanel.tsx` shows 1–2 key claims below the entity description for entities that have published claims.
- [ ] `/admin/entities/new` form creates a new entity, logs to audit, and redirects to the entity detail page.
- [ ] `/admin/claims/new` form creates a new claim, attaches it to the selected entities, logs to audit, and redirects to the claim detail page.
- [ ] `AdminSourceDetailPage.tsx` shows a `source_category` dropdown that fires an update on change.
- [ ] For URL-format sources at `pipeline_stage = 'uploaded'`, a "Fetch URL" button is visible and functional.
- [ ] The `trigger-url-fetch` edge function creates chunks and advances `pipeline_stage` for a URL on an allowlisted domain.
- [ ] The edge function returns an error (without creating chunks) for a domain not in the allowlist.
- [ ] The edge function returns an error (without creating chunks) for a URL with insufficient content.
- [ ] Domain management UI is accessible to `super_admin` and allows adding/toggling domains.

---

## 13. Risks and Mitigations

### R1. `is_canonical` Becoming Contested

**Risk:** If editors can set `is_canonical`, multiple curators will disagree and the flag will be unstable.

**Mitigation:** Restrict to `super_admin` at the API layer (not just the UI). Enforce in `setClaimCanonical()` by checking `profiles.role`. Document this explicitly in admin onboarding.

### R2. Interpretation Frame Assignment Bottleneck

**Risk:** The `interpretation_frame` column is nullable and most existing claims will have `NULL` after the migration. The "Unframed Claims" section on the entity page may be the dominant section at launch, undermining the interpretive structure.

**Mitigation:** Plan a post-migration batch frame-assignment session. Prioritize assigning frames to canonical and high-confidence claims before public launch. The `AdminClaimManagerPage.tsx` inline `<select>` makes this a fast operation — an admin can bulk-assign frames by filtering to unframed claims and working down the list.

### R3. URL Fetch Returning Paywalled / JavaScript-Rendered Content

**Risk:** Many URLs return thin HTML to bots: paywalls serve a teaser, JavaScript-heavy sites serve empty HTML, and some servers block bots entirely.

**Mitigation:** The 200-word minimum content threshold catches most of these. For JavaScript-rendered sites, the edge function (which runs server-side) will not execute JavaScript. If this is a common source type, a Phase 3 enhancement can add a headless browser step. For Phase 2, thin-content failures should surface a clear error message to the admin: "This URL returned insufficient content. It may require JavaScript rendering or may be behind a paywall."

### R4. Confidence Formula Still Uses Binary `tier` After Category Expansion

**Risk:** Adding `source_category` with 6 values is semantically richer, but the confidence formula still reads `tier`, which remains binary. The full benefit of the expanded categorization is not realized in ranking until the formula is updated.

**Mitigation:** This is explicit and intentional for Phase 2 — keep the formula stable. Document that updating `compute-confidence` to use `source_category` weights is a Phase 3 task. The admin UI will show `source_category` but the confidence impact remains binary until then. No silent regression.

### R5. Manual Claim Creation Bypasses Extraction Quality Controls

**Risk:** Hand-written claims skip the AI extraction review pipeline entirely. There is no AI quality check, no chunked evidence, and no confirmation workflow. Admins could publish low-quality or inconsistent claims directly.

**Mitigation:** Default `status = 'draft'` for manually created claims. Require an explicit publish action. Log all creation and publish events to `admin_audit_events`. Consider requiring a source attachment (even if optional at form time) before publishing a manually created claim.

### R6. Sectioned Entity Page Breaks If No Claims Are Categorized

**Risk:** If all claims are unframed at launch, every entity page shows one section ("Unframed Claims") and the interpretive structure appears to not exist.

**Mitigation:** See R2 mitigation — pre-launch frame assignment sprint. Additionally, ensure the "Unframed Claims" section has a neutral label ("Other Claims") rather than a label that implies missing structure.

### R7. Edge Function Deployment Complexity

**Risk:** Supabase edge functions have a separate deployment flow from the main app and migrations. A deployment failure or environment mismatch could leave the "Fetch URL" button broken without a clear error.

**Mitigation:** Add explicit error handling in `triggerUrlFetch()` on the frontend that surfaces edge function errors to the admin with the raw error message. Test the edge function in the Supabase dashboard before wiring the frontend button.

---

## 14. Out of Scope for Phase 2

The following items are explicitly out of scope. Do not build them during this phase.

- **Blog / site crawling** (`trigger-site-crawl` function, sitemap parsing, internal link following) — Phase 3.
- **Inline media embed on entity/claim pages** (`<InlineMediaPlayer>` component, `<AudioClip>` component) — Phase 3.
- **Entity images** (`image_url`, `hero_image_url` columns on `entities`, `entity-images` storage bucket) — Phase 3.
- **Community accounts, public registration, contributor roles** — Phase 3.
- **Suggestions table and suggestion review queue** — Phase 3.
- **Comment system** — Phase 4.
- **Voting / feedback signals** (`content_votes` table) — Phase 4.
- **Source impact view** (`/admin/sources/:id/impact`) — Phase 1.
- **Confidence override UI** (editable `confidence_override` inputs on manager pages) — Phase 1.
- **Relationship management page** (`/admin/relationships`) — Phase 1.
- **Disputed status button** — Phase 1.
- **Updating the confidence formula** (`compute-confidence` edge function) to weight by `source_category` instead of binary `tier` — Phase 3+.
- **`fair_use_rationale` field or any DRM/copyright enforcement** — Phase 3.

---

## 15. Final Recommendation

Phase 2 is about making the product intellectually legible to the public. The most important single change is the `interpretation_frame` + `is_canonical` schema addition, because it provides the structural backbone that every other Phase 2 feature depends on. Without it, the entity page refactor is just cosmetic, and the graph side panel claims preview has no hierarchy to express.

**Build in this order within Phase 2:**

1. **Migrations first** (Steps 1.1–1.4). Get the columns on the tables before any UI or API work begins. This allows the API and UI work to proceed in parallel without schema blockers.
2. **API layer** (Step 2), including the updated `getClaimsForEntity()` with `interpretation_frame` and `is_canonical`, and all new admin functions.
3. **`ExtractionReviewPanel.tsx` frame selector** (Step 4) — this is the fastest way to start building categorized content immediately, even before the entity page is refactored.
4. **`AdminClaimManagerPage.tsx` updates** (Step 5) — allows bulk frame assignment for existing claims.
5. **Entity detail page refactor** (Step 9) — do this after API and manager updates so there is real categorized data to display.
6. **Graph side panel claims** (Step 10) — depends on the API update from Step 2.2.
7. **Manual entity / claim creation forms** (Steps 7.1–7.3) — independent of the framing work; can be built in parallel.
8. **Source category and detail page updates** (Steps 8.1, 8.2) — independent of framing work; can be built in parallel.
9. **Edge function and URL fetch trigger** (Steps 3, 8.1 URL fetch button) — build last; it has the most unknowns and the other Phase 2 work does not depend on it.
10. **URL domain management UI** (Step 11) — prerequisite for the edge function to be usable; build alongside or immediately after the edge function.

The canonical claim flag (`is_canonical`) is an editorial lever of significant power — it determines what public visitors see first on every entity page. Before enabling it in the UI, confirm with the project owner which user role(s) may set it. The audit recommends `super_admin` only. If that decision changes, the RLS / API enforcement must change accordingly, and the implications for editorial control should be considered carefully.
