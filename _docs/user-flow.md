# User Flow — Mythograph

Every meaningful journey through the application, organized by feature area. Public flows assume unauthenticated visitors. Admin flows require authentication.

---

## 1. Homepage / Graph View

**Route:** `/`

### 1.1 First visit (unauthenticated)

1. Page loads → full-screen animated knowledge graph (dark canvas, floating nodes with glow, faint edge lines)
2. Nav bar: MYTHOGRAPH wordmark (left) + Graph / Encyclopedia / Sources / Search (right)
3. Hero search bar centered over the graph — placeholder "Search symbols, figures, narratives…"
4. Featured Connections strip pinned to the bottom of the canvas — 3 curated connection cards (admin-configured)
5. Empty state (no published data): graph canvas shows "The knowledge graph is being built." with a ghost-graph illustration and no nodes

### 1.2 Graph exploration

1. User pans and zooms with mouse/trackpad — smooth inertia
2. At default zoom: only large/high-confidence nodes display labels; smaller nodes show labels only on zoom in
3. Hover a node → node and its direct neighbors highlight; all other nodes and edges fade to low opacity
4. Click a node → right side panel slides in: entity name, type badge, confidence bar, one-line description, top 3 connections as chips, "View full entry →" link
5. Click the canvas background → side panel closes; hover state clears
6. Filter panel (collapsible, accessible via a filter icon): toggle entity type visibility, filter by culture/tradition, drag confidence threshold slider
7. Keyboard shortcut `/` focuses the search bar from anywhere in the graph view
8. Search from bar → matching node is highlighted and the camera animates to center on it

### 1.3 Error / empty states

- Graph data fetch fails → "Could not load the knowledge graph. Refresh to try again." with retry button
- All nodes filtered out → "No nodes match the active filters. Try adjusting your selection."
- Filter panel: each type toggle is disabled (greyed) when zero published nodes of that type exist

---

## 2. Encyclopedia Browse

**Route:** `/encyclopedia`

### 2.1 Browse landing

1. Page opens with entity-type filter tabs: All / Symbols / Figures / Narratives / Cultures / Tropes
2. Below tabs: alphabetical card grid — each card shows entity name (Cinzel), type badge (colored border), one-line description (Lora italic), confidence dot
3. Clicking a card navigates to `/entity/[slug]`

### 2.2 Browse states

- Empty category tab: "No [Symbols] have been published yet."
- Loading: skeleton cards matching the live card layout
- Filtered list with no matches: same empty state message

---

## 3. Entity Detail Page

**Route:** `/entity/[slug]`

**Entry points:** graph node click → side panel "View full entry", encyclopedia card, search result, connected entity chip on another entity page

### 3.1 Core flow

1. Header: entity name (Cinzel 28px), type badge, aliases (italic Lora), one-line subtitle
2. Attestation bar: filled segments + "N sources" label
3. Prose description (Lora body text with superscript citation numbers)
4. **Connected entities section:** inline chips — colored dot + entity name + relationship label (e.g., `FIRE · EMBODIES`). Each chip links to that entity's detail page.
5. **Claims panel:** list of claims referencing this entity — each shows claim statement snippet, author, confidence badge. Clicking a claim row → Claim Detail Page.
6. **Sources panel:** list of source anchors — source title, timestamp or page range, short transcript excerpt. Clicking a row → Source Detail Page scrolled to that anchor.
7. **Mini-graph sidebar (right):** small canvas showing this entity + 1–2-hop neighborhood with edge labels. Clicking a neighbor node navigates to that entity's detail page.
8. Breadcrumb trail: Encyclopedia / [Type] / [Name]

### 3.2 Error / empty states

- Entity not found or unpublished → 404 page: "This entity doesn't exist or hasn't been published yet." Link back to encyclopedia.
- No connections yet: section hidden or shows "No connections documented for this entity."
- No sources yet: section hidden or shows "No sources linked yet."

---

## 4. Claim Detail Page

**Route:** `/claim/[id]`

**Entry points:** entity detail claims panel, search result, admin review panel

### 4.1 Core flow

