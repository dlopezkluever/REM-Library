# Phase 6 Audit

Audit date: 2026-06-01  
Branch/PR reviewed: `Enhancemaxx`, PR #4  
Scope: `_docs/phases/phase-6-enhanced-features.md`

## Verification Performed

- Reviewed Phase 6 requirements against the PR file list.
- Inspected the implementation paths for all five Phase 6 features:
  - 3D graph view
  - Guided explorations
  - Timeline view
  - Comparison view
  - Export and citation tools
- Ran local checks:
  - `npm.cmd run typecheck` - passed
  - `npm.cmd run test` - passed, 96 tests passed / 4 skipped
  - `npm.cmd run build` - passed
  - `npm.cmd run lint` - passed
  - `npm.cmd run smoke` - passed
- Checked GitHub Actions for PR #4:
  - CI run `26735059384` - success

## Overall Assessment

Phase 6 is substantially implemented and the baseline quality checks are green. The major feature surfaces are present, routed, and covered by focused unit tests for the pure data/formatting logic. The 3D graph is correctly lazy-loaded into a separate production chunk, the database migrations add the required exploration and timeline fields, and the comparison/export utilities have useful test coverage.

The main concerns are not compiler-level problems. They are product correctness and operational issues: stale 3D interaction state after filters/background clicks, guided exploration publishing semantics, timeline-side-panel overfetching, and new route code increasing the initial bundle despite the phase being intended as additive.

## Findings

### P2 - 3D graph can leave stale hover/selection state after filters or background clear

Files:

- `src/components/graph/GraphCanvas3D.tsx`
- `src/components/graph/GraphCanvas.tsx`
- `src/pages/GraphPage.tsx`

Evidence:

- 3D hover state is held in a ref and wins over active state in `colorForNode`: `GraphCanvas3D.tsx:43`, `GraphCanvas3D.tsx:78`.
- `onNodeHover` updates that ref, but `onBackgroundClick` only calls `clearInteraction()` and does not clear `hoveredRef` or refresh colors: `GraphCanvas3D.tsx:138-144`.
- When filtered graph data changes, `nodeByIdRef` is replaced and the graph data is reloaded, but there is no active-node validation or hover reset: `GraphCanvas3D.tsx:169-175`.
- The 2D graph explicitly clears `activeNodeId` if filters hide the selected node: `GraphCanvas.tsx:262-266`; the 3D graph does not have the equivalent behavior.
- The 3D focus-block path reports any missing visible node as `'hidden'`: `GraphCanvas3D.tsx:188-189`, and the graph page responds by offering "Clear filters": `GraphPage.tsx:178-187`.

Impact:

- If a user hovers a node, then clears interaction by clicking the background, the 3D graph can continue using the stale hover ref for coloring until another hover event occurs.
- If a selected node becomes filtered out in 3D, the side panel can remain open for a node that is no longer in the rendered graph.
- If a node is omitted because of the 2,000-node cap rather than filters, the UI still says to clear filters, but clearing filters may not bring the node back.

Recommendation:

- In `onBackgroundClick`, clear `hoveredRef.current`, call `setHoveredNodeId(null)`, and refresh `nodeColor`.
- When `graphData` changes, clear stale hover refs if the hovered node is no longer present.
- When `graphData` changes, mirror the 2D behavior by clearing `activeNodeId` if the selected node is no longer in `nodeByIdRef`.
- Distinguish filtered-out nodes from cap-excluded nodes, so the blocked-focus message can say "not included in the 3D cap" instead of "Clear filters."

### P2 - Guided explorations have no draft/published state and are public immediately

Files:

- `supabase/migrations/20260601000000_explorations.sql`
- `src/lib/api/explorations.ts`
- `src/pages/ExplorationsPage.tsx`

Evidence:

- The `explorations` table contains `id`, `title`, `description`, `created_by`, and timestamps, but no `status`, `published_at`, or draft flag: `20260601000000_explorations.sql:5-12`.
- Public read policies expose all exploration rows and all exploration step rows: `20260601000000_explorations.sql:33-49`.
- `getPublishedExplorations` selects every exploration row and only orders by `created_at`; it does not filter by publication state: `src/lib/api/explorations.ts:36-40`.
- `getExplorationById` also fetches by id without publication filtering: `src/lib/api/explorations.ts:104-129`.
- The public page copy says "No explorations have been published yet," but the data model cannot represent published vs draft: `src/pages/ExplorationsPage.tsx:47`.

Impact:

- As soon as an admin saves a new exploration, it is visible publicly.
- There is no safe workflow for draft review, staging, or temporarily hiding an exploration.
- Public `exploration_steps` rows can expose `entity_id` and `focus_entity_ids` UUIDs even if an entity later becomes unpublished. The graph will not render unpublished entities, but the row data is still readable.

Recommendation:

