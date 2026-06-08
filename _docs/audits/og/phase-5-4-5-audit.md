# Phase 5 Features 4 and 5 Audit Guide

**Audited:** 2026-05-31  
**Branch:** `admin-injester`  
**Scope:** Feature 4 (Claude API extraction) and Feature 5 (extraction review queue UI, publication controls, confidence recomputation)

This document is the remediation guide for the current Feature 4 and Feature 5 implementation. It validates the earlier audit concerns against the codebase, removes or downgrades items that are not actually defects, and adds issues found during a second pass.

## Files Reviewed

| File                                             | Role                                         |
| ------------------------------------------------ | -------------------------------------------- |
| `supabase/functions/trigger-extraction/index.ts` | Claude extraction engine                     |
| `supabase/functions/_shared/pipeline.ts`         | Edge Function auth and pipeline helpers      |
| `supabase/functions/compute-confidence/index.ts` | Post-publish confidence recomputation        |
| `src/lib/api/admin.ts`                           | Admin API calls and review action writes     |
| `src/pages/admin/AdminReviewQueuePage.tsx`       | Review queue source list                     |
| `src/components/admin/ExtractionReviewPanel.tsx` | Review panel and five actions                |
| `src/pages/admin/AdminEntityManagerPage.tsx`     | Entity publish/draft controls                |
| `src/pages/admin/AdminClaimManagerPage.tsx`      | Claim admin placeholder                      |
| `supabase/migrations/*.sql`                      | Enums, core tables, RLS, ingestion hardening |
| `src/types/database.ts`                          | Generated database types                     |

## Executive Summary

The UI surface for Features 4 and 5 exists and the happy path builds, but the review workflow is not yet safe enough for production curation. The main problem is that review actions are multi-table writes from the browser with no transaction. Partial failures can create draft entities, claims, anchors, relationships, or alias updates while the extraction item remains pending and retryable.

The second major issue is the evidence model. Entity review actions create `source_anchors`, but the schema has no canonical entity-to-anchor relationship, and `compute-confidence` only scores entities through `claim_entities -> claim_evidence -> source_anchors`. As a result, confirmed or merged entity evidence does not affect confidence. Claim review has the opposite problem: it creates claims and relationships, but only links entities that already exist by name, so claims reviewed before their related entity items can become permanently under-linked.

The third issue is publication semantics. Feature 5 adds entity publishing, but reviewed claims stay draft, sources stay draft unless separately handled, and public relationship reads are gated only by published endpoints. This can expose graph edges backed by draft claims while confidence scores remain zero because source evidence is still attached to draft sources.

## Confirmed Issues To Fix

### P0-1. Review actions are not atomic

**Severity:** Critical  
**Area:** Data integrity  
**Status:** Confirmed

`reviewExtractionItem` performs a sequence of browser-side Supabase writes and only updates the extraction row at the end (`src/lib/api/admin.ts:1205-1364`). Examples:

- Entity confirm/edit: insert or update `entities`, insert `source_anchors`, then update `extractions`.
- Claim confirm/edit: insert `claims`, insert `source_anchors`, insert `claim_evidence`, upsert `claim_entities`, insert/update `relationships`, then update `extractions`.
- Merge: update target entity aliases, insert `source_anchors`, then update `extractions`.
- Split: create two entities, insert `source_anchors`, then update `extractions`.

Any failure after the first write leaves database state that the UI does not understand. Retrying can duplicate entities, claims, anchors, and relationships or overwrite an existing draft entity.

**Fix approach:**

Move review mutations into a database transaction. Prefer a `security definer` Postgres RPC such as `review_extraction_item(...)` that:

1. Locks the `extractions` row with `FOR UPDATE`.
2. Validates the target item is still pending.
3. Performs all entity/claim/anchor/link/relationship writes.
4. Updates the nested `extraction_data` review metadata.
5. Updates the extraction row status.
6. Commits or rolls back as a single unit.

Keep the React API as a thin RPC wrapper. This same RPC should also centralize validation and audit metadata.

### P0-2. Entity source evidence is not represented canonically

**Severity:** Critical  
**Area:** Evidence model / confidence scoring  
**Status:** Confirmed and broader than the original merge-only finding

