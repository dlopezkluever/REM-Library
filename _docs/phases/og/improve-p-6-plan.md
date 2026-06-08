# Improve Phase 6 Plan

Purpose: this is the master implementation guide for tightening the Phase 6 enhanced features after the audit in `_docs/audits/phase-6-audit.md`.

Source scope:

- Phase spec: `_docs/phases/phase-6-enhanced-features.md`
- Audit: `_docs/audits/phase-6-audit.md`
- PR/branch: `Enhancemaxx`, PR #4

Baseline verification from the audit:

- `npm.cmd run typecheck` passed
- `npm.cmd run test` passed, 96 tests passed / 4 skipped
- `npm.cmd run build` passed
- `npm.cmd run lint` passed
- `npm.cmd run smoke` passed
- GitHub Actions CI for PR #4 passed

## Guiding Principles

1. Preserve the existing Phase 1-5 experience. Phase 6 should stay additive and should not make the initial graph/search/encyclopedia experience heavier unless there is a clear payoff.
2. Prefer small, testable fixes over broad rewrites. Most issues are state, data-policy, and routing improvements.
3. Keep public data boundaries explicit. If content can be drafted by admins, public reads should not expose it by accident.
4. Treat graph-scale behavior as part of correctness. A feature can pass unit tests and still be wrong if it loads too much data or leaves stale graph state.
5. Update tests alongside fixes, especially for pure helpers and data-access contracts.

## Phase 6.1 - 3D Graph View Improvements

### Issue 6.1.1 - Stale 3D hover state after background clear or graph data changes

Priority: P2

Files likely involved:

- `src/components/graph/GraphCanvas3D.tsx`
- `src/stores/graphStore.ts`
- `src/__tests__/lib/graph3dData.test.ts`

Context:

The 3D graph keeps hover state in `hoveredRef`. `colorForNode` checks `hoveredRef.current` before falling back to `activeNodeId`. `onNodeHover` updates the ref, but `onBackgroundClick` only calls `clearInteraction()`. It does not clear `hoveredRef.current`, does not call `setHoveredNodeId(null)`, and does not force node colors to re-evaluate. The 2D graph is more consistent because it derives reducer state from React/store values and refreshes through Sigma settings.

Why it matters:

- The graph can visually keep highlighting the last hovered node even after the user clicks the background.
- If filters change after hovering, the ref can point to a node no longer present in the 3D data.
- This creates a mismatch between the side panel/store state and the visible graph state.

Solution strategy:

1. Add a small local helper in `GraphCanvas3D`, for example `clearHover(instance?)`.
2. In `onBackgroundClick`, clear both interaction channels:
   - `hoveredRef.current = null`
   - `setHoveredNodeId(null)`
   - `clearInteraction()`
   - refresh `nodeColor(colorForNode)` on the current graph instance
3. In the `graphData` effect, after rebuilding `nodeByIdRef`, check whether `hoveredRef.current` is still present.
4. If the hovered node is missing, clear the ref and store hover id, then refresh colors.

Implementation notes:

- Avoid forcing a full graph re-instantiation. Use the existing 3D instance and call `instance.nodeColor(colorForNode)`.
- Keep the callback dependencies stable; `colorForNode` already reads active state from `useGraphStore.getState()`.

Suggested test coverage:

- Add a focused helper if needed so stale hover clearing can be tested without mounting WebGL.
- If component-level WebGL tests are too brittle, cover the state decision with a small pure helper such as `getRetainedHoveredNodeId(hoveredId, nodeIds)`.

### Issue 6.1.2 - Active 3D node can remain selected after filters hide it

Priority: P2

Files likely involved:

- `src/components/graph/GraphCanvas3D.tsx`
- `src/components/graph/GraphCanvas.tsx`
- `src/pages/GraphPage.tsx`

Context:

The 2D graph checks whether the active node is now hidden after filters change and clears `activeNodeId` if necessary. The 3D graph does not currently mirror that behavior. It rebuilds `nodeByIdRef` from capped/filtered `graphData`, but it does not validate whether the current `activeNodeId` still exists in that map.

