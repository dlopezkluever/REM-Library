# Phase 2 Public Launch Readiness — Implementation Audit

**Date:** 2026-06-13  
**Branch:** `launch-prep`  
**Scope:** All files changed in the Phase 2 implementation against the spec at `_docs/phases/phase-2-public-launch-readiness-spec-dev-plan.md`

---

## Executive Summary

Phase 2 is largely well-implemented. The schema, API layer, edge function, sectioned entity page, and the new admin creation forms are all present and functionally correct. However, there are **4 confirmed bugs** (one of which is a significant UX dead-end for URL sources), **several medium-severity issues**, and a handful of spec gaps worth addressing before public launch.

The most critical issues:
1. URL fetch failures permanently lock a URL source in a broken state where neither the Fetch URL button nor extraction can proceed.
2. Draft entities created via the new form redirect to the public entity page, which shows "Entity Not Found."
3. A TOCTOU race in `createAdminClaim` can produce orphaned claims in the DB while the UI shows an error.
4. The Extraction Review Panel's `confirm` action never applies `interpretationFrame` or `isCanonical` — only `edit` does.

---

## 1. Migration (`supabase/migrations/20260613010000_phase2_public_launch_schema.sql`)

### What's correct
- All three enum types (`interpretation_frame`, `source_category`) and the `url_ingestion_config` table are created correctly with proper values.
- The backfill `UPDATE sources SET category = CASE tier ...` is correct.
- Indexes on `claims(interpretation_frame)` and `claims(is_canonical) WHERE is_canonical = true` are appropriate.
- The `set_claim_canonical` PL/pgSQL function is the strongest piece of this implementation: it checks `profiles.role = 'super_admin'`, uses `FOR UPDATE` to lock rows, handles the force-replace path, logs to `admin_audit_events`, and returns structured JSON for conflict detection. Solid.
- The `get_admin_claims_page` SQL function correctly returns `interpretation_frame` and `is_canonical`.

### Issues

**MEDIUM — No `fetch_failed` pipeline stage was added**

The spec (§3.3) explicitly required: "Add `fetch_failed` handling — either a new `pipeline_stage` enum value or a `fetch_error_message` metadata column."

