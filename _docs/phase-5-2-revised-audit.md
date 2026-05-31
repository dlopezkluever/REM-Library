# Phase 5.2 Audit Guide - Source Upload Interface

**Date:** 2026-05-31
**Scope:** Feature 2 from `_docs/phases/phase-5-admin-ingestion.md`

This guide checks the current implementation and records the issues that are real, worth fixing, or worth planning before the ingestion pipeline work continues.

## Scope Reviewed

- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminSourceDetailPage.tsx`
- `src/components/admin/PipelineMonitor.tsx`
- `src/lib/api/admin.ts`
- `src/constants/routes.ts`
- `src/router.tsx`
- `supabase/migrations/20260530060000_source_files_bucket.sql`
- Related generated Supabase types and admin helper tests

## Current State

Feature 2 is functionally present:

- The two-step source form exists.
- File and URL source modes exist.
- Metadata collection exists for title, authors, publication date, format, and tier.
- File uploads go to the `source-files` bucket using `[sourceId]/[filename]`.
- Source rows are created with `pipeline_stage = 'uploaded'`.
- `trigger-transcription` is invoked after source creation.
- The user is redirected to `/admin/sources/:id`.
- Source list and source detail pages exist.
- Archive and re-run actions exist.

The implementation is a good starting point, but several workflow, correctness, and operational issues should be fixed before treating Feature 2 as complete.

## Confirmed Issues

### P0 - Re-run action invokes the wrong pipeline function for many stages

**Files:**

- `src/lib/api/admin.ts`
- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminSourceDetailPage.tsx`
- `src/components/admin/PipelineMonitor.tsx`

**Context:**

`rerunSourceExtraction(sourceId)` always invokes the `trigger-extraction` Edge Function.

That is only valid once the source already has chunks. It is wrong for:

- `uploaded`
- `transcribing`
- `transcribing_failed`
- `chunking`
- `chunking_failed`

The list page currently allows "Re-run" for any non-archived source. The detail page does the same. The dashboard monitor shows "Re-run" for failed stages, but that button only links to the detail page instead of actually re-running anything.

**Why this matters:**

A source that failed transcription needs transcription restarted. A source that failed chunking needs chunking or the appropriate recovery function restarted. Calling extraction before chunks exist is at best a no-op and at worst a confusing failed action.

**Fix approach:**

- Replace `rerunSourceExtraction(sourceId)` with a stage-aware helper, for example `rerunSourcePipelineStage(sourceId, stage)`.
- Map stages to the correct function:
  - `uploaded`, `transcribing`, `transcribing_failed` -> `trigger-transcription`
  - `chunking`, `chunking_failed` -> the future chunking/webhook recovery function, or disable until Feature 3 defines it
  - `extracting`, `extracting_failed`, `review`, `curated`, `published` -> `trigger-extraction` only when chunks exist
- Update list and detail pages to pass `source.pipeline_stage`.
- Disable or relabel re-run where no safe action exists yet.
- In `PipelineMonitor`, either make the failed-stage "Re-run" button execute the mutation inline, or rename it to "View" so the label matches the behavior.

### P1 - Uploaded files can be orphaned when DB insert fails

**Files:**

- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/lib/api/admin.ts`
- `supabase/migrations/20260530060000_source_files_bucket.sql`

**Context:**

The submit flow is:

1. Upload file to storage.
2. Insert `sources` row.
3. Invoke `trigger-transcription`.

If step 1 succeeds but step 2 fails, the storage object remains under `source-files/{sourceId}/{filename}` with no matching `sources` row.

The storage migration also lacks a DELETE policy, so admin clients cannot clean up these objects even if cleanup code is added.

**Why this matters:**

Repeated failed submissions will accumulate unreferenced storage objects. This gets expensive and hard to reason about once large audio or video files are uploaded.

**Fix approach:**

- Add a storage DELETE policy:

```sql
create policy "source files admin delete"
  on storage.objects for delete
  using (bucket_id = 'source-files' and public.is_admin());
