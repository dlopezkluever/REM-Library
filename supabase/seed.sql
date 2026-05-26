insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@mythograph.local',
  crypt('mythograph-admin', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Mythograph Admin"}'::jsonb,
  false
)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'admin@mythograph.local',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@mythograph.local","email_verified":true}'::jsonb,
  'email',
  now(),
  now(),
  now()
)
on conflict (provider, provider_id) do nothing;

insert into public.profiles (id, email, display_name, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'admin@mythograph.local',
  'Mythograph Admin',
  'super_admin'
)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = excluded.role;

insert into public.entities (
  id,
  type,
  name,
  slug,
  aliases,
  description,
  confidence_score,
  position_x,
  position_y,
  status
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'symbol',
    'Fire',
    'fire',
    array['flame', 'divine spark'],
    'A recurring symbol of stolen or transmitted divine power.',
    0.86,
    -0.45,
    0.1,
    'published'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'figure',
    'Prometheus',
    'prometheus',
    array['Forethinker'],
    'The Greek titan associated with the theft of fire for humanity.',
    0.82,
    -0.1,
    0.32,
    'published'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'narrative',
    'Prometheus Myth',
    'prometheus-myth',
    array['theft of fire'],
    'A Greek myth concerning divine fire, punishment, and human civilization.',
    0.79,
    0.28,
    0.2,
    'published'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'culture',
    'Greek',
    'greek',
    array['Hellenic'],
    'The cultural and mythic tradition of ancient Greece.',
    0.7,
    0.55,
    -0.05,
    'published'
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    'trope',
    'Theft of Divine Power',
    'theft-of-divine-power',
    array['stolen fire'],
    'A narrative pattern where a figure obtains divine force for the human world.',
    0.74,
    0.05,
    -0.35,
    'published'
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    'symbol',
    'Stone',
    'stone',
    array['rock', 'pillow stone'],
    'A material image for embodied or fixed sacred force.',
    0.54,
    -0.55,
    -0.2,
    'published'
  ),
  (
    '10000000-0000-0000-0000-000000000007',
    'narrative',
    'Genesis 28',
    'genesis-28',
    array['Jacob''s ladder'],
    'The Jacob narrative involving a stone pillow and a heavenly ladder.',
    0.58,
    -0.2,
    -0.48,
    'published'
  ),
  (
    '10000000-0000-0000-0000-000000000008',
    'figure',
    'Draft Figure',
    'draft-figure',
    array[]::text[],
    'A draft-only entity used to verify RLS filtering.',
    0.1,
    null,
    null,
    'draft'
  )
on conflict (id) do nothing;

insert into public.sources (
  id,
  title,
  authors,
  publication_date,
  format,
  tier,
  url,
  duration_seconds,
  pipeline_stage,
  status
)
values (
  '20000000-0000-0000-0000-000000000001',
  'Mythograph Sample Lecture',
  array['Primary Writer'],
  '2026-05-23',
  'audio',
  'primary',
  'https://example.com/mythograph/sample-lecture',
  3600,
  'published',
  'published'
)
on conflict (id) do nothing;

insert into public.source_anchors (
  id,
  source_id,
  start_timestamp_sec,
  end_timestamp_sec,
  transcript_excerpt,
  speaker
)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  612,
  740,
  'The Prometheus fire pattern reappears wherever divine power is transferred into the human realm.',
  'Primary Writer'
)
on conflict (id) do nothing;

insert into public.claims (
  id,
  statement,
  detailed_argument,
  author_id,
  confidence_score,
  status
)
values (
  '40000000-0000-0000-0000-000000000001',
  'The Prometheus fire myth instantiates the theft of divine power pattern.',
  'The claim reads the theft of fire as a portable form of divine force entering the human sphere, which lets the Prometheus narrative serve as a reference case for the broader trope.',
  '00000000-0000-0000-0000-000000000001',
  0.84,
  'published'
)
on conflict (id) do nothing;

insert into public.claim_entities (claim_id, entity_id)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005')
on conflict do nothing;

insert into public.claim_evidence (claim_id, anchor_id)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.relationships (
  id,
  from_entity_id,
  to_entity_id,
  type,
  weight,
  claim_ids
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'symbolizes',
    0.84,
    array['40000000-0000-0000-0000-000000000001']::uuid[]
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'appears_in',
    0.78,
    array['40000000-0000-0000-0000-000000000001']::uuid[]
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000004',
    'belongs_to',
    0.72,
    array[]::uuid[]
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000005',
    'instantiates',
    0.81,
    array['40000000-0000-0000-0000-000000000001']::uuid[]
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000007',
    'appears_in',
    0.56,
    array[]::uuid[]
  )
on conflict (id) do nothing;

insert into public.chunks (
  id,
  source_id,
  chunk_index,
  start_sec,
  end_sec,
  speaker,
  raw_text
)
values (
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  0,
  612,
  740,
  'Primary Writer',
  'The Prometheus fire pattern reappears wherever divine power is transferred into the human realm.'
)
on conflict (source_id, chunk_index) do nothing;

insert into public.extractions (
  id,
  chunk_id,
  extraction_data,
  status
)
values (
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '{"entities":[{"name":"Fire","type":"symbol"},{"name":"Prometheus","type":"figure"}],"claims":[{"statement":"The Prometheus fire myth instantiates the theft of divine power pattern."}]}'::jsonb,
  'pending'
)
on conflict (id) do nothing;