Entity confirm, edit, merge, and split actions all create `source_anchors` and store the anchor id inside `extraction_data`, but nothing canonical links those anchors to the resulting entity. There is no `entity_source_anchors` table or equivalent relationship in the current schema. `compute-confidence` only traverses claim evidence, so these entity anchors do not contribute to `entities.confidence_score`.

This affects:

- Confirm/edit entity: `src/lib/api/admin.ts:1299-1315`
- Merge entity: `src/lib/api/admin.ts:1238-1265`
- Split entity: `src/lib/api/admin.ts:1272-1285`
- Confidence traversal: `supabase/functions/compute-confidence/index.ts:71-104`

**Fix approach:**

Add a canonical entity evidence table:

```sql
create table public.entity_source_anchors (
  entity_id uuid not null references public.entities(id) on delete cascade,
  anchor_id uuid not null references public.source_anchors(id) on delete cascade,
  extraction_id uuid references public.extractions(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (entity_id, anchor_id)
);
```

Then update confirm/edit/merge/split review actions to insert rows into this table inside the transaction. Update `compute-confidence` to include entity direct evidence plus claim evidence. Add RLS mirroring `claim_evidence`/`source_anchors`.

### P0-3. Claim review can create permanently under-linked claims

**Severity:** High  
**Area:** Graph correctness  
**Status:** Newly confirmed

`createDraftClaim` links involved entities by calling `getEntitiesByNames(input.entitiesInvolved)` (`src/lib/api/admin.ts:595`). That lookup only checks existing entity rows by name. If the claim references entity names extracted in the same source but those entity items are still pending, the claim is created with missing `claim_entities` rows. There is no later reconciliation when the entity items are confirmed.

The relationship creation is also limited to the first two matched entities (`src/lib/api/admin.ts:610-617`). For claims involving three or more entities, the remaining pairs are not represented as graph relationships.

**Fix approach:**

Inside the transactional review RPC:

1. Resolve involved entity names against canonical name and aliases.
2. If an involved entity is not found, either block claim confirmation with a clear error or create/link a draft entity placeholder.
3. Store unresolved names in review metadata if blocking is too strict.
4. For multi-entity claims, define the intended relationship policy: all pairs, first pair only, or an explicit from/to relationship model. Implement that consistently.
5. Add a repair/reconciliation RPC for existing draft claims with unresolved names.

### P0-4. Publication semantics are incomplete and can expose draft-backed graph edges

**Severity:** High  
**Area:** Publication workflow / public graph correctness  
**Status:** Newly confirmed

Feature 5 publishes entities only. Claims created by review remain `draft` (`src/lib/api/admin.ts:569-576`), and `AdminClaimManagerPage` is still a placeholder. However relationships are created during claim review and public relationship RLS only checks that both endpoint entities are published; it does not require any backing claim in `claim_ids` to be published (`supabase/migrations/20260523040000_rls.sql:64-83`). Once endpoints are published, the public graph can show relationships whose supporting claims are still draft.

Confidence scoring has a related mismatch: `compute-confidence` only counts evidence whose source row is `published` (`supabase/functions/compute-confidence/index.ts:52-68`), but source upload creates sources as `draft`, and the admin source UI currently archives/restores sources rather than publishing them. Publishing an entity may therefore trigger confidence computation and still produce `0`.

**Fix approach:**

Define the publication model explicitly:

- If graph edges should only appear when claims are published, update relationship reads/RLS to require at least one published backing claim.
- Add claim publication controls in `/admin/claims`, or publish claims as part of a curated batch workflow.
- Define whether sources must be published for evidence to count. If yes, add source publish controls or auto-publish approved source anchors through a new anchor-level status.
- Trigger confidence recomputation after publishing entities, claims, and sources/anchors, not only after entity status changes.

### P1-1. Entity creation and slug generation have race conditions

**Severity:** High  
**Area:** Data integrity  
**Status:** Confirmed

