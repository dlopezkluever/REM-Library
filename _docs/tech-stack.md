# Tech Stack — Mythograph

All decisions are grounded in the PRD's requirements and the user's explicit calibration (TypeScript, Vite, Supabase). Where the PRD specifies a technology the user overrode, the override is applied unconditionally and the tradeoff is documented.

---

## Language

**TypeScript (strict mode)**

Why: User-specified. TypeScript's type system is essential for a project where data correctness matters — every entity, edge, claim, and source anchor must be correctly typed end-to-end from the database to the UI. The domain model (Section 6 of the PRD) is complex enough that untyped JavaScript would become a maintenance hazard.

Best practices:

- Enable `strict: true` in tsconfig; no `any` types allowed.
- Generate types directly from the Supabase schema using `supabase gen types typescript` — never write database types by hand.
- Use Zod for runtime validation at system boundaries (API responses from external services, ingestion pipeline inputs).

Pitfalls to avoid:

- Do not use `as` casts to escape type errors; fix the underlying typing instead.
- Do not inline complex generics into component props — extract named types.

---

## Frontend Framework

**React 18 + Vite 5**

Why: User-specified Vite. Vite provides sub-second HMR and a clean TypeScript-first development experience without the complexity of Next.js. React 18's concurrent features (Suspense, startTransition) are useful for the graph visualization's progressive loading.

> Assumed: The PRD recommends Next.js for SSR/SSG of encyclopedia pages for SEO. Since the user specified Vite, encyclopedia pages will be client-rendered in Phase 1–5. SSG can be layered in using vike (formerly vite-plugin-ssr) without changing component architecture. SEO is treated as a Phase 6+ concern.

Best practices:

- Use React Router v6 (data router pattern) for all routing.
- Co-locate component-level state with the component; lift to Zustand only when state is needed across unrelated component trees.
- Use `React.lazy` + `Suspense` for code-splitting the graph canvas, admin panel, and 3D view — these are large bundles.

Pitfalls to avoid:

- Do not put Sigma.js canvas state into React state — it lives in Sigma's own instance. Use refs to bridge React and the Sigma instance.
- Avoid `useEffect` for data fetching; use React Query (TanStack Query) instead.

---

## Data Fetching & Server State

**TanStack Query v5**

Why: Not specified in PRD but is the standard for async server state in Vite/React apps. Provides caching, background refetch, loading/error states, and optimistic updates — all needed for the admin curation workflow and live graph data.

Best practices:

- Use `queryKey` arrays that include all variables the query depends on (entity slug, filter params, etc.).
- Set `staleTime` to 60 seconds for encyclopedia data (low change rate); 0 for admin review queue (needs fresh data).

---

## Routing

**React Router v6 (Data Router)**

Why: Standard SPA router for Vite + React. The Data Router pattern allows route-level data loaders and actions, enabling pre-fetching encyclopedia pages before navigation.

Route structure:

```
/                         → GraphPage
/encyclopedia             → EncyclopediaBrowsePage
/entity/:slug             → EntityDetailPage
/claim/:id                → ClaimDetailPage
/sources                  → SourceLibraryPage
/source/:id               → SourceDetailPage
/search                   → SearchPage
/admin/login              → AdminLoginPage
/admin/dashboard          → AdminDashboardPage
/admin/sources            → AdminSourceListPage
/admin/sources/new        → AdminSourceNewPage
/admin/review             → AdminReviewQueuePage
/admin/entities           → AdminEntityManagerPage
/admin/claims             → AdminClaimManagerPage
/admin/settings           → AdminSettingsPage
```

---

## Styling

**Tailwind CSS v3**

Why: PRD specifies Tailwind. The utility-first approach pairs well with Shadcn/ui and makes the custom design tokens (the Stone/Charcoal/Verdigris palette from the mockups) easy to maintain in a single config file.

Best practices:

- Define all design tokens (colors, typography sizes, spacing) in `tailwind.config.ts` — never use arbitrary values for project-specific tokens.
- Use Tailwind's `dark:` variant for the dual-mode design (dark graph view, light content pages).
- Keep component-level Tailwind strings in `cva` (class-variance-authority) variant maps, not scattered across JSX props.

Pitfalls to avoid:

- Do not override Tailwind styles with raw CSS except for the Sigma.js canvas and third-party graph libraries.
- Do not use `@apply` extensively — it defeats the purpose of utility classes and makes tree-shaking harder.

