# Phase 5-2 Audit — Source Upload Interface

**Date:** 2026-05-30  
**Branch:** `admin-injester`  
**Scope:** Feature 2 of Phase 5 — Source upload form, file upload pipeline, source list page, and source detail page  

**Files reviewed:**
- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminSourceDetailPage.tsx`
- `src/components/admin/PipelineMonitor.tsx` (modified)
- `src/lib/api/admin.ts` (modified)
- `src/constants/routes.ts`
- `src/router.tsx`
- `supabase/migrations/20260530060000_source_files_bucket.sql`

---

## Overall Assessment

Feature 2 is well-implemented overall. The two-step upload form is clean, the metadata fields match the spec, file format auto-detection and title pre-filling are thoughtful UX additions, and the Realtime subscription on the detail page works correctly. The `triggerError` degraded-mode path (source saved, pipeline not started) is an especially good design — it doesn't block the redirect or discard the submission. The storage migration follows least-privilege correctly.

There are no critical bugs that would break the happy path, but there are a handful of real bugs and several meaningful concerns worth addressing before Feature 3 lands.

---

## Bugs

### 1. Upload progress bar persists on failure

**File:** `src/pages/admin/AdminSourceNewPage.tsx:229`

When `uploadSourceFile` or `createAdminSource` throws, the `catch` block calls `setIsSubmitting(false)` and `setError(...)` but never resets `uploadProgress` to `null`. After a failed upload, the progress bar stays rendered at whatever percentage it reached (often 88%, the cap). The user sees a near-complete progress bar alongside an error message, which is contradictory.

**Fix:** Add `setUploadProgress(null)` to the catch block.

```ts
} catch (submitError) {
  setError(getErrorMessage(submitError))
  setUploadProgress(null)  // add this
  setIsSubmitting(false)
}
```

---

### 2. "Re-run" always invokes `trigger-extraction` regardless of failed stage

**File:** `src/lib/api/admin.ts:240–248`

`rerunSourceExtraction` unconditionally calls `trigger-extraction`. The "Re-run" button in `AdminSourceListPage` fires this for any source, regardless of whether transcription or chunking failed. A source stuck at `transcribing_failed` needs `trigger-transcription` re-invoked, not `trigger-extraction`. Calling `trigger-extraction` on a source with no chunks will do nothing meaningful.

**Fix:** Either accept a `stage` parameter and invoke the correct function, or consult `source.pipeline_stage` before calling:

```ts
export const rerunSourceExtraction = async (sourceId: string, stage: PipelineStage) => {
  const functionName =
    stage === 'transcribing_failed' ? 'trigger-transcription' : 'trigger-extraction'
  const { error } = await supabase.functions.invoke(functionName, {
    body: { source_id: sourceId },
  })
  if (error) throw error
}
```

The list page and detail page both need to pass the current stage to this call. The `AdminSourceListPage` already has `source.pipeline_stage` in scope.

---

### 3. No DELETE policy on storage bucket

**File:** `supabase/migrations/20260530060000_source_files_bucket.sql`

The migration creates SELECT, INSERT, and UPDATE policies for `source-files` but no DELETE policy. This means:

- Orphaned files from failed submissions (see concern #1 below) can never be cleaned up
- An archived source's file can never be removed
- If a source is re-uploaded (after a bug fix), the old file is permanently stuck

**Fix:** Add an admin DELETE policy alongside the existing three:

```sql
create policy "source files admin delete"
  on storage.objects for delete
  using (bucket_id = 'source-files' and public.is_admin());
