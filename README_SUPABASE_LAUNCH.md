# Defensive Play Predictor — Launch Notes

This is the cleaned coach-facing version.

## What changed
- Removed redundant sales/pricing navigation after signup.
- Dashboard now focuses on football actions: open predictor, import chart data, reports, create team.
- User-facing pages no longer mention Supabase.
- Forms and inputs stay dark/easy on the eyes.
- The in-app Product tab was removed so signed-in coaches are not sold to again.

## Deploy update
1. Open your GitHub repo.
2. Replace the existing files with the files from this folder.
3. Make sure these are at the root of the repo: `index.html`, `signup.html`, `login.html`, `dashboard.html`, `app.html`, and `assets/`.
4. Commit changes.
5. Vercel will redeploy automatically.
6. Test `/assets/config.js`, `/signup.html`, `/login.html`, `/dashboard.html`, and `/app.html`.

## Config
Your public anon key belongs in `assets/config.js`. The URL should look like:

```js
SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co'
```

Do not include `/rest/v1/` at the end.
