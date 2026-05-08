# Analyst Assist v6 — Brand + Supabase Cloud Sync

## What changed

- Product name changed to **Analyst Assist**.
- The How It Works page no longer exposes exact formulas or code-style scoring math.
- The Coach Console now loads/saves the unified app state to Supabase through `analyst_assist_state`.
- Game Mode layout, Sideline layout, minimized cards, hidden-noise setting, film data, and live logs are saved to Supabase when the coach is logged in.
- Browser localStorage remains only as a fallback if Supabase is not connected or the SQL has not been run yet.

## Files to copy into GitHub

Copy these files/folders from this ZIP into your repo:

- `coach-console.html`
- `how-it-works.html`
- `assets/config.js`
- `assets/supabase-app.js`
- `assets/footer.js`
- `assets/analyst-assist-sync.js`
- Any other HTML files if you want the Analyst Assist name across the entire site
- `supabase_analyst_assist_cloud_sync.sql`

## Supabase setup

1. Open Supabase.
2. Go to **SQL Editor**.
3. First make sure your original schema is already installed:
   - `supabase_schema.sql`
   - `supabase_dpp_v2_upgrade.sql`
4. Then run:
   - `supabase_analyst_assist_cloud_sync.sql`
5. Go to **Database → Replication**.
6. Confirm `analyst_assist_state` is enabled for realtime. The SQL attempts to do this automatically.

## GitHub / Vercel steps

1. Replace the files in your GitHub repo.
2. Commit with a message like: `Rename to Analyst Assist and add Supabase cloud sync`.
3. Push to GitHub.
4. Vercel should redeploy automatically.
5. Open the live site and log in.
6. Open Coach Console on two devices or two browser windows.
7. Change a layout, minimize a card, or log a sideline play.
8. The second device should update after sync.

## How to know it is not local-only anymore

On the Coach Console, look at the small status pill in the bottom-left:

- `Supabase sync on` means data is saving to Supabase.
- `Local fallback: run Supabase setup SQL` means the frontend is working, but the SQL table is missing or permissions need fixing.
- `Local mode until login` means you need to log in first.

## Important note

This keeps one active live game per team. That is best for your current game-night workflow. Later, you can add a game selector for multiple opponents/weeks.
