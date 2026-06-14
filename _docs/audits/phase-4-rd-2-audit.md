# Phase 4 Community Feedback — Round 2 Audit

**Branch:** `community-feedback`  
**Audit date:** 2026-06-14  
**Scope:** Verification that all 28 items from `phase-4-audit.md` were fixed, plus a fresh scan for newly introduced issues.

---

## Round 1 Verification Result

All 28 items from the first-pass audit are **fully implemented and verified**. Key highlights confirmed:

- `content_votes` public-read RLS policy is gone; replaced with self-read + admin-read.
- `get_review_queue_signals()` has a function-level `is_admin()` guard.
- `viewer` removed from `has_community_access()` in SQL and from `contributorRoles` in `CommentSection`.
- Review queue sort (`ORDER BY`) happens in SQL before `LIMIT`, so "Most flagged" and "Highest community score" rank across the full queue.
- `highest_net_votes` → `highest_community_score` rename is complete in SQL, `admin.ts`, and `AdminReviewQueuePage.tsx`.
- `needs_clarification` edit+resubmit loop fully implemented (DB RLS, RPC `update_own_comment_body`, and UI in `CommentSection`).
- DB-side pending comment cap enforced via trigger (`enforce_comment_author_write_guards`).
- Comment body-only update restriction enforced at DB level (protected columns in trigger).
- `open_flag_counts` uses `security_invoker = true`; non-admins see only their own flags.
- `ClaimMiniGraph` `height` prop added, direct entity cap sorted by relationship weight.
- `FlagButton` returns `null` for anonymous users; `VoteWidget` uses Radix Tooltip for disabled state.
- All Phase 4 types in `database.ts` tightened to literal unions.

---

## Severity Legend

- **HIGH** — Incorrect permissions, broken required behavior, or admin tool behavior that can produce wrong decisions.
- **MEDIUM** — Spec deviation, misleading UX, or missing guardrail that should be fixed before broad use.
- **LOW** — Polish or known limitation acceptable for current usage.

---

## Remaining Issues

### 1. MEDIUM — `FlagButton` Shown to `viewer`-Role Users Who Cannot Flag

**Location:** `src/components/community/FlagButton.tsx`

The Round 1 fix (item 21) correctly hides `FlagButton` for unauthenticated users (`if (!user) return null`). However, the `viewer` role was deliberately excluded from `has_community_access()` in the migration — meaning `viewer`-role users cannot insert flags (the DB insert will fail with an RLS violation). Despite this, `FlagButton` still renders for authenticated `viewer` users, allowing them to open the modal and attempt submission, which silently fails at the DB layer.

This creates inconsistency: `viewer` users see `CommentSection`'s submit form hidden (correctly gated by `contributorRoles`) but the `FlagButton` visible and operable.

**Fix:**

Add a role check matching the pattern already used in `CommentSection.tsx`:

```tsx
// FlagButton.tsx — after the !user check
const { profile } = useAuth(); // or however profile/role is accessed
const contributorRoles = new Set(['contributor', 'editor', 'super_admin']);
if (!user || !contributorRoles.has(profile?.role)) return null;
```

Confirm the hook/context name used to access `profile.role` in this file matches the rest of the codebase.

---

### 2. LOW — Review Queue Has No Pagination UI (Pre-existing Limitation)

**Location:** `src/pages/admin/AdminReviewQueuePage.tsx`

`getPendingReviewSourceSummaries(0, sort)` is hardcoded to `page = 0`. The underlying RPC supports pagination but the page renders no "load more" or next-page control. The visible queue is capped at 50 sources regardless of pending queue depth.

With server-side sort now in place (item 4 fix), the top-50 items by selected criterion are always shown correctly — so "Most flagged" will surface the most-flagged sources within that 50-item window. However, if there are more than 50 pending sources, items not in the top 50 by the selected sort are invisible.

This is a pre-existing limitation not introduced by Phase 4. It is acceptable for current queue volumes. Flag for a future iteration if queue depth regularly exceeds 50.

**Fix (when needed):** Add a "Load more" button or simple `page` state that increments and appends results. The RPC already supports `page_offset` so no backend change is required.

---

## New Issue Found During Scan

### 3. LOW — `FlagDetailPanel` Error State Clears on Next Action

**Location:** `src/components/admin/FlagDetailPanel.tsx`

`failedFlagId` is derived from `moderateMutation.variables?.flag.id` when `moderateMutation.isError`. If the admin acts on a second flag after one failed, the mutation resets and the error indicator on the first flag disappears — the admin has no persistent record of which flag action failed. This is a minor UX gap in an admin-only component.

**Fix (low priority):** Maintain a `Set<string>` of `erroredFlagIds` that survives across mutation calls and is cleared only on successful reload or explicit dismiss.

---

## Fix Plan

| # | Item | Priority | File |
|---|------|----------|------|
| 1 | Hide `FlagButton` for `viewer` role | MEDIUM | `src/components/community/FlagButton.tsx` |
| 2 | Review queue pagination | LOW / future | `src/pages/admin/AdminReviewQueuePage.tsx` |
| 3 | `FlagDetailPanel` persistent error set | LOW | `src/components/admin/FlagDetailPanel.tsx` |

Items 2 and 3 are not blockers. Item 1 should be fixed to keep role-based write gating consistent across all community-write surfaces.

---

## Overall Assessment

Phase 4 is functionally complete and ready for use. The canonical graph constraint is fully enforced — no community action touches `claims`, `entities`, `relationships`, or `confidence_score`. All critical and high-severity items from Round 1 are resolved. The three items above are polish-level and do not affect correctness or data integrity. Item 1 is the only one worth fixing promptly, and it is a one-line guard.
