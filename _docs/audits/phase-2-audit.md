# Phase 2 Public Launch Readiness — Implementation Audit

**Date:** 2026-06-13
**Branch:** `launch-prep`
**Scope:** All files changed in the Phase 2 implementation against the spec at `_docs/phases/phase-2-public-launch-readiness-spec-dev-plan.md`

---

## How to Use This Document

This audit is organized into three parts:

1. **Issue Catalog** — every confirmed bug or improvement, with context and a precise fix approach
2. **Summary Table** — severity-sorted reference
3. **Battle Plan** — ordered step-by-step guide for working through the fixes in a single session

All items have been verified against the actual source files. Items not listed were either found to be non-issues or already correct.

---

## Executive Summary

Phase 2 is largely well-implemented. The schema, API layer, edge function, sectioned entity page, and the new admin creation forms are all present and functionally correct. However, there are **5 confirmed bugs** (one of which is a significant UX dead-end for URL sources, one of which silently hides an entire class of content from the public page), **several medium-severity issues**, and a handful of spec gaps.

The most critical issues:

1. URL fetch failures permanently lock a URL source in a broken state where neither the Fetch URL button nor extraction can proceed — and the edge function's own stage check means the UI fix alone is not sufficient.
2. Claims with `interpretation_frame = 'disputed_alternative'` and `status = 'published'` are completely invisible on the entity detail page — they fall through every section filter silently.
3. Draft entities created via the new form redirect to the public entity page, which shows "Entity Not Found."
4. A TOCTOU race in `createAdminClaim` can produce orphaned claims in the DB while the UI shows an error.
5. The Extraction Review Panel's `confirm` action never applies `interpretationFrame` or `isCanonical` — only `edit` does.

---

## Bug #1 — URL Fetch Failure Permanently Destroys the Fetch URL Button

**Files:** `supabase/functions/trigger-url-fetch/index.ts`, `src/pages/admin/AdminSourceDetailPage.tsx`
**Severity:** Bug (critical UX dead-end)

### What happens

In the edge function, `canUpdateSource = true` is set immediately after reading the source record — before any validation:

```ts
// index.ts lines 162–166
const { data: source, error: sourceError } = await supabase
  .from('sources')
  .select('id,format,pipeline_stage,url')
  .eq('id', sourceId)
  .single<SourceRow>()

canUpdateSource = true  // ← set here, before format/stage/allowlist checks

if (source.format !== 'url') { throw ... }
if (source.pipeline_stage !== 'uploaded') { throw ... }  // ← too late
if (!source.url) { throw ... }
// allowlist check, fetch, etc.
```

So if an admin clicks "Fetch URL" on a domain that isn't allowlisted yet, the catch block fires `failSourceStage(supabase, sourceId, 'chunking_failed', error)` and the source moves to `chunking_failed`.

The UI in `AdminSourceDetailPage.tsx` only shows the Fetch URL button when `pipeline_stage === 'uploaded'`:

```tsx
{
  source.format === 'url' && source.pipeline_stage === 'uploaded' ? (
    <Button>Fetch URL</Button>
  ) : null
}
```

Once `chunking_failed`, the button disappears. The Re-run button appears with label "Run extraction," but `rerunSourcePipelineStage` then throws: "Extraction cannot be re-run until this source has chunks." The admin is permanently stuck and must archive the source and recreate it.

### Why the UI fix alone is insufficient

Even if you show the button for `chunking_failed` sources, the edge function will reject the retry at line 172:

```ts
if (source.pipeline_stage !== 'uploaded') {
  throw new Error('Only uploaded URL sources can be fetched.')
}
```

This throws, `canUpdateSource` is already `true`, and `failSourceStage` is called again — re-setting the stage to `chunking_failed`. The admin hits the exact same dead-end again.

### Fix — three-part

**Part 1 (edge function): Move `canUpdateSource = true` to after all pre-validation.**
Pre-validation errors should return HTTP 400 without touching the pipeline stage. Only network or content-level failures (which happen after the allowlist check passes) should call `failSourceStage`.

```ts
// Read source
const { data: source } = await supabase.from('sources').select(...).eq('id', sourceId).single()
if (!source) { return jsonResponse({ error: 'Source was not found.' }, 400) }

// Pre-validation — return 400, never call failSourceStage
if (source.format !== 'url') {
  return jsonResponse({ error: 'Only URL-format sources can be fetched.' }, 400)
}
if (source.pipeline_stage !== 'uploaded' && source.pipeline_stage !== 'chunking_failed') {
  return jsonResponse({ error: 'Source is not in a fetchable state.' }, 400)
}
if (!source.url) {
  return jsonResponse({ error: 'Source URL is required.' }, 400)
}
const url = new URL(source.url)
const hostname = url.hostname.toLowerCase()
const allowedDomain = await getAllowedDomain(supabase, hostname)
if (!allowedDomain) {
  return jsonResponse({ error: `Domain is not allowlisted: ${hostname}.` }, 400)
}

// All pre-checks passed — network/content errors from here should update stage
canUpdateSource = true
// ... fetch, parse, chunk, insert, update stage
```

**Part 2 (edge function): Accept `chunking_failed` as a valid retry stage** (shown in the condition above: `!== 'uploaded' && !== 'chunking_failed'`). Without this, re-runs after domain allowlisting will always fail.

**Part 3 (UI): Show the Fetch URL button for `chunking_failed` URL sources** so admins can retry after adding the domain to the allowlist:

```tsx
// AdminSourceDetailPage.tsx
{source.format === 'url' &&
 (source.pipeline_stage === 'uploaded' || source.pipeline_stage === 'chunking_failed') ? (
  <Button disabled={urlFetchMutation.isPending} onClick={...}>
    Fetch URL
  </Button>
) : null}
```

---

## Bug #2 — `disputed_alternative` Frame Claims Are Invisible on the Entity Page

**File:** `src/pages/entity/EntityDetailPage.tsx`
**Severity:** Bug (silent content loss)

### What happens

