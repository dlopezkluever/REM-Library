# Phase 3 Audit & Fix Guide — Post-Launch Growth and Media

**Branch:** `growth-media`
**Date:** 2026-06-13 (re-verified against source)
**Scope:** All files changed relative to `main` across migrations, edge functions, API layer, and UI components.

---

## How to use this document

This is a **fix guide**, not just a findings list. Every item below has been re-verified against the actual code (not the spec — the implementation deviates from the spec's column names, e.g. the table uses `submitter_id` / `type` / `target_claim_id`, and the status enum uses `clarification_requested`, not `needs_clarification`). Each item states:

- **Status** — Confirmed / Confirmed (revised) / **Resolved (no action)**
- **Where** — exact file(s) and the relevant code
- **Why it matters**
- **Fix** — the concrete change to make

The **Battle Plan** at the very end groups everything into ordered work sessions you can execute top-to-bottom.

### What changed from the first-pass audit

| Item                                  | Re-verification result                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G5** ("login has no Register link") | **WRONG — already implemented.** `AdminLoginPage.tsx:87–89` renders a "Create contributor account" link to `ROUTES.REGISTER`. Removed from the active list.             |
| **B5** (admin-invite trigger)         | Confirmed, but the originally proposed `where not exists` fix is a **no-op** (equivalent to the existing `on conflict do nothing`). Corrected fix below.                |
| **B7** (query-param dedup)            | Confirmed but **understated**. The unique index and the `find_source_by_normalized_url` RPC _also_ keep query strings; a JS-only fix would desync the layers. Expanded. |
| **B2** (missing `updated_at`)         | Confirmed and **expanded**: the same direct `UPDATE` also bypasses the `admin_audit_events` audit trail that `update_claim_status()` writes.                            |
| New findings                          | N1–N4 added (audit bypass, contributor `author_id`, license badge color, crawl truncation).                                                                             |

---

## Confirmed Bugs

### B1 — `CrawlCandidate` interface is missing the `id` field

**Status:** Confirmed
**File:** `supabase/functions/trigger-site-crawl/index.ts:10–14, 329`

```ts
interface CrawlCandidate {
  title: string
  url: string
  word_count: number
}
// ...
created.push({ id: source.id, title, url, word_count: count }) // line 329
```

`created` is typed `CrawlCandidate[]`. The object literal passed to `.push()` includes `id`, which is not on the interface → TypeScript excess-property error. The client type in `admin.ts` correctly expects `id`, so the front end works, but `deno check` on the edge function fails.

**Fix:** Add `id: string` to the `CrawlCandidate` interface.

---

### B2 — Flag approvals skip `updated_at` **and** the audit trail

**Status:** Confirmed (revised — larger than first reported)
**File:** `supabase/migrations/20260613020000_phase3_growth_media_suggestions.sql` — `approve_suggestion()`, lines 227–234

```sql
elsif suggestion_row.type = 'flag_claim' then
  update public.claims
  set status = 'disputed'                 -- no updated_at, no audit event
  where id = suggestion_row.target_claim_id;
elsif suggestion_row.type = 'flag_entity' then
  update public.entities
  set status = 'disputed'                 -- no updated_at, no audit event
  where id = suggestion_row.target_entity_id;
```

Two problems, verified against the codebase:

1. **`updated_at` is left stale.** The only `updated_at` trigger is `sources_set_updated_at` (`20260530040000_sources_updated_at_trigger.sql`); `claims` and `entities` have no auto-update trigger, so the convention everywhere else (`update_claim_status`, `review_queue_hardening`, `phase1_audit_fixes`) is to set `updated_at = now()` by hand.
2. **The audit log is bypassed.** Every other claim status change goes through `update_claim_status()` (`20260608030000_fix_claim_status_transitions.sql`), which inserts an `admin_audit_events` row recording `{old_status, new_status}` and sets `updated_at`. The direct `UPDATE` here writes neither. Flag-driven disputes will be invisible in the audit history — a real gap now that contributors can trigger them.

**Fix:**

- For `flag_claim`: replace the direct `UPDATE` with `perform public.update_claim_status(suggestion_row.target_claim_id, 'disputed');`. This is `security definer` and already does the `is_admin()` check (which passes — `approve_suggestion` already asserted admin), sets `updated_at`, and writes the audit event. Verify it doesn't double-raise on the `is_admin()` check inside a `security definer` context (it reads `auth.uid()`, which is preserved).
- For `flag_entity`: there is **no** `update_entity_status` equivalent. At minimum add `updated_at = now()` to the `UPDATE entities` statement. Consider adding an `admin_audit_events` insert for parity (action e.g. `'flag_entity_disputed'`), or introduce an `update_entity_status()` helper mirroring the claims one.

---

### B3 — Article-path quality failure leaves the source stuck at `uploaded`

**Status:** Confirmed
**File:** `supabase/functions/trigger-url-fetch/index.ts:291, 305, 364–367`

`canUpdateSource` is only set `true` at line 305, **after** `assertArticlePath(url)` (291), the duplicate check (293–297), and the allowlist check (299–303). If `assertArticlePath` throws, the catch block (365) sees `canUpdateSource === false` and returns a 500 **without** calling `failSourceStage`. The source stays at `pipeline_stage = 'uploaded'` with no `processing_error`.

The spec (§6.1) treats the non-article-path check as a quality check: _"If quality check fails, source record gets `pipeline_stage = 'failed'` and a `processing_error` message."_

Note the **inconsistency** to design around: the duplicate check (295) and allowlist check (301) `return` a 400 directly rather than `throw`, so they intentionally do _not_ mark the source failed (correct — those are retryable: add the domain, then re-run). Only `assertArticlePath` throws.

**Fix:** Move `canUpdateSource = true` to immediately after the source is validated as a URL-format source in a fetchable state and its URL parses — i.e. right after the `new URL(source.url)` block (≈ line 288), **before** `assertArticlePath`. Then a thrown article-path / paywall / word-count failure writes `chunking_failed` + `processing_error`. Keep the duplicate and allowlist checks as early `return`s (they should _not_ mark failed). Confirm `failSourceStage` writes a human-readable `processing_error`.

---

### B4 — Shared mutation instance races the per-row "Process" buttons

**Status:** Confirmed
**File:** `src/pages/admin/AdminUrlCrawlPage.tsx:38–44, 138–146`

All discovered-URL rows call the **same** `processMutation.mutate(source.id)`. In React Query a single mutation instance has one in-flight state; clicking "Process" on row A then row B before A resolves replaces A's call, and `disabled={processMutation.isPending}` disables _every_ button at once. The admin can't tell which row actually ran, and earlier clicks are silently dropped.

**Fix:** Give each row independent state. Simplest: extract a `<CrawlResultRow>` child component that owns its own `useMutation({ mutationFn: () => triggerUrlFetch(source.id) })`, so loading/error/disabled state is per-row. Alternatively track a `Set<string>` of in-flight IDs and disable only the active row.

---

### B5 — Registration trigger assigns `contributor` to **every** new auth user, including invited admins

**Status:** Confirmed (proposed fix corrected)
**File:** `supabase/migrations/20260613020000_phase3_growth_media_suggestions.sql:67–91`

`handle_public_user_registration()` fires `after insert on auth.users` for **all** new users and inserts a `profiles` row with `role = 'contributor'`. Verified: no auth-user→profile trigger existed before this migration, so admins were previously provisioned manually. Now, an admin invited through the Supabase dashboard gets a `contributor` profile created at invite time, and `RequireAdmin` (`RequireAdmin.tsx:40`) blocks them with _"This account does not have internal admin access."_

**Why the original fix doesn't work:** the suggested `where not exists (select 1 from profiles where id = new.id)` is logically identical to the existing `on conflict (id) do nothing` — for a brand-new invite no profile exists yet, so both still insert `contributor`. It does not solve the problem.

**Fix (pick one):**

- **Honor an invite role from metadata.** When inviting an admin, set `raw_user_meta_data->>'role'` (e.g. via `inviteUserByEmail({ data: { role: 'editor' } })`). In the trigger, use `coalesce(nullif(new.raw_user_meta_data->>'role',''), 'contributor')` for the role, with a `check` that it's a valid `admin_role`. Public sign-ups carry no role → default `contributor`.
- **Or** keep the trigger contributor-only and document a required post-invite step: `update public.profiles set role = 'editor' where id = '<uuid>';`. Lower effort, but easy to forget.

**Immediate workaround (until fixed):** manually elevate any new admin after their first login with the `UPDATE` above.

---

### B6 — `claim_correction` approval drops `interpretation_frame` and `is_canonical`

**Status:** Confirmed
**File:** `supabase/migrations/20260613020000_phase3_growth_media_suggestions.sql:213–226`

```sql
elsif suggestion_row.type = 'claim_correction' then
  insert into public.claims (statement, detailed_argument, author_id, status)
  values (suggestion_row.suggestion_text, suggestion_row.reason,
          suggestion_row.submitter_id, 'draft')
  returning id into new_claim_id;
  -- copies claim_entities from the original, but not the framing
```

Both Phase-2 columns exist on `claims` (`20260613010000_phase2_public_launch_schema.sql`). The corrected draft is created with `interpretation_frame = null` and `is_canonical = false`. If the original was framed (e.g. `canonical_rem`) the admin must re-apply it manually before publishing, or the corrected claim silently loses its frame. `new_claim` legitimately has no source frame, so this applies to `claim_correction` only.

**Fix:** Carry `interpretation_frame` from the original claim; keep `is_canonical = false` (corrections start non-canonical and are promoted deliberately):

```sql
insert into public.claims (statement, detailed_argument, author_id, status, interpretation_frame, is_canonical)
select suggestion_row.suggestion_text, suggestion_row.reason, suggestion_row.submitter_id,
       'draft', c.interpretation_frame, false
from public.claims c
where c.id = suggestion_row.target_claim_id
returning id into new_claim_id;
```

---

### B7 — URL normalization keeps query strings, defeating dedup at **all three** layers

**Status:** Confirmed (expanded)
**Files:** `trigger-url-fetch/index.ts:59–69`, `trigger-site-crawl/index.ts:46–57`, `20260608010000_sources_url_unique.sql`, `20260608040000_phase1_audit_fixes.sql:5–16` (`find_source_by_normalized_url`)

Both `normalizeUrl` functions strip the hash, trailing slash, and lowercase the host, but never touch `url.search`. So `…/article?utm_source=x` is treated as distinct from `…/article`. **Critically**, the server-side dedup layers do the same:

- The unique index normalizes only `lower(regexp_replace(url, '/$', ''))` — query string included.
- `find_source_by_normalized_url` compares `lower(regexp_replace(sources.url,'/$',''))` to the same on the input — query string included.

This means fixing only the JS `normalizeUrl` would make the JS-normalized URL (no query) fail to match a stored `sources.url` that still has its query — **desyncing** the check. All three must change together, or none meaningfully dedup.

**Fix (do all together):**

1. In both `normalizeUrl` functions add `url.search = ''` (or strip only tracking params if you want to preserve meaningful queries — but full strip is simplest and matches article semantics).
2. Update `find_source_by_normalized_url` to strip the query before comparing (e.g. `regexp_replace(url, '\?.*$', '')` ahead of the trailing-slash strip), on **both** the stored column and the input.
3. Replace the unique index with one that strips the query too, e.g. `lower(regexp_replace(regexp_replace(url, '\?.*$', ''), '/$', ''))`. **Before applying**, scan existing rows for newly-colliding normalized URLs and resolve duplicates, or the index creation fails.

---

### B8 — `InlineMediaPlayer` flashes the fallback link during the initial signed-URL fetch

**Status:** Confirmed
**File:** `src/components/source/InlineMediaPlayer.tsx:22–25, 70–76`

`signedUrl` starts `null`, so `src` is `null`, so the `if (failed || !src)` guard renders the fallback `<Link>` on first paint — before the async fetch resolves. On a fast network the user sees the link appear then vanish as the player mounts; they may click it mid-flash.

**Fix:** Add an explicit `loading` state initialized `true`, set `false` in the effect after the fetch settles (success or failure). Render a small skeleton/placeholder while `loading`, the fallback link only when `failed`, and the player when `src` is ready. This also cleanly distinguishes "still loading" from "genuinely failed" (relevant to M7).

---

## Spec Gaps

### G1 — No rate limiting on suggestion submissions

**Status:** Confirmed
**Spec:** §13 R4 — _"Rate-limit suggestion submissions per user (e.g., 10 per day)."_

No limit exists in `submitSuggestion` (`src/lib/api/suggestions.ts`), in RLS, or in the DB. Email verification is required (mitigates but doesn't cap volume).

**Fix:** Add the count to the RLS insert `with check` on `suggestions`:

```sql
and (
  select count(*) from public.suggestions
  where submitter_id = auth.uid()
    and created_at > now() - interval '24 hours'
) < 10
```

Keep this in mind alongside the existing insert policy (lines 136–148), which already gates on role.

---

### G2 — Approve/Reject/Clarify fire immediately with no confirmation

**Status:** Confirmed
**Spec:** §9.7 — _"Approve opens a confirmation modal showing the full suggestion text and the draft content that will be created."_
**File:** `src/pages/admin/AdminSuggestionManagerPage.tsx:177–205`

Buttons call the mutation directly. A misclick on Approve immediately creates a draft claim (or disputes a claim/entity). Combined with M1 (shared note) the blast radius of a stray click is real.

**Fix:** Add a confirmation dialog for Approve (at least) showing the full `suggestion_text`, `reason`, target, and what will be created/disputed. Fold the per-action admin note into this dialog (resolves M1).

---

### G3 — Suggestion manager has no filters and no pagination

**Status:** Confirmed
**Spec:** §9.7 — _"Filters: by status … by type. Paginated table."_
**Files:** `AdminSuggestionManagerPage.tsx`, `getAdminSuggestions` (`admin.ts:1324`)

`getAdminSuggestions` selects all suggestions in all states ordered by date, no filter args, no range. The page renders them all. This will degrade as the queue grows. (See also M10.)

**Fix:** Add `status` and `type` params to `getAdminSuggestions` (`.eq(...)` when provided) plus `.range()` pagination and a default `.limit()`. Add filter controls and pager to the page.

---

### G4 — No `flag_entity` entry point from `EntityDetailPage`

**Status:** Confirmed
**File:** `src/pages/entity/EntityDetailPage.tsx:357–359, 489–497`

Only `type="new_claim"` ("Suggest a claim") is wired. The `flag_entity` type is fully supported by the schema constraint, RLS, and `approve_suggestion`, but there is no UI to submit one.

**Fix:** Add a "Flag this entity" action that opens `SuggestionDialog` with `type="flag_entity"` and `targetEntityId`. The dialog and `submitSuggestion` already support it.

---

### G6 — Contributors have no working post-login path

**Status:** Confirmed
**Files:** `AdminLoginPage.tsx:18–24, 33`, `lib/adminRedirect.ts:11–24`, `RequireAdmin.tsx:36–48`, `RegisterPage.tsx:104–106`

The only login form is `/admin/login`. After sign-in it navigates to `getAdminRedirectDestination(...)`, which returns `ROUTES.ADMIN_DASHBOARD` for anyone not coming from an `/admin/*` path. A contributor therefore lands on the admin dashboard and is blocked by `RequireAdmin` ("does not have internal admin access"). The loop is self-reinforcing: `RegisterPage` links back to `/admin/login` ("Sign in"), which dead-ends them again.

Note: email _verification_ lands fine — `RegisterPage` sets `emailRedirectTo` to `ROUTES.GRAPH`. The break is the **returning-login** case.

**Fix (pick one):**

- In `AdminLoginPage`, after sign-in inspect the role; if `contributor`, navigate to `/` (or the graph) instead of the admin dashboard. Lowest effort.
- Or add a dedicated public `/login` route used by `RegisterPage`/`SuggestionDialog` that redirects to `/` (or the prior location) on success, leaving `/admin/login` for staff.

---

## Medium Concerns

### M1 — Single shared `adminNote` across all rows and all actions

**Status:** Confirmed
**File:** `AdminSuggestionManagerPage.tsx:44, 58–68`

One top-of-page textarea feeds Approve, Reject, **and** Clarify for **every** row. A rejection note typed for row A is silently attached if the admin then approves row B. Best resolved by moving the note into the per-action confirmation dialog (G2) so it's scoped to one action on one row.

---

### M2 — "Clarify" is enabled regardless of suggestion status (and accepts an empty note)

**Status:** Confirmed
**File:** `AdminSuggestionManagerPage.tsx:196–205`; `requestSuggestionClarification` (`admin.ts:1377`)

Approve is disabled for `approved`, Reject for `rejected`, but Clarify has no status guard — an admin can revert an already-approved/rejected suggestion to `clarification_requested`. Also, `requestSuggestionClarification` accepts a `null` note, yet the whole point of clarification is a message back to the submitter; an empty note gives them nothing.

**Fix:** Disable Clarify for terminal statuses (`approved`, `rejected`). Require a non-empty note for the clarify action (validate in the handler/dialog).

---

### M3 — Site crawl fetches full HTML of every candidate for a word count (N+1)

**Status:** Confirmed
**File:** `trigger-site-crawl/index.ts:304–308`

After discovery, the function `await sleep(delay)` + full `fetchText(url)` per candidate just to compute `word_count` for the review table. With the 1s minimum delay and up to `maxCandidates = 50`, that's ≥ 50s of crawl time before the admin sees anything, plus 50 full page downloads.

**Fix:** If the word count isn't decisive for the admin's process/skip choice, drop the per-URL fetch and create records from sitemap/link metadata only (title from `<title>` already requires a fetch for link-discovery, but sitemap discovery does not). Alternatively compute word counts lazily/on-demand, or cap the number of word-counted candidates and label the rest "unknown".

---

### M4 — Null license suppresses the fair-use warning

**Status:** Confirmed
**File:** `src/pages/sources/SourceDetailPage.tsx:17–30, 216`

```ts
const isOpenLicense = (license) => { if (!license) return true; ... }
// showFairUseWarning = !isOpenLicense(source.license) && !source.fair_use_rationale
```

A source with **no** license is treated as open → no warning. But "no license" legally defaults to all-rights-reserved, and crawled sources start with `license = null`. So exactly the sources most likely to need a rights review get no prompt.

**Fix:** Treat `null` as "unknown", not "open". Either show the existing warning for null+no-rationale, or add a softer "License not documented" notice distinct from the non-open warning. Update `showFairUseWarning` accordingly.

---

### M5 — No `flag_claim` entry point from `ClaimDetailPage`

**Status:** Confirmed
**File:** `src/pages/claim/ClaimDetailPage.tsx:133–135, 264–273`

Only `claim_correction` ("Suggest a correction") is wired. There's no way for a contributor to flag a claim as disputed without authoring a full correction, even though `flag_claim` is fully supported end-to-end. Mirror of G4.

**Fix:** Add a "Flag this claim" action opening `SuggestionDialog` with `type="flag_claim"` and `targetClaimId`.

---

### M6 — No `source_type` (origin) on claims; suggestion drafts are mislabeled by author

**Status:** Confirmed (expanded)
**Spec:** §13 R3.
**Files:** migrations (no `source_type` column anywhere — verified), `approve_suggestion` lines 202, 214

Two related problems make contributor-suggested drafts indistinguishable from AI-extracted drafts in the admin claim manager:

1. There is no `source_type` column (`ai_extraction` / `admin_manual` / `contributor_suggestion`) to filter on.
2. `approve_suggestion` sets `author_id = suggestion_row.submitter_id`, so a suggestion-derived draft is _authored by the contributor's profile_. In the claim manager and on claim pages the "author"/"researcher" line will show the contributor's display name, conflating contributor identity with editorial authorship.

**Fix:** Add `source_type` to `claims` (default `'ai_extraction'` or `'admin_manual'` as appropriate for existing rows), set it to `'contributor_suggestion'` in both insert branches of `approve_suggestion`, and add a filter in the admin claim manager. Decide deliberately whether `author_id` should be the contributor or the approving admin — and make the display reflect that choice.

---

### M7 — `InlineMediaPlayer` never refreshes an expired signed URL

**Status:** Confirmed
**Spec:** §13 R5.
**File:** `InlineMediaPlayer.tsx:38, 86, 98`

The signed URL is fetched once on mount (1-hour TTL via `getSignedSourceFileUrl`). `onError` just sets `failed = true` → fallback link. A user who opens a page, reads for an hour, then clicks play hits an expired URL and loses the player.

**Fix:** On the media element's `error` event, re-fetch the signed URL once and retry before falling back (guard against infinite retry loops). Since the players are collapsed-until-clicked here, fetching the signed URL on first expand rather than on mount is an even simpler mitigation and also resolves B8's flash. Consider doing both.

---

### M8 — NavBar "Register" link shows for everyone, including signed-in admins

**Status:** Confirmed
**File:** `src/components/layout/NavBar.tsx:168–174`

`NavBar` has no auth awareness; the Register link renders unconditionally, so authenticated contributors and admins still see "Register" beside "Sources".

**Fix:** Read session/role (e.g. `useAuthStore` / `useAuth`) and render Register only when unauthenticated. Optionally swap in an account/sign-out affordance when signed in.

---

### M9 — Rights fields have no visible `<label>` (placeholder/aria-label only)

**Status:** Confirmed (minor)
**File:** `src/pages/admin/AdminSourceDetailPage.tsx:514–539`

The License/Attribution inputs and the Rights-notes/Fair-use-rationale textareas use only `placeholder` + `aria-label`. They sit under a single `MetadataRow label="Rights Metadata"`, so the group is labeled, but each field's label vanishes once typing begins. Screen readers are fine (aria-label present); the issue is sighted usability.

**Fix:** Add visible per-field `<label>`s (or persistent caption text), matching the labeled fields elsewhere in the page.

---

### M10 — `getAdminSuggestions` fetches all rows with no limit

**Status:** Confirmed
**File:** `src/lib/api/admin.ts:1324–1342`

No `.limit()` / `.range()`. Fold into G3's pagination work; in the meantime add a sane default `.limit(100)`.

---

## Minor Notes

- **N1 (license badge color).** `SourceDetailPage.tsx:138–142` renders the license badge with amber "warning" styling for _any_ license, including open ones (CC, public domain). Use a neutral style for open licenses; reserve amber for non-open/unknown. Cosmetic.
- **N2 (crawl truncation is silent).** `trigger-site-crawl` caps discovery at `maxCandidates = 50` via `.slice(0, 50)` with no signal to the admin that more existed (spec §13 R2 anticipates this). Surface "showing first 50 of N" or log the truncation.
- **`<track kind="captions" />`** with no `src` on both players — satisfies a11y lint, functional no-op. Acceptable.
- **Entity hero/profile `alt=""`** (`EntityDetailPage.tsx:290, 307`) — decorative is defensible; `alt={entity.name}` on the profile image would be friendlier. Low priority.
- **Status-enum naming:** implementation uses `clarification_requested`; spec said `needs_clarification`. Internally consistent — leave as-is, just don't trip over it.
- **Suggestion insert breadth:** the `profiles contributor self insert` policy and the suggestions insert policy both allow `viewer`/`editor`/`super_admin` to submit, not just `contributor`. Not a security risk; broader than the spec implied.

---

## Summary Table

| #      | Severity | Area         | Issue                                              | Status                             |
| ------ | -------- | ------------ | -------------------------------------------------- | ---------------------------------- |
| B1     | Bug      | Edge fn      | `CrawlCandidate` missing `id` (TS error)           | Confirmed                          |
| B2     | Bug      | DB           | Flag approval skips `updated_at` **and** audit log | Confirmed (revised)                |
| B3     | Bug      | Edge fn      | Article-path failure doesn't fail the source       | Confirmed                          |
| B4     | Bug      | UI           | Shared mutation races crawl "Process" buttons      | Confirmed                          |
| B5     | Bug      | DB           | Auth trigger gives invited admins `contributor`    | Confirmed (fix corrected)          |
| B6     | Bug      | DB           | `claim_correction` drops `interpretation_frame`    | Confirmed                          |
| B7     | Bug      | Edge fn + DB | Query params not stripped (3 layers)               | Confirmed (expanded)               |
| B8     | Bug      | Component    | Fallback link flashes during URL fetch             | Confirmed                          |
| ~~G5~~ | ~~Gap~~  | ~~UI~~       | ~~Login has no Register link~~                     | **Resolved — already implemented** |
| G1     | Gap      | DB/RLS       | No suggestion rate limiting                        | Confirmed                          |
| G2     | Gap      | UI           | No approval confirmation modal                     | Confirmed                          |
| G3     | Gap      | UI/API       | No filters/pagination on suggestions               | Confirmed                          |
| G4     | Gap      | UI           | No `flag_entity` entry point                       | Confirmed                          |
| G6     | Gap      | Auth         | Contributors dead-end after login                  | Confirmed                          |
| M1     | Medium   | UI           | Shared `adminNote` across actions/rows             | Confirmed                          |
| M2     | Medium   | UI           | Clarify unguarded; empty note allowed              | Confirmed                          |
| M3     | Medium   | Edge fn      | N+1 HTML fetches for word counts                   | Confirmed                          |
| M4     | Medium   | UI           | Null license suppresses fair-use warning           | Confirmed                          |
| M5     | Medium   | UI           | No `flag_claim` entry point                        | Confirmed                          |
| M6     | Medium   | DB           | No `source_type`; drafts authored by contributor   | Confirmed (expanded)               |
| M7     | Medium   | Component    | No signed-URL refresh on error                     | Confirmed                          |
| M8     | Medium   | UI           | Register link shown to authed users                | Confirmed                          |
| M9     | Minor    | UI           | Rights fields have no visible label                | Confirmed                          |
| M10    | Minor    | API          | `getAdminSuggestions` has no limit                 | Confirmed                          |
| N1     | Minor    | UI           | License badge always amber                         | New                                |
| N2     | Minor    | Edge fn      | Crawl truncates at 50 silently                     | New                                |

---

## Battle Plan

Ordered to minimize context-switching and respect dependencies. Each session is independently shippable. Migrations target the **online** Supabase instance (`mbnepcnvjbrtamvwlicl`) — there is no local DB.

### Session 1 — Database / migration fixes (one new migration)

Author a single new migration `20260613030000_phase3_audit_fixes.sql` containing:

1. **B2 / flag approvals** — in `approve_suggestion`, replace `flag_claim`'s direct `UPDATE` with `perform public.update_claim_status(target_claim_id, 'disputed')`; add `updated_at = now()` (and ideally an audit insert) to the `flag_entity` branch.
2. **B6 / framing** — rewrite the `claim_correction` insert as the `select … from claims` form that carries `interpretation_frame` (keep `is_canonical = false`).
3. **M6 / origin** — add `source_type` to `claims` (with a sensible default + backfill) and set `'contributor_suggestion'` in both insert branches of `approve_suggestion`; decide the `author_id` semantics.
4. **G1 / rate limit** — add the 24h count to the suggestions insert `with check`.
5. **B7 (DB half)** — replace the unique index and update `find_source_by_normalized_url` to strip query strings; **first** scan for new collisions and resolve them.
6. **B5 / admin role** — switch the trigger to honor `raw_user_meta_data->>'role'` (validated) with `contributor` default; or document the manual elevation step if deferring.

Re-run the suggestion RPC integration checks (§11) after applying.

### Session 2 — Edge functions

7. **B1** — add `id: string` to `CrawlCandidate`.
8. **B7 (JS half)** — add `url.search = ''` to both `normalizeUrl`s (keep in lockstep with the Session 1 DB change).
9. **B3** — move `canUpdateSource = true` to right after URL validation, before the quality checks; keep duplicate/allowlist as early returns. Verify a tag-page URL ends at `chunking_failed` with a message.
10. **M3** — drop or defer the per-URL word-count fetch in the crawl (decide whether the count is worth the latency).
11. **N2** — surface crawl truncation when discovery exceeds `maxCandidates`.

Run `deno check` on both functions; deploy.

### Session 3 — Auth & navigation flow

12. **G6** — redirect `contributor` logins away from the admin dashboard (role check in `AdminLoginPage`, or a public `/login` route).
13. **M8** — gate the NavBar Register link on auth state.
14. (G5 already done — no action.)

### Session 4 — Suggestion admin UX

15. **G2 + M1 + M2** — add a per-action confirmation dialog carrying a scoped note; disable Clarify for terminal statuses; require a non-empty clarify note. This collapses three findings into one change.
16. **G3 + M10** — add `status`/`type` filters + pagination to `getAdminSuggestions` and the manager page; default limit in the interim.
17. **B4** — extract a per-row crawl component with its own mutation so "Process" buttons are independent.

### Session 5 — Public suggestion entry points & media polish

18. **G4** — "Flag this entity" → `SuggestionDialog type="flag_entity"`.
19. **M5** — "Flag this claim" → `SuggestionDialog type="flag_claim"`.
20. **B8 + M7** — add a loading state (kill the fallback flash) and re-fetch the signed URL on the media `error` event / on first expand.
21. **M4 + N1** — treat null license as "unknown" (show a softer notice); neutral badge color for open licenses.

### Session 6 — Cleanup

22. **M9** — visible labels on the rights fields.
23. Minor notes (alt text, etc.) as time permits.

### Suggested verification per session

- **DB:** integration-test `approve_suggestion` for all four types — confirm `claim_correction` keeps the frame, flag branches set `disputed` + write an audit row + bump `updated_at`, and the rate-limit check rejects the 11th submission in 24h. Confirm the new unique index rejects `?utm`-only-differing URLs.
- **Edge:** article URL passes; tag/paywall/short pages now land at `chunking_failed` with a message; non-allowlisted domain still returns a plain 400 without marking failed.
- **UI:** contributor login lands on a usable page; flag entry points create `pending` suggestions; approve dialog blocks misclicks; media player shows no link flash and recovers from an expired URL.
