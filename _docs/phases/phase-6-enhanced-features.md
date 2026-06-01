# Phase 6 — Enhanced Features

**Goal:** The platform gains its secondary feature set: a 3D graph view for immersive exploration, admin-created guided tours through the knowledge graph, a chronological timeline view, a side-by-side entity comparison tool, and export/citation tools for researchers.

**Builds on:** Phase 2 (graph visualization), Phase 3 (encyclopedia views), Phase 4 (search)

**PRD reference:** Section 8 (Secondary Features)

**Deliverable:** Each feature in this phase is independently testable and additive — the existing Phase 1–5 experience is unchanged. A user can toggle to the 3D view, follow a guided exploration, browse the timeline, compare two entities, and export a citation.

---

## Feature 1 — 3D graph view

1. Install `force-graph-3d` and `three`; create `src/components/graph/GraphCanvas3D.tsx` as a lazy-loaded component (`React.lazy`) — the Three.js bundle is large and should not load unless the user requests the 3D view.
2. Adapt the Graphology graph data (from Phase 2) to the format expected by `force-graph-3d`: map nodes to `{ id, name, type, confidence, color, val }` and links to `{ source, target, color }`.
3. Add a "3D" / "2D" toggle button to the top-right corner of the graph canvas; toggling replaces the Sigma canvas with the Three.js canvas and vice versa; preserve the active node and camera focus across the toggle.
4. Wire 3D interactions: `onNodeClick` → open the same `GraphSidePanel` from Phase 2; `onNodeHover` → highlight neighbor nodes using `force-graph-3d`'s `nodeColor` callback; same filter controls from Phase 2 apply (re-filter the node/link arrays before passing to the 3D graph).
5. Design with the goal that the 3D view should maintain ≥30 FPS at 5,000 nodes on a modern laptop GPU.
   If not possible, implement a node count cap (show the top 2,000 by confidence score in 3D) with a notice: "3D view shows the top 2,000 nodes by confidence. Use filters to explore a subset."

---

## Feature 2 — Guided explorations

1. Add database tables: `explorations (id, title, description, created_by)` and `exploration_steps (id, exploration_id, step_index, entity_id, prose_text, focus_entity_ids[])`. Add a migration.
2. Build the public `ExplorationsPage.tsx` (`/explorations`): a grid of exploration cards — title, description, step count, featured entity type badge; clicking navigates to the tour player.
3. Build `ExplorationPlayer.tsx`: an overlay over the graph canvas. Each step highlights the `focus_entity_ids` nodes (same mechanism as hover highlighting in Phase 2), dims all others, and shows a Shadcn `Card` with the step's prose text (react-markdown). Previous / Next navigation; step progress indicator (e.g., "Step 3 of 7").
4. Build `AdminExplorationEditor.tsx` (`/admin/explorations/new`): a step-builder form — add steps, each with an entity search (to set `focus_entity_ids`) and a prose text area. Drag-to-reorder steps. Preview button opens the player in a modal.
5. Add "Explorations" to the main nav (Phase 2+); link from the homepage beneath the Featured Connections strip.

---

## Feature 3 — Timeline view

1. Build `TimelinePage.tsx` (`/timeline`): fetches all published Narrative and Figure entities that have a `date_era` property (add `date_era text` and `date_sort_year int` columns to the `entities` table in a migration; these are set by the admin when curating narratives/figures).
2. Render a horizontal SVG or Canvas timeline: era bands (Bronze Age / Classical Antiquity / Medieval / Renaissance / Modern) as background columns; entities plotted as labeled dots at their `date_sort_year` position along the x-axis.
3. Implement zoom/pan: horizontal scroll + pinch-zoom. On zoom in, more entity labels become visible (same label threshold pattern as the main graph).
4. Clicking an entity dot → opens the same `GraphSidePanel` from Phase 2 (reuse the component with the entity data); "View full entry →" navigates to the entity detail page.
5. Add entity type filter tabs above the timeline (same pattern as encyclopedia browse): All / Narratives / Figures. Add a culture multi-select filter.

---

## Feature 4 — Comparison view

1. Build `ComparisonPage.tsx` (`/compare`): reads `?a=[slug]&b=[slug]` query params; fetches both entities with their full neighborhood data (connections, claims, sources) using `getEntityBySlug`.
2. Render a two-column layout: each column is a condensed version of the entity detail page (name, type badge, description, connections list, confidence score). A center column or highlighted section shows "Shared connections" — entities that appear in both connection lists (computed client-side by intersecting connection arrays).
3. Add "Add entity to compare" button: opens an entity search input (reuse `useSearch`); appends a `&c=[slug]` param; renders a third column. Support up to 4 entities.
4. Add "Compare" button to entity detail pages: when clicked, if no comparison is in progress, navigates to `/compare?a=[currentSlug]`; if a comparison is already open (stored in `uiStore`), appends the current entity to the existing comparison.
5. Add a shareable URL: the comparison is fully encoded in the URL query params — copying the URL and sharing it opens the same comparison in any browser.

---

## Feature 5 — Export & citation tools

1. Add an "Export" button to entity detail pages and claim detail pages: opens a Shadcn `Dialog` with export format options (Markdown / plain text).
2. For entity export: generate a Markdown string containing the entity name, type, description, connection list, and formatted source citations (author, source title, timestamp/page); copy to clipboard via the Clipboard API.
3. For claim export: generate a Markdown string with the claim statement, argument, confidence score, entities involved, and full source citations with timestamps/pages in a footnote format.
4. Add citation format selection in the export dialog: "Informal (Mythograph citation)" vs. "Chicago-style" (for academic use). Chicago style formats the source metadata as: Author Last, First. "Source Title." Format, Date. Timestamp/Page.
5. Add a "Copy link" button on every entity, claim, and source page: copies the canonical URL to the clipboard with a brief toast notification "Link copied."
