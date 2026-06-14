# Mythograph — Future Feature Brainstorm

**Audience lens:** artists, writers, historians, mythology nerds, researchers, symbolic thinkers.
**North star:** every feature should make the knowledge graph feel *alive*, *discoverable*, and *generative* — a tool you come back to not just to look things up but to *think with*.

---

## 1. "Shortest Path" Explorer — Six Degrees of Mythology

**The idea:** Click any two entities and the app finds and animates the shortest path between them through the graph. "How is the Serpent connected to the Holy Grail?" — watch it trace through 4–5 intermediate nodes, lighting up each edge as it goes.

**Why it works for this audience:** Nerds and writers will spend hours playing with this. It surfaces non-obvious connections that even the research team might not have consciously articulated. It also acts as a *discovery engine* — every path found is potentially a new claim waiting to be formalized.

**Mechanics:**
- Dijkstra/BFS on the published relationship graph, weighted by confidence score.
- Rendered as an animated traversal in the main graph, then summarized as a chain in a sidebar.
- "Explain this path" button: generates a prose narrative of the connection using the claim text along each edge.
- Shareable as a URL (`/explore/path?from=fire&to=holy-grail`) so users can send discoveries to each other.

---

## 2. Symbol Combination Engine

**The idea:** Select two or more symbols and ask "where do these collide?" — the app finds all entities, narratives, and claims where both symbols appear together or are explicitly connected. Think of it as intersection search for the symbolic layer.

**Example:** Select `fire` + `serpent` → shows every narrative where both appear (Genesis, Prometheus, the Nahuatl Xiuhcoatl), every figure associated with both, and the claims that argue a structural link between the two symbols.

**Why it works:** Artists building visual work and writers creating symbolic systems need to know *where symbols cluster*. This is that tool.

**UI:** A "Symbol Lab" panel — multi-select entity chips, hit "Find intersections," see a filtered subgraph and a text panel of relevant claims.

---

## 3. Narrative DNA — Symbolic Breakdown of a Story

**The idea:** For any Narrative entity, display a visual breakdown of its symbolic composition: what percentage of its connections are elemental symbols vs. figures vs. tropes, and which symbol *families* dominate it.

**Example:** The Genesis 3 narrative → 40% elemental symbols (tree, fruit, serpent, light/dark), 30% figures (Yahweh, Adam, Eve, the Serpent), 30% tropes (the fall, transgression, hidden knowledge). Compare this DNA to the Prometheus myth — they share the same trope profile.

**Why it works:** Writers and artists will use this constantly. It gives a *compositional language* for myths — now you can say "I want to write something with the DNA of Orpheus" and know exactly what symbolic ingredients to reach for.

**UI:** Stacked bar or radar chart on the Narrative detail page. "Compare DNA" button opens a side-by-side against another narrative.

---

## 4. Curated Paths / Guided Explorations

**The idea:** Admin-authored interactive essays that walk a reader through a sequence of nodes and claims. Think: an interactive essay titled "The Hidden King: From Osiris to Luke Skywalker" — you click through 8–10 stops, each one a node or claim, with a short written commentary at each step, and the graph animating to center on the next node.

**Why it works:** This is how writers and artists actually learn — through narrative, not reference lookup. A curated path turns the graph into a *lecture*, a *tour*, a *manifesto*. It's also the most shareable format: "read this path, it'll blow your mind."

**Mechanics:**
- Admin creates a path: ordered list of entity/claim stops + a short text for each stop + optional quote from a source.
- Reader view: full-screen experience, graph panning and focusing on each node as you advance, written text alongside.
- Paths are browsable on a `/paths` page with a cover image, title, estimated read time, and author.
- Paths can be shared, linked, and embedded (see Feature 14).

---

## 5. Cultural Diffusion Map — Geographical View

**The idea:** A world map overlay showing where cultures/traditions are geographically anchored, with lines or heat signatures showing how a specific symbol or trope spread across cultures and time.

