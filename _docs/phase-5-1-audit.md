# Phase 5.1 Audit - Admin Dashboard and Pipeline Monitor

This audit reviews the Feature 1 implementation from `_docs/phases/phase-5-admin-ingestion.md` against the current code and schema. The dashboard, admin shell, stat cards, source monitor table, content charts, and realtime subscription are present, but several correctness and operational issues should be fixed before treating this feature as complete.

## Scope Checked

- `src/pages/admin/AdminDashboardPage.tsx`
- `src/components/admin/PipelineMonitor.tsx`
- `src/lib/api/admin.ts`
- `src/components/layout/AdminShell.tsx`
- `src/components/auth/RequireAdmin.tsx`
- `src/components/auth/AuthBootstrap.tsx`
- `src/stores/authStore.ts`
- `src/pages/admin/AdminLoginPage.tsx`
- `src/router.tsx`
- `src/constants/routes.ts`
- Supabase migrations and generated types for `sources`, `entities`, `claims`, `extractions`, and `pipeline_stage`

## Confirmed Findings

### P0 - Auth role fetch failures can lock the admin UI in an infinite loading state

**Files:**

- `src/stores/authStore.ts`
- `src/components/auth/AuthBootstrap.tsx`
- `src/components/auth/RequireAdmin.tsx`

**Context:**

`hydrate()` and `setSession()` set `isLoading: true`, then call `getRoleForSession()`. If the `profiles` query fails because of a transient network error, RLS problem, missing local Supabase state, or any other Supabase error, the thrown error prevents the final `set({ ..., isLoading: false })` from running.

`AuthBootstrap` calls both methods with `void`, so rejected promises are not surfaced to the UI. `RequireAdmin` then sees `isLoading === true` forever and renders only the loading screen.

**Why this matters:**

This turns a recoverable auth/profile lookup failure into a hard admin lockout. It also hides the actual error from the person trying to sign in.

**Fix approach:**

- Wrap the role fetch in `try/catch/finally` in both `hydrate()` and `setSession()`.
- Always set `isLoading: false` in the failure path.
- Clear `role` on role-fetch failure so stale admin privileges are not retained.
- Add an `error` field to the auth store or use an explicit no-admin/error state so `RequireAdmin` can render a useful message.
- In `AuthBootstrap`, do not leave promise rejections completely unobserved. Either catch and store the error in Zustand, or let the store method fully absorb expected Supabase errors.

**Suggested target behavior:**

- Session fetch fails: no session, no role, `isLoading: false`, visible auth error.
- Profile role fetch fails: keep the session only if desired, clear role, `isLoading: false`, visible profile/admin-access error.
- No profile row: no role, `isLoading: false`, current "No admin profile" message remains valid.

### P1 - "Time in current stage" is not actually stage time

**Files:**

- `src/components/admin/PipelineMonitor.tsx`
- `src/lib/api/admin.ts`
- `supabase/migrations/20260530040000_sources_updated_at_trigger.sql`
- `supabase/migrations/20260523020000_core_tables.sql`

**Context:**

`PipelineMonitor` computes the time column from `source.updated_at`. The added `sources_set_updated_at` trigger updates that column on every source update, not only when `pipeline_stage` changes.

That means editing a title, description, file path, URL, status, or any other source field resets the displayed stage age.

**Why this matters:**

The Feature 1 spec asks for "time in current stage". Admins need this to identify stalled sources. Using `updated_at` can hide a source that has been stuck for hours if any unrelated metadata edit happened recently.

**Fix approach:**

- Add a dedicated `pipeline_stage_entered_at timestamptz not null default now()` column to `public.sources`.
- Add a trigger that updates `pipeline_stage_entered_at = now()` only when `old.pipeline_stage is distinct from new.pipeline_stage`.
- Keep `updated_at` as the generic row-modified timestamp.
- Regenerate `src/types/database.ts`.
- Update `AdminSourceRow` usage and `PipelineMonitor` to compute stage age from `pipeline_stage_entered_at`.
- Backfill existing rows by setting `pipeline_stage_entered_at = updated_at` in the migration.

**Implementation note:**

The current generic `public.set_updated_at()` trigger function is fine for `updated_at`, but it should not be used to infer pipeline-stage duration.

### P1 - Content stats silently undercount after 1000 rows