- Add `status content_status not null default 'draft'` or a narrower `exploration_status` enum.
- Public read policies should only expose published explorations and published steps, ideally through a policy or view that joins to the parent exploration status.
- Admin editor should save drafts by default, with a separate publish action.
- Add tests around public exploration filtering and step visibility.

### P2 - Timeline mounts the graph side panel in a way that overfetches full graph data

Files:

- `src/pages/TimelinePage.tsx`
- `src/components/graph/GraphSidePanel.tsx`

Evidence:

- Timeline always mounts `<GraphSidePanel />`: `TimelinePage.tsx:394`.
- `GraphSidePanel` always fetches all published entities and all published relationships regardless of whether a node is selected: `GraphSidePanel.tsx:17-28`.
- The timeline already fetches all published relationships for culture filtering: `TimelinePage.tsx:62-66`, so the side panel adds more graph-oriented data work to a page that otherwise only needs dated entities until a dot is clicked.

Impact:

- Visiting `/timeline` can trigger a full graph entity fetch even before the user opens the side panel.
- This undermines the timeline as a lighter secondary view and can become expensive as the graph grows.

Recommendation:

- Lazy-mount `GraphSidePanel` only after `activeNodeId` is set, or add `enabled: activeNodeId !== null` to its expensive queries.
- Prefer a timeline-specific panel data path that fetches only the clicked entity and its small neighborhood.

### P3 - Phase 6 route code increases the initial app bundle

Files:

- `src/router.tsx`
- `src/pages/GraphPage.tsx`

Evidence:

- The 3D graph component is correctly lazy-loaded: `GraphPage.tsx:1`, `GraphPage.tsx:11-12`.
- However, Phase 6 page components are still statically imported by the root router:
  - `ExplorationsPage`: `router.tsx:7`
  - `TimelinePage`: `router.tsx:9`
  - `ComparisonPage`: `router.tsx:10`
  - `AdminExplorationEditor`: `router.tsx:26`
- Production build output:
  - Main app chunk: `index-B9GGYqeG.js` = 1,172.26 kB minified / 325.21 kB gzip
  - 3D chunk: `GraphCanvas3D-CVTJckR1.js` = 1,335.14 kB minified / 358.25 kB gzip

Impact:

- The Three.js/3D bundle is split correctly, but Phase 6 still adds more code to the initial app route graph.
- The phase goal says the existing Phase 1-5 experience should be unchanged; increasing the initial bundle affects existing users even if they never visit `/timeline`, `/compare`, or `/explorations`.

Recommendation:

- Convert large secondary routes to route-level lazy imports using `React.lazy` or React Router lazy route modules.
- Candidates: `TimelinePage`, `ComparisonPage`, `ExplorationsPage`, `ExplorationPlayerPage`, and `AdminExplorationEditor`.

### P3 - 3D toggle preserves active-node focus, but not general camera position

Files:

- `src/pages/GraphPage.tsx`
- `src/components/graph/GraphCanvas3D.tsx`

Evidence:

- On view-mode change, `GraphPage` only creates pending focus from the active node id: `GraphPage.tsx:109-122`.
- `GraphCanvas3D` then moves the camera to the focused node when coordinates are available: `GraphCanvas3D.tsx:89-110`.

Impact:

- If the user has an active node selected, toggling 2D/3D recenters on that node, which is useful.
- If the user has only panned/zoomed without an active node, toggling resets the camera instead of preserving the user's current viewport. This is a partial miss against the requirement to "preserve the active node and camera focus across the toggle."

Recommendation:

- Track last camera state separately for 2D and 3D, or define "camera focus" explicitly as the active node and update the phase doc/acceptance criteria accordingly.

### P3 - Timeline zoom is not full mobile pinch support

File:

- `src/pages/TimelinePage.tsx`

Evidence:

- Pinch-to-zoom is implemented through `wheel` events where `ctrlKey` is true: `TimelinePage.tsx:88-109`.
- There are also explicit plus/minus controls: `TimelinePage.tsx:228-255`.

Impact:

- Desktop trackpad pinch and button zoom are covered.
- Touchscreen pinch gestures are not handled, so mobile/tablet users may not get the interaction implied by "pinch-zoom."

Recommendation:

- Either add pointer/touch pinch handling or adjust the acceptance language to "trackpad pinch and zoom controls."

### P3 - Admin timeline date editor silently drops invalid years

Files:

- `src/pages/admin/AdminEntityManagerPage.tsx`
- `src/lib/api/admin.ts`

Evidence:

- The date editor parses `dateSortYear` with `Number(...)`, and non-finite values are saved as `null`: `AdminEntityManagerPage.tsx:445-452`.
- The API then writes `date_sort_year: null`: `src/lib/api/admin.ts:529-539`.

Impact:

- A malformed or accidentally pasted year can erase the timeline sort year without a validation message.
- Since `getTimelineEntities` requires both `date_era` and `date_sort_year`, this silently removes the entity from the public timeline.

Recommendation:

