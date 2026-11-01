# Tools

- `build-www.js` – copies the static web bundle into `www/` (used by the Capacitor iOS build).
- `build_assets.py` – builds the compressed runtime textures and HDRIs in `assets/` from CC0 sources (see `THIRD_PARTY_NOTICES.md`).
- `crowd/` – crowd character baking helpers.
- `make_icons.py`, `make_achievements.py` – app icon and Game Center achievement art.
- `store_screenshots.js` – App Store screenshots with headless Chromium (Playwright).

All 112 holes are original designs defined in `js/layouts.js` and generated procedurally by `js/course.js`
on a synthetic (noise + dune) height map. The game uses no map, survey, aerial-imagery or elevation data.
