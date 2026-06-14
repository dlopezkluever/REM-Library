# Phase 4 Community Feedback - Verified Audit and Fix Guide

**Branch:** `community-feedback`  
**Audit date:** 2026-06-13  
**Verification date:** 2026-06-13  
**Scope:** Phase 4 implementation against `_docs/phases/phase-4-community-feedback-and-nice-to-have-spec-dev-plan.md`  
**Build check:** `npm run build` passes.

---

## Severity Legend

- **CRITICAL** - Security/privacy leak or feature behavior that defeats the Phase 4 safety model.
- **HIGH** - Incorrect permissions, broken required behavior, or admin tool behavior that can produce wrong decisions.
- **MEDIUM** - Spec deviation, misleading UX, missing guardrail, or scalability issue that should be fixed before broad use.
- **LOW** - Polish, accessibility, type-safety, or maintainability issue that can be batched after the higher-risk fixes.

---

## Audit Notes

This document replaces the first-pass audit. I re-checked the listed concerns directly against the migration, API layer, components, pages, routing, and admin navigation.

Confirmed false positives removed from the first-pass audit:

- `comments.updated_at` does have a trigger: `comments_set_updated_at` in `supabase/migrations/20260613040000_phase4_community.sql`.
- `get_review_queue_signals()` does not obviously double-count through duplicate source anchors because `source_claims` and `source_entities` are already `distinct`.
- `FlagButton` does translate duplicate-key errors in the UI. The service still leaks raw DB errors, but the user-facing component handles the common duplicate case.
- `VoteWidget` awaits query invalidation before clearing local optimistic state, so the "flash back to stale value" concern is not strong enough to keep as a fix item.

---

## Verified Fix Items

### 1. CRITICAL - Raw Vote Rows Are Publicly Readable

**Location:** `supabase/migrations/20260613040000_phase4_community.sql`

The migration creates:

```sql
create policy "votes public read"
  on public.content_votes for select
  using (true);
```

This exposes raw `content_votes` rows, including `user_id`, `target_type`, `target_id`, and `value`, to anonymous users. The Phase 4 spec explicitly says vote aggregates should be public via `community_scores`, not raw per-user vote records.

**Why it matters:** A visitor can reconstruct a user's voting history and link user UUIDs to controversial claims/sources/entities. This is a privacy leak and unnecessary for the UI.

**Fix approach:**

- Drop `"votes public read"`.
- Add a self-read policy for authenticated users to read only their own vote:
  `for select to authenticated using (user_id = auth.uid())`.
- Optionally add an admin read policy using `public.is_admin()`.
- Keep `community_scores` public for aggregate counts.
- Re-test `getCommunityScore()` anonymously and `getUserVote()` as an authenticated user.

---

### 2. HIGH - Admin Review Queue Signal RPC Is Callable by Any Authenticated User

**Location:** `supabase/migrations/20260613040000_phase4_community.sql`

`get_review_queue_signals()` is `security definer` and is granted to all authenticated users:

```sql
grant execute on function public.get_review_queue_signals() to authenticated;
```

The function returns source IDs with flag counts and community scores used for the admin extraction review queue.

**Why it matters:** Review-queue prioritization is admin tooling. A contributor should not be able to call this RPC and infer internal review targets or moderation signal distribution.

**Fix approach:**

- Add an explicit guard at the top of the function:
  `case when not public.is_admin() then raise exception ... end`.
- Keep `grant execute` to `authenticated` only if required by Supabase RPC access, but rely on the function-level admin check.
- Alternatively revoke from `authenticated` and expose through an admin-only RPC wrapper if the client access pattern supports it.
- Add a migration test or manual RPC check: contributor call fails; editor/super_admin call succeeds.

---

### 3. HIGH - `viewer` Can Submit Comments, Votes, and Flags

**Locations:**

- `supabase/migrations/20260613040000_phase4_community.sql`
- `src/components/community/CommentSection.tsx`

`has_community_access()` includes `viewer`, and `CommentSection` also includes `viewer` in `contributorRoles`.