Why it matters:

- The `GraphSidePanel` can remain open for a node no longer rendered in the 3D graph.
- Toggling back and forth can preserve a stale selection that no longer represents the current filtered view.
- It creates a behavior mismatch between 2D and 3D modes.

Solution strategy:

1. In the `graphData` effect in `GraphCanvas3D`, after assigning `nodeByIdRef.current`, read the current `activeNodeId`.
2. If `activeNodeId` is non-null and not in `nodeByIdRef.current`, call `setActiveNodeId(null)`.
3. Also clear `pendingFocusRef.current` if it points to a missing node.
4. Refresh node colors after clearing.

Implementation notes:

- This should run whenever `graphData` changes, which includes filter changes and node-cap changes.
- Match the 2D graph behavior unless there is a deliberate product reason to keep a selected-but-hidden node.

Suggested test coverage:

- Add a test around a pure helper like `shouldClearActive3DNode(activeNodeId, visibleIds)`.
- Or add a component-level test with the 3D graph constructor mocked.

### Issue 6.1.3 - Cap-excluded nodes are reported as filter-hidden nodes

Priority: P2

Files likely involved:

- `src/lib/graph/graph3dData.ts`
- `src/components/graph/GraphCanvas3D.tsx`
- `src/components/graph/GraphCanvas.tsx`
- `src/pages/GraphPage.tsx`

Context:

The 3D graph caps visible nodes to the top 2,000 by confidence. If a focused node exists in the full graph but is omitted by the cap, the focus path reports it as `'hidden'`. `GraphPage` then displays a "Clear filters" action. That action may not help, because the node may still be outside the top-confidence cap.

Why it matters:

- The UI gives the wrong recovery action.
- Users searching for lower-confidence entities in 3D can get stuck in a confusing loop.
- This is especially likely on large datasets, which is exactly where the cap matters.

Solution strategy:

1. Expand `GraphFocusBlockReason` from `'hidden' | 'missing'` to include a third reason, such as `'capped'`.
2. Update `buildGraph3DData` to return enough metadata to distinguish:
   - total graph node exists
   - filter-visible candidate exists
   - selected 3D rendered node exists
3. In `GraphCanvas3D`, when `graph.hasNode(focusedNodeId)` is true but `nodeByIdRef` lacks the id:
   - if the id passes filters but is outside the selected cap, call `onFocusBlocked(focusedNodeId, 'capped')`
   - otherwise call `onFocusBlocked(focusedNodeId, 'hidden')`
4. Update the blocked-focus message in `GraphPage`:
   - hidden: "This entity is hidden by your current filters." Action: "Clear filters"
   - capped: "This entity is outside the 3D top 2,000 node cap. Use filters to narrow the graph." Action: maybe "Open in 2D" or "Dismiss"
   - missing: "This entity is not loaded in the current graph view." Action: "Dismiss"

Implementation notes:

- A clean approach is to return `visibleNodeIdsBeforeCap` from `buildGraph3DData`, but avoid passing large sets through React if that becomes expensive.
- Alternative: export a helper that computes whether an id is filter-hidden using `computeHiddenNodeIds(graph, filterState)`.

Suggested test coverage:

- `buildGraph3DData` should expose/test cap behavior for a searched low-confidence node.
- Add tests for block reason selection: missing vs hidden vs capped.

### Issue 6.1.4 - Toggle preserves active node focus, not general camera viewport

Priority: P3

Files likely involved:

- `src/pages/GraphPage.tsx`
- `src/components/graph/GraphCanvas.tsx`
- `src/components/graph/GraphCanvas3D.tsx`

Context:

The phase spec says toggling between 2D and 3D should preserve active node and camera focus. Current behavior preserves active-node focus by setting `pendingFocus` when there is an active node. If the user has panned or zoomed without selecting a node, the camera viewport is not preserved.

Why it matters:

- The requirement is only partially met.
- Users exploring a region without an active node lose context when toggling.

Solution strategy:

