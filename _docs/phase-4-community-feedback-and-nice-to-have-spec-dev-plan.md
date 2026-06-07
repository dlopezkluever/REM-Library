# Phase 4 — Community Feedback & Nice-to-Have Features
## Spec and Dev Plan

---

## 1. Executive Summary

Phase 4 adds the community interaction layer and a small set of non-critical polish features that only make sense after the canonical graph (Phase 1), interpretive framing (Phase 2), and post-launch growth infrastructure (Phase 3) are stable.

The four work items are:

| # | Feature | Type |
|---|---------|------|
| 4.1 | Pre-moderated comment system on entity, claim, and source pages | Community |
| 4.2 | Voting / feedback signals with `content_votes` table and community score display | Community |
| 4.3 | Admin review queue prioritization using vote counts and admin flags | Admin tooling |
| 4.4 | Entity relationship visualization (mini-graph) on claim detail pages | Graph / UI |

None of these are blockers for source ingestion, public launch, or post-launch growth. They are the layer that turns the platform from a curated read-only reference into something users interact with — but that interaction must be built on top of a stable canonical graph, not before it.

---

## 2. Current State Relevant to Phase 4

### 2.1 What exists

**Community infrastructure (none):**
- No `comments`, `discussions`, `threads`, `votes`, `reactions`, or `user_submissions` table exists in any migration.
- No comment or discussion components in `src/components/` or `src/pages/`.
- No upvote, like, flag, or reaction system anywhere in the codebase.
- The admin review queue ordering is purely chronological (`min(extractions.created_at)`, `supabase/migrations/20260531130000_review_queue_hardening.sql:911`). No user signal touches any ranking path.

**Graph infrastructure (partial):**
- `GraphCanvas.tsx` — 2D graph renderer using Sigma.js. Node clicks fire `setActiveNodeId`.
- `GraphCanvas3D.tsx` — 3D graph renderer using force-graph. Physics simulation, node clicks fire `setActiveNodeId`.
- `GraphSidePanel.tsx` — right-side sheet drawer (Radix UI Dialog) that opens on node click, showing entity name, type, description, confidence bar, top 3 connected entities, and "View full entry" link.
- `EntityDetailPage.tsx` — has a `MiniGraph` sidebar component already.
- `ClaimDetailPage.tsx` — has no graph component; shows evidence (source anchors) as text-only.
- `src/lib/api/entities.ts:143` — connected entities sorted alphabetically; relationship weights not used for display ordering.
- `relationships` table (`supabase/migrations/20260523020000_core_tables.sql:28-36`) stores `from_entity_id`, `to_entity_id`, `type`, `weight`, `claim_ids[]`.
- `featured_connections` (`supabase/migrations/20260527010000_featured_connections.sql`) — homepage-only curated entity-to-entity cards.

**Auth and roles:**
- Three roles in `public.admin_role` enum (`supabase/migrations/20260523010000_enums.sql:38`): `super_admin`, `editor`, `viewer`.
- No public user registration path. No member, contributor, or trusted-user role.
- `is_admin()` returns true for `super_admin` and `editor`. `has_internal_access()` returns true for all three.
- All write operations on every table require `is_admin()`. No pathway for non-admin users to create any content.

**Phase 3 prerequisites (must be built before Phase 4):**
Phase 3 adds:
- Public user registration and community roles: `public`, `contributor`, `trusted_contributor`, `editor`, `super_admin`.
- `suggestions` table — users propose claims or flag content. Entries enter admin review queue; never directly update live tables.
- Basic community accounts powering Phase 4 comments and votes.

Without Phase 3 user accounts, Phase 4 comments and votes have no `user_id` to attach to.

### 2.2 What is missing (Phase 4 gap)

- No `comments` table, no comment UI, no moderation workflow for comments.
- No `content_votes` table, no vote display, no `community_score` field or signal.
- Admin review queue has no vote-based or flag-based prioritization.
- `ClaimDetailPage.tsx` shows claim relationships as text only — no graph visualization of the entities connected by the claim.

---

## 3. Phase 4 Goals

1. Give community users a way to engage with content (comments and votes) without being able to alter the canonical graph.
2. Surface community signal (votes, flags) to admins as a tool for review queue prioritization — without letting it touch `confidence_score`.
3. Make `ClaimDetailPage.tsx` spatially informative by showing a mini-graph of the claim's entities and relationships instead of a flat text list.
4. Keep all community-generated content pre-moderated so no user submission is publicly visible without admin approval.

---

## 4. Problems / Gaps Being Solved

**4A. No community interaction surface.** The platform is currently admin-curated and read-only for the public. Users cannot engage with content in any way. There is no way to ask a question, flag an error, upvote a useful interpretation, or note a disagreement. This is acceptable before the canonical graph is stable. It is not acceptable once the platform is open to a community.

**4B. Admin review queue has no signal about what is important.** The extraction review queue is purely chronological. If 200 claims are waiting for review and a community user has flagged three of them as potentially erroneous, admins have no way to see that signal. Votes and flags should inform but not control review prioritization.

**4C. Claim pages are spatially blind.** `ClaimDetailPage.tsx` shows which entities are involved in a claim as text links, but gives no geometric sense of how those entities sit relative to each other in the knowledge graph. A mini-graph centered on the claim's entities (identical in spirit to the `MiniGraph` on `EntityDetailPage.tsx`) makes the claim's structural role in the graph immediately legible.

