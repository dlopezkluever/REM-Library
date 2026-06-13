do $$
begin
  create type public.suggestion_type as enum (
    'new_claim',
    'claim_correction',
    'flag_entity',
    'flag_claim'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.suggestion_status as enum (
    'pending',
    'approved',
    'rejected',
    'clarification_requested'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.sources
  add column if not exists fair_use_rationale text;

alter table public.entities
  add column if not exists image_url text,
  add column if not exists hero_image_url text;

insert into storage.buckets (id, name, public)
values ('entity-images', 'entity-images', true)
on conflict (id) do update
set public = true;

drop policy if exists "entity images public read" on storage.objects;
create policy "entity images public read"
  on storage.objects for select
  using (bucket_id = 'entity-images');

drop policy if exists "entity images admin insert" on storage.objects;
create policy "entity images admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'entity-images' and public.is_admin());

drop policy if exists "entity images admin update" on storage.objects;
create policy "entity images admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'entity-images' and public.is_admin())
  with check (bucket_id = 'entity-images' and public.is_admin());

drop policy if exists "entity images admin delete" on storage.objects;
create policy "entity images admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'entity-images' and public.is_admin());

drop policy if exists "profiles contributor self insert" on public.profiles;
create policy "profiles contributor self insert"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'contributor');

create or replace function public.handle_public_user_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'display_name', ''),
    'contributor'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_public_user_registration();

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  type public.suggestion_type not null,
  status public.suggestion_status not null default 'pending',
  submitter_id uuid not null references public.profiles(id) on delete cascade,
  target_entity_id uuid references public.entities(id) on delete set null,
  target_claim_id uuid references public.claims(id) on delete set null,
  suggestion_text text not null check (char_length(suggestion_text) between 1 and 1000),
  reason text,
  admin_notes text,
  rejection_reason text,
  created_claim_id uuid references public.claims(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suggestions_target_required check (
    (type = 'new_claim' and target_entity_id is not null and target_claim_id is null)
    or (type = 'claim_correction' and target_claim_id is not null)
    or (type = 'flag_entity' and target_entity_id is not null and target_claim_id is null)
    or (type = 'flag_claim' and target_claim_id is not null)
  )
);

create index if not exists suggestions_status_idx on public.suggestions (status, created_at);
create index if not exists suggestions_submitter_idx on public.suggestions (submitter_id);
create index if not exists suggestions_target_entity_idx on public.suggestions (target_entity_id);
create index if not exists suggestions_target_claim_idx on public.suggestions (target_claim_id);

alter table public.suggestions enable row level security;

drop policy if exists "suggestions admin read" on public.suggestions;
create policy "suggestions admin read"
  on public.suggestions for select
  to authenticated
  using (public.is_admin());

drop policy if exists "suggestions submitter read own" on public.suggestions;
create policy "suggestions submitter read own"
  on public.suggestions for select
  to authenticated
  using (submitter_id = auth.uid());

drop policy if exists "suggestions contributor insert own" on public.suggestions;
create policy "suggestions contributor insert own"
  on public.suggestions for insert
  to authenticated
  with check (
    submitter_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('contributor', 'viewer', 'editor', 'super_admin')
    )
  );

drop policy if exists "suggestions admin update" on public.suggestions;
create policy "suggestions admin update"
  on public.suggestions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.set_suggestions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists suggestions_set_updated_at on public.suggestions;
create trigger suggestions_set_updated_at
before update on public.suggestions
for each row
execute function public.set_suggestions_updated_at();

create or replace function public.approve_suggestion(suggestion_id uuid, admin_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_row public.suggestions%rowtype;
  new_claim_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Editor access is required.';
  end if;

  select *
  into suggestion_row
  from public.suggestions
  where id = suggestion_id
  for update;

  if not found then
    raise exception 'Suggestion was not found.';
  end if;

  if suggestion_row.status <> 'pending' and suggestion_row.status <> 'clarification_requested' then
    raise exception 'Suggestion has already been reviewed.';
  end if;

  if suggestion_row.type = 'new_claim' then
    insert into public.claims (statement, detailed_argument, author_id, status)
    values (
      suggestion_row.suggestion_text,
      suggestion_row.reason,
      suggestion_row.submitter_id,
      'draft'
    )
    returning id into new_claim_id;

    insert into public.claim_entities (claim_id, entity_id)
    values (new_claim_id, suggestion_row.target_entity_id);
  elsif suggestion_row.type = 'claim_correction' then
    insert into public.claims (statement, detailed_argument, author_id, status)
    values (
      suggestion_row.suggestion_text,
      suggestion_row.reason,
      suggestion_row.submitter_id,
      'draft'
    )
    returning id into new_claim_id;

    insert into public.claim_entities (claim_id, entity_id)
    select new_claim_id, claim_entities.entity_id
    from public.claim_entities
    where claim_entities.claim_id = suggestion_row.target_claim_id;
  elsif suggestion_row.type = 'flag_claim' then
    update public.claims
    set status = 'disputed'
    where id = suggestion_row.target_claim_id;
  elsif suggestion_row.type = 'flag_entity' then
    update public.entities
    set status = 'disputed'
    where id = suggestion_row.target_entity_id;
  end if;

  update public.suggestions
  set status = 'approved',
      admin_notes = coalesce(admin_note, admin_notes),
      created_claim_id = new_claim_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = suggestion_id;

  return jsonb_build_object(
    'suggestion_id', suggestion_id,
    'created_claim_id', new_claim_id,
    'status', 'approved'
  );
end;
$$;

grant execute on function public.approve_suggestion(uuid, text) to authenticated;
