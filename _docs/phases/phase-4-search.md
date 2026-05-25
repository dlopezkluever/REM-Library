# Phase 4 — Global Search

**Goal:** A unified search experience works across the entire knowledge base — entity names, claim text, source titles, and transcript content. Live search dropdown in the nav bar. Full search results page with grouped results and filters. Graph-view search centers the camera on the matching node.

**Builds on:** Phase 1 (FTS indexes on entities and chunks), Phase 3 (encyclopedia pages to link results to)

**Deliverable:** Typing a query in the nav bar shows live grouped results. Pressing Enter navigates to a full results page. Searching from the graph view focuses the matching node. Empty and error states are handled gracefully.

---

## Feature 1 — Supabase full-text search function

1. Create a Supabase Edge Function `supabase/functions/search/index.ts`: accepts a query string; runs `websearch_to_tsquery('english', query)` against `entities.fts` and `chunks.fts`; also runs `word_similarity(query, name)` via pg_trgm for fuzzy entity name matching; returns results grouped by type.
2. Create `src/lib/api/search.ts`: exports `searchAll(query: string): Promise<SearchResults>` — calls the Edge Function via `supabase.functions.invoke('search', { body: { query } })`.
3. Define `SearchResults` type in `src/types/domain.ts`: `{ entities: EntitySearchResult[], claims: ClaimSearchResult[], sources: SourceSearchResult[] }` — each result includes name/statement, type, slug/id, and a `matchedExcerpt` string.
4. Add a PostgreSQL function `search_entities(query text)` as a fallback for when the Edge Function is not needed: uses `ts_rank` for relevance ordering; can be called directly via Supabase PostgREST for simpler queries.
5. Write Vitest integration tests: `searchAll('prometheus')` returns the seeded Prometheus entity; `searchAll('fire theft')` returns relevant results; `searchAll('zzzzz')` returns empty arrays without error.

---

## Feature 2 — Nav bar live search dropdown

1. Add the search trigger to `NavBar.tsx`: a bordered pill button (matching the mockup) that, on click or on `/` keydown from any page, reveals an overlay search input.
2. Create `src/hooks/useSearch.ts`: wraps `searchAll` with a 200ms debounce; manages `query`, `results`, `isLoading`, `error` state; clears results when `query` is empty.
3. Build `SearchDropdown.tsx`: renders below the nav search input; shows up to 3 results per group (Symbols / Figures / Narratives / Tropes / Cultures / Claims / Sources) with entity name (or claim snippet), type badge; a "See all results →" link at the bottom that navigates to `/search?q=[query]`.
4. Clicking a result in the dropdown: navigate to the result's detail page; close the dropdown.
5. Keyboard navigation in dropdown: arrow keys move focus between results; Enter navigates to focused result; Escape closes dropdown and returns focus to the search input.

---

## Feature 3 — Full search results page

1. Build `SearchPage.tsx`: reads `q` from URL search params; calls `searchAll(q)` via TanStack Query with the query as the query key.
2. Render results in expandable sections per type — each section shows type heading (Cinzel label), count badge, and result rows. Each row: name/statement, type badge, matched excerpt with query terms highlighted.
3. Add left sidebar filters: entity type checkboxes, confidence range slider (0–1). Filters apply client-side to the already-fetched results (no re-query needed for filtering).
4. Handle loading state: skeleton rows in each section while the query is pending.
5. Handle empty state: "No results for '[query]'" in Cinzel label + Lora suggestion ("Try broader terms or check the spelling.") when all result arrays are empty.

---

## Feature 4 — Graph view search integration

1. Wire `GraphSearchBar.tsx` (built in Phase 2) to the same `useSearch` hook and `searchAll` function — results are filtered to entities only (since non-entity results have no graph node to navigate to).
2. On selecting a search result from the graph search dropdown: look up the node in the Graphology graph by entity id; call `sigma.getCamera().animate({ x, y, ratio: 0.5 }, { duration: 400, easing: 'cubicInOut' })` to center and zoom on the node.
3. After the camera animation completes: set `graphStore.activeNodeId` to that entity's id (opens the side panel automatically).
4. If the entity exists in the database but its node is currently hidden by a filter: show a toast notification "This entity is hidden by your current filters" with a "Clear filters" action button.
5. Sync the graph search bar with the global nav search bar: if the user types in the nav bar while on the graph page, delegate the search to the graph search bar behavior.

---

## Feature 5 — Search index maintenance

1. Verify that the `fts` generated columns on `entities` and `chunks` update automatically on INSERT and UPDATE (they do — PostgreSQL `GENERATED ALWAYS AS ... STORED` columns recompute on row change). Add a Vitest integration test that inserts a new entity and immediately runs a search query to confirm the new entity is findable.
2. Add a `REFRESH` call pattern: after the admin publishes a batch of curated extractions (Phase 5), trigger a lightweight background job that checks for any entities whose description changed and were not yet indexed (defensive — the generated column handles this, but the test confirms it).
3. Document the search architecture in a code comment in `src/lib/api/search.ts`: note that the Edge Function handles both FTS and fuzzy matching; note the upgrade path to Typesense if latency becomes a concern.
4. Set `staleTime: 30_000` on the search TanStack Query (30 seconds) — search results don't need to be refetched on every render; this reduces Edge Function invocations.
5. Add rate limiting awareness: the Edge Function is invoked per keystroke (debounced). Add an abort controller to `useSearch.ts` so in-flight requests are cancelled when a new query fires before the debounce delay.