**4D. Community signal is decoupled from canonical confidence.** The system's `confidence_score` is computed from source tier and evidence count. Community votes should not alter this — admins must remain in control of canonical rankings. But surfacing community sentiment (net vote score, flag count) as a separate `community_score` field gives admins one more input when deciding whether to promote a `confidence_override`.

---

## 5. Desired End State

After Phase 4 is complete:

- Any authenticated community user (role `contributor` or higher, from Phase 3) can leave a comment on an entity page, a claim page, or a source page. Comments are not visible publicly until an admin approves them.
- Any authenticated community user can upvote or downvote an entity, claim, or source. Votes aggregate into a `community_score` shown alongside but visually distinct from `confidence_score`. Votes have no effect on confidence scores or rankings.
- The admin extraction review queue can be sorted by vote count or flag count in addition to chronological order. Admins choose the sort; it does not auto-reorder.
- `ClaimDetailPage.tsx` displays a mini-graph showing the claim's entity nodes and their relationships, rendered with the same graph library already used elsewhere in the codebase.
- No user-submitted content (comments, votes, flags) can ever directly mutate `claims`, `entities`, `relationships`, or any canonical table.

---

## 6. Feature Specs

### 6.1 Pre-Moderated Comment System

**Purpose:** Let community users annotate entities, claims, and sources with contextual notes, corrections, or questions, all subject to admin approval before public display.

**Behavior:**
- Authenticated users (role `contributor` or higher) can submit a comment on any entity, claim, or source page.
- Submitted comments are stored with `status = 'pending'`. They are not visible to other users.
- Admins see a "Pending Comments" queue (or inline pending indicator on entity/claim/source admin pages).
- Admin actions: approve → comment becomes publicly visible; reject → comment is soft-deleted; needs_clarification → comment is returned to submitter with a note.
- Approved comments appear in a collapsible "Community Notes" section at the bottom of each entity, claim, and source page.
- Comments are threaded at one level (reply to a top-level comment). No deeper nesting.
- No anonymous comments. User display name comes from `profiles.display_name`.
- Comment text is plain text or minimal markdown (no HTML). Max length 2000 characters.

**Out of scope for 4.1:**
- Reactions on individual comments.
- Comment voting.
- Email notifications for comment replies.
- Threaded nesting beyond one level.

### 6.2 Voting / Feedback Signals

**Purpose:** Let community users express agreement or disagreement with content, surfacing community sentiment without corrupting admin-controlled confidence rankings.

**Behavior:**
- Authenticated users can cast a +1 (upvote) or -1 (downvote) on any entity, claim, or source. One vote per user per target. Re-clicking the same value removes the vote.
- Vote aggregates are displayed as `community_score` (net sum of +1/-1 votes) alongside the existing `confidence_score` display.
- `community_score` is purely cosmetic — it does not feed into `confidence_score` computation and does not affect claim sort order on entity pages.
- Admins can see the community score in `AdminClaimManagerPage.tsx` and `AdminEntityManagerPage.tsx` and optionally use it as context when setting `confidence_override`.
- A "Flag" action (distinct from voting) lets users mark content as potentially incorrect, spam, or inappropriate. Flags are stored with a `reason` enum value. Flagged items appear with a flag badge in the admin manager pages.

**Out of scope for 4.2:**
- Letting votes automatically adjust `confidence_score` or `confidence_override`.
- Weighted votes based on user reputation or role.
- Public leaderboards of top-voted content.

### 6.3 Admin Review Queue Prioritization

**Purpose:** Surface high-community-signal items to the top of the admin extraction review queue, without removing chronological fallback.

**Behavior:**
- The extraction review queue in `ExtractionReviewPanel.tsx` (or its parent admin queue page) gains a sort dropdown with options: "Oldest first" (current default), "Most flagged", "Highest net votes", "Newest first".
- "Most flagged" sorts by the count of flag actions targeting claims or entities that are pending in the queue.
- "Highest net votes" sorts by the community score of already-published claims whose source extractions are still pending review for other items (i.e., the source has been engaged with but not all its content is reviewed).
- Sort preference is stored in admin session state (not persisted to DB — it is a UI convenience, not a system policy).
- The admin can always return to chronological ("Oldest first") ordering.

**Out of scope for 4.3:**
- Automatic re-ordering without admin action.
- Community users seeing the queue or its size.
- Votes affecting RLS or row visibility on any table.

### 6.4 Entity Relationship Visualization on Claim Pages

**Purpose:** Give `ClaimDetailPage.tsx` a spatial view of the entities involved in the claim and their relationships, matching the `MiniGraph` experience on `EntityDetailPage.tsx`.