`createOrUpdateDraftEntity` does `findEntityByName` and then insert/update (`src/lib/api/admin.ts:489-535`). `getUniqueEntitySlug` similarly checks slug availability before insert (`src/lib/api/admin.ts:261-282`). Concurrent admins can race between the select and insert. The slug has a unique constraint, so one insert can fail; the name has no case-insensitive unique constraint, so duplicate names can be created.

`findEntityByName` also uses `.ilike('name', normalizedName)` and checks only the `name` column, not aliases (`src/lib/api/admin.ts:538-552`).

**Fix approach:**

Add database-level uniqueness and use upserts/transactional conflict handling:

- Add a normalized-name generated column or unique index on `lower(trim(name))` for non-archived entities if the product wants unique active names.
- Keep `slug` unique but generate it inside the RPC and retry on unique violation.
- Resolve by exact normalized name and aliases, not only `name`.
- For published entity name collisions, do not silently update the published entity. Return a merge-required error or require an explicit merge action.

### P1-2. Admin review mutations lack server-side validation and audit boundary

**Severity:** High  
**Area:** Security / maintainability  
**Status:** Confirmed, but RLS is doing the current authorization gate

The browser calls Supabase table mutations directly from `src/lib/api/admin.ts`. RLS restricts writes through `public.is_admin()`, so this is not an unauthenticated-write bug. The issue is that payload validation, transactional behavior, audit logging, and rate limiting are all spread across client code or absent.

Examples:

- Empty or whitespace entity names are only normalized client-side and not rejected before insert.
- Split can submit the default blank second entity (`src/components/admin/ExtractionReviewPanel.tsx:312-323`, `src/components/admin/ExtractionReviewPanel.tsx:631-641`).
- Claim edit can submit empty statements or unresolved entity names.

**Fix approach:**

Use the same transactional RPC from P0-1 as the server-side validation boundary. Enforce:

- Non-empty entity names and claim statements.
- Valid entity and relationship enum values.
- Non-empty split first and second entities.
- Target entity exists and is not archived for merge.
- The current admin id is recorded from `auth.uid()` in the RPC.
- Optional `admin_audit_events` rows for review actions.

Keep client validation for UX, but do not rely on it for correctness.

### P1-3. `compute-confidence` accepts arbitrary strings and interpolates them into a PostgREST filter

**Severity:** High  
**Area:** Security / robustness  
**Status:** Confirmed

`getEntityIds` only filters values to strings (`supabase/functions/compute-confidence/index.ts:28-47`). `updateRelationshipWeights` then interpolates those strings into `.or(...)` (`supabase/functions/compute-confidence/index.ts:114-117`).

PostgREST URL encoding makes direct SQL injection unlikely, but this is still avoidable filter-string injection and can produce malformed queries. The function should also validate UUID shape before performing service-role updates.

**Fix approach:**

- Validate `entity_ids` as UUIDs.
- Cap batch size.
- Replace the interpolated `.or()` with two `.in()` queries, dedupe relationship ids in memory, then update.
- Consider moving confidence recomputation into a Postgres RPC if the scoring model becomes more complex.

### P1-4. Relationship weight recomputation can use only one endpoint score

**Severity:** Medium  
**Area:** Graph weighting correctness  
**Status:** Newly confirmed

`updateRelationshipWeights` receives only the recomputed scores for the affected entity ids. If a relationship includes one affected entity and one unaffected entity, `knownScores` contains only the affected endpoint, so the relationship weight becomes that one score rather than an average of both endpoints (`supabase/functions/compute-confidence/index.ts:123-137`).

**Fix approach:**

When updating a relationship, fetch both endpoint confidence scores from `entities` and compute weight from the effective scores for both endpoints. If `confidence_override` should affect graph sizing, decide whether relationship weights should also use the override.

### P1-5. Extraction review queue fetches all pending extraction JSON without pagination

**Severity:** Medium  
**Area:** Performance  
**Status:** Confirmed

`getPendingExtractionReviewSources` selects every pending extraction with `select('*')` and no limit (`src/lib/api/admin.ts:1023-1028`). Each row can contain a large `extraction_data` JSON payload. The function then fetches all referenced chunks and sources for that unbounded result.

**Fix approach:**

Add pagination or source-scoped loading:

