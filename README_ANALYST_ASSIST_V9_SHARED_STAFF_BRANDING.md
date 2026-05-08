# Analyst Assist v9 — Shared Staff Access + Team Branding

## What changed

This version adds the workflow you described:

- One shared staff login can be used by the whole staff.
- No Analyst / Position Coach / DC permission restrictions.
- Any authenticated staff account can change anything for the team.
- Added a new `staff-access.html` page for sign in, sign up, reset password, and copying a staff invite message.
- Added team logo upload in Coach Console → Setup → Team Branding & Staff Access.
- Team name, colors, and logo sync through the existing Analyst Assist cloud state.
- Kept Box → Sideline live sync and layout customization.

## Files to upload/replace in GitHub

Upload/replace these files:

1. `coach-console.html`
2. `how-it-works.html`
3. `staff-access.html`
4. `assets/analyst-assist-sync.js`
5. `assets/supabase-app.js`
6. `assets/config.js` only if your current config is missing or wrong

Also upload this SQL file somewhere safe in your repo if you keep migrations there:

- `supabase_analyst_assist_staff_shared_access.sql`

## Supabase SQL steps

1. Go to Supabase → SQL Editor.
2. Click **New Query**.
3. Paste all contents from `supabase_analyst_assist_staff_shared_access.sql`.
4. Click **Run**.
5. Go to Project Settings → API.
6. Click **Reload schema**.

## Supabase Auth settings

For the simplest shared-login model:

1. Supabase → Authentication → Providers.
2. Make sure **Email** provider is enabled.
3. Supabase → Authentication → URL Configuration.
4. Add your Vercel domain to allowed redirect URLs.
5. Optional but easier for testing: turn off required email confirmation.

Recommended staff workflow:

- Create one shared account like `footballstaff@yourschool.org`.
- Give that login to trusted staff.
- Change the password when a coach leaves the staff.

## Vercel / config

Your `assets/config.js` must contain your real Supabase public project values:

```js
window.DPP_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY'
};
```

Do not put the Supabase service role key in this file.

## Testing checklist

1. Deploy to Vercel.
2. Open `/staff-access.html`.
3. Create or sign into the shared staff login.
4. Open Coach Console.
5. Go to Setup → Team Branding & Staff Access.
6. Change team name, colors, and logo.
7. Open Coach Console on a second device with the same login.
8. Confirm the same branding and live game state sync.
9. Put one device in Box Mode and one in Sideline Mode.
10. Change down/distance in Box Mode and confirm Sideline follows.

## Important note

This is intentionally not a high-security role-based setup. It is designed for football staff simplicity. Anyone with the shared staff login can change the team setup, game state, layout, reports, and branding.
