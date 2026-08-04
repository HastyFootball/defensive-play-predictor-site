# Film Analyst V3 - Ball + QB Vision

This build replaces color-blob player guessing with TensorFlow.js COCO-SSD person detection.

## Normal workflow
1. Share Hudl.
2. Freeze a clear pre-snap frame.
3. Click the football.
4. Click the quarterback.
5. Press Analyze.
6. Correct formation/personnel only when needed.
7. Save and move to the next play.

## One-time setup
- Crop around only the football video.
- Sample one offensive jersey.
- Set Q1 direction and current quarter.

## Important
The person detector is loaded from jsDelivr and needs internet access when the page loads. The page will show `Person detector ready` before analysis can run.

This remains an experimental football classifier. It now detects real people, filters with the ball-to-QB axis, and applies football sanity checks. It does not yet use a custom football-trained model.
