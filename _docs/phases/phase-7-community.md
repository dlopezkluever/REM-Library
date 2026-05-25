# Phase 7 — Community & Growth

**Goal:** The platform opens to community participation. Trusted users can submit proposed connections and source references through a moderated workflow. Authenticated users can comment on entity, claim, and source pages. A quiz/learning mode gamifies engagement with the knowledge graph. AI-powered semantic search enables natural language queries over the graph data.

**Builds on:** All previous phases. Phase 1 (auth — extends from admin-only to public user accounts), Phase 3 (entity/claim/source detail pages — adds comment sections), Phase 4 (search — extends with semantic/RAG layer)

**PRD reference:** Section 9 (Future Features — Phase 3+)

**Deliverable:** Each sub-feature is independently releasable. Public user registration is required before community contributions or comments. Admin moderation tools extend the existing AdminShell.

---

## Feature 1 — Public user accounts

1. Add a "Create account" / "Sign in" flow for non-admin public users. Extend `profiles.role` with a `'member'` enum value (add migration). All existing admin users keep their current roles unchanged.
2. Build `SignUpPage.tsx` (`/signup`) and `SignInPage.tsx` (`/signin`): standard Supabase Auth email + password forms; on success, create a `profiles` row with `role = 'member'`.
3. Add a user menu to the NavBar: "Sign in" button (unauthenticated); avatar + dropdown with "My contributions", "Sign out" (authenticated).
4. Update `useAuth.ts` and `authStore.ts` to handle both admin and member roles; update `RequireAdmin` wrapper to remain admin-only; add a `RequireAuth` wrapper (any authenticated user) for contribution and comment routes.
5. Add `created_by uuid REFERENCES profiles(id)` to `claims`, `entities` (for community-submitted items), and future `contributions` table.

---

## Feature 2 — Community contribution system

1. Add tables: `contributions (id, submitter_id, type[new_claim|new_entity|correction], entity_id_ref, payload jsonb, status[pending|approved|changes_requested|rejected], admin_notes text, created_at)`. Add migration.
2. Build `ContributeButton.tsx`: appears on entity detail pages for authenticated members. Clicking opens a Shadcn `Dialog` with a structured submission form: select entities involved (entity search, multi-select), select relationship type, write claim statement (textarea), optional source reference (URL or description).
3. Build `MyContributionsPage.tsx` (`/my-contributions`): lists the authenticated user's submissions with status badges (Pending / Approved / Changes Requested / Rejected) and the admin's notes on each.
4. Build admin moderation view (`/admin/contributions`): a queue of pending submissions. Per submission: "Approve" (creates a `draft` entity/claim from the payload, same as Phase 5's confirm flow), "Request changes" (prompts for a note sent back to the submitter), "Reject" (prompts for a note).
5. Notify submitters on status change: use Supabase Edge Function + email (via Resend or similar) triggered by a `contributions` table UPDATE where `status` changes from `pending`.

---

## Feature 3 — Comments

1. Add table: `comments (id, author_id REFERENCES profiles, target_type[entity|claim|source], target_id uuid, body text, status[pending|approved|hidden], created_at)`. Add migration. Enable RLS: members can INSERT their own comments; only admin can UPDATE status; public SELECT only where `status = 'approved'`.
2. Build `CommentSection.tsx`: renders at the bottom of entity, claim, and source detail pages. For unauthenticated visitors: "Sign in to leave a comment." For authenticated members: a `<textarea>` + submit button. Renders approved comments below with author display name and date.
3. Implement pre-moderation: submitted comments enter `status = 'pending'` and are not visible until an admin approves them. Show a "Your comment is awaiting approval" message to the submitter immediately after submitting.
4. Build admin comment moderation panel (`/admin/comments`): a queue of pending comments with Approve / Hide actions. Filter by target type (entity / claim / source).
5. Add comment count indicators to entity/claim/source cards and list views (only counting approved comments).

---

## Feature 4 — Quiz / learning mode

1. Add a `quiz_questions` table: generated (not manually authored) from the graph data. A Supabase Edge Function generates questions by querying relationships — e.g., "Which deity is associated with fire in Greek mythology?" from the `fire → Prometheus` edge; multiple-choice options drawn from nearby nodes of the same type.
2. Build `QuizPage.tsx` (`/quiz`): shows one question at a time. Question text (Lora), 4 answer options as large clickable cards. Submit answer → immediate feedback: correct answer highlighted in Verdigris; wrong answer in Terracotta.
3. After each answer: show a brief explanation linking to the relevant entity or claim (the entity/claim that generated the question), with a "View in graph →" link.
4. Add simple session scoring: track correct/total for the current session in component state; show a score summary card at the end of a 10-question set.
5. Add a "Generate quiz" Edge Function trigger that can be run by a Super Admin to regenerate the question bank from the current graph state — run after major batches of new entities are published.

---

## Feature 5 — AI-powered semantic search

1. Build a `semantic-search` Supabase Edge Function: accepts a natural language query string; calls Claude API with a system prompt that describes the graph schema and a sample of the knowledge graph (top entities by confidence); instructs Claude to decompose the query into graph traversal steps and return a synthesized answer with cited entities and claims.
2. Add a "Ask a question" mode to the search interface: a toggle in the `SearchPage.tsx` header switches between "Keyword search" and "Ask a question." In question mode, the query is routed to the semantic search function instead of the FTS function.
3. Render the semantic search response: Claude's synthesized answer in a prose block (react-markdown) at the top of the results; below it, the specific entities and claims cited in the answer (rendered as EntityChip and claim rows, same as the standard search results).
4. Add response citations: Claude's answer includes `[[entity:slug]]` and `[[claim:id]]` inline reference markers; the renderer replaces these with links to the respective detail pages.
5. Add rate limiting on the semantic search endpoint: max 10 requests per user per minute (enforced via a Supabase database counter updated in the Edge Function); show a "Rate limit reached — try again in a moment." message in the UI when the limit is hit.
