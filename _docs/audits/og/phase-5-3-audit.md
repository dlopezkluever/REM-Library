# Phase 5.3 Audit Guide - Transcription + Chunking Pipeline

**Date:** 2026-05-31  
**Scope:** Feature 3 from `_docs/phases/phase-5-admin-ingestion.md`

This guide re-checks the current Feature 3 implementation and records the issues that are real, worth fixing, or worth planning before the review queue and publication workflow depend on this data.

## Scope Reviewed

- `supabase/functions/trigger-transcription/index.ts`
- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/functions/trigger-extraction/index.ts`
- `supabase/functions/_shared/pipeline.ts`
- `supabase/migrations/20260531100000_ingestion_pipeline_metadata.sql`
- `supabase/migrations/20260523010000_enums.sql`
- `supabase/migrations/20260523020000_core_tables.sql`
- `supabase/config.toml`
- `src/lib/api/admin.ts`
- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminSourceDetailPage.tsx`
- `src/components/admin/PipelineMonitor.tsx`
- Related generated types, tests, `.env.example`, and README notes

External docs checked:

- AssemblyAI transcript API: `speech_models`, `speaker_labels`, `webhook_auth_header_name`, and `webhook_auth_header_value` are valid request fields.
- Anthropic model docs: `claude-sonnet-4-6` is a valid Claude API model id as of this audit date.
- Supabase Edge Function docs: public webhook functions need per-function JWT verification disabled in `supabase/config.toml`, and `EdgeRuntime.waitUntil` is available for non-blocking background work.

## Current State

Feature 3 is mostly present:

- `trigger-transcription` accepts `source_id`, signs the Supabase Storage file, submits it to AssemblyAI, stores `transcript_id`, and marks the source `transcribing`.
- `assemblyai-webhook` accepts AssemblyAI completion callbacks, fetches the completed transcript, builds 800-1200 word chunks, upserts `chunks`, and invokes extraction.
- `trigger-extraction` fetches chunks, batches them by 5, calls Claude, validates JSON with Zod, stores pending extraction rows, and moves the source to `review`.
- Failed stages exist in the enum.
- `sources.transcript_id` exists and has a partial unique index.
- The admin rerun helper is now stage-aware for transcription and extraction.

The implementation is a strong first pass, but it should not be treated as production-ready yet. The biggest remaining risks are webhook authentication/deployment, long-running synchronous jobs, duplicate extraction races, missing chunking recovery, and format routing for non-audio sources.

## Confirmed Issues

### P0 - Webhook deployment/auth contract is incomplete

**Files:**

- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/functions/trigger-transcription/index.ts`
- `supabase/config.toml`
- `.env.example`
- `README.md`

**Context:**

`assemblyai-webhook` needs to be callable by AssemblyAI, not by a logged-in Supabase user. The repo currently has no `[functions.assemblyai-webhook]` section in `supabase/config.toml`.

Supabase Edge Functions require JWT verification by default. If that default remains active, AssemblyAI callbacks will be rejected before the handler runs. If JWT verification is disabled later but `ASSEMBLYAI_WEBHOOK_SECRET` is missing, `verifyWebhookSecret()` silently returns and the webhook becomes unauthenticated.

The AssemblyAI request payload correctly supports custom webhook auth headers, but the handler must fail closed when that shared secret is absent in production.

**Why this matters:**

There are two bad deployment modes:

- JWT verification left on: real AssemblyAI webhooks never reach the function.
- JWT verification off and no shared secret: anyone who knows the endpoint can post a matching `transcript_id`, trigger chunking/extraction, consume API quota, and mutate pipeline state.

**Fix approach:**

- Add explicit function config:

```toml
[functions.assemblyai-webhook]
verify_jwt = false
```

- Keep JWT verification on for `trigger-transcription` and `trigger-extraction`.
- Make `ASSEMBLYAI_WEBHOOK_SECRET` operationally required when the webhook is deployed publicly.
- In `assemblyai-webhook`, fail closed if the secret is absent unless a local-dev flag is explicitly set, for example:

```ts
const webhookSecret = Deno.env.get('ASSEMBLYAI_WEBHOOK_SECRET')
const allowUnsignedWebhooks = Deno.env.get('ALLOW_UNSIGNED_ASSEMBLYAI_WEBHOOKS') === 'true'