1. Claim statement — large Lora prose block
2. Detailed argument — longer explanation block (if present)
3. Author byline + proposed date
4. Confidence score badge + breakdown table: tier weight / source count / explicitness / corroboration / cross-tier flag
5. **Entities involved:** chips linking to each entity referenced by this claim
6. **Source evidence list:** each entry shows source title, timestamp or page, indented transcript excerpt or paraphrase, and a "Play from timestamp" link (audio/video) or page citation (text)
7. Status badge: Draft / Published / Disputed

### 4.2 Error / empty states

- Claim not found → 404 with link back to encyclopedia
- No source evidence → "No source anchors have been linked to this claim yet."

---

## 5. Source Library

**Route:** `/sources`

### 5.1 Browse flow

1. Table or card list of all published sources
2. Fields per row: title, author, date, format icon (audio/video/text/book), tier badge (Tier 1 / Tier 2), processing status indicator
3. Filter bar: by format, by tier, by status (fully processed / partially / pending)
4. Sort controls: by date, title, extracted claim count
5. Clicking a row → Source Detail Page

### 5.2 Empty / error states

- No sources ingested yet: "No sources have been added yet."
- Filter returns zero results: "No sources match these filters."

---

## 6. Source Detail / Transcript Viewer

**Route:** `/source/[id]`

### 6.1 Core flow — audio/video source

1. Metadata header: title, author, date, format, tier badge, description
2. Inline audio/video player (if media is hosted) or link to external source
3. Scrollable transcript panel with timestamp markers
   - Clicking a timestamp → seeks the player to that moment
   - Extracted entity names highlighted inline → clicking navigates to entity detail page
4. "Extracted Content" sidebar: list of all entities and claims found in this source, each linking to their detail pages

### 6.2 Core flow — text/book source

1. Metadata header (same as above)
2. Full text with page/paragraph markers; extracted entities highlighted inline
3. Same extracted content sidebar

### 6.3 Empty / error states

- Transcript not yet processed: "Transcript is being generated — check back soon."
- No extractions yet: "No entities or claims have been extracted from this source yet."
- Media not hosted: "Audio file is not hosted on Mythograph." Link to original source externally.

---

## 7. Global Search

**Route:** `/search?q=[query]`

**Entry points:** nav search bar (all pages), `/` keyboard shortcut from graph view

### 7.1 Live search (from nav bar)

1. User types → debounced query fires after 200ms
2. Dropdown shows grouped results: Symbols · Figures · Narratives · Tropes · Cultures · Claims · Sources (up to 3 per group)
3. Each result: name or statement snippet + type badge
4. Clicking a result navigates to its detail page
5. "See all results →" link at bottom of dropdown → full search page

### 7.2 Full search page

1. Results grouped by type, each group expandable
2. Left sidebar filters: entity type checkboxes, culture, confidence range
3. Matched terms highlighted in result snippets
4. Pagination or infinite scroll

### 7.3 Empty / error states

- No results: "No results for '[query]'. Try different keywords."
- Empty query: "Enter a term to search symbols, figures, narratives, and more."
- Search service error: "Search is temporarily unavailable."

---

## 8. Admin Authentication

**Route:** `/admin/login`

### 8.1 Login flow

1. Email + password form
2. Submit → Supabase Auth validates credentials
3. Success → redirect to `/admin/dashboard`
4. Invalid credentials → inline error: "Invalid email or password."
5. All `/admin/*` routes are auth-protected — unauthenticated requests redirect to `/admin/login`

### 8.2 Role-based access

- Super Admin: full access to all admin routes
- Editor: access to sources, review queue, entity/claim management; no user management or system settings
- Viewer (internal): read-only access to draft content; no edit routes

---

## 9. Admin Dashboard

**Route:** `/admin/dashboard`

### 9.1 Layout

- Left sidebar nav: Dashboard / Sources / Review Queue / Entities / Claims / Settings
- Main area: stat cards (total entities, claims, sources by status) + pipeline monitor table

### 9.2 Pipeline monitor

- Table of all sources currently in the ingestion pipeline
- Columns: source name / current stage / progress indicator / time in stage / action button
- Stages: Uploaded → Transcribing → Chunking → Extracting → Ready for Review → Published
- Action button per row: "View", "Re-run stage", "Go to review"

