create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.admin_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  type public.entity_type not null,
  name text not null,
  slug text unique not null,
  aliases text[] not null default '{}',
  description text,
  confidence_score double precision not null default 0 check (confidence_score between 0 and 1),
  confidence_override double precision check (confidence_override between 0 and 1),
  position_x double precision,
  position_y double precision,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entities_type_status_idx on public.entities (type, status);
create index entities_slug_idx on public.entities (slug);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  from_entity_id uuid not null references public.entities(id) on delete cascade,
  to_entity_id uuid not null references public.entities(id) on delete cascade,
  type public.relationship_type not null,
  weight double precision not null default 1.0 check (weight >= 0),
  claim_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint relationships_no_self_link check (from_entity_id <> to_entity_id)
);

create index relationships_from_idx on public.relationships (from_entity_id);
create index relationships_to_idx on public.relationships (to_entity_id);
create index relationships_type_idx on public.relationships (type);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  statement text not null,
  detailed_argument text,
  author_id uuid references public.profiles(id) on delete set null,
  confidence_score double precision not null default 0 check (confidence_score between 0 and 1),
  confidence_override double precision check (confidence_override between 0 and 1),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claims_status_idx on public.claims (status);
create index claims_author_idx on public.claims (author_id);

create table public.claim_entities (
  claim_id uuid not null references public.claims(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  primary key (claim_id, entity_id)
);

create index claim_entities_entity_idx on public.claim_entities (entity_id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authors text[] not null default '{}',
  publication_date date,
  format public.source_format not null,
  tier public.source_tier not null,
  url text,
  file_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  page_count integer check (page_count is null or page_count >= 0),
  pipeline_stage public.pipeline_stage not null default 'uploaded',
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_status_idx on public.sources (status);
create index sources_tier_idx on public.sources (tier);
create index sources_pipeline_stage_idx on public.sources (pipeline_stage);

create table public.source_anchors (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  start_timestamp_sec integer check (start_timestamp_sec is null or start_timestamp_sec >= 0),
  end_timestamp_sec integer check (end_timestamp_sec is null or end_timestamp_sec >= 0),
  start_page integer check (start_page is null or start_page > 0),
  end_page integer check (end_page is null or end_page > 0),
  transcript_excerpt text,
  speaker text,
  created_at timestamptz not null default now(),
  constraint source_anchors_timestamp_order check (
    start_timestamp_sec is null
    or end_timestamp_sec is null
    or start_timestamp_sec <= end_timestamp_sec
  ),
  constraint source_anchors_page_order check (
    start_page is null
    or end_page is null
    or start_page <= end_page
  )
);

create index source_anchors_source_idx on public.source_anchors (source_id);

create table public.claim_evidence (
  claim_id uuid not null references public.claims(id) on delete cascade,
  anchor_id uuid not null references public.source_anchors(id) on delete cascade,
  primary key (claim_id, anchor_id)
);

create index claim_evidence_anchor_idx on public.claim_evidence (anchor_id);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  start_sec integer check (start_sec is null or start_sec >= 0),
  end_sec integer check (end_sec is null or end_sec >= 0),
  speaker text,
  raw_text text not null,
  created_at timestamptz not null default now(),
  constraint chunks_source_chunk_index_unique unique (source_id, chunk_index),
  constraint chunks_time_order check (
    start_sec is null
    or end_sec is null
    or start_sec <= end_sec
  )
);

create index chunks_source_idx on public.chunks (source_id);

create table public.extractions (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.chunks(id) on delete cascade,
  extraction_data jsonb not null,
  status public.extraction_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index extractions_chunk_idx on public.extractions (chunk_id);
create index extractions_status_idx on public.extractions (status);
