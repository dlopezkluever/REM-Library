# UI Rules — Mythograph

All rules are grounded in the three HTML mockups (homepage, entity detail, style guide) provided with the project. The mockups establish a clear design language: scholarly, minimal, dual-mode (dark graph / light content), with a museum-exhibit aesthetic driven by two fonts (Cinzel + Lora) and a small, earthy color palette.

---

## Design Principles

1. **Graph-first.** The graph canvas is the hero. The homepage opens directly into it. Every other view is a deeper dive from that canvas.

2. **Dual-mode surfaces.** Two distinct surface modes coexist in the same app:
   - **Dark mode** (Charcoal/Ink background): the graph view, graph-embedded UI elements, and the homepage. Nodes and edges glow against dark space.
   - **Light mode** (Stone background): encyclopedia pages, entity detail, claim detail, source library, all content-reading experiences.
     The user does not manually toggle between these — the surface changes automatically based on the current view. A manual light/dark override toggle may be offered as a secondary control.

3. **Scholarly but approachable.** The aesthetic reads like a well-designed academic reference — serious, clean, typographically intentional — without feeling sterile. Think: the visual quality of a museum label or a beautifully typeset monograph, not a corporate SaaS dashboard.

4. **Source-grounded always.** Citations, source counts, and confidence indicators must be visible at every level without being overwhelming. Superscript footnotes in body text, attestation bars on entity headers, tier badges on sources — these are not decorations, they are the epistemological foundation of the product.

5. **Two fonts, used strictly.** Cinzel is a display typeface for titles, wordmarks, labels, and entity names only — always in uppercase or small-caps treatment. Lora is the reading typeface for all prose, captions, metadata, and navigation. They must never swap roles.

---

## Layout Structure

### AppShell (Dark — graph views)

```
┌─────────────────────────────────────────┐
│  Nav bar (40px, 0.5px bottom border)    │
├─────────────────────────────────────────┤
│                                         │
│   Full-screen Sigma.js canvas           │
│                                         │
│   [Filter panel — collapsible, left]    │
│                                         │
│   [Side panel — slides in from right]   │
│                                         │
├─────────────────────────────────────────┤
│  Featured Connections strip (88px)      │
└─────────────────────────────────────────┘
```

### ContentShell (Light — encyclopedia, entity, claim, source pages)

```
┌─────────────────────────────────────────┐
│  Nav bar (40px, 0.5px bottom border)    │
├─────────────────────────────────────────┤
│  Breadcrumb (32px, 0.5px bottom border) │
├───────────────────────────┬─────────────┤
│                           │             │
│   Main content area       │  Sidebar    │
│   (flex:1, max 720px)     │  (174px)    │
│                           │             │
└───────────────────────────┴─────────────┘
```

### AdminShell

```
┌─────────────────────────────────────────┐
│  Nav bar (40px)                         │
├───────────┬─────────────────────────────┤
│           │                             │
│  Sidebar  │   Main content area         │
│  nav      │   (tables, forms, queues)   │
│  (200px)  │                             │
│           │                             │
└───────────┴─────────────────────────────┘
```

---

## Navigation Bar

- Height: 40px
- Background: matches the current shell (Charcoal `#0F0D0B` for dark, Stone `#F5F0E8` for light)
- Bottom border: `0.5px solid rgba(255,255,255,0.07)` (dark) or `0.5px solid rgba(0,0,0,0.09)` (light)
- Left: MYTHOGRAPH wordmark in Cinzel, `font-size: 13–14px`, `letter-spacing: 0.22em`
- Right: navigation links in Lora `11–12px`, `color: rgba(255,255,255,0.38)` (dark) or `#888` (light)
- Active nav link: full opacity, no underline — distinguish by opacity contrast only
- Search button: bordered pill (`border: 0.5px solid rgba(255,255,255,0.2)` dark, `rgba(0,0,0,0.18)` light) with search icon + "Search" text
- No hamburger menu. Nav links are always visible at desktop width. Mobile nav collapses to an icon at <768px.

---

## Graph Canvas

