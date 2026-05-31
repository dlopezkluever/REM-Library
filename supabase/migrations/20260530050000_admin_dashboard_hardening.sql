alter type public.pipeline_stage add value if not exists 'transcribing_failed';
alter type public.pipeline_stage add value if not exists 'chunking_failed';
alter type public.pipeline_stage add value if not exists 'extracting_failed';

alter table public.sources
add column if not exists pipeline_stage_entered_at timestamptz;

update public.sources
set pipeline_stage_entered_at = updated_at
where pipeline_stage_entered_at is null;

alter table public.sources
alter column pipeline_stage_entered_at set default now(),
alter column pipeline_stage_entered_at set not null;

create or replace function public.set_pipeline_stage_entered_at()
returns trigger
language plpgsql
as $$
begin
  if old.pipeline_stage is distinct from new.pipeline_stage then
    new.pipeline_stage_entered_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists sources_set_pipeline_stage_entered_at on public.sources;

create trigger sources_set_pipeline_stage_entered_at
before update on public.sources
for each row
execute function public.set_pipeline_stage_entered_at();

do $$
begin
  alter publication supabase_realtime add table public.sources;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create or replace function public.get_admin_content_stats()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with
  entity_type_counts as (
    select type, count(*)::integer as count
    from public.entities
    group by type
  ),
  status_values as (
    select status, 'entities'::text as kind
    from public.entities
    union all
    select status, 'claims'::text as kind
    from public.claims
  ),
  status_counts as (
    select
      status,
      count(*) filter (where kind = 'entities')::integer as entities,
      count(*) filter (where kind = 'claims')::integer as claims
    from status_values
    group by status
  ),
  confidence_values as (
    select coalesce(confidence_override, confidence_score) as confidence
    from public.entities
    union all
    select coalesce(confidence_override, confidence_score) as confidence
    from public.claims
  ),
  confidence_bucket_counts as (
    select
      case
        when confidence < 0.2 then '0-0.19'
        when confidence < 0.5 then '0.2-0.49'
        when confidence < 0.8 then '0.5-0.79'
        else '0.8-1.0'
      end as label,
      count(*)::integer as count
    from confidence_values
    where confidence is not null
    group by label
  )
select jsonb_build_object(
  'entitiesByType',
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'type', type_value::text,
          'count', coalesce(entity_type_counts.count, 0)
        )
        order by array_position(enum_range(null::public.entity_type), type_value)
      ),
      '[]'::jsonb
    )
    from unnest(enum_range(null::public.entity_type)) as type_value
    left join entity_type_counts on entity_type_counts.type = type_value
  ),
  'confidenceDistribution',
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label', bucket.label,
          'count', coalesce(confidence_bucket_counts.count, 0)
        )
        order by bucket.sort_order
      ),
      '[]'::jsonb
    )
    from (
      values
        ('0-0.19'::text, 1),
        ('0.2-0.49'::text, 2),
        ('0.5-0.79'::text, 3),
        ('0.8-1.0'::text, 4)
    ) as bucket(label, sort_order)
    left join confidence_bucket_counts on confidence_bucket_counts.label = bucket.label
  ),
  'statusCounts',
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'status', status_value::text,
          'entities', coalesce(status_counts.entities, 0),
          'claims', coalesce(status_counts.claims, 0)
        )
        order by array_position(enum_range(null::public.content_status), status_value)
      ),
      '[]'::jsonb
    )
    from unnest(enum_range(null::public.content_status)) as status_value
    left join status_counts on status_counts.status = status_value
  )
);
$$;

grant execute on function public.get_admin_content_stats() to authenticated;
