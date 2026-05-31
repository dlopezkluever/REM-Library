insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-files',
  'source-files',
  false,
  1073741824,
  array[
    'application/epub+zip',
    'application/msword',
    'application/pdf',
    'application/rtf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/aac',
    'audio/aiff',
    'audio/flac',
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/wave',
    'audio/webm',
    'audio/x-aiff',
    'audio/x-m4a',
    'audio/x-wav',
    'text/markdown',
    'text/plain',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'source files internal read'
  ) then
    create policy "source files internal read"
      on storage.objects for select
      using (bucket_id = 'source-files' and public.has_internal_access());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'source files admin insert'
  ) then
    create policy "source files admin insert"
      on storage.objects for insert
      with check (bucket_id = 'source-files' and public.is_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'source files admin update'
  ) then
    create policy "source files admin update"
      on storage.objects for update
      using (bucket_id = 'source-files' and public.is_admin())
      with check (bucket_id = 'source-files' and public.is_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'source files admin delete'
  ) then
    create policy "source files admin delete"
      on storage.objects for delete
      using (bucket_id = 'source-files' and public.is_admin());
  end if;
end $$;
