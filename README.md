# Mythograph

### REM Library — Interactive Knowledge Graph for Comparative Mythology

Mythograph is a web application and research tool that transforms a large corpus of unstructured source material — podcasts, speeches, articles, and books — into a structured, interlinked knowledge base for comparative mythology, symbolic analysis, and narrative pattern recognition.

The core interface is a **visual knowledge graph** where symbols, figures, narratives, and cultural artifacts are represented as nodes connected by edges encoding interpretive relationships. Node size communicates confidence: heavily attested connections appear large, speculative ones small. Secondary views include encyclopedia-style entity pages, a source library with timestamped transcripts, and a filterable claim index.

---

## What It Does

The platform serves two audiences simultaneously:

- **Internal research team** — curate, review, and expand a knowledge base built from hundreds of hours of audio and thousands of pages of text.
- **External visitors** — browse, search, and trace any interpretive claim back to the exact source moment that supports it.

### Ingestion Pipeline

Raw source material flows through a multi-stage automated pipeline:

1. **Transcription** — Audio/video transcribed via AssemblyAI with speaker diarization and segment-level timestamps.
2. **Chunking** — Transcripts and documents split into semantically coherent chunks, each retaining its source position metadata.
3. **AI Extraction** — Each chunk is processed by Claude to identify symbols, figures, narratives, cultures, tropes, and the interpretive claims made by the speakers.
4. **Human Curation** — Admins review AI extractions in a review queue: confirm, edit, merge, split, or reject.
5. **Graph Population** — Curated entries are written to the knowledge graph as nodes and edges with full source provenance.

Every published claim links back to a specific timestamp or page reference in a specific source.

### Knowledge Graph Data Model

| Node Type           | Examples                                                         |
| ------------------- | ---------------------------------------------------------------- |
| **Symbol**          | fire, stone, serpent, tower, eye                                 |
| **Figure**          | Prometheus, Yahweh, Osiris, Vulcan                               |
| **Narrative**       | Genesis 3, the Prometheus myth, _2001: A Space Odyssey_          |
| **Culture**         | Greek, Hebrew, Egyptian, Hollywood                               |
| **Trope / Pattern** | stolen fire, dying-and-rising god, descent to the underworld     |
| **Claim**           | A sourced interpretive assertion connecting two or more entities |

Edges encode relationship types (`SYMBOLIZES`, `APPEARS_IN`, `PARALLELS`, `INSTANTIATES`, `SUPPORTS`) and carry confidence weights derived from source tier, source count, and explicitness of the claim.

---

## Tech Stack

- **Frontend:** React + Vite, TypeScript, Tailwind CSS
- **Backend / Database:** Supabase (Postgres + Auth + Storage)
- **Graph Visualization:** D3.js / Cytoscape.js (force-directed 2D)
- **Transcription:** AssemblyAI
- **AI Extraction:** Claude API (Anthropic)
- **Component Library:** shadcn/ui

---

## Setup

1. Clone the repository
2. Install dependencies:
   ```sh
   npm install
   ```
3. Copy the env template:
   ```sh
   cp .env.example .env.local
   ```
4. Fill in your credentials in `.env.local` (see [Environment Variables](#environment-variables) below)
5. Start the dev server:
   ```sh
   npm run dev
   ```

---

## Scripts

| Command             | Description                 |
| ------------------- | --------------------------- |
| `npm run dev`       | Start development server    |
| `npm run build`     | Build for production        |
| `npm run lint`      | Run ESLint                  |
| `npm run typecheck` | Run TypeScript type checker |
| `npm run test`      | Run Vitest test suite       |
| `npm run seed`      | Reset local Supabase and load seed data |
| `npm run smoke`     | Run the Supabase API smoke test |

### Local Supabase

Phase 1 uses Supabase migrations and seed data for local development:

```sh
npx supabase start
npm run seed
npm run smoke
```

The seeded admin account is `admin@mythograph.local` with password `mythograph-admin`.
Set `VITE_SUPABASE_INTEGRATION_TESTS=true` when running Vitest against the local Supabase instance.

---

## Environment Variables

| Variable                    | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Supabase project URL                               |
| `VITE_SUPABASE_ANON_KEY`    | Supabase anon/public key                           |
| `VITE_SUPABASE_INTEGRATION_TESTS` | Enables local Supabase integration tests when set to `true` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side / pipeline use only) |
| `ASSEMBLYAI_API_KEY`        | AssemblyAI transcription API key                   |
| `ANTHROPIC_API_KEY`         | Claude API key for the extraction pipeline         |
