# operator-media — soundtrack page polish

End-to-end fixes — all complete, all verified by playwright.

## Done

- [x] **#1 BUG Anvil track freezes the player** — `togglePlay`'s `playPromise.catch` was calling `onAudioPlay()` which locked the UI even when audio never started. Now resets state cleanly + shows error. Added a safety net in `annotationController.checkTime` that auto-unlocks if audio stays paused >8s. Regression test: `tests/anvil-bug.spec.js`.
- [x] **#2 Music-synced camera** — `operator-face-beat.js` rewritten with continuous slow orbit, beat-driven dolly (zoom-in on each beat), random cinematic moments (every 16-32 beats, ease into a closer/different framing for ~6 beats then ease out). 6 cinematic presets randomly chosen.
- [x] **#3 Crisp wireframe** — `LineSegments2` + `LineMaterial` (screen-space anti-aliased lines) instead of plain triangle wireframe. DPR cap raised to 3. RGBA HalfFloatType render target so alpha is preserved through bloom (so matrix rain shows through).
- [x] **#4 Matrix rain background** — new `<matrix-rain>` web component. Half-width katakana + digits + symbols, 30 FPS throttled, IntersectionObserver pauses when off-screen, doc.visibilityState pauses when tab hidden, ResizeObserver for layout. Beat-reactive: faster falls + brighter glyphs while playing.
- [x] **#5 QA / perf pass** —
  - Deleted dead `operator-face.js` (no longer referenced).
  - `applyAudioEffects`: cached `#operator-bg` reference (was `getElementById` 60×/sec); skipped no-op `transform` writes; replaced multi-line filter template with single line; only writes `style.filter` when the value actually changed.
  - `startVisualization`: 30 Hz throttle on the audio analyser loop (was full rAF). Halves CPU + DOM writes. No visual loss.
  - `operator-face-beat.js`: reusable Vector3 instances in `animateEyes` (no per-frame `new`); inlined arithmetic in cinematic blend (no per-frame Vector3 allocations).
  - Smooth-scroll race: `isProgrammaticScroll` guard now uses `scrollend` when available + 2.5s fallback (was 1s). Was causing the rare track-switch flake under heavier scenes.
  - Annotation safety net's `_pausedFor` accumulator now resets on `start()`.
