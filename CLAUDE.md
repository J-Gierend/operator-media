*Standard: jg-v1 | type: library*
*Inherits global rules from ~/.claude/CLAUDE.md. Project knowledge: brain_query("operator-media ...")*

# operator-media

Media/assets repo for OPERATOR — currently the soundtrack page: a static interactive music player (Three.js wireframe face, beat-synced camera, matrix rain) deployed to GitHub Pages.

## Commands
- Serve locally: `cd music && python3 -m http.server 8888` (tests expect port 8888)
- Test: `cd music && npx playwright test`
- Deploy: push to `master` — Pages workflow publishes `music/` automatically

## Map
- `music/` — the soundtrack page: `index.html` (player UI + effects), `operator-face-beat.js` (3D face + camera), `audio/*.m4a` (committed tracks), `tests/` (Playwright specs)
- `.github/workflows/pages.yml` — GitHub Pages deploy of `music/` on push to master
- `docs/architecture.md` — how the soundtrack page is structured
- `todo.md` — task list

## Rules
- Static page, no build step — keep it that way; everything in `music/` ships as-is to Pages.
- `audio/*.m4a` are committed assets — do not transcode, rename, or delete without explicit instruction.
- Live URL: https://j-gierend.github.io/operator-media/
