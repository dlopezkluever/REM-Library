# Phase 1 MVP Sign-Off Notes

Date: 2026-05-26

This document is the readable handoff for signing off the Phase 1 MVP infrastructure work.

## Current Status

Automated checks are passing.

Remote Supabase migrations were pushed successfully. Local Supabase migrations and seed data were also applied successfully after creating the Docker network that the Supabase CLI expected.

## What Was Completed

- Supabase migrations:
  - `20260523010000_enums.sql`
  - `20260523020000_core_tables.sql`
  - `20260523030000_fts.sql`
  - `20260523040000_rls.sql`
  - `20260523050000_fix_evidence_rls_recursion.sql`
- Remote database migration push completed.
- `src/types/database.ts` was regenerated from the linked remote Supabase project.
- Local Supabase reset applies migrations and `supabase/seed.sql`.
- Local seed data includes:
  - Published entities across all entity types.
  - Published relationships.
  - One published claim.
  - One published source.
  - One source anchor.
  - One chunk and one pending extraction.
  - Local admin auth user/profile.
- Auth client/store/hook and admin route protection are wired.
- Type-safe API layer is wired for entities, relationships, claims, and sources.
- Smoke test script is wired as `npm run smoke`.
- Route skeletons render.
- CI now includes `npm run build`.

## Important Fixes Made During Sign-Off

### FTS migration fix

The first remote push failed on migration `20260523030000_fts.sql` because Postgres rejected this generated column expression:

```sql
array_to_string(aliases, ' ')
```

Reason: generated stored columns require immutable expressions. The migration now indexes `name` and `description` in the generated `fts` column and keeps a trigram index on `name`.

### RLS recursion fix

The first local smoke test found policy recursion:

```txt
infinite recursion detected in policy for relation "claim_evidence"
```

Cause: `source_anchors` and `claim_evidence` public-read policies referenced each other.

Fix: migration `20260523050000_fix_evidence_rls_recursion.sql` replaces those policies so:

- `source_anchors` are publicly readable when their source is published.
- `claim_evidence` rows are publicly readable when their claim is published.
- Internal users still get broader read access through `has_internal_access()`.

## Command Results

### Remote migration push

Final successful output:

```txt
Finished supabase db push.
Applying migration 20260523050000_fix_evidence_rls_recursion.sql...
```

Migration list now shows local and remote in sync:

```txt
Local          | Remote
---------------|----------------
20260523010000 | 20260523010000
20260523020000 | 20260523020000
20260523030000 | 20260523030000
20260523040000 | 20260523040000
20260523050000 | 20260523050000
```

### Local Supabase reset

```txt
Applying migration 20260523010000_enums.sql...
Applying migration 20260523020000_core_tables.sql...
Applying migration 20260523030000_fts.sql...
Applying migration 20260523040000_rls.sql...
Applying migration 20260523050000_fix_evidence_rls_recursion.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch mvp.
```

### Smoke test

```txt
npm run smoke
Smoke test passed
```

### App checks

```txt
npm run lint       PASS
npm run typecheck  PASS
npm run test       PASS
npm run build      PASS
```

`npm run build` has one Vite warning only:

```txt
Some chunks are larger than 500 kB after minification.
```

This is not a build failure.

### Route smoke check

The following routes returned HTTP 200 from the Vite dev server:

```txt
/ 200
/encyclopedia 200
/entity/fire 200
/claim/40000000-0000-0000-0000-000000000001 200
/sources 200
/sources/20000000-0000-0000-0000-000000000001 200
/search 200
/admin/login 200
/admin 200
/admin/dashboard 200
/admin/sources 200
/admin/sources/new 200
/admin/review 200
/admin/entities 200
/admin/settings 200
```

## Docker/Supabase Local Note

`npx supabase start` initially failed with:

```txt
failed to start docker container "supabase_db_RemLib":
failed to set up container networking:
network supabase_network_RemLib not found
```

This fixed it:

```sh
docker network create supabase_network_RemLib
npx supabase start
```

After that, local Supabase started successfully.

## How To Re-Run Local Sign-Off

Use these commands from the repo root:

```sh
npx supabase start
npm run seed
npm run smoke
npm run lint
npm run typecheck
npm run test
npm run build
```

If `npx supabase start` fails with the missing network error, run:

```sh
docker network create supabase_network_RemLib
npx supabase start
```

If the network already exists, Docker will report that; continue with `npx supabase start`.

## Local Admin Login

After `npm run seed`, the local seeded admin account is:

```txt
email: admin@mythograph.local
password: mythograph-admin
```

For the browser app to use local Supabase, `.env.local` must point at the local Supabase URL and anon key. Get the local values with:

```sh
npx supabase status -o env
```

Then use:

```txt
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY from supabase status -o env>
```

Restart `npm run dev` after changing `.env.local`.

## Remote Admin Login Still Needs Your Manual Action

The remote schema has been pushed, but the local seed file is not automatically applied to the remote project.

To sign into `/admin/login` against the remote Supabase project, create a remote Auth user, then create the matching profile row.

Recommended steps:

1. In the Supabase Dashboard, create an Auth user for your admin email.
2. In the Supabase SQL Editor, run this with your actual admin email:

```sql
insert into public.profiles (id, email, display_name, role)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'display_name', email),
  'super_admin'::public.admin_role
from auth.users
where email = 'YOUR_ADMIN_EMAIL_HERE'
on conflict (id) do update
set
  email = excluded.email,
  display_name = excluded.display_name,
  role = excluded.role;
```

3. Confirm `/admin/login` works using that remote account.

## Recommended Manual Sign-Off Checklist

- Run `npm run smoke` and confirm `Smoke test passed`.
- Run `npm run build` and confirm it exits successfully.
- Open `http://127.0.0.1:5173`.
- Visit the public routes:
  - `/`
  - `/encyclopedia`
  - `/sources`
  - `/search`
- Visit `/admin/login`.
- For local sign-off, point `.env.local` at local Supabase and sign in with the seeded admin account.
- For remote sign-off, create the remote admin user/profile described above and sign in with that account.
- Confirm the remote migration list shows all five migrations on both local and remote:

```sh
npx supabase migration list
```

## Known Non-Blocking Items

- The production build currently warns that the main JS chunk is larger than 500 kB. This is expected at this skeleton stage and does not fail CI.
- Vitest integration tests are skipped unless `VITE_SUPABASE_INTEGRATION_TESTS=true`. The explicit smoke test covers the local seeded Supabase path.