There are two viable paths:

1. Product clarification path:
   - Define "camera focus" as "active selected node focus."
   - Update the phase/acceptance note to reflect current behavior.
   - This is lowest complexity.
2. Full preservation path:
   - Add callbacks from `GraphCanvas` and `GraphCanvas3D` that report camera state to `GraphPage`.
   - Store separate camera snapshots for 2D and 3D.
   - On remount, pass an initial camera target/state into the next renderer.

Recommended approach:

- Do product clarification unless users strongly need general viewport preservation. Cross-renderer camera equivalence is non-trivial because Sigma 2D and Three.js 3D camera models do not map perfectly.
- If implementing, start by preserving center/focused-node intent rather than exact camera math.

Suggested test coverage:

- Unit-test any camera-state conversion helpers.
- Manual QA is required: pan/zoom in 2D, toggle to 3D, toggle back, check whether context is acceptable.

### Issue 6.1.5 - No runtime FPS/performance instrumentation for 3D target

Priority: P3

Files likely involved:

- `src/components/graph/GraphCanvas3D.tsx`
- `_docs/phases/phase-6-enhanced-features.md`

Context:

The implementation uses a 2,000-node cap, which is pragmatic. The phase spec mentions a 30 FPS target at 5,000 nodes if possible, but there is no runtime measurement, test harness, or documented manual benchmark.

Why it matters:

- The cap is present, but the performance claim is not measurable.
- Future changes could regress 3D performance without detection.

Solution strategy:

1. Add a manual benchmark note to the phase doc or this plan once tested on a seeded large graph.
2. Optional: add a dev-only FPS meter behind a local flag.
3. Keep production UI clean unless performance debugging is needed.

Suggested test coverage:

- Automated FPS testing is likely not worth it in unit tests.
- Add a manual QA checklist for 2,000-node and 5,000-node seeded scenarios.

## Phase 6.2 - Guided Exploration Improvements

### Issue 6.2.1 - Explorations are public immediately because there is no publication state

Priority: P2

Files likely involved:

- `supabase/migrations/20260601000000_explorations.sql`
- new follow-up migration, for example `supabase/migrations/<timestamp>_exploration_publication_state.sql`
- `src/types/database.ts`
- `src/lib/api/explorations.ts`
- `src/pages/ExplorationsPage.tsx`
- `src/pages/ExplorationPlayerPage.tsx`
- `src/pages/admin/AdminExplorationEditor.tsx`

Context:

The current `explorations` table has no `status`, `published_at`, or draft flag. Public read policies allow all exploration rows and all step rows. The public API is named `getPublishedExplorations`, but it selects every exploration row.

Why it matters:

- Admin-created content becomes public immediately after save.
- There is no review/staging workflow.
- The app copy says "published," but the data model cannot represent that state.

Solution strategy:

1. Add a publication state column.
   - Best fit with existing app types: `status content_status not null default 'draft'`
   - If using `content_status`, decide which states are valid for explorations. Likely `draft`, `published`, `archived`.
2. Add `published_at timestamptz` if useful for sorting public tours.
3. Update public API functions:
   - `getPublishedExplorations`: `.eq('status', 'published')`
   - `getExplorationById`: either keep public-only by default or split into `getPublishedExplorationById` and `getAdminExplorationById`.
4. Update admin save behavior:
   - save as draft by default
   - optionally add "Save draft" and "Publish" buttons
5. Update TypeScript database types after migration.

Implementation notes:

- Since this project uses Supabase generated types checked into `src/types/database.ts`, update that file consistently.
- If adding status with the existing `content_status` enum, watch for type coupling with entity/source/claim semantics.

Suggested test coverage:

- `getPublishedExplorations` excludes draft rows.
- `getPublishedExplorationById` returns null for draft rows.
- Admin-created exploration defaults to draft.

### Issue 6.2.2 - Public RLS exposes all exploration steps and focus entity ids

Priority: P2

Files likely involved:

- `supabase/migrations/20260601000000_explorations.sql`
- new follow-up migration for RLS policy replacement
- `src/lib/api/explorations.ts`

