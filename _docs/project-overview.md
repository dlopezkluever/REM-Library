# Mythograph — Product Requirements Document

**Version:** 1.0
**Date:** May 23, 2026
**Status:** Master Reference / Source of Truth
**Author:** [Project Lead]
**Stakeholders:** Primary Writer(s), Contributing Researchers, Developer(s)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision & Goals](#3-product-vision--goals)
4. [Target Users & Personas](#4-target-users--personas)
5. [Source Material & Data Ingestion Pipeline](#5-source-material--data-ingestion-pipeline)
6. [Information Architecture & Data Model](#6-information-architecture--data-model)
7. [Core Features — MVP (Phase 1)](#7-core-features--mvp-phase-1)
8. [Secondary Features — Phase 2](#8-secondary-features--phase-2)
9. [Future Features — Phase 3+](#9-future-features--phase-3)
10. [Visual & Interaction Design](#10-visual--interaction-design)
11. [Technical Architecture](#11-technical-architecture)
12. [Ingestion & Extraction Pipeline — Technical Spec](#12-ingestion--extraction-pipeline--technical-spec)
13. [Confidence & Weighting System](#13-confidence--weighting-system)
14. [Admin & Content Management](#14-admin--content-management)
15. [Non-Functional Requirements](#15-non-functional-requirements)
16. [Development Phases & Milestones](#16-development-phases--milestones)
17. [Open Questions & Risks](#17-open-questions--risks)
18. [Glossary](#18-glossary)

---

## 1. Executive Summary

Mythograph is a web application that serves as an interactive knowledge graph, encyclopedia, and research tool for the study of comparative mythology, symbolic analysis, and narrative pattern recognition across ancient and modern culture. It is built for a research collective of writers who have spent years analyzing the symbolic, linguistic, and narrative connections between ancient myth, religious texts, art history, and modern storytelling institutions such as Hollywood and contemporary religion.

The platform ingests a large corpus of unstructured source material — hundreds of hours of podcast and speech audio, plus thousands of pages of written articles and books — and transforms it into a structured, interlinked knowledge base. Users explore this knowledge base primarily through a visual graph interface where symbols, narratives, figures, and cultural artifacts are represented as nodes, connected by edges that encode the relationships and interpretive claims proposed by the research group. Node size reflects confidence and attestation strength. Secondary views include encyclopedia-style article pages, searchable source archives, and filterable claim indexes.

The product serves two audiences simultaneously: the internal research team (who curate, edit, and expand the knowledge base) and external visitors (who browse, learn from, and eventually contribute to it).

---

## 2. Problem Statement

The research group has accumulated a massive body of work — speeches, podcasts, articles, cross-references, and interpretive frameworks — but it exists in a fragmented, unorganized state across scattered audio files, documents, and informal notes. There is no single place to see the full picture of how their theories connect, no way for a newcomer to navigate the material, and no structured record of which source supports which claim. The work is inaccessible to anyone who hasn't listened to hundreds of hours of content from the beginning. Key problems include:

- Source material is almost entirely unstructured audio and loose written documents with no consistent tagging, indexing, or cross-referencing.
- Symbolic connections, narrative patterns, and interpretive claims are scattered across many hours of discussion with no centralized catalog.
- There is no way to visualize the web of relationships between symbols, myths, deities, cultural artifacts, and narrative tropes at a glance.
- New readers or followers have no guided entry point — no encyclopedia, no searchable index, no summary of core theories.
- There is no mechanism for the community to contribute new connections, corrections, or supporting evidence in a moderated way.

---

## 3. Product Vision & Goals

**Vision statement:** Mythograph is the canonical, living reference for comparative symbolic and mythological analysis — a tool that makes visible the hidden architecture of myth, symbol, and story across all of human culture, grounded in cited sources and open to collaborative growth.

**Primary goals:**

- Transform hundreds of hours of unstructured audio and text into a structured, searchable, interlinked knowledge base.
- Provide a visual graph interface where the full web of symbolic and mythological connections is explorable at a glance, with node sizing that communicates confidence and attestation depth.
- Serve as a publishable, navigable encyclopedia that makes the research group's work accessible to newcomers and scholars alike.
- Maintain rigorous source grounding — every claim, connection, and entry traces back to a specific moment in a specific source (timestamp, page number, paragraph).
- Support ongoing growth through an admin curation workflow and, eventually, community contribution with editorial approval.

**Success criteria:**

- 100% of extracted claims link to at least one timestamped or page-referenced source.
- The graph visualization loads and is navigable with up to 5,000 nodes without performance degradation.
- A new visitor can find and understand a symbol's meaning, connections, and supporting sources within 3 clicks from the homepage.
- The admin team can add a new source, extract claims, and publish them to the graph in a single session.

---

## 4. Target Users & Personas

### 4.1 Internal: Research Team (Admin/Curators)

- 1 primary writer/theorist and approximately 2–3 active contributing writers.
- Deep domain expertise; they originate the interpretive claims.
- Need tools to efficiently review AI-extracted data, correct it, add nuance, and publish.
- Need to manage sources, tag and categorize content, and control what is public vs. draft.
- Technical comfort level is moderate — they are not developers but are comfortable with web-based tools.

### 4.2 External: Visitors & Learners

- People interested in comparative mythology, religious studies, art history, film analysis, or symbolic literacy.
- Range from casual browsers ("I heard fire is connected to Prometheus and Yahweh — show me") to serious researchers who want to trace claims back to primary sources.
- Need clear navigation, readable encyclopedia entries, and an intuitive visual graph.
- Eventually, power users in this group may submit proposed connections or corrections.

### 4.3 External: Community Contributors (Phase 3)

- Trusted community members who can submit new claims, source references, or corrections through a moderated PR-like workflow.
- Admin approves or rejects contributions before they enter the canonical knowledge base.

---

## 5. Source Material & Data Ingestion Pipeline

This section describes the raw inputs, their formats, and the process for converting them into structured knowledge.

### 5.1 Source Types & Classification

All source material falls into one of two tiers:

| Tier       | Label                      | Description                                                                                                                                                                      | Weight in confidence scoring                                                                             |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Tier 1** | **Primary / Canonical**    | Core speeches, podcasts, and articles by the primary writer(s). These are the source of truth for the research group's theories.                                                 | High — connections drawn from these sources receive maximum confidence weighting.                        |
| **Tier 2** | **Secondary / Supporting** | External academic articles, books, historical references, and supporting research from other authors. These corroborate, contextualize, or provide background for Tier 1 claims. | Lower — connections supported only by Tier 2 sources are flagged as corroborative rather than canonical. |

### 5.2 Source Formats

| Format                                | Estimated Volume      | Processing Needed                                                         |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| Audio (podcasts, speeches, lectures)  | Hundreds of hours     | Speech-to-text transcription → structured transcript with timestamps      |
| Video (recorded talks, interviews)    | Tens of hours         | Audio extraction → speech-to-text → structured transcript with timestamps |
| Written articles (blog posts, essays) | Hundreds of documents | Text extraction, cleanup, paragraph-level indexing                        |
| Books & book chapters                 | Dozens of volumes     | OCR if scanned; text extraction; chapter/page-level indexing              |
| Existing notes or outlines            | Unknown volume        | Manual review and integration                                             |

### 5.3 Ingestion Pipeline Overview

The ingestion pipeline is a multi-stage process. Each stage can be re-run as new sources are added.

**Stage 1 — Collection & Cataloging**
Gather all raw source files into a centralized repository. Each source gets a metadata record: title, author(s), date, format, tier classification (primary/secondary), URL or file reference, and a unique source ID. Output: a Source Registry (a structured index of every source).

**Stage 2 — Transcription**
All audio and video sources are transcribed using an automated speech-to-text system (e.g., OpenAI Whisper, AssemblyAI). Transcripts must include word-level or segment-level timestamps so that extracted claims can link back to the exact moment in the recording. Output: timestamped transcript files (one per source).

**Stage 3 — Text Normalization & Chunking**
All text (transcripts and written documents) is normalized (consistent encoding, formatting cleanup) and split into semantically coherent chunks. For transcripts, chunks align with natural topic boundaries in the conversation. For articles/books, chunks align with paragraphs or sections. Each chunk retains its source ID, position metadata (timestamp range or page/paragraph number), and speaker attribution if applicable. Output: a Chunk Library (thousands of indexed text segments).

**Stage 4 — AI-Assisted Extraction**
Each chunk is processed by an LLM extraction pipeline that identifies and tags:

- **Symbols** mentioned or discussed (e.g., "stone," "fire," "serpent," "tower").
- **Figures** (deities, mythological characters, historical persons) — e.g., "Yahweh," "Prometheus," "Vulcan."
- **Narratives** (specific myths, stories, films, or religious texts referenced) — e.g., "the Prometheus myth," "Genesis 1," "2001: A Space Odyssey."
- **Cultures / Traditions** (the cultural or religious context) — e.g., "Greek," "Hebrew," "Hinduism," "Hollywood."
- **Claims** — the interpretive assertions made by the speaker/writer. A claim is a statement that two or more entities (symbols, figures, narratives) are connected, and an explanation of the nature of that connection. Example: "The stone in the Jacob narrative functions as the same symbolic archetype as the fire stolen by Prometheus — both represent the divine spark captured in material form."
- **Tropes & Patterns** — recurring narrative structures identified across multiple sources (e.g., "the theft of divine power," "the descent to the underworld," "the hidden king").

Output: structured extraction records linked to their source chunks.

**Stage 5 — Human Curation & Review**
The admin team reviews AI-extracted data in a curation interface. They can confirm, edit, reject, merge, split, or enrich extractions. This is where quality control happens — the AI gets the bulk extraction done, but humans ensure accuracy and add interpretive nuance the AI cannot infer. Output: curated, publication-ready knowledge entries.

**Stage 6 — Graph Population**
Curated entries are written to the knowledge graph database as nodes and edges with full metadata. The graph becomes queryable and the visualization reflects the new data. Output: the live knowledge graph.

### 5.4 Ongoing Ingestion

The pipeline is designed for continuous use. As the research group produces new content (new podcasts, new articles), it enters Stage 1 and flows through to Stage 6. The system is additive — new data enriches existing nodes and edges rather than replacing them.

---

## 6. Information Architecture & Data Model

### 6.1 Core Entity Types (Node Types)

The knowledge graph is composed of the following node types:

**Symbol**
A recurring image, object, element, or motif that carries symbolic meaning across myths and art. Examples: stone, fire, serpent, tree, tower, water, cave, throne, eye, gate.
Fields: name, aliases, description, icon/image, category (elemental, architectural, biological, etc.).

**Figure**
A deity, mythological character, historical person, or fictional character. Examples: Yahweh, Prometheus, Vulcan, Osiris, Luke Skywalker.
Fields: name, aliases, tradition/culture, description, type (deity, hero, trickster, etc.).

**Narrative**
A specific myth, story, religious text, film, novel, or artwork. Examples: the Prometheus myth, Genesis 1–3, The Matrix, the Osiris cycle, Michelangelo's Sistine Chapel ceiling.
Fields: title, tradition/culture, medium (myth, scripture, film, painting, etc.), date/era, description.

**Culture / Tradition**
A cultural, religious, or institutional context. Examples: Greek, Hebrew, Hindu, Egyptian, Hollywood, Freemasonry.
Fields: name, description, time period, geographic region.

**Trope / Pattern**
A recurring narrative structure or archetype that appears across multiple narratives. Examples: the stolen fire, the dying-and-rising god, the hidden king, the descent to the underworld.
Fields: name, description, category.

**Claim**
A first-class interpretive assertion that proposes a connection between two or more entities. This is the intellectual unit of the research group's work. A claim is not a fact — it is an argued position with supporting evidence.
Fields: claim_id, statement (human-readable summary), detailed_argument (longer explanation), author (which writer proposed it), source_references (list of grounded citations), confidence_score (computed — see Section 13), status (draft / published / disputed).

**Source**
A reference to a specific piece of source material. This is the evidentiary foundation.
Fields: source_id, title, author(s), date, format (audio/video/text), tier (primary/secondary), URL or file path, duration or page count.

**Source Anchor**
A precise location within a source — a timestamp range in an audio file, a page number and paragraph in a book, a URL fragment in a web article. Every claim links to one or more source anchors.
Fields: anchor_id, source_id (FK), start_timestamp / start_page, end_timestamp / end_page, transcript_excerpt (a short quote or paraphrase for context).

### 6.2 Core Relationship Types (Edge Types)

Edges connect nodes and carry metadata about the nature and strength of the connection.

| Edge Type      | From → To                  | Description                                                    | Example                                   |
| -------------- | -------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `SYMBOLIZES`   | Symbol → Figure            | A symbol represents or is associated with a figure.            | fire → Prometheus                         |
| `APPEARS_IN`   | Symbol → Narrative         | A symbol appears within a specific narrative.                  | stone → Genesis 28 (Jacob's pillow)       |
| `APPEARS_IN`   | Figure → Narrative         | A figure appears in a narrative.                               | Prometheus → Theogony                     |
| `BELONGS_TO`   | Figure → Culture           | A figure belongs to a cultural tradition.                      | Vulcan → Roman                            |
| `BELONGS_TO`   | Narrative → Culture        | A narrative belongs to a cultural tradition.                   | Theogony → Greek                          |
| `PARALLELS`    | Narrative → Narrative      | Two narratives share structural or symbolic parallels.         | Prometheus myth → Genesis 3               |
| `PARALLELS`    | Figure → Figure            | Two figures are argued to be parallel or cognate.              | Prometheus → Lucifer                      |
| `INSTANTIATES` | Narrative → Trope          | A narrative is an instance of a recurring trope/pattern.       | Prometheus myth → "stolen fire" trope     |
| `SUPPORTS`     | Claim → (any node or edge) | A claim asserts the existence or significance of a connection. | Claim #42 supports the edge fire → Yahweh |
| `CITED_IN`     | Source Anchor → Claim      | A source anchor provides evidence for a claim.                 | Podcast Ep. 12 @ 34:15–36:02 → Claim #42  |

### 6.3 Entity Relationship Diagram (Conceptual)

```
                        ┌──────────┐
                        │  Culture  │
                        └────┬─────┘
                  BELONGS_TO │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Figure   │◄──│  Symbol  │──►│ Narrative │
        └────┬─────┘   └──────────┘   └────┬─────┘
             │          SYMBOLIZES /        │
             │          APPEARS_IN          │
             │                              │
             │         PARALLELS            │
             ◄──────────────────────────────►
             │                              │
             │       INSTANTIATES           │
             │              ┌───────────┐   │
             └──────────────► Trope     ◄───┘
                            └───────────┘
                                 ▲
                                 │ SUPPORTS
                            ┌────┴─────┐
                            │  Claim    │
                            └────┬─────┘
                                 │ CITED_IN
                       ┌─────────┴─────────┐
                       │  Source Anchor     │
                       └─────────┬─────────┘
                                 │
                            ┌────┴─────┐
                            │  Source   │
                            └──────────┘
```

---

## 7. Core Features — MVP (Phase 1)

Phase 1 delivers the foundational platform: data ingestion tooling, the core knowledge graph, the primary graph visualization, encyclopedia views, and admin curation tools.

### 7.1 Interactive Knowledge Graph Visualization (Primary View)

This is the centerpiece of the application.

**Display:** A 2D force-directed graph rendered in the browser (using D3.js or a comparable library such as Cytoscape.js or Sigma.js). Nodes represent entities (symbols, figures, narratives, cultures, tropes). Edges represent relationships.

**Node sizing:** Node diameter scales with a computed confidence/prominence score (see Section 13). Heavily attested, frequently referenced symbols and figures appear large. Speculative or thinly sourced connections appear small. This communicates at a glance which elements of the research are bedrock and which are tentative.

**Node coloring:** Each entity type has a distinct color (e.g., symbols = amber, figures = blue, narratives = green, cultures = purple, tropes = red). Color is the primary visual differentiator of type.

**Node labels:** Each node displays its name. At low zoom levels, only large nodes show labels to prevent clutter. At higher zoom, all labels become visible.

**Edge styling:** Edges vary by type (solid for `APPEARS_IN`, dashed for `PARALLELS`, dotted for speculative). Edge thickness scales with the number of claims supporting that connection.

**Interactions:**

- **Pan & zoom** — smooth, responsive navigation across the graph.
- **Click a node** — opens a side panel or modal with the entity's encyclopedia entry, its connections, and its supporting claims/sources.
- **Hover a node** — highlights the node and its immediate connections (dims everything else).
- **Filter controls** — toggle node types on/off, filter by culture/tradition, filter by confidence threshold (e.g., "show only connections with confidence ≥ 0.7"), filter by source tier.
- **Search** — type a symbol, figure, or narrative name to locate it in the graph and center the view on it.
- **Cluster view** — optionally group nodes by culture/tradition so the graph self-organizes into cultural clusters.

**Performance target:** The graph must remain smooth and interactive with up to 5,000 nodes and 15,000 edges. Beyond that, progressive loading or level-of-detail culling should engage.

### 7.2 Encyclopedia / Detail View

Each entity (symbol, figure, narrative, culture, trope) has a dedicated page accessible by clicking its node in the graph or navigating via search/browse.

**Page layout:**

- **Header:** Entity name, type badge, primary image or icon (if available), one-line summary.
- **Description:** A curated prose description of the entity — what it is, its significance in the research group's framework.
- **Connections panel:** A list of all connected entities, grouped by relationship type, each linking to its own page. Example: "Fire — Connected Figures: Prometheus, Vulcan, Yahweh. Connected Narratives: Theogony, Genesis 3, Prometheus Bound."
- **Claims panel:** All claims that reference this entity, each showing the claim statement, the author, and the confidence score. Claims link to their full detail page.
- **Sources panel:** All source anchors that reference this entity, each showing the source title, the timestamp or page range, and a transcript excerpt or paraphrase. Audio/video sources include a playback link or embed that jumps to the relevant timestamp.
- **Mini-graph:** A small inline graph showing this entity and its immediate neighborhood (1–2 hops), providing local context without leaving the page.

### 7.3 Claim Detail View

Each claim has its own page.

**Page layout:**

- **Claim statement:** The human-readable assertion (1–3 sentences).
- **Detailed argument:** A longer explanation of the claim's reasoning, if provided by the writer.
- **Author:** Which researcher proposed this claim.
- **Confidence score:** The computed score with a breakdown of contributing factors (see Section 13).
- **Entities involved:** Links to all symbols, figures, narratives, tropes referenced by this claim.
- **Source evidence:** Every source anchor supporting this claim, with direct links to the relevant moment in the source material. For audio/video, this means a playback link cued to the right timestamp. For text, a page/paragraph citation.
- **Status:** Draft, Published, or Disputed.

### 7.4 Source Library

A searchable, browsable archive of all ingested sources.

- **List view:** All sources with title, author, date, format, tier, and a status indicator (fully processed / partially processed / pending).
- **Source detail page:** Metadata, full transcript (for audio/video) or full text (for written sources), and a list of all claims and entities extracted from this source, each linking back to the knowledge graph.
- **Transcript viewer:** For audio/video sources, a scrollable transcript with timestamps. Clicking a timestamp plays the audio/video from that point (if media is hosted or linked). Extracted entities and claims are highlighted inline within the transcript.

### 7.5 Global Search

A unified search bar accessible from every page. Searches across entity names, claim text, source titles, and transcript content. Results grouped by type (symbols, figures, narratives, claims, sources) with relevance ranking.

### 7.6 Admin: Source Ingestion Interface

An admin-only interface for managing the ingestion pipeline.

- **Upload source:** Upload audio/video files or text documents, or provide URLs. Assign metadata (title, author, date, tier).
- **Transcription status:** Monitor progress of speech-to-text processing.
- **Extraction review:** View AI-extracted entities and claims from each source. For each extraction, the admin can confirm (accept into graph), edit (modify entity names, claim wording, connections), reject (discard), merge (combine with an existing entity), or split (break a combined extraction into separate entities).
- **Batch operations:** Process multiple extractions at once.
- **Publication control:** Toggle entities and claims between draft (admin-only) and published (visible to visitors).

---

## 8. Secondary Features — Phase 2

These features are built after the MVP is stable and populated with data.

### 8.1 3D Graph Visualization (Optional/Alternate View)

A WebGL-based 3D graph (using Three.js or force-graph-3d) as an optional alternate view of the knowledge graph. Same data, same interactions, rendered in 3D space. This provides the "wow factor" immersive experience described in the original vision. It is secondary because 2D is more practical for daily use, but 3D is the aspirational presentation mode.

### 8.2 Guided Explorations / Curated Paths

Admin-created guided tours through the knowledge graph — "Start here, then see this connection, then this one." These serve as onboarding for new visitors and as narrative presentations of key theories. Think of them as interactive essays that walk the reader through a chain of nodes and claims.

### 8.3 Timeline View

A horizontal timeline that plots narratives, figures, and cultural artifacts chronologically. Users can see which myths and stories come from the same era, identify temporal clusters, and spot patterns in how symbols evolve over time.

### 8.4 Comparison View

Select two or more entities and see them side-by-side: their connections, their shared connections, their differences. Useful for the core work of comparative mythology — "How does Prometheus compare to Lucifer?"

### 8.5 Advanced Filtering & Faceted Browse

Multi-dimensional filtering: by culture, by time period, by entity type, by confidence range, by source tier, by author/writer. A faceted browse interface that lets users explore the encyclopedia by drilling down through categories.

### 8.6 Export & Citation Tools

Allow users to export encyclopedia entries, claim summaries, and graph snapshots as formatted text (Markdown, PDF) with proper citations. Useful for researchers who want to reference Mythograph in their own writing.

---

## 9. Future Features — Phase 3+

These are long-term roadmap items that extend the platform beyond a research tool into a community platform.

### 9.1 Community Contribution System (PR-like Workflow)

External users can submit proposed claims, new connections, corrections, or new source references through a structured form. Submissions enter a moderation queue visible only to admins. Admins can approve (merge into the canonical graph), request changes, or reject with explanation. This mirrors the pull request workflow in open-source software development. Contributors see the status of their submissions and get notified of decisions.

### 9.2 User Comments & Discussion

On each entity, claim, or source page, authenticated users can leave comments. Comments are moderated (pre-approval or post-hoc moderation by admin). This creates a discussion layer on top of the canonical knowledge base without mixing community commentary with curated content.

### 9.3 Quiz / Learning Mode

Interactive quizzes that test a user's knowledge of the symbolic connections and mythological parallels in the graph. Questions generated from the graph data: "Which deity is associated with fire across Greek and Roman traditions?" Multiple choice, connection-matching, or open-ended. Gamification (streaks, scores) to encourage engagement.

### 9.4 Semantic / AI-Powered Search

Beyond keyword search, a natural language query interface: "What symbols connect Greek and Hebrew creation myths?" An AI agent queries the graph and synthesizes an answer with citations. This is essentially a RAG (retrieval-augmented generation) interface over the knowledge graph.

### 9.5 API Access

A public (or key-gated) API that allows external developers and researchers to query the knowledge graph programmatically. Enables integration with other research tools, visualizations, or educational platforms.

### 9.6 Embeddable Graph Widget

A lightweight, embeddable version of the graph visualization that can be placed on external websites, blogs, or articles. Shows a subset of the graph relevant to a specific topic.

---

## 10. Visual & Interaction Design

### 10.1 Design Principles

- **Scholarly but approachable.** The aesthetic should feel like a well-designed academic tool — serious, clean, trustworthy — but not sterile or intimidating. Think: the visual quality of a museum exhibit or a beautifully typeset reference book, not a corporate dashboard.
- **Graph-first.** The graph visualization is the hero. The homepage should open directly into the graph or feature it prominently. Every other view should feel like a deeper dive from the graph.
- **Source-grounded.** At every level, the user should sense that this is backed by evidence. Citations, source counts, and confidence indicators should be visible without being overwhelming.
- **Dark mode as default.** Graph visualizations are typically more readable on dark backgrounds (nodes and edges glow against dark space). Offer a light mode toggle but default to dark.

### 10.2 Layout Structure

- **Homepage / Graph View:** The full-screen graph with a collapsible sidebar for filters, search, and legend. A top navigation bar provides access to the encyclopedia browse, source library, and admin panel (if authenticated).
- **Entity / Claim / Source Pages:** Standard content layout — left-aligned prose, right or bottom sidebar with related connections, consistent header with breadcrumb navigation back to the graph.
- **Admin Pages:** Standard dashboard layout with a source management table, extraction review queue, and analytics overview.

### 10.3 Color Palette (Node Types)

| Entity Type     | Suggested Color        | Rationale                                                                                |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Symbol          | Amber / Gold (#F59E0B) | Symbols are the elemental building blocks — gold feels foundational.                     |
| Figure          | Blue (#3B82F6)         | Figures are characters — blue is neutral and readable.                                   |
| Narrative       | Green (#10B981)        | Narratives are stories, living things — green suggests growth and life.                  |
| Culture         | Purple (#8B5CF6)       | Cultures are overarching traditions — purple suggests breadth and tradition.             |
| Trope / Pattern | Red / Coral (#EF4444)  | Patterns are structural, recurring — red draws attention to the underlying architecture. |

### 10.4 Typography

Use a serif font for body text (scholarly tone) and a clean sans-serif for UI labels, navigation, and the graph. Suggested: Merriweather (body) + Inter (UI).

---

## 11. Technical Architecture

### 11.1 Architecture Overview

The application follows a standard three-tier architecture: a frontend SPA (single-page application), a backend API, and a database layer combining a graph database with a relational database and a search index.

```
┌───────────────────────────────────────────────────────────────┐
│                        Frontend (SPA)                         │
│   React / Next.js  +  D3.js / Cytoscape.js (graph viz)       │
│   + Three.js (optional 3D view, Phase 2)                     │
└───────────────────────────┬───────────────────────────────────┘
                            │ REST or GraphQL API
┌───────────────────────────┴───────────────────────────────────┐
│                        Backend API                            │
│   Node.js (Express or Fastify) or Python (FastAPI)            │
│   Auth, business logic, ingestion orchestration               │
└───────┬──────────────┬────────────────────┬───────────────────┘
        │              │                    │
   ┌────▼────┐   ┌─────▼─────┐   ┌─────────▼──────────┐
   │ Neo4j   │   │ PostgreSQL│   │ Search Index        │
   │ (graph) │   │ (metadata,│   │ (Meilisearch or     │
   │         │   │  users,   │   │  Typesense for      │
   │         │   │  sources, │   │  full-text search)  │
   │         │   │  media)   │   │                     │
   └─────────┘   └───────────┘   └─────────────────────┘
```

### 11.2 Frontend

- **Framework:** React with Next.js (for SSR/SSG of encyclopedia pages — good for SEO and fast initial load).
- **Graph visualization:** D3.js (force-directed layout) or Cytoscape.js (purpose-built for graph visualization with better built-in support for large graphs, filtering, and layouts). Sigma.js is another strong option for WebGL-accelerated 2D rendering of large graphs.
- **State management:** Zustand or Redux Toolkit for graph state, filter state, and UI state.
- **Styling:** Tailwind CSS for utility-based styling with a custom design token layer for the color palette and typography defined in Section 10.
- **Markdown rendering:** For encyclopedia entries and claim descriptions, support Markdown with a renderer like react-markdown.

### 11.3 Backend

- **Framework:** Node.js with Fastify (lightweight, high performance) or Python with FastAPI (strong ecosystem for NLP and data processing tasks — may be advantageous given the ingestion pipeline).
- **API design:** REST for CRUD operations on entities, claims, and sources. Consider GraphQL for the frontend graph queries (natural fit for "give me this node and its neighbors N hops deep").
- **Authentication:** JWT-based auth. Admin users authenticate to access curation tools. Visitors browse without authentication (Phase 1). Phase 3 adds user accounts for community features.
- **File storage:** S3-compatible object storage (AWS S3, Cloudflare R2, or MinIO) for audio/video files, transcripts, and uploaded documents.
- **Media serving:** For audio/video playback with timestamp linking, serve media from object storage with signed URLs. The transcript viewer syncs with a lightweight audio player.

### 11.4 Database Layer

**Neo4j (Graph Database)**
The primary store for the knowledge graph. All entity nodes, relationship edges, and their properties live here. Neo4j's Cypher query language makes it straightforward to query for paths, neighborhoods, and pattern matches — exactly what the graph visualization and encyclopedia views need.

Key Neo4j design decisions:

- Each node has a label matching its entity type (`:Symbol`, `:Figure`, `:Narrative`, etc.).
- Each node has a `confidence_score` property computed per Section 13.
- Edges carry `type`, `claim_ids` (which claims support this edge), and a `weight` property derived from confidence.
- Full-text indexes on node names and descriptions for in-graph search.

**PostgreSQL (Relational Database)**
Stores metadata that is better suited to relational modeling: user accounts, source records (the Source Registry), ingestion pipeline status, admin workflow state (extraction review queue), and audit logs. Also stores the raw chunked text (the Chunk Library) with full-text search via PostgreSQL's `tsvector`.

**Search Index (Meilisearch or Typesense)**
A dedicated search engine for fast, typo-tolerant, faceted search across entity names, claim text, and transcript content. Fed from both Neo4j and PostgreSQL. Provides the unified search experience described in Section 7.5.

### 11.5 Deployment

- **Hosting:** A cloud platform such as Vercel (frontend) + Railway, Fly.io, or AWS (backend, databases). Alternatively, a single VPS with Docker Compose for simpler management during early phases.
- **Containerization:** Docker for all services. Docker Compose for local development and potentially production for a small-scale deployment.
- **CI/CD:** GitHub Actions for automated testing and deployment.
- **Monitoring:** Basic application monitoring (uptime, error tracking) via Sentry or similar.

---

## 12. Ingestion & Extraction Pipeline — Technical Spec

This section provides implementation-level detail for the pipeline described conceptually in Section 5.

### 12.1 Transcription

**Tool:** OpenAI Whisper (large-v3 model) or AssemblyAI API.

**Requirements:**

- Input: audio files (MP3, WAV, M4A) or video files (MP4 — extract audio track first via FFmpeg).
- Output: JSON transcript with segment-level timestamps (start time, end time, text), speaker diarization (identify different speakers if possible — important for multi-person podcasts).
- Storage: Raw transcript JSON stored in PostgreSQL, linked to the source record.

**Speaker diarization:** Use a diarization pipeline (e.g., pyannote.audio or AssemblyAI's built-in diarization) to identify speakers. This is important because claims are attributed to specific researchers.

### 12.2 Chunking

**Strategy:** Semantic chunking based on topic shifts, not fixed token counts. Use an LLM or embedding-based approach to identify natural topic boundaries in the transcript.

**Chunk size target:** 500–1500 words per chunk. Each chunk should be a coherent discussion of a single topic or connected set of topics.

**Metadata per chunk:** source_id, chunk_index, start_timestamp, end_timestamp, speaker(s), raw_text.

### 12.3 Extraction Prompt Engineering

The extraction step sends each chunk to an LLM (Claude via API) with a carefully engineered system prompt that instructs it to identify and return structured JSON for:

- Entities (symbols, figures, narratives, cultures, tropes) mentioned in the chunk, with canonical names and aliases.
- Claims — interpretive assertions made in the chunk, structured as: `{ statement, entities_involved, relationship_type, evidence_summary }`.
- The LLM should distinguish between a speaker merely mentioning a myth versus actively arguing an interpretive connection.

**Output format:** Structured JSON per chunk, validated against a schema before storage.

**Extraction quality:**

- Expected precision: ~80–90% (most extractions will be correct).
- Expected recall: ~60–70% (some connections will be missed, especially subtle or implicit ones).
- This is why human curation (Stage 5) is essential — it catches what the AI misses and corrects what it gets wrong.

### 12.4 Entity Resolution

A critical sub-problem: the same entity may be referred to by many names across sources. "Yahweh" / "YHWH" / "Jehovah" / "the God of Israel" are the same figure. "The Prometheus myth" / "Prometheus Bound" / "the theft of fire" may refer to overlapping but distinct narratives.

**Approach:**

- Maintain a canonical entity registry with an authoritative name and a list of known aliases.
- During extraction, the AI attempts to map mentions to existing canonical entities.
- Unresolved or ambiguous mentions are flagged for human review.
- The admin curation interface provides a merge tool to combine duplicate entities.

### 12.5 Pipeline Orchestration

Use a task queue (e.g., BullMQ for Node.js, Celery for Python) to manage the pipeline stages asynchronously. Each source moves through stages independently. Admins can monitor pipeline status in the admin dashboard.

---

## 13. Confidence & Weighting System

Every connection (edge) and every claim in the graph has a computed confidence score that determines its visual prominence (node/edge size) in the graph visualization. This section defines how confidence is calculated.

### 13.1 Inputs to Confidence Scoring

| Factor               | Description                                                                                                                  | Weight |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Source tier**      | Connections drawn from Tier 1 (primary/canonical) sources receive more weight than those from Tier 2 (secondary/supporting). | High   |
| **Source count**     | The number of independent sources that support a connection. More sources = higher confidence.                               | High   |
| **Author authority** | Claims from the primary writer carry more weight than claims from secondary contributors.                                    | Medium |
| **Explicitness**     | Was the connection explicitly argued by a researcher, or inferred by the AI during extraction? Explicit claims score higher. | Medium |
| **Corroboration**    | Does the connection have both Tier 1 and Tier 2 support? Cross-tier corroboration boosts confidence.                         | Medium |
| **Recency**          | More recently discussed connections may indicate the research group's current thinking (optional — can be toggled).          | Low    |

### 13.2 Scoring Formula (Illustrative)

```
confidence = (
    source_tier_weight * tier_score +
    source_count_weight * log(source_count + 1) +
    author_weight * author_score +
    explicitness_weight * explicit_flag +
    corroboration_weight * cross_tier_flag
) / max_possible_score
```

The formula outputs a value between 0.0 and 1.0. The exact weights are tunable by the admin team and should be calibrated once sufficient data is in the graph.

### 13.3 Visual Mapping

| Confidence Range | Node Size  | Edge Thickness    | Visual Treatment                     |
| ---------------- | ---------- | ----------------- | ------------------------------------ |
| 0.8–1.0          | Large      | Thick             | Fully opaque, prominent label        |
| 0.5–0.79         | Medium     | Medium            | Slightly reduced opacity             |
| 0.2–0.49         | Small      | Thin              | Reduced opacity, label only on hover |
| 0.0–0.19         | Very small | Very thin, dashed | Faded, speculative styling           |

### 13.4 Manual Override

Admins can manually set a confidence score for any claim or connection, overriding the computed value. This is useful for cases where the writers have strong conviction about a connection that hasn't been extensively discussed in recorded sources.

---

## 14. Admin & Content Management

### 14.1 Admin Roles

| Role                  | Permissions                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Super Admin**       | Full access: manage users, manage sources, curate extractions, publish/unpublish, configure system settings, manage community submissions (Phase 3). |
| **Editor**            | Manage sources, curate extractions, publish/unpublish content. Cannot manage users or system settings.                                               |
| **Viewer (internal)** | View draft and published content. Cannot edit.                                                                                                       |

### 14.2 Content Workflow States

```
Source uploaded → Transcription (auto) → Chunking (auto) → Extraction (auto)
    → Review Queue → [Admin reviews each extraction] →
        Confirmed → Draft (visible to admin only) → Published (visible to all)
        Rejected → Archived
        Edited → Draft → Published
```

### 14.3 Admin Dashboard

- **Pipeline monitor:** Status of each source through the ingestion pipeline. Estimated time remaining for transcription/extraction.
- **Review queue:** List of pending AI extractions awaiting human review, sortable by source, date, entity type.
- **Content stats:** Total entities, claims, sources, edges in the graph. Breakdown by status (draft/published). Confidence score distribution.
- **Entity manager:** Search, edit, merge, split, or delete entities. View all connections for an entity.
- **Claim manager:** Search, edit, or delete claims. Reassign confidence overrides.

---

## 15. Non-Functional Requirements

### 15.1 Performance

- Graph visualization: smooth interaction (≥30 FPS pan/zoom) with up to 5,000 nodes and 15,000 edges.
- Page load time: encyclopedia pages render in under 2 seconds on a standard broadband connection.
- Search: results return in under 500ms for queries against the full corpus.
- Ingestion pipeline: transcription of a 1-hour audio file completes within 15 minutes. AI extraction of a single chunk completes within 30 seconds.

### 15.2 Scalability

- The system should support up to 50,000 entities and 200,000 edges without architectural changes.
- Source library should support up to 10,000 sources.
- Concurrent user load: support at least 100 simultaneous visitors with acceptable performance.

### 15.3 Reliability

- Automated backups of all databases (Neo4j, PostgreSQL) at least daily.
- The ingestion pipeline should be resumable — if a stage fails, it can restart from the last checkpoint without reprocessing everything.

### 15.4 Security

- Admin authentication with secure password hashing and session management.
- All API endpoints for write operations require authentication.
- Public read endpoints do not require authentication (Phase 1).
- Input sanitization on all user-facing forms (especially Phase 3 community submissions).
- Rate limiting on API endpoints.

### 15.5 Accessibility

- The encyclopedia and content pages meet WCAG 2.1 AA standards.
- The graph visualization, being inherently visual, should have a text-based alternative (the encyclopedia browse) that provides equivalent access to all information.
- Keyboard navigation for the graph: Tab through nodes, Enter to select, Escape to deselect.

### 15.6 SEO

- Encyclopedia pages are server-side rendered (SSR) or statically generated (SSG) for search engine indexing. Each entity page has a unique URL, meta title, and description.
- The graph visualization itself is a client-side interactive — it does not need to be indexable.

---

## 16. Development Phases & Milestones

### Phase 0 — Discovery & Data Collection (Weeks 1–4)

**Goal:** Assemble and catalog all source material. Establish the canonical source registry. Begin transcription.

- Collect all audio, video, and text sources from the research group.
- Classify each source as Tier 1 or Tier 2.
- Build the source registry (a spreadsheet or simple database) with metadata for each source.
- Begin batch transcription of audio/video sources.
- Identify and list known symbols, figures, narratives, and tropes from the primary writer's existing notes or indexes (even if informal). This "seed vocabulary" helps the extraction pipeline.

**Deliverable:** A complete Source Registry and transcribed text for at least the highest-priority Tier 1 sources.

### Phase 1A — Backend Foundation (Weeks 3–8, overlapping with Phase 0)

**Goal:** Build the backend infrastructure: database schema, API, ingestion pipeline.

- Set up Neo4j graph database with the schema from Section 6.
- Set up PostgreSQL for source metadata, chunks, and user management.
- Build the ingestion pipeline (Stages 3–6): chunking, extraction, entity resolution, graph population.
- Build the extraction review admin interface (Section 7.6).
- Build the API layer for querying the graph (node neighborhoods, search, filtered queries).

**Deliverable:** A working backend that can ingest a source, produce AI extractions, present them for review, and write curated data to the graph.

### Phase 1B — Frontend & Visualization (Weeks 6–12, overlapping with Phase 1A)

**Goal:** Build the frontend SPA with the graph visualization, encyclopedia views, and search.

- Build the 2D graph visualization (Section 7.1).
- Build the encyclopedia / entity detail pages (Section 7.2).
- Build the claim detail pages (Section 7.3).
- Build the source library and transcript viewer (Section 7.4).
- Build the global search interface (Section 7.5).
- Integrate frontend with backend API.

**Deliverable:** A fully functional web application with graph visualization, encyclopedia, and search, populated with data from the initial ingestion.

### Phase 1C — Population & Curation (Weeks 10–16, overlapping with Phase 1B)

**Goal:** Run the full source corpus through the ingestion pipeline and curate the results.

- Process all remaining Tier 1 sources through the pipeline.
- Process priority Tier 2 sources.
- Admin team reviews and curates AI extractions (this is the most time-intensive step — expect significant manual effort).
- Tune the confidence scoring formula based on real data.
- Quality assurance: verify source anchors, test navigation, fix edge cases.

**Deliverable:** A populated, curated knowledge graph ready for public viewing.

### Phase 2 — Enhanced Features (Weeks 14–22)

- 3D graph visualization (Section 8.1).
- Guided explorations / curated paths (Section 8.2).
- Timeline view (Section 8.3).
- Comparison view (Section 8.4).
- Advanced filtering and faceted browse (Section 8.5).
- Export and citation tools (Section 8.6).

### Phase 3 — Community & Growth (Weeks 20+)

- Community contribution system (Section 9.1).
- User comments and discussion (Section 9.2).
- Quiz / learning mode (Section 9.3).
- Semantic AI search (Section 9.4).
- API access (Section 9.5).

---

## 17. Open Questions & Risks

### Open Questions

1. **Media hosting:** Will audio/video files be hosted on the platform (expensive storage) or linked to external hosts (YouTube, podcast platforms)? This affects the transcript-to-playback linking experience.
2. **Copyright and licensing:** Some secondary sources (books, academic papers) may have copyright restrictions. How will the platform handle source material it cannot host or display? Will it link out, paraphrase, or summarize?
3. **Extraction model selection:** Which LLM for the extraction pipeline? Claude (strong reasoning, good at nuanced interpretation) vs. GPT-4 vs. open-source models (cheaper for bulk processing, but potentially lower quality on domain-specific extraction). Budget implications are significant given the volume of source material.
4. **Entity taxonomy:** The initial entity type taxonomy (Symbol, Figure, Narrative, Culture, Trope) is a starting point. The research group may discover that additional categories are needed (e.g., Ritual, Object, Place) as data is ingested. The schema should be extensible.
5. **Multi-language support:** Are any sources in languages other than English? If so, translation/multilingual extraction adds complexity.
6. **Public vs. gated access:** Is the visitor-facing site fully public, or should some content be gated behind a free account or even a paid subscription?

### Risks

| Risk                                                                      | Likelihood | Impact | Mitigation                                                                                                                             |
| ------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction quality is too low, requiring excessive manual curation        | Medium     | High   | Invest in prompt engineering; process a small batch first to calibrate quality before full-corpus runs; iterate on extraction prompts. |
| Source corpus is larger than estimated, extending the timeline            | High       | Medium | Prioritize Tier 1 sources ruthlessly; launch with a partial corpus and add incrementally.                                              |
| Graph becomes too dense to navigate visually at scale                     | Medium     | Medium | Implement aggressive filtering, level-of-detail rendering, and cluster-based views. Test with synthetic large datasets early.          |
| Neo4j performance degrades with complex queries on large graphs           | Low        | Medium | Profile queries early; use Neo4j's built-in graph algorithms and caching; consider a read replica for the visualization layer.         |
| Research group's interpretive framework evolves, requiring schema changes | Medium     | Low    | Design the schema with extensibility in mind: generic property bags on nodes/edges, flexible relationship types.                       |
| Single key researcher bottleneck in curation                              | High       | High   | Build efficient curation UX to minimize time per review; train additional editors; provide clear guidelines for AI extraction review.  |

---

## 18. Glossary

| Term                   | Definition                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**              | A first-class interpretive assertion proposed by a researcher, connecting two or more entities and supported by cited sources. |
| **Confidence score**   | A computed value (0.0–1.0) reflecting how well-attested and well-sourced a claim or connection is.                             |
| **Entity**             | Any node in the knowledge graph: a Symbol, Figure, Narrative, Culture, or Trope.                                               |
| **Entity resolution**  | The process of determining that two different textual mentions refer to the same canonical entity.                             |
| **Edge**               | A relationship between two nodes in the knowledge graph, carrying a type and supporting metadata.                              |
| **Extraction**         | The process of identifying entities, claims, and relationships from raw text using an AI model.                                |
| **Knowledge graph**    | The structured network of entities and relationships that forms the core data structure of Mythograph.                         |
| **Node**               | A single entity in the knowledge graph, visualized as a circle in the graph view.                                              |
| **Source anchor**      | A precise location within a source (timestamp, page number) that provides evidence for a claim.                                |
| **Source Registry**    | The centralized catalog of all source material with metadata and tier classification.                                          |
| **Tier 1 / Primary**   | Source material authored by the core research group, treated as authoritative.                                                 |
| **Tier 2 / Secondary** | External supporting material that corroborates or contextualizes Tier 1 claims.                                                |
| **Trope / Pattern**    | A recurring narrative structure or archetype that appears across multiple myths, stories, or artworks.                         |

---

_This document is the master reference for the Mythograph project. All development work should trace back to requirements defined here. As the project evolves, this PRD should be updated to reflect scope changes, new decisions, and lessons learned._