**Example:** Select `serpent` as a symbol → the map lights up Greece, Mesopotamia, Egypt, Mesoamerica, India — showing every culture that has a serpent tradition, with the claimed connections between them visualized as arcs.

**Why it works:** Historians and comparativists will love this. It makes the *geographical* and *temporal* dimension of comparative mythology visible, which no text-only reference can do.

**Mechanics:**
- Uses `Culture` entities with optional lat/long bounding box in their metadata.
- Map rendered with Leaflet or Mapbox GL; each culture node is a cluster on the map.
- Selecting a symbol filters the map to only cultures connected to it.
- Timeline scrubber below the map filters by approximate date range.

---

## 6. "Myth of the Day" — Daily Discovery Engine

**The idea:** Every day, a featured entity, claim, or connection appears on the homepage and in a dedicated `/discover` page. Not random — curated by an algorithm that prioritizes high-confidence, surprising, and underexplored nodes (things with high confidence but low recent views).

**Why it works:** Gives casual visitors a reason to come back daily. Creates a natural social sharing moment ("today's myth of the day is wild, thread below"). Rewards deep exploration of the graph rather than just the most famous nodes.

**Mechanics:**
- Algorithm: pick a published claim with confidence ≥ 0.7, involving at least 2 cross-cultural entities, that hasn't been featured in the last 30 days.
- Rendered as a beautiful full-width card: the claim statement, the two or more entities, a brief explanatory excerpt from the supporting source, and a "Explore in graph →" button.
- Admins can manually pin a specific claim to tomorrow's slot.
- RSS feed + shareable card image (og:image) for social sharing.

---

## 7. Personal Research Desk

**The idea:** An authenticated user's private workspace inside Mythograph. Users can bookmark entities and claims, write personal notes tied to specific nodes, create private collections (like Pinterest boards but for mythology), and export their research as a formatted document.

**Why it works:** Writers doing research need to *accumulate and organize* what they find. Right now they'd have to use a separate note-taking tool. Bringing this in-app means Mythograph becomes a research *environment*, not just a reference.

**Mechanics:**
- Bookmarks: star icon on any entity/claim/source; saved to a `bookmarks` table.
- Collections: group bookmarks into named collections ("Underworld Deities," "Fire Thief Tropes").
- Annotations: private sticky note on any entity page, visible only to the author.
- Export: "Export my collection" → generates a formatted Markdown or PDF with entity summaries, claim text, and citations.
- `/desk` route, accessible to any authenticated member.

---

## 8. "What Connects These?" — Explained Path Narrative

**The idea:** An AI-powered feature where a user types in two entity names and gets back a short prose essay explaining how they're connected through the graph — using the actual claims and sources along the shortest path as the basis for the narrative.

**Example input:** "Vulcan and Yahweh"
**Example output:** A 3-paragraph essay: "Vulcan, the Roman god of the forge, connects to Yahweh through the shared symbolic register of *fire as divine creative power*. Claim #87 argues that Vulcan's fire represents the same archetype as the burning bush in Exodus — both are instances of the 'unburnable fire' trope (Claim #103), which also appears in Zoroastrian sacred flame traditions (Claim #201)..."

**Why it works:** This is the research team's core intellectual project made *accessible on demand*. It also surfaces claims and sources users might never have found browsing.

**Mechanics:**
- Path-finding to identify the chain of nodes and claims.
- Pass the chain to Claude with a prompt: "Write a 2–3 paragraph academic essay connecting these entities using only the following claims and their source evidence. Cite each claim inline."
- Rate-limited (same pattern as semantic search in Phase 7).

---

## 9. Archetype Matcher for Writers

**The idea:** A tool aimed squarely at writers. Input: a short description of a character or story element you're working on. Output: the closest matching archetypes, figures, and tropes in the graph — with the full symbolic profile and mythological precedents.