Neither was done. Instead, the edge function falls through to `chunking_failed` on all errors (see §3 below). This creates semantic confusion in the pipeline display and blocks the "Fetch URL" button (see Bug #1).

**MINOR — `url_ingestion_config` RLS: no DELETE policy**

A super admin cannot delete a domain row via the API — they can only toggle `enabled`. If a domain is added in error, it can only be disabled, not removed. Add a super_admin DELETE policy if that's desired (or document this is intentional).

---

## 2. API Layer

### `src/lib/api/claims.ts`

**What's correct:** The overloaded `getClaimsForEntity` is clean. The `{ includeDisputed: true }` overload correctly returns `{ publishedClaims, disputedClaims }`. The `sortClaimsForEntity` sorts `is_canonical DESC, confidence_score DESC` using `confidence_override ?? confidence_score`. Correct and complete.

**MINOR — Two separate query round-trips for `includeDisputed`**

When `includeDisputed: true`, the function runs 3 Supabase queries: one for claim IDs, one for published claims, one for disputed claims. This is fine at current scale but a single SQL join via an RPC would be more efficient at volume. Low priority.

---

### `src/lib/api/entities.ts`

**What's correct:** `getEntityPreviewWithClaims` correctly fetches entity + top-2 claims sorted `is_canonical DESC, confidence_score DESC`. Clean implementation.

**MINOR — `getEntityPreviewWithClaims` re-fetches entity data already in cache**

The function fetches the entity row even though `GraphSidePanel` already has it from `getPublishedEntities()`. The entity is re-fetched unnecessarily (`preview?.entity ?? activeEntityRow`). Could be refactored to `getPreviewClaims(entityId)` returning only claims. Not a correctness issue, just slightly wasteful on each node click.

---

### `src/lib/api/admin.ts`

**What's correct:**
- `createAdminEntity`, `createAdminClaim`, `updateClaimInterpretationFrame`, `setClaimCanonical`, `updateSourceCategory`, `triggerUrlFetch`, `createUrlIngestionDomain`, `listUrlIngestionDomains`, `updateUrlIngestionDomainEnabled` — all present, correctly wired to Supabase.
- `sourceTierFromCategory` correctly maps `primary_rem`/`secondary_rem` → `primary`, everything else → `secondary`.
- `createAdminSource` now accepts and stores `category`, deriving `tier` from it. Category is also stored on the source row. Correct.
- `getPipelineRerunAction` correctly updated: for URL sources at `chunking`, returns `trigger-extraction`.

**BUG #3 — `createAdminClaim` race condition: orphaned claims on canonical conflict**

Flow in `createAdminClaim` when `isCanonical = true`:
1. JS-level check: query `claim_entities` for existing canonical links → if found, throw (early exit before any insert, this part is safe)
2. INSERT claim → claim exists in DB
3. INSERT claim_entities links  
4. Call `setClaimCanonical(claim.id, true)` → DB function does its own conflict check

The race: between step 1 and step 4, another canonical claim could be set on the same entity. `setClaimCanonical` at step 4 returns `{ conflict: true }`. `createAdminClaim` then throws:
```ts
throw new Error('Another canonical claim already exists for one of the selected entities.')
```

But the claim was already inserted at step 2 (with `is_canonical = false`). The UI sees an error, but the DB has a new claim record (with its `claim_entities` links). The claim exists as a `draft` or `published` orphan.

**Fix:** Remove the pre-flight JS canonical check. Let `setClaimCanonical` handle conflict detection exclusively. If it returns `{ conflict: true }`, surface a proper conflict dialog to the user (with `forceReplace` option) rather than throwing. The claim will already have been created by this point, which is fine — just let the admin decide what to do with the canonical flag.

**MEDIUM — `updateClaimInterpretationFrame` audit log missing old value**

```ts
await insertAdminAuditEvent('update_claim_interpretation_frame', 'claims', claimId, {
  interpretation_frame: frame,
})
```

The old frame value is not recorded. Should be:
```ts
{ old_frame: currentFrame, new_frame: frame }
```
Currently impossible to audit "what was it before?" for frame changes.

**MINOR — `getAdminSourceListRows` hardcodes `null` for new source columns**

The `get_admin_source_list_rows` RPC function was not updated to return the new `category`, `crawl_date`, `license`, `rights_notes`, `attribution` columns. The mapping function in `admin.ts:1226-1248` hardcodes these as `null`. The source list view thus never shows category or crawl date. This is acceptable for a list view (detail page shows everything), but admins can't filter by category from the list. Document this limitation or update the RPC.

**MINOR — `isObjectRecord` at line 2356 does not exclude arrays**

```ts
const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
  // Missing: && !Array.isArray(value)
}
```

The earlier `isRecord` at line 445 correctly excludes arrays. The later `isObjectRecord` does not. In practice this doesn't cause bugs because the downstream property checks (`typeof value.id === 'string'`, `typeof value.conflict === 'boolean'`) would fail for arrays. But it's a latent inconsistency.

---

## 3. Edge Function (`supabase/functions/trigger-url-fetch/index.ts`)

### What's correct
- Allowlist check via `url_ingestion_config` before fetching. ✓
- `stripHtmlToText` cleanly strips scripts/styles/comments and preserves paragraph breaks. ✓
- 200-word minimum threshold before creating chunks. ✓
- `chunkText` splits by paragraph boundaries respecting 500-word target. ✓
- `crawl_date` is set on success. ✓
- Pre-existing chunk cleanup (`DELETE` before INSERT) prevents duplicate chunks on re-run. ✓
- Correct `User-Agent: AlexandriaBot/1.0`. ✓

### BUG #1 — URL fetch failure permanently destroys the Fetch URL button

When any error occurs after `canUpdateSource = true` (which is set immediately after reading the source record — before the allowlist check), `failSourceStage` is called:

```ts
} catch (error) {
  if (sourceId && canUpdateSource) {
    await failSourceStage(supabase, sourceId, 'chunking_failed', error)
  }
}
```

This means: if an admin tries to fetch a URL whose domain is not yet in the allowlist, the pipeline stage changes from `uploaded` → `chunking_failed`.

The Fetch URL button in `AdminSourceDetailPage` only renders when `pipeline_stage === 'uploaded'`:
```tsx
{source.format === 'url' && source.pipeline_stage === 'uploaded' ? (
  <Button>Fetch URL</Button>
) : null}
```

Once `chunking_failed`, the Fetch URL button is gone. The "Re-run" button shows "Run extraction" (since `getPipelineRerunAction` for `chunking_failed` + URL format returns `trigger-extraction`), but `rerunSourcePipelineStage` then throws: "Extraction cannot be re-run until this source has chunks."

**The admin is permanently stuck.** They cannot re-fetch the URL and cannot run extraction. They must archive the source and recreate it.

**Fix (edge function):** Move `canUpdateSource = true` to after the allowlist check passes. Pre-fetch validation errors (domain not allowlisted, wrong format, wrong stage, missing URL) should return HTTP 400 errors without changing the pipeline stage:

```ts
// Pre-validation block — no stage changes on these errors
if (source.format !== 'url') { return jsonResponse({ error: '...' }, 400) }
if (source.pipeline_stage !== 'uploaded') { return jsonResponse({ error: '...' }, 400) }
if (!source.url) { return jsonResponse({ error: '...' }, 400) }

const url = new URL(source.url)
const allowedDomain = await getAllowedDomain(supabase, url.hostname.toLowerCase())
if (!allowedDomain) { return jsonResponse({ error: `Domain not allowlisted: ...` }, 400) }

// Only after all checks pass — network errors or content failures update stage
canUpdateSource = true
```

**Fix (UI side):** Also show the Fetch URL button for `pipeline_stage === 'chunking_failed'` when `format === 'url'` to allow retry after the domain is allowlisted.

**MEDIUM — No content-type validation**

If the allowlisted URL serves binary content (PDF, image, video), `response.text()` returns garbage and the word count check likely fails. But the pipeline stage would still be set to `chunking_failed` rather than giving a clear error. Add `Content-Type` validation before calling `response.text()`.

**MINOR — No download size cap**

There is no limit on the size of content downloaded from the URL. A 100MB HTML page would be fully loaded into memory. Consider capping at ~1MB of raw HTML before parsing.

**MINOR — Single long paragraphs exceed chunk target**

If a single paragraph contains >500 words (common in academic text), it is kept as a single oversized chunk. The spec says "by paragraph or fixed token window." A secondary split within paragraphs at the word limit would make chunks more consistent.

---

## 4. `ExtractionReviewPanel.tsx`

### What's correct
- `interpretationFrame` dropdown added to `ClaimFields`. ✓
- `is_canonical` checkbox added and gated on `role === 'super_admin'`. ✓
- `toClaimInput` maps `interpretationFrame` and `isCanonical` from item data. ✓
- For the `edit` flow, `reviewExtractionItem` correctly calls `updateClaimInterpretationFrame` and `setClaimCanonical` post-creation. ✓

### BUG #4 — `confirm` action never applies `interpretationFrame` or `isCanonical`

The spec (§9.1) says: "These fields are saved when the admin confirms or edits the extraction item."

`submitConfirm` calls:
```ts
reviewMutation.mutate({
  action: 'confirm',
  extractionId: ...,
  itemId: ...,
  itemKind: ...,
})
```

In `reviewExtractionItem`, the frame/canonical post-processing only runs for `edit`:
```ts
if (input.action === 'edit' && input.itemKind === 'claim' && input.claim) {
  // frame and canonical applied here
}
```

For `confirm`, `claim_input` is null. The DB function `review_extraction_item` creates the claim from stored extraction JSON. Whether that JSON includes `interpretation_frame` depends on the DB function's implementation — but the post-creation hook in `reviewExtractionItem` is definitely not applied for `confirm`.

The result: if the AI extracted a frame and the admin confirms without editing, the confirmed claim has `interpretation_frame = null` even if the extraction data had a frame value.

**Fix:** After a successful `confirm` for a claim, run the same post-processing as for `edit`:
```ts
if (input.itemKind === 'claim') {
  const createdClaimId = data.createdIds[0]
  const claimItem = /* find the claim item from group */
  if (createdClaimId && claimItem?.interpretationFrame) {
    await updateClaimInterpretationFrame(createdClaimId, claimItem.interpretationFrame)
  }
}
```

This requires passing the `ReviewClaimItem` data into `reviewExtractionItem` or handling it in the component's `onSuccess` callback.

**MEDIUM — View mode doesn't display `interpretationFrame` or `isCanonical` for claim items**

In view mode (`mode === 'view'`), the claim display shows only "Statement," "Entities," and "Evidence." There is no display of `interpretationFrame` or `isCanonical` for the current item, even though these values exist on `ReviewClaimItem`. An admin cannot see what the AI extracted for these fields without entering edit mode. This should be displayed in view mode.

---

## 5. `EntityDetailPage.tsx`

### What's correct
- Sectioned claim layout (Core Interpretation, Supporting Context, External Academic, Historical Record, Literary & Artistic, Other Claims, Disputed Readings) is correct. ✓
- `ClaimSection` returns null when empty. ✓
- Hero styling on `is_canonical` first claim in Core Interpretation. ✓
- Disputed claims correctly included via `{ includeDisputed: true }`. ✓
- Evidence query includes both published and disputed claim IDs. ✓

### MINOR — `ClaimSection` "Other Claims" is not collapsible

The spec (§9.3) says the unframed claims section should be "collapsible." Currently `ClaimSection` renders a flat list with no expand/collapse. When most claims are unframed at launch (per Risk R2), this section could be very long with no way to collapse it. A simple `<details>/<summary>` or toggle would satisfy this requirement.

### MINOR — `heroFirst` does nothing if no claim in Core Interpretation has `is_canonical = true`

If only `canonical_rem`-framed claims exist (no claim has `is_canonical = true`), `coreClaims[0].is_canonical = false`, so `hero = false` for every item. The "Core Interpretation" section shows without any hero treatment. This is technically correct per the spec ("The `is_canonical` claim renders in a hero style") but could feel visually flat. Consider showing hero treatment for the first `canonical_rem` claim when no claim has `is_canonical = true`.

---

## 6. `GraphSidePanel.tsx`

### What's correct
- Claims query via `getEntityPreviewWithClaims` is correctly gated on `activeNodeId !== null && activeEntityRow !== undefined`. ✓
- Canonical badge (amber) and frame badge (stone) are rendered for each preview claim. ✓
- Claims link to `/claim/${claim.id}` for detail. ✓
- Fallback to `activeEntityRow` while preview loads prevents a flash of no content. ✓
- Duplicate `frameLabels` definition exists here and in `EntityDetailPage.tsx` — minor redundancy but not a bug.

### MINOR — Side panel claims link away from the graph with no "back" path

Clicking a claim card in the side panel navigates to `/claim/${claim.id}`, leaving the graph entirely. The existing "View full entry" link does the same (by design). But claim cards don't visually indicate they're links that navigate away. A small external link icon or hover state would signal this behavior.

---

## 7. `AdminEntityNewPage.tsx`

### BUG #2 — Creates draft entity then redirects to public entity page → "Entity Not Found"

```ts
onSuccess: async (entity) => {
  await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
  await queryClient.invalidateQueries({ queryKey: ['entities'] })
  navigate(`/entity/${entity.slug}`)  // ← public page
},
```

The public `getEntityBySlug` filters `status = 'published'`. A newly created entity defaults to `draft`. Navigating to `/entity/${entity.slug}` shows "Entity Not Found."

**Fix:** Redirect to the admin entities list with a search param:
```ts
navigate(`/admin/entities?search=${encodeURIComponent(entity.name)}`)
```
Or, if an admin entity detail page exists in the future, navigate there.

### MINOR — `dateSortYear` has no NaN validation

```ts
dateSortYear: dateSortYear.trim() ? Number(dateSortYear) : null,
```

`Number('abc')` is `NaN`. Passing `NaN` to the `date_sort_year` column would cause a DB type error. The spec says to use `parseTimelineSortYear` (which exists in `src/lib/timeline/pinchZoom.ts` and is used in the timeline dates editor). Reuse it here.

### MINOR — `date_era` uses free-text `Input` instead of `datalist`

The timeline dates editor in `AdminEntityManagerPage` uses:
```tsx
<Input list="timeline-era-options" ... />
<datalist id="timeline-era-options">
  {TIMELINE_ERAS.map(...)}
</datalist>
```

The new entity form uses a plain `<Input>` with no datalist suggestions. Minor inconsistency in UX.

---

## 8. `AdminClaimNewPage.tsx`

### What's correct
- Multi-select entity search with chip removal. ✓
- Frame dropdown, canonical checkbox (super_admin gated), status select. ✓
- Submit button disabled when no entities selected. ✓
- `isCanonical: role === 'super_admin' && isCanonical` correctly prevents canonical flag from non-super-admins. ✓

### MINOR — Redirects to public claim page (minor)

```ts
navigate(`/claim/${claim.id}`)
```

The spec says redirect to "the new claim's admin detail page." There is no admin claim detail page in the current system, so the public claim detail page is the only option. This is workable since `getClaimById` doesn't filter by status. Low priority.

### MINOR — Missing "source" attachment field

The spec (§6.6) includes an optional source attachment field at claim creation time: "source (optional — allow attaching a source anchor to give it evidence at creation time)." This is not implemented. Claims created manually have no evidence at creation. Users can add evidence later, but this is a spec gap for completeness.

---

## 9. `AdminClaimManagerPage.tsx`

### What's correct
- Frame column with inline `<select>` that fires `updateClaimInterpretationFrame`. ✓
- Canonical column: super_admin gets toggle button; editor gets lock icon. ✓
- "Create claim" button links to `/admin/claims/new`. ✓
- Conflict detection and `forceReplace` flow via `setClaimCanonical`. ✓

### MEDIUM — `window.confirm()` used for canonical conflict resolution

```ts
const shouldReplace = window.confirm(
  "Another canonical claim already exists for one of this claim's entities. Replace it?"
)
```

`window.confirm()` is a browser-native blocking dialog that doesn't match the design system and is blocked in some headless/embedded environments. The existing `Dialog` component (already used in this file's parent) should be used instead. This is the only place in the entire admin UI where `window.confirm` is used for a consequential action.