Existing role semantics make `viewer` an internal read-only role: `has_internal_access()` includes `viewer`, while `is_admin()` excludes it. Phase 4 write access should be `contributor`, `editor`, and `super_admin` unless the product explicitly redefines `viewer`.

**Why it matters:** This grants write actions to a role that otherwise appears designed for read-only staff access.

**Fix approach:**

- Remove `viewer` from `has_community_access()`.
- Remove `viewer` from `contributorRoles`.
- Verify `viewer` can still read internal/admin-visible content as intended, but cannot insert comments, votes, or flags.
- Check Phase 3 suggestions separately because its insert policy also includes `viewer`; that is adjacent scope but likely the same role-model issue.

---

### 4. HIGH - Non-Oldest Review Queue Sorts Only a Capped Oldest Subset

**Locations:**

- `src/lib/api/admin.ts`
- `supabase/migrations/20260531130000_review_queue_hardening.sql`

`getPendingReviewSourceSummaries()` tries to fetch `500` rows for non-default sorts, then sort client-side. The SQL function clamps `page_limit` to `100`:

```sql
limit greatest(1, least(coalesce(page_limit, 50), 100))
```

So "Most flagged" and "Highest net votes" only sort the oldest 100 pending sources, not the full queue.

**Why it matters:** A heavily flagged source outside the oldest 100 will not surface. That defeats the main purpose of Phase 4 admin prioritization.

**Fix approach:**

- Move sort handling into SQL or create a dedicated RPC that joins `get_review_queue_signals()` and orders before limiting.
- Support sort values: `oldest`, `newest`, `most_flagged`, `highest_community_score`.
- Apply pagination after sorting.
- Keep chronological fallback as the final tie-breaker.

---

### 5. HIGH - Sort Value Uses `highest_net_votes` Instead of `highest_community_score`

**Locations:**

- `src/lib/api/admin.ts`
- `src/pages/admin/AdminReviewQueuePage.tsx`

The implemented type and select option use `highest_net_votes`; the spec calls for `highest_community_score` and the label "Highest community score."

**Why it matters:** This is a contract mismatch. Any caller following the spec value will not get the intended sort. The current label also exposes implementation wording rather than the Phase 4 product language.

**Fix approach:**

- Rename the union value to `highest_community_score`.
- Update `AdminReviewQueuePage.tsx` option value and label.
- Update any SQL/RPC sort parameter if item 4 moves sorting server-side.
- Keep a temporary alias only if there is already persisted state or external callers using `highest_net_votes`; currently there should not be.

---

### 6. HIGH - "Needs Clarification" Comments Cannot Be Revised and Resubmitted

**Locations:**

- `supabase/migrations/20260613040000_phase4_community.sql`
- `src/lib/api/community.ts`
- `src/components/community/CommentSection.tsx`

Admins can set `status = 'needs_clarification'` with a reviewer note, and the author sees the note. But the author cannot revise that comment:

- RLS allows author updates only when `status = 'pending'`.
- `updateOwnPendingComment()` also filters to `status = 'pending'`.
- `CommentSection` has no edit/resubmit UI.

**Why it matters:** The spec says clarification returns the comment to the submitter. Current behavior makes clarification a dead end.

**Fix approach:**

- Decide intended lifecycle:
  - Best fit: author edits a `needs_clarification` comment, which resets it to `pending`, clears `reviewer_note`, and clears `reviewed_at/reviewer_id`.
- Add DB-side policy/trigger or RPC to allow only safe author-edit fields for `pending` and `needs_clarification`.
- Add UI on own `needs_clarification` comments: edit textarea, cancel, resubmit.
- Keep rejected comments non-editable unless product decides otherwise.

---

### 7. HIGH - Rejected Own Comments Render as "Awaiting Review"

**Location:** `src/components/community/CommentSection.tsx`

`ownComments` includes every own comment except approved comments. `OwnCommentCard` displays:

```tsx
{comment.status === 'needs_clarification' ? 'Needs clarification' : 'Awaiting review'}
```

So rejected comments appear to the author as "Awaiting review."

**Why it matters:** Authors receive the wrong moderation state, and rejected comments may linger in the public page UI as if still pending.

