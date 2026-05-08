# Defensive Play Predictor - Supabase Launch Instructions

This website is built to be coach-friendly and no-code after setup. Netlify hosts the site. Supabase handles signups, logins, and the database.

## What is included

- `index.html` - public landing page
- `features.html` - features page
- `pricing.html` - pricing placeholder, no payments yet
- `signup.html` - coach signup page
- `login.html` - coach login page
- `dashboard.html` - protected coach/team dashboard
- `app.html` - your predictor app, protected behind login
- `assets/config.js` - where your Supabase keys go
- `supabase_schema.sql` - database setup script

## Step 1 - Create Supabase project

1. Go to https://supabase.com
2. Create a free account or log in.
3. Click **New project**.
4. Name it something like `defensive-play-predictor`.
5. Save your database password somewhere safe.
6. Choose the closest region.
7. Create the project.

## Step 2 - Add the database tables

1. In Supabase, open your project.
2. Click **SQL Editor**.
3. Click **New query**.
4. Open `supabase_schema.sql` from this folder.
5. Copy the whole file into Supabase.
6. Click **Run**.

## Step 3 - Copy Supabase keys into the website

1. In Supabase, go to **Project Settings**.
2. Click **API**.
3. Copy the **Project URL**.
4. Copy the **anon public key**.
5. Open `assets/config.js` in this website folder.
6. Replace:
   - `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE`
   - `PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE`
7. Save the file.

Do not use the service role key in this website. Use only the anon public key.

## Step 4 - Authentication settings

1. In Supabase, go to **Authentication**.
2. Go to **URL Configuration**.
3. Set **Site URL** to your Netlify URL after you deploy.
   - Example: `https://your-site-name.netlify.app`
4. Add the same URL to **Redirect URLs**.
5. For early testing, you can turn off email confirmations:
   - Authentication > Providers > Email
   - Disable **Confirm email**

You can turn email confirmation back on later.

## Step 5 - Deploy to Netlify

1. Zip or keep this folder unzipped.
2. Go to https://netlify.com
3. Click **Add new site**.
4. Choose **Deploy manually**.
5. Drag this whole website folder into Netlify.
6. Wait for the deploy to finish.
7. Open your Netlify URL.

## Step 6 - Test the flow

Test these pages in this order:

1. Home page: `index.html`
2. Sign up: `signup.html`
3. Log in: `login.html`
4. Dashboard: `dashboard.html`
5. Open Predictor: `app.html`
6. Sign out

## Step 7 - Custom domain later

In Netlify:

1. Go to **Domain management**.
2. Add your custom domain.
3. Follow Netlify's DNS instructions.
4. Update Supabase Authentication URL settings to use your custom domain.

## Important note about app data

This version protects the app behind login and creates team workspaces in Supabase. Your original predictor still saves most live football data locally in the browser. The database tables are included so cloud saving can be added next.

Recommended next upgrade:

- Save film imports to `play_logs`
- Save team settings to `team_settings`
- Add staff invites
- Add Stripe payments
- Add admin owner dashboard