**File:**

- `src/lib/api/admin.ts`

**Context:**

`getAdminContentStats()` fetches:

- `entities.select('type, status, confidence_score')`
- `claims.select('status, confidence_score')`

It then performs all grouping and bucketing in the browser.

Supabase/PostgREST responses are paginated and commonly capped at 1000 rows by default. Once the project has more than 1000 entities or claims, the dashboard charts can silently show plausible but wrong numbers.

**Why this matters:**

The project overview expects the source library and graph content to grow substantially. Admin stats need to remain trustworthy as the corpus scales.

**Fix approach:**

- Move aggregation to Postgres instead of fetching every row.
- Prefer one RPC, for example `get_admin_content_stats()`, returning:
  - entity counts grouped by `type`
  - confidence buckets grouped across entities and claims
  - content status counts for entities and claims
- Use `count(*)` and `group by` in SQL.
- For confidence distribution, use the effective confidence value: `coalesce(confidence_override, confidence_score)`.
- Add the function to generated Supabase types, then call it from `getAdminContentStats()`.

**Alternative short-term fix:**

Separate exact count queries per bucket/type/status would be accurate and simpler, but it would produce many queries. A single RPC is cleaner and easier to keep consistent.

### P1 - Supabase Realtime is subscribed in React, but the table is not enabled for Postgres changes in migrations

**Files:**

- `src/lib/api/admin.ts`
- Supabase migrations

**Context:**

`subscribeToSourceUpdates()` uses:

```ts
supabase
  .channel('sources')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sources' }, handler)
```

No migration currently adds `public.sources` to the `supabase_realtime` publication.

**Why this matters:**

In a fresh Supabase environment, the client subscription can be correct while no Postgres change events are emitted for `sources`. The pipeline monitor would only update after a manual refresh.

**Fix approach:**

- Add a migration that enables realtime for `public.sources`, for example:

```sql
alter publication supabase_realtime add table public.sources;
```

- Make the migration idempotent enough for local resets and remote environments. If direct `alter publication` may fail when the table is already present, wrap it in a `do $$ ... exception when duplicate_object then null; end $$;` block or use the Supabase-recommended pattern for the project version.
- Confirm whether row-level security and the authenticated user's policies allow admin clients to receive the update payloads they need.

### P1 - Auth bootstrap can race concurrent session/role hydration paths

**Files:**

- `src/components/auth/AuthBootstrap.tsx`
- `src/stores/authStore.ts`

**Context:**

On mount, `AuthBootstrap` calls `hydrate()`. It also registers `onAuthStateChange()`, which Supabase can call with the initial session. Both paths can call `getRoleForSession()` concurrently.

In React StrictMode, this can be amplified by mount/unmount/remount behavior during development.

**Why this matters:**

Whichever role lookup resolves last wins. If the session changes while a prior lookup is still in flight, a stale result can overwrite the correct session/role pair.

**Fix approach:**

- Centralize auth initialization so only one path owns the initial session load.
- Track a monotonically increasing request id in the store and only apply the latest request's result.
- Before applying a role lookup result, verify it still belongs to the current session user id.
- Consider treating `INITIAL_SESSION` from `onAuthStateChange` as the initial source of truth and removing the separate `getSession()` call, or vice versa.

**Suggested acceptance test:**

Mock two role lookups resolving out of order and assert that the stale lookup cannot overwrite the newer session state.

### P2 - The "Pending Review" stat is ambiguous and may not match admin workload

**File:**

- `src/lib/api/admin.ts`

**Context:**

`getAdminDashboardCounts()` currently computes `pendingReview` as:

```ts
extractions.status = 'pending'
```

This can be a legitimate interpretation because Feature 5's review queue is based on pending extraction rows. However, on the Feature 1 dashboard, "Pending Review" sits next to pipeline-level cards and the monitor actions switch to "Review" when `sources.pipeline_stage === 'review'`.

Those are two different units:

- pending extraction rows = individual AI proposals to review
- sources in review = source records ready for admin attention

**Why this matters:**

If one source has 500 pending extraction proposals, the card may show `500 Pending Review` even though the actionable source workload is one source. That can be correct for item volume, but misleading for pipeline triage.

**Fix approach:**

Pick one meaning and encode it in both label and query.

Option A - Source workload:

- Query `sources` where `pipeline_stage = 'review'`.
- Label the card `Sources In Review`.
- Use this if the dashboard is primarily a pipeline monitor.

Option B - Review item volume:

- Keep querying `extractions.status = 'pending'`.
- Rename the card to `Pending Extractions`.
- Optionally add a separate `Sources In Review` card or sublabel.

**Recommendation:**

Use both metrics if space permits: one source-level card for pipeline triage and one extraction-level number in the review queue page. If only four cards remain, change this card to `Sources In Review` for Feature 1 and let Feature 5 own pending extraction volume.

### P2 - Login ignores the originally requested admin route

**Files:**

- `src/components/auth/RequireAdmin.tsx`
- `src/pages/admin/AdminLoginPage.tsx`

**Context:**

`RequireAdmin` redirects anonymous users to `/admin/login` with:

```tsx
state={{ from: location }}
```

`AdminLoginPage` never reads that location state. It always redirects to `ROUTES.ADMIN_DASHBOARD` after sign-in and when an already-authenticated user lands on the login page.

**Why this matters:**

Deep links like `/admin/claims`, `/admin/sources`, or future source-detail routes always bounce to the dashboard after login. The existing `state.from` plumbing is currently dead code.

**Fix approach:**

- Use `useLocation()` in `AdminLoginPage`.
- Read and validate `location.state?.from?.pathname`.
- Redirect to that route after successful login when it is an internal admin path.
- Fall back to `ROUTES.ADMIN_DASHBOARD`.
- Use the same destination in the `session` effect.

**Guardrail:**

Do not redirect to arbitrary external URLs or non-admin paths from state.

### P2 - Source INSERT and DELETE events are not reflected while the monitor is open

**Files:**

- `src/lib/api/admin.ts`
- `src/components/admin/PipelineMonitor.tsx`

**Context:**

Feature 1 specifically requested `UPDATE` events for source stage changes, and that part is implemented. However, Feature 2 will create source rows while admins are actively working in this area. The current monitor will not show newly uploaded sources until a query refetch or page refresh.

Deletes/archives are also not handled. If a source is removed or eventually filtered out, the row can remain stale in the React Query cache.

**Why this matters:**

Once uploads exist, an admin watching the dashboard expects a new source to appear immediately and archived/deleted records to disappear or update.

**Fix approach:**

- Subscribe to `INSERT` and `DELETE` in addition to `UPDATE`, or use `event: '*'`.
- For `INSERT`, validate `payload.new`, add it to the cache, and sort by `created_at desc`.
- For `DELETE`, remove `payload.old.id` from the cache.
- For `UPDATE`, keep the current replace-and-sort behavior.
- If archived sources should remain visible, update the row; if the monitor should only show active pipeline sources, filter them consistently in both the initial query and realtime handler.

**Priority note:**

This is not a strict miss against Feature 1's explicit realtime sentence, but it is worth fixing before Feature 2's upload workflow lands.

### P2 - Failed pipeline stages are not represented yet

**Files:**

- `supabase/migrations/20260523010000_enums.sql`
- `src/types/database.ts`
- `src/lib/api/admin.ts`
- `src/components/admin/PipelineMonitor.tsx`
- `_docs/phases/phase-5-admin-ingestion.md`

**Context:**

The current `pipeline_stage` enum only supports:

- `uploaded`
- `transcribing`
- `chunking`
- `extracting`
- `review`
- `curated`
- `published`

Feature 3.5 says failed stages should update `pipeline_stage` to a `*_failed` status and the admin dashboard should show a "Re-run" button for failed stages.

**Why this matters:**

This is not a current runtime bug because the enum does not yet allow failed values. It becomes a bug as soon as Feature 3 adds those enum variants unless the dashboard code is updated at the same time. The current runtime validator in `isAdminSourceRow()` would reject any unknown stage, causing realtime updates for failed sources to be silently dropped.

**Fix approach:**

- When Feature 3 adds failed enum values, update:
  - the database enum migration
  - generated Supabase types
  - `pipelineStages` in `src/lib/api/admin.ts`
  - `stageLabels` and `getStageClassName()` in `PipelineMonitor`
  - action button logic to show `Re-run` for failed stages
- Consider changing the realtime validator so unknown-but-string stages produce a visible fallback row rather than silently dropping the event.

