-- Add an explicit publication boundary for guided explorations.
-- Draft exploration rows and their steps must not be readable by anonymous
-- clients until an admin publishes the parent exploration.

alter table public.explorations
  add column if not exists status public.content_status not null default 'draft',
  add column if not exists published_at timestamptz;

create index if not exists explorations_publication_idx
  on public.explorations (status, published_at desc, created_at desc);

drop policy if exists "explorations public read" on public.explorations;
drop policy if exists "exploration steps public read" on public.exploration_steps;

create policy "explorations public read"
  on public.explorations for select
  using (status = 'published');

create policy "exploration steps public read"
  on public.exploration_steps for select
  using (
    exists (
      select 1
      from public.explorations
      where explorations.id = exploration_steps.exploration_id
        and explorations.status = 'published'
    )
  );
