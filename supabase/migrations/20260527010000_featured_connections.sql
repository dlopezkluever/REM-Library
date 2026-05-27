create table public.featured_connections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  entity_color text not null,
  created_at timestamptz not null default now()
);

alter table public.featured_connections enable row level security;

create policy "featured connections public read"
  on public.featured_connections for select
  using (true);

create policy "featured connections admin write"
  on public.featured_connections for all
  using (public.is_admin())
  with check (public.is_admin());
