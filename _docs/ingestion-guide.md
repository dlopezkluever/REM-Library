# Source Ingestion Guide

How to bring source material into Mythograph and populate the knowledge graph.

---

## Overview

The pipeline has five stages:

1. Add a Source
2. Transcribe (audio/video only)
3. AI Extraction
4. Human Review
5. Graph Population

---

## Stage 1 — Add a Source

Go to **Admin → Sources → New Source** and fill in the metadata:

- Title, author, publication date
- Source type (podcast, speech, article, book)
- URL (if applicable)

This registers the source in the database before any content is processed.

---

## Stage 2 — Transcription (Audio/Video Only)

From the source detail page, trigger transcription. The app sends the audio to **AssemblyAI**, which returns a timestamped transcript with speaker diarization.

Text-based sources (articles, books) skip this stage — paste or upload the text directly.

---

## Stage 3 — AI Extraction

Once content is available, trigger extraction from the source detail page. Claude reads the content in semantic chunks and identifies:

- **Symbols** (fire, serpent, flood)
- **Figures** (Prometheus, Osiris, Trickster)
- **Narratives** (creation myths, descent narratives)
- **Cultures** (Greek, Egyptian, Norse)
- **Tropes** (dying and rising god, world tree)
- **Claims** (interpretive statements with source provenance)

Each extraction records the exact timestamp or page reference it came from.

---

## Stage 4 — Human Review Queue

Extracted entities appear in **Admin → Flag Queue / Suggestion Manager**. For each item you can:

- **Confirm** — accepts it into the graph as-is
- **Edit** — adjust the label, type, or metadata before confirming
- **Merge** — combine with an existing node (e.g., "Serpent" merging into an existing Symbol node)
- **Reject** — discards the extraction

Don't skip this step. The review queue is what keeps noise out of the graph.

---

## Stage 5 — Graph Population

Confirmed entities become nodes and edges in the graph. Every node carries full source provenance — clicking it shows which source (and which timestamp or page) it came from.

Relationships between nodes (`SYMBOLIZES`, `APPEARS_IN`, `PARALLELS`, etc.) are weighted by confidence and can be browsed in the 2D/3D graph views.

---

## Quick Reference by Source Type

| Source Type      | Transcription    | Content Input            |
| ---------------- | ---------------- | ------------------------ |
| Podcast / Speech | Yes (AssemblyAI) | Audio file or URL        |
| Video            | Yes (AssemblyAI) | Video file or URL        |
| Article / Essay  | No               | Paste text or URL        |
| Book / PDF       | No               | Upload PDF or paste text |

---

## Tips

- Process one source fully before moving to the next — the review queue grows fast.
- Use the merge tool aggressively to keep node count clean (e.g., "Serpent", "Snake", "Ophidian" should all resolve to one Symbol node).
- Claims are the most valuable extractions — they encode the interpretive layer that makes the graph useful, not just encyclopedic.