**Fix approach:**

- Either hide rejected comments from `CommentSection`, or render a distinct "Rejected" badge.
- If rejection should include feedback, add an admin rejection note path; otherwise keep it brief and non-actionable.
- Keep approved comments out of `ownComments` as currently implemented.

---

### 8. MEDIUM - Pending Comment Cap Is Enforced Only Client-Side

**Location:** `src/lib/api/community.ts`

`submitComment()` checks `getMyPendingCommentCount()` and rejects if the user has 5 pending comments. That is a read-then-insert check in the browser/API client.

**Why it matters:** Two browser tabs can pass the count check concurrently and insert more than 5 pending comments. The cap is a spam-control mitigation, so it should be atomic.

**Fix approach:**

- Add a DB trigger on `comments` before insert.
- Count pending comments for `new.author_id` inside the same transaction.
- Raise an exception if the user already has 5 pending comments.
- Decide whether `needs_clarification` should count against the cap.

---

### 9. MEDIUM - Comment Update Policy Allows More Than Body Edits

**Location:** `supabase/migrations/20260613040000_phase4_community.sql`

The author update policy allows authors to update their own pending comment rows, but RLS is row-level, not column-level. A direct client could attempt changes to `target_id`, `target_type`, `parent_id`, `reviewer_note`, or timestamps as long as the row remains pending and `author_id = auth.uid()`.

**Why it matters:** The intended user action is "edit my comment body." Broader row mutation increases the chance of confusing moderation data.

**Fix approach:**

- Prefer an RPC such as `update_own_comment_body(comment_id, body)` and revoke direct table update from non-admin users.
- If keeping table updates, add a trigger that rejects changes to protected columns for non-admin users.
- Ensure edits to `needs_clarification` comments reset status intentionally, per item 6.

---

### 10. MEDIUM - Comment Length Rules Have Two Sources of Truth

**Locations:**

- `supabase/migrations/20260613040000_phase4_community.sql`
- `src/lib/api/community.ts`
- `src/components/community/CommentForm.tsx`

The DB allows `char_length(body) between 1 and 2000`; the API and form require at least 10 trimmed characters.

**Why it matters:** Direct clients can create comments the UI rejects, and future code may not know which rule is authoritative. The Phase 4 component plan explicitly disables submit below 10 characters, so the DB should probably match that.

**Fix approach:**

- Change the DB check to `between 10 and 2000`, or lower the API/UI minimum to 1.
- Prefer `10` because the implemented UI and spam-control intent already use it.
- Keep trim behavior consistent: either store trimmed body only, or enforce length against `btrim(body)` in SQL.

---

### 11. MEDIUM - Admin Moderation Updates Return Rows Without Joined Profiles

**Location:** `src/lib/api/admin.ts`

`moderateComment()` and `moderateFlag()` update rows and then `.select('*')`. The admin row types elsewhere include joined `author` or `reporter` profiles.

**Why it matters:** Current callers do not rely on the returned joined profile, so this is not a launch blocker. But the exported API contract is inconsistent with the list/detail fetch functions and can cause future UI bugs.

**Fix approach:**

- For comments, select:
  `*, author:profiles!comments_author_id_fkey(display_name,email,role)`.
- For flags, select:
  `*, reporter:profiles!content_flags_reporter_id_fkey(display_name,email)`.
- Add explicit return types to `approveComment`, `rejectComment`, `requestCommentClarification`, `resolveFlag`, and `dismissFlag`.

---

### 12. MEDIUM - Admin Comment Bulk Actions Stop on First Failure

**Location:** `src/pages/admin/AdminCommentQueuePage.tsx`

Bulk approve/reject loops through selected comment IDs sequentially. If comment #2 fails, comment #3 and later are skipped, and the UI only shows one generic error.

**Why it matters:** Admins can end up with partial moderation without knowing which comments were processed.

**Fix approach:**

- Use `Promise.allSettled`.
- Report how many succeeded and which IDs failed.
- Clear successful IDs from selection while keeping failed IDs selected.
- Invalidate comment queries after all attempts complete.

---

