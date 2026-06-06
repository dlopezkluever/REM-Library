-- Guided explorations: admin-curated tours through the knowledge graph.
-- Each exploration is an ordered list of steps; a step highlights a set of
-- entities (focus_entity_ids) and shows curated prose.

create table public.explorations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exploration_steps (
  id uuid primary key default gen_random_uuid(),
  exploration_id uuid not null references public.explorations(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  entity_id uuid references public.entities(id) on delete set null,
  prose_text text not null default '',
  focus_entity_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint exploration_steps_unique_index unique (exploration_id, step_index)
);

create index exploration_steps_exploration_idx
  on public.exploration_steps (exploration_id, step_index);

alter table public.explorations enable row level security;
alter table public.exploration_steps enable row level security;

-- Explorations are public, curated content (only published entities are
-- highlighted client-side), so reads are open and writes are admin-only.
create policy "explorations public read"
  on public.explorations for select
  using (true);

create policy "explorations admin write"
  on public.explorations for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "exploration steps public read"
  on public.exploration_steps for select
  using (true);

create policy "exploration steps admin write"
  on public.exploration_steps for all
  using (public.is_admin())
  with check (public.is_admin());