The entity detail page renders five framed sections using `claimsByFrame()`, plus an "Other Claims" fallback for `interpretation_frame === null`:

```tsx
// EntityDetailPage.tsx lines 309–324
<ClaimSection claims={coreClaims} heroFirst title="Core Interpretation" />
<ClaimSection claims={claimsByFrame('supporting_context')} title="Supporting Context" />
<ClaimSection claims={claimsByFrame('external_academic')} title="External Academic Perspectives" />
<ClaimSection claims={claimsByFrame('historical_record')} title="Historical Record" />
<ClaimSection claims={claimsByFrame('literary_artistic')} title="Literary & Artistic" />
<ClaimSection claims={otherClaims} title="Other Claims" />       // only catches null frame
<ClaimSection claims={disputedClaims} disputed title="Disputed Readings" />  // only status='disputed'
```

There is no handler for `interpretation_frame = 'disputed_alternative'`. The `claimsByFrame` function is never called with `'disputed_alternative'`. The `otherClaims` filter requires `interpretation_frame === null` — non-null frames are excluded. The "Disputed Readings" section only shows `status = 'disputed'` claims.

**Result:** Any `published` claim with `interpretation_frame = 'disputed_alternative'` is completely invisible to public users. An admin can assign this frame and publish the claim, and it will never appear on any entity page.

### Fix

Add a dedicated section for `disputed_alternative` framed published claims. Place it between "Literary & Artistic" and "Other Claims" — before the unframed fallback:

```tsx
<ClaimSection
  claims={claimsByFrame('disputed_alternative')}
  title="Disputed Alternative Readings"
/>
<ClaimSection claims={otherClaims} title="Other Claims" />
```

The section can share the disputed visual treatment (red disclaimer text) since claims with `disputed_alternative` frame are semantically distinct from the canonical interpretation. Adjust the `ClaimSection` component to accept an optional `disclaimer` prop, or reuse the existing `disputed` prop:

```tsx
<ClaimSection
  claims={claimsByFrame('disputed_alternative')}
  disputed
  title="Disputed Alternative Readings"
/>
```

Note: this is distinct from the "Disputed Readings" section (which shows claims with `status = 'disputed'`). An admin should understand the difference: `disputed_alternative` is a framing choice for published claims that express alternative interpretations; `status = 'disputed'` is a curation status applied to contested content.

---

## Bug #3 — Draft Entity Creation Redirects to "Entity Not Found"

**File:** `src/pages/admin/AdminEntityNewPage.tsx`
**Severity:** Bug (broken post-create flow)

### What happens

```ts
// AdminEntityNewPage.tsx line 39
onSuccess: async (entity) => {
  navigate(`/entity/${entity.slug}`)  // ← navigates to public entity page
},
```

The public `getEntityBySlug` query filters `status = 'published'`. A newly created entity defaults to `draft`. The page renders the "Entity Not Found" message.

Even if the admin selects `published` during creation, the public page won't show the entity immediately because the `['entities']` cache may not have updated yet, and users seeing that URL would expect the full public experience.

### Fix

Redirect to the admin entities list, passing the entity name as a search parameter so the newly created entity is immediately visible:

```ts
onSuccess: async (entity) => {
  await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
  await queryClient.invalidateQueries({ queryKey: ['entities'] })
  navigate(`/admin/entities?search=${encodeURIComponent(entity.name)}`)
},
```

`AdminClaimManagerPage` already reads `searchParams.get('search')` from the URL on mount, and the entity manager page has the same search pattern, so this will work without additional changes.

---

## Bug #4 — `createAdminClaim` Leaves Orphaned Claims on Canonical Conflict

**File:** `src/lib/api/admin.ts`
**Severity:** Bug (orphaned DB record on conflict)

### What happens

The flow in `createAdminClaim` when `isCanonical = true`:

1. **JS-level pre-check** (lines 1584–1597): query `claim_entities` for existing canonical → if found, throw (safe early exit)
2. **INSERT claim** (lines 1600–1613): claim exists in DB with `is_canonical = false`
3. **INSERT claim_entities** (lines 1615–1624): links exist in DB
4. **Call `setClaimCanonical`** (line 1627): DB function does its own conflict check

Between step 1 and step 4, another concurrent admin session can set a canonical claim on the same entity. `setClaimCanonical` returns `{ conflict: true }`. `createAdminClaim` then throws:

```ts
throw new Error('Another canonical claim already exists for one of the selected entities.')
```

The UI shows an error. The DB now has a new `draft`/`published` claim with `claim_entities` links but no canonical flag and no admin awareness of its existence. It is an orphan.

### Fix

Remove the pre-flight JS canonical check. Accept that the claim is being created regardless — `isCanonical` is an attribute of the claim, not a precondition for creation. Let `setClaimCanonical` be the sole arbiter of canonical conflicts:

```ts
// After claim and claim_entities are inserted:
if (input.isCanonical) {
  const canonicalResult = await setClaimCanonical(claim.id, true)

  if (canonicalResult.conflict) {
    // Return the created claim with conflict info; let the UI surface a conflict dialog
    return {
      ...claim,
      is_canonical: false,
      canonicalConflict: true,
      existingCanonicalClaimId: canonicalResult.replaced_claim_id ?? null,
    }
  }
}
```

The UI in `AdminClaimNewPage.tsx` should handle the `canonicalConflict` return by showing an inline message: "Claim created. A canonical claim already exists for this entity — you can set this as canonical later from the claim manager if you wish to replace it."

This approach also makes `createAdminClaim` consistent with the `setClaimCanonical` pattern already established in `AdminClaimManagerPage.tsx`.

---

## Bug #5 — `confirm` Action Doesn't Apply `interpretationFrame` or `isCanonical`

**File:** `src/components/admin/ExtractionReviewPanel.tsx`, `src/lib/api/admin.ts`
**Severity:** Bug (silent data loss for confirmed claims)

### What happens

In the review panel, `submitConfirm` sends only:

```ts
reviewMutation.mutate({
  action: 'confirm',
  extractionId: selectedExtraction.extraction.id,
  itemId: selectedItem.itemId,
  itemKind: selectedItem.kind,
})
```

