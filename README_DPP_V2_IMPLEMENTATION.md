# Defensive Play Predictor v2 Implementation Steps

This package adds:

- Draggable/customizable Game Mode layout
- Box/Sideline presets
- Cleaner Sideline View focused on Run %, Pass %, RPO %, Screen %
- Accountability buttons: RUN / PASS / RPO / SCREEN
- Box-only detailed post-play logging and live log
- Optional Supabase realtime situation sync
- Supabase saved coach layouts

## Files to copy into GitHub

Copy these files into the root of your existing repository:

1. `coach-console.html`
2. `supabase_dpp_v2_upgrade.sql`
3. `README_DPP_V2_IMPLEMENTATION.md`

Keep your existing `assets/` folder unless you want to replace the whole package.

## Step 1 — Back up your current GitHub repo

Before replacing anything, download or branch your current repo.

Recommended branch name:

```bash
git checkout -b dpp-v2-game-mode-sideline
```

## Step 2 — Replace the console file

In GitHub, replace your current:

```text
coach-console.html
```

with the new `coach-console.html` from this package.

Commit message suggestion:

```text
Add customizable game mode and sideline quick board
```

## Step 3 — Run the Supabase upgrade SQL

Go to:

```text
Supabase Dashboard → SQL Editor → New Query
```

Paste the full contents of:

```text
supabase_dpp_v2_upgrade.sql
```

Click **Run**.

This creates `coach_layouts`, adds richer logging columns to `live_play_log`, and enables realtime publication for the new/updated tables.

## Step 4 — Confirm Supabase Realtime is enabled

In Supabase, go to:

```text
Database → Replication / Realtime
```

Make sure these tables are enabled:

- `live_game_state`
- `live_play_log`
- `coach_layouts`

If the SQL ran successfully, they should already be added to the realtime publication.

## Step 5 — Deploy to Vercel

Push your GitHub branch/commit. Vercel should auto-deploy.

If Vercel does not auto-deploy:

```text
Vercel Dashboard → Project → Deployments → Redeploy
```

## Step 6 — Test Box/Sideline workflow

Open the deployed console in two browser windows or two devices:

```text
/coach-console.html
```

On device 1:

- Use Box Mode
- Change down/distance/personnel/formation
- Log a detailed play

On device 2:

- Switch to Sideline
- Confirm situation updates
- Confirm the sideline board shows Run/Pass/RPO/Screen
- Tap RUN / PASS / RPO / SCREEN to accountability-log the play

## Step 7 — Test customizable layout

In Box Mode:

1. Click **Edit layout**
2. Drag the cards into a new order
3. Click **Done editing**
4. Refresh the page
5. Confirm the layout stays saved

Try the presets:

- Box preset
- Sideline preset
- DC preset
- Halftime preset

## Notes

The console still keeps a local browser backup in `localStorage`, so it can keep working even if Supabase is temporarily unavailable. When Supabase is connected, the new code syncs live situation state and logs plays to the live tables.

## What to improve next

Recommended next build items:

1. Add opponent-specific live game selector instead of always using the newest active game.
2. Add staff roles: Box Coach, Sideline Coach, DC, Admin.
3. Add an official halftime report screen based only on live game data.
4. Add confidence/sample-size warnings directly to each percentage card.
5. Add a full Supabase import path for CSV film data instead of local-only film storage.