**Example input:** "A trickster who steals power from a higher authority and gives it to ordinary people, but is punished for it."
**Example output:** Prometheus (confidence: very high), Loki (high), Coyote (medium), Anansi (medium) — each with their graph profile, the tropes they instantiate, and which narratives in the graph they appear in.

**Why it works:** Every writer, game designer, and screenwriter does this research manually. This makes it instant and *cited*.

**Mechanics:**
- Submit the description to Claude with the graph's entity/trope list as context.
- Claude returns a ranked list of entity matches with brief reasoning.
- Results page shows the matched entities as clickable cards linking to their full graph entries.
- "Add to my Research Desk" button on each result.

---

## 10. Confidence Timeline — How Theories Have Evolved

**The idea:** For a given entity or claim, show a timeline of when it was first attested in the source corpus, how its confidence score changed as more sources were added, and which sources caused the biggest jumps.

**Why it works:** Historians and serious researchers care deeply about *how knowledge is built*. Showing that a claim had confidence 0.3 in 2019 (one source) and jumped to 0.8 in 2023 (four corroborating sources) tells the *intellectual history* of a theory, not just its current state.

**Mechanics:**
- Requires storing `confidence_score` history with timestamps (an audit log of score changes tied to source additions).
- Rendered as a simple line chart on the entity/claim page under a "Confidence History" collapsible.
- Each inflection point on the line is annotated with the source that caused the change.

---

## 11. Visual Symbol Cards — Downloadable / Shareable

**The idea:** Each entity gets a beautiful exportable card: the entity's name, type, a visual icon or generated illustration, its top 3 connections, confidence score, and the most-cited source. Available as a high-res PNG download and shareable as a social card.

**Why it works:** Artists love this. They'll share these cards on Instagram, Pinterest, Discord. Each shared card is a traffic vector back to Mythograph.

**Mechanics:**
- Generate server-side using a headless browser (Playwright/Puppeteer) or a canvas renderer.
- Card template uses the app's visual design language (dark mode, entity type colors).
- `og:image` for every entity page is the card itself — so links to Mythograph unfurl beautifully on social.
- Download button on every entity page: "Download symbol card."

---

## 12. Trope Family Tree

**The idea:** A dedicated visualization for Trope entities that shows the *tree* of instantiations — which narratives implement this trope, which sub-tropes derive from it, and which figures are the canonical actors in it.

**Example:** "The Stolen Fire" trope → Prometheus (Greek), Loki (Norse), Anansi (West African), Lucifer (Christian), the Maui fire myth (Polynesian) — all rendered as branches of a tree, with a confidence bar on each branch showing how strongly that instantiation is argued.

**Why it works:** Tropes are the *structural grammar* of mythology — the part writers most need to understand. This view makes that grammar legible.

**Mechanics:**
- A dedicated `/trope/:slug` view that switches from the standard entity layout to a tree layout.
- Uses a hierarchical tree renderer (D3 tree layout) rather than force-directed.
- Branches are the narratives/figures that instantiate the trope; leaf nodes show the source count.

---

## 13. Side-by-Side Comparison View

**The idea:** Select any two entities and get a structured side-by-side comparison: shared connections, unique connections, shared tropes, shared cultures, shared source material. Like a Venn diagram made text.

**Example:** Prometheus vs. Lucifer — shared: theft of divine fire, punishment, association with knowledge, trickster archetype. Prometheus unique: forge, Olympus, the eagle. Lucifer unique: rebellion, light, the fall.

**Why it works:** Comparative mythology *is* this operation. Currently you'd have to open two tabs. Making it a first-class feature means the app does the intellectual work.

**Mechanics:**
- `/compare?a=prometheus&b=lucifer` route.
- Pulls the connection sets for both entities and computes intersection/difference.
- Mini-graphs for each entity side by side, with shared connections highlighted in a third color.
- "Create a claim from this comparison" button → opens the contribution form pre-filled with both entities.

---

## 14. Embeddable Graph Widget