if (!webhookSecret && !allowUnsignedWebhooks) {
  throw new Error('ASSEMBLYAI_WEBHOOK_SECRET is required.')
}
```

- Update `.env.example` and README to mark the webhook secret as required for deployed environments.

### P0 - The webhook waits for the full extraction job

**Files:**

- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/functions/_shared/pipeline.ts`
- `supabase/functions/trigger-extraction/index.ts`

**Context:**

`assemblyai-webhook` awaits `invokeInternalFunction('trigger-extraction', ...)`. `invokeInternalFunction` awaits the full response from `trigger-extraction`.

For large sources, extraction can involve many Claude calls. That means the AssemblyAI webhook response is blocked on the slowest and most expensive part of the pipeline.

**Why this matters:**

Webhook senders expect quick acknowledgement. A long-running response can time out and cause duplicate webhook retries while extraction is still running. The same pattern also risks Supabase Edge Function duration limits once the corpus moves beyond small test sources.

**Fix approach:**

- Decouple webhook acknowledgement from extraction processing.
- Short-term: use `EdgeRuntime.waitUntil(invokeInternalFunction(...))` and return a success response immediately after chunks are stored.
- Better: create a pipeline job table, insert an extraction job, return from the webhook, and process jobs in a separate worker/batch function.
- Make `trigger-extraction` resumable by source and batch cursor so long sources can be processed across multiple invocations.
- Keep source state transitions explicit: `chunking` while chunks are being created, `extracting` when the extraction job is queued or started, `review` when all chunks have extraction rows.

### P0 - Concurrent extraction can create duplicate extraction rows

**Files:**

- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/functions/trigger-extraction/index.ts`
- `supabase/migrations/20260523020000_core_tables.sql`

**Context:**

The `chunks` table has `unique (source_id, chunk_index)`, so duplicate webhook deliveries do not duplicate chunks.

The `extractions` table does not have a uniqueness constraint on `chunk_id`. `trigger-extraction` checks for embedded `extractions(id)` before inserting, but two concurrent invocations can both read "no extractions yet" and both insert rows for the same chunks.

This can happen when:

- AssemblyAI retries the same webhook while the first extraction is still running.
- An admin manually clicks rerun while an automatic extraction is active.
- Two internal invocations race after duplicate webhook deliveries.

**Why this matters:**

Duplicate pending extraction rows will confuse Feature 5. The review queue may show the same chunk twice, and confirming/rejecting one row will not resolve the duplicate.

**Fix approach:**

- Decide whether the intended durable shape is one extraction row per chunk.
- If yes, add a migration:

```sql
create unique index if not exists extractions_chunk_id_unique
on public.extractions (chunk_id);
```

- Change inserts to `upsert(..., { onConflict: 'chunk_id', ignoreDuplicates: true })` or handle unique violations as "already processed."
- If multiple extraction attempts need to be preserved, add `extraction_runs` or `extraction_attempts` instead of allowing duplicate pending rows in `extractions`.
- Add a test or migration assertion that duplicate extraction insertion is rejected.

### P1 - There is no admin-callable chunking recovery path

**Files:**

- `src/lib/api/admin.ts`
- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/functions/trigger-transcription/index.ts`

**Context:**

Feature 3 requires failed stages to be resumable. The UI currently maps:

- `uploaded`, `transcribing`, `transcribing_failed` -> `trigger-transcription`
- `extracting`, `extracting_failed`, `review`, `curated`, `published` -> `trigger-extraction`
- `chunking`, `chunking_failed` -> disabled with "Recovery unavailable"

Also, a source stuck in `transcribing` with an existing `transcript_id` is not recoverable through `trigger-transcription`. The function returns `{ reused: true }` without checking AssemblyAI status or invoking chunking.

**Why this matters:**