Context:

Public RLS policies currently use `using (true)` for both explorations and exploration steps. That means public clients can read all step prose, `entity_id`, and `focus_entity_ids` for any exploration, including draft tours if draft state is added but policies are not tightened.

Why it matters:

- Draft content can leak.
- Entity UUIDs for unpublished or internal curation work can leak through step rows.
- Public policy intent is not aligned with admin workflow.

Solution strategy:

1. Drop the current public read policies for `explorations` and `exploration_steps`.
2. Recreate public read policies:
   - explorations: `status = 'published'`
   - steps: `exists (select 1 from public.explorations e where e.id = exploration_steps.exploration_id and e.status = 'published')`
3. Keep admin write/read access through `public.is_admin()`.
4. Consider a public view, such as `published_explorations` and `published_exploration_steps`, if policy joins become hard to reason about.

Implementation notes:

- If RLS policy expressions reference `content_status`, use the correct enum cast if Postgres requires it.
- Use `drop policy if exists` in the follow-up migration.

Suggested test coverage:

- Supabase local smoke or SQL test verifying anon can read published steps and cannot read draft steps.
- API-level tests with mocked Supabase query calls if direct DB tests are not available.

### Issue 6.2.3 - Exploration creation is not transactional

Priority: P3

Files likely involved:

- `src/lib/api/explorations.ts`
- new Supabase RPC migration if implemented

Context:

`createExploration` inserts the parent exploration first, then inserts step rows. If step insertion fails, the client attempts a best-effort cleanup by deleting the parent exploration. That is reasonable for the first version, but it is not a true transaction.

Why it matters:

- A network failure or RLS failure during cleanup can leave an empty exploration row.
- With public-immediate behavior, that empty row can become visible.
- As exploration editing grows, multi-step writes will get more complex.

Solution strategy:

Short-term:

- Fix publication state first. If parent rows default to draft, partial writes are less harmful.

Long-term:

- Add a Postgres RPC such as `create_exploration_with_steps(input jsonb)` that:
  - checks `public.is_admin()`
  - inserts the exploration
  - inserts all steps
  - runs inside one transaction by virtue of the function call
  - returns the created exploration id

Suggested test coverage:

- RPC rejects non-admin callers.
- RPC inserts parent and ordered steps together.
- Bad step input causes no parent row to remain.

### Issue 6.2.4 - No edit/delete workflow for explorations

Priority: P3

Files likely involved:

- `src/pages/admin/AdminExplorationEditor.tsx`
- `src/router.tsx`
- `src/constants/routes.ts`
- `src/lib/api/explorations.ts`

Context:

The phase only required `/admin/explorations/new`, so this is not a spec miss. Operationally, however, admins need a way to revise or unpublish exploration content.

Why it matters:

- Any typo or content issue requires direct database edits.
- Publishing state is less useful without an admin list/edit path.

Solution strategy:

1. Add an admin exploration list route: `/admin/explorations`.
2. Add edit route: `/admin/explorations/:id`.
3. Reuse the current editor as create/edit form.
4. Add archive/unpublish action.

Suggested test coverage:

- Editor loads existing steps in order.
- Reordering and saving preserves unique step indexes.
- Unpublish hides the exploration from public APIs.

## Phase 6.3 - Timeline View Improvements

### Issue 6.3.1 - Timeline overfetches graph data through always-mounted `GraphSidePanel`

Priority: P2

Files likely involved:

- `src/pages/TimelinePage.tsx`
- `src/components/graph/GraphSidePanel.tsx`
- `src/lib/api/entities.ts`

Context:

`TimelinePage` always renders `GraphSidePanel`. The side panel always fetches all published entities and all published relationships, even before the user clicks a dot. Timeline already fetches relationships for culture filtering, so the page can do more graph work than necessary.

Why it matters:

- Visiting `/timeline` can become expensive as the graph grows.
- The timeline should be a lighter secondary view than the full graph.
- This weakens the "additive" requirement because secondary pages can inherit full-graph costs.