**The idea:** A lightweight iframe-embeddable version of the graph — showing a subset centered on one entity and its immediate neighborhood — that anyone can drop into their blog, Substack, or website.

**Example:** A writer's essay about Prometheus: they embed the Mythograph Prometheus node with its 8 closest connections. Readers can click into the graph, pan around, and follow the link to full Mythograph.

**Why it works:** Every embedded widget is a link back to the platform. Writers and bloggers in this space will use this constantly.

**Mechanics:**
- `/embed/entity/:slug` route: a stripped-down, iframe-safe version of the mini-graph.
- No nav, no sidebar — just the graph, entity colors, and a "Explore on Mythograph →" watermark.
- `<iframe>` embed code snippet auto-generated on every entity page.
- Configurable depth (1-hop or 2-hop neighborhood), configurable size.

---

## 15. Reading List Generator

**The idea:** Based on the entities and sources you've explored (or based on a specific entity of interest), Mythograph generates a personalized reading list: books, articles, and podcast episodes from the source library that are most relevant to what you care about.

**Example:** You've been exploring fire symbolism, Prometheus, and the Hebrew tradition → "Here are 6 sources in the Mythograph library that cover these topics, ranked by how many of your interests they address."

**Why it works:** Visitors arrive from a book recommendation or a podcast episode. Pointing them *back into the source corpus* is how Mythograph becomes a research portal, not just a visualization.

**Mechanics:**
- Tracks which entity and claim pages the user has visited (session-only or via their profile if logged in).
- Scores sources by how many of their extracted entities overlap with the user's visited entities.
- Rendered as a "Recommended Sources" section on the `/desk` page and as a dismissible card after a long session.

---

## 16. "Dark Pattern" Detector — Disputed Claims View

**The idea:** A view that surfaces claims with the *highest disagreement signal* — high community flag rate, low confidence despite many sources, or claims that have been manually disputed by the admin team. Makes intellectual honesty visible.

**Why it works:** Serious historians and researchers trust a platform *more* when it shows its uncertainty, not less. Surfacing disputed and contested interpretations is a feature, not a bug — it reflects how comparative mythology actually works.

**Mechanics:**
- Filter in the Claims browser: "Show disputed / contested claims."
- Disputed badge on claim cards and in the graph (distinct color or dashed edge style).
- On the claim page: a "Why this is contested" section populated from admin notes or community flags.
- Makes the `status = 'disputed'` field on claims actually visible in the UI (currently likely hidden).

---

## 17. Source Transcript Highlight Reel

**The idea:** For any entity, generate a "highlight reel" view — the most cited transcript excerpts across all sources, shown in reading order. You can read all the places a symbol or figure has been discussed without navigating source-by-source.

**Why it works:** Researchers want to see *how* a theory was built up across many sources. Currently that requires visiting each source individually. The highlight reel compresses that into one scannable view.

**Mechanics:**
- Pull all `source_anchors` linked to claims about this entity.
- Group by source, sort by timestamp/page within source.
- Render each excerpt as a quoted block with source title, timestamp, and a "Play from here" or "View in source →" link.
- Available on the entity detail page as a "Across the sources" collapsible.

---

## 18. "Mythology Score" — Entity Prominence Leaderboard

**The idea:** A public leaderboard of the most prominent entities in the graph — ranked by confidence-weighted connection count (essentially: how central is this entity to the whole knowledge system?). Updated dynamically as new content is added.

**Tabs:** Most connected symbols / Most attested figures / Most paralleled narratives / Most instantiated tropes.

**Why it works:** Instantly legible to newcomers ("what's the most important symbol in this system?"), fun for enthusiasts, and creates a *living stats page* that changes as the graph grows — giving return visitors something new to see.

**Mechanics:**
- A `/leaderboard` or `/stats` page.
- Computed from existing data: node degree × average edge confidence, grouped by entity type.
- Sparkline showing how the rank has changed in the last 30 days (requires logging score snapshots).
- Each entity on the leaderboard links to its full page.

