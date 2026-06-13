# Mythograph System Audit — 2026-06-07

---

## A. Current System Audit

### A1. Website / Blog Crawling & Ingestion

**Status: Not Implemented**

The URL ingestion pipeline is a deliberate stub. A `url` value exists in the `source_format` enum (`supabase/migrations/20260523010000_enums.sql:16`) and the admin source form accepts URL input (`src/pages/admin/AdminSourceNewPage.tsx:38`), but the code contains explicit deferral notices at lines 226-228 and 404-407 of that same file. The admin API (`src/lib/api/admin.ts:597-602`) returns `disabledReason: 'Automatic URL ingestion is not available yet.'` for any source with `format = 'url'`. No edge function for fetching, parsing, or crawling URLs exists under `supabase/functions/`. URL-format source records are created at `pipeline_stage = 'uploaded'` and remain there permanently.

No crawler, link extractor, sitemap parser, page-type classifier, or bulk article creator exists anywhere in the codebase. The `scripts/` directory contains only `scripts/smokeTest.ts`.

The `sources` table (`supabase/migrations/20260523020000_core_tables.sql:66-85`) stores: `title`, `authors text[]`, `publication_date`, `url`, `tier`. It does not have a `crawl_date` column. Extracted text lives in `chunks.raw_text` post-pipeline, not on the source record itself. Duplicate detection is title-only via a case-insensitive `ilike` check in `adminSourceTitleExists()` (`src/lib/api/admin.ts:1135-1146`); there is no URL uniqueness constraint.

---

### A2. Partial Source Acceptance / Claim-Level Moderation

**Status: Partially Implemented**

The review gate exists and is functionally solid. All AI-extracted content lands in `public.extractions` with `status = 'pending'` and individual item-level `review_status = 'pending'` inside the `extraction_data` jsonb. The `review_extraction_item()` function (`supabase/migrations/20260531130000_review_queue_hardening.sql:417`) is the sole path by which `claims`, `entities`, `source_anchors`, and `relationships` rows are created. Confirmed items are created as `status = 'draft'` and require a second explicit publish action before public visibility.

Admins can reject individual claim or entity items within a chunk without affecting other items in the same extraction. The UI (`src/components/admin/ExtractionReviewPanel.tsx`) supports confirm, edit, reject, merge, and split per item.

**What is missing:**

- No per-chunk accept/reject status column on `chunks` — chunks themselves are immutable once created.
- Relationships have no independent `status` column; their visibility is entirely governed by whether any `claim_ids[]` entry is published. There is no UI to remove a specific claim from a relationship's `claim_ids` array without deleting the claim.
- The `disputed` status exists in the `content_status` enum but cannot be SET via any UI button (`AdminClaimManagerPage.tsx:261` disables the toggle for disputed claims). It can only be filtered on.
- `archived` status is explicitly blocked by `update_claim_status()` (`supabase/migrations/20260531130000_review_queue_hardening.sql:1074-1076`).
- No admin UI to find all claims/entities that originated from a specific source. The chain exists in the DB (`claim_evidence -> source_anchors -> sources`) but is not surfaced anywhere in the UI.
- No `crawl_date` column on `sources`.

---

### A3. Admin Graph Control

**Status: Partially Implemented**

**What works:**

- Entity status toggle (draft/published) via `AdminEntityManagerPage.tsx:326` -> `updateAdminEntityStatus()` (`src/lib/api/admin.ts:918`).
- Claim status toggle (draft/published) via `AdminClaimManagerPage.tsx:261` -> `updateAdminClaimStatus()` (`src/lib/api/admin.ts:1008`).
- Merge and split operations on entities during review (`ExtractionReviewPanel.tsx:881,896`).
- Bulk publish for claims via `publishAdminClaims()` and for sources via `publishAdminSources()`.
- `admin_audit_events` table logs every review and status action with full context.
- Timeline dates (`date_era`, `date_sort_year`) editable post-creation via `updateEntityTimelineDates()` (`src/lib/api/admin.ts:529`).

**What does not exist:**

- No standalone "Create entity" or "Create claim" form outside the AI extraction pipeline. All entities and claims must originate from AI extraction review.
- No hard delete for entities or claims. Archiving claims is explicitly blocked. Entities can only be status-toggled.
- No admin UI for `relationships` at all. Relationships are created as a side effect of claim confirmation (`supabase/migrations/20260531130000_review_queue_hardening.sql:679-715`) and cannot be created, edited, or deleted independently through any application surface — despite the `relationships admin write` RLS policy (`supabase/migrations/20260523040000_rls.sql:82`) technically permitting it at the DB level.
- `confidence_override` columns exist on both `entities` and `claims` (`supabase/migrations/20260523020000_core_tables.sql:17,50`) but no admin UI allows setting them. Admins can only trigger recomputation of the computed `confidence_score`.
- `relationships.weight` exists (`supabase/migrations/20260523020000_core_tables.sql:33`) but is not editable through any admin surface.
- Source `tier` cannot be changed after creation — set only at `createAdminSource()` time.
- No canonical/defining claim flag for entities. No `is_canonical`, `sort_order`, or `display_rank` on any table.

