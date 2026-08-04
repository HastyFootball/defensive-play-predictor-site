# Film Analyst v2 — Ball Anchor

This version removes the repeated player-by-player and field-redrawing workflow.

## Normal play workflow

1. Pause Hudl on a clear pre-snap frame.
2. Click **Freeze pre-snap**.
3. Click **Mark ball**, then click the football.
4. Click **Ready — analyze**.
5. Review or correct formation and personnel.
6. Add the actual play type/concept after watching the play.
7. Click **Save & next play**.

## One-time session setup

- Share the Hudl tab/window.
- Optionally crop the football video once.
- Freeze a frame and click **Sample offense jersey** once.
- Choose the first-quarter offense direction.

The crop and offense color are stored in the browser and reused.

## Quarter direction

Choose the offense's direction in Q1. Film Analyst automatically uses the opposite direction in Q2, returns to the Q1 direction in Q3, and flips again in Q4. Use **Flip this play** for cutups or unusual film order.

## Important accuracy note

This is an experimental browser-side detector. It uses a sampled offensive jersey color, the clicked football, player-like color regions, and alignment heuristics. It will work better with:

- Wide or sideline film
- Stable pre-snap frames
- Clearly different uniform colors
- Players large enough to distinguish
- Minimal scoreboard graphics over the formation

It is not yet a trained football computer-vision model. Low-confidence results should be corrected. Every saved correction is exported as training data for a future model.

## Local launch

Run `start-film-analyst.bat`, then open:

`http://localhost:8080/film-analyst.html`