---

## 19. Graph Snapshot / Time Machine

**The idea:** Admins periodically publish named "snapshots" of the graph state — essentially checkpoints. Users can browse the graph as it existed at a past snapshot and compare it to the current state to see how the knowledge system has evolved.

**Example:** "The graph as of January 2026 vs. now" — you can see which nodes were added, which claims gained confidence, which edges are new.

**Why it works:** Makes the *growth* of the knowledge base visible as a narrative in itself. Perfect for long-term followers of the research group who've been with it for years.

**Mechanics:**
- Admin action: "Save snapshot" → stores entity/relationship counts and a frozen copy of the confidence distribution.
- Diff view: two snapshot selectors; the graph highlights new nodes in green, removed nodes in red, changed edges in amber.
- History page: timeline of snapshots with brief admin-authored notes ("Added 40 new film entities this month").

---

## 20. Public API

**The idea:** A documented, key-gated REST API that lets external developers, researchers, and tool-builders query the Mythograph graph programmatically.

**Example endpoints:**
- `GET /api/entities?type=symbol&min_confidence=0.7`
- `GET /api/entity/:slug/connections`
- `GET /api/path?from=fire&to=serpent`
- `GET /api/claims?entity=prometheus&status=published`

**Why it works:** Once the graph has density, researchers at universities, independent tool builders, and obsessive fans will want to pull the data into their own visualizations, essays, and tools. An API makes Mythograph a *platform*, not just a website. It also opens the door to integrations (Obsidian plugin, Notion database sync, custom D3 visualizations).

**Mechanics:**
- API key issued to authenticated users from their profile page.
- Rate limited (100 requests/hour for free tier).
- OpenAPI spec auto-generated and hosted at `/api/docs`.
- Supabase Edge Function or a thin Next.js API route layer.

---

## Priority Tiers (rough)

| Tier | Features | Why now |
|------|----------|---------|
| **High** (build next, high impact / low effort) | Myth of the Day (6), Curated Paths (4), Side-by-Side Comparison (13), Symbol Cards (11) | Low engineering lift, immediate engagement payoff |
| **Medium** (build after content density exists) | Shortest Path Explorer (1), Archetype Matcher (9), Reading List Generator (15), Highlight Reel (17) | Needs populated graph to be useful |
| **Long-term** (high value, higher build cost) | Cultural Diffusion Map (5), Personal Research Desk (7), Graph Snapshot / Time Machine (19), Public API (20) | Architectural investment; worth it once user base exists |
| **Experimental** (moonshots) | Narrative DNA (3), Confidence Timeline (10), Symbol Combination Engine (2) | Novel and compelling but need to validate UX first |


## User Notes: 

### *The Oracle* OR *Implement REM in Your Project*:

The point is to help artists/ writers *TASTEFULLY* insert REM power into thier work. 

Artist, in a work env (maybe a tab) submits what they have (for instance, a rough plot summary for a movie you want to make) and 

well maybe it can be like a workflow:

00. ( select the effect you seek to have, like AIM, BIM, JEM,  (note, if user presses JEM), maybe it just opens a pop up FUCK OFF J)

1. Ask for a list of symbols , narratives, characters, etc. that relate or could be made to relate with what my story has currently 

---> Returns a list of possible symbols, myth narratives, myth characters/gods (i.e maybe make the villians twin snakes because ..... OR the rival seems to have characteristics similar to Jacob from the bible, as he is .... This plot seems to mirror the Bacchae)

2. From long list User selects some, that he finds interesting / moralizing (I find using the story of Jacob esau here)


3.  then asks: Ask how can I infusion REM here (Name the rival Jacobi, negrifiy-arabify him for a more potent JED effect)

4. further tweaks.. ("eh too on the nose, let's try to be more subtle with our moralization messaging)


first asks hey give me some symbols that make sense to do this  