Solution strategy:

Option A - quick fix:

1. In `TimelinePage`, read `activeNodeId` from `useGraphStore`.
2. Render `<GraphSidePanel />` only when `activeNodeId !== null`.
3. Keep the existing cleanup effect that clears active node on page exit.

Option B - better data path:

1. Add a lightweight side panel variant that fetches one entity by id or slug and a small neighborhood.
2. Use that variant on timeline and keep the full graph side panel for the graph canvas.

Recommended approach:

- Start with Option A. It is low risk and prevents eager side-panel queries.
- Consider Option B if timeline remains heavy because `GraphSidePanel` still fetches all entities once opened.

Suggested test coverage:

- Component test or query mock proving timeline does not invoke side-panel data queries before selection.
- Manual network inspection on `/timeline`.

### Issue 6.3.2 - Timeline touch pinch zoom is not implemented

Priority: P3

Files likely involved:

- `src/pages/TimelinePage.tsx`

Context:

Timeline supports horizontal scroll, plus/minus zoom controls, and trackpad pinch via `wheel` events with `ctrlKey`. Touchscreen pinch gestures are not handled.

Why it matters:

- The phase spec says pinch-zoom.
- Mobile/tablet users may interpret that as two-finger touch pinch, not trackpad pinch.

Solution strategy:

Option A - implement touch pinch:

1. Track two active pointers on the timeline scroll container using pointer events.
2. Store initial distance between two pointers.
3. On pointer move, compute scale ratio and update `zoom`.
4. Clamp to `MIN_ZOOM`/`MAX_ZOOM`.
5. Preserve scroll center if possible so zoom feels anchored.

Option B - adjust acceptance language:

1. Keep current controls.
2. Document as "horizontal scroll, zoom buttons, and trackpad pinch."

Recommended approach:

- If mobile timeline is important now, implement Option A.
- If desktop research use is the priority, Option B is acceptable for this phase, but document it clearly.

Suggested test coverage:

- Unit test a pure helper for pinch distance and zoom calculation.
- Manual QA on a touchscreen browser or browser device emulator.

### Issue 6.3.3 - Admin timeline date editor silently nulls invalid years

Priority: P3

Files likely involved:

- `src/pages/admin/AdminEntityManagerPage.tsx`
- `src/lib/api/admin.ts`

Context:

The date editor parses the year with `Number(dateSortYear.trim())`. If the value is invalid, it saves `null`. Since public timeline entities require both `date_era` and `date_sort_year`, invalid input silently removes the entity from `/timeline`.

Why it matters:

- Admins can accidentally remove entities from the timeline.
- The UI does not explain what happened.
- Silent data loss is worse than a validation error.

Solution strategy:

1. Add local validation in `TimelineDatesForm`.
2. Treat blank as intentional `null`, but treat non-blank invalid text as an error.
3. Show a short inline error, for example "Sort year must be a valid number. Use negative years for BCE."
4. Do not call `saveMutation.mutate` when invalid.
5. Optional: add min/max guardrails only if the domain needs them.

Implementation notes:

- Since the input type is `number`, browser validation helps, but React state can still hold unexpected strings and tests should cover the submit path.
- Preserve support for negative BCE years.

Suggested test coverage:

- Invalid non-empty year does not call `updateEntityTimelineDates`.
- Blank year intentionally saves `date_sort_year: null`.
- Decimal year saves truncated integer only if that behavior is desired; otherwise reject decimals.

### Issue 6.3.4 - Culture filtering only follows direct `belongs_to` relationships

Priority: P3

Files likely involved:

- `src/pages/TimelinePage.tsx`
- `src/lib/graph/graphFilters.ts`
- `src/lib/api/relationships.ts`

Context:

Timeline culture filtering finds entities with direct `belongs_to` relationships where the selected culture is the target. This matches the existing graph filter pattern.

Why it matters:

- It may miss indirectly related narratives/figures, for example a figure belongs to a culture and a narrative appears in that figure's tradition through another relation.
- Users may expect culture filtering to include more than direct membership.