---

## Component Library

**Shadcn/ui**

Why: Shadcn provides unstyled, accessible Radix UI primitives pre-wired with Tailwind. Because it copies component source into the repo (not an installed npm package), every component can be restyled to match the Mythograph mockup aesthetic — Cinzel typography, Stone/Charcoal palette, 0.5px borders — without fighting a library's opinion.

Best practices:

- Add only the components you actually use; don't bulk-add the entire set.
- Customize the base `cn()` utility to include any project-wide class merges.
- Override Shadcn's CSS variables (`--background`, `--foreground`, `--primary`, etc.) with the Mythograph design tokens in `globals.css`.

---

## Graph Visualization (2D)

**Sigma.js v3 + Graphology**

Why: The PRD mentions D3.js, Cytoscape.js, or Sigma.js. Sigma.js with WebGL rendering is the best choice for the stated performance target (5,000 nodes / 15,000 edges at ≥30 FPS). Graphology is Sigma's underlying graph data structure — it is typed, serializable, and separate from the rendering layer, which keeps graph logic testable outside the canvas.

Best practices:

- Store the graph data in a Graphology `MultiGraph` instance; keep the Sigma renderer as a side effect of that graph.
- Use Sigma's built-in `forceAtlas2` layout (via `graphology-layout-forceatlas2`) for the force-directed layout.
- For confidence-based node sizing: map `confidence_score` (0.0–1.0) to a pixel radius range (5px–28px) in the node reducer.
- For large graphs, use `graphology-communities-louvain` to pre-compute cluster IDs and apply cluster-based coloring or grouping.

Pitfalls to avoid:

- Do not re-render the entire Sigma graph on React state changes — use Sigma's programmatic API (`sigma.refresh()`) for incremental updates.
- Do not load all 50k nodes at once at initial render; lazy-load based on viewport or filter.

---

## Graph Visualization (3D) — Phase 2

**force-graph-3d (Three.js)**

Why: PRD specifies Three.js for the optional 3D view. `force-graph-3d` wraps Three.js with a force-directed 3D layout out of the box, matching how Sigma handles 2D. Same Graphology data can be adapted to its format.

---

## State Management

**Zustand**

Why: PRD specifies Zustand or Redux Toolkit; Zustand is simpler and sufficient for this project's state needs. Global state is limited to: graph filter settings, active side panel entity, search query, and auth session.

Store slices:

- `graphStore`: node type visibility toggles, culture filter, confidence threshold, active node ID, camera position
- `uiStore`: side panel open/closed, active page, theme (dark/light)
- `authStore`: session, user role

Pitfalls to avoid:

- Do not store server data (entity details, claim data) in Zustand — that belongs in TanStack Query's cache.

---

## Backend & Database

**Supabase**

Why: User-specified. Supabase provides PostgreSQL, Auth, Storage, Edge Functions, and Realtime in a single managed platform — eliminating the need to self-host and coordinate multiple services.

> Assumed: The PRD specifies Neo4j (graph database) + PostgreSQL + a separate search index (Meilisearch/Typesense). Since the user specified Supabase, all data is stored in Supabase PostgreSQL. The knowledge graph is modeled as adjacency list tables (`entities` + `relationships`). At the target scale (50k nodes, 200k edges), PostgreSQL with proper B-tree indexes handles 1–3 hop neighborhood queries in milliseconds. Deep traversal queries use recursive CTEs. This trades some graph query expressiveness for operational simplicity and avoids managing a separate Neo4j instance.

### Supabase PostgreSQL — graph modeling approach

- `entities` table: all nodes (Symbol, Figure, Narrative, Culture, Trope)
- `relationships` table: all edges with `from_entity_id`, `to_entity_id`, `relationship_type`, `weight`, `claim_ids[]`
- Neighborhood query (1 hop): single JOIN on `relationships`
- Neighborhood query (2 hops): CTE with two JOIN levels
- Full-text search: `pg_trgm` extension + `tsvector` generated columns on `entities.name`, `entities.description`, `chunks.raw_text`
- Graph layout coordinates: stored as `position_x float`, `position_y float` on entities (computed once by ForceAtlas2, persisted)

### Supabase Auth

- Admin user accounts with role metadata stored in a `profiles` table
- Row Level Security (RLS) policies: public read on published entities/claims/sources; write requires authenticated admin role
- JWT tokens handled by `@supabase/ssr` package