---

## 10. `AdminEntityManagerPage.tsx`

### What's correct
- "Create entity" button links to `/admin/entities/new`. ✓
- No other Phase 2 changes were required here per spec. ✓

---

## 11. `AdminSourceDetailPage.tsx`

### What's correct
- `source_category` dropdown with `categoryMutation` that calls `updateSourceCategory`. ✓
- Triggers confidence recompute dialog on category change (same as tier change). ✓
- `crawl_date` displayed as formatted string. ✓
- Rights metadata form (license, attribution, rights_notes) with save button. ✓
- "Fetch URL" button gated on `format === 'url' && pipeline_stage === 'uploaded'`. ✓
- `urlFetchMutation` on success refreshes source and source list queries. ✓

### BUG #1 (continued) — Fetch URL button must also show for `chunking_failed` URL sources

As detailed in §3, a URL fetch failure moves the source to `chunking_failed`. The button condition:
```tsx
{source.format === 'url' && source.pipeline_stage === 'uploaded' ? <Button>Fetch URL</Button> : null}
```

Should be:
```tsx
{source.format === 'url' && 
 (source.pipeline_stage === 'uploaded' || source.pipeline_stage === 'chunking_failed') ? (
  <Button>Fetch URL</Button>
) : null}
```

---

## 12. `AdminSourceNewPage.tsx`

