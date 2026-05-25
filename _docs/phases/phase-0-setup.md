# Phase 0 — Project Setup

**Goal:** Repo initialized, toolchain configured, Supabase connected, empty app running locally and deployed to Vercel. Nothing is built yet — this phase is entirely scaffolding.

**Deliverable:** A blank Vite + React + TypeScript app that loads in the browser (locally and on Vercel), connects to a Supabase project, has Tailwind + Shadcn/ui wired up with Mythograph design tokens, and passes CI on every commit.

---

## Feature 1 — Vite + React + TypeScript scaffold

1. Run `npm create vite@latest mythograph -- --template react-ts` to initialize the project.
2. Configure `tsconfig.json`: set `strict: true`, `baseUrl: "."`, `paths` for `@/*` aliases; set `target: "ES2020"`.
3. Configure `vite.config.ts`: add `resolve.alias` for `@/` pointing to `src/`, enable source maps.
4. Install and configure ESLint (`eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`) and Prettier with a `.prettierrc` matching the project style.
5. Add Husky + lint-staged: pre-commit hook runs ESLint and Prettier on staged files.

---

## Feature 2 — Tailwind CSS + Shadcn/ui + design tokens

1. Install Tailwind CSS v3 with PostCSS: `npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`.
2. Configure `tailwind.config.ts` with Mythograph design tokens: Stone/Charcoal/Verdigris/Terracotta/Iris/Warm Tan/Muted Violet colors, Cinzel + Lora font families, `0.5px` border width, custom letter-spacing and line-height values from `theme-rules.md`.
3. Initialize Shadcn/ui: `npx shadcn@latest init` — select the `neutral` base color, enable CSS variables, point component output to `src/components/ui/`.
4. Override Shadcn's CSS variables in `src/styles/globals.css` to use Mythograph tokens (Stone background, Ink text, Verdigris primary).
5. Add Cinzel and Lora via `@fontsource/cinzel` and `@fontsource/lora` npm packages; import both in `globals.css`.

---

## Feature 3 — Supabase project + local dev connection

1. Create a new Supabase project in the Supabase dashboard; note the project URL and anon key.
2. Install Supabase CLI and initialize locally: `supabase init` to create the `supabase/` directory structure.
3. Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; add `.env.local` to `.gitignore`; commit `.env.example` with placeholder values.
4. Create `src/lib/supabase/client.ts` exporting a singleton Supabase browser client using `createClient` from `@supabase/supabase-js`.
5. Run `supabase start` to spin up the local Supabase stack (Docker); verify connection by logging the Supabase client version in `main.tsx` during dev.

---

## Feature 4 — React Router + shell layouts

1. Install React Router v6: `npm install react-router-dom`.
2. Create `src/router.tsx` with the full route tree from `project-rules.md` — all routes defined, each pointing to a placeholder page component that renders only the route name as text.
3. Create the three layout shells (`AppShell`, `ContentShell`, `AdminShell`) in `src/components/layout/` — these are structural wrappers with correct background colors and nav bar placeholder only; no logic yet.
4. Create `src/components/layout/NavBar.tsx` with the MYTHOGRAPH wordmark and static nav links (no functionality yet); styled per `ui-rules.md` (Cinzel wordmark, Lora nav links, 0.5px bottom border).
5. Wire all routes through their appropriate shell in the router; verify all routes render the correct shell background (dark for `/`, light for `/encyclopedia/*`, `/entity/*`, etc.).

---

## Feature 5 — GitHub repo + CI pipeline

1. Initialize git, create a GitHub repository, push the initial commit.
2. Create `.github/workflows/ci.yml`: on every PR and push to `main`, run `npm run lint` (ESLint), `npm run typecheck` (tsc --noEmit), and `npm run test` (Vitest — passes with zero tests initially).
3. Configure Vercel: connect the GitHub repo to a new Vercel project; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables.
4. Verify the deployment: push to `main`, confirm the blank app loads on the Vercel preview URL with correct fonts and background colors.
5. Add a `README.md` with setup instructions (clone, `npm install`, copy `.env.example` → `.env.local`, fill values, `npm run dev`).
