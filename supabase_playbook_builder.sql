-- Analyst Assist Playbook Builder cloud sync
-- Run once in Supabase SQL Editor. The page still works in local-only mode if this is not installed.

create table if not exists public.team_playbook_plays (
  team_id uuid not null references public.teams(id) on delete cascade,
  play_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, play_id)
);

alter table public.team_playbook_plays enable row level security;

drop policy if exists "staff can manage team playbook" on public.team_playbook_plays;
create policy "staff can manage team playbook" on public.team_playbook_plays
for all to authenticated
using (
  exists(select 1 from public.teams t where t.id = team_playbook_plays.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = team_playbook_plays.team_id and tm.user_id = auth.uid())
)
with check (
  exists(select 1 from public.teams t where t.id = team_playbook_plays.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = team_playbook_plays.team_id and tm.user_id = auth.uid())
);

create index if not exists idx_team_playbook_plays_updated_at on public.team_playbook_plays(team_id, updated_at desc);