**Behavior:**
- Below the claim statement on `ClaimDetailPage.tsx`, render a `ClaimMiniGraph` component showing:
  - The entities directly referenced in the claim (from `claim_entities`).
  - The relationships between those entities (from `relationships` where both endpoint entity IDs are in the claim's entity set).
  - First-degree neighbors of the claim entities (entities one hop away via `relationships`), shown at reduced opacity or smaller size.
- Node click navigates to `/entity/:slug` (same behavior as existing graph side panel).
- The component reuses the same graph rendering library (Sigma.js or force-graph, whichever is lighter for a small embedded graph) already used in `MiniGraph`.
- Height: fixed at approximately 300px. Width: full column width on the claim page.
- The graph is non-interactive for zoom/pan on mobile; interactive on desktop.

**Out of scope for 4.4:**
- Full knowledge graph mode on claim pages.
- Ability to click a relationship edge to navigate anywhere.
- Graph editing from the claim page.

---

## 7. Database / Schema Plan

### 7.1 `comments` table

```sql
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id),
  target_type text NOT NULL
    CHECK (target_type IN ('entity', 'claim', 'source')),
  target_id uuid NOT NULL,
  parent_id uuid REFERENCES public.comments(id),  -- one-level threading
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'needs_clarification')),
  reviewer_id uuid REFERENCES public.profiles(id),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_target_idx ON public.comments (target_type, target_id, status);
CREATE INDEX comments_status_idx ON public.comments (status, created_at);
CREATE INDEX comments_author_idx ON public.comments (author_id);

-- RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Public can read approved comments
CREATE POLICY "comments public read approved" ON public.comments
  FOR SELECT USING (status = 'approved');

-- Authenticated users can read their own (any status)
CREATE POLICY "comments own read" ON public.comments
  FOR SELECT TO authenticated USING (author_id = auth.uid());

-- Admins can read all
CREATE POLICY "comments admin read" ON public.comments
  FOR SELECT TO authenticated USING (public.is_admin());

-- Contributors+ can insert their own
CREATE POLICY "comments contributor insert" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.has_internal_access());

-- Authors can update their own pending comments
CREATE POLICY "comments own update pending" ON public.comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND status = 'pending');

-- Admins can update (approve/reject)
CREATE POLICY "comments admin update" ON public.comments
  FOR UPDATE TO authenticated USING (public.is_admin());
```

Notes:
- `parent_id` supports one-level threading. A comment with a non-null `parent_id` is a reply; replies cannot themselves have replies (enforced at app layer).
- `reviewer_note` is the admin's message back when `status = 'needs_clarification'`.
- `updated_at` should be managed by a trigger (pattern already exists for other tables).

### 7.2 `content_votes` table

```sql
CREATE TABLE public.content_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  target_type text NOT NULL
    CHECK (target_type IN ('entity', 'claim', 'source')),
  target_id uuid NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX content_votes_target_idx ON public.content_votes (target_type, target_id);

-- RLS
ALTER TABLE public.content_votes ENABLE ROW LEVEL SECURITY;

-- Anyone can read aggregates (via view, not raw table)
CREATE POLICY "votes public read" ON public.content_votes
  FOR SELECT USING (true);

-- Authenticated users can insert their own vote
CREATE POLICY "votes authenticated insert" ON public.content_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Users can update or delete their own vote (to change or remove)
CREATE POLICY "votes own update" ON public.content_votes
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "votes own delete" ON public.content_votes
  FOR DELETE TO authenticated USING (user_id = auth.uid());
```

### 7.3 `content_flags` table

Flag actions are distinct from votes. Flags communicate a moderation concern; votes communicate community sentiment.

```sql
CREATE TABLE public.content_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id),
  target_type text NOT NULL
    CHECK (target_type IN ('entity', 'claim', 'source', 'comment')),
  target_id uuid NOT NULL,
  reason text NOT NULL
    CHECK (reason IN (
      'factually_incorrect',
      'spam',
      'inappropriate',
      'duplicate',
      'needs_source',
      'other'
    )),
  notes text CHECK (char_length(notes) <= 500),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)  -- one flag per user per target
);

CREATE INDEX content_flags_target_idx ON public.content_flags (target_type, target_id, status);
CREATE INDEX content_flags_status_idx ON public.content_flags (status, created_at);

ALTER TABLE public.content_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flags authenticated insert" ON public.content_flags
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "flags own read" ON public.content_flags
  FOR SELECT TO authenticated USING (reporter_id = auth.uid());

CREATE POLICY "flags admin all" ON public.content_flags
  FOR ALL TO authenticated USING (public.is_admin());
```

### 7.4 `community_score` view

Do not store `community_score` as a column — compute it on read to avoid stale aggregates.

```sql
CREATE VIEW public.community_scores AS
SELECT
  target_type,
  target_id,
  SUM(value)::integer AS community_score,
  COUNT(*) FILTER (WHERE value = 1) AS upvote_count,
  COUNT(*) FILTER (WHERE value = -1) AS downvote_count,
  COUNT(*) AS total_votes
FROM public.content_votes
GROUP BY target_type, target_id;
```

### 7.5 Flag count summary view (for admin prioritization)

```sql
CREATE VIEW public.open_flag_counts AS
SELECT
  target_type,
  target_id,
  COUNT(*) AS flag_count
FROM public.content_flags
WHERE status = 'open'
GROUP BY target_type, target_id;
```

### 7.6 No schema changes to `claims`, `entities`, or `relationships`

Community signal never writes to the canonical tables. `confidence_score` computation (`supabase/functions/compute-confidence/index.ts`) is not modified. `community_score` is read from the view, never written to any column.

---

## 8. API / Service Layer Plan

All new functions go in `src/lib/api/community.ts` (new file). This keeps community logic isolated from the core `admin.ts`, `claims.ts`, `entities.ts`, and `sources.ts` files.

### 8.1 Comment functions

```typescript
// community.ts

getApprovedComments(targetType, targetId): Promise<Comment[]>
// SELECT * FROM comments WHERE target_type=? AND target_id=? AND status='approved'
// Include author display_name via join to profiles
// Order: parent comments by created_at ASC, replies nested under parent

submitComment(targetType, targetId, body, parentId?): Promise<Comment>
// INSERT INTO comments (author_id=auth.uid(), ...)
// Returns the new comment (status='pending')

updateOwnPendingComment(commentId, body): Promise<Comment>
// UPDATE comments SET body=?, updated_at=now() WHERE id=? AND author_id=auth.uid() AND status='pending'

// Admin functions (go in admin.ts)
getPendingComments(page, filters): Promise<PaginatedComments>
approveComment(commentId): Promise<void>
rejectComment(commentId): Promise<void>
requestCommentClarification(commentId, note): Promise<void>
getCommentCountForTarget(targetType, targetId): Promise<{pending: number, approved: number}>
```

### 8.2 Vote functions

```typescript
// community.ts

getCommunityScore(targetType, targetId): Promise<CommunityScore>
// SELECT * FROM community_scores WHERE target_type=? AND target_id=?

getUserVote(targetType, targetId): Promise<1 | -1 | null>
// SELECT value FROM content_votes WHERE user_id=auth.uid() AND target_type=? AND target_id=?

castVote(targetType, targetId, value: 1 | -1): Promise<void>
// UPSERT into content_votes ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET value=?

removeVote(targetType, targetId): Promise<void>
// DELETE FROM content_votes WHERE user_id=auth.uid() AND target_type=? AND target_id=?
```

### 8.3 Flag functions

```typescript
// community.ts

submitFlag(targetType, targetId, reason, notes?): Promise<void>
// INSERT INTO content_flags

getUserFlag(targetType, targetId): Promise<ContentFlag | null>
// SELECT * FROM content_flags WHERE reporter_id=auth.uid() AND ...

// Admin functions (go in admin.ts)
getOpenFlags(page, filters): Promise<PaginatedFlags>
resolveFlag(flagId): Promise<void>
dismissFlag(flagId): Promise<void>
getFlagCountForTarget(targetType, targetId): Promise<number>
```

### 8.4 Review queue update (admin.ts)

Add an optional `sort` parameter to the existing extraction queue fetch function:

```typescript
// src/lib/api/admin.ts

getAdminExtractionQueue(
  page: number,
  sort: 'oldest' | 'newest' | 'most_flagged' | 'highest_community_score' = 'oldest'
): Promise<PaginatedExtractions>
```

For `most_flagged`: join against `open_flag_counts` view on the extraction's source_id or on any of the pending claim/entity IDs in the extraction.
For `highest_community_score`: join against `community_scores` view on already-published entities or claims that share the same source as the pending extraction.

### 8.5 ClaimMiniGraph data

```typescript
// src/lib/api/claims.ts — add to existing file

getClaimGraph(claimId): Promise<ClaimGraphData>
// Returns:
// - claim entities (from claim_entities join entities)
// - relationships between those entities (from relationships where from/to are both in entity set)
// - first-degree neighbor entities (one hop from claim entities via relationships)
// - relationships to/from neighbors
// Used exclusively by ClaimMiniGraph component
```

---

## 9. UI / UX Plan

### 9.1 Comment section component

**New component:** `src/components/community/CommentSection.tsx`

Props: `targetType: 'entity' | 'claim' | 'source'`, `targetId: string`

Structure:
- Collapsible section titled "Community Notes" with approved comment count badge.
- If no approved comments and user not logged in: "No community notes yet."
- If user is `contributor` or higher: shows a "Add a note" form (textarea + submit button).
- Approved comments: avatar/display name, timestamp, comment body, reply button.
- Replies indented one level under parent; no further nesting.
- Pending state for user's own submitted comment: dim with "Awaiting review" label.
- Admin badge (small icon) on comments by `editor` or `super_admin` authors.

**New component:** `src/components/community/CommentForm.tsx`

Inline form with:
- Textarea (max 2000 chars, character count display).
- Submit button disabled until at least 10 characters entered.
- "Reply to [name]" header when in reply mode.
- Success state: shows submitted comment in pending state inline.
- Error state: inline error message.

### 9.2 Vote widget component

**New component:** `src/components/community/VoteWidget.tsx`

Props: `targetType`, `targetId`

Structure:
- Upvote button (thumbs up / arrow up) with current upvote count.
- Downvote button with downvote count.
- Net score displayed between them.
- Active state (filled icon) when user has voted that direction.
- Requires auth; unauthenticated users see counts but buttons are disabled with tooltip "Sign in to vote."
- Optimistic UI: update count immediately, roll back on API error.

Placement:
- `EntityDetailPage.tsx`: below the `AttestationBar` component.
- `ClaimDetailPage.tsx`: below the claim statement.
- `SourceDetailPage.tsx`: below the source metadata header.
- `GraphSidePanel.tsx`: below the confidence bar (compact version, net score only).

### 9.3 Flag button component

**New component:** `src/components/community/FlagButton.tsx`

Props: `targetType`, `targetId`

Structure:
- Small flag icon button. On click: opens a modal with reason select and optional notes field.
- After submitting: button becomes "Flagged" state (filled icon, disabled).
- One flag per user per target enforced by DB unique constraint.
- Only shown to authenticated users.

### 9.4 Admin comment moderation

**New page:** `src/pages/admin/AdminCommentQueuePage.tsx`

Route: `/admin/comments`

- Paginated table of pending comments.
- Columns: target (entity/claim/source name as link), author, submitted at, body preview, actions.
- Actions per row: Approve, Reject, Request Clarification (opens text input for note).
- Filter by: target type, status (pending/approved/rejected/needs_clarification).
- Bulk approve, bulk reject.

**Admin integration on detail pages:**
- `AdminEntityManagerPage.tsx` and `AdminClaimManagerPage.tsx`: show pending comment count badge next to entity/claim name. Clicking navigates to the comment queue filtered by that entity/claim.

### 9.5 Admin flag queue

**Addition to existing admin pages** (not a new page — add to `AdminClaimManagerPage.tsx` and `AdminEntityManagerPage.tsx`):
- Flag count badge next to entity/claim name.
- Clicking the badge opens a side panel listing all open flags for that item (reason, reporter, notes).
- Admin can resolve or dismiss flags inline.

### 9.6 Review queue sort control

**Change to existing extraction review queue page:**
- Add a `<select>` sort dropdown above the queue list:
  - "Oldest first" (default)
  - "Newest first"
  - "Most flagged"
  - "Highest community score"
- Sort selection is session-state only (no DB persistence).
- Queue re-fetches on sort change.

### 9.7 ClaimMiniGraph component

**New component:** `src/components/claim/ClaimMiniGraph.tsx`

Props: `claimId: string`, `height?: number` (default 300)

Structure:
- Fetches graph data via `getClaimGraph(claimId)`.
- Renders a small force-directed graph using the same library as `MiniGraph` on `EntityDetailPage.tsx`.
- Claim's direct entities: rendered at full opacity with colored badges matching entity type.
- First-degree neighbor entities: rendered at 50% opacity, smaller radius.
- Relationships: edges labeled with `type` if space allows.
- Node click: navigates to `/entity/:slug`.
- Loading state: skeleton placeholder at fixed height.
- Empty state (claim has no entities — should not happen in practice): hidden.

**Integration in `ClaimDetailPage.tsx`:**
- Insert `<ClaimMiniGraph claimId={claim.id} />` between the claim statement section and the evidence (source anchors) section.
- Wrap in a collapsible if the entity count is 0 (hide entirely) or > 10 (collapse by default to avoid overwhelming the page).

**Community score display on existing pages:**

Add `community_score` display to:
- `AdminClaimManagerPage.tsx` — new column in claim table: "Community Score" (net votes).
- `AdminEntityManagerPage.tsx` — same.
- Both pages already show `confidence_score`; `community_score` appears beside it, visually distinct (e.g., grey text vs. the existing confidence color scale).

---

## 10. Step-by-Step Development Plan

### Step 1 — Database migrations

**1.1** Create migration file: `supabase/migrations/20260608010000_phase4_community.sql`

Subtasks:
- Create `comments` table with all columns, indexes, and RLS policies (section 7.1).
- Create `content_votes` table with all columns, indexes, and RLS policies (section 7.2).
- Create `content_flags` table with all columns, indexes, and RLS policies (section 7.3).
- Create `community_scores` view (section 7.4).
- Create `open_flag_counts` view (section 7.5).
- Test: manually insert a comment and vote as test user, verify RLS blocks unauthenticated writes, verify admin can read pending comments.

**Acceptance criteria:**
- `comments`, `content_votes`, `content_flags` tables exist in remote Supabase.
- `community_scores` and `open_flag_counts` views return correct aggregates.
- Anonymous reads of `comments` return only `status = 'approved'` rows.
- Non-admin authenticated reads return only approved + own rows.

---

### Step 2 — API / service layer

**2.1** Create `src/lib/api/community.ts` with all comment, vote, and flag functions (section 8.1–8.3).

Subtasks:
- `getApprovedComments(targetType, targetId)` — include author profile join for display name.
- `submitComment(targetType, targetId, body, parentId?)` — validate body length on client before calling.
- `updateOwnPendingComment(commentId, body)`.
- `getCommunityScore(targetType, targetId)` — query `community_scores` view.
- `getUserVote(targetType, targetId)` — return `1`, `-1`, or `null`.
- `castVote(targetType, targetId, value)` — UPSERT.
- `removeVote(targetType, targetId)` — DELETE.
- `submitFlag(targetType, targetId, reason, notes?)` — INSERT.
- `getUserFlag(targetType, targetId)` — check if user already flagged this target.

**2.2** Add admin comment/flag functions to `src/lib/api/admin.ts`:
- `getPendingComments(page, filters)`.
- `approveComment(commentId)`.
- `rejectComment(commentId)`.
- `requestCommentClarification(commentId, note)`.
- `getOpenFlags(page, filters)`.
- `resolveFlag(flagId)`.
- `dismissFlag(flagId)`.

**2.3** Update `src/lib/api/admin.ts` extraction queue fetch to accept `sort` parameter (section 8.4).

**2.4** Add `getClaimGraph(claimId)` to `src/lib/api/claims.ts` (section 8.5).

**Acceptance criteria:**
- `submitComment` creates a row with `status = 'pending'` and `author_id = auth.uid()`.
- `getApprovedComments` returns zero rows for a target with only pending comments.
- `castVote` on a target twice (same value) updates instead of inserting a duplicate.
- `removeVote` clears the row; subsequent `getUserVote` returns `null`.
- `getCommunityScore` returns correct net sum.
- `getClaimGraph` returns entity nodes and relationship edges for a given claim.

---

### Step 3 — Comment components

**3.1** Create `src/components/community/CommentForm.tsx`.

Subtasks:
- Textarea with 2000-character limit and live counter.
- Submit button disabled below 10 characters.
- Reply mode: show "Reply to [name]" header, pass `parentId` to `submitComment`.
- On success: show submitted comment in pending state inline; clear form.
- On error: display inline error; do not clear form.

**3.2** Create `src/components/community/CommentSection.tsx`.

Subtasks:
- Fetch approved comments with `getApprovedComments` on mount.
- Render flat list of approved top-level comments, each followed by their approved replies.
- Show "Community Notes (N)" header; collapse if 0 approved comments and user is not logged in.
- Show `CommentForm` for authenticated contributors.
- Show user's own pending comment (if any) below approved comments with "Awaiting review" label.
- Admin badge on comments from admin users.

**3.3** Integrate `CommentSection` into:
- `src/pages/entity/EntityDetailPage.tsx` — append at bottom of page.
- `src/pages/claims/ClaimDetailPage.tsx` — append at bottom.
- `src/pages/sources/SourceDetailPage.tsx` — append at bottom.

**Acceptance criteria:**
- Approved comments are visible to all visitors.
- Pending comments are visible only to their author.
- Admin users see all comments on the admin manager pages.
- Non-authenticated users see approved comments but no submit form.
- One-level reply threading renders correctly (replies indented under parent).

---

### Step 4 — Vote and flag components

**4.1** Create `src/components/community/VoteWidget.tsx`.

Subtasks:
- Fetch `getCommunityScore` and `getUserVote` on mount.
- Render upvote/downvote buttons with counts and net score.
- Optimistic UI update on vote; rollback on error.
- Unauthenticated state: counts visible, buttons disabled with tooltip.
- Clicking same active vote removes it (calls `removeVote`).

**4.2** Create `src/components/community/FlagButton.tsx`.

Subtasks:
- Flag icon; on click opens modal (Radix UI Dialog, consistent with rest of codebase).
- Reason select (factually incorrect, spam, inappropriate, duplicate, needs source, other).
- Optional notes textarea (500 char max).
- Submit calls `submitFlag`; on success sets button to "Flagged" disabled state.
- Check `getUserFlag` on mount to initialize already-flagged state.

**4.3** Integrate `VoteWidget` into:
- `EntityDetailPage.tsx` — below `AttestationBar`.
- `ClaimDetailPage.tsx` — below claim statement.
- `SourceDetailPage.tsx` — below source metadata.
- `GraphSidePanel.tsx` — compact net-score-only variant below confidence bar.

**4.4** Integrate `FlagButton` into:
- `EntityDetailPage.tsx` — near entity title or in page action bar.
- `ClaimDetailPage.tsx` — near claim title.
- `SourceDetailPage.tsx` — near source title.

**Acceptance criteria:**
- Vote counts update immediately (optimistic) and persist on reload.
- Changing a vote from +1 to -1 produces a net change of -2 in displayed score.
- Flag modal submits with reason; re-opening shows "Flagged" state.
- `community_score` is visible on admin claim/entity manager pages (new column).
- `confidence_score` and `community_score` are visually distinct.

---

### Step 5 — Admin comment queue page

**5.1** Create `src/pages/admin/AdminCommentQueuePage.tsx`.

Subtasks:
- Paginated table using existing admin table patterns.
- Columns: Target (linked), Author, Submitted, Preview, Status, Actions.
- Action buttons: Approve, Reject, Request Clarification.
- "Request Clarification" opens an inline textarea for the note; submits `requestCommentClarification`.
- Filter controls: target type radio, status filter.
- Bulk select + "Approve selected" / "Reject selected" actions.

**5.2** Add route `/admin/comments` to router.

**5.3** Add "Comments" nav item to admin sidebar (consistent with existing admin nav pattern).

**5.4** Add pending comment count badges to `AdminEntityManagerPage.tsx` and `AdminClaimManagerPage.tsx` rows.

**Acceptance criteria:**
- Approving a comment changes its status and it becomes visible on the public page immediately.
- Rejecting a comment removes it from the public-facing comment section.
- "Request Clarification" sets status and stores reviewer note; author sees "Admin requested clarification: [note]" on their pending comment.
- Bulk approve processes all selected items.

---

### Step 6 — Admin flag integration

**6.1** Add flag count column to `AdminClaimManagerPage.tsx` and `AdminEntityManagerPage.tsx` tables.

Subtasks:
- New column "Flags" showing open flag count from `getFlagCountForTarget`.
- Clicking the count opens a side panel (`src/components/admin/FlagDetailPanel.tsx`, new component) listing all open flags for that item.
- Each flag row shows: reason, reporter display name, notes, submitted time.
- Resolve / Dismiss buttons per flag.

**6.2** Create `src/components/admin/FlagDetailPanel.tsx` (Radix Sheet or Dialog, consistent with existing pattern).

**Acceptance criteria:**
- Flag count badge visible on every claim and entity row in admin manager.
- Opening the flag panel shows all open flags for that item.
- Resolving a flag removes it from open count; dismissing same.

---

### Step 7 — Review queue sort control

**7.1** Identify the extraction review queue page (likely a page under `/admin/queue` or similar — confirm from codebase) and its data fetch function in `src/lib/api/admin.ts`.

**7.2** Update the data fetch function to accept and handle the `sort` parameter (section 8.4).

**7.3** Add a `<select>` sort dropdown to the queue page above the queue list.

**7.4** Wire sort selection to state; re-fetch queue on change.

**Acceptance criteria:**
- Switching to "Most flagged" re-orders the queue to surface items with open flags first.
- "Oldest first" returns to original chronological behavior.
- Sort selection resets to "Oldest first" on page reload (not persisted).

---

### Step 8 — ClaimMiniGraph component

**8.1** Create `src/components/claim/ClaimMiniGraph.tsx`.

Subtasks:
- Call `getClaimGraph(claimId)` on mount; show skeleton while loading.
- Render force-directed graph using the same library as `MiniGraph` (read `src/components/entity/MiniGraph.tsx` or equivalent to match exact library and pattern).
- Direct claim entities: full opacity, entity-type color badge.
- First-degree neighbors: 50% opacity, smaller node size.
- Relationship edges: labeled with `type` text if graph is small enough (<=15 nodes); unlabeled otherwise.
- Node click: navigate to `/entity/:slug`.
- Hide component entirely if claim has no associated entities (zero-node state should not reach production but guard against it).
- Collapse by default if entity count >10.

**8.2** Integrate `ClaimMiniGraph` into `src/pages/claims/ClaimDetailPage.tsx`:
- Insert between the claim statement section and the evidence/source-anchors section.

**Acceptance criteria:**
- Opening a claim page for a claim with entities shows the mini-graph below the claim statement.
- Claim's direct entities are visually distinct from neighbors.
- Clicking a node navigates to the correct entity page.
- Claim with no entities shows no graph (component renders null).
- Graph does not interfere with adjacent page sections (no overflow, fixed height).

---

## 11. Testing Plan

**Unit / integration tests (Supabase migrations):**
- RLS: anonymous user cannot INSERT into `comments`, `content_votes`, `content_flags`.
- RLS: authenticated non-admin can INSERT but not SELECT other users' pending comments.
- RLS: admin can SELECT all comment statuses.
- Vote UPSERT: same (user, target) pair results in exactly one row, not two.
- Vote delete: `community_scores` view reflects updated net score after DELETE.
- Flag unique constraint: second flag attempt for same (user, target) fails with unique violation.

**Manual / E2E scenarios:**

| Scenario | Expected result |
|----------|----------------|
| Submit a comment as contributor | Comment appears pending; not visible to other users |
| Admin approves comment | Comment appears publicly on entity/claim/source page |
| Admin rejects comment | Comment disappears from all views |
| Submit a +1 vote, refresh | Vote count +1; user's vote remembered |
| Change vote to -1 | Net score drops by 2 |
| Remove vote | Net score returns to original; button shows unvoted state |
| Flag a claim as "factually incorrect" | Flag stored; admin sees flag count badge on claim row |
| Admin dismisses flag | Flag count decrements; flag panel no longer shows it |
| Sort queue by "most flagged" | Items with open flags appear at top |
| Open claim page with entities | ClaimMiniGraph renders below claim statement |
| Click entity node in ClaimMiniGraph | Navigates to `/entity/:slug` |
| Submit vote while not logged in | Vote buttons are disabled; counts still visible |

---

## 12. Acceptance Criteria

Phase 4 is complete when:

- [ ] `comments`, `content_votes`, `content_flags` tables exist in production Supabase with correct RLS.
- [ ] `community_scores` and `open_flag_counts` views return correct data.
- [ ] Authenticated users (contributor or higher) can submit comments; comments are pending until approved.
- [ ] Approved comments are visible in "Community Notes" section on entity, claim, and source pages.
- [ ] Authenticated users can upvote or downvote any entity, claim, or source; vote changes are reflected immediately.
- [ ] `community_score` (net votes) is visible on admin entity and claim manager pages, distinct from `confidence_score`.
- [ ] No vote or community score feeds into `confidence_score` or alters claim sort order.
- [ ] Authenticated users can flag any entity, claim, or source with a reason; flag count is visible to admins.
- [ ] Admin comment queue page at `/admin/comments` allows approve, reject, and request-clarification actions.
- [ ] Admin extraction review queue has a sort dropdown including "Most flagged" and "Highest community score" options.
- [ ] `ClaimDetailPage.tsx` shows a mini-graph of the claim's entities and their relationships.
- [ ] Node click on ClaimMiniGraph navigates to the correct entity page.
- [ ] All community actions require authentication; no anonymous writes.
- [ ] `is_canonical` flag on claims is not affected by any Phase 4 change.
- [ ] `confidence_score` computation in `supabase/functions/compute-confidence/index.ts` is not modified.

---

## 13. Risks and Mitigations

### R1. Community signal manipulated by coordinated voting

**Risk:** A group of users could coordinate to upvote a disputed claim's `community_score`, creating social pressure on admins to elevate its `confidence_override`.

**Mitigation:** `community_score` is display-only. It is shown as a separate signal with a clear label distinguishing it from `confidence_score`. Admin documentation should make clear that `confidence_override` is a curatorial decision, not a democratic one. Consider adding a per-user vote rate limit in the `castVote` function (no more than N votes per hour) to slow coordinated campaigns. The `is_canonical` flag on claims must remain restricted to `super_admin` only — it is not influenced by community score.

### R2. Comment spam overwhelming the moderation queue

**Risk:** A high-volume spammer or bot creates hundreds of pending comments, overwhelming the admin comment queue.

**Mitigation:** Require `contributor` role to comment (not available to newly registered anonymous accounts). Add rate limiting at the API layer: no more than 5 pending comments per user at a time. If a user has 5 pending comments, the submit button is disabled until some are reviewed. The `has_internal_access()` check already gates write actions on having an internal role.

### R3. ClaimMiniGraph renders an unreadable hairball for claims with many entities

**Risk:** A claim that covers a broad historical event may be linked to 20+ entities. A force-directed graph of 20+ nodes at 300px height is unreadable.

**Mitigation:** Cap the ClaimMiniGraph at 10 direct entity nodes. If a claim exceeds this, show the top 10 by relationship weight and add a "+ N more" indicator. Collapse the component by default if entity count >10. First-degree neighbors are only shown if total node count (direct + neighbors) remains under 25. Beyond that, render only direct entities.

### R4. `getClaimGraph` query is too slow for complex claims

**Risk:** For claims with many entities, fetching the full neighborhood query may be slow enough to degrade page load.

**Mitigation:** The component should load asynchronously below the fold — it should never block the above-the-fold claim text from rendering. Add a 2-second timeout; if the query doesn't return in time, show a "Graph loading slowly" fallback. Index `relationships(from_entity_id)` and `relationships(to_entity_id)` if not already indexed (check existing migrations).

### R5. Phase 3 community accounts not built before Phase 4

**Risk:** Phase 4 assumes `contributor` role and public user registration from Phase 3. If Phase 3 is not complete, Phase 4 comment and vote submits will fail because there are no authenticated community users.

**Mitigation:** Phase 4 development should begin only after Phase 3 community account infrastructure is complete and tested. The `VoteWidget` and `CommentSection` components should gracefully degrade to read-only (showing counts, hiding submit controls) when no authenticated session exists — this means they also work safely on a Phase 3-incomplete deploy.

---

## 14. Out of Scope for Phase 4

The following are explicitly not part of Phase 4. Do not implement them during this phase.

- Email notifications for comment replies or flag resolutions.
- Comment reactions (likes on individual comments).
- User reputation or karma system.
- Votes affecting `confidence_score` or `confidence_override` automatically.
- Community-editable entity descriptions or claim text.
- Public-facing voting leaderboards or top-voted content feeds.
- Community-submitted sources (that is Phase 3 scope).
- Any changes to `is_canonical`, `interpretation_frame`, or `confidence_score` computation.
- Full graph filtering controls on `ClaimDetailPage.tsx` (only the mini-graph for the claim's own entities).
- DM or messaging system between users.
- Subscription or follow system for entities or topics.

---

## 15. Final Recommendation

**Build Phase 4 in this order:**

**First (unblocked by each other, can parallelize):**
- Database migration for `comments`, `content_votes`, `content_flags`, and the two views.
- `community.ts` API layer (no UI dependencies).
- `getClaimGraph` in `claims.ts` (no UI dependencies).

**Second:**
- `VoteWidget` and `FlagButton` components (depend on API layer).
- `ClaimMiniGraph` component (depends on `getClaimGraph`).

**Third:**
- `CommentSection` and `CommentForm` (depend on both API and vote/flag components for consistent interaction patterns).
- Admin `CommentQueuePage` and flag integration in manager pages.

**Fourth:**
- Review queue sort control (the smallest change, with the most existing infrastructure to lean on).
- Integration of all components into `EntityDetailPage`, `ClaimDetailPage`, `SourceDetailPage`.

The `ClaimMiniGraph` (item 4.4) is the only feature in Phase 4 that has zero dependency on community accounts — it is purely a data visualization enhancement. If Phase 3 account work is delayed, `ClaimMiniGraph` can be shipped independently ahead of the community interaction features.

The comment and vote systems are only meaningful if the canonical graph (Phase 1), interpretive framing (Phase 2), and post-launch growth features (Phase 3) are already stable and populated. Do not rush Phase 4. A sparse, unframed graph with a comment system is worse than a rich, well-curated graph without one — because comments on an unstable graph create expectations about content that may change underneath them.

The single most important design constraint to maintain throughout Phase 4: **no community action can write to `claims`, `entities`, `relationships`, or `confidence_score`.** Every community signal goes into its own tables (`comments`, `content_votes`, `content_flags`) and is surfaced separately. This keeps the canonical graph authoritative.
