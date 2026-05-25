# Phase 5 — Admin Interface & Ingestion Pipeline

**Goal:** The admin team can upload source material, monitor the automated ingestion pipeline (transcription → chunking → extraction), review AI-extracted entities and claims, and publish curated content to the live knowledge graph. This is the core workflow that transforms raw source material into graph data.

**Builds on:** Phase 1 (auth, schema, AdminShell), Phase 3 (entity detail views for linking published content)

**Deliverable:** An admin can log in, upload an audio or text source, watch it progress through the pipeline, review and curate the AI extractions, and publish entities and claims that then appear in the graph.

---

## Feature 1 — Admin dashboard with pipeline monitor

1. Build `AdminDashboardPage.tsx` inside the AdminShell: stat cards row at top (total published entities / total published claims / total sources / pending review count) — each pulling from count queries on the Supabase tables.
2. Build `PipelineMonitor.tsx`: a Shadcn `Table` listing all sources, ordered by `created_at` desc. Columns: source title / format icon / tier badge / current `pipeline_stage` / time in current stage / action button ("Review" when stage = `review`, "View" otherwise).
3. Subscribe to real-time source updates: `supabase.channel('sources').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sources' }, handler)` — update the pipeline monitor row in real time when a source's `pipeline_stage` changes without requiring a page refresh.
4. Build `AdminShell.tsx` fully: left sidebar with nav links (Dashboard / Sources / Review Queue / Entities / Claims / Settings), active link highlighted; top bar with admin user email + sign-out button.
5. Add content stats section below the pipeline monitor: total entities by type (bar chart using a simple SVG or a minimal chart library — no heavy chart dependency needed), confidence score distribution, draft vs. published counts.

---

## Feature 2 — Source upload interface

1. Build `AdminSourceNewPage.tsx`: a two-step form. Step 1 — source type selection (File upload / URL). Step 2 — metadata form: title (required), author(s) (tag input), publication date, format (auto-detect from file extension or allow override), tier (Tier 1 / Tier 2 radio).
2. Implement file upload to Supabase Storage: use `supabase.storage.from('source-files').upload(path, file)` with a progress indicator (`onUploadProgress`). Generate the `file_path` as `[sourceId]/[filename]`.
3. On form submit: create the `sources` row in the database with `pipeline_stage = 'uploaded'`; immediately invoke the `trigger-transcription` Edge Function via `supabase.functions.invoke`.
4. After submission: redirect to the source's admin detail page showing real-time pipeline progress (from Feature 1's Realtime subscription).
5. Build `AdminSourceListPage.tsx`: the full source list with admin-specific columns (pipeline stage, extraction count, review status); inline "Archive" and "Re-run extraction" action buttons per row.

---

## Feature 3 — Transcription + chunking pipeline (Edge Functions)

1. Create `supabase/functions/trigger-transcription/index.ts`: receives a `source_id`; fetches the source's `file_path` from the database; generates a signed Supabase Storage URL; submits the URL to AssemblyAI API (`POST /v2/transcript` with `speaker_labels: true`); stores the returned `transcript_id` in the `sources` table; updates `pipeline_stage = 'transcribing'`.
2. Create `supabase/functions/assemblyai-webhook/index.ts`: receives AssemblyAI completion webhook; fetches the completed transcript JSON; stores each segment as a row in `chunks` (source_id, chunk_index, start_sec, end_sec, speaker, raw_text); updates `pipeline_stage = 'chunking'`; invokes `trigger-extraction`.
3. Create `supabase/functions/trigger-extraction/index.ts`: fetches all chunks for the source; iterates chunks in batches of 5; for each batch, builds the Claude API extraction prompt (see Feature 4); stores returned structured JSON as rows in `extractions` with `status = 'pending'`; updates `pipeline_stage = 'extracting'` during processing, then `'review'` when complete.
4. Implement chunking strategy: after transcription segments arrive, merge adjacent segments into semantic chunks targeting 800–1200 words. Simple heuristic: merge segments until word count exceeds 800, then start a new chunk at the next natural pause (segment gap > 2 seconds). Store as chunks.
5. Add error handling and resumability: if any stage fails, update `pipeline_stage` to a `*_failed` status (add these enum values in a migration); the admin dashboard shows a "Re-run" button for failed stages; each Edge Function is idempotent (checks if work was already done before re-running).

---

## Feature 4 — Claude API extraction

1. In `supabase/functions/trigger-extraction/index.ts`, implement the Claude API call with a carefully engineered system prompt that instructs the model to return structured JSON per chunk:
   ```
   {
     entities: [{ type, name, aliases[], description }],
     claims: [{ statement, entities_involved[], relationship_type, evidence_summary }]
   }
   ```
2. Validate each Claude response with a Zod schema before writing to the database; if validation fails, store the raw response in `extractions.extraction_data` with a `validation_failed` flag for manual review.
3. Implement entity resolution in the extraction prompt: include a list of existing canonical entity names (fetched from the `entities` table) in the prompt context so Claude maps mentions to existing entities rather than creating duplicates. For chunks from large sources, include the 50 most relevant entities by name similarity to the chunk.
4. Store each validated extraction as a row in `extractions`: `chunk_id` (FK), `extraction_data` (full JSON), `status = 'pending'`.
5. Add a rate-limit wrapper: Claude API requests are throttled to 5 per second using a simple token-bucket implementation to avoid hitting API rate limits during bulk extraction.

---

## Feature 5 — Extraction review queue UI

1. Build `AdminReviewQueuePage.tsx`: fetches pending extractions grouped by source; renders a list of source rows with the count of pending extractions; clicking a source row expands the review panel for that source.
2. Build `ExtractionReviewPanel.tsx`: the main curation interface. Left column: the source chunk text with the relevant passage highlighted in Verdigris. Right column: the structured extraction (entity name, type, description, or claim statement + entities involved); action buttons below.
3. Implement the 5 review actions:
   - **Confirm**: set `extraction_status = 'confirmed'`; create an `entities` row (status = `'draft'`) from the extraction data; link `source_anchor` and `claim_evidence` records.
   - **Edit**: show inline editable fields for name, description, connections; on save, set `extraction_status = 'edited'`; create/update the entity record.
   - **Reject**: set `extraction_status = 'rejected'`; no entity/claim created.
   - **Merge**: show a type-ahead search input; on selecting an existing entity, merge the extraction's aliases and source anchors into that entity; set `extraction_status = 'merged'`.
   - **Split**: show a form to break one extraction into two; creates two entity records; sets `extraction_status = 'confirmed'`.
4. Build publication control: in the entity admin view (accessible from `/admin/entities`), add a toggle Published / Draft per entity. Bulk publish: checkbox selection in the entities table + "Publish selected" button runs a batch update.
5. After publishing: trigger the `compute-confidence` Edge Function for all affected entities — it recalculates confidence scores based on the newly published source anchors and updates `entities.confidence_score` and `relationships.weight`; Sigma re-renders affected nodes with updated sizes on next graph load.