### 13. MEDIUM - Clarification Note Uses Single-Line Input

**Location:** `src/pages/admin/AdminCommentQueuePage.tsx`

The spec calls for an inline textarea for "Request Clarification." The implementation uses `<Input>`.

**Why it matters:** Clarification notes are often multi-sentence. A single-line input makes the workflow cramped and discourages useful feedback.

**Fix approach:**

- Replace `<Input>` with the project `Textarea` component if available, or add a matching `components/ui/textarea.tsx`.
- Add `maxLength`, likely 500 or 1000 characters.
- Show a character counter.
- Consider applying the same DB check to `comments.reviewer_note`.

---

### 14. MEDIUM - Admin Comment Target Links Are Unreliable for Entity/Claim Targets

**Location:** `src/pages/admin/AdminCommentQueuePage.tsx`

Entity and claim comments link to:

- `/admin/entities?search=<uuid>`
- `/admin/claims?search=<uuid>`

The corresponding admin search RPCs search entity names/aliases or claim statement text, not IDs.

**Why it matters:** Clicking a comment target can land the admin on an empty search result instead of the target item.

**Fix approach:**

- Best option: fetch target display metadata for comments and link directly to public detail pages (`/entity/:slug`, `/claim/:id`, `/source/:id`) or admin detail routes where they exist.
- For entities, include `slug` in the admin comment query through a lookup.
- For claims, `/claim/:id` is already direct.
- For sources, the existing `/admin/sources/:id` link is reliable.

---

### 15. MEDIUM - Comment Section Is Not Collapsible and Anonymous Empty State Is Missing

**Location:** `src/components/community/CommentSection.tsx`

The spec calls for a collapsible "Community Notes" section with an approved-count badge. The component is always expanded. It also returns `null` for anonymous visitors when there are no approved comments, instead of showing "No community notes yet."

**Why it matters:** This is a visible spec mismatch and makes empty community sections disappear inconsistently.

**Fix approach:**

- Add Radix Collapsible or native disclosure behavior.
- Use the existing `<Badge>` component for the count.
- Render a consistent empty state for anonymous visitors with zero approved comments.
- Preserve the sign-in prompt for anonymous visitors after the empty state.

---

### 16. MEDIUM - Own Pending Replies Are Not Rendered Under Their Parent

**Location:** `src/components/community/CommentSection.tsx`

Approved replies are grouped under their parent, but own pending replies are appended in a separate list after all approved comments.

**Why it matters:** A user who submits a reply sees it detached from the conversation it belongs to.

**Fix approach:**

- Group `ownComments` by `parent_id`.
- Render pending replies beneath their approved parent where possible.
- For pending replies whose parent is not loaded, keep a fallback "Your pending notes" group.

---

### 17. MEDIUM - `FlagButton` Is Rendered for Anonymous Visitors

**Location:** `src/components/community/FlagButton.tsx`

The spec says the flag action is only shown to authenticated users. The implementation renders a disabled button with a native `title`.

**Why it matters:** It is a direct spec mismatch and adds disabled UI noise to public pages.

**Fix approach:**

- Add `if (!user) return null`.
- Keep `VoteWidget` visible to anonymous users because vote counts are public.
- If a sign-in CTA is desired, put it in the community section rather than every flag button.

---

### 18. MEDIUM - Flag Counts Are Exposed Broadly Through `open_flag_counts`

**Location:** `supabase/migrations/20260613040000_phase4_community.sql`

`open_flag_counts` is granted to all authenticated users. In Postgres/Supabase, ordinary views may bypass underlying RLS depending on view security settings, so this should be treated as an exposed moderation aggregate unless explicitly constrained.

**Why it matters:** Open flag counts are admin moderation signal, not public community feedback.

**Fix approach:**

- If only admins need this view, expose counts through an admin-checked RPC.
- Or make the view `security_invoker` where supported and ensure underlying `content_flags` RLS blocks non-admin aggregate leakage.
- Confirm contributor cannot query flag counts for arbitrary content.

---

### 19. MEDIUM - `ClaimMiniGraph` `height` Prop Is Missing

