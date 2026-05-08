-- Analyst Assist Supabase cloud sync upgrade
-- Run this AFTER your existing supabase_schema.sql and previous v2 upgrade SQL.
-- This moves the unified Coach Console away from local-only browser storage by saving the full console state,
-- coach layouts, minimized cards, sideline settings, film data, and live logs into Supabase.

create table if not exists public.analyst_assist_state (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  game_id uuid references public.live_games(id) on delete cascade not null,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now(),
  unique(team_id, game_id)
);

alter table public.analyst_assist_state enable row level security;

drop policy if exists "staff can manage analyst assist state" on public.analyst_assist_state;
create policy "staff can manage analyst assist state"
for all using (
  exists(select 1 from public.teams t where t.id = analyst_assist_state.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = analyst_assist_state.team_id and tm.user_id = auth.uid())
) with check (
  exists(select 1 from public.teams t where t.id = analyst_assist_state.team_id and t.owner_id = auth.uid())
  or exists(select 1 from public.team_members tm where tm.team_id = analyst_assist_state.team_id and tm.user_id = auth.uid())
);

-- Keep the updated_at column fresh.
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_analyst_assist_state_updated_at on public.analyst_assist_state;
create trigger set_analyst_assist_state_updated_at
before update on public.analyst_assist_state
for each row execute function public.set_current_timestamp_updated_at();

-- Make sure realtime is enabled for the unified state table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'analyst_assist_state'
  ) then
    alter publication supabase_realtime add table public.analyst_assist_state;
  end if;
end $$;

-- Helpful indexes.
create index if not exists idx_analyst_assist_state_team_game on public.analyst_assist_state(team_id, game_id);
create index if not exists idx_analyst_assist_state_updated_at on public.analyst_assist_state(updated_at desc);