```

---

### 4. `createClientUuid` fallback produces an invalid UUID

**File:** `src/pages/admin/AdminSourceNewPage.tsx:55–60`

```ts
const createClientUuid = () => {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `source-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}
```

The fallback string (`source-1748...`) is not a valid UUID. The `sources` table `id` column is `uuid primary key`. If the fallback ever ran, the DB insert would error with a type mismatch, producing a confusing error message instead of "upload failed."

`crypto.randomUUID()` is available in all browsers supporting the Web Crypto API (Chrome 92+, Firefox 95+, Safari 15.4+) and Node 14.17+. The fallback is effectively dead code — but dead code with a sharp edge.

**Fix:** Remove the fallback entirely, or replace it with a proper UUID v4 implementation:

```ts
const createClientUuid = () => crypto.randomUUID()
```

If you want to be safe, you can guard it with a runtime error:

```ts
const createClientUuid = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('crypto.randomUUID is not available in this environment.')
  }
  return globalThis.crypto.randomUUID()
}
```

---

## Concerns

### 5. Orphaned storage files on DB insert failure

**File:** `src/pages/admin/AdminSourceNewPage.tsx:200–215`

The submission flow is: upload file → insert source row → trigger transcription. If the file upload succeeds but `createAdminSource` throws, the file sits in storage under `{sourceId}/filename` with no corresponding source row. There is no cleanup code.

This is a common trade-off in client-driven two-phase writes. It's acceptable at low volume but will accumulate garbage in storage over time, especially if the edge function or DB is flaky.

**Recommendation:** Either add a try/catch around `createAdminSource` that attempts to delete the uploaded file on failure, or implement a periodic server-side cleanup job that removes storage objects with no matching source row.

---

### 6. Upload progress bar is fully simulated — misleading for large files

**File:** `src/lib/api/admin.ts:157–205`

The Supabase JS client does not expose `XHR.onprogress` or a streaming upload API, so real progress tracking isn't possible today. The current approach ticks up 7% every 350ms, capping at 88%, then jumps to 100% on completion. This is disclosed in no way to the user.

For a 50 MB file on a fast connection this is unnoticeable. For a large audio file (the storage bucket allows up to 5 GB), the progress bar hits 88% in roughly 4 seconds while the actual upload may take minutes. The user has no signal that anything is still happening until the upload completes.

**Recommendation:** Use a slower, more honest tick rate for large files. Consider adding a note like "Large files may take a moment" or showing file size. If Supabase ever exposes an upload progress hook, wire it in at `uploadSourceFile`.

---

### 7. No client-side file size validation

**File:** `src/pages/admin/AdminSourceNewPage.tsx:134–147`

The file input has an `accept` attribute covering the supported extensions, but there's no validation of file size before upload begins. The storage bucket allows 5 GB. If someone selects a 4 GB video, the upload starts silently.

**Recommendation:** Add a pre-upload check in `handleFileChange` or `validateForm`:

```ts
const maxFileSizeMb = 2048 // or whatever limit makes sense for your pipeline
if (file.size > maxFileSizeMb * 1024 * 1024) {
  return `File exceeds the ${maxFileSizeMb} MB limit.`
}
```

---

### 8. No server-side MIME type enforcement on the storage bucket

**File:** `supabase/migrations/20260530060000_source_files_bucket.sql:6`

```sql
allowed_mime_types = null
```

`null` means all MIME types are permitted. The client-side `accept` attribute is a UI hint only — it can be bypassed in developer tools. An admin could upload a `.exe` or `.sh` file.

**Recommendation:** Enumerate the allowed MIME types in the bucket definition:

```sql
allowed_mime_types = array[
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/aac',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg',
  'application/pdf', 'application/epub+zip',
  'text/plain', 'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf'
]
```

---

### 9. No confirmation dialog for Archive action

**File:** `src/pages/admin/AdminSourceListPage.tsx:262–272`, `src/pages/admin/AdminSourceDetailPage.tsx:287–296`

The Archive button fires immediately on click with no confirmation. There's no "unarchive" action in the UI. An accidental click on a source that took hours to ingest and process is not recoverable from the admin interface.

**Recommendation:** Add a simple confirmation step — either an `AlertDialog` (Shadcn ships this) or a two-click pattern (first click changes the button to "Confirm Archive?", second click fires). The AlertDialog approach is more discoverable.

---

### 10. Significant code duplication across admin components

The following are defined identically in three or more files:

| Symbol | Files |
|---|---|
| `formatLabels` | `AdminSourceListPage.tsx`, `AdminSourceDetailPage.tsx`, `PipelineMonitor.tsx` |
| `stageLabels` | `AdminSourceListPage.tsx`, `AdminSourceDetailPage.tsx`, `PipelineMonitor.tsx` |
| `FormatIcon` | `AdminSourceListPage.tsx`, `PipelineMonitor.tsx` |
| `getStageClassName` | `AdminSourceListPage.tsx`, `AdminSourceDetailPage.tsx`, `PipelineMonitor.tsx` |

There's also a subtle inconsistency: `PipelineMonitor`'s `getStageClassName` checks `_failed` and `review` in separate `if` branches, while the other two files combine them into one (`stage.endsWith('_failed') || stage === 'review'`). They produce the same result, but the divergence will silently drift if either is updated.

**Recommendation:** Extract these to `src/components/admin/sourceUtils.tsx` (or similar) and import from one place. This is especially important before Feature 3 and Feature 5 land and add more consumer files.

---

### 11. `getAdminSourceListRows` is a multi-step client-side join

**File:** `src/lib/api/admin.ts:275–337`

To compute extraction counts per source, the function:
1. Fetches up to 500 sources
2. Fetches all chunks for those sources
3. Fetches all extractions for those chunks

The `chunkIds` array passed to `.in('chunk_id', chunkIds)` can easily exceed Supabase's URL query limit (PostgREST uses `?chunk_id=in.(...)` in the query string). With 500 sources × N chunks each, this could fail silently or be truncated.

**Recommendation:** Move the aggregation to a Postgres RPC function similar to `get_admin_content_stats`. A single SQL query with `LEFT JOIN` and `COUNT` is far more efficient than three round trips, and avoids the URL length ceiling.

---

### 12. `PipelineMonitor` "Re-run" action routes to detail page, not re-run

**File:** `src/components/admin/PipelineMonitor.tsx:176–179`

```ts
const actionRoute = isReviewStage
  ? `/admin/review?source=${source.id}`
  : `/admin/sources/${source.id}`
```

For failed stages, the button shows "Re-run" but navigates to the detail page. The user then has to find and click the Re-run button a second time. The label is misleading.

**Recommendation:** Either rename the button to "View" for failed stages (consistent with other non-review stages), or implement an inline re-run mutation on the monitor table itself.

---

## Suggestions (Additions Within Feature Scope)

### A. Source description field in the upload form

The `sources` table has a `description` column (added in `20260530020000_sources_description.sql`) but the upload form has no field for it. Admins have no way to add a description without a direct DB edit.

A `<textarea>` below the title field would complete the metadata form. This is a minor gap.

---

### B. Drag-and-drop file area

The current file input is a standard browser `<input type="file">`. A drag-and-drop zone with visual feedback would fit the "serious admin tool" aesthetic and speed up workflows for admins uploading many files. The file change handler already exists and could be reused via `onDrop`.

---

### C. Duplicate title detection

Before submitting, a quick check against existing source titles (or a DB unique constraint on `title`) would prevent accidental duplicate ingestion of the same material. At minimum, a warning (not a block) would be useful.

---

## What's Working Well

- **Two-step form** is clean and focused. Step 1 commits intent (file vs. URL); Step 2 is metadata only. The "Change" affordance is well-placed.
- **Format auto-detection** from extension is thorough (covers all 14 supported extensions) and immediately updates the format select.
- **Title pre-population** from filename (stripping extension, replacing hyphens/underscores with spaces) reduces friction for bulk uploads.
- **Author tag input** handles Enter/Tab/comma consistently and deduplicates case-insensitively.
- **`triggerError` degraded path** — the source is created and the admin is redirected even if the edge function fails to invoke. The error is surfaced as an amber warning on the detail page without blocking anything. This is the right design.
- **`sanitizeSourceFilename`** strips path-traversal characters before building the storage key. Correct.
- **`subscribeToSourceUpdates`** is properly torn down via the returned cleanup function in both `PipelineMonitor` and `AdminSourceDetailPage`.
- **Pipeline progress visualization** (the 7-stage grid) clearly communicates position and handles failed stages with correct visual state.
- **Route specificity** — `/admin/sources/new` correctly resolves before `/admin/sources/:id` via React Router v6's static-over-dynamic ranking.
- **`isAdminSourceRow` validator** is thorough and guards against malformed Realtime payloads — the type narrowing on the `postgres_changes` payload is correct and defensive.