```

- Add an API helper such as `deleteSourceFile(path)`.
- In the upload submit flow, track `uploadedFilePath`.
- If `createAdminSource()` fails after upload, call `deleteSourceFile(uploadedFilePath)` in a best-effort cleanup block.
- Do not block the user on cleanup failure; report the original source creation error and log cleanup failure for diagnostics.
- Longer term, add a server-side cleanup job for storage objects that have no matching `sources.file_path`.

### P1 - Upload progress remains visible after submit failure

**File:**

- `src/pages/admin/AdminSourceNewPage.tsx`

**Context:**

When upload or source creation fails, the catch block sets the error and clears `isSubmitting`, but it does not clear `uploadProgress`.

The UI can show an error next to a progress bar stuck near the optimistic cap, or at 100 percent if the upload succeeded and the DB insert failed.

**Why this matters:**

The screen tells the admin two conflicting things: the source failed, but the upload appears nearly complete or complete.

**Fix approach:**

- Add `setUploadProgress(null)` in the submit catch block.
- If cleanup is added for orphaned files, clear progress after cleanup attempt.

### P1 - Client UUID fallback can generate an invalid source id

**File:**

- `src/pages/admin/AdminSourceNewPage.tsx`

**Context:**

`createClientUuid()` uses `crypto.randomUUID()` when available, but falls back to a string like `source-...`.

The `sources.id` column is a UUID. If the fallback ever runs, `createAdminSource()` will fail with a database UUID type error.

**Why this matters:**

The fallback is meant to make submission safer, but it creates a worse failure mode in older or unusual browser environments.

**Fix approach:**

- Prefer removing the fallback:

```ts
const createClientUuid = () => globalThis.crypto.randomUUID()
```

- Or throw a clear runtime error if `crypto.randomUUID` is unavailable:

```ts
const createClientUuid = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('This browser cannot create source ids. Please update the browser.')
  }

  return globalThis.crypto.randomUUID()
}
```

- If broad browser support is required, use a real UUID v4 fallback, not a custom string.

### P1 - URL sources are sent into a file-based transcription flow

**Files:**

- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/lib/api/admin.ts`
- `_docs/phases/phase-5-admin-ingestion.md`

**Context:**

Feature 2 allows URL sources. The current submit flow creates a source with `url` and no `file_path`, then still invokes `trigger-transcription`.

Feature 3 describes `trigger-transcription` as fetching `source.file_path`, generating a signed Supabase Storage URL, and submitting that URL to AssemblyAI. It does not describe handling arbitrary `sources.url` values.

**Why this matters:**

URL submissions may immediately fail once the Edge Function is implemented according to the current Phase 3 spec. The UI implies URL ingestion is supported, but the backend contract is file-path oriented.

**Fix approach:**

- Decide the intended URL behavior before Feature 3:
  - If URLs are media URLs, update the Edge Function spec to support `sources.url` directly.
  - If URLs are web pages/documents, route them to a different ingestion function.
  - If URL ingestion is not ready, keep URL source creation but do not auto-trigger transcription; show the source as `uploaded` with a clear next action.
- Encode this in `triggerSourceTranscription()` or a new orchestration helper so source type determines the next function.
- Add a small UI message on URL mode if URL processing is limited.

### P1 - Storage bucket accepts every MIME type

**File:**

- `supabase/migrations/20260530060000_source_files_bucket.sql`

**Context:**

The `source-files` bucket is created with `allowed_mime_types = null`, which allows any MIME type. The client file input has an `accept` attribute, but that is only a browser hint and can be bypassed.

**Why this matters:**

Admins can accidentally or intentionally upload unsupported file types. The pipeline may later fail on files it cannot parse or transcribe.

**Fix approach:**

- Add server-side MIME restrictions in the bucket definition for supported audio, video, text, PDF, EPUB, Word, and RTF formats.
- Keep the client `accept` list aligned with the bucket list.
- Consider extension validation too, because browser-reported MIME types are not always reliable.
- If strict MIME enforcement causes legitimate files to fail, start with a broad but explicit allowlist and tighten it as the pipeline matures.

### P1 - No client-side file size limit before upload starts

**File:**

- `src/pages/admin/AdminSourceNewPage.tsx`

**Context:**

The bucket allows files up to 5 GB, and the UI will immediately attempt to upload whatever file the admin selects.

**Why this matters:**

Very large videos or audio files can tie up the browser and network for a long time. The optimistic progress bar makes this more confusing because it may reach 88 percent long before the real upload is close to done.

**Fix approach:**

