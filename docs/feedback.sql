-- Run in a dedicated Supabase project. The app writes through a server-only service key.
create table if not exists public.transition_feedback (
  id bigint generated always as identity primary key,
  evaluation_id uuid not null unique,
  created_at timestamptz not null default now(),
  rating text not null check (rating in ('smooth', 'jarring', 'unsure')),
  playlist_type_id text not null,
  flow_keyword_ids text[] not null,
  source text not null,
  from_energy numeric not null check (from_energy between 0 and 100),
  to_energy numeric not null check (to_energy between 0 and 100),
  from_rhythm numeric not null check (from_rhythm between 0 and 100),
  to_rhythm numeric not null check (to_rhythm between 0 and 100),
  from_confidence numeric not null check (from_confidence between 0 and 1),
  to_confidence numeric not null check (to_confidence between 0 and 1)
);
alter table public.transition_feedback enable row level security;
-- No public policy: only the server-side service role can insert/read.
