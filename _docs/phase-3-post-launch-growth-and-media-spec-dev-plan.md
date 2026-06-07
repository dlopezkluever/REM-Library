# Phase 3 — Post-Launch Growth and Media
## Spec and Dev Plan

**Phase label:** Can build after launch
**Prerequisite:** Phase 1 (admin controls and safety) and Phase 2 (interpretive framing and canonical structure) must be complete and stable before beginning this phase.

---

## 1. Executive Summary

Phase 3 extends the system from a manually-curated knowledge graph into a platform capable of processing web sources at scale, presenting rich media context inline on entity and claim pages, and accepting structured community input through a moderated suggestion workflow.

The four major work tracks are:

1. **Blog/site crawling** — automated discovery and ingestion of article URLs from external sites, with a domain allowlist and an admin review gate before any content enters the pipeline
2. **Inline media embeds** — `<InlineMediaPlayer>` component that renders audio/video excerpts seeked to `source_anchor` timestamps directly on entity and claim pages
3. **Entity images** — `image_url` and `hero_image_url` on the entities table, a public `entity-images` storage bucket, and image display on the entity detail page and graph side panel
4. **Source rights metadata + community suggestions** — `license`, `rights_notes`, and `attribution` columns on sources, plus a `suggestions` table and admin review flow for public user-submitted content proposals

None of these features require changes to the core extraction pipeline, the review queue structure, or the canonical framing layer built in Phase 2. They extend the platform's surface area without touching the graph's editorial core.

---

## 2. Current State Relevant to Phase 3

### 2.1 URL Ingestion (Stub)

The URL pipeline is deliberately deferred:

- `url` is a valid value in the `source_format` enum (`supabase/migrations/20260523010000_enums.sql:16`)
- `AdminSourceNewPage.tsx:38` accepts URL input in the source creation form
- Explicit deferral notices appear at `AdminSourceNewPage.tsx:226-228` and `AdminSourceNewPage.tsx:404-407`
- `src/lib/api/admin.ts:597-602` returns `disabledReason: 'Automatic URL ingestion is not available yet.'` for any source with `format = 'url'`
- No edge function for fetching, parsing, or crawling URLs exists under `supabase/functions/`
- URL-format source records are created at `pipeline_stage = 'uploaded'` and remain there permanently
- No crawler, sitemap parser, link extractor, page-type classifier, or bulk article creator exists anywhere in the codebase
- `scripts/` contains only `scripts/smokeTest.ts`

**Duplicate detection gap:** `adminSourceTitleExists()` (`src/lib/api/admin.ts:1135-1146`) uses a case-insensitive `ilike` check on title only. There is no `UNIQUE` constraint on `sources.url`. Re-crawling a domain will create duplicate source records.

### 2.2 Media Infrastructure (Partial — source level only)

What already works:

- `source-files` storage bucket (`supabase/migrations/20260530060000_source_files_bucket.sql`) — private, 1 GB file limit, allows all common audio and video MIME types
- `source_anchors` (`supabase/migrations/20260523020000_core_tables.sql:87-109`) stores `start_timestamp_sec` and `end_timestamp_sec`
- `SourceDetailPage.tsx:57-72` implements a media player with `#t-{seconds}` hash-based seeking
- `TranscriptViewer.tsx` assigns `id="t-${chunk.start_sec}"` to transcript chunks
- `SourceAnchorRow.tsx` generates deep links to `/source/${id}#t-${seconds}`
- Signed URL generation infrastructure exists (used for source file access)

What does not exist:

- No `<audio>`, `<video>`, or image component in `src/components/` outside `SourceDetailPage.tsx`
- No inline media embed on `EntityDetailPage.tsx` or `ClaimDetailPage.tsx`
- No image column on `entities` or `claims`
- No public storage bucket for entity images
- No `InlineMediaPlayer` or `AudioClip` component

### 2.3 Source Rights Metadata (Missing)

- No `license`, `rights_notes`, `attribution`, or `crawl_date` column on `sources`
- `SourceDetailPage.tsx` displays no attribution or rights information
- `SourceAnchorRow.tsx` generates citation links with no rights context
- Full transcript display on `TranscriptViewer.tsx` for copyrighted material is a legal exposure at scale

### 2.4 Community Layer (Not Implemented)

- No public user registration path
- Three roles exist (`super_admin`, `editor`, `viewer`) but `is_admin()` treats `super_admin` and `editor` identically — they are functionally the same
- No `member`, `contributor`, or `trusted_contributor` role
- All write operations on every table require `is_admin()`
- No `suggestions`, `comments`, `votes`, `threads`, `reactions`, or `user_submissions` table in any migration
- No comment or submission components anywhere in `src/components/` or `src/pages/`
- `EntityDetailPage.tsx`, `ClaimDetailPage.tsx`, and `SourceDetailPage.tsx` contain no community UI

---

## 3. Phase 3 Goals

1. Enable the system to ingest web sources (single URLs and entire blog/site domains) at scale without manual copy-paste per article
2. Make entity and claim pages media-rich — show inline audio/video clips seeked to relevant timestamps when `source_anchor` records exist
3. Give entities visual identity — a profile image and optional hero image displayed on the entity detail page and graph side panel
4. Attach rights and attribution metadata to sources before the transcript and excerpt surface area grows further
5. Open a structured community contribution channel: public users can propose new claims or flag existing content for admin review, without ever directly writing to the graph

---

## 4. Problems / Gaps Being Solved

| Gap | Impact |
|---|---|
| URL-format sources cannot advance through the pipeline | Every web article must be manually cataloged; the system cannot scale without this |
| Re-crawling a domain creates duplicate source records | No URL uniqueness constraint means any batch operation produces junk data |
| JavaScript-rendered pages and paywall pages return empty or partial content | Without a quality gate, bad page fetches silently produce low-quality extractions |
| Audio/video context visible only on the source page | Users reading an entity or claim page cannot hear the primary source material without navigating away |
| Entities have no visual identity | The graph and entity pages are text-only; no image for orientation or recognition |
| No copyright or attribution on sources | Full transcript display and excerpt usage grows as the corpus grows; rights gap compounds with scale |
| Community has no contribution channel | Knowledge gaps that public users could fill require admin intervention; no feedback loop |
| Suggestions, if built naively, could overwrite canonical content | Must be designed so suggestions never directly touch `claims`, `entities`, or `relationships` |