In `reviewExtractionItem` (`admin.ts` around line 2184), the frame and canonical post-processing runs only for `edit`:

```ts
if (input.action === 'edit' && input.itemKind === 'claim' && input.claim) {
  // updateClaimInterpretationFrame and setClaimCanonical called here
}
```

The `confirm` path calls the DB function `review_extraction_item` which creates the claim from stored extraction JSON. Whether the AI populated `interpretation_frame` in that JSON is uncertain, but the UI-level post-creation hook is definitively never called for `confirm`.

The result: an admin who sets `interpretationFrame` and `isCanonical` in view mode, then clicks "Confirm," gets a claim with `interpretation_frame = null` and `is_canonical = false` — silently wrong.

### Fix

**Step 1:** In `ExtractionReviewPanel.tsx`, pass the current item's frame and canonical values through `submitConfirm` via a new mutation input shape, or handle it in the `reviewMutation.onSuccess` callback:

```ts
const submitConfirm = () => {
  if (!selectedItem || !selectedExtraction) return

  reviewMutation.mutate({
    action: 'confirm',
    extractionId: selectedExtraction.extraction.id,
    itemId: selectedItem.itemId,
    itemKind: selectedItem.kind,
    // Pass the item's current frame/canonical so post-processing can apply them
    confirmClaimMeta:
      selectedItem.kind === 'claim'
        ? {
            interpretationFrame: selectedItem.interpretationFrame,
            isCanonical: selectedItem.isCanonical,
          }
        : undefined,
  })
}
```

**Step 2:** In `reviewExtractionItem` (`admin.ts`), extend the post-processing to cover `confirm` for claims:

```ts
// After the existing 'edit' block:
if (input.action === 'confirm' && input.itemKind === 'claim' && input.confirmClaimMeta) {
  const createdClaimId = data.createdIds[0]
  if (createdClaimId) {
    if (input.confirmClaimMeta.interpretationFrame !== null) {
      await updateClaimInterpretationFrame(
        createdClaimId,
        input.confirmClaimMeta.interpretationFrame
      )
    }
    if (input.confirmClaimMeta.isCanonical) {
      const result = await setClaimCanonical(createdClaimId, true)
      if (result.conflict) {
        // Log but don't throw — claim was successfully confirmed, canonical is advisory
        console.warn('Canonical conflict on confirm:', result)
      }
    }
  }
}
```

The `confirmClaimMeta` field needs to be added to the `ReviewExtractionItemInput` type and to `SaveReviewExtractionItemInput` if that's the outgoing type.

---

## Medium #1 — View Mode Doesn't Show `interpretationFrame` or `isCanonical`

**File:** `src/components/admin/ExtractionReviewPanel.tsx`
**Severity:** Medium (missing information for the confirm decision)

### What happens

In view mode (lines 798–848), the claim display shows: Statement, Entities, Evidence. There is no display of `interpretationFrame` or `isCanonical` even though these fields exist on `ReviewClaimItem` and are shown in edit mode. An admin cannot see what the AI extracted for these fields without entering edit mode, which means the "Confirm" button is effectively blind to frame data.

### Fix

Add two read-only rows to the claim view mode block:

```tsx
{
  selectedItem.kind === 'claim' ? (
    <>
      {/* existing Statement, Entities, Evidence blocks */}
      {selectedItem.interpretationFrame ? (
        <div>
          <p className="font-display text-[8px] uppercase tracking-label text-[#777]">Frame</p>
          <p className="mt-1 font-body text-sm text-ink">
            {interpretationFrameLabels[selectedItem.interpretationFrame]}
          </p>
        </div>
      ) : null}
      {selectedItem.isCanonical ? (
        <div>
          <p className="font-display text-[8px] uppercase tracking-label text-[#777]">Canonical</p>
          <p className="mt-1 font-body text-sm text-ink">Yes</p>
        </div>
      ) : null}
    </>
  ) : null
}
```

---

## Medium #2 — `window.confirm()` Used for Canonical Conflict Resolution

**File:** `src/pages/admin/AdminClaimManagerPage.tsx`
**Severity:** Medium (breaks design system consistency, blocks embedded environments)

### What happens

```ts
// AdminClaimManagerPage.tsx lines 141–148
const shouldReplace = window.confirm(
  "Another canonical claim already exists for one of this claim's entities. Replace it?"
)
```

This is the only place in the entire admin UI where `window.confirm()` is used for a consequential action. It blocks the JS thread, doesn't match the design system, and is suppressed in some embedded or headless environments.

### Fix

Replace with the `Dialog` component already used elsewhere in this file. Add state for the conflict dialog and the pending claim:

```tsx
const [canonicalConflictClaimId, setCanonicalConflictClaimId] = useState<string | null>(null)

// In canonicalMutation.mutationFn:
const result = await setClaimCanonical(claim.id, value, forceReplace)
if (result.conflict && !forceReplace) {
  setCanonicalConflictClaimId(claim.id)  // triggers dialog
  return result
}
return result

// Dialog:
<Dialog open={canonicalConflictClaimId !== null} onOpenChange={() => setCanonicalConflictClaimId(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Replace Canonical Claim?</DialogTitle>
      <DialogDescription>
        Another canonical claim already exists for one of this claim's entities. Replace it?
      </DialogDescription>
    </DialogHeader>
    <div className="mt-5 flex justify-end gap-3">
      <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
      <Button onClick={() => {
        if (canonicalConflictClaimId) {
          canonicalMutation.mutate({ claim: { id: canonicalConflictClaimId, ... }, value: true, forceReplace: true })
          setCanonicalConflictClaimId(null)
        }
      }}>
        Replace
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

---

## Medium #3 — "URL Domains" Nav Link Shown to Non-Super-Admins

**File:** `src/components/layout/AdminShell.tsx`
**Severity:** Medium (confusing UX — link visible but leads to error page)

### What happens

`navItems` in `AdminShell.tsx` is a static array defined outside the component. `ADMIN_URL_DOMAINS` is included unconditionally. Non-super-admin editors see the nav link, click it, and get a red error banner: "Super admin access is required." The page correctly protects itself, but the nav item should never be shown to editors.

### Fix

Move nav items that require super_admin into a computed array inside the component, conditioned on `role`:

```tsx
export const AdminShell = () => {
  const { role, signOut, user } = useAuth()

  const navItems = [
    { to: ROUTES.ADMIN_DASHBOARD, label: 'Dashboard', icon: BarChart3 },
    { to: ROUTES.ADMIN_SOURCES, label: 'Sources', icon: BookOpen },
    { to: ROUTES.ADMIN_REVIEW, label: 'Review Queue', icon: GitPullRequestDraft },
    { to: ROUTES.ADMIN_ENTITIES, label: 'Entities', icon: ScrollText },
    { to: ROUTES.ADMIN_CLAIMS, label: 'Claims', icon: FileText },
    { to: ROUTES.ADMIN_RELATIONSHIPS, label: 'Relationships', icon: GitBranch },
    { to: ROUTES.ADMIN_EXPLORATION_NEW, label: 'New Exploration', icon: Compass },
    ...(role === 'super_admin'
      ? [{ to: ROUTES.ADMIN_URL_DOMAINS, label: 'URL Domains', icon: Globe }]
      : []),
    { to: ROUTES.ADMIN_SETTINGS, label: 'Settings', icon: Settings },
  ]
  // rest of component...
}
```

---

## Medium #4 — No Content-Type Validation Before Parsing URL Response

**File:** `supabase/functions/trigger-url-fetch/index.ts`
**Severity:** Medium (silent garbage processing, unclear error for binary content)

### What happens

After a successful HTTP fetch, the function calls `response.text()` and passes the result to `stripHtmlToText`. If the URL serves a PDF, image, or other binary content, `response.text()` decodes binary data as UTF-8, producing garbage. The 200-word threshold may or may not catch this depending on how the binary decodes. The pipeline stage then moves to `chunking_failed` with no useful error message.

### Fix

After the `response.ok` check, validate `Content-Type` before calling `response.text()`:

```ts
const contentType = response.headers.get('content-type') ?? ''
if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
  throw new Error(
    `This URL returned content type "${contentType.split(';')[0].trim()}". Only HTML and plain text are supported.`
  )
}
```

This throw happens before `canUpdateSource = true` (after the B1 fix), so it will return a 400 without setting `chunking_failed`.

---

## Medium #5 — `updateClaimInterpretationFrame` Audit Log Missing Old Value

**File:** `src/lib/api/admin.ts`
**Severity:** Medium (incomplete audit trail)

### What happens

```ts
// admin.ts lines 1536–1538
await insertAdminAuditEvent('update_claim_interpretation_frame', 'claims', claimId, {
  interpretation_frame: frame,
})
```

The old frame value is not recorded. Auditing "what did it change from?" requires joining to claims history or looking at previous audit events, which is not practical.

### Fix

Fetch the current frame before updating, and log both old and new:

```ts
export const updateClaimInterpretationFrame = async (
  claimId: string,
  frame: InterpretationFrame | null
) => {
  const { data: current } = await supabase
    .from('claims')
    .select('interpretation_frame')
    .eq('id', claimId)
    .single()

  const { data, error } = await supabase
    .from('claims')
    .update({ interpretation_frame: frame })
    .eq('id', claimId)
    .select('*')
    .single()

  if (error) throw error

  await insertAdminAuditEvent('update_claim_interpretation_frame', 'claims', claimId, {
    old_frame: current?.interpretation_frame ?? null,
    new_frame: frame,
  })

  return data
}
```

---

## Medium #6 — Domain Format Not Validated on Insert (Allowlist Mismatch Risk)

**File:** `src/lib/api/admin.ts` (`createUrlIngestionDomain`), `src/pages/admin/AdminUrlDomainsPage.tsx`
**Severity:** Medium (silent allowlist mismatch — stored domain never matches)

### What happens

`createUrlIngestionDomain` normalizes to lowercase but does no format validation:

```ts
const normalizedDomain = domain.trim().toLowerCase()
```

An admin entering `https://example.com`, `www.example.com`, or `example.com/path` will have those values stored verbatim. The edge function extracts `url.hostname` (e.g., `"example.com"`) and queries for an exact match. None of those stored formats match, so the allowlist silently never works for that entry. The admin sees the domain listed as "Enabled" but all fetches fail with "Domain is not allowlisted."

### Fix

**In `createUrlIngestionDomain`:** Validate and normalize the domain format before insertion. Strip protocol, www prefix (optionally), and path:

```ts
const normalizeDomain = (raw: string): string | null => {
  const trimmed = raw.trim().toLowerCase()
  // Handle entries that include a protocol
  const withProtocol = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
  try {
    return new URL(withProtocol).hostname
  } catch {
    return null
  }
}

export const createUrlIngestionDomain = async (domain: string) => {
  const normalizedDomain = normalizeDomain(domain)

  if (!normalizedDomain) {
    throw new Error('Invalid domain format. Enter a hostname like "example.com".')
  }
  // ...insert with normalizedDomain
}
```

**In `AdminUrlDomainsPage.tsx`:** Add a placeholder hint:

```tsx
<Input placeholder="example.com" ... />
```

(The placeholder is already there per the current code — ensure it stays.)

---

## Minor #1 — "Other Claims" Section Is Not Collapsible

**File:** `src/pages/entity/EntityDetailPage.tsx`
**Severity:** Minor (spec gap — required behavior missing)

The spec (§9.3) explicitly says: "`interpretation_frame IS NULL` and `is_canonical = false` — shown in a collapsible 'Other claims' section to avoid hiding content that hasn't been categorized yet."

The current `ClaimSection` component has no expand/collapse behavior. At launch, when most claims are unframed (Risk R2 in the spec), the "Other Claims" section will be very long with no way to collapse it.

### Fix

Add a `collapsible` prop to `ClaimSection` and use HTML's native `<details>`/`<summary>` for simplicity:

```tsx
const ClaimSection = ({
  claims, disputed = false, heroFirst = false, title, collapsible = false,
}: { ... collapsible?: boolean }) => {
  if (claims.length === 0) return null

  const content = (
    <div className="overflow-hidden rounded-lg border-0.5 border-black/10 bg-white">
      {claims.map(...)}
    </div>
  )

  if (collapsible) {
    return (
      <details className="space-y-3" open={false}>
        <summary className="cursor-pointer font-display text-[10px] uppercase tracking-label text-ink">
          {title} ({claims.length})
        </summary>
        {content}
      </details>
    )
  }

  return (
    <section className="space-y-3">
      <h3 className="font-display text-[10px] uppercase tracking-label text-ink">{title}</h3>
      {content}
    </section>
  )
}
```

Usage:

```tsx
<ClaimSection claims={otherClaims} title="Other Claims" collapsible />
```

---

## Minor #2 — `dateSortYear` Can Produce Non-Integer Values

**File:** `src/pages/admin/AdminEntityNewPage.tsx`
**Severity:** Minor (DB type error risk for float input)

```ts
// AdminEntityNewPage.tsx line 30
dateSortYear: dateSortYear.trim() ? Number(dateSortYear) : null,
```

The input has `type="number"` which prevents text entry in browsers. However, `type="number"` allows floats (e.g., `1234.5`). If submitted, `Number("1234.5") = 1234.5`, which passed to a Postgres `integer` column will cause a DB error or silent truncation.

The spec says to reuse `parseTimelineSortYear`, which exists at `src/lib/timeline/pinchZoom.ts` and is already used in the timeline dates editor. It validates the value is an integer within an acceptable range.

### Fix

```ts
import { parseTimelineSortYear } from '@/lib/timeline/pinchZoom'

// In the mutation:
dateSortYear: dateSortYear.trim() ? parseTimelineSortYear(dateSortYear) : null,
```

Also change the input to `step="1"` to discourage float entry:

```tsx
<Input type="number" step="1" value={dateSortYear} onChange={...} />
```

---

## Minor #3 — `date_era` Is Free Text Instead of Datalist

**File:** `src/pages/admin/AdminEntityNewPage.tsx`
**Severity:** Minor (UX inconsistency)

The era field in the timeline dates editor (`AdminEntityManagerPage`) uses a `datalist` with `TIMELINE_ERAS` suggestions. The new entity form uses a plain `<Input>` with no suggestions. An admin creating an entity manually won't know what era values are valid.

### Fix

Match the pattern from the timeline dates editor:

```tsx
<Input list="entity-new-era-options" value={dateEra} onChange={...} />
<datalist id="entity-new-era-options">
  {TIMELINE_ERAS.map((era) => (
    <option key={era} value={era} />
  ))}
</datalist>
```

Import `TIMELINE_ERAS` from wherever it's defined in the timeline module.

---

## Minor #4 — `isObjectRecord` Doesn't Exclude Arrays

**File:** `src/lib/api/admin.ts` (line ~2356)
**Severity:** Minor (latent type inconsistency)

```ts
const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
  // Missing: && !Array.isArray(value)
}
```

The earlier `isRecord` at line ~445 correctly excludes arrays. `isObjectRecord` does not. In practice the downstream property checks (`typeof value.conflict === 'boolean'`, etc.) would fail for arrays, so this doesn't cause runtime bugs — but it's a latent inconsistency that could bite if the function is reused.

### Fix

```ts
const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
```

---

## Minor #5 — `AdminUrlDomainsPage` Missing Loading/Error State

**File:** `src/pages/admin/AdminUrlDomainsPage.tsx`
**Severity:** Minor (UX gaps)

- When `domainsQuery.isLoading`, the domain list section falls through to "No domains configured." An admin could mistake this for an empty list.
- When `domainsQuery.isError`, nothing is shown — the list section renders an empty container with no feedback.

### Fix

Add explicit loading and error states:

```tsx
{domainsQuery.isLoading ? (
  <p className="p-4 font-body text-sm text-[#777]">Loading domains...</p>
) : domainsQuery.isError ? (
  <p className="p-4 font-body text-sm text-terracotta-dark">
    Failed to load domains. Refresh to try again.
  </p>
) : (domainsQuery.data ?? []).length === 0 ? (
  <p className="p-4 font-body text-sm text-[#777]">No domains configured.</p>
) : (
  (domainsQuery.data ?? []).map((row) => ...)
)}
```

---

## Minor #6 — `ROUTES` Missing New Page Entries

**File:** `src/constants/routes.ts`
**Severity:** Minor (maintenance consistency)

`ROUTES` does not export `ADMIN_ENTITY_NEW` or `ADMIN_CLAIM_NEW`. The manager pages use hardcoded strings:

```tsx
// AdminClaimManagerPage.tsx line 193
<Link to="/admin/claims/new">
// AdminEntityManagerPage.tsx
<Link to="/admin/entities/new">
```

### Fix

```ts
export const ROUTES = {
  // ...existing entries...
  ADMIN_ENTITY_NEW: '/admin/entities/new',
  ADMIN_CLAIM_NEW: '/admin/claims/new',
} as const
```

Then replace the hardcoded strings with `ROUTES.ADMIN_ENTITY_NEW` and `ROUTES.ADMIN_CLAIM_NEW` in the manager pages.

---

## Minor #7 — `InterpretationFrame` Defined in Two Places

**File:** `src/types/domain.ts`, `src/lib/api/admin.ts`
**Severity:** Minor (maintenance — manual sync required when DB enum changes)

`domain.ts` defines `InterpretationFrame` as a manual union type (lines 25–31). `admin.ts` re-exports it as `Enums<'interpretation_frame'>` from generated DB types. If enum values change in Postgres and `database.ts` is regenerated, `domain.ts` must be manually updated — there's no compiler error if it drifts.

### Fix

In `domain.ts`, replace the manual union with a re-export from the generated types:

```ts
// domain.ts
export type { InterpretationFrame } from '@/lib/api/admin'
```