---

### A4. Entity Page Ranking & Interpretations

**Status: Partially Implemented**

**Sorting:**

- Claims on entity pages: `confidence_score DESC` only (`src/lib/api/claims.ts:77`). No secondary sort, no manual ordering.
- Evidence/sources: `created_at ASC` on `source_anchors` insertion order (`src/lib/api/sources.ts:73`).
- Connected entities: alphabetical by `name` (`src/lib/api/entities.ts:143`). Relationship weights are not used for display ordering.

**Confidence computation** (`supabase/functions/compute-confidence/index.ts:87-106`): base `0.18` + `0.22` per primary-tier anchor + `0.12` per secondary-tier anchor + `0.04` per any evidence item. Source tier indirectly affects sort rank through this formula.

**What does not exist:**

- No admin pin/feature capability. No `is_pinned`, `sort_order`, `priority`, or `display_rank` on `claims`, `entities`, or `claim_entities`.
- No interpretation sections or grouping. `EntityDetailPage.tsx:148-219` renders one flat "Claims" list.
- No claim categorization by interpretive frame, tradition, or source tier grouping.
- No mechanism to show `disputed` claims in a separate section — claims with `status != 'published'` are fully excluded from the public query at `src/lib/api/claims.ts:75`.
- No image attachment model exists anywhere in the schema or component tree.
- `featured_connections` (`supabase/migrations/20260527010000_featured_connections.sql`) serves homepage entity-to-entity feature cards only; it is not a claim pinning mechanism.

---

### A5. Graph Node Popup / Detail Card

**Status: Partially Implemented**

Clicking a graph node fires `setActiveNodeId` in `GraphCanvas.tsx:233` (2D) and `GraphCanvas3D.tsx:148` (3D). This opens a right-side sheet drawer (`src/components/graph/GraphSidePanel.tsx`) implemented via Radix UI Dialog at `min(88vw, 320px)` width.

**What the panel shows:**

- Entity name as `SheetTitle` (line 102)
- Entity type as `EntityBadge` (line 99)
- Description paragraph (line 111)
- `AttestationBar` with confidence score and source count (lines 106-109)
- Top 3 connected entities by relationship weight as `EntityChip` links (lines 119-132)
- "View full entry" link to `/entity/:slug` (lines 138-144)

**What the panel does not show:**

- Top claims — none rendered in the side panel
- Primary sources — only inferred source count shown
- Images — no image rendering exists anywhere in the codebase
- Audio or video excerpts — no media components exist
- Comments or discussion links — no comment system exists

The full entity page (`src/pages/entity/EntityDetailPage.tsx`) reachable via "View full entry" is a complete encyclopedia page with markdown prose, claims list, sources list via `SourceAnchorRow`, connected entities, and a `MiniGraph` sidebar. There is no in-place expansion of the side panel itself.

---

### A6. Community Roles & Permissions

**Status: Not Implemented (for community features)**

Three roles exist in the `public.admin_role` enum (`supabase/migrations/20260523010000_enums.sql:38`): `super_admin`, `editor`, `viewer`. These live on `public.profiles.role` (`supabase/migrations/20260523020000_core_tables.sql:5`, default `viewer`).

`is_admin()` (`supabase/migrations/20260523040000_rls.sql:10`) returns true for both `super_admin` and `editor`. `has_internal_access()` (line 25) returns true for all three roles. No policy distinguishes `super_admin` from `editor` — they are functionally identical.

There is no public user registration path. There is no member, contributor, or trusted-user role. Public visitors are anonymous read-only consumers. All write operations on every table require `is_admin()`. No submissions, suggestions, or user-generated content pathway exists.

---

### A7. Discussion / Comment System

**Status: Not Implemented**

No `comments`, `discussions`, `threads`, `votes`, `suggestions`, `reactions`, or `user_submissions` table exists in any migration. No comment or discussion components exist anywhere in `src/components/` or `src/pages/`. `EntityDetailPage.tsx`, `ClaimDetailPage.tsx`, and `src/pages/sources/SourceDetailPage.tsx` contain no comment UI. No upvote, like, or reaction system exists.

---

### A8. Voting / Feedback Signals

**Status: Not Implemented**

