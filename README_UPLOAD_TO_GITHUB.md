# Upload this version to GitHub/Vercel

1. Unzip this package.
2. Open the unzipped folder.
3. Make sure you can see `index.html`, `dashboard.html`, `app.html`, and the `assets` folder immediately.
4. In GitHub, delete the old files or upload these files over the existing ones.
5. The files must be at the root of the repo, not inside another folder.
6. Commit changes.
7. Vercel should redeploy automatically.
8. Test:
   - `/`
   - `/signup.html`
   - `/login.html`
   - `/dashboard.html`
   - `/import-center.html`
   - `/analytics.html`
   - `/live-mode.html  (Game Mode / realtime sideline sync)`
   - `/reports.html`

## Important
The public Supabase URL and anon key are already in `assets/config.js` using the values you provided.

## New pages added
- Import Center
- Opponents
- Analytics
- Game Mode with Box-to-Sideline realtime sync
- Reports
- Staff Workspace

## Design change
The bright white was softened across the site. Text now uses softer blue-white tones so screens are easier on the eyes.


## New live sync step
After uploading this version, also run `supabase_schema.sql` in Supabase SQL Editor. That adds the live game tables and realtime syncing for Box Mode and Sideline Mode.

See `README_LIVE_SYNC_SETUP.md` for the simple game-night workflow.
