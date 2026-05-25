# Phase 2 — Graph Visualization

**Goal:** The core interactive knowledge graph is fully working: entities and relationships load from Supabase, nodes are colored by entity type and sized by confidence, hover and click interactions work, the side panel opens with entity summaries, and filters let users slice the view. This is the hero feature of Mythograph.

**Builds on:** Phase 1 (database schema, API layer, design system, AppShell)

**Deliverable:** Navigating to `/` loads the animated knowledge graph. Nodes render correctly with type colors and confidence-scaled sizes. Hover dims/highlights neighbors. Clicking a node opens the side panel. Filter controls toggle node types. The graph is smooth at 5,000 nodes target.

---

## Feature 1 — Sigma.js + Graphology setup

1. Install `sigma`, `graphology`, `graphology-layout-forceatlas2`, `graphology-types`; create `src/components/graph/GraphCanvas.tsx` that initializes a Sigma renderer attached to a full-screen `<div>` ref.
2. Create `src/lib/graph/buildGraphology.ts`: takes the output of `getPublishedEntities()` and `getAllPublishedRelationships()` and returns a Graphology `MultiDirectedGraph` with nodes (id, label, type, confidence, x, y if persisted) and edges (source, target, type, weight).
3. Create `src/lib/graph/nodeReducers.ts`: `confidenceToRadius(score: number): number` maps 0–1 to 5–28px; `entityTypeToColor(type: EntityType): string` maps type to hex from constants.
4. Create `src/lib/graph/edgeReducers.ts`: maps edge `weight` to `size` (0.3–1.5px) and edge `type` to `color` and `dashed` flag.
5. Wire GraphCanvas to TanStack Query: on mount, fetch entities + relationships; call `buildGraphology`; pass the graph to Sigma; run `forceAtlas2` layout for 100 iterations if nodes lack persisted coordinates; after layout settles, persist `position_x/y` back to Supabase in a background call.

---

## Feature 2 — Node rendering and labels

1. Apply Sigma node reducers: set `color`, `size`, and `label` (entity name) per node. Nodes with `size < 9px` receive `hideLabel: true` at the default zoom level.
2. Implement label visibility by zoom: in Sigma's `afterRender` callback, check the camera ratio — enable labels for all nodes when zoom ratio > 0.5 (zoomed in); use the `hideLabel` threshold for default zoom.
3. Add glow effect: render a second, larger, low-opacity circle behind each node using Sigma's custom node renderer (WebGL program) — radius is `node.size + 5`, color is node color at 12% opacity.
4. Implement node label font: configure Sigma's `labelFont` to `'Cinzel, Georgia, serif'`, `labelSize` proportional to node size, `labelColor` as `rgba(255,255,255,0.82)`.
5. Test with the seed data from Phase 1 (5–10 nodes); verify all node types render with correct colors and appropriate sizes given their confidence scores.

---

## Feature 3 — Hover, click, and side panel

1. Implement hover state in Sigma: on `enterNode` event, set hovered node to full opacity and all direct neighbor nodes to full opacity; set all other nodes to 15% opacity and edges to 5% opacity. On `leaveNode`, restore all to default opacity.
2. Create `src/stores/graphStore.ts` (Zustand): stores `activeNodeId: string | null`, `hoveredNodeId: string | null`, `filterState` (entity type toggles, confidence threshold, culture filter).
3. On Sigma `clickNode` event: set `graphStore.activeNodeId`; open the side panel.
4. Create `src/components/graph/GraphSidePanel.tsx`: a `<Sheet>` component (Shadcn) that slides in from the right (320px). Reads `activeNodeId` from graphStore; calls `getEntityBySlug` with that entity's slug via TanStack Query; renders: entity name (Cinzel), type badge, attestation bar, one-line description, top 3 connections as EntityChips, "View full entry →" link to `/entity/[slug]`, close button.
5. Clicking the graph canvas background sets `activeNodeId = null`, closes the side panel, and clears hover state.

---

## Feature 4 — Filter controls

1. Create `src/components/graph/GraphFilters.tsx`: a collapsible panel (toggle with a filter icon button in the top-right of the canvas). Contains:
   - Entity type toggle checkboxes (Symbol, Figure, Narrative, Culture, Trope) — each labeled with its badge color
   - Confidence threshold slider (0–1, step 0.05) with a "≥ 0.X" readout
   - Culture/tradition multi-select dropdown (populated from published Culture entities)
2. On filter change: update `graphStore.filterState`; recompute which nodes are visible; set hidden nodes' `hidden: true` attribute in the Graphology graph; call `sigma.refresh()`.
3. Add a "Reset filters" button that restores all toggles to enabled and threshold to 0.
4. When a filter causes all nodes of a given type to be hidden, disable that toggle's checkbox with a greyed appearance.
5. Persist filter state in `graphStore` (Zustand persist middleware to localStorage) so the user's filter settings survive page reload.

---

## Feature 5 — Graph search + featured connections

1. Create `src/components/graph/GraphSearchBar.tsx`: an overlay input centered over the graph canvas (renders in the hero position from the mockup). On input, debounce 200ms, call `getPublishedEntities()` filtered by name similarity (pg_trgm). Show a dropdown of up to 8 matching entity names.
2. On selecting a result: clear the current hover state; use Sigma's camera API (`sigma.getCamera().animate()`) to center and zoom on the matching node with a 400ms ease animation; set that node as `activeNodeId` to open the side panel.
3. Wire the global `/` keyboard shortcut: `useEffect` on the graph page listens for `keydown` where `event.key === '/'` and focuses the search input.
4. Create `src/components/graph/FeaturedConnections.tsx`: a strip pinned to the bottom of the canvas (from the mockup). Reads 3 admin-configured "featured connection" records from a `featured_connections` table (add this table: `id, title, description, entity_color`); renders three cards with entity-color borders, Cinzel title, Lora description.
5. Add the `featured_connections` table migration (`supabase/migrations/...`); seed 3 placeholder records matching the mockup's "FIRE → PROMETHEUS → YAHWEH", "DYING GOD → HOLLYWOOD", "SERPENT → EDEN → WISDOM" examples.