### What's correct
- Uses `sourceCategories` and `sourceCategoryLabels` for category selection. ✓
- `tier` is no longer directly selected — derived from category via `sourceTierFromCategory`. ✓
- The old "Automatic URL ingestion is not available yet" disabled reason has been replaced with the proper flow. ✓
- Category descriptions array provides context for each option. ✓

---

## 13. `AdminUrlDomainsPage.tsx`

### What's correct
- Super admin gate at the page level. ✓
- Add domain form with normalization to lowercase. ✓
- Toggle enabled/disabled per row. ✓

### MINOR — Page accessible from nav to non-super-admins (shows error message)

`AdminShell.tsx` adds "URL Domains" to `navItems` unconditionally. Non-super-admin editors see the link but get "Super admin access is required" when they click it. Hide this nav item for non-super-admins:

```tsx
const navItems = [
  ...
  ...(role === 'super_admin' ? [{ to: ROUTES.ADMIN_URL_DOMAINS, label: 'URL Domains', icon: Globe }] : []),
  ...
]
```

### MINOR — No domain delete, no loading indicator, no error state for query failure

- Admins cannot delete a domain (only disable it).
- No loading state shown while `domainsQuery` is fetching.
- If `domainsQuery` errors, nothing is shown to the user.

---

## 14. Router & Routes