---

## 10. Admin: Source Ingestion

**Route:** `/admin/sources/new`

### 10.1 Upload flow

1. Admin selects input type: file upload (audio/video/text/PDF) or URL
2. Metadata form: title, author(s), publication date, tier (Tier 1 / Tier 2), format (auto-detected from file)
3. Submit → file uploads to Supabase Storage; source record created; pipeline auto-triggers
4. Admin redirected to the source's admin detail page, showing pipeline progress in real time (Supabase Realtime)
5. In-app notification when extraction stage completes and items are ready for review

### 10.2 Source list (`/admin/sources`)

- Same fields as public list + pipeline stage + extraction count + review status
- Actions: Edit metadata / Re-run extraction / Archive source

---

## 11. Admin: Extraction Review

**Route:** `/admin/review`

**Entry points:** dashboard "Ready for Review" count, source admin page "Review Extractions" button

### 11.1 Review queue flow

1. List of pending AI extractions grouped by source; sortable by source, date, entity type
2. Admin selects an extraction → review panel opens
3. Panel shows: extracted entity or claim (structured) + source chunk text with the relevant passage highlighted + source timestamp/page reference
4. Per-extraction actions:
   - **Confirm** → entity/claim enters Draft state with source anchor linked
   - **Edit** → inline editor (name, description, connections, claim statement); Save → Draft
   - **Reject** → extraction archived; nothing added to graph
   - **Merge** → type-ahead search for existing entity; merges this extraction into it
   - **Split** → divide a combined extraction into two separate entity records
5. After all extractions from a source reviewed → source status updates to "Curated"

### 11.2 Publication control

- Entity/claim admin view: toggle Published / Draft status per item
- Bulk publish/unpublish from entity manager table (`/admin/entities`)

---

## 12. Phase 2 — 3D Graph View

**Entry point:** "3D" toggle button in graph view top-right

1. Same data as 2D graph, rendered in WebGL 3D space using force-graph-3d
2. Orbit / pan / zoom replace 2D controls; right-click drag orbits
3. Same node coloring, confidence-based sizing, and edge styling
4. Click a node → same side panel as 2D view
5. "2D" toggle returns to flat graph

---

## 13. Phase 2 — Guided Explorations

**Route:** `/explorations`

1. Browse list of admin-created guided tours — title, description, estimated read time, featured entity
2. Click a tour → guided view opens over the graph
3. Each step highlights one or more nodes with a prose explanation alongside
4. Next / Back navigation through steps; progress indicator
5. Final step: links to key entities and an "Explore on your own →" button returning to the full graph

---

## 14. Phase 2 — Timeline View

**Route:** `/timeline`

1. Horizontal timeline plotting narratives, figures, and cultures by date / era
2. Vertical bands for era groupings (Bronze Age, Classical, Medieval, Modern…)
3. Clicking an item → mini panel with entity summary and link to full detail page
4. Scroll/pinch to zoom the timeline axis
5. Filter by entity type and culture

---

## 15. Phase 2 — Comparison View

**Route:** `/compare?a=[slug]&b=[slug]`

**Entry point:** "Compare" button on any entity detail page

1. Select 2–4 entities via search or by navigating from entity pages
2. Side-by-side columns: name, type, description, confidence score, full connection list
3. "Shared connections" highlighted section at bottom
4. Differences indicated; shared connections visually emphasized

---

## 16. Phase 3 — Community Contributions

**Entry point:** "Suggest a Connection" on entity detail pages (authenticated public users)

1. Structured submission form: entities involved, relationship type, claim statement, optional supporting source reference
2. Submit → enters admin moderation queue (not visible to other users)
3. Submitter tracks status on `/my-contributions` page: Pending / Approved / Changes Requested / Rejected
4. Admin approves → submission enters Draft; admin reviews and can publish
5. Admin rejects → submitter notified with optional explanation

---

## 17. Phase 3 — Comments

**Entry point:** Comment section at the bottom of entity, claim, and source pages (authenticated users)

1. Authenticated user types comment → submits
2. Comment enters pre-moderation queue; not visible until approved
3. Approved: comment displays with author display name and date
4. Admin can delete, hide, or flag comments from admin panel