Solution strategy:

1. Decide product semantics:
   - direct culture membership only
   - one-hop related through culture
   - two-hop graph neighborhood
2. If staying direct-only, add small UI or docs language to make it clear.
3. If expanding, extract a shared culture-scope helper and use it in both graph filters and timeline filters.

Suggested test coverage:

- Test direct `belongs_to` inclusion.
- If expanding, test indirect inclusion rules explicitly.

## Phase 6.4 - Comparison View Improvements

### Issue 6.4.1 - Comparison-in-progress state is volatile

Priority: P3

Files likely involved:

- `src/stores/uiStore.ts`
- `src/components/compare/CompareButton.tsx`
- `src/pages/compare/ComparisonPage.tsx`

Context:

The comparison URL is shareable and round-trips correctly, but the "comparison in progress" behavior on entity pages depends on in-memory `uiStore.comparisonSlugs`. That state is populated when the user visits `/compare`, but it does not persist across reloads or tabs.

Why it matters:

- After a reload, clicking "Compare" on an entity starts a new comparison even if the user expected to append to an existing one.
- Multiple tabs do not share comparison state.

Solution strategy:

Option A - persist comparison state:

1. Wrap `uiStore` in Zustand `persist`.
2. Store only `comparisonSlugs`.
3. Consider TTL or clear behavior so stale comparisons do not surprise users weeks later.

Option B - URL-first workflow:

1. Keep comparison state volatile.
2. Make the entity `CompareButton` append only when current route or referrer includes comparison context.
3. Add "Add to comparison" affordance from inside `/compare` as the main append path.

Recommended approach:

- Persist comparison state if the product wants "comparison in progress" to survive navigation/reload.
- If avoiding persistence, adjust copy and behavior so users do not expect cross-session state.

Suggested test coverage:

- Persisted store reload keeps slugs.
- Clicking Compare appends up to four slugs.
- Clearing comparison resets persisted state if a clear action exists.

### Issue 6.4.2 - Re-adding an existing slug moves it to the end

Priority: P3

Files likely involved:

- `src/lib/comparison.ts`
- `src/__tests__/lib/comparison.test.ts`

Context:

`appendCompareSlug` filters out an existing slug, appends it to the end, dedupes, and caps to the newest four. This is tested, but the product implication should be explicit.

Why it matters:

- Column order can change when a user clicks Compare on an entity already in the set.
- That may be fine, but comparison order often matters for user orientation.

Solution strategy:

1. Decide desired behavior:
   - current: existing item moves to end
   - alternative: existing item stays in place
2. If keeping current behavior, add a short comment explaining the "most recent comparisons win" model.
3. If changing, update `appendCompareSlug` to return existing order unchanged when slug exists.

Suggested test coverage:

- Keep or update the existing test for duplicate slug behavior to lock the product decision.

## Phase 6.5 - Export and Citation Improvements

### Issue 6.5.1 - Entity exports can duplicate citations

Priority: P3

Files likely involved:

- `src/lib/export.ts`
- `src/lib/citations.ts`
- `src/__tests__/lib/export.test.ts`

Context:

Entity exports include all evidence rows returned for claims associated with the entity. If several claims reference the same source anchor, the export can list the same citation multiple times.

Why it matters:

- Research exports become noisy.
- Duplicate footnotes/sources reduce confidence in citation quality.

Solution strategy:

1. Define dedupe key:
   - strict: `source.id + anchor.id`
   - broader: same source plus same locator
2. Add helper `dedupeCitationInputs(evidence)`.
3. Use it in `buildEntityExport`.
4. Decide whether claim exports should dedupe too. Claim exports may intentionally keep every evidence row if each row supports the claim.

Suggested test coverage:

- Entity export with duplicate source/anchor emits one citation.
- Entity export with same source but different anchor emits two citations.

### Issue 6.5.2 - Export footer uses relative links instead of canonical absolute URLs

Priority: P3

Files likely involved:

