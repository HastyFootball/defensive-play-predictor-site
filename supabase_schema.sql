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