No table, column, enum, RPC, service function, or UI component for any user-facing voting, liking, flagging, or reaction signal exists anywhere in the codebase. The admin review queue ordering is purely chronological (`min(extractions.created_at)`, `supabase/migrations/20260531130000_review_queue_hardening.sql:911`). Public claim ordering is `confidence_score DESC` (`src/lib/api/claims.ts:77`), driven entirely by the computed confidence formula — no user signal touches any ranking path.

---

### A9. REM Theory Framing / Canonical Tagging

**Status: Not Implemented**

The data model is framework-neutral. No `interpretation_frame`, `theory_tag`, `claim_type`, `claim_category`, `is_canonical`, or equivalent column exists on any table. The `source_tier` enum has exactly two values (`primary`, `secondary`), which map loosely to "core REM group material" vs "everything else" by UI label convention only — not enforced semantically by the schema. The `content_status` enum includes `disputed` but there is no canonical/non-canonical flag and no way to attach claims to different interpretive frames. All published claims on an entity appear as one undifferentiated flat list.

---

### A10. Media-Rich Entity Pages

**Status: Partially Implemented (at the source level only)**

**What works:**

- The `source-files` storage bucket (`supabase/migrations/20260530060000_source_files_bucket.sql`) is private, supports 1 GB files, and allows a comprehensive list of audio and video MIME types.
- `source_anchors` (`supabase/migrations/20260523020000_core_tables.sql:87-109`) stores `start_timestamp_sec` and `end_timestamp_sec`.
- `SourceDetailPage.tsx` implements a media player with `#t-{seconds}` hash seeking (`src/pages/sources/SourceDetailPage.tsx:57-72`).
- `TranscriptViewer.tsx` assigns `id="t-${chunk.start_sec}"` to chunks and `SourceAnchorRow.tsx` generates deep links to `/source/${id}#t-${seconds}`.

**What does not exist:**

- No image or media columns on `entities` or `claims`. No storage bucket for entity images.
- No inline media embed on `EntityDetailPage.tsx` or `ClaimDetailPage.tsx`. `SourceAnchorRow` is text-only citation links.
- No `<audio>`, `<video>`, or image component in `src/components/` outside of `SourceDetailPage.tsx`.
- No admin UI to attach media directly to an entity or claim.
- No copyright, license, or attribution field on any table.
- No watermarking or DRM beyond 1-hour signed URLs.

---

## B. Gap Analysis

The following gaps are ordered by severity relative to the stated product vision of a curated, interpretively structured knowledge graph with community engagement.

### Critical (blocks safe use of the system at scale)

**B1. No URL/web ingestion pipeline.** The system cannot process the most common source format in modern research. Every external article, blog post, or web resource must be manually cataloged as a stub and then nothing. The pipeline literally cannot advance URL-format sources past `pipeline_stage = 'uploaded'`. Before uploading large volumes of source material, this must be clarified: are web sources in scope or not? If yes, a URL fetch-and-chunk edge function is needed before any web URLs are added.

**B2. No source-level impact view.** Admins cannot currently answer "what did this source contribute to the graph?" There is no UI showing all entities and claims that originated from a given source, even though the DB chain exists (`claim_evidence -> source_anchors -> sources`, `entity_source_anchors`). This is critical for source quality control at scale — if a bad source is ingested, finding and removing all its downstream effects requires manual DB queries.

**B3. No interpretive framing layer.** The product vision implies distinguishing canonical REM theory interpretations from supporting context, disputed readings, and external academic framing. The current schema has no mechanism for this. All published claims on an entity are one flat list. There is no `interpretation_frame`, no canonical flag, no grouping by tradition or framework. This is a fundamental data model gap, not a UI gap.

### High (degrades product quality significantly)

**B4. No confidence override UI.** The `confidence_override` columns exist on both `entities` and `claims` but no admin UI accesses them. Admins cannot manually promote an important but under-evidenced claim or demote a spurious high-confidence one. The only recourse is triggering automatic recomputation.

**B5. No relationship management UI.** Relationships are created as side effects and cannot be directly inspected, corrected, or removed through any admin surface. If the AI extraction creates a spurious relationship between two entities, the only way to remove it is to un-publish all claims referencing that relationship — which may have other legitimate uses.

**B6. Disputed status is orphaned.** `disputed` exists in the `content_status` enum and appears in the admin filter UI, but there is no button to SET a claim or entity to disputed, and disputed content is fully excluded from public display rather than shown in a dedicated section. The status is functionally unreachable through normal admin workflows.

**B7. Source tier is immutable post-creation.** If an admin miscategorizes a source as primary vs secondary, there is no correction path through the UI. Since tier influences confidence scores for all downstream claims and entities, a misclassified source contaminates all rankings it affects.

### Medium (affects product completeness)

**B8. No manual entity/claim creation.** Everything must originate from AI extraction. Admins cannot create a stub entity for a known important figure, cannot write a claim by hand, and cannot add a relationship they know to be true. The system is entirely dependent on the AI pipeline as the entry point.

