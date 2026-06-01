# Phase 3 Audit - Encyclopedia & Content Views

**Date:** 2026-05-30
**Branch:** `graph-viz`
**Audited against:** `_docs/phases/phase-3-encyclopedia-views.md`

---

## Summary

| Feature                       | Completion | Severity |
| ----------------------------- | ---------: | -------- |
| 1. Encyclopedia Browse        |        95% | Medium   |
| 2. Entity Detail              |        90% | Low      |
| 3. Claim Detail               |        85% | Low      |
| 4. Source Library             |        90% | Medium   |
| 5. Source Detail + Transcript |        90% | High     |

**Audit correction:** The implementation is broadly functional, but the original audit overstated Source Library compliance and understated several schema/data-contract gaps. The highest-priority issues are video playback, real author display, Shadcn component compliance, and missing schema support for stored source descriptions and confidence metadata.

---

## Critical Bug

### Video sources cannot play

**File:** `src/pages/sources/SourceDetailPage.tsx`

The media element is hardcoded as `<audio>` regardless of source format. Video files may load, but they will not render a visible video player.

**Fix:**

```tsx
const MediaTag = source.format === 'video' ? 'video' : 'audio'

<MediaTag ref={mediaRef} controls src={hostedMediaUrl} className="w-full" />
```

Also rename `audioRef` to `mediaRef` and type it as `HTMLMediaElement | null`.

---

## Missing From Spec

### 1. Shadcn `<Tabs>` not used in Encyclopedia Browse

**File:** `src/pages/encyclopedia/EncyclopediaBrowsePage.tsx`

The spec explicitly requires Shadcn `Tabs` for the entity-type filter. The current implementation uses plain `<button>` elements, so it does not get the expected Radix tab semantics, keyboard behavior, or component consistency.

**Fix:** Add and use the Shadcn Tabs component:

```bash
npx shadcn-ui@latest add tabs
```

```tsx
<Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EntityType | 'all')}>
  <TabsList>
    {tabs.map((tab) => (
      <TabsTrigger key={tab.value} value={tab.value}>
        {tab.label}
      </TabsTrigger>
    ))}
  </TabsList>
</Tabs>
```

---

### 2. Source Library does not use Shadcn `<Table>`

**File:** `src/pages/sources/SourceLibraryPage.tsx`

The source library uses a plain HTML `<table>`. The Phase 3 spec explicitly requires Shadcn `Table`. This mirrors the Tabs issue: the page is functional, but not fully spec-compliant and does not inherit the project's table primitive styling/accessibility conventions.

**Fix:** Add/use the Shadcn Table component and replace raw table elements with `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, and `TableCell`.

---

### 3. Author field is a placeholder

**Files:** `src/pages/entity/EntityDetailPage.tsx`, `src/pages/claim/ClaimDetailPage.tsx`

Both pages display `"Attributed researcher"` as hardcoded text. The spec requires the actual claim author's name from the database.

**Correction:** The current schema does not have a `claim.author` text field. Claims store `author_id`, which references `profiles.id`. A proper fix needs a typed profile join/API helper and a public-safe way to expose author display names.

**Fix:** Add an API helper that fetches claims with author profile display data, or add a public author display view/denormalized claim author field if profile RLS should remain private.

```tsx
{
  claim.author?.display_name ?? 'Unknown researcher'
}
```

---

### 4. ConfidenceBreakdown uses inferred factors

**File:** `src/components/claim/ConfidenceBreakdown.tsx`

The spec states contributing factors should be pulled from the claim's stored metadata. The current implementation derives factors from available evidence and hardcoded weights.

**Correction:** The current `claims` table has no `metadata` column, so `claim.metadata` is not available. The issue is real, but the fix requires either a schema migration or a product decision to label the current UI as evidence-derived rather than stored scoring metadata.

**Fix option A:** Add a confidence metadata column/table and source rows from stored values.

```tsx
const rows = claim.metadata?.factors ?? defaultFactors
```

**Fix option B:** Rename the component copy to clarify it is an evidence-derived estimate until stored confidence metadata exists.

---

### 5. Source description is a placeholder

**File:** `src/pages/sources/SourceDetailPage.tsx`

The source detail page renders placeholder copy: `"Source metadata is available; no long-form description has been added yet."` The Phase 3 spec requires a source description, but the current `sources` table has no `description` column.

**Fix:** Add a migration for `sources.description text`, regenerate Supabase types, seed at least sample description data, and render `source.description` with an empty-state fallback.

---

### 6. Extracted Content sidebar is approximated

**File:** `src/lib/api/sources.ts`

The spec says extracted content should be joined from `chunks -> extractions -> confirmed entities/claims`. The current implementation derives extracted entities/claims from published claim evidence linked to source anchors. This is safer for the current public RLS model, but it is not the exact data path requested by the spec.

**Fix:** Decide whether confirmed extractions should be publicly readable, normalized into public join tables, or copied into published entity/claim/source-anchor relationships during curation. Then update `getSourceExtractedContent()` to use that canonical public path.

---

### 7. Claim detail visibility needs a product decision

**File:** `src/lib/api/claims.ts`

`getClaimById()` no longer filters to `status = 'published'`. Anonymous users are still protected by RLS, but authenticated internal users may see draft/disputed claims through the public route. This may be intentional because the page renders Draft / Published / Disputed status badges, but it should be explicit.

**Fix:** Either restore `.eq('status', 'published')` for public detail pages, or split into `getPublishedClaimById()` and `getClaimByIdForInternal()` helpers.

---

## Minor Issues

### 8. EntityChip relationship label font size is off

**File:** `src/components/entity/EntityChip.tsx`

Current: `text-[7px]`. Spec says `6.5px`.

**Fix:** Change to `text-[6.5px]`.

---

### 9. Confidence factor contributions do not sum to 1.0

**File:** `src/components/claim/ConfidenceBreakdown.tsx`

The hardcoded weights currently sum to 0.9, not 1.0. This is not necessarily a bug unless the UI claims these are normalized total weights. The more important issue is that these values are inferred rather than stored confidence metadata.

---

## What's Solid

- **Feature 1 (Encyclopedia Browse)** is functionally complete: published entity fetching, client-side type filtering, alphabetical sorting, loading skeletons, empty states, and card navigation all work.
- **Feature 2 (Entity Detail)** is largely complete: MiniGraph renders at the expected sidebar size with 1-hop Sigma data and clickable node navigation. Entity chips, attestation, claims, and source evidence are implemented.
- **Feature 3 (Claim Detail)** includes status/confidence badges, source evidence, entity chips via `claim_entities`, and "Play from timestamp" links for audio/video sources.
- **Feature 4 (Source Library)** is functionally strong: all three filter controls, all three sort modes, loading skeleton, claim counts, and empty states are implemented. It is not fully spec-compliant until it uses Shadcn Table.
- **Feature 5 (Transcript Viewer)** includes entity highlighting with longest-match regex, timestamp seek via callback, hash fragment deep-linking (`#t-{seconds}`), signed Supabase Storage URL support, and an Extracted Content sidebar.