Or in `admin.ts`, ensure the export is explicit so it can be imported from there by UI components that currently import from `domain.ts`.

---

## Minor #8 — `AdminClaimNewPage` Entity Search Has No Loading Indicator

**File:** `src/pages/admin/AdminClaimNewPage.tsx`
**Severity:** Minor (confusing UX during search)

When `entitySearch.trim().length > 1`, the dropdown renders the results list immediately. While `entityResultsQuery.isLoading` is true, the list renders empty (no results). An admin cannot distinguish "no matching entities" from "still searching."

### Fix

Add a loading state inside the dropdown:

```tsx
{entitySearch.trim().length > 1 ? (
  <div className="mt-2 max-h-52 overflow-y-auto rounded border border-0.5 border-black/[0.09]">
    {entityResultsQuery.isLoading ? (
      <p className="px-3 py-2 font-body text-sm text-[#777]">Searching...</p>
    ) : (entityResultsQuery.data ?? []).length === 0 ? (
      <p className="px-3 py-2 font-body text-sm text-[#777]">No matching entities.</p>
    ) : (
      (entityResultsQuery.data ?? []).map((entity) => ...)
    )}
  </div>
) : null}
```

---

## Minor #9 — `reviewExtractionItem` Edit Path Has Same Orphan Issue as Bug #4