---

## 5. Desired End State

After Phase 3 is complete:

- An admin can enter a root domain URL (e.g., `https://example.com/blog`) and the system discovers all article URLs via sitemap or internal link crawl, creates one pending source record per article, and queues them for admin review before any extraction runs
- Single-URL fetching works for one-off articles — admin submits a URL, the edge function fetches and chunks it, and it advances to the `review` pipeline stage
- Entity and claim pages show inline `<audio>` or `<video>` players seeked to the anchor timestamps when a `source_anchor` record with timestamps exists
- Entity detail pages and the graph side panel display a profile image when one is set
- Every source record can carry `license`, `rights_notes`, and `attribution` — these are displayed on `SourceDetailPage.tsx` and in `SourceAnchorRow.tsx` citation links
- Authenticated public users can submit a suggestion proposing a new claim, a correction to an existing claim, or a flagged entity
- Suggestions enter an admin review queue similar to the AI extraction queue — admins can approve (creates a draft claim), reject, or request clarification
- Approved suggestions create new `draft` content that goes through the normal publish gate — they never directly modify published graph records

---

## 6. Feature Specs

### Feature 3.1 — Single-URL Ingestion Edge Function

**What it does:** Fetches a URL, extracts readable article content, stores it as a text chunk on the source record, and advances `pipeline_stage` from `uploaded` to `chunking`.

**Trigger:** Admin clicks "Process URL" on a source record with `format = 'url'` that is currently at `pipeline_stage = 'uploaded'`.

**Page quality check (required before any source record advances):**

- Extracted readable content must exceed 200 words
- URL must not match common non-article patterns: `/tag/`, `/author/`, `/page/`, `/category/`, `/search/`, `/login/`, `/signup/`
- Content must not contain common paywall signals (detected heuristically or via DOM inspection)
- If quality check fails, source record gets `pipeline_stage = 'failed'` and a `processing_error` message explaining why

**Domain allowlist:** A `url_ingestion_config` table (see schema section) stores an allowlist of approved domains. The edge function rejects any URL whose hostname is not in the allowlist. Admins manage the allowlist.

**Deduplication:** Before processing, check if a normalized version of the URL already exists in `sources.url`. If duplicate found, return an error — do not create a second record.

**Output:** Source record advances to `pipeline_stage = 'chunking'` and from there the normal chunking and extraction pipeline takes over.

---

### Feature 3.2 — Blog/Site Crawl Edge Function

**What it does:** Given a root domain URL, discovers all article-level URLs via sitemap (`/sitemap.xml`, `/sitemap_index.xml`) or by following internal links one level deep. Creates one pending source record per discovered article URL.

**Trigger:** Admin submits a root domain via a new "Crawl site" form in the admin UI. This is a separate action from single-URL fetch.

**Crawl strategy (in order of preference):**

1. Fetch `/sitemap.xml` or `/sitemap_index.xml` from the root domain
2. If no sitemap, fetch the root page and extract all internal `<a href>` links that appear to be article-level (same domain, path depth ≥ 2, not matching non-article patterns)
3. Do not follow links more than one level deep from the root

**Per-URL behavior:**

- For each discovered URL: check if it already exists in `sources` (normalized URL uniqueness check)
- If new: create a source record with `format = 'url'`, `pipeline_stage = 'uploaded'`, no extraction triggered
- Admins review the list of discovered URLs in the admin UI before approving any for processing
- Processing a crawled URL runs the single-URL fetch function (Feature 3.1) on each approved record

**Admin review of crawl results:** After a crawl completes, the admin sees a list of discovered URLs with title (from `<title>` tag), estimated word count, and a "Process" / "Skip" action per URL. No bulk auto-approve. Each URL is individually queued by the admin.

**Rate limiting:** The edge function must respect `robots.txt` crawl-delay directives and apply a minimum delay of 1 second between requests.

---

### Feature 3.3 — Inline Media Player Component

**What it does:** Renders an `<audio>` or `<video>` element on entity and claim pages when a `source_anchor` record with timestamp data exists. Seeks to the anchor's start timestamp on mount. Fetches a signed URL via existing infrastructure.

**Component location:** `src/components/source/InlineMediaPlayer.tsx`

**Props:**
```typescript
interface InlineMediaPlayerProps {
  sourceId: string;
  startSec: number;
  endSec?: number;
  format: 'audio' | 'video';
  label?: string; // e.g., "Source: Interview with X, 12:34"
}
```

**Behavior:**
- On mount, calls `getSignedSourceFileUrl(sourceId)` to get a 1-hour signed URL
- Renders `<audio>` or `<video>` element with `src={signedUrl}#t={startSec}`
- If `endSec` is present, automatically pauses playback when `currentTime >= endSec`
- Shows a text label beneath the player linking to the full source page at the anchor timestamp
- Graceful degradation: if signed URL fetch fails, shows a fallback text link to the source page instead of a broken player

**Where it is used:**

- `ClaimDetailPage.tsx` — in the evidence section, below the `SourceAnchorRow` citation, when the anchor has `start_timestamp_sec`
- `EntityDetailPage.tsx` — in the claim list, beneath each claim where its first supporting anchor has timestamp data (collapsed by default to avoid visual noise)

---

### Feature 3.4 — Entity Images

**What it does:** Adds `image_url` and `hero_image_url` text columns to the `entities` table, a public `entity-images` storage bucket, and image display on `EntityDetailPage.tsx` and `GraphSidePanel.tsx`.

**Storage bucket:** `entity-images`, public read. Admins upload images via the entity manager. No size limit for Phase 3 (add one in a follow-up if needed).