- Validate the year before saving and show an inline error instead of converting invalid input to `null`.
- Add a test for invalid date editor input if the form is brought under component tests.

## Feature-by-Feature Notes

### Feature 1 - 3D Graph View

What is strong:

- The 3D graph is lazy-loaded from `GraphPage`, so the 3D bundle does not load until requested.
- Graphology-to-3D adaptation is well isolated in `graph3dData.ts` and tested.
- The 2,000-node cap is implemented and has a visible notice.
- Hover neighbor highlighting and node-click side panel integration are present.
- 3D filters use the same store and filtering helper as the 2D graph.

Remaining concerns:

- Stale hover/selection state in 3D after filters/background interactions.
- Cap-excluded focus uses the same blocked reason as filter-hidden focus.
- General camera viewport is not preserved across 2D/3D toggles unless there is an active node.
- No runtime FPS instrumentation exists. The cap is pragmatic, but the 5,000-node target was not directly validated in code or automated tests.

### Feature 2 - Guided Explorations

What is strong:

- Required tables and step ordering exist.
- Public list and player routes are wired.
- The player reuses `GraphCanvas` and the same graph-side-panel mechanism.
- Step focus dims non-focused nodes and labels focused nodes.
- Admin editor supports adding steps, choosing focus entities, prose, reorder, preview, and save.

Remaining concerns:

- No draft/published state.
- Public RLS exposes all exploration and step rows.
- Step insert is not transactional with exploration insert; cleanup is best-effort. This is acceptable for now but should become an RPC transaction if editor workflows expand.
- No edit/delete route exists yet. The phase only asked for `/admin/explorations/new`, so this is not a blocker, but it limits operational maintainability.

### Feature 3 - Timeline View

What is strong:

- Timeline migration adds `date_era` and `date_sort_year`.
- Public timeline filters to published narrative/figure entities with dates.
- Era bands, zoom controls, trackpad pinch, type tabs, and culture filtering are implemented.
- Dot click opens the existing `GraphSidePanel`.
- Admin entity manager includes a date editor for narrative/figure rows.

Remaining concerns:

- Side panel overfetches full graph data before a dot is selected.
- Touch pinch is not implemented.
- Admin invalid year handling should be stricter.
- Culture filtering currently depends on direct `belongs_to` relationships to the selected culture. This matches existing graph filter behavior, but it may miss entities related to culture indirectly.

### Feature 4 - Comparison View

What is strong:

- URL query params `a`/`b`/`c`/`d` are parsed and serialized.
- Up to four entities are supported.
- Columns include condensed entity details, connections, confidence, claims/evidence-derived source count, and removal controls.
- Shared connections are computed client-side and tested.
- Copy comparison link is implemented.

Remaining concerns:

- "Comparison in progress" is volatile `uiStore` state. It works within the current SPA session after visiting `/compare`, but it is not persisted across reloads or tabs.
- Existing slugs are moved to the end when re-added through `appendCompareSlug`; that is defensible but should be intentional because it changes column order.

### Feature 5 - Export and Citation Tools

What is strong:

- Entity and claim detail pages have export dialogs.
- Markdown/plain text and informal/Chicago options are implemented.
- Claim Markdown uses footnote-style citations.
- Copy-link buttons are present on entity, claim, and source detail pages.
- Export/citation pure functions are covered by tests.

Remaining concerns:

- Entity exports list every evidence row as a citation; repeated sources/anchors are not deduplicated.
- Export footer uses relative paths (`/entity/...`, `/claim/...`) rather than the full canonical URL. That may be acceptable for internal exports, but researchers often expect absolute links.
- Chicago formatting uses publication year only. The phase text says "Date"; if full dates matter, format the full source date.

## Recommended Fix Order

1. Fix 3D stale hover/selection handling and cap-vs-filter focus messaging.
2. Add explicit exploration publication state and tighten public read policies.
3. Lazy or enable-gate `GraphSidePanel` queries on the timeline.
4. Route-lazy the new Phase 6 pages to keep the initial app experience lighter.
5. Add admin validation for timeline years.
6. Decide whether comparison state should persist across reloads/tabs.
7. Improve export citation dedupe and absolute canonical links.

## Suggested Additional Tests

- 3D graph data/filter behavior:
  - active node is cleared when the selected node is filtered out
  - stale hover is cleared when graph data changes
  - cap-excluded node produces a distinct blocked-focus reason
- Explorations:
  - public list excludes draft explorations
  - public detail route cannot fetch draft explorations
  - step insert failure does not leave a public shell exploration
- Timeline:
  - date editor rejects invalid years
  - side panel queries are disabled until a node is selected
  - culture filter includes expected direct `belongs_to` relationships
- Comparison:
  - copied URL round-trips all four slugs
  - duplicate add behavior preserves intended order
- Export:
  - entity export deduplicates repeated source citations if that is the desired behavior
  - exported footer uses absolute canonical URLs if required
