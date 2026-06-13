create unique index sources_url_normalized_unique
  on public.sources (lower(regexp_replace(url, '/$', '')))
  where url is not null;
