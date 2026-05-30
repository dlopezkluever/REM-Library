# Phase 3 Audit — Encyclopedia & Content Views

**Date:** 2026-05-30
**Branch:** `graph-viz`
**Audited against:** `_docs/phases/phase-3-encyclopedia-views.md`

---

## Summary

| Feature | Completion | Severity |
|---------|-----------|----------|
| 1. Encyclopedia Browse | 95% | Medium |
| 2. Entity Detail | 90% | Low |
| 3. Claim Detail | 85% | Low |
| 4. Source Library | 100% | — |
| 5. Source Detail + Transcript | 90% | **High** |

---

## Critical Bug

### Video sources cannot play
**File:** `src/pages/sources/SourceDetailPage.tsx:136`

The media element is hardcoded as `<audio>` regardless of source format. Video files will load but won't render a video player.

**Fix:**
```tsx
const MediaTag = source.format === 'video' ? 'video' : 'audio'
<MediaTag ref={audioRef} controls src={hostedMediaUrl} className="w-full" />
```

---

## Missing from Spec

### 1. Shadcn `<Tabs>` not used in Encyclopedia Browse
**File:** `src/pages/encyclopedia/EncyclopediaBrowsePage.tsx:50-64`

The spec explicitly requires Shadcn `Tabs` for the entity-type filter. The current implementation uses plain `<button>` elements — no ARIA roles, no keyboard navigation (arrow keys), no `aria-selected` or `aria-controls` attributes.

**Fix:** Install and use the Shadcn Tabs component:
```bash
npx shadcn-ui@latest add tabs
```
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    {tabs.map(tab => (
      <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
    ))}
  </TabsList>
</Tabs>
```

---

### 2. Author field is a placeholder
**Files:** `src/pages/entity/EntityDetailPage.tsx:169`, `src/pages/claim/ClaimDetailPage.tsx:102`

Both pages display `"Attributed researcher"` as hardcoded text. The spec requires the actual claim author's name from the database.

**Fix:** Verify the correct field name on the claims table (likely `author` or a joined researcher name) and replace the placeholder:
```tsx
{claim.author ?? 'Unknown'}
```

---

### 3. ConfidenceBreakdown uses hardcoded factors
**File:** `src/components/claim/ConfidenceBreakdown.tsx:16-37`

The spec states contributing factors should be "pulled from the claim's stored metadata." The four factors (source tier weight, source count, explicitness, corroboration) and their weights are hardcoded constants rather than read from `claim.metadata`.

**Fix:** Source factors from the claim's metadata field when available:
```tsx
const rows = claim.metadata?.factors ?? defaultFactors
```

---

## Minor Issues

### 4. EntityChip relationship label font size is off
**File:** `src/components/entity/EntityChip.tsx:31`

Current: `text-[7px]` — Spec says: `6.5px`

**Fix:** Change to `text-[6.5px]`.

---

### 5. `audioRef` naming is misleading
**File:** `src/pages/sources/SourceDetailPage.tsx:18`

The ref is named `audioRef` but is also used to control video playback. Rename to `mediaRef` for clarity (pairs with the video fix above).

---

### 6. Confidence factor contributions don't sum to 1.0
**File:** `src/components/claim/ConfidenceBreakdown.tsx:18-36`

The hardcoded weights (0.3 + 0.25 + 0.2 + 0.15) sum to 0.9, not 1.0. Either the weights are incomplete or the math is off.

---

## What's Solid

- **Feature 4 (Source Library)** is fully spec-compliant — Shadcn Table, all three filter controls (format multi-select, tier toggle, pipeline stage), all three sort modes, loading skeleton, and both empty states are all correct.
- **Feature 5 (Transcript Viewer)** — Entity highlighting with longest-match regex, timestamp seek via `onSeek` callback, hash fragment deep-linking (`#t-{seconds}`), signed Supabase Storage URL with 1-hour expiry, and the Extracted Content sidebar are all correctly implemented.
- **Feature 2 (Entity Detail)** — MiniGraph renders at exactly 174px with 1-hop Sigma canvas and clickable node navigation. EntityChip styling, AttestationBar, claims panel, and sources panel are all correct.
- **Feature 3 (Claim Detail)** — "Play from [timestamp]" link (gated on audio/video format), source evidence list, entity chips via `claim_entities`, status badge (Draft/Published/Disputed), and the sticky ConfidenceBreakdown sidebar are all implemented correctly.

---

## Prioritized Fix List

1. **Fix video element** — real content breaks without this
2. **Add Shadcn Tabs** to EncyclopediaBrowsePage — spec requirement + accessibility
3. **Wire real author field** — replace "Attributed researcher" placeholder
4. **Read confidence factors from `claim.metadata`** — remove hardcoded weights
5. **Fix EntityChip label size** — `text-[7px]` → `text-[6.5px]`
6. **Rename `audioRef` → `mediaRef`** — pairs with video fix
7. **Fix confidence weights** — ensure factors sum to 1.0
