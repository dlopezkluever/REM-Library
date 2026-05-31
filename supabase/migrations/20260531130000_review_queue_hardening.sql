create table if not exists public.entity_source_anchors (
  entity_id uuid not null references public.entities(id) on delete cascade,
  anchor_id uuid not null references public.source_anchors(id) on delete cascade,
  extraction_id uuid references public.extractions(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (entity_id, anchor_id)
);

create index if not exists entity_source_anchors_anchor_idx
on public.entity_source_anchors (anchor_id);

alter table public.entity_source_anchors enable row level security;

drop policy if exists "entity_source_anchors public read published" on public.entity_source_anchors;
create policy "entity_source_anchors public read published"
  on public.entity_source_anchors for select
  using (
    public.has_internal_access()
    or exists (
      select 1
      from public.entities
      join public.source_anchors on source_anchors.id = entity_source_anchors.anchor_id
      join public.sources on sources.id = source_anchors.source_id
      where entities.id = entity_source_anchors.entity_id
        and entities.status = 'published'
        and sources.status = 'published'
    )
  );

drop policy if exists "entity_source_anchors admin write" on public.entity_source_anchors;
create policy "entity_source_anchors admin write"
  on public.entity_source_anchors for all
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_target_idx
on public.admin_audit_events (target_table, target_id, created_at desc);

alter table public.admin_audit_events enable row level security;

drop policy if exists "admin_audit_events admin read" on public.admin_audit_events;
create policy "admin_audit_events admin read"
  on public.admin_audit_events for select
  using (public.is_admin());

drop policy if exists "admin_audit_events admin insert" on public.admin_audit_events;
create policy "admin_audit_events admin insert"
  on public.admin_audit_events for insert
  with check (public.is_admin());

create unique index if not exists entities_active_name_unique
on public.entities (lower(btrim(name)))
where status <> 'archived';

drop policy if exists "relationships public read published endpoints" on public.relationships;
create policy "relationships public read published endpoints"
  on public.relationships for select
  using (
    public.has_internal_access()
    or (
      exists (
        select 1 from public.entities from_entity
        where from_entity.id = from_entity_id
          and from_entity.status = 'published'
      )
      and exists (
        select 1 from public.entities to_entity
        where to_entity.id = to_entity_id
          and to_entity.status = 'published'
      )
      and exists (
        select 1
        from public.claims
        where claims.id = any(relationships.claim_ids)
          and claims.status = 'published'
      )
    )
  );

create or replace function public.normalize_review_text(input_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(btrim(coalesce(input_value, '')), '\s+', ' ', 'g');
$$;

create or replace function public.slugify_review_entity_name(input_value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(lower(public.normalize_review_text(input_value)), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'entity'
  );
$$;

create or replace function public.jsonb_text_array(input_value jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array(
      select public.normalize_review_text(item.value)
      from jsonb_array_elements_text(coalesce(input_value, '[]'::jsonb)) as item(value)
      where public.normalize_review_text(item.value) <> ''
    ),
    '{}'::text[]
  );
$$;

create or replace function public.unique_review_text_array(input_values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(
    array(
      select distinct on (lower(public.normalize_review_text(item.value)))
        public.normalize_review_text(item.value)
      from unnest(coalesce(input_values, '{}'::text[])) as item(value)
      where public.normalize_review_text(item.value) <> ''
      order by lower(public.normalize_review_text(item.value)), public.normalize_review_text(item.value)
    ),
    '{}'::text[]
  );
$$;

create or replace function public.next_review_entity_slug(
  entity_name text,
  existing_entity_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text := public.slugify_review_entity_name(entity_name);
  candidate_slug text;
  index_value integer := 0;
begin
  loop
    candidate_slug := case
      when index_value = 0 then base_slug
      else base_slug || '-' || (index_value + 1)::text
    end;

    if not exists (
      select 1
      from public.entities
      where slug = candidate_slug
        and (existing_entity_id is null or id <> existing_entity_id)
    ) then
      return candidate_slug;
    end if;

    index_value := index_value + 1;

    if index_value >= 100 then
      return base_slug || '-' || floor(extract(epoch from clock_timestamp()))::bigint::text;
    end if;
  end loop;
end;
$$;

create or replace function public.find_review_entity_id(entity_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select entities.id
  from public.entities
  where entities.status <> 'archived'
    and (
      lower(public.normalize_review_text(entities.name)) = lower(public.normalize_review_text(entity_name))
      or exists (
        select 1
        from unnest(entities.aliases) as alias(value)
        where lower(public.normalize_review_text(alias.value)) = lower(public.normalize_review_text(entity_name))
      )
    )
  order by
    case entities.status when 'draft' then 0 when 'published' then 1 else 2 end,
    entities.updated_at desc
  limit 1;
$$;

create or replace function public.create_or_update_review_entity(input_value jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_name text := public.normalize_review_text(input_value->>'name');
  entity_type public.entity_type;
  entity_description text := nullif(public.normalize_review_text(input_value->>'description'), '');
  entity_aliases text[] := public.unique_review_text_array(public.jsonb_text_array(input_value->'aliases'));
  existing public.entities%rowtype;
  next_id uuid;
begin
  if entity_name = '' then
    raise exception 'Entity name is required.';
  end if;

  begin
    entity_type := (input_value->>'type')::public.entity_type;
  exception when others then
    raise exception 'A valid entity type is required.';
  end;

  entity_aliases := array(
    select alias.value
    from unnest(entity_aliases) as alias(value)
    where lower(alias.value) <> lower(entity_name)
  );

  select *
  into existing
  from public.entities
  where id = public.find_review_entity_id(entity_name)
  for update;

  if found then
    if existing.status = 'draft' then
      update public.entities
      set
        aliases = public.unique_review_text_array(existing.aliases || entity_aliases),
        description = entity_description,
        name = entity_name,
        slug = public.next_review_entity_slug(entity_name, existing.id),
        type = entity_type,
        updated_at = now()
      where id = existing.id
      returning id into next_id;

      return next_id;
    end if;

    raise exception 'Entity "%" already exists as %. Use Merge instead.', entity_name, existing.status;
  end if;

  insert into public.entities (aliases, description, name, slug, status, type)
  values (
    entity_aliases,
    entity_description,
    entity_name,
    public.next_review_entity_slug(entity_name),
    'draft',
    entity_type
  )
  returning id into next_id;

  return next_id;
exception
  when unique_violation then
    select *
    into existing
    from public.entities
    where id = public.find_review_entity_id(entity_name)
    for update;

    if found and existing.status = 'draft' then
      update public.entities
      set
        aliases = public.unique_review_text_array(existing.aliases || entity_aliases),
        description = entity_description,
        type = entity_type,
        updated_at = now()
      where id = existing.id
      returning id into next_id;

      return next_id;
    end if;

    raise;
end;
$$;

create or replace function public.create_review_source_anchor(
  chunk_row public.chunks,
  excerpt text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  anchor_id uuid;
begin
  insert into public.source_anchors (
    end_timestamp_sec,
    source_id,
    speaker,
    start_timestamp_sec,
    transcript_excerpt
  )
  values (
    chunk_row.end_sec,
    chunk_row.source_id,
    chunk_row.speaker,
    chunk_row.start_sec,
    coalesce(nullif(public.normalize_review_text(excerpt), ''), left(chunk_row.raw_text, 1000))
  )
  returning id into anchor_id;

  return anchor_id;
end;
$$;

create or replace function public.find_extraction_entity_input(
  extraction_data jsonb,
  entity_name text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  entity_item jsonb;
  normalized_name text := lower(public.normalize_review_text(entity_name));
begin
  for entity_item in
    select item.value
    from jsonb_array_elements(coalesce(extraction_data->'entities', '[]'::jsonb)) as item(value)
  loop
    if lower(public.normalize_review_text(entity_item->>'name')) = normalized_name then
      return jsonb_build_object(
        'aliases', coalesce(entity_item->'aliases', '[]'::jsonb),
        'description', entity_item->>'description',
        'name', entity_item->>'name',
        'type', entity_item->>'type'
      );
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(coalesce(entity_item->'aliases', '[]'::jsonb)) as alias(value)
      where lower(public.normalize_review_text(alias.value)) = normalized_name
    ) then
      return jsonb_build_object(
        'aliases', coalesce(entity_item->'aliases', '[]'::jsonb),
        'description', entity_item->>'description',
        'name', entity_item->>'name',
        'type', entity_item->>'type'
      );
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.review_extraction_terminal_status(extraction_data jsonb)
returns public.extraction_status
language plpgsql
immutable
as $$
declare
  review_status text;
  status_values text[] := '{}'::text[];
begin
  for review_status in
    select coalesce(item.value->>'review_status', 'pending')
    from jsonb_array_elements(coalesce(extraction_data->'entities', '[]'::jsonb)) as item(value)
    union all
    select coalesce(item.value->>'review_status', 'pending')
    from jsonb_array_elements(coalesce(extraction_data->'claims', '[]'::jsonb)) as item(value)
  loop
    status_values := array_append(status_values, review_status);
  end loop;

  if cardinality(status_values) = 0 or 'pending' = any(status_values) then
    return 'pending';
  end if;

  if 'edited' = any(status_values) then
    return 'edited';
  end if;

  if 'merged' = any(status_values) then
    return 'merged';
  end if;

  if 'confirmed' = any(status_values) or 'split' = any(status_values) then
    return 'confirmed';
  end if;

  return 'rejected';
end;
$$;

create or replace function public.review_extraction_item(
  action text,
  extraction_id uuid,
  item_kind text,
  item_id text,
  entity_input jsonb default null,
  claim_input jsonb default null,
  target_entity_id uuid default null,
  split_input jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  extraction_row public.extractions%rowtype;
  chunk_row public.chunks%rowtype;
  item_array jsonb;
  item_value jsonb;
  next_item jsonb;
  next_items jsonb := '[]'::jsonb;
  current_item_id text;
  matched boolean := false;
  item_index integer := 0;
  result_ids uuid[] := '{}'::uuid[];
  extra_values jsonb := '{}'::jsonb;
  next_data jsonb;
  row_status public.extraction_status;
  entity_id uuid;
  second_entity_id uuid;
  anchor_id uuid;
  claim_id uuid;
  entity_payload jsonb;
  claim_payload jsonb;
  involved_names text[];
  involved_entity_ids uuid[] := '{}'::uuid[];
  involved_name text;
  involved_entity_id uuid;
  first_index integer;
  second_index integer;
  relationship_id uuid;
  relationship_type public.relationship_type;
  merged_aliases text[];
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if action not in ('confirm', 'edit', 'reject', 'merge', 'split') then
    raise exception 'Unsupported review action "%".', action;
  end if;

  if item_kind not in ('entity', 'claim') then
    raise exception 'Unsupported review item kind "%".', item_kind;
  end if;

  select *
  into extraction_row
  from public.extractions
  where id = extraction_id
  for update;

  if not found then
    raise exception 'Extraction was not found.';
  end if;

  if extraction_row.status <> 'pending' then
    raise exception 'Extraction has already been reviewed.';
  end if;

  select *
  into chunk_row
  from public.chunks
  where id = extraction_row.chunk_id;

  if not found then
    raise exception 'Extraction chunk was not found.';
  end if;

  item_array := coalesce(extraction_row.extraction_data->case when item_kind = 'entity' then 'entities' else 'claims' end, '[]'::jsonb);

  for item_value in select item.value from jsonb_array_elements(item_array) as item(value) loop
    current_item_id := coalesce(item_value->>'item_id', item_kind || '-' || item_index::text);

    if current_item_id = item_id then
      matched := true;

      if coalesce(item_value->>'review_status', 'pending') <> 'pending' then
        raise exception 'The selected extraction item has already been reviewed.';
      end if;

      if action = 'reject' then
        result_ids := '{}'::uuid[];
      elsif action = 'merge' then
        if item_kind <> 'entity' then
          raise exception 'Only entity extractions can be merged.';
        end if;

        if target_entity_id is null then
          raise exception 'Merge target is required.';
        end if;

        select public.unique_review_text_array(
          entities.aliases
          || array[public.normalize_review_text(item_value->>'name')]
          || public.jsonb_text_array(item_value->'aliases')
        )
        into merged_aliases
        from public.entities
        where id = target_entity_id
          and status <> 'archived'
        for update;

        if merged_aliases is null then
          raise exception 'Merge target entity was not found.';
        end if;

        update public.entities
        set
          aliases = array(
            select alias.value
            from unnest(merged_aliases) as alias(value)
            where lower(alias.value) <> lower(public.normalize_review_text(entities.name))
          ),
          updated_at = now()
        where id = target_entity_id;

        anchor_id := public.create_review_source_anchor(
          chunk_row,
          coalesce(item_value->>'description', item_value->>'name')
        );

        insert into public.entity_source_anchors (entity_id, anchor_id, extraction_id)
        values (target_entity_id, anchor_id, extraction_id)
        on conflict do nothing;

        result_ids := array[target_entity_id, anchor_id];
        extra_values := jsonb_build_object(
          'merged_entity_id', target_entity_id,
          'source_anchor_id', anchor_id
        );
      elsif action = 'split' then
        if item_kind <> 'entity' then
          raise exception 'Only entity extractions can be split.';
        end if;

        if split_input is null then
          raise exception 'Split input is required.';
        end if;

        entity_id := public.create_or_update_review_entity(split_input->'first');
        second_entity_id := public.create_or_update_review_entity(split_input->'second');
        anchor_id := public.create_review_source_anchor(
          chunk_row,
          coalesce(item_value->>'description', item_value->>'name')
        );

        insert into public.entity_source_anchors (entity_id, anchor_id, extraction_id)
        values
          (entity_id, anchor_id, extraction_id),
          (second_entity_id, anchor_id, extraction_id)
        on conflict do nothing;

        result_ids := array[entity_id, second_entity_id, anchor_id];
        extra_values := jsonb_build_object(
          'split_entity_ids', to_jsonb(array[entity_id, second_entity_id]),
          'source_anchor_id', anchor_id
        );
      elsif item_kind = 'entity' then
        entity_payload := case
          when action = 'edit' and entity_input is not null then entity_input
          else jsonb_build_object(
            'aliases', coalesce(item_value->'aliases', '[]'::jsonb),
            'description', item_value->>'description',
            'name', item_value->>'name',
            'type', item_value->>'type'
          )
        end;

        entity_id := public.create_or_update_review_entity(entity_payload);
        anchor_id := public.create_review_source_anchor(
          chunk_row,
          coalesce(entity_payload->>'description', entity_payload->>'name')
        );

        insert into public.entity_source_anchors (entity_id, anchor_id, extraction_id)
        values (entity_id, anchor_id, extraction_id)
        on conflict do nothing;

        result_ids := array[entity_id, anchor_id];
        extra_values := jsonb_build_object(
          'entity_id', entity_id,
          'source_anchor_id', anchor_id
        );
      else
        claim_payload := case
          when action = 'edit' and claim_input is not null then claim_input
          else jsonb_build_object(
            'entitiesInvolved', coalesce(item_value->'entities_involved', '[]'::jsonb),
            'evidenceSummary', item_value->>'evidence_summary',
            'relationshipType', item_value->>'relationship_type',
            'statement', item_value->>'statement'
          )
        end;

        if public.normalize_review_text(claim_payload->>'statement') = '' then
          raise exception 'Claim statement is required.';
        end if;

        begin
          relationship_type := (claim_payload->>'relationshipType')::public.relationship_type;
        exception when others then
          raise exception 'A valid relationship type is required.';
        end;

        involved_names := public.unique_review_text_array(public.jsonb_text_array(claim_payload->'entitiesInvolved'));

        if cardinality(involved_names) = 0 then
          raise exception 'At least one involved entity is required.';
        end if;

        foreach involved_name in array involved_names loop
          involved_entity_id := public.find_review_entity_id(involved_name);

          if involved_entity_id is null then
            entity_payload := public.find_extraction_entity_input(extraction_row.extraction_data, involved_name);

            if entity_payload is null then
              raise exception 'Involved entity "%" could not be resolved. Confirm or create that entity first.', involved_name;
            end if;

            involved_entity_id := public.create_or_update_review_entity(entity_payload);
          end if;

          involved_entity_ids := array_append(involved_entity_ids, involved_entity_id);
        end loop;

        insert into public.claims (author_id, detailed_argument, statement, status)
        values (
          actor_id,
          nullif(public.normalize_review_text(claim_payload->>'evidenceSummary'), ''),
          public.normalize_review_text(claim_payload->>'statement'),
          'draft'
        )
        returning id into claim_id;

        anchor_id := public.create_review_source_anchor(
          chunk_row,
          coalesce(claim_payload->>'evidenceSummary', claim_payload->>'statement')
        );

        insert into public.claim_evidence (anchor_id, claim_id)
        values (anchor_id, claim_id);

        foreach involved_entity_id in array involved_entity_ids loop
          insert into public.claim_entities (claim_id, entity_id)
          values (claim_id, involved_entity_id)
          on conflict do nothing;
        end loop;

        if cardinality(involved_entity_ids) >= 2 then
          for first_index in 1..(cardinality(involved_entity_ids) - 1) loop
            for second_index in (first_index + 1)..cardinality(involved_entity_ids) loop
              select id
              into relationship_id
              from public.relationships
              where from_entity_id = involved_entity_ids[first_index]
                and to_entity_id = involved_entity_ids[second_index]
                and type = relationship_type
              for update;

              if relationship_id is null then
                insert into public.relationships (
                  claim_ids,
                  from_entity_id,
                  to_entity_id,
                  type
                )
                values (
                  array[claim_id],
                  involved_entity_ids[first_index],
                  involved_entity_ids[second_index],
                  relationship_type
                );
              else
                update public.relationships
                set claim_ids = (
                  select array_agg(distinct claim_value.value)
                  from unnest(relationships.claim_ids || array[claim_id]) as claim_value(value)
                )
                where id = relationship_id;
              end if;

              relationship_id := null;
            end loop;
          end loop;
        end if;

        result_ids := array[claim_id, anchor_id] || involved_entity_ids;
        extra_values := jsonb_build_object(
          'claim_id', claim_id,
          'source_anchor_id', anchor_id,
          'linked_entity_ids', to_jsonb(involved_entity_ids)
        );
      end if;

      next_item := item_value
        || extra_values
        || jsonb_build_object(
          'item_id', current_item_id,
          'review_result_ids', to_jsonb(result_ids),
          'review_status', case
            when action = 'confirm' then 'confirmed'
            when action = 'edit' then 'edited'
            when action = 'reject' then 'rejected'
            when action = 'merge' then 'merged'
            when action = 'split' then 'split'
          end,
          'reviewed_at', now(),
          'reviewed_by', actor_id
        );
    else
      next_item := item_value;
    end if;

    next_items := next_items || jsonb_build_array(next_item);
    item_index := item_index + 1;
  end loop;

  if not matched then
    raise exception 'The selected extraction item could not be found.';
  end if;

  next_data := jsonb_set(
    extraction_row.extraction_data,
    array[case when item_kind = 'entity' then 'entities' else 'claims' end],
    next_items,
    true
  );
  row_status := public.review_extraction_terminal_status(next_data);

  update public.extractions
  set
    extraction_data = next_data,
    reviewed_at = case when row_status = 'pending' then reviewed_at else now() end,
    reviewed_by = case when row_status = 'pending' then reviewed_by else actor_id end,
    status = row_status
  where id = extraction_id;

  insert into public.admin_audit_events (actor_id, action, target_table, target_id, details)
  values (
    actor_id,
    'review_extraction_' || action,
    'extractions',
    extraction_id,
    jsonb_build_object(
      'item_id', item_id,
      'item_kind', item_kind,
      'result_ids', to_jsonb(result_ids),
      'row_status', row_status
    )
  );

  return jsonb_build_object(
    'createdIds', to_jsonb(result_ids),
    'rowStatus', row_status
  );
end;
$$;

create or replace function public.reject_failed_extraction(extraction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  extraction_row public.extractions%rowtype;
  next_data jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  select *
  into extraction_row
  from public.extractions
  where id = extraction_id
  for update;

  if not found then
    raise exception 'Extraction was not found.';
  end if;

  if extraction_row.extraction_data->>'validation_failed' <> 'true' then
    raise exception 'Only validation-failed extractions can be dismissed here.';
  end if;

  next_data := extraction_row.extraction_data
    || jsonb_build_object(
      'review_status', 'rejected',
      'reviewed_at', now(),
      'reviewed_by', actor_id
    );

  update public.extractions
  set
    extraction_data = next_data,
    reviewed_at = now(),
    reviewed_by = actor_id,
    status = 'rejected'
  where id = extraction_id;

  insert into public.admin_audit_events (actor_id, action, target_table, target_id, details)
  values (
    actor_id,
    'reject_failed_extraction',
    'extractions',
    extraction_id,
    jsonb_build_object('validation_error', extraction_row.extraction_data->>'validation_error')
  );

  return jsonb_build_object('createdIds', '[]'::jsonb, 'rowStatus', 'rejected');
end;
$$;

create or replace function public.get_pending_review_source_summaries(
  page_limit integer default 50,
  page_offset integer default 0
)
returns table (
  source_id uuid,
  source_title text,
  source_status public.content_status,
  source_format public.source_format,
  source_tier public.source_tier,
  pending_item_count integer,
  pending_extraction_count integer,
  validation_failed_count integer,
  oldest_extraction_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with pending as (
    select
      sources.id as source_id,
      sources.title as source_title,
      sources.status as source_status,
      sources.format as source_format,
      sources.tier as source_tier,
      extractions.id as extraction_id,
      extractions.created_at,
      (
        select count(*)::integer
        from (
          select item.value
          from jsonb_array_elements(coalesce(extractions.extraction_data->'entities', '[]'::jsonb)) as item(value)
          union all
          select item.value
          from jsonb_array_elements(coalesce(extractions.extraction_data->'claims', '[]'::jsonb)) as item(value)
        ) items
        where coalesce(items.value->>'review_status', 'pending') = 'pending'
      ) as item_count,
      (extractions.extraction_data->>'validation_failed') = 'true' as validation_failed
    from public.extractions
    join public.chunks on chunks.id = extractions.chunk_id
    join public.sources on sources.id = chunks.source_id
    where extractions.status = 'pending'
      and sources.status <> 'archived'
  )
  select
    pending.source_id,
    pending.source_title,
    pending.source_status,
    pending.source_format,
    pending.source_tier,
    sum(pending.item_count)::integer as pending_item_count,
    count(*)::integer as pending_extraction_count,
    count(*) filter (where pending.validation_failed)::integer as validation_failed_count,
    min(pending.created_at) as oldest_extraction_at
  from pending
  where pending.item_count > 0 or pending.validation_failed
  group by
    pending.source_id,
    pending.source_title,
    pending.source_status,
    pending.source_format,
    pending.source_tier
  order by min(pending.created_at), pending.source_title
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(coalesce(page_offset, 0), 0);
$$;

create or replace function public.get_admin_entities_page(
  page_limit integer default 50,
  page_offset integer default 0,
  search_query text default null,
  status_filter public.content_status default null
)
returns table (
  total_count integer,
  id uuid,
  type public.entity_type,
  name text,
  slug text,
  aliases text[],
  description text,
  confidence_score double precision,
  confidence_override double precision,
  position_x double precision,
  position_y double precision,
  status public.content_status,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select entities.*
    from public.entities
    where entities.status <> 'archived'
      and (status_filter is null or entities.status = status_filter)
      and (
        nullif(public.normalize_review_text(search_query), '') is null
        or entities.name ilike '%' || replace(replace(public.normalize_review_text(search_query), '%', '\%'), '_', '\_') || '%' escape '\'
        or exists (
          select 1
          from unnest(entities.aliases) as alias(value)
          where alias.value ilike '%' || replace(replace(public.normalize_review_text(search_query), '%', '\%'), '_', '\_') || '%' escape '\'
        )
      )
  ),
  counted as (
    select count(*)::integer as total_count from filtered
  )
  select
    counted.total_count,
    filtered.id,
    filtered.type,
    filtered.name,
    filtered.slug,
    filtered.aliases,
    filtered.description,
    filtered.confidence_score,
    filtered.confidence_override,
    filtered.position_x,
    filtered.position_y,
    filtered.status,
    filtered.created_at,
    filtered.updated_at
  from filtered
  cross join counted
  order by filtered.updated_at desc, filtered.name
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(coalesce(page_offset, 0), 0);
$$;

create or replace function public.get_admin_claims_page(
  page_limit integer default 50,
  page_offset integer default 0,
  search_query text default null,
  status_filter public.content_status default null
)
returns table (
  total_count integer,
  id uuid,
  statement text,
  detailed_argument text,
  author_id uuid,
  confidence_score double precision,
  confidence_override double precision,
  status public.content_status,
  created_at timestamptz,
  updated_at timestamptz,
  entity_names text[],
  evidence_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select claims.*
    from public.claims
    where claims.status <> 'archived'
      and (status_filter is null or claims.status = status_filter)
      and (
        nullif(public.normalize_review_text(search_query), '') is null
        or claims.statement ilike '%' || replace(replace(public.normalize_review_text(search_query), '%', '\%'), '_', '\_') || '%' escape '\'
      )
  ),
  counted as (
    select count(*)::integer as total_count from filtered
  )
  select
    counted.total_count,
    filtered.id,
    filtered.statement,
    filtered.detailed_argument,
    filtered.author_id,
    filtered.confidence_score,
    filtered.confidence_override,
    filtered.status,
    filtered.created_at,
    filtered.updated_at,
    coalesce(
      array_agg(entities.name order by entities.name) filter (where entities.id is not null),
      '{}'::text[]
    ) as entity_names,
    count(distinct claim_evidence.anchor_id)::integer as evidence_count
  from filtered
  cross join counted
  left join public.claim_entities on claim_entities.claim_id = filtered.id
  left join public.entities on entities.id = claim_entities.entity_id
  left join public.claim_evidence on claim_evidence.claim_id = filtered.id
  group by
    counted.total_count,
    filtered.id,
    filtered.statement,
    filtered.detailed_argument,
    filtered.author_id,
    filtered.confidence_score,
    filtered.confidence_override,
    filtered.status,
    filtered.created_at,
    filtered.updated_at
  order by filtered.updated_at desc, filtered.created_at desc
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(coalesce(page_offset, 0), 0);
$$;

create or replace function public.update_claim_status(
  claim_id uuid,
  next_status public.content_status
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_entity_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if next_status = 'archived' then
    raise exception 'Claims cannot be archived through this action.';
  end if;

  update public.claims
  set status = next_status, updated_at = now()
  where id = $1;

  if not found then
    raise exception 'Claim was not found.';
  end if;

  select coalesce(array_agg(entity_id), '{}'::uuid[])
  into affected_entity_ids
  from public.claim_entities
  where claim_entities.claim_id = $1;

  insert into public.admin_audit_events (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    'update_claim_status',
    'claims',
    $1,
    jsonb_build_object('status', next_status)
  );

  return affected_entity_ids;
end;
$$;

create or replace function public.publish_claims(claim_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_entity_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  update public.claims
  set status = 'published', updated_at = now()
  where id = any(coalesce(claim_ids, '{}'::uuid[]))
    and status <> 'archived';

  select coalesce(array_agg(distinct claim_entities.entity_id), '{}'::uuid[])
  into affected_entity_ids
  from public.claim_entities
  where claim_entities.claim_id = any(coalesce(claim_ids, '{}'::uuid[]));

  insert into public.admin_audit_events (actor_id, action, target_table, details)
  values (
    auth.uid(),
    'publish_claims',
    'claims',
    jsonb_build_object('claim_ids', to_jsonb(coalesce(claim_ids, '{}'::uuid[])))
  );

  return affected_entity_ids;
end;
$$;

create or replace function public.publish_sources(source_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_entity_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  update public.sources
  set status = 'published', updated_at = now()
  where id = any(coalesce(source_ids, '{}'::uuid[]))
    and status <> 'archived';

  select coalesce(array_agg(distinct entity_id), '{}'::uuid[])
  into affected_entity_ids
  from (
    select entity_source_anchors.entity_id
    from public.entity_source_anchors
    join public.source_anchors on source_anchors.id = entity_source_anchors.anchor_id
    where source_anchors.source_id = any(coalesce(source_ids, '{}'::uuid[]))
    union
    select claim_entities.entity_id
    from public.claim_entities
    join public.claim_evidence on claim_evidence.claim_id = claim_entities.claim_id
    join public.source_anchors on source_anchors.id = claim_evidence.anchor_id
    where source_anchors.source_id = any(coalesce(source_ids, '{}'::uuid[]))
  ) affected;

  insert into public.admin_audit_events (actor_id, action, target_table, details)
  values (
    auth.uid(),
    'publish_sources',
    'sources',
    jsonb_build_object('source_ids', to_jsonb(coalesce(source_ids, '{}'::uuid[])))
  );

  return affected_entity_ids;
end;
$$;

create or replace function public.update_source_status(
  source_id uuid,
  next_status public.content_status
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_entity_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  update public.sources
  set status = next_status, updated_at = now()
  where id = $1;

  if not found then
    raise exception 'Source was not found.';
  end if;

  select coalesce(array_agg(distinct entity_id), '{}'::uuid[])
  into affected_entity_ids
  from (
    select entity_source_anchors.entity_id
    from public.entity_source_anchors
    join public.source_anchors on source_anchors.id = entity_source_anchors.anchor_id
    where source_anchors.source_id = $1
    union
    select claim_entities.entity_id
    from public.claim_entities
    join public.claim_evidence on claim_evidence.claim_id = claim_entities.claim_id
    join public.source_anchors on source_anchors.id = claim_evidence.anchor_id
    where source_anchors.source_id = $1
  ) affected;

  insert into public.admin_audit_events (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    'update_source_status',
    'sources',
    $1,
    jsonb_build_object('status', next_status)
  );

  return affected_entity_ids;
end;
$$;

grant execute on function public.review_extraction_item(text, uuid, text, text, jsonb, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.reject_failed_extraction(uuid) to authenticated;
grant execute on function public.get_pending_review_source_summaries(integer, integer) to authenticated;
grant execute on function public.get_admin_entities_page(integer, integer, text, public.content_status) to authenticated;
grant execute on function public.get_admin_claims_page(integer, integer, text, public.content_status) to authenticated;
grant execute on function public.update_claim_status(uuid, public.content_status) to authenticated;
grant execute on function public.publish_claims(uuid[]) to authenticated;
grant execute on function public.publish_sources(uuid[]) to authenticated;
grant execute on function public.update_source_status(uuid, public.content_status) to authenticated;
