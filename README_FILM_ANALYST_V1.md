# Analyst Assist - Film Analyst v1

Film Analyst v1 is a supervised film-charting and training-data tool. It captures a user-selected Hudl tab, window, or screen through the browser, then lets the analyst:

- crop to the football video region;
- freeze pre-snap, snap, and end frames;
- map the visible field and line of scrimmage;
- mark offensive positions;
- calculate approximate splits, depth, spacing, and formation width;
- label the play;
- save examples in browser local storage;
- export JSON and CSV datasets.

## Important limitation

This first version does not claim to automatically identify formations, players, the ball carrier, or concepts. It creates consistent labeled examples that a future local computer-vision model can learn from.

## Run locally

From the project folder in Windows PowerShell:

```powershell
py -m http.server 8080
```

Then open:

```text
http://localhost:8080/film-analyst.html
```

Chrome or Edge will ask which tab, window, or screen to share. Select the Hudl film source.

## Recommended workflow

1. Open Hudl film and pause on a clear pre-snap frame.
2. Open Film Analyst in another browser window.
3. Click **Share film screen** and select Hudl.
4. Run **Guided calibration**.
5. Freeze the pre-snap frame.
6. Mark visible offensive positions.
7. Click **Analyze measurements**.
8. Label the play and save it.
9. Export JSON periodically as a backup.

## Data storage

Examples are stored only in the current browser's local storage under:

`analyst_assist_film_dataset_v1`

Export JSON regularly. Clearing browser site data will remove locally saved examples.