- `src/lib/export.ts`
- `src/components/export/ExportDialog.tsx`
- `src/pages/entity/EntityDetailPage.tsx`
- `src/pages/claim/ClaimDetailPage.tsx`

Context:

Exports currently end with relative paths like `/entity/fire` and `/claim/<id>`. The phase asks for copy-link buttons on canonical pages, and researcher exports may be shared outside the app context.

Why it matters:

- A relative path is less useful in documents, notes, and external citations.
- It is not a canonical URL unless the reader already knows the site origin.

Solution strategy:

1. Add optional `canonicalUrl` to entity/claim export input.
2. Pass `window.location.href` from the detail pages when building the export.
3. Fall back to relative path in tests or server-like contexts.
4. Update test expectations.

Implementation notes:

- Keep pure export functions browser-independent by passing the URL in rather than reading `window` inside `src/lib/export.ts`.

Suggested test coverage:

- Export includes provided absolute canonical URL.
- Export falls back to relative URL when no canonical URL is passed.

### Issue 6.5.3 - Chicago citations use publication year, not full date

Priority: P3

Files likely involved:

- `src/lib/citations.ts`
- `src/__tests__/lib/citations.test.ts`

Context:

The phase text says Chicago style should include "Format, Date." Current `formatChicagoCitation` extracts only the year from `publication_date`.

Why it matters:

- If source dates are precise, exports lose useful metadata.
- This may be acceptable for Chicago bibliography style in some contexts, but the phase says "Date," not "Year."

Solution strategy:

1. Decide citation style target:
   - year-only Chicago-like bibliography
   - full date as stored in source metadata
2. If full date is desired:
   - format `publication_date` with a stable date formatter
   - avoid locale-dependent output in tests unless explicitly desired
3. Update citation tests.

Suggested test coverage:

- Full date source produces expected full date.
- Year-only source still formats cleanly.
- Null date omits date segment.

## Cross-Cutting Improvements

### Issue 6.X.1 - Route-level code splitting for Phase 6 pages

Priority: P3

Files likely involved:

- `src/router.tsx`
- possibly a new `src/components/common/RouteFallback.tsx`

Context:

The 3D graph is split into its own lazy chunk, which is good. However, Phase 6 pages are statically imported into the root router: explorations, timeline, comparison, exploration player, and admin exploration editor.

Why it matters:

- The main production app chunk is already large.
- Existing users pay part of the cost for secondary features even if they never open them.

Solution strategy:

1. Add lazy route imports:
   - `const TimelinePage = lazy(() => import('@/pages/TimelinePage'))`
   - repeat for comparison/explorations/admin editor
2. Wrap route elements in a small suspense wrapper:
   - `withSuspense(<TimelinePage />)`
   - or create `LazyRoute` component
3. Keep route-level fallbacks visually consistent with `ContentShell` and `AppShell`.
4. Re-run build and compare chunk output.

Implementation notes:

- Keep `GraphPage` eager if it is the homepage.
- Consider also lazy-loading admin pages if admin bundle growth becomes significant.

Suggested test coverage:

- Build should still pass.
- Basic smoke test should route to lazy pages successfully.

### Issue 6.X.2 - Documentation and acceptance criteria need small updates

Priority: P3

Files likely involved:

- `_docs/phases/phase-6-enhanced-features.md`
- `_docs/audits/phase-6-audit.md`
- this plan

Context:

Some implemented behavior is reasonable but not exactly what the phase wording implies, especially around camera preservation, 3D FPS validation, and pinch-zoom semantics.

Why it matters:

- Future audits will keep flagging the same ambiguity unless acceptance criteria are tightened.
- Developers need to know whether to implement more code or clarify intended behavior.

Solution strategy:

1. After product decisions are made, update the phase doc:
   - 3D camera behavior: active-node focus vs full viewport preservation
   - timeline zoom: trackpad pinch/buttons vs touch pinch
   - performance: cap strategy and manual benchmark notes
2. Keep the audit doc unchanged as historical record unless a revised audit is created.

## Step-by-Step Battle Plan

