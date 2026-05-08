# Defensive Play Predictor — Unified Accessible Portal

This version keeps the clean login/website flow while restoring the important coach controls from the full predictor build.

## What changed

- One logged-in product experience: **Coach Console**
- Removed duplicate standalone Prep/Game/Reports pages by redirecting them into Coach Console
- Restored advanced controls:
  - Opponent setup
  - CSV/Hudl-style import
  - Manual film entry
  - Active concepts
  - Custom concepts
  - Formation manager
  - Defensive system setup
  - Star player factor
  - Star touch concepts
  - Reports / halftime sheet
  - Data export/import
- Kept Supabase login/signup files and config
- Softened bright whites for easier viewing

## Upload instructions

1. Unzip this file.
2. Open the folder until you see `index.html`, `dashboard.html`, `coach-console.html`, and `assets`.
3. Upload those contents directly to the root of your GitHub repo.
4. Click **Commit changes**.
5. Vercel will redeploy automatically.

## Supabase

You should not need a new Supabase project. Keep your existing `assets/config.js`.

If you replace all files, double-check that `assets/config.js` still has your real Supabase URL and anon key.
