# Phase 3 — Encyclopedia & Content Views

**Goal:** All public content-reading views are functional: the encyclopedia browse page, entity detail pages, claim detail pages, source library, and source/transcript viewer. These pages use the light ContentShell and render real data from Supabase.

**Builds on:** Phase 1 (API layer, design system, ContentShell) and Phase 2 (graph visualization — the mini-graph sidebar uses the same Sigma/Graphology stack)

**Deliverable:** A visitor can navigate from the graph to an entity's full encyclopedia page, read its description, see its connections, click through to claims, trace claims back to source citations, and browse the source library. All pages render correctly with seed data.

---

## Feature 1 — Encyclopedia browse page

1. Build `EncyclopediaBrowsePage.tsx`: fetches all published entities via `getPublishedEntities()` (TanStack Query); renders entity-type filter tabs (All / Symbols / Figures / Narratives / Cultures / Tropes) using Shadcn `Tabs`.
2. Build `EntityCard.tsx` in `src/components/entity/`: renders entity name (Cinzel), `EntityBadge` (type), one-line description (Lora italic), confidence dot; clicking the card navigates to `/entity/[slug]`.
3. Add alphabetical sorting; implement the tab filter (client-side filter on the fetched array by `entity.type`).
4. Add loading state: render 12 `Skeleton` cards matching the EntityCard layout while the query is pending.
5. Add empty state per tab: "No [Symbols] have been published yet." in Cinzel label + Lora sentence.

---

## Feature 2 — Entity detail page

1. Build `EntityDetailPage.tsx`: fetches entity by slug (`getEntityBySlug`); renders the full layout from `user-flow.md` Section 3: header (name, type badge, aliases), attestation bar (`AttestationBar`), prose description (react-markdown), connected entity chips, claims panel, sources panel.
2. Build `EntityChip.tsx` in `src/components/entity/`: renders a chip with colored dot (entity type color), entity name (Lora), relationship label (Cinzel 6.5px uppercase); clicking navigates to that entity's page.
3. Build the claims panel: fetches claims via `getClaimsForEntity(entityId)`; renders each as a row with the claim statement snippet, author name, and `ConfidenceBadge`; clicking a row navigates to `/claim/[id]`.
4. Build the sources panel: fetches source anchors via `getSourceAnchorsForClaim` for all claims on this entity; renders each anchor as a row with source title, timestamp/page range (Lora), transcript excerpt (italic).
5. Build `MiniGraph.tsx`: uses a small Sigma canvas (174px wide, matching the mockup sidebar) to display the entity + its 1-hop neighborhood; nodes clickable — clicking a neighbor navigates to that entity's detail page. Reuse `buildGraphology` and `nodeReducers` from Phase 2.

---

## Feature 3 — Claim detail page

1. Build `ClaimDetailPage.tsx`: fetches claim by id; renders claim statement (Lora 15px), detailed argument block (react-markdown), author byline (Lora italic), confidence score badge.
2. Build `ConfidenceBreakdown.tsx`: a table or stacked label list showing the contributing factors (source tier weight, source count, explicitness, corroboration) and their computed contributions — values pulled from the claim's stored metadata.
3. Render the entities panel: chips (using `EntityChip`) for each entity referenced by the claim via `claim_entities`.
4. Render the source evidence list: each `source_anchor` linked to the claim via `claim_evidence` — shows source title, timestamp range or page citation, indented transcript excerpt. For audio/video sources: a "Play from [timestamp]" link (opens the source detail page at that timestamp anchor).
5. Render status badge: Draft / Published / Disputed using `EntityBadge` styling pattern (colored border + background + Cinzel text).

---

## Feature 4 — Source library

1. Build `SourceLibraryPage.tsx`: fetches all sources via `getAllSources()`; renders a table using Shadcn `Table`. Columns: title (links to `/source/[id]`), author(s), date, format icon (audio/video/text/book using lucide-react icons), tier badge, pipeline stage indicator.
2. Add client-side filter controls above the table: format multi-select, tier toggle (Tier 1 / Tier 2), pipeline stage filter.
3. Add sort controls: by date (default), by title, by extracted claim count.
4. Add loading skeleton: table rows with `Skeleton` cells.
5. Add empty state: "No sources have been added yet." — shown only when the sources array is empty after loading.

---

## Feature 5 — Source detail + transcript viewer

1. Build `SourceDetailPage.tsx`: fetches source by id; renders metadata header (title, author, date, format, tier badge, description).
2. Build `TranscriptViewer.tsx` for audio/video sources: fetches the source's chunks (ordered by `chunk_index`); renders each chunk as a timestamped paragraph. Format: `[HH:MM:SS]` timestamp in Verdigris + chunk text in Lora. Clicking a timestamp fires a custom event or callback to seek the audio player.
3. Add entity highlighting in transcript: after loading the entity list, find entity names in chunk text using a simple string match; wrap matched text in a `<button>` that navigates to that entity's detail page on click.
4. Add the audio player for hosted media: use the browser native `<audio>` element (no library needed) pointing to a signed Supabase Storage URL; expose a `seekTo(seconds)` method via a ref, called by the timestamp click handler.
5. Build the "Extracted Content" sidebar: renders a list of all entities and claims extracted from this source (joined from `chunks` → `extractions` → confirmed entities/claims); each item is a chip linking to its detail page.