1. First query a paginated source summary: source id/title plus pending extraction count and pending item count.
2. Load extraction details only for the selected source.
3. Select only needed columns.
4. Add an index strategy for `extractions.status`, `chunks.source_id`, and any source grouping RPC.

### P1-6. Entity manager fetches and renders all non-archived entities

**Severity:** Medium  
**Area:** Performance / UX  
**Status:** Confirmed

`getAdminEntities` selects all non-archived entities with no limit (`src/lib/api/admin.ts:1111-1123`). `AdminEntityManagerPage` renders them in one table and stores selected ids in component state.

**Fix approach:**

Add server-side pagination, search, and status/type filters. Bulk publish should operate on explicitly selected ids from the current page, or on a filtered query through an RPC with a confirmation step.

### P1-7. Validation-failed extractions are counted but not actionable

**Severity:** Medium  
**Area:** Review completeness  
**Status:** Confirmed

`getPendingExtractionReviewSources` includes validation-failed extraction rows even when they have no parsed review items (`src/lib/api/admin.ts:1071-1089`). The panel only renders `extraction.items`, so a validation-failed extraction can appear in source counts but show no actionable item. The admin cannot inspect the validation error, view the raw response, reject it, or re-run extraction from this page.

**Fix approach:**

Add an explicit validation-failed review state:

- Show chunk, validation error, provider status, retry count, and raw response preview/download.
- Provide actions: reject failed extraction, mark needs re-run, or open a manual extraction editor.
- If raw responses are stored only on the first row of a failed batch, link sibling rows by `batch_error_id` and expose the shared raw response.

### P1-8. Feature has little targeted test coverage

**Severity:** Medium  
**Area:** Regression risk  
**Status:** Newly confirmed

The build and existing test suite pass, but there are no focused tests around review item parsing, row-status derivation, review action payload validation, confidence scoring, or publication side effects.

**Fix approach:**

After moving review writes into RPCs, add tests at two levels:

- TypeScript unit tests for pure helpers such as item parsing, source queue grouping, and UI validation.
- SQL/RPC integration tests for confirm/edit/reject/merge/split transaction behavior and rollback on induced failure.
- Edge Function tests or smoke tests for `compute-confidence` with direct entity evidence, claim evidence, draft/published sources, and relationship weight updates.

### P2-1. Rate limiting is implemented twice

**Severity:** Medium  
**Area:** Simplicity / latency  
**Status:** Confirmed, but not currently breaking correctness

Feature 4 asked for a simple 5 req/s token bucket. The implementation has both:

- In-process `TokenBucketRateLimiter(5, 5)` (`supabase/functions/trigger-extraction/index.ts:145-148`, `437`)
- DB-backed `claim_provider_request_slot` with `spacing_ms = 200` (`supabase/functions/trigger-extraction/index.ts:715`)

The DB-backed limiter is the only one that works across Edge Function instances. The in-process limiter adds complexity but does not provide cross-instance safety.

**Fix approach:**

Keep the DB-backed limiter and remove the in-process limiter, or keep only a local token bucket if the team intentionally accepts per-instance throttling. Document the decision in the function. If the spec must literally remain "token bucket", implement the token bucket in Postgres rather than serial spacing.

### P2-2. Failed Claude batch raw response is stored only on the first chunk row

**Severity:** Medium  
**Area:** Debuggability  
**Status:** Confirmed

When a batch validation fails, `toExtractionRow` receives `includeRawResponse` only for `chunk.id === batch[0]?.id` (`supabase/functions/trigger-extraction/index.ts:718-724`). Sibling failed rows share `batch_error_id` but have `raw_response: null`.

This saves storage, but the UI currently has no way to find the sibling raw response. If the first row is reviewed or hidden, later rows can appear to have no raw provider output.

**Fix approach:**

Either:

- Store the raw response in every validation-failed row, or
- Add a `provider_responses`/`extraction_batches` table keyed by `batch_error_id` and point each failed extraction to it.

The second option is cleaner for storage and debugging.

### P2-3. Claude max-token estimate undercounts repetitive chunks

**Severity:** Low  
**Area:** Extraction quality  
**Status:** Confirmed

