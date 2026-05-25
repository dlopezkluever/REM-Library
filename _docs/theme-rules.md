# Theme Rules — Mythograph

All visual tokens extracted directly from the HTML mockups. These values should be defined once in `tailwind.config.ts` and referenced as utility classes everywhere — never hardcoded in component files.

---

## Color Palette

### Named swatches (from the style guide mockup)

| Name         | Hex       | Role                                                                                |
| ------------ | --------- | ----------------------------------------------------------------------------------- |
| Stone        | `#F5F0E8` | Light surface background (content pages, light mode)                                |
| Charcoal     | `#0F0D0B` | Dark surface background (general dark UI)                                           |
| Graph Canvas | `#0C0A08` | Graph canvas background (slightly deeper than Charcoal)                             |
| Ink          | `#1C1917` | Primary text on light surfaces                                                      |
| Verdigris    | `#4A7C6F` | Symbol entity color, primary accent, links, Tier 1 indicator, citation superscripts |
| Terracotta   | `#A0522D` | Figure entity color, breadcrumb active link, error/validation                       |
| Iris         | `#6B5FA0` | Trope entity color                                                                  |
| Warm Tan     | `#8B7355` | Narrative entity color                                                              |
| Muted Violet | `#8A5A9A` | Culture entity color                                                                |

### Entity color system (full token set)

```
-- Symbol (Verdigris)
symbol-node:       #4A7C6F
symbol-glow:       rgba(74,124,111,0.12)
symbol-badge-bg:   #E8F0EE
symbol-badge-text: #1C4A3F
symbol-badge-border: #4A7C6F

-- Figure (Terracotta)
figure-node:       #A0522D
figure-glow:       rgba(160,82,45,0.12)
figure-badge-bg:   #F5EDE8
figure-badge-text: #5C2E12
figure-badge-border: #A0522D

-- Trope (Iris)
trope-node:        #6B5FA0
trope-glow:        rgba(107,95,160,0.12)
trope-badge-bg:    #EEEAF5
trope-badge-text:  #2A2240
trope-badge-border: #6B5FA0

-- Narrative (Warm Tan)
narrative-node:    #8B7355
narrative-glow:    rgba(139,115,85,0.12)
narrative-badge-bg:  #F0EDE8
narrative-badge-text: #3A2E22
narrative-badge-border: #8B7355

-- Culture (Muted Violet)
culture-node:      #8A5A9A
culture-glow:      rgba(138,90,154,0.12)
culture-badge-bg:  #EDE8F2
culture-badge-text: #2E1A3A
culture-badge-border: #8A5A9A
```

### Semantic states

| State              | Color                         | Use                                                  |
| ------------------ | ----------------------------- | ---------------------------------------------------- |
| Success / Tier 1   | `#4A7C6F` (Verdigris)         | Published status, Tier 1 badge, confirmed extraction |
| Warning            | `#C9A84C`                     | Pipeline stage warnings, partially processed sources |
| Error / Validation | `#A0522D` (Terracotta)        | Form errors, disputed claims, failed pipeline stages |
| Info               | `rgba(107,95,160,0.9)` (Iris) | Informational messages, draft state indicators       |
| Neutral            | `#888`                        | Secondary text, disabled states, empty state labels  |

### Confidence score color mapping

| Range    | Color treatment     | Node opacity |
| -------- | ------------------- | ------------ |
| 0.8–1.0  | Full entity color   | 85–90%       |
| 0.5–0.79 | Full entity color   | 72–82%       |
| 0.2–0.49 | Entity color at 65% | 60–65%       |
| 0.0–0.19 | Entity color at 50% | 50–55%       |

---

## Typography

### Font families

```css
--font-display: 'Cinzel', Georgia, serif; /* titles, labels, wordmark, graph nodes */
--font-body: 'Lora', Georgia, serif; /* all prose, captions, navigation, metadata */
```

Load via Google Fonts or fontsource packages:

- `@fontsource/cinzel` — weights 400, 700
- `@fontsource/lora` — weights 400, 400 italic, 600

### Type scale

```
/* Display — Cinzel */
--text-display-xl:  28px   /* h1 entity names */
--text-display-lg:  20px   /* h2 section titles */
--text-display-md:  14px   /* wordmark, prominent labels */
--text-display-sm:  9px    /* section cap labels */
--text-display-xs:  7.5px  /* micro labels, graph node labels at small radius */

/* Body — Lora */
--text-body-lg:   15px   /* lead paragraph, claim statement */
--text-body-md:   13px   /* standard body paragraph */
--text-body-sm:   11–12px /* nav links, subtitles, metadata */
--text-body-xs:   10–10.5px /* captions, footnotes, source citations */
```

### Line heights

```
--leading-display:  1.1    /* Cinzel headings */
--leading-label:    1.0    /* Cinzel uppercase labels */
--leading-body:     1.78   /* Lora body paragraphs (generous for readability) */
--leading-meta:     1.65   /* Lora captions and metadata */
```

### Letter spacing

```
--tracking-wordmark:  0.22–0.24em  /* MYTHOGRAPH wordmark */
--tracking-label-lg:  0.16–0.22em  /* section header labels */
--tracking-label-sm:  0.09–0.14em  /* entity badges, node labels */
--tracking-body:      normal        /* Lora prose — no tracking */
```

---

## Spacing Scale

Built on a 4px base unit, matching standard Tailwind scale. No custom spacing values needed beyond the defaults.