- Define a project-level max upload size for this phase, such as 500 MB, 1 GB, or 2 GB.
- Validate `file.size` in `handleFileChange()` or `validateForm()`.
- Show a clear error before upload begins.
- Keep the storage bucket limit equal to or slightly above the UI limit.
- Revisit the limit when the pipeline supports resumable uploads or large-file background ingestion.

### P1 - Source list aggregation can fail or slow down at scale

**File:**

- `src/lib/api/admin.ts`

**Context:**

`getAdminSourceListRows()` fetches up to 500 sources, then fetches chunks with `.in('source_id', sourceIds)`, then fetches extractions with `.in('chunk_id', chunkIds)`.

This is a client-side join across three tables.

**Why this matters:**

The `sourceIds` and especially `chunkIds` arrays can become large enough to hit PostgREST URL/query limits. It also pulls more data into the browser than the list page needs.

**Fix approach:**

- Move this aggregation into a Postgres RPC, for example `get_admin_source_list_rows()`.
- Return one row per source with:
  - source fields needed by the list
  - `extraction_count`
  - `pending_review_count`
  - computed or raw data needed for review status
- Use SQL `left join`, `count`, and filtered counts.
- Add pagination parameters to the RPC before the source library grows.
- Update `getAdminSourceListRows()` to call the RPC.

### P1 - Archive action has no confirmation, restore path, or clear pipeline semantics

**Files:**

- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminSourceDetailPage.tsx`
- `src/lib/api/admin.ts`
- `src/components/admin/PipelineMonitor.tsx`

**Context:**

Archive is a one-click action. It updates `sources.status = 'archived'`. There is no confirmation dialog and no unarchive action in the UI.

Archived sources remain visible in the dashboard pipeline monitor because `getAdminSources()` does not filter them out and the monitor has no status column. There is also no contract yet saying whether future Edge Functions should stop processing archived sources.

**Why this matters:**

An accidental archive is not recoverable from the admin UI. Also, an archived source may keep moving through the pipeline unless the backend checks status.

**Fix approach:**

- Add a confirmation flow before archive. The project already has Radix/Shadcn dialog primitives, so a small confirmation dialog is enough.
- Add an unarchive or restore action, at least on the detail page.
- Decide whether archived sources should appear in the dashboard pipeline monitor:
  - If no, filter them out in `getAdminSources()` and in realtime cache updates.
  - If yes, add a status column or archived badge so the monitor is not misleading.
- Ensure future Edge Functions skip archived sources or clearly define archive as metadata-only.

### P2 - Upload progress is simulated and can mislead on large files

**File:**

- `src/lib/api/admin.ts`

**Context:**

Supabase Storage upload does not expose a native progress callback in the current client path, so `uploadSourceFile()` reports optimistic progress every 350ms, caps at 88 percent, and jumps to 100 percent on completion.

**Why this matters:**

For small files this is acceptable. For large files, the bar can reach 88 percent in a few seconds and then sit there for minutes.

**Fix approach:**

- Keep the optimistic progress, but make it more honest:
  - Slow the tick rate for large files.
  - Show the file size.
  - Show copy such as "Uploading large files can take several minutes."
  - Consider switching from determinate percent to an indeterminate state after the optimistic cap.
- If Supabase adds real progress support later, replace the optimistic reporter without changing the UI surface.

### P2 - Source description is in the schema but missing from the upload form

**Files:**

- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/lib/api/admin.ts`
- `supabase/migrations/20260530020000_sources_description.sql`

**Context:**

The `sources` table has a `description` column, public source pages can display it, and search functions include it. The admin upload form does not collect it.

**Why this matters:**

Admins cannot add source descriptions during ingestion without editing the database directly.

**Fix approach:**

- Add a textarea below the title field.
- Extend `CreateAdminSourceInput` with `description: string | null`.
- Insert `description` in `createAdminSource()`.
- Show description on the admin detail page metadata section.

### P2 - New-source submit does not invalidate the source-list query

**File:**

- `src/pages/admin/AdminSourceNewPage.tsx`

**Context:**

After a successful source create, the page invalidates `['admin', 'sources']`, which feeds the dashboard monitor. It does not invalidate `['admin', 'source-list']`, which feeds `/admin/sources`.

**Why this matters:**

The list page will usually refetch on remount because default React Query data is stale, but relying on default stale behavior is fragile. Feature-specific mutation flows should invalidate every affected query.

