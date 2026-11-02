# Tools

- `build-www.js` – copies the static web bundle into `www/` (used by the Capacitor iOS build).
- `build_assets.py` – builds the compressed runtime textures and HDRIs in `assets/` from CC0 sources (see `THIRD_PARTY_NOTICES.md`).
- `crowd/` – crowd character baking helpers.
- `make_icons.py`, `make_achievements.py` – app icon and Game Center achievement art.
- `photoreal_shots.js` – before/after flyover, first-person and crowd close-up screenshots for 3 holes on 3 courses (env `LABEL`, `GFX`, `PORT`, `OUT`).
- `photoreal_perf.js` – headless draw-call / triangle / FPS / heap probe per graphics level (SwiftShader, so FPS is only relative).
- `verify_shaping.js` – headless check of draw/fade shot shaping (direction and curve in yards per club); `shaping_shots.js` – in-game measurement plus selector/preview screenshots (env `OUT`, `PORT`).
- `store_screenshots.js` – App Store screenshots with headless Chromium (Playwright).

All 112 holes are original designs defined in `js/layouts.js` and generated procedurally by `js/course.js`
on a synthetic (noise + dune) height map. The game uses no map, survey, aerial-imagery or elevation data.