### What's correct
- `/admin/entities/new` → `AdminEntityNewPage` ✓
- `/admin/claims/new` → `AdminClaimNewPage` ✓
- `/admin/settings/url-domains` → `AdminUrlDomainsPage` ✓

### MINOR — `ROUTES` constant missing new page entries

`src/constants/routes.ts` does not export:
- `ADMIN_ENTITY_NEW`
- `ADMIN_CLAIM_NEW`

The manager pages use hardcoded strings (`to="/admin/entities/new"`, `to="/admin/claims/new"`) instead of ROUTES constants. Not a bug, but a maintenance concern. Add these to ROUTES for consistency.

---

## 15. Type System

### What's correct
- `database.ts` types reflect all new columns on `claims` and `sources`, and the new `url_ingestion_config` table. ✓
- `src/types/domain.ts` exports `InterpretationFrame` and `SourceCategory`. ✓
- `InterpretationFrame` imported from `@/types/domain` in UI components and from `@/types/database` (via Enums) in `admin.ts`. Both are identical in value but maintained separately.

### MINOR — `InterpretationFrame` defined in two places

`src/types/domain.ts:25-32` — manually defined type union  
`src/lib/api/admin.ts:11` — `Enums<'interpretation_frame'>` from generated DB types, re-exported

If enum values change in the DB, only `database.ts` is auto-generated. `domain.ts` must be updated manually. Low risk but a maintenance concern. Consider re-exporting `InterpretationFrame` from `admin.ts` in `domain.ts` to have a single source of truth.