**Location:** `src/components/claim/ClaimMiniGraph.tsx`

The spec defines props as `claimId: string, height?: number (default 300)`. The component only accepts `claimId` and hardcodes `h-[300px]`.

**Why it matters:** This is a small API/spec gap, but it limits reuse and makes future layout tuning harder.

**Fix approach:**

- Add `height?: number` to props.
- Use inline style or CSS variable for the graph and skeleton containers: `style={{ height }}`.
- Keep default at `300`.

---

### 20. MEDIUM - `getClaimGraph()` Truncates Direct Entities by Insertion Order, Not Weight

**Location:** `src/lib/api/claims.ts`

The spec says broad claims should show the top 10 direct entity nodes by relationship weight when capped. Current code uses:

```ts
const cappedDirectEntityIds = directEntityIds.slice(0, 10)
```

`claim_entities` has no ordering, so the selected 10 are arbitrary.

**Why it matters:** Large claim graphs may omit the most structurally relevant entities.

**Fix approach:**

- Fetch relationships first or compute direct-entity weights from active relationships.
- Sort direct entity IDs by strongest/total relationship weight before capping.
- Keep a deterministic fallback, such as entity name, for equal weights.
- Continue showing `truncatedDirectEntityCount`.

---

### 21. LOW - `ClaimMiniGraph` Neighbor Label and Opacity Details Deviate From Spec

**Location:** `src/components/claim/ClaimMiniGraph.tsx`

Neighbor labels are always suppressed, even for small graphs. Neighbor opacity uses `0.42`, while the spec says reduced opacity around 50%.

**Fix approach:**

- Show neighbor labels when total graph size is small, e.g. `graph.order <= 15`.
- Use `0.5` opacity for neighbors.
- Keep edge labels suppressed for larger graphs.

---

### 22. LOW - `ClaimMiniGraph` Loading Skeleton Does Not Match Final Layout

**Location:** `src/components/claim/ClaimMiniGraph.tsx`

The loading state renders only a bare 300px box. The final state includes header, optional collapsed toggle, and framed graph.

**Why it matters:** This causes layout shift when loading finishes.

**Fix approach:**

- Render the header skeleton and graph frame in the loading state.
- Match the final section padding and border structure.

---

### 23. LOW - `FlagDetailPanel` Uses One Shared Pending State and Does Not Surface Moderation Errors

**Location:** `src/components/admin/FlagDetailPanel.tsx`

Resolving or dismissing one flag disables every flag row because all buttons depend on one mutation's `isPending`. Errors are not rendered.

**Fix approach:**

- Track pending state by flag ID.
- Render an inline error per failed flag action or use the app's toast system.
- Add a `SheetDescription` for Radix accessibility.

---

### 24. LOW - Type Definitions for Phase 4 Tables Are Too Loose

**Location:** `src/types/database.ts`

Generated/manual types use `string` or `number` where the DB has constrained values:

- `content_votes.value` should be `1 | -1`.
- `comments.status` should be `'pending' | 'approved' | 'rejected' | 'needs_clarification'`.
- `content_flags.status` should be `'open' | 'resolved' | 'dismissed'`.
- `target_type` fields should be literal unions.
- `content_flags.reason` should match `FlagReason`.

**Why it matters:** Runtime DB checks still protect data, but TypeScript will not catch invalid values in app code.

**Fix approach:**

- Update `src/types/database.ts` manually if that is the current project pattern, or regenerate Supabase types after tightening schema.
- Prefer exported aliases in `community.ts` where useful, but keep DB types accurate too.

---

### 25. LOW - Comment Form Character Counter and Accessibility Need Cleanup

**Location:** `src/components/community/CommentForm.tsx`

The counter displays trimmed length while `maxLength` enforces raw length. The textarea also has only a placeholder, with no label or `aria-label`.

**Fix approach:**

- Display raw length if relying on native `maxLength`, or enforce trim-based max manually.
- Add `aria-label="Community note"` or a visible label.
- Keep stored body trimmed as currently implemented.

---

### 26. LOW - Native `title` Tooltips Used for Disabled Vote Buttons

