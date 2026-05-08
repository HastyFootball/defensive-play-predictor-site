# Analyst Assist v7 - Box to Sideline Live Situation Sync

This update makes the box device control the live situation for sideline devices.

## What changed

- The Box screen now publishes the current live controls to Supabase:
  - quarter
  - down
  - distance
  - field zone
  - score context
  - personnel
  - formation
  - strength
  - hash
  - tempo
  - star status
  - drive phase
- The Sideline screen automatically receives those updates.
- If the box changes to 2nd down, every connected sideline screen updates to 2nd down.
- If the box changes distance, personnel, formation, or zone, sideline prediction percentages refresh too.
- Sideline can still tap manually if the box is disconnected.
- Sync ignores only the exact same browser/device, not every device logged into the same account.

## Files to upload to GitHub

Replace these files in your repo:

1. `coach-console.html`
2. `assets/analyst-assist-sync.js`

No new Supabase table is required if your `analyst_assist_state` table is already working.

## How to test

1. Open Analyst Assist on a laptop.
2. Open Analyst Assist on a phone/tablet.
3. Put the laptop in Box Mode.
4. Put the phone/tablet in Sideline Mode.
5. On the laptop, change Down to `2nd`.
6. The sideline device should automatically switch to `2nd` and refresh the percentages.
7. Change Distance to `4-6`.
8. Sideline should automatically update again.

## If it does not update

Check these first:

1. The bottom-left badge should say `Supabase sync on`.
2. Make sure `assets/analyst-assist-sync.js` is uploaded to GitHub.
3. Make sure `coach-console.html` includes:

```html
<script src="assets/analyst-assist-sync.js"></script>
```

4. In Supabase, open `analyst_assist_state` and confirm the `payload` column changes when the box changes down/distance.
5. In Vercel, redeploy after uploading the files.

## Important behavior

The box does not need to log a play for sideline to update. Changing the live situation is enough.
