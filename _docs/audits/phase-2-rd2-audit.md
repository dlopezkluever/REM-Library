# Phase 2 — Round 2 Audit

**Date:** 2026-06-13
**Branch:** `launch-prep`
**Scope:** Verification of all 23 items from `phase-2-audit.md` against current source files, plus identification of any newly introduced issues.

---

## Verdict: All 23 Original Items Fixed

Every bug and improvement item from the first audit has been correctly implemented. Summary of verification:

| ID  | Status | Notes |
| --- | ------ | ----- |
| B1  | ✅ Fixed | `canUpdateSource = true` moved after all pre-validation in edge function; `chunking_failed` accepted as retry stage; UI shows Fetch URL for both `uploaded` and `chunking_failed` |
| B2  | ✅ Fixed | `ClaimSection` for `disputed_alternative` added between Literary & Artistic and Other Claims in `EntityDetailPage.tsx` |
| B3  | ✅ Fixed | `onSuccess` now navigates to `/admin/entities?search=...` with cache invalidation |
| B4  | ✅ Fixed | Pre-flight JS canonical check removed; `setClaimCanonical` conflict returns `{ canonicalConflict: true }` and the claim is retained; `AdminClaimNewPage` shows inline conflict notice |
| B5  | ✅ Fixed | `submitConfirm` passes `confirmClaimMeta`; `reviewExtractionItem` has a `confirm` post-processing block matching the `edit` block |
| M1  | ✅ Fixed | View mode now shows Frame and Canonical fields for claim items in `ExtractionReviewPanel` |
| M2  | ✅ Fixed | `window.confirm` replaced with Dialog + `canonicalConflictTarget` state in `AdminClaimManagerPage` |
| M3  | ✅ Fixed | `navItems` moved inside component and conditioned on `role === 'super_admin'` in `AdminShell` |
| M4  | ✅ Fixed | Content-Type check added after `response.ok` in edge function; throws before `canUpdateSource = true` for unsupported types |
| M5  | ✅ Fixed | `updateClaimInterpretationFrame` pre-fetches `currentClaim.interpretation_frame` and logs `{ old_frame, new_frame }` |
| M6  | ✅ Fixed | `normalizeUrlIngestionDomain` uses `new URL()` to extract hostname, validates format, throws for invalid input |
| S1  | ✅ Fixed | `ClaimSection` has `collapsible` prop using `<details>/<summary>` with "Show N claims" affordance |
| S2  | ✅ Fixed | `dateSortYear` uses `parseTimelineSortYear` (handles empty → null, rejects floats, validates integer range) |
| S3  | ✅ Fixed | `date_era` input has `list="entity-new-era-options"` with `<datalist>` populated from `TIMELINE_ERAS` |
| S4  | ✅ Fixed | `isObjectRecord` now includes `&& !Array.isArray(value)` |
| S5  | ✅ Fixed | `AdminUrlDomainsPage` has explicit loading → error → empty → list conditional |
| S6  | ✅ Fixed | `ROUTES` exports `ADMIN_ENTITY_NEW` and `ADMIN_CLAIM_NEW`; manager pages use the constants |
| S7  | ✅ Fixed | `domain.ts` uses `export type { InterpretationFrame } from '@/lib/api/admin'` |
| S8  | ✅ Fixed | Entity search dropdown shows "Searching..." while `isLoading` is true in `AdminClaimNewPage` |
| S9  | ✅ Fixed | `reviewExtractionItem` edit path returns `{ ...reviewResult, canonicalConflict: true }` instead of throwing; panel shows informational notice |
| S10 | ✅ Fixed | `readResponseTextWithLimit` implemented with 1.5MB cap via streaming reader |
| S11 | ✅ Documented | Code comment added: "The list RPC does not yet expose Phase 2 source metadata columns; detail views fetch them." |
| S12 | ⏳ Deferred | No new tests added — acknowledged in the audit as a future investment, not a launch blocker |

---

## One New Issue Found

### New Minor — `chunking_failed` URL Sources Show Two Conflicting Action Buttons

**File:** `src/lib/api/admin.ts` (`getPipelineRerunAction`)
**Severity:** Minor (confusing UX side-effect of the B1 fix)

#### What happens

The B1 fix correctly added `chunking_failed` to the Fetch URL button condition in `AdminSourceDetailPage`:

```tsx
{source.format === 'url' &&
 (source.pipeline_stage === 'uploaded' || source.pipeline_stage === 'chunking_failed') ? (
  <Button onClick={() => urlFetchMutation.mutate()}>Fetch URL</Button>
) : null}
```

However, `getPipelineRerunAction` in `admin.ts` was not updated. For `stage === 'chunking_failed'` with `format === 'url'`, it returns:

```ts
{
  disabledReason: null,
  functionName: 'trigger-extraction',
  label: 'Run extraction',
}
```

This means both buttons are now shown and enabled for a `chunking_failed` URL source:
- **"Run extraction"** (Re-run button) — calls `trigger-extraction`, which processes existing chunks. For a `chunking_failed` URL source that never had chunks created, this will either fail or produce zero results silently.
- **"Fetch URL"** — calls `trigger-url-fetch`, which is the correct action to re-fetch and re-chunk the URL.

An admin seeing two enabled buttons ("Run extraction" and "Fetch URL") has no clear signal about which one to use. The correct action is always "Fetch URL" for a URL source at `chunking_failed`.

#### Fix

In `getPipelineRerunAction` (`admin.ts`, line ~774), add a `disabledReason` for `chunking_failed` URL format sources so the Re-run button is disabled with an explanatory tooltip:

```ts
if (stage === 'chunking' || stage === 'chunking_failed') {
  if (source?.format === 'url') {
    if (stage === 'chunking_failed') {
      return {
        disabledReason: 'Use the Fetch URL button to re-fetch this URL source.',
        functionName: null,
        label: 'Run extraction',
      }
    }

    return {
      disabledReason: null,
      functionName: 'trigger-extraction',
      label: 'Run extraction',
    }
  }
  // ...
}
```

This leaves "Fetch URL" as the sole enabled action for `chunking_failed` URL sources, which is correct. `chunking` URL sources (where the fetch succeeded and chunks exist) keep "Run extraction" enabled as before.

**Effort:** ~10 minutes, one-line change with minor restructuring.

---

## Final Assessment

Phase 2 is solid. All 5 bugs are fixed, all medium issues are resolved, all but one minor item (S12 tests, explicitly deferred) are addressed. The one newly found issue is small, isolated, and has no data-loss or correctness consequence — it's purely a UX clarity gap in a recoverable admin action.

**Recommended action before deploy:** Fix the `getPipelineRerunAction` `chunking_failed` URL case (10 min), then proceed.
