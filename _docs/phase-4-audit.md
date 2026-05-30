# Phase 4 Search Audit

This audit reviews the current Phase 4 implementation against `_docs/phases/phase-4-search.md` and the working tree. The core search features are implemented, but several correctness, cancellation, graph-focus, and polish issues should be fixed before treating Phase 4 as complete.

## Completion Summary

| Area | Status | Notes |
| --- | --- | --- |
| Supabase FTS + fuzzy search | Mostly complete | SQL functions exist, but JSON aggregation should explicitly preserve relevance order. |
| Nav bar live search | Complete with cleanup | Functional. Shared cleanup can reduce duplication. |
| Full search results page | Mostly complete | Functional, but should forward TanStack Query cancellation signal. |
| Graph search integration | Needs fixes | Entity selection can silently fail when a result is not loaded in the current graph. Graph search also fetches more data than it needs. |
| Search index maintenance | Partial | Generated `fts` columns do the real indexing work, but `refresh_search_indexes` currently reports success even if its defensive check finds bad rows. |

## Critical Issues

### 1. Graph focus silently fails when the searched entity is not in the current graph

**File:** `src/components/graph/GraphCanvas.tsx`

`GraphCanvas` currently exits early when `focusedNodeId` is missing from the rendered graph:

```ts
if (!focusedNodeId || !currentGraph || !renderer || !currentGraph.hasNode(focusedNodeId)) {
  return
}
```

This is a real bug. Search can return a published entity that is not currently present in the graph data cached by the graph query. In that case, neither `onFocusBlocked` nor `onFocusedNodeSettled` fires, so `GraphPage` can keep a stale `focusedNodeId` with no user feedback.

**Fix:**

- Split the early return cases.
- If there is no `focusedNodeId`, return normally.
- If the graph or renderer is not ready, return and let the effect rerun when graph state is ready.
- If the graph is ready but does not contain the node, call a new missing-node handler or call `onFocusBlocked` with a reason.
- Show a message that distinguishes missing graph data from active filters, such as: `This entity is not loaded in the current graph view.`
- Include `graph` or an equivalent graph-ready dependency in the focus effect so focus can retry after graph data changes.

### 2. Hidden-entity retry state is fragile

**File:** `src/pages/GraphPage.tsx`

The audit's original claim that the toast can render a blank entity name is overstated. If `pendingFocusName` is `null`, the current code sets `hiddenSearchResultName` to `null`, so the toast disappears rather than rendering a blank name.

However, the state model is still fragile because the blocked entity ID and display name are stored separately and depend on `pendingFocusName` still being populated when `handleFocusBlocked` runs.

**Fix:**

- Store blocked search state as one object, for example:

```ts
type BlockedFocus = {
  id: string
  name: string
  reason: 'hidden' | 'missing'
} | null
```

- Store the pending focus as `{ id, name }`, not just separate `focusedNodeId` and `pendingFocusName`.
- When clearing filters, retry from the blocked object so both ID and name remain available.
- Use different copy for hidden-by-filter versus missing-from-graph cases.

## Correctness Issues

### 3. Search RPC fallback does not honor AbortSignal at the API boundary

**File:** `src/lib/api/search.ts`

`searchAll` passes `options.signal` to the Edge Function call, but the RPC fallback does not receive or re-check the signal:

```ts
return searchViaRpc(trimmedQuery)
```

The original audit's stale-result warning is partly overstated for `useSearch`, because `useSearch` checks `controller.signal.aborted` before setting state. Still, this is a real API-level cancellation bug. Direct callers and future hooks should get consistent abort behavior from `searchAll`.

**Fix:**

- Thread `signal` into `searchViaRpc`.
- Because `supabase.rpc()` does not expose an abort signal, check `signal.aborted` before and after the RPC resolves.
- Throw `DOMException('Aborted', 'AbortError')` when aborted.

### 4. Full search page does not forward TanStack Query's AbortSignal

**File:** `src/pages/search/SearchPage.tsx`

The full search page currently uses:

```ts
queryFn: () => searchAll(query)
```

This leaves the request alive when TanStack Query cancels the query, such as during navigation or rapid query changes.

**Fix:**

```ts
queryFn: ({ signal }) => searchAll(query, { signal })
```

### 5. `search_global` JSON aggregation should explicitly preserve ordering

**File:** `supabase/migrations/20260530030000_search_functions.sql`

The function builds ordered CTEs, then aggregates with:

```sql
jsonb_agg(result)
```

PostgreSQL is not required to preserve the inner CTE order during aggregation. This can produce nondeterministic ordering. The original audit called out claims and sources, but entities should be fixed too.

**Fix:**

- Carry sort columns through each result CTE.
- Use ordered aggregates:

```sql
jsonb_agg(result order by rank desc, name asc)
jsonb_agg(result order by rank desc, confidence_score desc)
jsonb_agg(result order by rank desc, title asc)
```

- Ensure `source_matches` ordering still uses `distinct on (source_id)` correctly before final result ordering.

## Incomplete Improvements