`getClaudeMaxTokens` estimates `batchWords` with `tokenize(chunk.raw_text).size`, and `tokenize` returns a `Set` (`supabase/functions/trigger-extraction/index.ts:370-378`). Duplicate words are ignored, so repetitive transcript chunks can have their output budget underestimated.

**Fix approach:**

Use a real word count or approximate token count instead of unique-token count. Keep the environment override.

### P2-4. Highlighting usually fails for paraphrased evidence

**Severity:** Low  
**Area:** UX  
**Status:** Confirmed

`highlightPassage` uses a case-insensitive `indexOf` against description or evidence summary (`src/components/admin/ExtractionReviewPanel.tsx:77-105`). Claude descriptions and evidence summaries are often paraphrases, not literal substrings of `chunk.raw_text`, so the source text often renders with no highlight despite the spec requiring a highlighted relevant passage.

**Fix approach:**

Change extraction output to include a literal `evidence_quote` or character offsets per item, then highlight by quote/offset. As a fallback, highlight the best fuzzy matching sentence in the chunk.

### P2-5. Destructive review actions lack guardrails

**Severity:** Low  
**Area:** UX / data safety  
**Status:** Confirmed

Reject executes immediately (`src/components/admin/ExtractionReviewPanel.tsx:299-310`) and removes the item from the pending queue. Split can submit the default blank second entity (`src/components/admin/ExtractionReviewPanel.tsx:312-323`, `631-641`). There is no undo or review history UI.

**Fix approach:**

- Add a confirmation dialog for reject.
- Disable split save until both entity names are valid.
- Add inline validation for edit and split forms.
- Store audit metadata and expose recent review history so mistakes can be repaired.

### P2-6. Search filters treat `%` and `_` as LIKE wildcards

**Severity:** Low  
**Area:** UX  
**Status:** Confirmed

`searchAdminEntities` uses `.ilike('name', `%${query}%`)` (`src/lib/api/admin.ts:1126-1139`). Searches containing `%` or `_` become wildcard searches and can return overly broad results.

**Fix approach:**

Escape LIKE metacharacters or use the existing `search_entities` RPC/FTS patterns for admin search.

### P2-7. Extraction stage failure handling can leave the source in the previous stage

**Severity:** Low  
**Area:** Pipeline resilience  
**Status:** Confirmed

`canUpdateSource` is set before `updateSourceStage(..., 'extracting')`. If the stage update itself fails, the catch path calls `failSourceStage(..., 'extracting_failed', ...)` and swallows a second failure (`supabase/functions/trigger-extraction/index.ts:707-753`). The source can remain in its previous stage with only the HTTP error as evidence.

**Fix approach:**

Track whether the stage update succeeded before attempting the failure-stage update. Log the original and secondary failures separately.

## Items Reviewed But Not Worth Fixing As Originally Written

### N1. Split is not missing from the database enum for row status

The original concern said a split item would make the extraction row status become `rejected` because `extraction_status` lacks `split`. That is not how the current code behaves. `getTerminalExtractionStatus` maps any item-level `review_status === 'split'` to row status `confirmed` (`src/lib/api/admin.ts:355-376`), which matches the feature spec: Split creates two entity records and sets `extraction_status = 'confirmed'`.

No enum migration is needed unless the team wants item-level review statuses typed in the database. If so, add a separate JSON schema/RPC validation concept, not a new row-level `extraction_status`.

### N2. Edit does not normally leave a prior confirmed entity dangling

The earlier scenario described confirming an item and then editing that same item through the queue. That is not a normal UI path because reviewed items are removed from pending review. There can still be duplicate/dangling entities through retries, concurrent reviews, and non-atomic failures, but those are already covered by P0-1 and P1-1.

### N3. Split does not need to create a relationship by default

The feature says Split breaks one entity extraction into two entity records. It does not say the two produced entities should be related. Creating a relationship during split would be domain-specific and should only happen if the split form asks for a relationship/claim.

### N4. Per-chunk entity relevance in the prompt is implemented correctly