**File:** `src/lib/api/admin.ts`
**Severity:** Minor (same pattern as Bug #4, different path)

In `reviewExtractionItem` (lines 2192–2199), if `setClaimCanonical` returns `{ conflict: true }` in the edit-review path:

```ts
if (result.conflict) {
  throw new Error('Claim was created, but another canonical claim already exists for this entity.')
}
```

The claim was already created at this point. The throw means the UI shows an error, but the DB has a new claim with `is_canonical = false` — the admin intended it to be canonical but it isn't, and there's no conflict resolution dialog offered.

### Fix

Instead of throwing, return the created claim data with a `canonicalConflict` flag and surface a conflict message in the panel's success callback without treating it as a failure:

```ts
if (result.conflict) {
  // Don't throw — claim was created, just not set as canonical
  // The panel can show an informational message
  return { ...data, canonicalConflict: true }
}
```

Handle this in the `reviewMutation.onSuccess` callback in `ExtractionReviewPanel.tsx` by showing a non-error notice: "Claim created. Another canonical claim exists for this entity — set canonical from the claim manager."

---

## Minor #10 — No Download Size Cap for URL Fetches

**File:** `supabase/functions/trigger-url-fetch/index.ts`
**Severity:** Minor (memory risk for large pages)

`response.text()` loads the entire HTTP response body into memory. A 100MB HTML page would be fully buffered. Supabase edge functions run in Deno with memory constraints, and large pages could exhaust the function's memory.

### Fix

Use `response.body` streaming with a byte limit:

```ts
const MAX_BYTES = 1_500_000 // 1.5MB

const reader = response.body?.getReader()
if (!reader) throw new Error('Response body is not readable.')

const chunks: Uint8Array[] = []
let totalBytes = 0

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  totalBytes += value.byteLength
  if (totalBytes > MAX_BYTES) {
    reader.cancel()
    throw new Error(
      'This URL returned too much content (over 1.5MB). Consider a more specific URL.'
    )
  }
  chunks.push(value)
}

const html = new TextDecoder().decode(
  chunks.reduce((acc, chunk) => {
    const merged = new Uint8Array(acc.byteLength + chunk.byteLength)
    merged.set(acc)
    merged.set(chunk, acc.byteLength)
    return merged
  }, new Uint8Array())
)
```

---

## Minor #11 — `getAdminSourceListRows` Hardcodes `null` for New Source Columns

**File:** `src/lib/api/admin.ts`
**Severity:** Minor (category column missing from list view)

The `get_admin_source_list_rows` RPC function was not updated to return `category`, `crawl_date`, `license`, `rights_notes`, `attribution`. The mapping function hardcodes these as `null`. Admins cannot see category from the source list and cannot filter by it. Detail page shows everything correctly.

This is acceptable for initial launch since category editing is available on the detail page. Document this as a known gap or update the RPC to include the column.

---

## Minor #12 — No New Tests for Phase 2 Features

**Files:** `src/__tests__/lib/admin.test.ts`, `src/__tests__/lib/reviewUtils.test.ts`
**Severity:** Minor (spec gap — no programmatic test coverage)

The spec (§11.1–11.4) described a thorough testing plan. Existing test files were updated for pre-existing helpers only. Zero new tests were added for Phase 2 features:

- `createAdminEntity` / `createAdminClaim` / `updateClaimInterpretationFrame` / `setClaimCanonical`
- `getClaimsForEntity` with `includeDisputed: true`
- The edge function (allowlist check, chunking, failure modes)
- `ClaimSection` rendering / frame grouping logic

This is a future investment — not a blocker for launch, but the confidence level in the feature is lower without it.

---

## Summary Table

| ID  | File(s)                               | Severity | Issue                                                                                                                           |
| --- | ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Edge function + AdminSourceDetailPage | **Bug**  | URL fetch failure → `chunking_failed` → Fetch URL button disappears; edge function rejects `chunking_failed` as retry stage too |
| B2  | EntityDetailPage                      | **Bug**  | `disputed_alternative` framed published claims invisible — fall through all section filters                                     |
| B3  | AdminEntityNewPage                    | **Bug**  | Draft entity creation redirects to `/entity/slug` → "Entity Not Found"                                                          |
| B4  | admin.ts (`createAdminClaim`)         | **Bug**  | Race condition: claim inserted before canonical conflict confirmed; throws leaves orphaned claim in DB                          |
| B5  | ExtractionReviewPanel + admin.ts      | **Bug**  | `confirm` action never applies `interpretationFrame` or `isCanonical` to created claim                                          |
| M1  | ExtractionReviewPanel                 | Medium   | View mode doesn't display `interpretationFrame` or `isCanonical` for claim items                                                |
| M2  | AdminClaimManagerPage                 | Medium   | `window.confirm()` used for canonical conflict — should use Dialog component                                                    |
| M3  | AdminShell                            | Medium   | "URL Domains" nav link shown to non-super-admins (leads to error page)                                                          |
| M4  | Edge function                         | Medium   | No Content-Type check — binary URLs produce garbage chunked text                                                                |
| M5  | admin.ts                              | Medium   | `updateClaimInterpretationFrame` audit log missing old frame value                                                              |
| M6  | admin.ts + AdminUrlDomainsPage        | Medium   | Domain insert accepts `https://example.com` format — stored value never matches edge function's `url.hostname` check            |
| S1  | EntityDetailPage                      | Minor    | "Other Claims" section not collapsible (spec §9.3 requires it)                                                                  |
| S2  | AdminEntityNewPage                    | Minor    | `dateSortYear` uses `Number()` — allows float input; should use `parseTimelineSortYear`                                         |
| S3  | AdminEntityNewPage                    | Minor    | `date_era` is plain text input; should use datalist with `TIMELINE_ERAS`                                                        |
| S4  | admin.ts                              | Minor    | `isObjectRecord` at line ~2356 doesn't exclude arrays (latent inconsistency with `isRecord`)                                    |
| S5  | AdminUrlDomainsPage                   | Minor    | No loading/error state for `domainsQuery`; empty list shows while loading                                                       |
| S6  | routes.ts                             | Minor    | `ROUTES` missing `ADMIN_ENTITY_NEW` and `ADMIN_CLAIM_NEW` entries                                                               |
| S7  | domain.ts + admin.ts                  | Minor    | `InterpretationFrame` type defined in two places; manual sync required on DB enum changes                                       |
| S8  | AdminClaimNewPage                     | Minor    | Entity search shows no loading state — dropdown appears empty while fetching                                                    |
| S9  | admin.ts (reviewExtractionItem)       | Minor    | Edit path has same canonical orphan pattern as B4 — should return conflict info rather than throw                               |
| S10 | Edge function                         | Minor    | No download size cap — large pages fully buffered in memory                                                                     |
| S11 | admin.ts                              | Minor    | `getAdminSourceListRows` hardcodes `null` for `category` and other new source columns                                           |
| S12 | Tests                                 | Minor    | Zero new tests for Phase 2 features                                                                                             |

---

## Battle Plan

Work through these in order. Each step is self-contained unless noted.

---

### Step 1 — Fix the URL Fetch Dead-End (B1) — ~45 min

**Files:** `supabase/functions/trigger-url-fetch/index.ts`, `src/pages/admin/AdminSourceDetailPage.tsx`

This is the highest-impact bug. Work in this order:

1. In `index.ts`, restructure the top of `Deno.serve` so that:
   - Source record read happens first (no `canUpdateSource` yet)
   - All pre-validation (format, stage, url, allowlist) returns HTTP 400 responses directly without touching pipeline stage
   - `canUpdateSource = true` is only set after the allowlist check passes
   - Add `'chunking_failed'` as an accepted starting stage in the validation check
   - Also add the Content-Type check (M4) here at the same time — the check goes after `response.ok` and before `response.text()`

2. In `AdminSourceDetailPage.tsx`, update the Fetch URL button condition to also show for `chunking_failed` URL sources.

3. Deploy the updated edge function to Supabase.

4. Manually test: create a URL source, click "Fetch URL" with a non-allowlisted domain, verify the stage stays at `uploaded`, verify the error is shown. Then add the domain, retry, verify it works.

---

### Step 2 — Fix the `disputed_alternative` Invisible Claims (B2) — ~20 min

**File:** `src/pages/entity/EntityDetailPage.tsx`

1. Add a `ClaimSection` call for `disputed_alternative` between "Literary & Artistic" and "Other Claims":

```tsx
<ClaimSection
  claims={claimsByFrame('disputed_alternative')}
  disputed
  title="Disputed Alternative Readings"
/>
```

2. The `disputed` prop gives it the red disclaimer, which is appropriate since these are claims presenting alternative interpretations. If you want a distinct label ("These are framed as disputed alternative readings, not curator-rejected content"), add a `disclaimer` prop to `ClaimSection` and render it instead of the generic `disputed` message.

3. Verify with a test entity that has a published claim with `interpretation_frame = 'disputed_alternative'` — it should now appear in its own section.

---

### Step 3 — Fix AdminEntityNewPage Redirect (B3) — ~5 min

**File:** `src/pages/admin/AdminEntityNewPage.tsx`

Change the `onSuccess` redirect from:

```ts
navigate(`/entity/${entity.slug}`)
```

To:

```ts
navigate(`/admin/entities?search=${encodeURIComponent(entity.name)}`)
```

This lands the admin on the entity manager with the newly created entity visible in search results. They can then navigate to it from there.

---

### Step 4 — Fix the `confirm` Path for Frame/Canonical (B5) — ~60 min

**Files:** `src/components/admin/ExtractionReviewPanel.tsx`, `src/lib/api/admin.ts`

This requires coordinated changes across two files:

1. In `admin.ts`, add a `confirmClaimMeta` optional field to the review input type:

```ts
interface ReviewExtractionItemInput {
  // ...existing fields
  confirmClaimMeta?: {
    interpretationFrame: InterpretationFrame | null
    isCanonical: boolean
  }
}
```

2. In `admin.ts` `reviewExtractionItem`, add a `confirm` post-processing block after the existing `edit` block.

3. In `ExtractionReviewPanel.tsx`, update `submitConfirm` to pass `confirmClaimMeta` from the selected claim item.

4. While in the file, also add the view-mode display for `interpretationFrame` and `isCanonical` (M1) — it's the same file and the context is identical.

---

### Step 5 — Show Frame/Canonical in View Mode (M1) — ~15 min

**File:** `src/components/admin/ExtractionReviewPanel.tsx`

If not done in Step 4, add read-only frame and canonical display to the claim view mode section. Add below the "Evidence" block for claim items. Keep the styling consistent with other label/value pairs in that section.

---

### Step 6 — Replace `window.confirm` with Dialog (M2) — ~30 min

**File:** `src/pages/admin/AdminClaimManagerPage.tsx`

1. Add `useState` for the conflict dialog: `const [canonicalConflictTarget, setCanonicalConflictTarget] = useState<AdminClaimListRow | null>(null)`
2. Refactor `canonicalMutation.mutationFn` to set state instead of calling `window.confirm`
3. Add the `<Dialog>` at the bottom of the JSX
4. Wire the "Replace" button in the dialog to fire `canonicalMutation` with `forceReplace: true`

---

### Step 7 — Hide URL Domains Nav from Non-Super-Admins (M3) — ~10 min

**File:** `src/components/layout/AdminShell.tsx`

Move `navItems` inside the component body (so it has access to `role` from `useAuth()`), conditionalize the URL Domains entry on `role === 'super_admin'`. No other logic changes needed.

---

### Step 8 — Fix Domain Format Validation (M6) — ~20 min

**File:** `src/lib/api/admin.ts`

Add a `normalizeDomain` utility function that uses `new URL()` to extract the hostname. Replace the current `domain.trim().toLowerCase()` normalization with the URL-based one. Add a validation throw if the input can't be parsed. Test with: `https://example.com` (should normalize to `example.com`), `example.com/path` (should normalize to `example.com`), `not-a-domain` (should throw).

---

### Step 9 — Audit Log Old Frame Value (M5) — ~15 min

**File:** `src/lib/api/admin.ts` (`updateClaimInterpretationFrame`)

Add a pre-fetch of the current `interpretation_frame` before the update, then log `{ old_frame, new_frame }` in the audit event. Straightforward one-function change.

---

### Step 10 — Make "Other Claims" Collapsible (S1) — ~20 min

**File:** `src/pages/entity/EntityDetailPage.tsx`

Add `collapsible?: boolean` prop to `ClaimSection`. Implement with `<details>`/`<summary>` — no state needed, no JS dependency. Pass `collapsible` to the "Other Claims" section. Test that the section starts collapsed and opens on click.

---

### Step 11 — Fix `dateSortYear` Validation (S2) — ~10 min

**File:** `src/pages/admin/AdminEntityNewPage.tsx`

Import `parseTimelineSortYear` from the timeline module. Replace `Number(dateSortYear)` with it. Add `step="1"` to the number input. Verify that entering `1234.5` either errors gracefully or rounds to `1234`.

---

### Step 12 — Add Era Datalist (S3) — ~10 min

**File:** `src/pages/admin/AdminEntityNewPage.tsx`

Import `TIMELINE_ERAS` from wherever it's defined. Add `list="entity-new-era-options"` to the era `<Input>` and add the `<datalist>` below it. Match the pattern from the timeline dates editor exactly.

---

### Step 13 — Fix `isObjectRecord` Array Exclusion (S4) — ~5 min

**File:** `src/lib/api/admin.ts`

Add `&& !Array.isArray(value)` to the `isObjectRecord` guard. One-line change.

---

### Step 14 — Add Loading/Error States to AdminUrlDomainsPage (S5) — ~15 min

**File:** `src/pages/admin/AdminUrlDomainsPage.tsx`

Replace the current `{!domainsQuery.isLoading && ... length === 0 ? 'No domains.' : null}` pattern with a proper loading → error → empty → list conditional render.

---

### Step 15 — Add Missing ROUTES Entries (S6) — ~10 min

**Files:** `src/constants/routes.ts`, `src/pages/admin/AdminClaimManagerPage.tsx`, `src/pages/admin/AdminEntityManagerPage.tsx`

Add `ADMIN_ENTITY_NEW` and `ADMIN_CLAIM_NEW` to `ROUTES`. Update the two manager pages to use the constants instead of hardcoded strings.

---

### Step 16 — Consolidate `InterpretationFrame` Type (S7) — ~10 min

**Files:** `src/types/domain.ts`, `src/lib/api/admin.ts`

In `domain.ts`, replace the manual union with `export type { InterpretationFrame } from '@/lib/api/admin'` (or from the generated types path, whichever is cleaner). Update any imports in UI components that reference the old `domain.ts` definition — they should continue to work if the re-export is in place.

---

### Step 17 — Add Entity Search Loading State (S8) — ~10 min

**File:** `src/pages/admin/AdminClaimNewPage.tsx`

Add an `entityResultsQuery.isLoading` check inside the results dropdown to show a "Searching..." placeholder instead of an empty list.

---

### Step 18 — Fix reviewExtractionItem Canonical Orphan (S9) — ~15 min

**File:** `src/lib/api/admin.ts`

In the `edit` path post-processing, replace the `throw` on canonical conflict with a return value that includes `{ canonicalConflict: true }`. Update `ExtractionReviewPanel.tsx` `reviewMutation.onSuccess` to check for this flag and show an informational (non-error) notice rather than treating it as a failure.

---

### Step 19 — Add Download Size Cap (S10) — ~20 min

**File:** `supabase/functions/trigger-url-fetch/index.ts`

Replace `response.text()` with streaming + byte-limit logic. Set the cap at 1.5MB. Redeploy the function after this change (combine with Step 1 if doing both in one session).

---

### Steps 20–21 — Cleanup (S4, S11) — ~15 min total

- Fix `isObjectRecord` (already covered in Step 13)
- Document the `getAdminSourceListRows` category gap in a code comment (or update the RPC — lower priority, acceptable to defer)

---

### After All Fixes

1. Run the TypeScript build: `npm run build` — verify no type errors from the new interface fields
2. Run existing test suite: `npm test` — verify no regressions in `admin.test.ts` and `reviewUtils.test.ts`
3. Manual smoke test on the running app:
   - Create a URL source → add domain → click "Fetch URL" → verify advances to `chunking`
   - Create entity with draft status → verify lands on admin entities list
   - Navigate to an entity with `disputed_alternative` framed claims → verify they appear
   - As super_admin, confirm a claim extraction item with a frame set → verify frame is saved
   - As editor, verify URL Domains is absent from the admin nav

---
