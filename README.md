# operator-media

Media/assets repo for OPERATOR. Currently hosts the soundtrack page — an interactive
music player with a 3D wireframe face that reacts to the audio (beat-synced camera
moves, matrix-rain background), built with Three.js in a single static HTML page.

Live: https://j-gierend.github.io/operator-media/

## Layout

- `music/` — the soundtrack page (static, no build step)
  - `index.html` — player UI, audio wiring, `<matrix-rain>` component, analyser effects
  - `operator-face-beat.js` — Three.js face + beat-driven cinematic camera
  - `audio/*.m4a` — the tracks (committed assets)
  - `tests/` — Playwright specs
- `.github/workflows/pages.yml` — publishes `music/` to GitHub Pages on push to master

## Run locally

```bash
cd music
python3 -m http.server 8888
# open http://localhost:8888/
```

## Tests

```bash
cd music
npm install
npx playwright test   # expects the page served on http://localhost:8888/
```