If the AssemblyAI webhook is missed, delayed, rejected, or chunking fails after transcript completion, an admin cannot restart the correct stage from the UI. This leaves a source stuck even though the transcript may already exist.

**Fix approach:**

- Add an admin/service-authenticated `trigger-chunking` function that accepts `{ source_id }`.
- Move shared transcript fetch/chunk build/upsert logic out of `assemblyai-webhook` into a shared module.
- Let `assemblyai-webhook` call the shared chunking helper by `transcript_id`.
- Let `trigger-chunking` fetch `sources.transcript_id`, run the same chunking helper, and enqueue/invoke extraction.
- Update `getPipelineRerunAction()`:
  - `chunking`, `chunking_failed`, stale `transcribing` with `transcript_id` -> `trigger-chunking`
  - `transcribing_failed` without a usable transcript -> `trigger-transcription`
- Add tests for each stage-to-function mapping.

### P1 - Non-audio file sources are routed into an audio transcription function

**Files:**

- `src/pages/admin/AdminSourceNewPage.tsx`
- `src/lib/api/admin.ts`
- `src/lib/sourceUpload.ts`
- `supabase/functions/trigger-transcription/index.ts`

**Context:**

Feature 2 accepts audio, video, text, book, and URL source formats. URL sources are saved without auto-ingestion, but file uploads always call `triggerSourceTranscription(source.id)`.

`trigger-transcription` only implements the AssemblyAI path. It signs `sources.file_path` and submits that URL as `audio_url`.

That works for audio and likely video, but not for `.pdf`, `.docx`, `.epub`, `.txt`, `.md`, or `.rtf`.

**Why this matters:**

Admins can upload a supported text/book file and immediately get a transcription failure. The UI and bucket validation say the file is supported, but the Edge Function contract is audio/video-only.

**Fix approach:**

- Short-term: only auto-trigger transcription for `format === 'audio' || format === 'video'`.
- For text/book uploads, save the source as `uploaded` and show a clear "text ingestion pending" state.
- Better: add a `trigger-text-ingestion` or `trigger-document-chunking` function that extracts text and creates chunks without AssemblyAI.
- Update `getPipelineRerunAction()` so text/book sources do not map to `trigger-transcription`.
- Add tests for upload behavior by source format.

### P1 - Timestamp precision is rounded away

**Files:**

- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/migrations/20260523020000_core_tables.sql`
- `src/types/database.ts`

**Context:**

AssemblyAI utterances provide millisecond timestamps. `numberFromMilliseconds()` converts them with `Math.round(value / 1000)`.

The schema stores:

- `chunks.start_sec integer`
- `chunks.end_sec integer`
- `source_anchors.start_timestamp_sec integer`
- `source_anchors.end_timestamp_sec integer`

Feature 5 will likely create anchors from chunk ranges. With integer seconds, source playback links can land up to about a second away from the actual utterance boundary.

**Why this matters:**

This is cheap to fix before real data exists and painful after chunks and anchors have been populated.

**Fix approach:**

- Prefer one of these schema directions:
  - Store milliseconds as integers: `start_ms`, `end_ms`, `start_timestamp_ms`, `end_timestamp_ms`.
  - Store seconds with decimals: `double precision` or `numeric(12,3)`.
- Update conversion code to preserve precision.
- Update generated types and timestamp formatting helpers.
- If keeping old column names, migrate `integer` to `double precision` and change checks accordingly.

### P1 - Claude output budget and structured-output reliability are too weak

**Files:**

- `supabase/functions/trigger-extraction/index.ts`

**Context:**

Each extraction request can include 5 chunks, and each chunk can be up to roughly 1200 words. `max_tokens` is fixed at `4000`.

Dense mythology material can produce large JSON: multiple entities, aliases, descriptions, and several claims per chunk. If Claude truncates mid-JSON, the Zod parse fails and all chunks in that batch become `validation_failed`.

The current prompt asks for JSON, but the API call does not use a stricter structured-output path such as tool use.

**Why this matters:**

The pipeline can complete technically while producing many empty validation-failed rows. Feature 5 would then present little useful review data for dense sources.

**Fix approach:**

- Raise `max_tokens` to a safer value for the selected model, for example `8192` or a dynamic value based on batch word count.
- Consider reducing batch size for very large chunks.
- Use Anthropic tool use with a JSON schema-like tool input to force structured output more reliably.
- Store validation errors in a way that lets admins see the raw model response and the parse reason.
- Add a fixture test for a validation failure and a large valid response.

### P1 - Claude calls have no retry/backoff and only per-invocation rate limiting

**Files:**

- `supabase/functions/trigger-extraction/index.ts`

**Context:**

`callClaude()` throws on any non-OK response. There is no retry for transient `429`, `500`, `529`, network errors, or response parsing failures caused by temporary service issues.

The 200ms sleep caps one invocation at roughly 5 requests per second, but it does not coordinate across concurrent sources. Two sources can each run at the full per-invocation rate and exceed the API key's real account-level limits.

**Why this matters:**

One temporary Anthropic error marks the whole source `extracting_failed`. Concurrent ingestion makes this more likely.

**Fix approach:**

- Add retry logic around Claude calls:
  - Retry transient statuses such as `408`, `409`, `425`, `429`, `500`, `502`, `503`, `504`, and `529`.
  - Use exponential backoff with jitter, for example 1s, 2s, 4s.
  - Respect `Retry-After` when present.
- Keep validation failures non-retried unless the raw response is truncated due to `max_tokens`.
- Add a cross-invocation limiter before bulk ingestion:
  - A queue table with one active extraction worker.
  - Or a database advisory lock around each Anthropic request.
  - Or an external rate-limit service if the pipeline grows.
- Record retry count and final provider status in extraction metadata or a pipeline log.

### P1 - Chunk reuse path skips the `chunking` stage breadcrumb

**File:**

- `supabase/functions/assemblyai-webhook/index.ts`

**Context:**

When chunks already exist, the webhook invokes extraction immediately:

```ts
if ((chunkCount ?? 0) > 0) {
  failureStage = 'extracting_failed'
  await invokeInternalFunction('trigger-extraction', { source_id: source.id })
  return jsonResponse({ reused_chunks: true, source_id: source.id })
}
```

The normal path marks the source `chunking` before fetching the transcript. The reuse path jumps straight from the current stage into whatever `trigger-extraction` does next.

**Why this matters:**

It makes the pipeline trail harder to reason about and can make realtime UI state look like chunking never reran.

**Fix approach:**

- Set `pipeline_stage = 'chunking'` before reusing chunks.
- If chunk reuse becomes an explicit recovery path, return a response that says chunks were reused and extraction was queued.

### P2 - Validation-failed rows duplicate the full raw Claude response

**File:**

- `supabase/functions/trigger-extraction/index.ts`

**Context:**

When a batch fails validation, `createValidationFailedExtraction()` stores the same full `raw_response` string on every chunk in that batch.

**Why this matters:**

This is not a correctness bug, but it bloats JSONB and makes Supabase dashboard inspection noisy.

**Fix approach:**

- Store `raw_response` only on the first failed row in a batch and put a shared `batch_error_id` on the rest.
- Better: add `extraction_runs` or `extraction_debug_logs`:
  - `id`
  - `source_id`
  - `chunk_ids`
  - `provider`
  - `model`
  - `raw_response`
  - `error_message`
  - `created_at`
- Keep per-chunk rows small and review-friendly.

### P2 - Entity resolution only scores an arbitrary first 500 entities

**File:**

- `supabase/functions/trigger-extraction/index.ts`

**Context:**

The code fetches up to 500 non-archived entities:

```ts
.from('entities')
.select('name,aliases')
.neq('status', 'archived')
.limit(500)
```

It then scores those 500 by token overlap and keeps 50. There is no ordering, paging, trigram search, or full-text candidate query. Once the graph has more than 500 entities, relevant canonical names can be excluded before scoring even starts.

**Why this matters:**

The extraction prompt may create duplicates because the correct canonical entity was not included in context.

**Fix approach:**

- Replace arbitrary `.limit(500)` with a candidate query based on the batch text.
- Options:
  - Add an RPC that uses `pg_trgm` similarity against `name` and aliases.
  - Page through all active entities if the count is still small enough.
  - Maintain a lightweight entity search index for extraction candidate selection.
- Keep the final prompt list capped at 50 to control token cost.
- Include aliases in the prompt, not only canonical names, so Claude can map mentions more reliably.

### P2 - Review granularity needs to be decided before Feature 5

**Files:**

- `supabase/functions/trigger-extraction/index.ts`
- `supabase/migrations/20260523020000_core_tables.sql`
- `_docs/phases/phase-5-admin-ingestion.md`

**Context:**

Current extraction rows are one row per chunk. `extraction_data` contains arrays of entities and claims.

Feature 5 describes review actions like Confirm, Edit, Reject, Merge, and Split on an individual extracted entity or claim. The current table has one `status` per row, not one status per extracted item inside the JSON arrays.

**Why this matters:**

If one chunk contains five useful entities and one bad claim, the UI needs item-level decisions. A single row-level `status` cannot represent "confirm these three, reject that one, merge this one."

**Fix approach:**

- Decide one of these before building Feature 5:
  - Keep one extraction row per chunk and add item-level status fields inside `extraction_data`.
  - Split model output into separate extraction rows per proposed entity/claim.
  - Add a new `extraction_items` table linked to the chunk-level extraction row.
- If keeping one row per chunk for concurrency safety, Feature 5 must update nested JSON or create item records during review.
- Add tests/fixtures representing a chunk with multiple entities and claims.

### P2 - Speaker attribution is flattened for multi-speaker chunks

**File:**

- `supabase/functions/assemblyai-webhook/index.ts`

**Context:**

`toChunkRow()` stores `speaker` only when every segment in the chunk has the same speaker. Multi-speaker chunks get `speaker: null`, and the speaker turns are lost except for paragraph breaks in `raw_text`.

**Why this matters:**

Speaker attribution matters for source review, especially if a host and researcher discuss the same myth. Feature 5's review panel will be more useful if it can show speaker turns.

**Fix approach:**

- Add a `segments jsonb` or `speaker_turns jsonb` column to `chunks`.
- Store each segment's `{ speaker, start_sec/start_ms, end_sec/end_ms, text }`.
- Keep `speaker text` as a quick single-speaker summary.
- Update the public transcript viewer and future review UI to prefer segment turns when present.

### P2 - Pipeline errors are not persisted

**Files:**

- `supabase/functions/trigger-transcription/index.ts`
- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/functions/trigger-extraction/index.ts`
- `supabase/migrations/20260523020000_core_tables.sql`