**B9. Graph side panel shows no claims.** The primary interactive surface for most users (the graph) shows entity metadata but no claims. A user clicking a node cannot see any interpretive content without navigating to the full entity page. This is a significant engagement gap.

**B10. No community layer at all.** No user accounts, no comments, no suggestions, no voting, no feedback. The product is currently admin-curated and read-only for the public. For a knowledge graph aspiring to community engagement, this is a complete absence rather than a gap.

**B11. Media not embeddable on entity pages.** Timestamps work at the source level, but entity and claim pages cannot show inline audio clips or images. The infrastructure (signed URLs, timestamp anchors) is ready; the front-end embed components do not exist.

---

## C. Recommended Product Design

### C1. Website / Blog Crawling

Build a URL ingestion edge function (`supabase/functions/trigger-url-fetch/index.ts`) that: fetches the URL, extracts readable content via a library like Mozilla Readability (or an LLM-based extraction call), stores the result as a text chunk on the source record, and advances `pipeline_stage` to `chunking`. Add a configurable domain allowlist in a `url_ingestion_config` table to prevent arbitrary external requests. For blog crawls (root domain -> all articles), add a separate `trigger-site-crawl` function that reads the sitemap or follows internal links one level deep and creates one source record per article URL. Critically, every discovered URL should create an `extraction_type = 'url_crawl'` source record in `pending` state — admins review before any content enters the pipeline.

Duplicate detection should be URL-based (normalized URL unique constraint on `sources`) in addition to the existing title check.

### C2. Partial Source Acceptance

Add a `source_impact_view` page under `/admin/sources/:id/impact` that queries the full provenance chain and shows all entities, claims, and relationships that originated from a given source, with bulk-unpublish and bulk-reject controls. Add a "Remove from graph" action that sets all downstream claims to `draft` in one operation. Wire the `disputed` status to a real "Mark disputed" button in `AdminClaimManagerPage.tsx`. Remove the archive block in `update_claim_status()` and allow proper archiving as a terminal state distinct from draft.

### C3. Admin Graph Control

Add a standalone entity creation form (outside the pipeline) for creating stub entities with a name, type, and description. Add a standalone claim creation form for writing claims by hand and attaching them to entities. Add a relationships management table under `/admin/relationships` with create, edit-weight, and delete capabilities. Wire `confidence_override` to an editable input in both the entity and claim manager pages. Make source tier editable post-creation via a dropdown on `AdminSourceDetailPage.tsx`.

### C4. Interpretive Framing

Add an `interpretation_frame` enum: `canonical_rem`, `supporting_context`, `external_academic`, `historical`, `literary`, `disputed_alternative`. Add this as a column on `claims`. On the entity detail page, group claims by frame — show the canonical interpretation first, then supporting context, then alternative readings. Admins assign the frame either at review time or via the claim manager. This is the single most important schema addition for expressing the product's intellectual identity.

### C5. Entity Page & Graph Node

Add claim display to `GraphSidePanel.tsx` — show the top 1-2 canonical claims directly in the drawer. Add an image column to `entities` (`image_url text`) backed by a public `entity-images` storage bucket. Add inline audio/video clip embedding on `ClaimDetailPage.tsx` using the existing timestamp anchor infrastructure — the signed URL and seek logic already work at the source level. Add an `<AudioClip>` component that fetches a signed URL and seeks to the anchor timestamps on mount.

### C6 & C7. Community Roles & Discussions

For a first community layer: add `public`, `contributor`, `trusted_contributor`, `editor`, `super_admin` roles. Add a `suggestions` table where public users can propose new claims or flag existing ones for review. Suggestions enter an admin review queue identical to the AI extraction queue. Add a `comments` table attached to `entities`, `claims`, and `sources` with pre-moderation (comments not visible until admin approves). Build comment display as a collapsible section at the bottom of each entity/claim/source page.

### C8. Voting / Feedback

Add a `content_votes` table with `user_id`, `target_type`, `target_id`, `value` (+1 / -1 / flag). Do not let votes directly affect `confidence_score` — instead expose vote aggregates as a separate `community_score` signal that admins can optionally promote to `confidence_override`. This keeps canonical rankings admin-controlled while surfacing community signal.

### C9. REM Theory Framing (canonical tagging)

The `interpretation_frame` column on claims (see C4) handles most of this. Additionally, add `is_canonical boolean default false` to `claims` to allow admins to designate the single most important claim for each entity — this claim would be shown first regardless of `confidence_score`. Add `source_category` enum values beyond the current binary tier: `primary_rem`, `secondary_rem`, `external_academic`, `historical_record`, `literary_artistic`.

### C10. Media-Rich Entity Pages

