# Phase 4 Community Feedback — Round 3 Code Review

**Branch:** `community-feedback`
**Review date:** 2026-06-14
**Scope:** Full diff of `community-feedback` vs `main` — 7-angle multi-agent review with verification pass.

---

## Methodology

Seven independent finder agents ran in parallel (line-by-line scan, removed-behavior audit, cross-file trace, reuse, simplification, efficiency, altitude), each surfacing up to 6 candidates. All candidates were deduplicated and run through a 1-vote verifier. REFUTED findings were dropped.

**Verification results:**
- VoteWidget onError optimisticVote reset — REFUTED (onSettled always fires after onError in TQ v5)
- EntityImagesEditor data-loss — REFUTED (RPC fix is complete; SQL SELECTs image_url/hero_image_url)
- getNextPageParam off-by-one — REFUTED (sentinel math is correct for all boundary cases)
- target_id URL persistence — REFUTED ("Target filter active" badge is clearly visible)
- OwnCommentCard stale draft — REFUTED (onSuccess calls setDraft with server value)

---

## Severity Legend

- **HIGH** — Incorrect behavior, data corruption risk, or security/privacy gap.
- **MEDIUM** — Misleading UX, latent data hazard, or meaningful performance cost.
- **LOW** — Maintainability, cleanup, or minor efficiency issue.

---

## Findings

### 1. HIGH — FlagButton: Duplicate-Key Error Leaves Dialog Open With Submit Re-Enabled

**File:** `src/components/community/FlagButton.tsx`, line 73

The `onError` handler detects duplicate-key errors and sets `submittedFlag = true`, but never calls `setOpen(false)`. The dialog stays open. Once the mutation settles, `flagMutation.isPending` returns to `false`. The submit button's `disabled` check is:

```tsx
disabled={flagMutation.isPending || notes.length > 500}
```

It does not check `flagged` or `submittedFlag`. The button is fully clickable again inside the open dialog.

**Failure scenario:** User submits a flag in two browser tabs on the same content. The second tab gets a duplicate-key error. `onError` fires — dialog stays open, error message shown, `submittedFlag = true`. Mutation settles. Submit button re-enables. Each click fires another mutation that immediately errors again — an indefinite error loop until the user manually dismisses the dialog.

**Fix:**
```tsx
onError: (error) => {
  if (error instanceof Error && error.message.includes('duplicate key')) {
    setSubmittedFlag(true)
    setOpen(false)   // ← add this
  }
},
```
Or add `|| flagged` to the Submit button's `disabled` condition.

---

### 2. HIGH — getClaimGraph: directEntityCount Inflated by Unpublished Entities

**File:** `src/lib/api/claims.ts`, line 89

`directEntityIds` is built from `claim_entities` with no status filter — it includes published, draft, and archived entities. `directEntityCount` is set to `directEntityIds.length` (the raw, unfiltered count). The final entity fetch applies `.eq('status', 'published')`, so unpublished entities are silently dropped from the graph. `truncatedDirectEntityCount` inherits the same inflation.

```ts
const directEntityIds = Array.from(new Set(entityLinks.map((link) => link.entity_id)))
// ^ includes unpublished

return {
  directEntityCount: directEntityIds.length,  // ← inflated
  truncatedDirectEntityCount: Math.max(0, directEntityIds.length - cappedDirectEntityIds.length),
  // ^ also inflated
}
```

**Failure scenario:** Claim links to 12 entities, 3 of which are drafts. The ClaimMiniGraph header renders "Showing 10 of 12 direct entities" but only 9 nodes appear (the 1 draft that made the top-10 cap is filtered out). The collapse/expand threshold (`directEntityCount > 10`) fires even though fewer than 10 entities actually render — the graph hides by default when it would display fine expanded.

**Fix:** Filter `directEntityIds` to published entities before computing counts, or base `directEntityCount` and `truncatedDirectEntityCount` on the published set returned by the final entity fetch.

---

### 3. HIGH — Flag Channel Change: Claim/Entity Flags Now Route to a Different Table With No Migration or Notice

**File:** `src/pages/admin/AdminSuggestionManagerPage.tsx`, line 184

Before this branch, clicking "Flag this claim" / "Flag this entity" inserted a row into the `suggestions` table (`type='flag_claim'` / `type='flag_entity'`), visible in `/admin/suggestions`. This branch replaces that path with `FlagButton` → `content_flags` → `/admin/flags`. The suggestions queue had its filter options removed:

```tsx
- <option value="flag_claim">Flag claim</option>
- <option value="flag_entity">Flag entity</option>
```

No migration backfills existing `suggestions` rows into `content_flags`. No banner or redirect notifies admins of the channel change.