### 6. Graph search fetches global results when it only needs entities

**File:** `src/components/graph/GraphSearchBar.tsx`

`GraphSearchBar` uses `useSearch`, which calls `searchAll`, then only uses `results.entities`. This fetches and deserializes claims and sources on every graph-search keystroke even though the graph only needs entities.

**Fix:**

- Add abort-aware support to `searchEntities(query, { signal })`.
- Use a graph-specific debounced query or a small `useEntitySearch` hook.
- Call `searchEntities` directly from `GraphSearchBar`.

### 7. `searchEntities` is currently unused

**File:** `src/lib/api/search.ts`

This is not a bug by itself, but it indicates the graph search is not using the intended entity-only primitive.

**Fix:**

- Wire `searchEntities` into graph search as described above.
- Keep `searchAll` for nav search and the full search page.

### 8. `refresh_search_indexes` is a no-op check

**Files:**

- `src/lib/api/search.ts`
- `supabase/migrations/20260530030000_search_functions.sql`

The phase spec notes that `fts` generated columns update automatically. That part is correct, and the existing integration test is the important verification.

However, `refresh_search_indexes` currently performs a check and discards the result:

```sql
perform 1
from public.entities
where status = 'published'
  and fts is null
limit 1;
```

This means callers get a successful response even if the defensive check finds a problem.

**Fix:**

Choose one of these approaches:

- Preferred: make the function return a small status object, such as `{ ok: true, missingEntityFts: 0, missingChunkFts: 0 }`.
- Acceptable: raise an exception if any published entity or chunk has a null `fts`.
- Also check `chunks.fts`, since Phase 4 search depends on chunk transcript search too.

## Cleanup

### 9. `EMPTY_RESULTS` is duplicated

**Files:**

- `src/lib/api/search.ts`
- `src/hooks/useSearch.ts`
- `src/pages/search/SearchPage.tsx`

**Fix:**

- Export a shared `EMPTY_SEARCH_RESULTS` constant from `src/lib/searchResults.ts` or `src/lib/api/search.ts`.
- Import it everywhere.

### 10. `stripHeadlineTags` is duplicated

**Files:**

- `src/components/search/SearchDropdown.tsx`
- `src/pages/search/SearchPage.tsx`

**Fix:**

- Move it to `src/lib/searchResults.ts`.
- Export it as `stripSearchHeadlineTags`.

## Fix Plan

### Task 1: Repair graph focus failure handling

1. Refactor `GraphPage` focus state to store pending and blocked focus as objects with `id`, `name`, and failure `reason`.
2. Update `GraphCanvas` callbacks to report whether focus is blocked by filters or missing from the graph.
3. In `GraphCanvas`, call the blocked handler when `focusedNodeId` is missing from a ready graph.
4. Add a graph-ready dependency to the focus effect so focus can retry after graph data changes.
5. Update the toast copy and `Clear filters` behavior so hidden nodes retry cleanly and missing nodes show accurate feedback.

### Task 2: Fix cancellation behavior

1. Update `searchViaRpc` to accept an optional `AbortSignal`.
2. Check `signal.aborted` before and after `supabase.rpc()`.
3. Pass the signal from `searchAll` into the RPC fallback.
4. Update `SearchPage` to pass TanStack Query's `signal` into `searchAll`.
5. Add or adjust tests where practical for abort behavior.

### Task 3: Make graph search entity-only

1. Add options support to `searchEntities(query, { signal })`.
2. Create a small entity-search hook or inline debounced query in `GraphSearchBar`.
3. Replace `useSearch` usage in `GraphSearchBar` with `searchEntities`.
4. Keep keyboard navigation, loading, error, and empty states unchanged.

### Task 4: Make SQL ordering deterministic

1. Update `search_global` result CTEs to preserve sort fields.
2. Add `order by` inside each `jsonb_agg`.
3. Include entity result ordering as well as claims and sources.
4. Re-run typecheck and tests after changing database types only if function return types change.

### Task 5: Make search index maintenance meaningful

1. Decide whether `refresh_search_indexes` should return a status object or raise on failed defensive checks.
2. Check both `entities.fts` and `chunks.fts`.
3. Update `src/types/database.ts` if the RPC return type changes.
4. Update `refreshSearchIndexes` in `src/lib/api/search.ts` to return or validate the result.

### Task 6: Cleanup shared helpers

1. Move `EMPTY_SEARCH_RESULTS` to a shared module.
2. Move `stripSearchHeadlineTags` to `src/lib/searchResults.ts`.
3. Update imports in the hook, API module, dropdown, and full search page.

### Task 7: Verification

1. Run `npm.cmd run lint`.
2. Run `npm.cmd run typecheck`.
3. Run `npm.cmd run test`.
4. Run `npm.cmd run build`.
5. Manually verify in the running app:
   - Nav search still opens and navigates.
   - Full `/search?q=...` results still group and filter correctly.
   - Graph search focuses a visible entity.
   - Graph search reports a filtered entity and `Clear filters` retries it.
   - Graph search reports a missing graph entity without leaving stale focus state.
