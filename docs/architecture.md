# Architecture — soundtrack page

`music/` is a single static page; no bundler, no build step. GitHub Pages serves the
directory as-is (`.github/workflows/pages.yml` uploads `music/` as the Pages artifact).

## Pieces

- `index.html` — the entire player UI: track list, `<audio>` elements, the
  `<matrix-rain>` web component (canvas, 30 FPS throttled, IntersectionObserver +
  visibilitychange pause, beat-reactive speed/brightness), and the audio-analyser
  background effects loop (30 Hz throttled, cached DOM refs, write-on-change only).
- `operator-face-beat.js` — Three.js wireframe face rendered with `LineSegments2` /
  `LineMaterial` (screen-space anti-aliased lines), bloom over an RGBA HalfFloatType
  render target so alpha survives postprocessing. Camera: continuous slow orbit,
  beat-driven dolly, random cinematic moments every 16–32 beats (6 presets).
- `audio/*.m4a` — committed tracks (acid-rain, anvil, cherry-moon, inertia, oxbow-b).
- `tests/` — Playwright specs against `http://localhost:8888/`:
  `page.spec.js` (player behavior), `visual.spec.js` (rendering),
  `anvil-bug.spec.js` (regression: a rejected `play()` promise must not lock the UI;
  annotation controller auto-unlocks if audio stays paused >8s).

## Known quirks

- `togglePlay` resets state on play-promise rejection — see anvil-bug regression test.
- Smooth-scroll track switching uses a `scrollend` guard with a 2.5 s fallback.