**Context:**

Failures update `pipeline_stage` to a failed enum value and return an error response, but the source row does not keep the last error message.

**Why this matters:**

The admin dashboard can show that a source failed but not why. After a page refresh, route-state warnings from upload are gone.

**Fix approach:**

- Add `sources.pipeline_error text` or a separate `pipeline_events` table.
- On stage start, clear the last error.
- On failure, persist:
  - stage
  - error message
  - provider status code if available
  - timestamp
  - retryable flag if known
- Surface the latest error in source detail and the pipeline monitor.

### P3 - Unknown or stale webhooks return 500

**File:**

- `supabase/functions/assemblyai-webhook/index.ts`

**Context:**

If the webhook receives a `transcript_id` that no source currently owns, it throws and returns 500.

This can happen legitimately when a source is re-transcribed after a failure and the old AssemblyAI job later sends a callback. The source no longer has the old `transcript_id`.

**Why this matters:**

Returning 500 can cause repeated webhook retries for a callback the app will never process.

**Fix approach:**

- If the signature is valid but no source matches the transcript, return a 200 or 202 with `{ ignored: true }`.
- Log the transcript id for diagnostics.
- Keep invalid signatures as 401/403.

### P3 - Deno dependency and check workflow is missing

**Files:**

- `supabase/functions/_shared/pipeline.ts`
- `supabase/functions/trigger-extraction/index.ts`
- `supabase/functions/trigger-transcription/index.ts`
- `supabase/functions/assemblyai-webhook/index.ts`
- `supabase/functions/deno.json` (missing)
- CI config, if/when present

