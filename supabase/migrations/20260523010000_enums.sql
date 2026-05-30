create extension if not exists pgcrypto;

create type public.entity_type as enum ('symbol', 'figure', 'narrative', 'culture', 'trope');

create type public.relationship_type as enum (
  'symbolizes',
  'appears_in',
  'belongs_to',
  'parallels',
  'instantiates',
  'supports'
);

create type public.content_status as enum ('draft', 'published', 'archived', 'disputed');

create type public.source_format as enum ('audio', 'video', 'text', 'book', 'url');

create type public.source_tier as enum ('primary', 'secondary');

create type public.pipeline_stage as enum (
  'uploaded',
  'transcribing',
  'chunking',
  'extracting',
  'review',
  'curated',
  'published'
);

create type public.extraction_status as enum (
  'pending',
  'confirmed',
  'edited',
  'rejected',
  'merged'
);

create type public.admin_role as enum ('super_admin', 'editor', 'viewer');