**Suggested failed stages:**

- `transcribing_failed`
- `chunking_failed`
- `extracting_failed`

Only add variants that the pipeline functions will actually emit.

### P3 - Realtime channel lifecycle uses a shared channel name and fire-and-forget cleanup

**File:**

- `src/lib/api/admin.ts`

**Context:**

`subscribeToSourceUpdates()` creates `supabase.channel('sources')` and returns cleanup that calls:

```ts
void supabase.removeChannel(channel)
```

During remounts, route transitions, or React StrictMode development behavior, a new subscription can be created before the old asynchronous channel removal has fully completed.

**Why this matters:**

This can produce duplicate callbacks or confusing realtime-client state, especially during development. The impact is likely lower than the data correctness issues above because the cache update is mostly idempotent, but the lifecycle is still fragile.

**Fix approach:**

- Use a more specific channel topic, such as `admin-sources-pipeline`.
- If multiple monitor instances are possible, include a stable instance suffix.
- In component cleanup, call the unsubscribe function as today, but keep the channel topic distinct from other future `sources` subscriptions.
- Optionally log subscription status in development so failed subscriptions are easier to diagnose.

### P3 - Admin dashboard tables and charts have no pagination or bounded query strategy for large source sets

**Files:**

- `src/lib/api/admin.ts`
- `src/components/admin/PipelineMonitor.tsx`

**Context:**

`getAdminSources()` selects all source rows and the monitor renders all returned rows. Feature 1 says "listing all sources", so this is acceptable for the initial implementation. The broader project overview, however, says the source library should support up to 10,000 sources.

**Why this matters:**

An unpaginated dashboard table will become slow and visually unwieldy as ingestion scales. It also increases the cost of every dashboard load.

**Fix approach:**

- Keep Feature 1 simple if the dataset is small, but add a follow-up before serious ingestion volume.
- Add `range()` pagination or a "recent pipeline activity" limit on the dashboard.
- Move the full source-management table to `/admin/sources`.
- Keep realtime updates pinned into the current page or show a "new sources available" refresh affordance if pagination makes insertion tricky.

### P3 - Confidence distribution should use effective confidence values

**File:**

- `src/lib/api/admin.ts`

**Context:**

The dashboard confidence distribution uses `confidence_score` directly. Elsewhere in the product, visible confidence often uses:

```ts
confidence_override ?? confidence_score
```

**Why this matters:**

If an admin manually overrides a confidence score, the dashboard distribution can disagree with the confidence values users actually see.

**Fix approach:**

- Include `confidence_override` in the server-side stats aggregation.
- Bucket `coalesce(confidence_override, confidence_score)`.
- Keep raw `confidence_score` available only if a separate "computed vs overridden" admin diagnostic is needed.

### P3 - Pipeline monitor actions point to placeholder routes

**Files:**

- `src/components/admin/PipelineMonitor.tsx`
- `src/router.tsx`
- `src/pages/admin/AdminSourceListPage.tsx`
- `src/pages/admin/AdminReviewQueuePage.tsx`

**Context:**

The monitor action routes are:

- review stage: `/admin/review?source=<id>`
- all other stages: `/admin/sources?source=<id>`

Those routes currently render placeholder pages and do not consume the `source` query parameter.

**Why this matters:**

The button labels satisfy Feature 1, but they do not yet take the admin to source-specific pipeline details or a filtered review queue. Feature 2 explicitly expects redirecting to a source admin detail page with realtime pipeline progress.

**Fix approach:**

- When Feature 2 builds source details, add a route like `/admin/sources/:id`.
- Change non-review monitor actions to that route.
- When Feature 5 builds the review queue, make `/admin/review?source=<id>` focus or filter to that source.
- Until those pages exist, consider disabling query-specific assumptions in tests and copy.

### P3 - No focused tests cover the new admin dashboard API and realtime behavior

**Files:**

- `src/lib/api/admin.ts`
- `src/components/admin/PipelineMonitor.tsx`
- `src/stores/authStore.ts`
- `src/pages/admin/AdminLoginPage.tsx`

**Context:**

The existing test suite covers the public API layer and search behavior. There are no focused tests for:

- admin dashboard count queries
- content stats aggregation
- realtime source cache update behavior
- auth loading failure paths
- login redirect state

**Why this matters:**

