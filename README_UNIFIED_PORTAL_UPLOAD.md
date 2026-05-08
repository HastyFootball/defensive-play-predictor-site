# Defensive Play Predictor — Unified Portal Update

This version cleans up the site so it no longer feels like a website inside another website.

## What changed

- Dashboard is now the main coach home base.
- Prep Center combines Opponents, Import Center, Analytics, and Reports.
- Game Mode combines the old predictor/sideline/live sync experience.
- Staff remains its own simple workspace.
- Old pages redirect into the new unified flow.
- The bright white text was softened for easier viewing.
- The old standalone `app.html` redirects to `game-mode.html` so coaches do not enter a second-looking app.

## Main authenticated flow

1. `dashboard.html` — Coach Home
2. `prep-center.html` — Opponent prep, import, analytics, reports
3. `game-mode.html` — Box Mode + Sideline Mode + live sync
4. `staff.html` — Staff workspace

## Upload to GitHub

Upload the CONTENTS of this folder to the root of your GitHub repo.

The repo root should show:

- `index.html`
- `signup.html`
- `login.html`
- `dashboard.html`
- `prep-center.html`
- `game-mode.html`
- `staff.html`
- `assets/`
- `supabase_schema.sql`

Do not upload the parent folder itself.

## Supabase

If you already ran the live sync SQL from the previous version, you should not need to redo anything.

If Game Mode says tables are missing, run `supabase_schema.sql` again in Supabase SQL Editor.