**`image_url`:** A profile/avatar image used in the graph side panel, entity badges, and the top of the entity detail page. Square or portrait orientation.

**`hero_image_url`:** A wider banner image used as a header on `EntityDetailPage.tsx` above the entity name and description. Optional — the page renders normally if unset.

**Admin upload flow:** On `AdminEntityManagerPage.tsx`, add an image upload section. On file select, upload to the `entity-images` bucket via the Supabase storage client. On success, write the public URL to `entities.image_url` or `entities.hero_image_url` via a new `updateEntityImages()` function in `src/lib/api/admin.ts`.

**Display locations:**
- `EntityDetailPage.tsx` — hero image as a banner, profile image at top-left of the entity header section
- `GraphSidePanel.tsx` — profile image as a small thumbnail next to the entity name (only if `image_url` is set)
- `EntityBadge` component — optional small image thumbnail when used in list contexts (lower priority)

---

### Feature 3.5 — Source Rights Metadata

**What it does:** Adds `license`, `rights_notes`, `attribution`, and `crawl_date` columns to the `sources` table. Surfaces these on `SourceDetailPage.tsx` and in `SourceAnchorRow.tsx` citation formatting.

**`license`:** Free text (e.g., "CC BY 4.0", "All rights reserved", "Fair use"). No enum — rights language is too varied to enumerate.

**`rights_notes`:** Free text for internal notes about rights status, purchase, or agreement.

**`attribution`:** The attribution string to display publicly when citing this source (e.g., "© 2023 Example Author. Used with permission.").

**`crawl_date`:** Timestamp of when the URL was fetched by the system. Set automatically by the URL fetch edge function. Null for manually uploaded sources.

**Admin input:** Add fields for `license`, `rights_notes`, and `attribution` to `AdminSourceDetailPage.tsx` (editable inputs, save on blur or explicit save action). `crawl_date` is read-only and system-set.

**Public display:**
- `SourceDetailPage.tsx` — display `attribution` below the source title; show `license` as a badge; show `crawl_date` if present
- `SourceAnchorRow.tsx` — append `attribution` to the citation text when the source has one

**`fair_use_rationale` field:** The full transcript display on `TranscriptViewer.tsx` for copyrighted material is a legal exposure. Add a `fair_use_rationale text` column to `sources` (admin-editable). If a source has a non-open license and no `fair_use_rationale`, add a visual warning on `TranscriptViewer.tsx` prompting the admin to document the rationale before the transcript is made publicly visible.

---

### Feature 3.6 — Community Accounts and Suggestion Workflow

**What it does:** Opens a public user registration path and a structured suggestion channel where authenticated public users can propose new claims, corrections to existing claims, or flag entities. Suggestions enter an admin review queue and, if approved, create new draft content — they never directly modify published graph records.

**Role expansion:**

| Role | Description |
|---|---|
| `super_admin` | Full control. Can set `is_canonical`. Can approve suggestions. Can manage all content. |
| `editor` | Same as current `is_admin()` behavior. Can review extractions, publish content, manage sources. Cannot set `is_canonical`. |
| `viewer` | Current internal viewer — read access to internal routes. |
| `contributor` | New public role. Can submit suggestions. Cannot write to graph directly. |

For Phase 3, `contributor` is the only new role needed. Authenticated users with no explicit role get `contributor` by default on registration.

**Public registration:** Add a registration page (`src/pages/auth/RegisterPage.tsx`) that creates an `auth.users` record and a `public.profiles` record with `role = 'contributor'`. Email verification required before suggestions can be submitted.

**`suggestions` table:** (full schema in section 7)

Suggestion types:
- `new_claim` — propose a new claim for an entity (requires `target_entity_id` and text)
- `claim_correction` — propose a correction to an existing claim (requires `target_id` pointing to a claim)
- `flag_entity` — flag an entity as needing admin attention (requires `target_id` and a reason)
- `flag_claim` — flag a claim as incorrect, disputed, or misleading

**Submission UI:** Add a "Suggest a correction" or "Propose a claim" button on `EntityDetailPage.tsx` and `ClaimDetailPage.tsx`. Clicking opens a modal with a structured form. Submissions are POST-only to an edge function or RPC — users never write directly to `claims` or `entities`.

**Admin suggestion review queue:** A new page at `/admin/suggestions` showing pending suggestions in a table. Each row shows: type, target entity/claim name, submitter, date, and the suggestion text. Actions: Approve (creates draft content), Reject (marks as rejected with optional reason), Request Clarification (sends a message back to the submitter — phase 3 can use a simple `admin_notes` field rather than a full messaging system).

**Approval behavior:**

- `new_claim` approval: creates a new `claims` row with `status = 'draft'`, linked to the target entity via `claim_entities`. The suggestion record is marked `approved`. The new claim then goes through the normal admin publish workflow — it does not become `published` automatically.
- `claim_correction` approval: creates a new draft claim with the corrected text (it does not overwrite the existing claim). Admin can then publish the corrected version and archive the old one.
- `flag_entity` / `flag_claim` approval: marks the target entity or claim with `status = 'disputed'` (the disputed status button built in Phase 1). The suggestion record is marked `approved`.

**Critical invariant:** Suggestions NEVER directly modify `claims`, `entities`, or `relationships`. Every approval is a two-step operation: the suggestion creates draft content, and the admin separately publishes it.

---

## 7. Database / Schema Plan

### 7.1 URL Deduplication (required before any crawl runs)

```sql
CREATE UNIQUE INDEX sources_url_normalized_unique
  ON public.sources (lower(regexp_replace(url, '/$', '')))
  WHERE url IS NOT NULL;
```

### 7.2 URL Ingestion Config Table

```sql
CREATE TABLE public.url_ingestion_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE, -- e.g. 'example.com'
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.url_ingestion_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "url_ingestion_config admin read write" ON public.url_ingestion_config
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
```

### 7.3 Entity Images

```sql
ALTER TABLE public.entities
  ADD COLUMN image_url text,
  ADD COLUMN hero_image_url text;
```

