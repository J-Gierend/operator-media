# operator-media — soundtrack page polish

End-to-end fixes — all complete, verified by playwright. (Done items below belong in changelog.md per global standard; not migrated — changelog.md not in this pass's file manifest.)

## Done

- [x] **#1 BUG Anvil track freezes player** — `togglePlay`'s `playPromise.catch` called `onAudioPlay()`, locking UI even when audio never started. Fix: clean state reset + error shown; safety net in `annotationController.checkTime` auto-unlocks if audio stays paused >8s. Regression test: `tests/anvil-bug.spec.js`.
- [x] **#2 Music-synced camera** — `operator-face-beat.js` rewritten: continuous slow orbit, beat-driven dolly (zoom-in/beat), random cinematic moments (every 16-32 beats, ease into closer/different framing ~6 beats then ease out), 6 presets randomly chosen.
- [x] **#3 Crisp wireframe** — `LineSegments2`+`LineMaterial` (screen-space anti-aliased lines) replaces plain triangle wireframe; DPR cap raised to 3; RGBA HalfFloatType render target preserves alpha through bloom (matrix rain shows through).
- [x] **#4 Matrix rain background** — new `<matrix-rain>` web component: half-width katakana+digits+symbols, 30 FPS throttled, IntersectionObserver pauses off-screen, doc.visibilityState pauses on hidden tab, ResizeObserver for layout; beat-reactive faster falls + brighter glyphs while playing.
- [x] **#5 QA / perf pass** — deleted dead `operator-face.js` (unreferenced); `applyAudioEffects` cached `#operator-bg` ref (was `getElementById` 60×/sec), skipped no-op `transform` writes, single-line filter template, writes `style.filter` only on change; `startVisualization` 30 Hz throttle on audio analyser loop (was full rAF) — halves CPU+DOM writes, no visual loss; `operator-face-beat.js` reusable Vector3 instances in `animateEyes` (no per-frame `new`), inlined cinematic-blend arithmetic (no per-frame Vector3 allocations); smooth-scroll race `isProgrammaticScroll` guard uses `scrollend` when available + 2.5s fallback (was 1s) — fixed rare track-switch flake under heavier scenes; annotation safety net's `_pausedFor` accumulator resets on `start()`.
