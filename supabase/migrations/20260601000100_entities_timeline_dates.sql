-- Timeline view metadata for entities. Admins set these when curating
-- Narrative and Figure entities so they can be plotted chronologically.
--   date_era       a human-readable era label (e.g. "Classical Antiquity")
--   date_sort_year a signed year used to position the entity on the x-axis
--                  (negative for BCE, e.g. -1200)

alter table public.entities
  add column if not exists date_era text,
  add column if not exists date_sort_year integer;

create index if not exists entities_date_sort_year_idx
  on public.entities (date_sort_year)
  where date_sort_year is not null;