**Failure scenario:** An admin's daily workflow checks `/admin/suggestions` for incoming claim flags. After this branch deploys, that queue receives zero new entries for claim or entity flags — they all go to `/admin/flags` instead. The admin never discovers this unless they notice the new nav item. Pre-existing `flag_claim`/`flag_entity` rows in `suggestions` have no filter path to find them and no bulk-resolve UI — they are permanently stranded unless deleted via SQL.

**Fix:**
1. Add a SQL migration that moves or marks existing `flag_claim`/`flag_entity` suggestion rows (e.g., `UPDATE suggestions SET status='resolved' WHERE type IN ('flag_claim','flag_entity')`).
2. Add a visible note or one-time toast in `AdminSuggestionManagerPage` pointing to the new flags queue.

---

### 4. MEDIUM — submitComment: Parent Lookup Uses .single() and Throws Raw PostgREST Error on Missing/RLS-Hidden Parent

**File:** `src/lib/api/community.ts`, line 181

```ts
const { data: parent, error: parentError } = await supabase
  .from('comments')
  .select('parent_id, target_id, target_type')
  .eq('id', input.parentId)
  .single()   // ← throws PGRST116 if row is hidden or deleted
```

RLS hides rejected comments from non-author users. If the parent was rejected or deleted between when the user loaded the page and when they clicked Submit, `.single()` finds 0 rows and throws the raw PostgREST "JSON object requested, multiple (or no) rows returned" error directly to the UI.

**Failure scenario:** User opens a claim page, starts composing a reply to a community note. Admin rejects that note in another session. User clicks "Submit for review" — sees a raw `PGRST116` DB error instead of a clean message like "The parent comment is no longer available."

**Fix:**
```ts
.maybeSingle()

if (parentError) throw parentError
if (!parent) throw new Error('The parent comment could not be found.')
```

---

### 5. MEDIUM — moderateFlag Stamps resolved_at/resolved_by on Dismissed Flags

**File:** `src/lib/api/admin.ts`, line 1094

`moderateFlag` is the shared function for both `resolveFlag` and `dismissFlag`. It unconditionally writes `resolved_at` and `resolved_by` regardless of which action was taken:

```ts
.update({
  resolved_at: new Date().toISOString(),
  resolved_by: await getCurrentAdminUserId(),
  status,  // either 'resolved' or 'dismissed'
})
```

No current query in the codebase uses `resolved_at IS NOT NULL` to mean "resolved (not dismissed)" — all filtering goes through the `status` enum. However, the column name is semantically wrong for dismissals, and any future dashboard, audit query, or analytics that uses `resolved_at IS NOT NULL` will silently treat dismissed flags as resolved.

**Fix:** Rename the DB column to `actioned_at` / `actioned_by`, or add a conditional in `moderateFlag` that only writes the timestamp for `'resolved'` status and writes to a separate `dismissed_at` / `dismissed_by` for `'dismissed'`.

---

### 6. MEDIUM — VoteWidget Invalidates All Admin Queries on Every Public Vote

**File:** `src/components/community/VoteWidget.tsx`, line 161

```ts
onSettled: async () => {
  await queryClient.invalidateQueries({ queryKey: scoreQueryKey })
  await queryClient.invalidateQueries({ queryKey: voteQueryKey })
  await queryClient.invalidateQueries({ queryKey: ['admin'] })  // ← very broad
  setOptimisticScore(null)
  setOptimisticVote(undefined)
},
```

`invalidateQueries({ queryKey: ['admin'] })` marks every admin query stale and triggers background refetches if any admin component is mounted. `VoteWidget` is rendered on `EntityDetailPage`, `ClaimDetailPage`, `SourceDetailPage`, and `GraphSidePanel` — all public pages.

**Failure scenario:** A power user votes on 10 entities in quick succession. Each vote's `onSettled` schedules a full refetch of all admin queries. If the admin has `/admin/entities` open in a background tab, this triggers 10 re-fetches of the 50-row entity RPC plus signal summaries — 30+ unnecessary DB queries from one user's browsing session. On a busy day with many concurrent users voting, this compounds significantly.

**Fix:** Narrow the invalidation to only the specific signal query for the voted target, or move admin signal refreshes to a targeted invalidation by target type and ID instead of the broad `['admin']` prefix.

---

### 7. MEDIUM — getClaimGraph Fetches Relationships and Entity Names Sequentially When Both Can Run in Parallel

**File:** `src/lib/api/claims.ts`, line 100

After fetching `directEntityIds` in step 1, the function runs two independent queries in sequence:

```ts
// Step 2: depends only on directEntityIds
const { data: directRelationships } = await supabase.from('relationships')...
// Step 3: also depends only on directEntityIds, independent of step 2
const { data: directEntities } = await supabase.from('entities').select('id, name')...
```

Steps 2 and 3 are independent. Running them in sequence adds one unnecessary round-trip (~50–60ms) to every claim graph load.