Add `image_url text` and `hero_image_url text` to `entities`. Create a public `entity-images` storage bucket. Add `<InlineMediaPlayer>` component that accepts a `source_anchor` record and renders an `<audio>` or `<video>` element seeked to the anchor's timestamps, with signed URL fetched on mount. Add copyright/license fields to `sources`: `license text`, `rights_notes text`, `attribution text`. Surface these on `SourceDetailPage.tsx` and in citation formatting.

---

## D. Implementation Plan

### Phase 1: Must fix before uploading lots of source material

These are blockers. If you ingest a large source corpus without these in place, you will create a graph you cannot clean up.

**1.1 Source impact view.** Build the `/admin/sources/:id/impact` page that shows every entity and claim downstream of a source, with bulk unpublish. This is the emergency stop button for bad sources. Without it, a single bad source is very hard to remediate at scale.

**1.2 Source tier editability.** Make `sources.tier` editable on `AdminSourceDetailPage.tsx`. A misclassified primary/secondary source contaminates confidence scores for every entity it touches.

**1.3 Wire `confidence_override`.** Add editable number inputs for `confidence_override` on both `AdminEntityManagerPage.tsx` and `AdminClaimManagerPage.tsx`. This is the only way for admins to correct AI-computed rankings without re-running the entire confidence pipeline.

**1.4 Disputed status button.** Add a "Mark disputed" action to `AdminClaimManagerPage.tsx` and `AdminEntityManagerPage.tsx`. The enum value already exists; it just needs a button.

**1.5 URL deduplication constraint.** Add a `UNIQUE` constraint on `sources.url` (normalized, e.g., lowercased, trailing slash stripped) before any URL-format sources are created. Without this, re-crawls will create duplicate source records.

**1.6 Relationship management page.** Build `/admin/relationships` with a paginated table of all relationship rows, showing the two entity endpoints, type, weight, and backing claim count. Add soft-delete (cascade to `claim_ids` cleanup or tombstone) and weight editing.

### Phase 2: Should build before public/community launch

**2.1 `interpretation_frame` enum and claim column.** This is the core schema change for expressing the product's intellectual identity. Add it to the DB, wire it into `review_extraction_item()` as an optional field, and add a frame selector to `ExtractionReviewPanel.tsx` and `AdminClaimManagerPage.tsx`.

**2.2 `is_canonical` flag on claims.** One boolean per entity's top claim. Shown first on entity page regardless of `confidence_score`.

**2.3 Entity page claim grouping.** Update `EntityDetailPage.tsx` to group claims by `interpretation_frame` instead of a flat list. Show canonical claim in a hero section.

**2.4 Side panel claim preview.** Add top 2 claims (preferring `is_canonical = true`) to `GraphSidePanel.tsx`.

**2.5 Manual entity/claim creation forms.** Standalone forms outside the AI pipeline so admins can create stub entities and hand-written claims.

**2.6 `source_category` expansion.** Extend `source_tier` or add a separate `source_category` enum with `primary_rem`, `secondary_rem`, `external_academic`, `historical_record`, `literary_artistic`. Update `AdminSourceNewPage.tsx` and confidence weighting.

**2.7 URL ingestion edge function.** Build `trigger-url-fetch` for single-URL processing so URL-format sources can actually advance through the pipeline.

### Phase 3: Can build after launch

**3.1 Blog/site crawling.** The `trigger-site-crawl` function with sitemap parsing and internal link following, creating one source record per article URL, entering the admin review queue.

**3.2 Inline media embed on entity/claim pages.** `<InlineMediaPlayer>` component using existing signed URL and timestamp infrastructure.

**3.3 Entity images.** `image_url` column on `entities`, public `entity-images` bucket, image display on `EntityDetailPage.tsx` and `GraphSidePanel.tsx`.

**3.4 Copyright/license fields.** `license`, `rights_notes`, `attribution` columns on `sources`. Surface in `SourceDetailPage.tsx` and citation formatting.

**3.5 Community accounts and suggestion workflow.** Public user registration, `suggestions` table, suggestion review queue feeding into the existing extraction review UI.

### Phase 4: Nice-to-have later

**4.1 Comment system.** Pre-moderated comments on entity/claim/source pages.

**4.2 Voting/feedback signals.** `content_votes` table, community score display separate from canonical confidence score.

**4.3 Admin review prioritization.** Let vote counts or admin flags surface high-priority items to the top of the extraction review queue.

**4.4 Entity relationship visualization on claim pages.** Show a mini-graph centered on the claim's entities instead of just text.

---

## E. Database / Schema Changes

### E1. URL deduplication on sources

```sql
-- Normalize and deduplicate URLs
CREATE UNIQUE INDEX sources_url_normalized_unique
  ON public.sources (lower(regexp_replace(url, '/$', '')))
  WHERE url IS NOT NULL;
```