Create storage bucket `entity-images` via Supabase dashboard or migration: public read, no size limit initially.

### 7.4 Source Rights Metadata

```sql
ALTER TABLE public.sources
  ADD COLUMN crawl_date timestamptz,
  ADD COLUMN license text,
  ADD COLUMN rights_notes text,
  ADD COLUMN attribution text,
  ADD COLUMN fair_use_rationale text;
```

`crawl_date` is set by the URL fetch edge function, not by admin input. The others are admin-editable.

### 7.5 Contributor Role

```sql
-- Add contributor to the admin_role enum
-- Note: enum additions in PostgreSQL require a migration step
ALTER TYPE public.admin_role ADD VALUE 'contributor' AFTER 'viewer';
```

Update `is_admin()` to confirm it still returns false for `contributor`. Update `has_internal_access()` to return false for `contributor` (contributors should not see internal admin routes).

### 7.6 Suggestions Table

```sql
CREATE TYPE public.suggestion_type AS ENUM (
  'new_claim',
  'claim_correction',
  'flag_entity',
  'flag_claim'
);

CREATE TYPE public.suggestion_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'needs_clarification'
);

CREATE TABLE public.suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  suggestion_type public.suggestion_type NOT NULL,
  target_type text CHECK (target_type IN ('entity', 'claim')),
  target_id uuid, -- references the entity or claim being corrected/flagged; null for new_claim
  target_entity_id uuid REFERENCES public.entities(id), -- for new_claim, the entity to attach to
  suggestion_text text NOT NULL,
  suggestion_data jsonb NOT NULL DEFAULT '{}', -- additional structured data per type
  status public.suggestion_status NOT NULL DEFAULT 'pending',
  admin_notes text, -- reviewer notes, visible to submitter on needs_clarification
  reviewer_id uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  result_claim_id uuid REFERENCES public.claims(id), -- set when approval creates a draft claim
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX suggestions_status_created_idx ON public.suggestions (status, created_at);
CREATE INDEX suggestions_submitted_by_idx ON public.suggestions (submitted_by);
CREATE INDEX suggestions_target_idx ON public.suggestions (target_type, target_id);

ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

-- Contributors can insert their own suggestions
CREATE POLICY "suggestions contributor insert" ON public.suggestions
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- Contributors can read their own suggestions
CREATE POLICY "suggestions contributor read own" ON public.suggestions
  FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.is_admin());

-- Admins can update (approve/reject/clarify)
CREATE POLICY "suggestions admin update" ON public.suggestions
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

### 7.7 Update `update_claim_status()` to Handle Disputed from Flags

When a `flag_entity` or `flag_claim` suggestion is approved, the admin triggers `update_claim_status(claim_id, 'disputed')`. Confirm this transition is permitted in the updated `update_claim_status()` function from Phase 1. No additional schema change needed here if Phase 1 already unblocked the `disputed` transition.

---

## 8. API / Service Layer Plan

### 8.1 Edge Functions

**`supabase/functions/trigger-url-fetch/index.ts`**

- Input: `{ source_id: string }`
- Steps:
  1. Load source record; verify `format = 'url'` and `pipeline_stage = 'uploaded'`
  2. Check domain against `url_ingestion_config` allowlist; reject if not present
  3. Fetch the URL with a 10-second timeout
  4. Run page quality checks (word count ≥ 200, not a non-article pattern, no paywall signals)
  5. Extract readable content (use Mozilla Readability or a structured LLM extraction call)
  6. Store extracted text as a chunk record on the source
  7. Advance source to `pipeline_stage = 'chunking'`; set `crawl_date = now()`
  8. On any failure: set `pipeline_stage = 'failed'`, write `processing_error` with reason
- Auth: service-role key (called from admin UI action only)

**`supabase/functions/trigger-site-crawl/index.ts`**

- Input: `{ root_url: string, created_by: string }`
- Steps:
  1. Validate root URL's domain is in `url_ingestion_config` allowlist
  2. Attempt sitemap fetch at `/sitemap.xml` and `/sitemap_index.xml`
  3. If sitemap found: extract all `<loc>` URLs; filter to same domain, article-looking paths
  4. If no sitemap: fetch root page; extract internal `<a href>` links one level deep; apply same filters
  5. For each discovered URL: normalize, check uniqueness against `sources.url`, create `pending` source records for new ones (skip duplicates silently)
  6. Respect `robots.txt` crawl-delay; apply minimum 1-second delay between requests
  7. Return list of created source IDs for admin review
- Auth: service-role key (called from admin UI action only)

### 8.2 Admin API (`src/lib/api/admin.ts`)

**New functions:**

- `updateSourceRights(sourceId, { license, rights_notes, attribution, fair_use_rationale })` — UPDATE `sources` row; returns updated record
- `updateEntityImages(entityId, { image_url, hero_image_url })` — UPDATE `entities` row; returns updated record
- `triggerUrlFetch(sourceId)` — calls the `trigger-url-fetch` edge function; returns success/error
- `triggerSiteCrawl(rootUrl)` — calls the `trigger-site-crawl` edge function; returns list of created source IDs
- `getUrlIngestionDomains()` — SELECT from `url_ingestion_config`; returns allowlist
- `addUrlIngestionDomain(domain, notes?)` — INSERT into `url_ingestion_config`
- `removeUrlIngestionDomain(id)` — DELETE from `url_ingestion_config`

**Suggestion functions:**

- `getSuggestions(status?, type?)` — SELECT from `suggestions` with optional filters; admin only
- `approveSuggestion(suggestionId, adminNotes?)` — RPC that creates draft content and sets `status = 'approved'`; returns `result_claim_id` if applicable
- `rejectSuggestion(suggestionId, adminNotes?)` — UPDATE `suggestions` status; admin only
- `requestSuggestionClarification(suggestionId, adminNotes)` — UPDATE status and `admin_notes`
- `submitSuggestion(payload)` — contributor-facing INSERT; called from public UI

**Source API (`src/lib/api/sources.ts`):**

- Update `getSource()` to include `license`, `attribution`, `fair_use_rationale`, `crawl_date` in the returned fields

**Claims API (`src/lib/api/claims.ts`):**

- Update `getClaimsForEntity()` — no changes needed for Phase 3; Phase 2 already added `interpretation_frame` and `is_canonical`

### 8.3 Supabase RPC for Suggestion Approval

Create a database function `approve_suggestion(p_suggestion_id uuid, p_reviewer_id uuid, p_admin_notes text)` that:

1. Loads the suggestion record; fails if `status != 'pending'`
2. Based on `suggestion_type`:
   - `new_claim`: inserts a new row into `claims` with `status = 'draft'`, links to `target_entity_id` via `claim_entities`; sets `result_claim_id` on the suggestion
   - `claim_correction`: inserts a new draft claim with corrected text; sets `result_claim_id`
   - `flag_entity` / `flag_claim`: calls `update_claim_status()` or equivalent to set target to `disputed`
3. Sets `suggestions.status = 'approved'`, `reviewer_id`, `reviewed_at`, `admin_notes`
4. Returns the suggestion row with any `result_claim_id`

This function runs with elevated privileges so it can insert into `claims` on behalf of a contributor. The contributor never calls it directly — only admins do.

### 8.4 Signed URL (Existing)

`getSignedSourceFileUrl(sourceId)` already exists and is used by `SourceDetailPage.tsx`. The `InlineMediaPlayer` component calls this same function. No changes needed to the existing signed URL infrastructure.

---

## 9. UI / UX Plan

### 9.1 Admin Source Detail Page — URL Processing

**File:** `AdminSourceDetailPage.tsx`

For sources with `format = 'url'` and `pipeline_stage = 'uploaded'`:
- Show a "Process URL" button that calls `triggerUrlFetch(sourceId)`
- Show a loading state while the edge function runs
- On success, refresh the page to show the updated pipeline stage
- On failure, show the `processing_error` message from the source record

Add a rights metadata section (visible for all sources):
- Editable inputs for `license`, `attribution`, `rights_notes`, `fair_use_rationale`
- Read-only display of `crawl_date` if set
- Save on blur or an explicit "Save rights info" button

### 9.2 Admin URL Crawl Page

**New page:** `AdminUrlCrawlPage.tsx` at route `/admin/sources/crawl`

- A text input for the root domain URL
- A "Start crawl" button that calls `triggerSiteCrawl(rootUrl)`
- A results table showing discovered URLs with: title, estimated word count, duplicate status (already exists / new)
- Per-URL actions: "Queue for processing" (calls `triggerUrlFetch`) / "Skip"
- Domain allowlist management section below: table of allowed domains with add/remove controls

### 9.3 Inline Media Player on Claim and Entity Pages

**New component:** `src/components/source/InlineMediaPlayer.tsx`

**`ClaimDetailPage.tsx`:**
- In the evidence section, below each `SourceAnchorRow`, check if the anchor has `start_timestamp_sec`
- If yes, render `<InlineMediaPlayer>` with the source's format, `sourceId`, `startSec`, and `endSec`
- The player is shown collapsed by default with a "Listen to source" toggle

**`EntityDetailPage.tsx`:**
- On each claim card where the claim's primary anchor has timestamps, show a small media indicator icon
- Clicking the indicator expands an inline `<InlineMediaPlayer>` within the claim row

### 9.4 Entity Images — Admin Upload

**File:** `AdminEntityManagerPage.tsx`

Add an "Images" section to the entity detail/edit view:
- Profile image: file input + preview; upload to `entity-images` bucket; save URL to `entities.image_url`
- Hero image: same pattern for `entities.hero_image_url`
- "Remove image" button for each that clears the column

### 9.5 Entity Images — Public Display

**`EntityDetailPage.tsx`:**
- If `hero_image_url` is set, render a full-width hero image above the entity name/description area
- If `image_url` is set, render it as a circular or rounded profile image in the entity header alongside the name
- If neither is set, render the existing layout unchanged

**`GraphSidePanel.tsx`:**
- If `image_url` is set on the entity, render it as a small `32px` or `40px` thumbnail next to the entity name in the sheet header (lines 99-102)
- Fetched as part of the entity data in the neighborhood query; no new API call needed if `image_url` is included in the existing entity SELECT

### 9.6 Source Rights — Public Display

**`SourceDetailPage.tsx`:**
- Below the source title: show `attribution` text if set
- Show `license` as a small badge or text label
- Show `crawl_date` as "Fetched on [date]" if set (distinct from `publication_date`)
- If license is non-open and `fair_use_rationale` is empty and the source is publicly visible, show a yellow warning banner: "Rights rationale not documented"

**`SourceAnchorRow.tsx`:**
- Append attribution to the citation label when `attribution` is set, e.g., "— [title] (© 2023 Author)"

### 9.7 Community Suggestion UI

**Registration:**
- New page `src/pages/auth/RegisterPage.tsx` — email, password, display name; email verification required
- Link from public nav / login page

**Suggestion submission:**
- `EntityDetailPage.tsx`: "Suggest a claim" button in the claims section footer; opens a modal
- `ClaimDetailPage.tsx`: "Suggest a correction" button in the page header; opens a modal
- Modal form: textarea for suggestion text, type pre-filled based on context, submit button
- On submit: calls `submitSuggestion()`; shows a confirmation message; no page navigation

**Admin suggestion review:**
- New page `AdminSuggestionManagerPage.tsx` at `/admin/suggestions`
- Paginated table: type badge, target entity/claim link, submitter email, date, status, suggestion text excerpt
- Filters: by status (pending/approved/rejected/clarification), by type
- Row actions: "Approve", "Reject", "Request Clarification"
- Approve opens a confirmation modal showing the full suggestion text and the draft content that will be created
- Add link to this page in the admin sidebar

---

## 10. Step-by-Step Development Plan

### Step 1: URL Uniqueness Constraint

**Goal:** Prevent duplicate source records before any crawl infrastructure is built.

**Steps:**
1. Write a migration file (e.g., `20260608010000_url_uniqueness.sql`) with the normalized unique index on `sources.url`
2. Before applying: check existing rows for duplicate normalized URLs; resolve any conflicts manually
3. Apply the migration to the online Supabase instance
4. Update `adminSourceTitleExists()` in `src/lib/api/admin.ts` to also check URL uniqueness, returning a `urlAlreadyExists` field alongside `titleAlreadyExists`
5. Update `AdminSourceNewPage.tsx` to display the URL duplicate error

**Acceptance criteria:**
- Inserting two sources with the same URL (with/without trailing slash, with different casing) fails at the DB level
- The admin source creation form shows a user-friendly error when a duplicate URL is detected

---

### Step 2: Source Rights Metadata

**Goal:** Attach license, attribution, and rights notes to sources.

**Steps:**
1. Write a migration adding `crawl_date`, `license`, `rights_notes`, `attribution`, `fair_use_rationale` to `sources`
2. Add `updateSourceRights()` to `src/lib/api/admin.ts`
3. Update `getSource()` in `src/lib/api/sources.ts` to include the new fields
4. Add the rights metadata section to `AdminSourceDetailPage.tsx` (editable inputs, save on blur)
5. Update `SourceDetailPage.tsx` to display `attribution`, `license`, `crawl_date`
6. Add a fair use warning banner to `SourceDetailPage.tsx` for non-open licenses with no rationale
7. Update `SourceAnchorRow.tsx` to append `attribution` to citation text

**Acceptance criteria:**
- Admin can set license, attribution, and rights notes on any source
- Attribution appears on the public source detail page and in citation links
- Fair use warning appears when a source lacks rationale and has a non-open license

---

### Step 3: Entity Images

**Goal:** Entities can have a profile image and hero image.

**Steps:**
1. Write a migration adding `image_url text` and `hero_image_url text` to `entities`
2. Create the `entity-images` public storage bucket (via migration or Supabase dashboard)
3. Add `updateEntityImages()` to `src/lib/api/admin.ts`
4. Add image upload UI to `AdminEntityManagerPage.tsx` (file input, preview, save, remove)
5. Update `EntityDetailPage.tsx` to render hero image (full-width) and profile image (header thumbnail)
6. Update `GraphSidePanel.tsx` to render a small profile image thumbnail if `image_url` is set (ensure `image_url` is included in the entity data the side panel receives)

**Acceptance criteria:**
- Admin can upload, preview, and remove profile and hero images for any entity
- `EntityDetailPage.tsx` shows the hero image at the top and profile image in the header when set
- `GraphSidePanel.tsx` shows a small thumbnail next to the entity name when `image_url` is set
- Pages render normally (no broken layout) when images are not set

---

### Step 4: URL Ingestion Config and Domain Allowlist

**Goal:** Establish the domain allowlist and admin management UI before the fetch function is built.

**Steps:**
1. Write migration creating `url_ingestion_config` table with RLS
2. Add `getUrlIngestionDomains()`, `addUrlIngestionDomain()`, `removeUrlIngestionDomain()` to `src/lib/api/admin.ts`
3. Add a domain allowlist management section to the admin UI (can be a tab on `AdminSourceNewPage.tsx` or a standalone settings page under `/admin/settings/url-domains`)
4. Add a table showing allowed domains with add and remove actions

**Acceptance criteria:**
- Admins can add, view, and remove domains from the allowlist
- Allowlist persists in the database

---

### Step 5: Single-URL Fetch Edge Function

**Goal:** URL-format sources can advance through the pipeline.

**Steps:**
1. Create `supabase/functions/trigger-url-fetch/index.ts`
2. Implement: load source, verify domain allowlist, fetch URL (10s timeout), quality check, extract readable content, store chunk, advance `pipeline_stage`, set `crawl_date`; on failure write `pipeline_stage = 'failed'` and `processing_error`
3. Add `triggerUrlFetch(sourceId)` to `src/lib/api/admin.ts` (calls the edge function via `supabase.functions.invoke`)
4. Remove the `disabledReason` guard in `src/lib/api/admin.ts:597-602` for `format = 'url'` sources
5. Update the deferral notices in `AdminSourceNewPage.tsx:226-228` and `AdminSourceNewPage.tsx:404-407` to reflect that URL processing is now available
6. Add "Process URL" button to `AdminSourceDetailPage.tsx` for `format = 'url'` sources at `pipeline_stage = 'uploaded'`
7. Test with multiple URL types: article, tag page (should fail quality check), paywall page (should fail), non-allowlist domain (should reject)

**Subtasks:**
- Page quality check implementation: word count ≥ 200, non-article path patterns, basic paywall signal detection
- Content extraction: use a server-side Readability equivalent or structured LLM call; confirm approach before building
- Error handling: all failures write human-readable `processing_error` to source record

**Acceptance criteria:**
- URL-format sources at `pipeline_stage = 'uploaded'` advance to `chunking` after "Process URL" is clicked
- Tag, author, category, login, and pagination pages fail the quality check and result in `pipeline_stage = 'failed'` with a message
- Non-allowlisted domains are rejected before any fetch is attempted
- `crawl_date` is set on success

---

### Step 6: Site Crawl Edge Function and UI

**Goal:** Admins can discover all article URLs from a root domain without manually entering each one.

**Steps:**
1. Create `supabase/functions/trigger-site-crawl/index.ts`
2. Implement: validate domain allowlist, attempt sitemap fetch, fall back to root page link extraction, create source records for new URLs (skip duplicates), respect robots.txt crawl-delay with 1s minimum
3. Add `triggerSiteCrawl(rootUrl)` to `src/lib/api/admin.ts`
4. Create `AdminUrlCrawlPage.tsx` at `/admin/sources/crawl`
5. Add the crawl page link to the admin sidebar
6. Implement results table with per-URL process/skip actions
7. Include domain allowlist management section on the crawl page

**Acceptance criteria:**
- Entering a domain URL with a valid sitemap creates source records for all article-level URLs in the sitemap
- Entering a domain with no sitemap falls back to root-page link extraction
- Duplicate URLs (already in `sources`) are silently skipped
- Admins see a list of all discovered URLs and can individually queue them for processing or skip them
- Non-allowlisted domains are rejected before any request is made

---

### Step 7: Inline Media Player Component

**Goal:** Audio and video excerpts from source anchors are playable inline on claim and entity pages.

**Steps:**
1. Create `src/components/source/InlineMediaPlayer.tsx` with the props interface described in section 6.3
2. Implement signed URL fetch on mount, `<audio>`/`<video>` rendering, timestamp seeking, `endSec` auto-pause
3. Add graceful fallback to text link when signed URL fetch fails
4. Wire into `ClaimDetailPage.tsx` in the evidence section: check anchor for `start_timestamp_sec`; render player below `SourceAnchorRow` when present; collapsed by default with toggle
5. Wire into `EntityDetailPage.tsx`: add a media indicator icon to claim cards where the primary anchor has timestamps; clicking expands the player inline

**Acceptance criteria:**
- Clicking "Listen to source" on a claim page starts playback at the anchor's start timestamp
- Playback stops at `endSec` if set
- If the signed URL fetch fails, a text link to the source page with the anchor hash appears instead
- No audio or video starts playing automatically without user interaction

---

### Step 8: Contributor Role and Registration

**Goal:** Public users can create accounts with the contributor role.

**Steps:**
1. Write migration adding `contributor` to the `admin_role` enum
2. Verify `is_admin()` returns false for `contributor`; verify `has_internal_access()` returns false for `contributor`
3. Update `public.profiles` insert trigger (if exists) or registration flow to default new public registrations to `role = 'contributor'`
4. Create `src/pages/auth/RegisterPage.tsx` with email/password/display-name form; require email verification
5. Add route to router
6. Link registration page from the login page and public nav

**Acceptance criteria:**
- New users who register via the public registration page receive `role = 'contributor'`
- Contributors cannot access any `/admin/` routes
- Email verification is required before the account is active

---

### Step 9: Suggestion Workflow

**Goal:** Contributors can submit suggestions; admins can review, approve, or reject them.

**Steps:**
1. Write migration creating `suggestion_type` enum, `suggestion_status` enum, and `suggestions` table with RLS (see section 7.6)
2. Write `approve_suggestion()` database function (see section 8.3)
3. Add contributor-facing API functions: `submitSuggestion()` in `src/lib/api/suggestions.ts` (new file)
4. Add admin-facing API functions: `getSuggestions()`, `approveSuggestion()`, `rejectSuggestion()`, `requestSuggestionClarification()` in `src/lib/api/suggestions.ts`
5. Add "Suggest a claim" button and modal to `EntityDetailPage.tsx`
6. Add "Suggest a correction" button and modal to `ClaimDetailPage.tsx`
7. Create `AdminSuggestionManagerPage.tsx` at `/admin/suggestions`
8. Add link to suggestion manager in admin sidebar
9. Implement approve modal: show full suggestion text, confirm draft content to be created, call `approveSuggestion()`
10. After approval of `new_claim` / `claim_correction`: show link to the newly created draft claim in the admin claim manager

**Subtasks:**
- Submission modal: type pre-fill from context, textarea, character limit (e.g., 1000 chars), submit with loading state and confirmation message
- Approval function must be an atomic DB transaction: create draft content and update suggestion status in one operation
- `flag_entity` and `flag_claim` approval must only call the disputed status update — no new claim is created

**Acceptance criteria:**
- Authenticated contributors can submit suggestions from entity and claim pages
- Suggestions appear in `/admin/suggestions` with status `pending`
- Approving a `new_claim` suggestion creates a new `claims` row with `status = 'draft'` and does not publish it
- Approving a `flag_claim` suggestion sets the target claim to `status = 'disputed'`
- Rejecting a suggestion marks it `rejected` and does not touch any graph content
- Unauthenticated visitors cannot submit suggestions (submit button is hidden or redirects to login)

---

## 11. Testing Plan

### Automated Tests

- **URL uniqueness constraint:** Attempt to insert two source records with the same URL in varying normalizations (trailing slash, different casing). Verify second insert fails.
- **Edge function — quality check:** Unit test the quality gate logic with mock HTTP responses: article page (passes), tag page (fails), < 200 word page (fails), paywall page (fails).
- **Edge function — domain allowlist:** Test that a URL whose domain is not in `url_ingestion_config` is rejected before any fetch.
- **Suggestion RPC:** Integration test `approve_suggestion()` for each suggestion type. Verify `new_claim` approval creates a draft claim. Verify `flag_claim` approval sets target to `disputed`. Verify the operation is atomic (no partial state on failure).
- **Suggestion RLS:** Verify a contributor cannot SELECT other contributors' suggestions. Verify a contributor cannot UPDATE any suggestion record directly.

### Manual Tests

- **InlineMediaPlayer:** Load a claim page with a `source_anchor` that has timestamps. Verify the player starts at `startSec`. Verify it stops at `endSec` if set. Kill network access; verify the fallback text link appears.
- **Entity images:** Upload a profile image and hero image for an entity. Verify both appear correctly on `EntityDetailPage.tsx`. Remove the hero image; verify the page renders normally without it. Verify the thumbnail appears in `GraphSidePanel.tsx`.
- **Site crawl:** Run `trigger-site-crawl` against a test domain with a known sitemap. Verify source records are created for article URLs only. Run it again; verify no duplicates are created.
- **Suggestion flow (end-to-end):** Log in as a contributor. Submit a `new_claim` suggestion on an entity. Log in as admin. Approve the suggestion. Verify a draft claim exists in the admin claim manager. Verify the claim is not publicly visible until published.
- **Rights metadata:** Add license and attribution to a source. Verify attribution appears in `SourceAnchorRow` on claim detail pages. Verify the fair use warning appears for a source with a non-open license and no rationale.

---

## 12. Acceptance Criteria (Phase-Level)

Phase 3 is complete when all of the following are true:

- [ ] URL-format sources can be processed through the pipeline (single-URL fetch and site crawl both work)
- [ ] Domain allowlist is operational and enforced; no URL is fetched outside the allowlist
- [ ] Duplicate URL protection is in place at the DB level
- [ ] `InlineMediaPlayer` renders on claim and entity pages for anchors with timestamps; no auto-play; graceful fallback on URL failure
- [ ] Entity profile images and hero images are uploadable by admins and display correctly on entity detail and graph side panel
- [ ] `license`, `attribution`, `rights_notes`, `fair_use_rationale`, and `crawl_date` exist on all source records; admin can edit them; attribution surfaces publicly
- [ ] Public user registration creates a contributor-role account requiring email verification
- [ ] Contributors can submit suggestions from entity and claim pages
- [ ] Admins can review, approve, and reject suggestions from `/admin/suggestions`
- [ ] Approved suggestions never directly publish to the graph — they create draft content that requires a separate admin publish action
- [ ] No Phase 2 features (interpretive framing, canonical flags, claim grouping) are regressed

---

## 13. Risks and Mitigations

### R1. Web crawling fetches copyrighted or paywalled content

**Risk:** The site crawl function fetches content from external sites that may be paywalled, copyrighted, or restricted. Displaying this content could create legal exposure.

**Mitigation:**
- Domain allowlist is mandatory — only pre-approved domains are crawled
- The fair use rationale field forces admins to document rights before transcripts are publicly visible
- `TranscriptViewer.tsx` shows a rights warning for sources with non-open licenses and no rationale
- Consider adding a `is_publicly_visible boolean` field to `sources` as a separate display gate, allowing transcripts to be indexed internally but not shown to public users until rights are documented

### R2. Site crawl creates too many source records (hundreds from large blogs)

**Risk:** Crawling a large blog creates hundreds of source records immediately, overwhelming the admin review queue.

**Mitigation:**
- The crawl page UI requires individual per-URL approval before any fetch is triggered — no bulk auto-process
- Consider adding a crawl result page limit (e.g., show first 50 discovered URLs, paginate for more) to prevent a single crawl from creating hundreds of records at once
- Admins can skip URLs from the crawl results UI without creating extraction records

### R3. Suggestion approval creates draft content that clogs the claim manager

**Risk:** If suggestions are approved frequently, the admin claim manager fills with draft claims from contributor suggestions mixed with AI-extracted draft claims.

**Mitigation:**
- Add a `source_type` column on `claims` (e.g., `ai_extraction`, `admin_manual`, `contributor_suggestion`) so admins can filter by origin in the claim manager
- In the admin claim manager, add a "Show source" filter to separate suggestion-derived claims from extraction-derived ones

### R4. Contributors submit spam or low-quality suggestions

**Risk:** Open public registration with suggestion submission may attract spam.

**Mitigation:**
- Email verification is required before suggestions can be submitted
- Admin review is mandatory for all suggestions — spam never touches the graph
- Admins can reject suggestions with one click; no moderation burden beyond reviewing
- Rate-limit suggestion submissions per user (e.g., 10 per day) at the edge function or RLS level

### R5. Signed URLs expire between media player render and user playback

**Risk:** The `InlineMediaPlayer` fetches a signed URL on mount. If the user leaves the page open and comes back more than 1 hour later, the URL has expired and the player breaks.

**Mitigation:**
- Add a refresh mechanism: re-fetch the signed URL on the `error` event of the `<audio>`/`<video>` element
- Alternatively, fetch the signed URL only on user interaction (when the "Listen to source" toggle is clicked) rather than on mount

### R6. `robots.txt` disallows crawling

**Risk:** Some target domains disallow crawling via `robots.txt`, and the crawler may violate terms of service.

**Mitigation:**
- The `trigger-site-crawl` function must fetch and respect `robots.txt` before crawling any URLs
- If `robots.txt` disallows the user agent for the path, skip those URLs and log them as skipped in the crawl results
- The domain allowlist is also an opportunity for admins to confirm that crawling is legally permissible for a domain before adding it

---

## 14. Out of Scope for Phase 3

The following are explicitly deferred to Phase 4 or later:

- **Comment system on entity/claim/source pages** — Phase 4; the suggestion workflow is the community entry point for Phase 3
- **Voting or reaction signals** (`content_votes` table) — Phase 4
- **Admin review prioritization based on community signals** — Phase 4; requires voting first
- **Entity relationship visualization on claim pages** (mini-graph on claim detail) — Phase 4
- **Inline media embed on `GraphSidePanel.tsx`** — out of scope; the side panel is kept lightweight
- **`is_canonical` restriction to `super_admin` only via RLS** — should have been done in Phase 2; if deferred, note it as tech debt
- **Full messaging system for suggestion clarification** — Phase 3 uses `admin_notes` only; no two-way messaging
- **Automated confidence recomputation for sources with updated tier/category** — Phase 3 inherits the Phase 1 confidence override UI as the workaround
- **DRM, watermarking, or advanced rights enforcement beyond signed URLs** — not in scope; assess after public launch

---

## 15. Final Recommendation

Build Phase 3 in the order listed in the step-by-step plan. The URL uniqueness constraint and source rights metadata (Steps 1 and 2) have no dependencies and can be done immediately. Entity images (Step 3) are similarly self-contained.

The URL fetch edge function (Step 5) depends on the domain allowlist infrastructure (Step 4) being in place first — do not build the fetch function without the allowlist, as the allowlist is the only thing preventing unconstrained external HTTP requests from the edge.

The contributor role and suggestion workflow (Steps 8 and 9) should be built last. The suggestion workflow depends on the claim creation infrastructure from the core pipeline, which is already solid. But the workflow should only be opened to public users once the admin tooling from Phases 1 and 2 is fully operational — particularly the disputed status flow and the interpretive framing — so that approved suggestions land in a graph that admins can properly curate.

Do not launch public registration until the admin suggestion review queue is complete and tested. An open suggestion channel with no working review queue would create a backlog with no resolution path.