```
4px  → spacing-1  (gap between icon + text, tight inline elements)
8px  → spacing-2  (between chips, featured cards gap)
12px → spacing-3  (section padding top, compact list item gap)
16px → spacing-4  (card padding, section gap)
20px → spacing-5  (content area horizontal padding)
24px → spacing-6  (section gap, component separation)
32px → spacing-8  (major section separation)
48px → spacing-12 (between major content blocks)
```

---

## Border System

Mythograph uses exclusively `0.5px` borders throughout — this is a defining visual characteristic of the mockup.

```
/* Dark surface borders */
--border-dark-strong:  0.5px solid rgba(255,255,255,0.2)
--border-dark-mid:     0.5px solid rgba(255,255,255,0.07–0.10)
--border-dark-subtle:  0.5px solid rgba(255,255,255,0.05–0.06)

/* Light surface borders */
--border-light-strong: 0.5px solid rgba(0,0,0,0.18)
--border-light-mid:    0.5px solid rgba(0,0,0,0.09–0.11)
--border-light-subtle: 0.5px solid rgba(0,0,0,0.06–0.08)

/* Entity-specific borders (for chips and featured cards) */
--border-entity: 0.5px solid [entity-color] at 26% opacity
```

Because `0.5px` is not a standard Tailwind value, add it to `tailwind.config.ts`:

```js
borderWidth: {
  DEFAULT: '1px',
  '0': '0',
  '0.5': '0.5px',
  '2': '2px',
}
```

---

## Border Radius

```
--radius-sm:  3px    /* entity badges, micro elements */
--radius-md:  4px    /* chips, cards, search bar, featured connection cards */
--radius-lg:  8px    /* panels, canvas container, content cards */
--radius-xl:  12px   /* large cards, style guide examples */
--radius-full: 9999px /* pill buttons, circular graph nodes are drawn by canvas */
```

---

## Shadow System

Mythograph intentionally uses no drop shadows. Depth is communicated entirely through:

- `0.5px` borders
- Background opacity differences
- Node glow (canvas-rendered, not CSS box-shadow)

The only exception: the floating search bar on the homepage may use a very subtle `box-shadow: 0 2px 12px rgba(0,0,0,0.4)` on the dark canvas to separate it from the animated background.

---

## Motion & Animation

### Principles

- Motion is functional, not decorative. It communicates state change.
- Durations are short — this is a research tool, not an entertainment product.
- Easing: `ease-out` for elements entering the viewport; `ease-in` for elements leaving.

### Token values

```
--duration-instant:  100ms   /* button press scale feedback */
--duration-fast:     150ms   /* page fade-in, opacity transitions */
--duration-normal:   200ms   /* side panel slide, node hover fade, filter toggles */
--duration-slow:     300ms   /* none currently — reserved */

--ease-out:  cubic-bezier(0.16, 1, 0.3, 1)   /* snappy deceleration */
--ease-in:   cubic-bezier(0.7, 0, 0.84, 0)   /* clean acceleration out */
```

### Graph-specific motion

- Node float animation on homepage: `sin(t * 0.8 + i * 1.4) * 0.012 * width` per axis — very subtle position drift
- Force-directed layout settling: handled by Sigma.js / ForceAtlas2 internally; no additional CSS needed
- Node fade-in on graph load: `opacity 0→1` over `200ms` staggered by `10ms * nodeIndex` (capped at 500ms total)

---

## Tailwind Configuration Summary

`tailwind.config.ts` additions to the default theme:

```ts
theme: {
  extend: {
    colors: {
      stone: '#F5F0E8',
      charcoal: '#0F0D0B',
      canvas: '#0C0A08',
      ink: '#1C1917',
      verdigris: { DEFAULT: '#4A7C6F', light: '#E8F0EE', dark: '#1C4A3F' },
      terracotta: { DEFAULT: '#A0522D', light: '#F5EDE8', dark: '#5C2E12' },
      iris: { DEFAULT: '#6B5FA0', light: '#EEEAF5', dark: '#2A2240' },
      tan: { DEFAULT: '#8B7355', light: '#F0EDE8', dark: '#3A2E22' },
      violet: { DEFAULT: '#8A5A9A', light: '#EDE8F2', dark: '#2E1A3A' },
    },
    fontFamily: {
      display: ['Cinzel', 'Georgia', 'serif'],
      body: ['Lora', 'Georgia', 'serif'],
    },
    borderWidth: {
      '0.5': '0.5px',
    },
    letterSpacing: {
      wordmark: '0.22em',
      label: '0.16em',
      badge: '0.13em',
    },
    lineHeight: {
      reading: '1.78',
      meta: '1.65',
    },
  },
}
```

---

## Light Mode vs. Dark Mode

Two surface contexts, not a user-toggled dark/light mode:

| Token              | Dark (graph view)        | Light (content pages) |
| ------------------ | ------------------------ | --------------------- |
| `--bg-surface`     | `#0F0D0B` / `#0C0A08`    | `#F5F0E8`             |
| `--text-primary`   | `rgba(255,255,255,0.82)` | `#1C1917`             |
| `--text-secondary` | `rgba(255,255,255,0.38)` | `#888`                |
| `--border-mid`     | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.09)`    |
| `--nav-bg`         | `#0F0D0B`                | `#F5F0E8`             |
| `--card-bg`        | `rgba(245,240,232,0.07)` | `#FFFFFF`             |

Apply via Tailwind's `dark:` variant scoped to the AppShell (`<div class="dark">`), and the standard (light) variant to the ContentShell. This means both modes can coexist on the same page load without requiring OS/browser dark mode preference.
