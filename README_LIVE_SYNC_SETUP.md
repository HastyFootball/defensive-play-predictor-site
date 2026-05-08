# Live Box-to-Sideline Sync Setup

This version adds true Game Mode sync.

## What it does

- Box Mode can update down, distance, formation, personnel, zone, hash, score, and tempo.
- Sideline Mode automatically receives those changes on another iPad/laptop.
- Sideline Mode is intentionally simple: Run, Pass, RPO, Screen, top plays, down, and distance.
- Both devices must be logged into accounts that can access the same team workspace.

## Required Supabase step

After uploading this version to GitHub and letting Vercel redeploy:

1. Open Supabase.
2. Go to SQL Editor.
3. Open `supabase_schema.sql` from this package.
4. Paste it into Supabase.
5. Click Run.

This adds the realtime tables:

- `live_games`
- `live_game_state`
- `live_play_log`
- `team_members`

It does not delete your users.

## Supabase Realtime

The SQL file tries to add `live_game_state` and `live_play_log` to Supabase Realtime.

If Supabase says those tables are already added, that is fine.

## How to use it on game night

### Coach in the box

1. Log in.
2. Open Dashboard.
3. Open Game Mode.
4. Choose Box Mode.
5. Update situation and quick-log play family.

### DC on sideline

1. Log in on iPad.
2. Open Dashboard.
3. Open Game Mode.
4. Choose Sideline Mode.
5. Watch live situation and predictions update.
6. Use only quick buttons if working without a box coach.

## Important note

For true shared syncing between different coach accounts, those accounts need access to the same team. This package includes the database table for staff membership, but the staff invite workflow is still basic. For testing, the easiest path is to log into the same coach account on both devices.
