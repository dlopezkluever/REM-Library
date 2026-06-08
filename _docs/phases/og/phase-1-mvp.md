# Phase 1 — MVP: Infrastructure Foundation

**Goal:** The complete infrastructure skeleton is deployed and working end-to-end. Database schema is live in Supabase with all tables, RLS policies, and indexes. Auth is working (admin login protected). The TypeScript API layer is type-safe against the real schema. All routes exist with their correct shells and placeholder content. The app is deployable and testable with seed data.

This is the foundation every subsequent phase builds on. No user-facing features are complete yet — but the skeleton is solid enough that any feature can be added without architectural changes.

**Deliverable:** Supabase schema deployed; admin can log in; all routes render correctly; seeded test data appears via the API layer; CI passes.

## _NOTE_: Use supabase commands using "npx supabase <commands>"

## Feature 1 — Complete Supabase database schema

1. Write migration `supabase/migrations/20260523_01_enums.sql`: create all PostgreSQL enums (`entity_type`, `relationship_type`, `content_status`, `source_format`, `source_tier`, `pipeline_stage`, `extraction_status`, `admin_role`).
2. Write migration `20260523_02_core_tables.sql`: create `profiles`, `entities`, `relationships`, `claims`, `claim_entities`, `sources`, `source_anchors`, `claim_evidence`, `chunks`, `extractions` tables with all columns, constraints, and indexes as specified in `project-rules.md`.
3. Write migration `20260523_03_fts.sql`: add `fts` generated tsvector columns to `entities` and `chunks`; create GIN indexes; install `pg_trgm` extension.
4. Write migration `20260523_04_rls.sql`: enable RLS on all tables; create the `is_admin()` helper function; add public-read policies (published entities/claims/sources) and admin-write policies.
5. Run `supabase db push` to apply migrations to the remote project; run `supabase gen types typescript --project-id [id] > src/types/database.ts` to generate TypeScript types; commit the generated file.

---

## Feature 2 — Auth + admin route protection

1. Install `@supabase/ssr`; create `src/lib/supabase/client.ts` using `createBrowserClient` for the browser-side client.
2. Create `src/hooks/useAuth.ts`: exports `session`, `user`, `role` (from `profiles.role`), `signIn(email, password)`, `signOut()` using the Supabase auth client.
3. Create `src/stores/authStore.ts` (Zustand): stores `session` and `role`; hydrates from `supabase.auth.getSession()` on app mount; updates on `supabase.auth.onAuthStateChange`.
4. Build `AdminLoginPage.tsx`: email + password form, calls `signIn`, redirects to `/admin/dashboard` on success, shows inline error on failure — styled per the Mythograph light-mode form aesthetic (Stone background, Lora labels, Verdigris submit button).
5. Create a `<RequireAdmin>` wrapper component that reads `authStore.role`; redirects to `/admin/login` if no session; renders children otherwise. Wrap all `/admin/*` routes in the router with this component.

---

## Feature 3 — Type-safe API query layer

1. Create `src/lib/api/entities.ts`: implement `getPublishedEntities()`, `getEntityBySlug(slug)`, `getEntityNeighborhood(id, hops)` (using a JOIN or CTE for 1–2 hops) using the generated `Database` types.
2. Create `src/lib/api/relationships.ts`: `getAllPublishedRelationships()`, `getRelationshipsForEntity(entityId)`.
3. Create `src/lib/api/claims.ts`: `getClaimById(id)`, `getClaimsForEntity(entityId)`.
4. Create `src/lib/api/sources.ts`: `getAllSources()`, `getSourceById(id)`, `getSourceAnchorsForClaim(claimId)`.
5. Write Vitest integration tests for all API functions using the local Supabase instance (`supabase start`): verify that RLS correctly blocks unauthenticated access to draft data and allows access to published data.

---

## Feature 4 — Seed data + end-to-end smoke test

1. Write `supabase/seed.sql`: insert a small set of test entities (5–10) covering all entity types, several relationships between them, one claim with a source anchor, and one source record — all with `status = 'published'`.
2. Create an admin seed user: insert a `profiles` row with `role = 'super_admin'` linked to a test Supabase Auth user (use `supabase auth create-user` via CLI for local dev).
3. Write `scripts/smokeTest.ts`: calls each API function in sequence, asserts non-empty results, logs pass/fail — run with `npx tsx scripts/smokeTest.ts` against the local Supabase instance.
4. Confirm that calling `getPublishedEntities()` from a browser (via the Supabase anon client) returns only `status = 'published'` rows, and that inserting via the anon key is blocked by RLS.
5. Add `npm run seed` script to `package.json` that runs `supabase db reset --local` (applies migrations + seed data); document in README.

---

## Feature 5 — Design system smoke test + all routes wired

1. Add Shadcn components used throughout the app: `Button`, `Badge`, `Dialog`, `Sheet`, `Separator`, `Input`, `Skeleton`, `Tooltip`, `DropdownMenu`. Verify each renders correctly with Mythograph color tokens.
2. Create `src/constants/entityTypes.ts`: maps each `entity_type` enum value to its color hex, badge background, badge text color, and badge border color (all values from `theme-rules.md`).
3. Build the `EntityBadge` component: accepts `type: EntityType` prop, renders a Cinzel-font badge with the correct colors from `entityTypes.ts` constants.
4. Build the `AttestationBar` component: accepts `score: number` (0–1) and `sourceCount: number`; renders 5 segments filled proportionally, with "N of 5 · M sources" caption.
5. Verify all 14 defined routes render the correct shell (dark AppShell, light ContentShell, or AdminShell) with NavBar and correct background — by navigating to each route in the browser and visually confirming. Update the CI workflow to run `npm run build` (Vite production build) to catch any build-time type errors.