- Background: `#0C0A08` (slightly deeper than Charcoal — absorbs the node glows better)
- Nodes: filled circles, color = entity type (see Theme Rules), radius = confidence score mapped to 5–28px
- Node glow: radial soft fill at `node.radius + 5px` at 10–14% opacity of node color
- Node labels: Cinzel, white at `rgba(255,255,255,0.82)`, font size scales with node radius (`max(5.5px, radius * 0.42)`)
- Label visibility: nodes with radius < 9px do not show labels at default zoom; labels appear on zoom in or hover
- Edges: `stroke: rgba(255,255,255,0.05–0.07)`, `stroke-width: 0.5–1px` (scales with edge weight)
- Edge style by type: solid for `APPEARS_IN`, dashed for `PARALLELS`, dotted for speculative connections (confidence < 0.2)
- Hover state: hovered node + direct neighbors at full opacity; all other nodes/edges fade to ~15% opacity
- Selected node: same as hover + side panel opens
- Side panel: slides in from the right edge, 320px wide, Stone background, Lora body text

---

## Entity Type Coloring (Nodes + Badges)

| Type      | Node fill                | Badge bg  | Badge text | Badge border |
| --------- | ------------------------ | --------- | ---------- | ------------ |
| Symbol    | `#4A7C6F` (Verdigris)    | `#E8F0EE` | `#1C4A3F`  | `#4A7C6F`    |
| Figure    | `#A0522D` (Terracotta)   | `#F5EDE8` | `#5C2E12`  | `#A0522D`    |
| Trope     | `#6B5FA0` (Iris)         | `#EEEAF5` | `#2A2240`  | `#6B5FA0`    |
| Narrative | `#8B7355` (Warm tan)     | `#F0EDE8` | `#3A2E22`  | `#8B7355`    |
| Culture   | `#8A5A9A` (Muted violet) | `#EDE8F2` | `#2E1A3A`  | `#8A5A9A`    |

Entity badges:

- Font: Cinzel, 8–9px, `letter-spacing: 0.13–0.14em`
- Padding: `4–5px 10–11px`
- Border radius: `3px`
- Border: `0.5px solid [entity-color]`

---

## Typography Rules

### Cinzel — display only

- Use for: page/section titles, the MYTHOGRAPH wordmark, entity name headings, section label caps (e.g., "SOURCES", "ATTESTATION", "FEATURED CONNECTIONS"), entity badge text, graph node labels
- Always rendered in uppercase or small-caps
- Never use for body text, descriptions, metadata, or navigation prose
- Line height: 1.1–1.2 for display sizes; 1.0 for uppercase labels
- Letter spacing: `0.14–0.30em` depending on size (larger tracking for smaller sizes)

### Lora — reading everywhere else

- Use for: all body prose, entity descriptions, claim statements, transcript text, nav links, captions, metadata, source citations, UI labels that are not section headers
- Italic variant for subtitles, aliases, and source excerpt quotes
- Line height: 1.78–1.82 for body paragraphs (generous — this is a reading tool)
- Never use Cinzel for reading-length text

---

## Typography Scale

| Role                          | Font        | Size          | Weight | Line height | Letter spacing |
| ----------------------------- | ----------- | ------------- | ------ | ----------- | -------------- |
| Page title (h1)               | Cinzel      | 28px          | 400    | 1.1         | default        |
| Section title (h2)            | Cinzel      | 16px          | 400    | 1.2         | 0.05em         |
| Section label (uppercase cap) | Cinzel      | 7.5–9px       | 400    | 1.0         | 0.16–0.22em    |
| Wordmark                      | Cinzel      | 13–14px       | 400    | 1.0         | 0.22–0.24em    |
| Body paragraph                | Lora        | 13–15px       | 400    | 1.78        | —              |
| Subtitle / alias              | Lora italic | 11–12px       | 400    | 1.4         | —              |
| Caption / metadata            | Lora        | 10–11px       | 400    | 1.65        | —              |
| Nav link                      | Lora        | 11–12px       | 400    | —           | —              |
| Graph node label (large node) | Cinzel      | ~6.5px scaled | 400    | —           | 0.07em         |

---

## Component Behavior Patterns

### Connection chips (entity detail page)

- Each connected entity rendered as a bordered chip: `[colored dot] [entity name] [relationship label]`
- Relationship label: Cinzel, `6.5px`, `letter-spacing: 0.1em`, `color: #999`
- Background: white (light mode)
- Border: `0.5px solid rgba(0,0,0,0.11)`
- Border radius: `4px`
- Padding: `4px 9px`
- Clicking the chip navigates to that entity's detail page

### Attestation bar