The riskiest issues in this audit are state-management and data-correctness problems. They are easy to regress without targeted tests.

**Fix approach:**

- Add unit tests around pure helpers where possible:
  - source sorting
  - stage-age formatting
  - realtime cache updater behavior after `INSERT`, `UPDATE`, and `DELETE`
- Add store tests for auth failure and race behavior using mocked Supabase calls.
- Add a component test for `AdminLoginPage` redirecting to `state.from`.
- If the stats move into an RPC, add a local Supabase integration test for seeded counts.

## Reframed Or Lower Priority Concerns

These were valid things to inspect, but they should not be treated as top-level urgent bugs on their own:

- `pendingReview` counting `extractions.status = 'pending'` is not inherently wrong. It is wrong only if the card is meant to represent source-level review workload. Fix the label/query mismatch rather than assuming one interpretation.
- Missing failed pipeline stages are not a current runtime failure because the database enum does not allow them yet. They are a required follow-up when Feature 3.5 adds failure states.
- UPDATE-only realtime matches Feature 1's exact sentence. INSERT/DELETE support is still worth adding before Feature 2 because the upload workflow will create new source rows while admins are watching the monitor.

## Step-By-Step Battle Plan

1. **Fix auth lockout first.**
   - Update `authStore` so `hydrate()` and `setSession()` always leave `isLoading: false`.
   - Clear stale roles on failure.
   - Add a visible auth/profile error path.
   - Add tests for role-fetch failure.

2. **Remove auth initialization races.**
   - Decide whether `hydrate()` or `onAuthStateChange(INITIAL_SESSION)` owns initial session loading.
   - Add request-id or session-id guards so stale role lookups cannot overwrite newer state.
   - Test out-of-order role lookup resolution.

3. **Fix deep-link login redirects.**
   - Read `location.state.from` in `AdminLoginPage`.
   - Validate that the destination is an internal admin route.
   - Redirect to that destination after sign-in or existing-session detection.

4. **Add precise stage timing.**
   - Add `sources.pipeline_stage_entered_at`.
   - Add a trigger that updates it only when `pipeline_stage` changes.
   - Backfill from `updated_at`.
   - Regenerate Supabase types.
   - Change `PipelineMonitor` to use the new column.

5. **Enable realtime at the database layer.**
   - Add `public.sources` to the `supabase_realtime` publication in a migration.
   - Verify updates are received in a fresh local reset, not only in an already-configured hosted project.

6. **Harden realtime event handling.**
   - Subscribe to `INSERT`, `UPDATE`, and `DELETE` or `event: '*'`.
   - Update the React Query cache correctly for each event.
   - Use a more specific channel topic than plain `sources`.
   - Add tests for the cache update behavior.

7. **Resolve the review metric semantics.**
   - Choose whether the dashboard card means `Sources In Review` or `Pending Extractions`.
   - Update the query and label together.
   - Prefer source-level review count on the dashboard and extraction-level volume in the review queue.

8. **Move content stats to server-side aggregation.**
   - Create `get_admin_content_stats()` in SQL.
   - Use `count(*)`, `group by`, and confidence buckets in Postgres.
   - Bucket `coalesce(confidence_override, confidence_score)`.
   - Update `getAdminContentStats()` to call the RPC.
   - Add an integration test for seeded stats.

9. **Prepare failed pipeline stage support when Feature 3 lands.**
   - Add failed enum values only when the Edge Functions will emit them.
   - Update runtime validators, labels, badge styling, and action buttons.
   - Add "Re-run" behavior for failed stages.

10. **Align monitor actions with future admin detail pages.**
    - Add `/admin/sources/:id` when the source detail page exists.
    - Make `/admin/review?source=<id>` focus the relevant source once the review queue is built.
    - Update monitor links at the same time.

11. **Plan dashboard scaling work before bulk ingestion.**
    - Limit the dashboard monitor to recent pipeline activity or add pagination.
    - Keep the complete source-management table in `/admin/sources`.
    - Revisit this before loading thousands of source records.

12. **Run the verification set.**
    - `npm.cmd run lint`
    - `npm.cmd run typecheck`
    - `npm.cmd run test`
    - `npm.cmd run build`
    - Manual local check: sign-in, visit a deep admin URL, update a source `pipeline_stage`, confirm the monitor row updates without refresh.