---

## Prioritized Fix List

1. **Fix video element** - real content breaks without this.
2. **Wire real author display** - replace `"Attributed researcher"` with profile-backed author data or a public author display field.
3. **Add Shadcn Tabs** to `EncyclopediaBrowsePage` - spec requirement and accessibility.
4. **Add Shadcn Table** to `SourceLibraryPage` - spec requirement and consistency.
5. **Add source descriptions** - schema migration, type regeneration, seed data, and UI rendering.
6. **Resolve confidence metadata gap** - add stored metadata or relabel current breakdown as evidence-derived.
7. **Resolve extracted-content source of truth** - public confirmed extraction path vs evidence-derived approximation.
8. **Decide public/internal claim detail behavior** - published-only helper or internal-aware helper split.
9. **Fix EntityChip label size** - `text-[7px]` to `text-[6.5px]`.

---

## Actionable TODO

### P0 - Content-Breaking Fixes

- [ ] In `SourceDetailPage.tsx`, replace hardcoded `<audio>` with conditional `<audio>` / `<video>` rendering.
- [ ] Rename `audioRef` to `mediaRef` and type it as `HTMLMediaElement | null`.
- [ ] Confirm hosted video sources render visible playback controls and timestamp seeking still works.

### P1 - Data Correctness

- [ ] Add a typed API helper for claim author display data.
- [ ] Decide whether profile display names are public via RLS, exposed through a SQL view, or denormalized onto claims.
- [ ] Replace all `"Attributed researcher"` placeholders with real author display text.
- [ ] Add `sources.description text` migration, regenerate `src/types/database.ts`, update seed data, and render source descriptions.
- [ ] Decide whether public claim detail pages should show only published claims or internal users should see draft/disputed claims there.

### P1 - Spec Compliance

- [ ] Add `src/components/ui/tabs.tsx` Shadcn Tabs component.
- [ ] Replace encyclopedia filter buttons with `Tabs`, `TabsList`, and `TabsTrigger`.
- [ ] Add `src/components/ui/table.tsx` Shadcn Table component.
- [ ] Replace Source Library raw table elements with Shadcn Table primitives.

### P2 - Confidence And Extraction Model

- [ ] Decide where stored confidence breakdown metadata lives: `claims.metadata`, a dedicated `claim_confidence_factors` table, or another normalized model.
- [ ] Update `ConfidenceBreakdown` to read stored factors when available.
- [ ] If stored factors are not added yet, change UI copy to make clear that the breakdown is evidence-derived.
- [ ] Decide the canonical public path for "extracted content": confirmed extractions, curated join tables, or published claim evidence.
- [ ] Update `getSourceExtractedContent()` to use the chosen canonical path.

### P3 - Polish And Verification

- [ ] Change `EntityChip` relationship label to `text-[6.5px]`.
- [ ] Re-run `npm.cmd run typecheck`.
- [ ] Re-run `npm.cmd run lint`.
- [ ] Re-run `npm.cmd run test`.
- [ ] Re-run `npm.cmd run build`.
- [ ] Re-run `npm.cmd run smoke`.