**Location:** `src/components/community/VoteWidget.tsx`

Unauthenticated vote buttons use `title="Sign in to vote"`. The spec asks for a tooltip, and the project already has Radix tooltip components.

**Fix approach:**

- Wrap disabled vote controls with the existing Tooltip component.
- Ensure touch and keyboard users get equivalent messaging.

---

### 27. LOW - Flag Modal State and Loading Guards Need Small UX Fixes

**Location:** `src/components/community/FlagButton.tsx`

The selected reason persists if the user opens the dialog, changes reason, closes without submitting, and reopens. The button is also clickable while `flagQuery` is still loading, which can cause an avoidable duplicate submission attempt.

**Fix approach:**

- Reset `reason` to `'factually_incorrect'` and `notes` to empty when the dialog closes without successful submit.
- Disable the button while `flagQuery.isLoading`.

---

### 28. LOW - Source Detail Vote Placement Is Slightly Off Spec

**Location:** `src/pages/sources/SourceDetailPage.tsx`

The spec says the vote widget should appear below the source metadata header. It is currently inside the header after the flag/copy action row.

**Fix approach:**

- Move `VoteWidget` just after the header if strict spec matching matters.
- Keep `FlagButton` near page actions.

---

## Step-by-Step Battle Plan

### Pass 1 - Permission and Privacy Blockers

1. Fix `content_votes` RLS so raw votes are not public; keep only aggregate public access through `community_scores`.
2. Restrict `get_review_queue_signals()` to admins with an explicit function-level `public.is_admin()` check.
3. Decide final role policy for `viewer`; if it remains read-only, remove it from `has_community_access()` and `CommentSection`.
4. Lock down `open_flag_counts` or move flag-count reads behind an admin-checked RPC.
5. Run manual RLS checks for anonymous, contributor, viewer, editor, and super_admin.

### Pass 2 - Review Queue Correctness

6. Rename `highest_net_votes` to `highest_community_score` in API and UI.
7. Move review-queue signal sorting server-side so sorting applies before pagination and across the full queue.
8. Verify "Most flagged" and "Highest community score" with seeded sources outside the first 100 oldest pending sources.

### Pass 3 - Comment Moderation Lifecycle

9. Implement a real clarification loop: author can edit/resubmit `needs_clarification` comments, status resets to `pending`.
10. Fix rejected own-comment rendering.
11. Add DB-side pending-comment cap enforcement.
12. Restrict author updates to body-only through an RPC or protected-column trigger.
13. Align the DB comment length check with the UI/API minimum.

### Pass 4 - Admin Moderation UX

14. Make admin moderation update functions return rows with joined author/reporter profiles or tighten their return types.
15. Change comment bulk actions to `Promise.allSettled` with partial-failure reporting.
16. Replace clarification `<Input>` with a textarea, max length, and counter.
17. Fix comment target links so entity/claim targets navigate reliably.
18. Improve `FlagDetailPanel` per-flag pending state, error display, and sheet description.

### Pass 5 - Public Community UI Polish

19. Make `CommentSection` collapsible, add a real count badge, and show the anonymous empty state.
20. Render pending replies under their parent where possible.
21. Hide `FlagButton` entirely for anonymous users.
22. Replace native vote `title` tooltips with Radix tooltip.
23. Clean up `CommentForm` counter/label and `FlagButton` modal reset/loading guard.

### Pass 6 - Claim Graph and Type Safety

24. Add the `height` prop to `ClaimMiniGraph`.
25. Sort capped direct claim-graph entities by relationship weight instead of arbitrary insertion order.
26. Adjust neighbor labels/opacity and skeleton layout.
27. Tighten Phase 4 table types in `src/types/database.ts`.
28. Run `npm run build` again, then test the manual scenarios from the Phase 4 spec.

---

## Final Recommendation

Treat items 1-7 as the must-fix set before any broad testing. They affect privacy, permissions, or core review-prioritization correctness. Items 8-18 should be fixed before launch because they affect moderation workflow reliability. Items 19-28 are polish and maintainability, but they are still worth doing while the Phase 4 code is fresh.