### Supabase Storage

- Buckets: `source-files` (audio, video, PDF, text uploads), `transcripts` (JSON transcript files), `assets` (entity images/icons)
- Signed URLs for audio/video playback (time-limited access)
- Max file size: 500MB for audio/video (configurable in Supabase dashboard)

### Supabase Edge Functions

- `trigger-transcription`: called after source upload; dispatches transcription job to AssemblyAI
- `trigger-extraction`: called after chunking completes; batches chunks to Claude API
- `compute-confidence`: recalculates confidence scores for affected entities when new evidence is added
- `search`: full-text search endpoint wrapping PostgreSQL FTS with relevance ranking

### Supabase Realtime

- Admin pipeline monitor subscribes to `sources` table changes to show live stage progression
- Extraction review queue subscribes to `extractions` table changes

Pitfalls to avoid:

- Do not query Supabase from every component directly — centralize all queries in `src/lib/api/` modules.
- Do not disable RLS for convenience; design policies before writing application code.
- Supabase Edge Functions have a 150ms cold start — do not use them for synchronous user-facing API calls. Use the PostgREST auto-API for read queries.

---

## Search

**PostgreSQL Full-Text Search (Supabase built-in)**

Why: At Phase 1–4 scale, pg_trgm + tsvector provides typo-tolerant, faceted search without a separate service. The `pg_trgm` extension enables fuzzy matching on entity names (e.g., "Prometeus" → Prometheus).

> Assumed: The PRD specifies Meilisearch or Typesense as a dedicated search index. These remain upgrade options if search performance becomes a bottleneck at scale. The Supabase approach is architecturally identical — the `search` Edge Function wraps the SQL query — so swapping to an external search engine later requires changing only that one function.

Implementation:

- `entities`: `fts tsvector GENERATED ALWAYS AS (to_tsvector('english', name || ' ' || coalesce(description,''))) STORED` + GIN index
- `chunks`: same pattern on `raw_text`
- Search query: `websearch_to_tsquery()` for natural query parsing + `word_similarity()` from pg_trgm for fuzzy matching

---

## Ingestion Pipeline

### Transcription — AssemblyAI API

Why: AssemblyAI provides a managed API that handles audio upload, speech-to-text (with speaker diarization), and returns timestamped segment JSON — avoiding the infrastructure overhead of running Whisper locally. It covers the PRD's requirements for word/segment-level timestamps and multi-speaker identification.

### Extraction — Claude API (claude-sonnet-4-6)

Why: The PRD explicitly specifies Claude for extraction (Section 12.3). Claude's structured output and strong reasoning on nuanced domain content (comparative mythology) makes it the right choice for identifying symbols, figures, claims, and relationships from transcripts.

Pipeline execution:

- Supabase Edge Function triggers transcription after upload
- On transcription completion webhook → chunking runs (Node.js script or Edge Function)
- Each chunk dispatched to Claude API with extraction prompt → structured JSON response stored in `extractions` table
- Supabase Realtime notifies admin dashboard of stage progression

---

## Markdown Rendering

**react-markdown + remark-gfm + rehype-sanitize**

Why: Encyclopedia entries, claim descriptions, and source descriptions support Markdown formatting. rehype-sanitize is mandatory to prevent XSS from user-created content.

---

## Hosting & Deployment

**Frontend: Vercel**
Why: Vite apps deploy to Vercel with zero configuration. Vercel's edge network provides global CDN for the SPA shell and static assets.

**Backend: Supabase (managed)**
No additional hosting needed — Supabase manages the PostgreSQL instance, Edge Functions runtime, Storage, and Realtime infrastructure.

**CI/CD: GitHub Actions**

- On PR: lint (ESLint), type-check (tsc --noEmit), unit tests
- On merge to main: auto-deploy to Vercel production; run Supabase migrations via `supabase db push`

---

## Dev Tooling

| Tool                       | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| ESLint + typescript-eslint | Code quality and type-aware lint rules                         |
| Prettier                   | Consistent formatting                                          |
| Husky + lint-staged        | Pre-commit lint/format on staged files                         |
| Vitest                     | Unit and integration tests                                     |
| Supabase CLI               | Local development, migrations, type generation                 |
| dotenv-vault               | Secure management of environment variables across environments |
