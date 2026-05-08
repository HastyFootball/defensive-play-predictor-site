-- Defensive Play Predictor v2 upgrade
-- Adds saved coach layouts and expands live play logging for Box/Sideline realtime sync.
-- Safe to run after your existing supabase_schema.sql.

create table if not exists public.coach_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade not null,
  layout_key text not null default 'game_mode',
  layout jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  unique(user_id, team_id, layout_key)
);

alter table public.coach_layouts enable row level security;

drop policy if exists "coaches can manage own layouts" on public.coach_layouts;
create policy "coaches can manage own layouts" on public.coach_layouts
for all using (
  user_id = auth.uid()
  and (
    exists(select 1 from public.teams t where t.id = coach_layouts.team_id and t.owner_id = auth.uid())
    or exists(select 1 from public.team_members tm where tm.team_id = coach_layouts.team_id and tm.user_id = auth.uid())
  )
) with check (
  user_id = auth.uid()
  and (
    exists(select 1 from public.teams t where t.id = coach_layouts.team_id and t.owner_id = auth.uid())
    or exists(select 1 from public.team_members tm where tm.team_id = coach_layouts.team_id and tm.user_id = auth.uid())
  )
);

-- Add richer box/sideline fields to the existing live log table.
alter table public.live_play_log add column if not exists concept text;
alter table public.live_play_log add column if not exists quarter text;
alter table public.live_play_log add column if not exists personnel text;
alter table public.live_play_log add column if not exists hash text;
alter table public.live_play_log add column if not exists tempo text;
alter table public.live_play_log add column if not exists phase text;
alter table public.live_play_log add column if not exists result text;
alter table public.live_play_log add column if not exists direction text;
alter table public.live_play_log add column if not exists gap text;
alter table public.live_play_log add column if not exists predicted text;
alter table public.live_play_log add column if not exists top3 jsonb default '[]'::jsonb;

-- Realtime publication. These blocks are safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_game_state'
  ) then
    alter publication supabase_realtime add table public.live_game_state;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_play_log'
  ) then
    alter publication supabase_realtime add table public.live_play_log;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coach_layouts'
  ) then
    alter publication supabase_realtime add table public.coach_layouts;
  end if;
end $$;