**Fix:**
```ts
const [{ data: directRelationships, error: relError }, { data: directEntities, error: entError }]
  = await Promise.all([
    supabase.from('relationships').select('*').eq('status', 'active').or(filter).order('weight', { ascending: false }).limit(300),
    supabase.from('entities').select('id, name').in('id', directEntityIds).eq('status', 'published'),
  ])
```

---

### 8. MEDIUM — Comment Moderation Triggers Full Admin Entity/Claim Table Refetch

**File:** `src/pages/admin/AdminCommentQueuePage.tsx`, line 123

```ts
if (affectedTargetTypes.has('claim')) {
  await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
}
if (affectedTargetTypes.has('entity')) {
  await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
}
```

Approving or rejecting a comment invalidates the full admin entity/claim list RPCs (50-row paginated queries + signal summaries) to update the `pendingCommentCount` badge. These are expensive queries that return rich, multi-column data — not just signal counts.

**Failure scenario:** Admin bulk-approves 20 pending comments across 10 claims. `actionMutation.onSuccess` fires for each, calling `invalidateComments` 20 times. Each call targeting a claim schedules a re-fetch of the 50-row admin claims RPC. This generates 20+ unnecessary full-table DB queries that only change a count badge, not actual claim content.

**Fix:** Use `queryClient.setQueryData` to surgically update only the `pendingCommentCount` field for the affected target IDs in the cached admin entity/claim pages, instead of invalidating the entire query.

---

### 9. LOW — getErrorMessage Defined Independently in 16 Files

**Files:** `src/lib/api/community.ts`, `src/components/admin/FlagDetailPanel.tsx`, `src/pages/admin/AdminFlagQueuePage.tsx`, `src/pages/admin/AdminCommentQueuePage.tsx`, `src/components/community/CommentSection.tsx`, `src/components/community/CommentForm.tsx`, and 10+ others.

Every file that needs to display an error message defines its own local:
```ts
const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '<fallback string>'
```

No shared export exists in `src/lib/format.ts` or `src/lib/utils.ts`.

**Cost:** A change to the error-handling pattern (e.g., stripping Postgres error codes, adding Sentry reporting, or normalizing network errors) requires coordinated edits across 16 files.

**Fix:** Add to `src/lib/format.ts`:
```ts
export const getErrorMessage = (error: unknown, fallback = 'An unexpected error occurred.') =>
  error instanceof Error ? error.message : fallback
```

---

### 10. LOW — getTargetAdminQueryKeys Defined Three Times With Diverging Content

**Files:** `src/components/community/FlagButton.tsx:39`, `src/components/admin/FlagDetailPanel.tsx:33`, `src/components/community/VoteWidget.tsx` (equivalent inline logic)

The mapping from `FlagTargetType` to React Query keys is copy-pasted in three places. `FlagButton` and `FlagDetailPanel` are identical; `VoteWidget` omits the `comment` branch (correct, since comments can't be voted). If a query key is renamed, all three files need updates.

**Failure scenario:** Developer renames `['admin', 'source-list']` to `['admin', 'sources-list']`. Updates `FlagDetailPanel` but misses `FlagButton`. Flag submissions no longer invalidate the source list query — admins see stale flag counts on sources with no error.

**Fix:** Export a shared `getTargetAdminQueryKeys(targetType: FlagTargetType)` from `src/lib/api/community.ts` or a new `src/lib/queryKeys.ts` and import it in all three consumers.

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | HIGH | `FlagButton.tsx:73` | Duplicate-key error leaves dialog open; Submit re-enabled |
| 2 | HIGH | `claims.ts:89` | `directEntityCount` includes unpublished entities |
| 3 | HIGH | `AdminSuggestionManagerPage.tsx:184` | Flag channel changed with no migration or admin notice |
| 4 | MEDIUM | `community.ts:181` | `.single()` throws raw DB error for hidden/deleted parent |
| 5 | MEDIUM | `admin.ts:1094` | `resolved_at` stamped on dismissed flags |
| 6 | MEDIUM | `VoteWidget.tsx:161` | `['admin']` broad invalidation on every public vote |
| 7 | MEDIUM | `claims.ts:100` | Sequential fetches in getClaimGraph (could be parallel) |
| 8 | MEDIUM | `AdminCommentQueuePage.tsx:123` | Comment moderation triggers full admin table refetch |
| 9 | LOW | 16 files | `getErrorMessage` defined locally in every consumer |
| 10 | LOW | 3 files | `getTargetAdminQueryKeys` triplicated |

---

## Priority Recommendation

Fix **#1 and #3** before any public testing — they are active UX breaks or silent workflow failures. Fix **#2** before the graph feature gets broad use, as the count mismatch will confuse users. **#4 and #5** are pre-launch hardening. **#6–#8** become important under real traffic. **#9–#10** can be batched as a cleanup pass.