**Fix approach:**

- After create, invalidate both:
  - `['admin', 'sources']`
  - `['admin', 'source-list']`
- Consider centralizing admin source query keys so these do not drift.

### P2 - Trigger failure warning can become stale after a successful rerun

**File:**

- `src/pages/admin/AdminSourceDetailPage.tsx`

**Context:**

If `trigger-transcription` fails after source creation, the new page redirects to the detail page with `location.state.triggerError`. The detail page displays that warning.

If the admin later clicks "Re-run" and the stage successfully advances, the route-state warning remains because it is not tied to current source state and cannot be dismissed.

**Why this matters:**

The detail page can keep saying transcription did not start even after the pipeline has started.

**Fix approach:**

- Store the route warning in local state initialized from `location.state`.
- Clear it when:
  - the rerun mutation succeeds, or
  - `source.pipeline_stage` changes away from `uploaded`, or
  - the user dismisses it manually.
- Consider recording the last pipeline error in the database once Edge Functions exist, rather than relying on route state.

### P2 - Admin source display helpers are duplicated

**Files:**

- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminSourceDetailPage.tsx`
- `src/components/admin/PipelineMonitor.tsx`

**Context:**

The same labels, badge styling, and format icon logic are repeated across the list, detail, and monitor.

**Why this matters:**

Feature 3 and Feature 5 will add more consumers of pipeline stages and source formats. Duplicated stage handling will drift, especially once recovery states and review actions become more complex.

**Fix approach:**

- Extract shared helpers to something like `src/components/admin/sourceDisplay.tsx`.
- Include:
  - `formatLabels`
  - `stageLabels`
  - `getStageClassName`
  - `SourceFormatIcon`
  - `isFailedPipelineStage`
  - `getPipelineStageActionLabel`
- Use the shared helpers in all three existing components.

### P2 - URL and file metadata validation is minimal

**File:**

- `src/pages/admin/AdminSourceNewPage.tsx`

**Context:**

The form validates only title, file presence, and URL parseability. It does not warn about duplicate titles, unsupported file extensions beyond the `accept` hint, or suspicious URL protocols beyond what `new URL()` accepts.

**Why this matters:**

Admins can accidentally ingest the same source twice or submit files/URLs that the pipeline cannot handle.

**Fix approach:**

- Add extension validation that mirrors supported formats.
- Restrict URLs to `http:` and `https:` unless there is a specific reason to allow others.
- Add a duplicate-title warning. Do not necessarily block submission; start with "A source with this title already exists."
- Consider duplicate detection by URL or file name as well.

### P3 - Drag-and-drop upload would improve admin throughput

**File:**

- `src/pages/admin/AdminSourceNewPage.tsx`

**Context:**

The current file input works, but it is a plain browser file control.

**Why this matters:**

Admins doing repeated ingestion work will move faster with a drop zone that shows the selected file, size, and validation state.

**Fix approach:**

- Replace or wrap the file input with a drag-and-drop target.
- Reuse the existing file change logic through a shared `setSelectedFile(file)` helper.
- Keep the native file input available for accessibility and keyboard use.

### P3 - Feature 2 lacks focused regression tests

**Files:**

- `src/lib/api/admin.ts`
- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminSourceDetailPage.tsx`

**Context:**

There are tests for admin realtime helper behavior, but no focused tests for the new upload flow, source creation helper, rerun stage mapping, archive behavior, or source list aggregation.

**Why this matters:**

The most important bugs in this feature are workflow bugs. They are easy to reintroduce without tests.

**Fix approach:**

- Unit test pure helpers:
  - filename sanitization
  - source file path generation
  - format detection after it is exported or moved to a helper
  - stage-to-rerun-function mapping
- Component test the upload form:
  - file mode requires a file
  - URL mode validates URL
  - selected file auto-detects format
  - failed submit clears progress
- Add API tests around aggregation once moved to RPC.
- Add a detail-page test for clearing stale trigger warnings.

## Valid Audit Items Reframed

The original Phase 5.2 audit is largely accurate. These items are valid but should be framed carefully:

