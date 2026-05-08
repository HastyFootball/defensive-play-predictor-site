-- Analyst Assist v9 — shared staff access + no role restrictions + team branding support
-- Run this in Supabase SQL Editor as a NEW query.
-- This script is intentionally permissive for authenticated staff accounts: anyone signed in can manage team/game/state data.
-- Recommended workflow: one shared staff login per team.

create extension if not exists pgcrypto;

-- Teams table. Existing tables are preserved; missing columns are added.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text not null default 'Analyst Assist Team',
  primary_color text default '#0057b8',
  secondary_color text default '#f5c542',
  accent_color text default '#ffffff',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teams add column if not exists owner_id uuid;
alter table public.teams add column if not exists name text default 'Analyst Assist Team';
alter table public.teams add column if not exists primary_color text default '#0057b8';
alter table public.teams add column if not exists secondary_color text default '#f5c542';
alter table public.teams add column if not exists accent_color text default '#ffffff';
alter table public.teams add column if not exists logo_url text;
alter table public.teams add column if not exists created_at timestamptz not null default now();
alter table public.teams add column if not exists updated_at timestamptz not null default now();

-- Live games table.
create table if not exists public.live_games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid,
  name text not null default 'Analyst Assist Live Game',
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_games add column if not exists team_id uuid;
alter table public.live_games add column if not exists name text default 'Analyst Assist Live Game';
alter table public.live_games add column if not exists status text default 'active';
alter table public.live_games add column if not exists created_by uuid;
alter table public.live_games add column if not exists created_at timestamptz not null default now();
alter table public.live_games add column if not exists updated_at timestamptz not null default now();

-- Unified state table used by the current website.
create table if not exists public.analyst_assist_state (
  row_id uuid primary key default gen_random_uuid(),
  team_id uuid,
  game_id uuid,
  payload jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  device_role text default 'shared',
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.analyst_assist_state replica identity full;

alter table public.analyst_assist_state add column if not exists row_id uuid default gen_random_uuid();
alter table public.analyst_assist_state add column if not exists team_id uuid;
alter table public.analyst_assist_state add column if not exists game_id uuid;
alter table public.analyst_assist_state add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.analyst_assist_state add column if not exists state jsonb not null default '{}'::jsonb;
alter table public.analyst_assist_state add column if not exists device_role text default 'shared';
alter table public.analyst_assist_state add column if not exists updated_by uuid;
alter table public.analyst_assist_state add column if not exists created_at timestamptz not null default now();
alter table public.analyst_assist_state add column if not exists updated_at timestamptz not null default now();

update public.analyst_assist_state set row_id = gen_random_uuid() where row_id is null;
update public.analyst_assist_state set payload = state where payload = '{}'::jsonb and state is not null;

-- Make row_id the primary key so the app can use team_id + game_id for upsert conflict handling.
alter table public.analyst_assist_state drop constraint if exists analyst_assist_state_pkey;
alter table public.analyst_assist_state add constraint analyst_assist_state_pkey primary key (row_id);

-- Remove duplicate state rows before adding the app's conflict target.
delete from public.analyst_assist_state a
using public.analyst_assist_state b
where a.ctid < b.ctid
  and a.team_id = b.team_id
  and a.game_id = b.game_id;

drop index if exists analyst_assist_state_unique_game_role;
drop index if exists analyst_assist_state_team_game_unique;
create unique index analyst_assist_state_team_game_unique
on public.analyst_assist_state (team_id, game_id);

create index if not exists analyst_assist_state_team_id_idx on public.analyst_assist_state(team_id);
create index if not exists analyst_assist_state_game_id_idx on public.analyst_assist_state(game_id);
create index if not exists live_games_team_status_idx on public.live_games(team_id,status);

-- Timestamp helper.
create or replace function public.set_analyst_assist_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at before update on public.teams
for each row execute function public.set_analyst_assist_updated_at();

drop trigger if exists live_games_updated_at on public.live_games;
create trigger live_games_updated_at before update on public.live_games
for each row execute function public.set_analyst_assist_updated_at();

drop trigger if exists analyst_assist_state_updated_at on public.analyst_assist_state;
create trigger analyst_assist_state_updated_at before update on public.analyst_assist_state
for each row execute function public.set_analyst_assist_updated_at();

-- RLS: no coach-role restrictions. Any authenticated staff login can do everything.
alter table public.teams enable row level security;
alter table public.live_games enable row level security;
alter table public.analyst_assist_state enable row level security;

drop policy if exists "authenticated staff can manage teams" on public.teams;
create policy "authenticated staff can manage teams" on public.teams
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated staff can manage live games" on public.live_games;
create policy "authenticated staff can manage live games" on public.live_games
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated staff can manage analyst assist state" on public.analyst_assist_state;
create policy "authenticated staff can manage analyst assist state" on public.analyst_assist_state
for all to authenticated using (true) with check (true);

-- Legacy policy cleanup from older versions, if present.
drop policy if exists "staff can manage analyst assist state" on public.analyst_assist_state;
drop policy if exists "Allow public read analyst assist state" on public.analyst_assist_state;
drop policy if exists "Allow public write analyst assist state" on public.analyst_assist_state;
drop policy if exists "Allow public update analyst assist state" on public.analyst_assist_state;

-- Realtime setup.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='teams') then
    alter publication supabase_realtime add table public.teams;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_games') then
    alter publication supabase_realtime add table public.live_games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='analyst_assist_state') then
    alter publication supabase_realtime add table public.analyst_assist_state;
  end if;
end $$;
