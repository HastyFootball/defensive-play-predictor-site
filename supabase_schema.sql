-- Defensive Play Predictor Supabase schema
-- Run this in Supabase SQL Editor after creating your project.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique(team_id, user_id)
);

create table if not exists public.play_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent text,
  game_label text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_settings (
  team_id uuid primary key references public.teams(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.play_logs enable row level security;
alter table public.team_settings enable row level security;

create policy "Users can view their teams" on public.teams
for select using (owner_id = auth.uid());

create policy "Users can create teams" on public.teams
for insert with check (owner_id = auth.uid());

create policy "Owners can update teams" on public.teams
for update using (owner_id = auth.uid());

create policy "Owners can delete teams" on public.teams
for delete using (owner_id = auth.uid());

create policy "Users can view memberships" on public.team_members
for select using (user_id = auth.uid());

create policy "Users can create own memberships" on public.team_members
for insert with check (user_id = auth.uid());

create policy "Users can view own play logs" on public.play_logs
for select using (user_id = auth.uid());

create policy "Users can create own play logs" on public.play_logs
for insert with check (user_id = auth.uid());

create policy "Users can update own play logs" on public.play_logs
for update using (user_id = auth.uid());

create policy "Users can delete own play logs" on public.play_logs
for delete using (user_id = auth.uid());

create policy "Owners can view team settings" on public.team_settings
for select using (
  exists(select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
);

create policy "Owners can insert team settings" on public.team_settings
for insert with check (
  exists(select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
);

create policy "Owners can update team settings" on public.team_settings
for update using (
  exists(select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
);