Use this order to implement the fixes with the least churn and highest risk reduction.

### Step 2 - Fix 3D graph correctness first

1. Clear stale 3D hover state on background click.
2. Clear stale hover when `graphData` no longer contains the hovered node.
3. Clear active node when filters/cap remove it from rendered 3D data.
4. Add a distinct focus-block reason for cap-excluded nodes.
5. Update the blocked-focus UI copy/action in `GraphPage`.
6. Add helper tests for active/hover/cap decisions.
7. Run:
   - `npm.cmd run test`
   - `npm.cmd run typecheck`

### Step 3 - Add safe exploration publication semantics

1. Add migration for exploration `status` and optional `published_at`.
2. Replace public RLS policies so anon users only see published explorations and published steps.
3. Update `src/types/database.ts`.
4. Update API functions:
   - public list/detail only return published
   - admin create saves draft by default or supports save/publish action
5. Update admin UI copy and buttons.
6. Add tests for draft exclusion.
7. Run:
   - `npm.cmd run typecheck`
   - `npm.cmd run test`
   - Supabase local reset/smoke if available

### Step 4 - Reduce timeline overfetching

1. Gate `GraphSidePanel` rendering in `TimelinePage` behind `activeNodeId !== null`.
2. If still too heavy after selection, create a timeline-specific side panel query path.
3. Add a test or manual network check that `/timeline` does not fetch side-panel graph data before a dot click.
4. Run:
   - `npm.cmd run test`
   - `npm.cmd run typecheck`

### Step 5 - Harden timeline admin date input

1. Add local validation for invalid non-empty year input.
2. Preserve intentional blank-to-null behavior.
3. Decide whether decimals should be truncated or rejected.
4. Add component/helper tests if practical.
5. Run:
   - `npm.cmd run test`
   - `npm.cmd run typecheck`

### Step 6 - Lazy-load secondary Phase 6 routes

1. Convert Phase 6 page imports in `router.tsx` to lazy imports.
2. Add a common route suspense fallback.
3. Keep homepage graph eager.
4. Run production build and compare chunk output:
   - `npm.cmd run build`
5. Smoke route navigation manually or through the existing smoke script.

### Step 7 - Decide and implement smaller product-polish items

1. 3D camera preservation:
   - choose product clarification or full viewport state preservation
2. Timeline touch pinch:
   - implement pointer pinch or document trackpad/buttons only
3. Comparison state:
   - persist `comparisonSlugs` or explicitly keep it session-only
4. Comparison duplicate behavior:
   - keep move-to-end with a comment or preserve existing order
5. Export polish:
   - dedupe entity citations
   - pass absolute canonical URL into exports
   - decide full-date vs year-only Chicago formatting

### Step 8 - Final verification

Run the full local suite:

1. `npm.cmd run typecheck`
2. `npm.cmd run test`
3. `npm.cmd run lint`
4. `npm.cmd run build`
5. `npm.cmd run smoke`

Manual QA checklist:

1. Graph:
   - toggle 2D/3D
   - hover node, click background, verify highlight clears
   - select node, apply filters hiding it, verify side panel closes or message is correct
   - search for low-confidence node in capped 3D graph and verify cap-specific messaging
2. Explorations:
   - create draft exploration as admin
   - verify it is hidden publicly
   - publish it and verify public list/player work
3. Timeline:
   - load `/timeline` and inspect network/query behavior before clicking a dot
   - click a dot and verify side panel opens
   - edit timeline date with invalid input and verify save is blocked
4. Compare:
   - open `/compare?a=x&b=y`
   - add third and fourth entities
   - copy URL and reload it
   - test Compare button from entity page after reload
5. Export:
   - export entity markdown/plain text
   - export claim markdown/plain text
   - verify copied links and canonical export footer

### Step 9 - Close the loop

1. Update this plan with completed items if implementation happens in multiple sessions.
2. If fixes are substantial, create a revised audit:
   - `_docs/audits/phase-6-revised-audit.md`
3. Keep the PR description or follow-up PR notes aligned with the final behavior.