**Context:**

Dependencies are pinned inline with `npm:` imports. There is no `supabase/functions/deno.json`, import map, or lock file. Deno is also not installed locally right now, so the Edge Functions were not type-checked with `deno check`.

**Why this matters:**

The React app can pass `npm run typecheck` while Edge Function-specific type errors remain hidden.

**Fix approach:**

- Add `supabase/functions/deno.json` with shared imports.
- Add a Deno lock file if the repo standardizes on one.
- Add scripts/docs for:

```powershell
deno check supabase/functions/trigger-transcription/index.ts
deno check supabase/functions/assemblyai-webhook/index.ts
deno check supabase/functions/trigger-extraction/index.ts
```

- Add CI coverage once Deno is available in the pipeline.

## Validated Non-Issues

These were checked and do not need fixes right now:

- `speech_models` is a valid AssemblyAI transcript request parameter. The older singular `speech_model` is deprecated.
- AssemblyAI webhook auth header fields are valid: `webhook_auth_header_name` and `webhook_auth_header_value`.
- `claude-sonnet-4-6` is a valid current Anthropic API model id.
- The failed pipeline enum values already exist in `20260530050000_admin_dashboard_hardening.sql`.
- `sources.transcript_id` is needed and the partial unique index is appropriate.
- The source upload cleanup, storage delete policy, storage MIME restriction, and client UUID fallback concerns from the Feature 2 audit appear to have been addressed already.

## Battle Plan

1. Fix the webhook security/deployment contract.
   - Add `[functions.assemblyai-webhook] verify_jwt = false`.
   - Make `ASSEMBLYAI_WEBHOOK_SECRET` fail closed outside explicit local development.
   - Document required deployment secrets.

2. Split chunking into a reusable admin-recoverable path.
   - Extract transcript fetch + segment parsing + chunk upsert helpers.
   - Add `trigger-chunking` with admin/service auth and `{ source_id }`.
   - Update `assemblyai-webhook` to call the shared helper.
   - Update rerun mapping for `chunking`, `chunking_failed`, and stale `transcribing`.

3. Stop webhook responses from waiting on extraction.
   - Return from `assemblyai-webhook` as soon as chunks are stored and extraction is queued/backgrounded.
   - Use `EdgeRuntime.waitUntil` short-term or a database job queue for the durable version.
   - Make extraction resumable by source and batch cursor before large-source ingestion.

4. Make extraction concurrency-safe.
   - Add a uniqueness/locking strategy for extraction rows.
   - Change inserts to upsert or duplicate-safe inserts.
   - Add tests for duplicate extraction invocation.

5. Correct source format routing.
   - Only auto-trigger AssemblyAI for audio/video.
   - Leave text/book as `uploaded` until a text/document chunking path exists, or implement that path now.
   - Update UI labels and rerun actions accordingly.

6. Preserve timestamp precision before real data is ingested.
   - Choose milliseconds or decimal seconds.
   - Migrate chunk and source anchor timestamp columns.
   - Update conversion code, types, and formatting helpers.

7. Harden Claude extraction reliability.
   - Raise/dynamically compute `max_tokens`.
   - Add retry/backoff with jitter and `Retry-After` handling.
   - Decide whether to use Anthropic tool use for stronger JSON.
   - Add provider error metadata.

8. Add pipeline observability.
   - Persist last pipeline error or create `pipeline_events`.
   - Surface latest failure details in source detail and monitor UI.
   - Track validation-failed counts.

9. Resolve Feature 5 data-shape questions.
   - Decide per-chunk vs per-item extraction review storage.
   - Add schema/helper changes before building review actions.
   - Add fixtures for multi-entity/multi-claim chunks.

10. Clean up lower-priority quality items.
    - Avoid repeated raw response blobs.
    - Improve entity candidate selection beyond the arbitrary first 500 rows.
    - Store speaker turns.
    - Add Deno config and Edge Function type checks.
    - Return ignored success for valid but stale webhook callbacks.
