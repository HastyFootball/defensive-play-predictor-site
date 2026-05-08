-- Defensive Play Predictor baseline database schema
-- Run this in your database SQL editor if you need the full workspace structure.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  logo_url text,
  primary_color text default '#0057b8',
  secondary_color text default '#f5c742',
  created_at timestamptz default now()
);

alter table public.teams enable row level security;

drop policy if exists "owners can manage teams" on public.teams;
create policy "owners can manage teams" on public.teams
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists public.opponents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  name text not null,
  week_label text,
  notes text,
  created_at timestamptz default now()
);

alter table public.opponents enable row level security;

drop policy if exists "team owners can manage opponents" on public.opponents;
create policy "team owners can manage opponents" on public.opponents
for all using (
  exists(select 1 from public.teams t where t.id = opponents.team_id and t.owner_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = opponents.team_id and t.owner_id = auth.uid())
);

create table if not exists public.play_imports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  opponent_id uuid references public.opponents(id) on delete set null,
  filename text,
  row_count integer default 0,
  raw_payload jsonb,
  created_at timestamptz default now()
);

alter table public.play_imports enable row level security;

drop policy if exists "team owners can manage imports" on public.play_imports;
create policy "team owners can manage imports" on public.play_imports
for all using (
  exists(select 1 from public.teams t where t.id = play_imports.team_id and t.owner_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = play_imports.team_id and t.owner_id = auth.uid())
);

create table if not exists public.game_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  opponent_id uuid references public.opponents(id) on delete set null,
  title text not null,
  report_body jsonb,
  created_at timestamptz default now()
);

alter table public.game_reports enable row level security;

drop policy if exists "team owners can manage reports" on public.game_reports;
create policy "team owners can manage reports" on public.game_reports
for all using (
  exists(select 1 from public.teams t where t.id = game_reports.team_id and t.owner_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = game_reports.team_id and t.owner_id = auth.uid())
);

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  email text not null,
  role text default 'coach',
  created_at timestamptz default now()
);

alter table public.staff_invites enable row level security;

drop policy if exists "team owners can manage staff invites" on public.staff_invites;
create policy "team owners can manage staff invites" on public.staff_invites
for all using (
  exists(select 1 from public.teams t where t.id = staff_invites.team_id and t.owner_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = staff_invites.team_id and t.owner_id = auth.uid())
);

-- Phase 3: realtime Game Mode sync
-- Run this section if you want Box Mode and Sideline Mode to update across devices.

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text default 'coach',
  created_at timestamptz default now(),
  unique(team_id, user_id)
);

alter table public.team_members enable row level security;

drop policy if exists "owners can manage team members" on public.team_members;
create policy "owners can manage team members" on public.team_members
for all using (
  exists(select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  or team_members.user_id = auth.uid()
) with check (
  exists(select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  or team_members.user_id = auth.uid()
);

create table if not exists public.live_games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text default 'Friday Night Live',
  status text default 'active',
  created_at timestamptz default now()
);

alter table public.live_games enable row level security;

drop policy if exists "staff can manage live games" on public.live_games;
create policy "staff can manage live games" on public.live_games
for all using (
  exists(select 1 from public.teams t where t.id = live_games.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = live_games.team_id and tm.user_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = live_games.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = live_games.team_id and tm.user_id = auth.uid())
);

create table if not exists public.live_game_state (
  game_id uuid primary key references public.live_games(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);

alter table public.live_game_state enable row level security;

drop policy if exists "staff can manage live state" on public.live_game_state;
create policy "staff can manage live state" on public.live_game_state
for all using (
  exists(select 1 from public.teams t where t.id = live_game_state.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = live_game_state.team_id and tm.user_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = live_game_state.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = live_game_state.team_id and tm.user_id = auth.uid())
);

create table if not exists public.live_play_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.live_games(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  play_family text not null,
  down text,
  distance text,
  zone text,
  formation text,
  state_snapshot jsonb,
  created_at timestamptz default now()
);

alter table public.live_play_log enable row level security;

drop policy if exists "staff can manage live play log" on public.live_play_log;
create policy "staff can manage live play log" on public.live_play_log
for all using (
  exists(select 1 from public.teams t where t.id = live_play_log.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = live_play_log.team_id and tm.user_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = live_play_log.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = live_play_log.team_id and tm.user_id = auth.uid())
);

-- Realtime publication. Safe to run more than once.
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
end $$;