The earlier note implied the full active entity corpus may be included in the batch prompt. It is not. The function fetches active entity names into memory once, but `userPrompt` embeds `getRelevantEntityNames(entities, [chunk])` per chunk (`supabase/functions/trigger-extraction/index.ts:293`). That satisfies the "50 most relevant entities per chunk" requirement. The remaining concern is only local memory/CPU cost as the entity corpus grows.

### N5. `extractTextContent` fallback is harmless cleanup

Because the Anthropic request forces tool use (`tool_choice` at `supabase/functions/trigger-extraction/index.ts:457`), `extractTextContent` is only a malformed-response fallback (`supabase/functions/trigger-extraction/index.ts:494-502`). It is not a functional bug. It can be simplified later, but it should not displace data integrity fixes.

### N6. Service-role bypass is expected for internal Edge Function calls

`requireAdminOrServiceRole` accepts the service-role key directly (`supabase/functions/_shared/pipeline.ts:67-83`). That is blunt, but it is normal for internal service calls. Do not change it unless the team is ready to introduce signed internal job tokens or stricter function-to-function authentication.

## Recommended Fix Architecture

The fixes should not be applied as isolated patches in the React layer. The safest path is to introduce a small database-backed review API and make the UI call it.

### New database/RPC layer

Add migrations for:

- `entity_source_anchors`
- normalized entity name uniqueness, if desired
- optional `admin_audit_events`
- `review_extraction_item(...)` RPC
- optional `publish_entities(...)`, `publish_claims(...)`, and `publish_sources(...)` RPCs

The review RPC should own all confirm/edit/reject/merge/split writes and return the updated row status plus created/linked ids.

### Updated confidence function

Update `compute-confidence` to:

- Validate UUID input and cap batch size.
- Score direct entity source anchors.
- Score claim evidence.
- Respect the decided publication gates for claims and sources/anchors.
- Recompute relationship weights from both endpoint scores.
- Avoid string-interpolated PostgREST filters.

### Updated admin UI

Keep the current visual layout, but wire it to safer primitives:

- Review panel calls the RPC.
- Validation-failed rows get their own review state.
- Split/edit buttons validate before submit.
- Reject uses confirmation.
- Entity manager uses pagination/search/filtering.
- Claim manager gets publication controls if claims remain part of the graph publication model.

## Battle Plan

1. **Lock down the evidence model first.** Add `entity_source_anchors` and decide how entity direct evidence, claim evidence, source status, and claim status should affect public graph visibility and confidence.

2. **Build the transactional review RPC.** Implement `review_extraction_item(...)` with row locking, server-side validation, action-specific writes, extraction JSON updates, and audit metadata. Port confirm/edit/reject/merge/split behavior into the RPC.

3. **Update the React admin API to call the RPC.** Replace the multi-write client implementation in `reviewExtractionItem` with one `.rpc()` call. Keep optimistic UI minimal until the RPC is stable.

4. **Fix entity resolution and uniqueness.** Add normalized-name/alias-aware resolution, avoid SELECT-then-INSERT races, handle slug conflicts inside the transaction, and return explicit merge-required errors for published duplicates.

5. **Repair claim linking.** Make claim review block or resolve missing involved entities, and define the multi-entity relationship policy. Add a repair script/RPC for claims created before this fix.

6. **Clarify publication.** Add claim and source/source-anchor publication controls or batch publish semantics. Update relationship RLS/API so draft-backed edges do not leak into the public graph unless that is intentionally allowed.

7. **Refactor `compute-confidence`.** Add UUID validation, remove interpolated filters, include direct entity evidence, respect publication gates, and recompute relationship weights from both endpoints.

8. **Add review queue pagination and validation-failed handling.** Split summary loading from selected-source detail loading. Add UI actions for failed extractions and raw provider responses.

9. **Add entity table pagination/search.** Keep bulk publish scoped to selected ids or implement a filtered bulk RPC with confirmation.

10. **Clean up Feature 4 extraction rough edges.** Simplify rate limiting, fix raw response storage for failed batches, change max-token estimation to real word count, and make stage-failure logging clearer.

11. **Add focused tests.** Cover the RPC transaction paths, rollback behavior, entity resolution, claim linking, confidence scoring, validation-failed queue states, and publication gates before treating this feature as production-ready.