### E2. Interpretive framing enum and column

```sql
-- New enum for interpretive frames
CREATE TYPE public.interpretation_frame AS ENUM (
  'canonical_rem',
  'supporting_context',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'disputed_alternative'
);

-- Add to claims
ALTER TABLE public.claims
  ADD COLUMN interpretation_frame public.interpretation_frame,
  ADD COLUMN is_canonical boolean NOT NULL DEFAULT false;

-- Partial index: at most one canonical claim per entity
-- (enforced at app level; use a unique partial index as a soft guard)
-- Note: claims link to entities via claim_entities; true single-canonical
-- enforcement requires a trigger or application-level constraint.
```

### E3. Source category expansion

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

-- Backfill from tier
UPDATE public.sources SET category =
  CASE tier
    WHEN 'primary' THEN 'primary_rem'::public.source_category
    WHEN 'secondary' THEN 'secondary_rem'::public.source_category
  END;
```

### E4. Entity image and canonical display fields

```sql
ALTER TABLE public.entities
  ADD COLUMN image_url text,
  ADD COLUMN hero_image_url text;
```

### E5. Suggestions table (Phase 3)

```sql
CREATE TABLE public.suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid REFERENCES auth.users(id),
  target_type text NOT NULL CHECK (target_type IN ('entity','claim','source','new_entity','new_claim')),
  target_id uuid,
  suggestion_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','needs_clarification')),
  reviewer_id uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX suggestions_status_idx ON public.suggestions(status, created_at);
CREATE INDEX suggestions_target_idx ON public.suggestions(target_type, target_id);

-- RLS
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suggestions public insert" ON public.suggestions
  FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "suggestions admin read" ON public.suggestions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "suggestions admin update" ON public.suggestions
  FOR UPDATE TO authenticated USING (public.is_admin());
```

### E6. Content votes table (Phase 4)

```sql
CREATE TABLE public.content_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  target_type text NOT NULL CHECK (target_type IN ('entity','claim','source')),
  target_id uuid NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX content_votes_target_idx ON public.content_votes(target_type, target_id);

ALTER TABLE public.content_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes authenticated insert" ON public.content_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "votes own update" ON public.content_votes
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "votes public read" ON public.content_votes
  FOR SELECT USING (true);
```

### E7. Source tier editability

No schema change needed. The restriction is entirely in the UI. The column is `source_tier` and supports UPDATE at the DB level. Just add the mutation in `src/lib/api/admin.ts` and a dropdown to `AdminSourceDetailPage.tsx`.

### E8. Disputed status for claims — fix the blocked workflow

```sql
-- Replace update_claim_status() to allow 'disputed' transitions
-- (patch to existing function in 20260531130000_review_queue_hardening.sql)
-- Add 'disputed' as a valid target status alongside 'draft' and 'published'
-- Remove or relax the archive block to allow archiving as a terminal state
```

The function signature stays the same; only the status validation logic inside it needs updating.

### E9. Relationship soft-delete

```sql
ALTER TABLE public.relationships
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.profiles(id);

