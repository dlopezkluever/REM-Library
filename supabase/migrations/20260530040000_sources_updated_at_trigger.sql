create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sources_set_updated_at on public.sources;

create trigger sources_set_updated_at
before update on public.sources
for each row
execute function public.set_updated_at();
