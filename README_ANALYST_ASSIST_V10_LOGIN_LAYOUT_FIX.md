# Analyst Assist v10 — Login + Layout Restore

Replace these GitHub files:

1. `coach-console.html`
2. `assets/supabase-app.js`
3. `staff-access.html` if your login page is older

Do not delete the whole repo.

## Login check
Your login will only work if `assets/config.js` has real Supabase values:

```js
window.DPP_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_PUBLIC_KEY'
};
```

Open this in your browser after deployment:

`https://YOUR-SITE.vercel.app/assets/config.js`

If it says 404 or still says PASTE, fix `assets/config.js` and redeploy.

## Layout restore
Game Mode and Sideline Mode now both have bottom-of-screen customization controls again:

- Edit Layout
- drag/drop boxes
- Minimize / Show boxes
- Show All
- presets

Hard refresh after deployment: Ctrl+Shift+R / Cmd+Shift+R.