-- Update public read RLS to exclude archived relationships
-- (patch existing policy in 20260531130000_review_queue_hardening.sql)
```

---

## F. UI / UX Changes

### F1. Source Impact View (new page)

**Route:** `/admin/sources/:id/impact`

**Components needed:**
- `AdminSourceImpactPage.tsx` — lists all entities, claims, and relationships downstream of the source, grouped by type, with individual and bulk unpublish/archive controls.
- Query: join `sources -> source_anchors -> claim_evidence -> claims -> claim_entities -> entities` and `sources -> source_anchors -> entity_source_anchors -> entities`.

### F2. Relationship Manager (new page)

**Route:** `/admin/relationships`

**Components needed:**
- `AdminRelationshipManagerPage.tsx` — paginated table showing `from_entity`, `to_entity`, `type`, `weight`, `claim count`, `status`. Actions: edit weight, archive, view backing claims.

### F3. Confidence Override Inputs

**Changes to existing pages:**
- `AdminEntityManagerPage.tsx`: add an editable `<input type="number" min="0" max="1" step="0.01">` for `confidence_override` next to the displayed score. On blur, call a new `updateEntityConfidenceOverride()` function in `src/lib/api/admin.ts`.
- `AdminClaimManagerPage.tsx`: same pattern for claims.

### F4. Disputed Status Button

**Changes to existing pages:**
- `AdminClaimManagerPage.tsx:261`: add a "Mark disputed" button alongside the existing publish/draft toggle. Wire to `updateAdminClaimStatus(id, 'disputed')`. Remove the `disabled` condition for the disputed case.
- Same for `AdminEntityManagerPage.tsx`.

### F5. Entity Page Interpretation Sections

**Changes to `EntityDetailPage.tsx`:**
- Replace the flat claims list with a sectioned layout:
  - "Core Interpretation" section (claims where `is_canonical = true` or `interpretation_frame = 'canonical_rem'`)
  - "Supporting Context" section (`interpretation_frame = 'supporting_context'`)
  - "External Academic Perspectives" section (`interpretation_frame = 'external_academic'`)
  - "Disputed Readings" section (claims with `status = 'disputed'`, shown with a visual distinction and a disclaimer)
- Each section collapses if empty.

**Changes to `src/lib/api/claims.ts`:**
- Update `getClaimsForEntity()` to include `interpretation_frame`, `is_canonical`, and optionally return `disputed` claims in a separate field.

### F6. Graph Side Panel Claims Preview

**Changes to `GraphSidePanel.tsx`:**
- After the existing description paragraph, add a "Key interpretations" subsection showing 1-2 claims (prefer `is_canonical = true`, fall back to top `confidence_score`).
- Update `src/lib/api/entities.ts` neighborhood query or add a new `getEntityPreview()` function that fetches the entity + top claims in one call.

### F7. Source Tier / Category Edit

**Changes to `AdminSourceDetailPage.tsx`:**
- Add a `<select>` for `category` (or `tier` until the new enum is added) that fires a `updateSourceCategory()` call.

### F8. Frame Selector in Review Panel

**Changes to `ExtractionReviewPanel.tsx`:**
- Add an `interpretation_frame` dropdown to the claim edit form (line 210 area), defaulting to `null` (unset). Admins can assign a frame during review or leave it for later.

### F9. Inline Media Player Component (Phase 3)

**New component:** `src/components/source/InlineMediaPlayer.tsx`
- Props: `sourceId`, `startSec`, `endSec`, `format` (`'audio' | 'video'`).
- On mount: fetches signed URL via `getSignedSourceFileUrl()`, renders `<audio>` or `<video>` element, seeks to `startSec`.
- Used in `ClaimDetailPage.tsx` evidence section and eventually on `EntityDetailPage.tsx` when anchor timestamps are present.

---

## G. Risk Notes

### G1. Bad Sources Polluting the Graph

**Current exposure:** The two-stage gate (extraction review + publish) is solid for AI-extracted content. The real risk is a misclassified source tier (primary vs secondary) contaminating confidence scores for every entity the source touches, with no correction path in the UI. A second risk is that once a source is published and its downstream claims are published, there is no "undo all" operation — you have to find and unpublish every claim manually.

**Mitigation:** The source impact view (Phase 1 item 1.1) is the most important single addition. Source tier editability (Phase 1 item 1.2) closes the contamination vector. For URL sources specifically: do not allow URL-format sources to advance through the pipeline until the URL fetch function exists, the domain allowlist is configured, and every fetched article enters admin review as `pipeline_stage = 'review'` before any extraction runs.

### G2. Community Suggestions Overwriting Canonical Content

**Current exposure:** Does not exist yet, but must be designed correctly before any public user system is built.

**Mitigation:** Suggestions must enter a completely separate `suggestions` table and review queue. They must NEVER directly update `claims`, `entities`, or `relationships`. Admin approval must be an explicit action that creates new draft content from the suggestion, which then goes through the normal publish gate. The `is_canonical` flag on claims should be settable only by `super_admin`, not `editor`, preventing lower-privilege editors from altering canonical interpretation.

### G3. Unclear Ranking of Interpretations

**Current exposure:** High. The flat `confidence_score DESC` list on entity pages creates no narrative hierarchy. A claim with four secondary-tier sources will outrank a hand-curated canonical claim with one primary source. Admins have no way to correct this without setting `confidence_override` (which has no UI).

**Mitigation:** The `interpretation_frame` + `is_canonical` additions (Phase 2) are the correct fix. `is_canonical` bypasses confidence sorting entirely for the top position. The `confidence_override` UI (Phase 1) provides an immediate workaround before framing is built. Until these are in place, any published claim's visible position is determined by the AI confidence formula alone.

### G4. Copyright Issues with Media

**Current exposure:** Moderate and growing with scale. The private `source-files` bucket with 1-hour signed URLs provides basic access control. However, there are no copyright, license, or attribution fields on `sources`. The UI acknowledges external material is being ingested (the "URL sources are saved for cataloging" warning) but provides no rights management. At small scale this is a documentation gap; at large scale with community users accessing transcripts and excerpts it becomes a legal exposure.

**Mitigation:** Add `license`, `rights_notes`, and `attribution` columns to `sources` before public launch (Phase 2). Display attribution on `SourceDetailPage.tsx` and in `SourceAnchorRow.tsx` citations. For audio/video: the signed URL 1-hour window is appropriate for private internal use but should be reviewed if the platform becomes publicly accessible. Transcript excerpts displayed on claim pages are likely fair use; full transcript display on `TranscriptViewer.tsx` for copyrighted material is a higher-risk surface that should have a `fair_use_rationale` field.

### G5. Graph Becoming Too Dense / Confusing

**Current exposure:** The graph renderer supports both 2D (`GraphCanvas.tsx`, Sigma.js) and 3D (`GraphCanvas3D.tsx`, force-graph) modes. Entity positions are stored in `entities.position_x/y` but the 3D renderer uses physics simulation. As the graph grows past a few hundred nodes, the force layout will produce an unreadable hairball.

**Mitigation:** `featured_connections` (`supabase/migrations/20260527010000_featured_connections.sql`) exists for curated homepage highlights. Extend this concept to graph display: add a `display_weight_override` on `relationships` that the graph renderer uses instead of `weight` for layout purposes. Add graph filtering by entity type and relationship type (UI controls already exist structurally on `GraphPage.tsx`). Add a "neighborhood" mode that defaults to showing only the immediate neighbors of the selected node.

### G6. Source Crawling Importing Junk Pages

**Not yet relevant since crawling is not implemented.** When it is built, the primary risks are: navigation pages (category/tag/author/archive), pagination pages, login walls, paywalled content returning a preview, and JavaScript-rendered pages returning empty HTML.

**Mitigation:** Implement a page quality check in `trigger-url-fetch` before creating any extraction record: check that extracted readable content is above a minimum word count threshold (suggest 200 words), that the URL does not match common non-article patterns (`/tag/`, `/author/`, `/page/`, `/category/`), and that the content does not contain paywall signals. Every crawled URL should create a source record in `pipeline_stage = 'review'` — admins approve before extraction runs. Do not auto-advance crawled sources.

### G7. AI Extraction Creating False Claims

**Current exposure:** The two-stage gate (review + publish) is the correct mitigation and it is fully implemented. The risk is admin fatigue: if the review queue grows faster than admins can process it, pressure builds to approve quickly without careful reading.

**Mitigation:** Do not trigger extraction on a source until it has been explicitly approved by an admin after transcription review. Implement a pre-extraction source quality check where the admin reads the transcript summary before queuing extraction. Add an extraction confidence threshold: items below a minimum confidence signal should be flagged with higher visual weight in `ExtractionReviewPanel.tsx`. Consider batch size limits: process at most N extractions per source per review session to prevent fatigue-driven rubber-stamping. The existing `admin_audit_events` table already provides the audit trail for accountability.

---

## H. Final Recommendation

**Stop ingesting new sources until four specific things are built. Then build interpretation framing before the public launch.**

The system's extraction pipeline, review queue, and publication gate are architecturally sound. The review workflow in `ExtractionReviewPanel.tsx` backed by `review_extraction_item()` is the right design. The problem is that you are about to pour source material into a pipeline that:

1. Has no "undo all" for a bad source (no source impact view)
2. Cannot correct a misclassified source tier after the fact (tier is immutable post-creation)
3. Has no way to manually adjust confidence scores (override columns exist, no UI)
4. Has no interpretive framing (all published claims are one undifferentiated list)

If you ingest 50+ sources before fixing items 1-3, cleaning up a bad actor source will require manual database queries tracing through five join tables. That is not sustainable.

**Build in this exact order:**

**Week 1-2 (before any more source ingestion):**
- Source impact view (`/admin/sources/:id/impact`) — the emergency rollback mechanism
- Source tier editability on `AdminSourceDetailPage.tsx`
- Confidence override input fields on entity and claim manager pages
- "Mark disputed" button on both manager pages
- URL uniqueness constraint on `sources.url`

**Week 3-4 (before public launch):**
- `interpretation_frame` enum and column on `claims`
- `is_canonical` boolean on `claims`
- Updated `EntityDetailPage.tsx` with sectioned claim display
- Frame selector in `ExtractionReviewPanel.tsx`
- Relationship management page

**Week 5-6 (before public launch):**
- Copyright/license fields on `sources`
- `source_category` enum expansion beyond primary/secondary binary
- Side panel claim preview in `GraphSidePanel.tsx`

Do not build community accounts, comments, or voting until the curator-side controls are fully operational. A comment system built on top of an unframed, uncategorized, confidence-score-sorted claim list will produce chaos. The canonical layer must exist first — then community discussion can reference it meaningfully.

The one decision that needs to be made explicitly before Phase 2 begins: **who can set `is_canonical` on a claim?** This single boolean is what distinguishes the authoritative REM interpretation from everything else on an entity page. If it can be set by any editor, it will be contested. Recommend restricting it to `super_admin` only via a specific RLS policy or function check, making it an editorial act of deliberate curation rather than a routine admin operation.
