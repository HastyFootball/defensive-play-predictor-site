# Analyst Assist v8 - Layout Controls Restored + Box/Sideline Sync

## What changed
- Restored visible layout customization controls on Game Mode screens.
- Added bottom-of-screen Customize Game Mode Layout controls.
- Added bottom-of-screen Customize Sideline Layout controls.
- Added Minimize/Show button to game cards.
- Kept v7 Box-to-Sideline live situation sync.
- Sideline play-type percentage cards can be tapped to log Run, Pass, RPO, or Screen.
- Undo last remains available on the sideline screen.

## What to upload to GitHub
You do not need to delete the whole repository.

Replace these files only:
1. `coach-console.html`
2. `assets/analyst-assist-sync.js`
3. `how-it-works.html` if your GitHub copy is older than v6/v7

Optional:
- Upload this README for your notes.

## After uploading
1. Commit the changes.
2. Let Vercel redeploy.
3. Hard refresh the browser: Ctrl+Shift+R / Cmd+Shift+R.
4. Open Game Mode.
5. Scroll to the bottom of Box Mode and Sideline Mode to find the customize controls.

## Testing
- On laptop, use Box Mode.
- On phone/tablet, use Sideline Mode.
- Change down/distance on the box.
- Confirm sideline updates automatically.
- Tap a Run/Pass/RPO/Screen percentage card on sideline.
- Confirm the play logs and the last-play line updates.
