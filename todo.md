# operator-media — soundtrack page polish

End-to-end fixes, one at a time. Verify each before moving on.

## Active

- [ ] **#1 BUG Anvil track freezes the player** — sequence → face works, but the actual audio never starts and controls never come back. Track-3 specific.
- [ ] **#2 Music-synced camera** — beat-driven dolly + slow orbit + occasional cinematic moments. Code already in `operator-face-beat.js`; needs wiring to `index.html`.
- [ ] **#3 Crisp wireframe** — replace 1-px-wireframe with `LineSegments2` (screen-space AA lines). Already in beat file.
- [ ] **#4 Matrix rain background** — falling green glyphs behind the face, beat-reactive intensity. Fits CRT vibe.
- [ ] **#5 QA / perf pass** — old code review: per-frame allocations, resize debounce, IntersectionObserver pause when off-screen, dead code.

## Done

(none yet)