- **Storage MIME restrictions:** The original permissive bucket was likely chosen to avoid false negatives during early development. It is still worth fixing before real ingestion.
- **Simulated progress:** This is not a code bug given the Supabase client limitation. It is a UX honesty problem, especially with multi-GB files.
- **Description field:** This is not required by the Phase 5.2 checklist, but it is a real gap because the schema and public source pages already support descriptions.
- **Drag-and-drop:** This is an enhancement, not a completion blocker.
- **Duplicate detection:** This should start as a warning, not a hard uniqueness rule, because legitimate sources can have similar titles.

## What Is Working Well

- The two-step form keeps source type and metadata decisions clear.
- File format detection and title prefill reduce upload friction.
- Author tags support keyboard entry and deduplicate case-insensitively.
- The source detail page gives the redirect target required by Feature 2.
- Realtime source updates are wired through the detail page and dashboard monitor.
- The source list includes the Feature 2 admin columns: pipeline stage, extraction count, review status, archive, and re-run.
- `sanitizeSourceFilename()` prevents path-like or unsafe filename characters from becoming storage object keys.
- Failed pipeline stages and `pipeline_stage_entered_at` are already represented in the current schema/types from dashboard hardening work.

## Step-By-Step Battle Plan

1. **Fix stage-aware re-run first.**
   - Create a stage-to-function mapping helper.
   - Replace `rerunSourceExtraction(sourceId)` with a stage-aware API.
   - Update list and detail pages to pass the current stage.
   - Change the dashboard failed-stage button so it either reruns inline or honestly says "View".
   - Disable stages that do not yet have a safe backend recovery function.

2. **Add storage cleanup support.**
   - Add the admin DELETE policy to the `source-files` bucket migration.
   - Add `deleteSourceFile(path)` in the admin API layer.
   - In the submit flow, clean up uploaded files if source row creation fails.
   - Keep cleanup best-effort and preserve the original error message.

3. **Fix submit failure UI.**
   - Clear `uploadProgress` in the submit catch block.
   - Confirm that failed upload, failed DB insert, and failed function invoke each display a non-contradictory state.

4. **Replace the invalid UUID fallback.**
   - Remove the custom `source-...` fallback.
   - Throw a clear browser capability error or use a real UUID v4 fallback.

5. **Clarify URL ingestion behavior.**
   - Decide whether URL sources are transcription inputs, document ingestion inputs, or catalog-only sources for now.
   - Update the Edge Function contract or the UI submit orchestration to match that decision.
   - Add URL-mode copy and validation for the chosen behavior.

6. **Harden upload validation.**
   - Add client-side max file size validation.
   - Add client extension validation.
   - Restrict URL protocols to `http:` and `https:`.
   - Add storage MIME type allowlisting in the bucket migration.

7. **Fix archive workflow.**
   - Add a confirmation dialog.
   - Add an unarchive action.
   - Decide whether archived sources should be hidden from the dashboard monitor.
   - Make future Edge Functions skip archived sources if archive means "stop processing".

8. **Move source list counts to SQL.**
   - Add an RPC for source list rows with extraction and pending counts.
   - Add pagination parameters.
   - Update `getAdminSourceListRows()` to call the RPC.
   - Add tests or seeded verification for the aggregate counts.

9. **Improve progress honesty.**
   - Tune optimistic progress for large files.
   - Show file size and large-file upload copy.
   - Consider indeterminate progress once the optimistic cap is reached.

10. **Add missing metadata and cache invalidation.**
    - Add source description to the upload form, create input, insert payload, and detail page.
    - Invalidate both `['admin', 'sources']` and `['admin', 'source-list']` after create.

11. **Clean up shared source display code.**
    - Extract shared source labels, icons, and stage badge helpers.
    - Replace duplicate helper definitions in monitor, list, and detail pages.

12. **Clear stale route warnings.**
    - Convert `triggerError` route state into local dismissible state.
    - Clear it after successful rerun or stage advancement.

13. **Add focused tests.**
    - Cover filename/path helpers, stage-to-function mapping, and upload validation.
    - Cover submit failure progress reset.
    - Cover archive confirmation behavior once implemented.
    - Cover warning clearing on the detail page.

14. **Run verification.**
    - `npm.cmd run typecheck`
    - `npm.cmd run lint`
    - `npm.cmd run test`
    - `npm.cmd run build`
    - Manual check: create file source, create URL source, force upload/create failure, archive and restore source, and verify list/detail/dashboard states remain consistent.