---

## 16. Testing Coverage

Existing test files (`admin.test.ts`, `reviewUtils.test.ts`) were updated but only cover pre-existing helpers (`getPipelineRerunAction`, `applySourceRealtimeChange`, `findHighlightSpan`, etc.). No new tests were added for Phase 2 features.

**No tests exist for:**
- `createAdminEntity` / `createAdminClaim` / `updateClaimInterpretationFrame` / `setClaimCanonical`
- `getClaimsForEntity` with `includeDisputed: true`
- `getEntityPreviewWithClaims`
- The edge function (`trigger-url-fetch`) — allowlist check, chunking, failure modes
- `ClaimSection` rendering (entity page sectioning)
- `createAdminClaim` canonical conflict behavior

The spec (§11.1–11.4) describes a thorough testing plan. None of it has been executed programmatically.

---

## Summary Table

| # | Area | Severity | Issue |
|---|------|----------|-------|
| B1 | Edge Function + Source Detail | **Bug** | URL fetch failure → `chunking_failed` → Fetch URL button disappears; admin stuck |
| B2 | AdminEntityNewPage | **Bug** | Draft entity redirects to `/entity/slug` → "Entity Not Found" |
| B3 | `createAdminClaim` | **Bug** | Race condition: claim is inserted before canonical conflict check; orphaned claim on conflict |
| B4 | ExtractionReviewPanel | **Bug** | `confirm` action never applies `interpretationFrame` or `isCanonical` to created claim |
| M1 | ExtractionReviewPanel | Medium | View mode doesn't display `interpretationFrame` or `isCanonical` for claim items |
| M2 | AdminClaimManagerPage | Medium | `window.confirm()` used for canonical conflict — should use Dialog component |
| M3 | AdminShell | Medium | "URL Domains" nav link shown to non-super-admins |
| M4 | Edge function | Medium | Domain validation errors shouldn't call `failSourceStage` (pre-fetch errors shouldn't change pipeline stage) |
| M5 | Edge function | Medium | No Content-Type check before calling `response.text()` |
| M6 | `admin.ts` | Medium | `updateClaimInterpretationFrame` audit log missing old value |
| S1 | EntityDetailPage | Minor | "Other Claims" section not collapsible (spec requires it) |
| S2 | AdminEntityNewPage | Minor | `dateSortYear` → `Number()` can produce `NaN`; should reuse `parseTimelineSortYear` |
| S3 | AdminEntityNewPage | Minor | `date_era` is free text; should use datalist like timeline dates editor |
| S4 | `admin.ts` | Minor | `isObjectRecord` at line 2356 doesn't exclude arrays (inconsistency with `isRecord` at 445) |
| S5 | AdminUrlDomainsPage | Minor | No domain delete; no loading/error state for query failure |
| S6 | Routes | Minor | `ROUTES` missing `ADMIN_ENTITY_NEW` and `ADMIN_CLAIM_NEW` entries |
| S7 | `domain.ts` | Minor | `InterpretationFrame` duplicated in domain.ts and admin.ts |
| S8 | AdminClaimNewPage | Minor | Optional source attachment field from spec not implemented |
| S9 | Edge function | Minor | No download size cap for fetched URL content |
| S10 | Testing | Minor | Zero new tests for Phase 2 features |

---

## Recommended Fix Order

1. **B1** — Fix edge function `canUpdateSource` placement + add `chunking_failed` case to Fetch URL button visibility
2. **B2** — Fix `AdminEntityNewPage` redirect to admin entities list
3. **B4** — Apply `interpretationFrame`/`isCanonical` in `confirm` path of ExtractionReviewPanel
4. **M1** — Show frame/canonical in view mode in ExtractionReviewPanel
5. **B3** — Fix `createAdminClaim` canonical race (remove pre-flight JS check, rely on DB function)
6. **M2** — Replace `window.confirm()` with Dialog in AdminClaimManagerPage
7. **M3** — Hide URL Domains nav item for non-super-admins
8. **S1** — Make "Other Claims" section collapsible in ClaimSection
9. **S2** — Add `parseTimelineSortYear` validation to AdminEntityNewPage
10. All others at leisure before launch