- Horizontal sequence of `5` fixed-width segments
- Filled segments: Verdigris `#4A7C6F`
- Empty segments: `rgba(0,0,0,0.1)`
- Segment size: `18px × 3px`, `border-radius: 2px`, `gap: 3px`
- Accompanied by a "N of 5 · M sources" label in Lora 10.5px

### Confidence score badge

- Rounded badge or text label showing the 0.0–1.0 score
- Color: maps to confidence range (see Theme Rules)
- Shown inline beside entity name in list contexts

### Source citation (inline, body text)

- Superscript numbers in Verdigris `#4A7C6F`, `font-size: 9.5px`
- Sources section below body text: `SOURCES` label in Cinzel small-caps, then numbered footnotes in Lora 10.5px italic
- Source tier indicator inline: "Tier 1" in Verdigris; "Tier 2" in muted grey

### Featured Connections cards (homepage)

- Three equal-width cards in a row
- Background: 10% opacity of the entity color
- Border: `0.5px solid [entity-color] at 26% opacity`
- Header: Cinzel, `7px`, `letter-spacing: 0.09em`, full entity-color
- Description: Lora, `10px`, `rgba(255,255,255,0.38)`
- Border radius: `4px`, padding: `7px 10px`

---

## Spacing & Density

- Base unit: `4px`
- Comfortable content density — not cramped, not airy. This is a research tool, not a marketing site.
- Section gaps: `16–24px`
- Card padding: `16–20px`
- Nav padding: `0 22px` horizontal
- Inline element gaps: `5–8px`
- Border widths: always `0.5px` for dividers and container borders (this is a defining characteristic of the mockup aesthetic — thinner than standard 1px)
- Avoid heavy drop shadows entirely; use `0.5px` borders for depth instead

---

## Responsive Strategy

> Assumed: The PRD does not specify mobile requirements. Mythograph is a desktop-first research tool — the graph visualization requires a large screen to be useful. Mobile/tablet is a progressive enhancement.

- Desktop (≥1024px): full layout as designed
- Tablet (768–1023px): sidebar collapses to overlay; filter panel becomes a bottom sheet; mini-graph sidebar hidden
- Mobile (<768px): graph view accessible but limited interaction; encyclopedia and detail pages fully functional; admin panel accessible but not optimized

---

## Accessibility Baseline

- Color is never the sole differentiator — entity type badges always include the text label
- Graph nodes are keyboard-navigable: `Tab` cycles through visible nodes, `Enter` selects, `Escape` deselects
- All images and SVG graphs have `alt` text or `<title>` + `<desc>` elements
- The encyclopedia provides text-based access to all information that is also in the graph — this is the required accessible alternative to the visual canvas
- Focus indicators: visible outline on all interactive elements (customized to look intentional, not browser-default)
- WCAG 2.1 AA contrast ratios on all content pages (light mode); dark mode graph is aspirational but not required to meet AA on every node label

---

## Loading / Empty / Error States

### Loading

- Content pages: skeleton cards/blocks matching the live layout — same proportions, Stone or Charcoal background, animated shimmer
- Graph canvas: shows immediately with whatever nodes are cached; new nodes fade in as data loads
- Never show a full-screen spinner for the graph; show partial data progressively

### Empty

- Empty encyclopedia: "No [entity type] have been published yet." — Cinzel label + Lora explanation sentence
- Empty graph: ghost graph illustration (low-opacity node circles) + "The knowledge graph is being built."
- Empty search results: "No results for '[query]'." with a suggestion to try broader terms

### Error

- Data fetch error: inline error state with Lora message + retry button — no full-page error routes for partial failures
- 404: dedicated full-page layout matching the content shell, message in Lora body text, link back to graph
- Form validation errors: inline below the relevant field in Lora 11px, Terracotta color `#A0522D`

---

## Interaction Feedback

- Button hover: slight background opacity shift (no color change, no movement)
- Button active/press: scale down `0.98` for 100ms
- Nav link hover: opacity increases to 100%
- Node hover: opacity transition `200ms ease`
- Side panel: slides in/out with `transform: translateX()`, `transition: 200ms ease-out`
- Page transitions: fade-in `opacity 0→1`, `150ms ease` — no slide transitions between routes (they feel disorienting on a research tool)
- Filter toggles: instant graph update with a `200ms` opacity fade on dimmed nodes
