# Abandoned Dunes

A first-person, slingshot-style golf game across seven stylized, parody-named links courses on a wind-whipped coast. Pure static HTML/JS + three.js (vendored, no CDN), no build step for the web version. Also wrapped for the **Apple App Store** with Capacitor (iOS) — see [`docs/APP_STORE.md`](docs/APP_STORE.md).

**Play:** https://gorillastocks.github.io/bandon-golf/ &nbsp;·&nbsp; [Privacy policy](docs/privacy.html) &nbsp;·&nbsp; [Support](docs/support.html)

> Course names are parodies and layouts are stylized. This project is not affiliated with or endorsed by any real golf course or resort.

| Course (id) | Parody name |
|---|---|
| `bandon` | **Bandit Dunes** |
| `pacific` | **Terrific Dunes** |
| `trails` | **Abandon Trails** |
| `oldmac` | **Old MacDonald Had a Links** |
| `sheep` | **Sheep Wreck** |
| `preserve` | **Preserve Us!** (13 par 3s) |
| `shortys` | **Short Circuit** (9 par 3s) |

(The internal course ids are kept for file paths, saves and assets; only the display names changed.)

## iOS app (Capacitor)
`npm install && npm run ios:sync && npm run ios:open` on a Mac. Bundle id `com.gorillastocks.abandoneddunes`. Game Center leaderboards/achievements exist **only** in the iOS build (`js/gamecenter.js` + local plugin `plugins/capacitor-game-center`); the web version shows no Game Center UI.

## Controls
- **Swing:** press/touch and pull back (away from the target) like a slingshot; pull length = power, pull angle = aim. Release to hit.
- **Aim:** ◀ ▶ buttons or A/D / arrow keys; P or the crosshair button aims at the pin.
- **Club:** ‹ › or W/S; mouse wheel. A club is auto-suggested from distance, elevation, wind and lie.
- **Other:** V overview map, T scorecard, M mute, Esc pause, Space fast-forward the ball.

- **Auto 2-putt:** once the ball is at rest on the green, an **Auto 2-putt** button appears. It adds 2 putts (1 if the ball is within ~3 ft — a tap-in), logs them as *auto* on the scorecard (marked with a small gold **a**), plays the crowd reaction for the resulting score and moves on to the hole summary. The pause menu has an **Auto 2-putt every green** toggle (remembered in `localStorage`) that does it automatically after each approach shot onto the green.

## Difficulty
- **Simple** – light wind, aim assist, forgiving lies, full trajectory preview, gimme putts.
- **Normal** – moderate wind with gusts, less assist, line preview.
- **Realistic** – strong gusty wind, mishits driven by how clean your pull is, no preview, full lie penalties.

Physics: drag, Magnus lift/spin, wind profile + gusts, bounce/roll by lie, green slope, cup lip-outs. Distances in yards, score vs par, scorecard and round stats are tracked.

## Real course data
Every hole on all seven courses is built from real geometry:

- **Layout** – the hole centre-line (tee → green), green, tee, bunker, fairway, rough, water-hazard and woods polygons come from [OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap contributors, ODbL), converted to local metres with the tee at the origin and true compass orientation.
- **Terrain** – USGS NED 10 m elevation (via [OpenTopoData](https://www.opentopodata.org/), sampled on a 25 m grid, bicubic) gives the real ridges, dunes, bluffs and the Pacific shoreline; the ocean appears wherever the elevation is at sea level.
- **Scorecard** – pars and Black-tee yardages are the published numbers. Where the mapped tee polygon distance disagreed, the tee is placed at the mapped back tee (or the nearest consistent tee) so the playing length matches the scorecard.
- **Fallbacks (procedural, recorded per hole in `hole.real.fallbacks`)** – gorse and tree placement inside mapped woods, fine green contours (the DEM is too coarse), fairway where OSM has no polygon along the centre-line, tee plates / green ellipses when a polygon is missing, forests on Abandon Trails (no wood polygons there).
- Short Circuit: OSM maps 19 par-3 lines but the course has 9 holes, so each of the 9 holes is matched to the mapped line with the closest scorecard yardage.

`tools/` has the scripts that fetched and packed the data into `js/realdata.js` (see `tools/README.md`). The old fully procedural builder is still available with `BG.Course.build(course, idx, diff, {procedural:true})`.

Terrific Dunes #11 — before (procedural) and after (real OSM layout + USGS terrain):

![before](docs/real-proc-pacific11-flyover.jpg)
![after](docs/real-pacific11-flyover.jpg)

![Old MacDonald Had a Links 6](docs/real-oldmac6-aim.jpg)
![Sheep Wreck 4](docs/real-sheep4-flyover.jpg)

## Graphics (Low / Medium / High)
Pause menu or main menu → **Graphics** cycles *Auto → Low → Medium → High* (remembered in `localStorage` key `bg.gfx`; `?gfx=low|medium|high` overrides for one load). **Auto** picks a level per device: iPhone / small phones and software GL → Low, iPad / Android tablets and unknown GPUs → Medium, desktop with a discrete/Apple GPU → High. Changing the level re-loads textures live, no page reload.

| | Low | Medium | High |
|---|---|---|---|
| Terrain textures | 512 px albedo, no detail normals | 512 px + detail normals/roughness | 1024 px + detail normals |
| Lighting | hemisphere + sun | + sky image-based lighting, sun shadows (1024 map) | + 2048 shadow map, terrain & gorse cast shadows |
| Ocean | 2 normal layers, Fresnel sky reflection, simple shoreline foam | + 3rd layer, animated surf foam, whitecaps | same as Medium |
| Vegetation | simple trees & gorse | 2-tier spruce/pine, gorse with flowers, 5k grass tufts | 3-tier trees, 12 flowers/bush, 16k grass tufts |
| Pixel ratio cap | 1.5 | 2 | 2 |

Visual stack (`js/gfx.js`): CC0 PBR textures blended on the real surface map (fairway, green with mowing stripes, rough, deep rough, sand, gorse floor, rock on steep slopes, wet sand near the water) via a texture-array terrain shader; pre-tonemapped HDRI sky dome (clear / mist / overcast per hole) plus a tiny RGBE copy for PMREM lighting; ACES tone mapping and coastal haze; animated ocean with foam at the shoreline; instanced vertex-coloured spruce / shore pine, gorse and wind-swayed dune-grass tufts. Textures ship as WebP (~6 MB total for all levels; Low only downloads the 512 px set). KTX2 was not used because the bundled three.js r149 build has no KTX2 loader.

Assets are generated from the CC0 sources by `tools/build_assets.py` (needs Pillow/numpy and the downloaded sources); the generated files are committed in `assets/`.

Download size: Low/Medium ≈ 1.1 MB of textures (512 px WebP) + ~10–50 KB per sky; High ≈ 4.8 MB (1024 px). Measured in headless Chromium/SwiftShader (software GL, so only the *relative* cost is meaningful): draw calls 10 / 12 / 12 and ~131k / ~212k / ~361k triangles per frame on Low / Medium / High for a Bandit Dunes #16 view; relative frame cost ≈ 1.0× / 1.1× / 1.3× (Low = fewest shader features). Not measured on a real iPhone.

Aerial / grass / shadow / fog before → after (High, Terrific Dunes 11 and Bandit Dunes 16; before = commit fd7ace6): `docs/visual-pacific11-tee-before-after.jpg`, `docs/visual-pacific11-flyover-before-after.jpg`, `docs/visual-bandit16-tee-before-after.jpg`, `docs/visual-bandit16-flyover-before-after.jpg`.

Before / after: `docs/desktop-tee-before.jpg` → `docs/desktop-tee-after.jpg`, `docs/landscape-tee2-before.jpg` → `docs/landscape-tee2-after.jpg`.

### Real aerial imagery (USDA NAIP)
Every real hole has a baked crop of **USDA NAIP** aerial photography (0.3–0.6 m source, acquired 2022-06-23; public domain, via the USGS National Map ImageServer) draped on its terrain in the same local frame as the OSM course geometry (`assets/aerial/<course>/<hole>.webp`, see `tools/naip/`). The terrain shader uses it as macro albedo for rough / dunes / gorse / beach (≈40 % near the camera so the PBR detail still shows, ≈90 % at distance) and only borrows hue and a soft light/dark pattern for mown turf, so fairway and green stripes stay crisp. It is lazy-loaded per hole (next hole is prefetched): **~100–150 KB per hole** at Medium/High (≤1024 px, ~0.6–0.8 m/px), **~30 KB** on Low (≤512 px); 112 holes = 13.7 MB / 3.2 MB in the repo, but a player only downloads the holes they play. `?aer=0` disables it for A/B comparison. Alignment check: `docs/aerial-alignment-overlay.jpg` (OSM greens=yellow, fairways=cyan, bunkers=magenta, routing=red drawn on the crops of Bandon 16, Trails 4, Old Macdonald 6, Sheep Ranch 4).

### Asset credits (all CC0 / public domain)
- **Aerial imagery**: USDA Farm Service Agency NAIP via USGS The National Map (public domain) — see `assets/aerial/CREDITS.md`.
- **ambientCG** (https://ambientcg.com): Grass006 (fairway), Grass008 (green), Grass004 (rough), Rock030 (rock/cliff).
- **Poly Haven** (https://polyhaven.com): `withered_grass` (deep rough), `sand_01` (bunkers/beach), `brown_mud_leaves_01` (gorse floor).
- **Poly Haven HDRIs** by Greg Zaal (sky edits by Jarod Guest): *Kloofendal 48d Partly Cloudy (Pure Sky)*, *Kloofendal Overcast (Pure Sky)*, *Kloofendal Misty Morning (Pure Sky)*.

## Crowd reactions
All crowd audio is synthesized live with WebAudio (no samples, no third-party assets), randomised every time so it never repeats. **M** mutes it with the rest of the sound.

| Trigger | Reaction |
|---|---|
| Par; great drive (≥ ~250 yd for the Driver, scaled by difficulty, finishing in the fairway); good approach; long carry over gorse | polite golf claps |
| Birdie; approach to ≤ 8 ft from ≥ 100 yd (or ≤ 15 ft from ≥ 160 yd); carry of 50+ yd over ocean/water; holed long putt (≥ 22/30/40 ft by difficulty); holing from a bunker; chip-in/hole-out from off the green | huge cheer |
| Eagle; birdie combined with a hard shot (chip-in, long putt, from sand) | roar with whistles |
| Hole-in-one, albatross | full stadium roar |

A small callout appears under the HUD naming the moment. Audio unlocks on the first tap/click/key (iOS Safari safe).

## Tournament crowd (optional)

Pause menu / main menu → **Tournament crowd: OFF/ON** (ON by default on first run, remembered in `localStorage bg.crowd`; Graphics defaults to High (`bg.gfx`), Commentary ON (`bg.commentary`), Auto 2-putt OFF (`bg.auto2`) - saved choices always win).
Spectators stand behind gallery ropes along both fairway edges and around tees and greens; the 18th green gets a grandstand.
They are real rigged, skinned human models (7 CC0 Quaternius characters: 4 men, 3 women) drawn with GPU-skinned instancing, so the whole crowd is ~7 characters x 3 LODs = a few dozen draw calls. Looks vary by tint (shirt, trousers, skin, hair colour), caps and visors, height and build. Credits: `assets/crowd/CREDITS.md`; pipeline: `tools/crowd/README.md`. Animations: idle, alert, clap, cheer (arms up), disappointed groan (the "aww" after a bad shot, hands to head), duck, run (flee), walk (return) and a hit reaction, plus seated variants for the grandstand. Close spectators use the full model, mid-distance a ~1.7k-tri LOD and far ones a ~420-tri LOD (no billboards). The pack (~1.35 MB gzipped) is only downloaded when the crowd is turned on. If it fails to load (or `DecompressionStream` is missing) the old box figures are used; `?crowdmodel=0` forces them.
Density and detail follow the Graphics level (Low sparse, all LOD1/LOD2; Medium up to 20 full-detail models near the camera; High 40 plus shadows).

- They turn to watch the ball and clap or cheer in sync with the existing crowd-reaction tiers.
- Before each full shot the game forward-simulates it with the real physics. Spectators near the predicted flight or landing spot look up, shout "Fore!" / "Look out!" / gasp, duck, and some scramble away; then they return to their spot.
- Spectators are solid: a ball can hit one (thud + "ouch") and is deflected. A ball that ends in the gallery or behind a rope gets a TV-style **free drop** at the nearest open spot, no penalty.
Screenshots: `docs/crowd-before-after.jpg`, `docs/crowd-grandstand-before-after.jpg`, `docs/crowd-animations.jpg`, `docs/crowd-grandstand-groan.jpg`, `docs/crowd-after-low-gfx.jpg` (older box-figure shots: `docs/crowd-landscape-*.jpg`).

Perf with the realistic models (headless software GL, relative only): versus the old box figures the models add about +15k / +57k / +18k triangles from the tee and, in the worst case (standing 8 m from a dense cluster), +15k / +115k / +390k on Low / Medium / High (before trimming High's full-detail cap from 48 to 40); frame cost measured about equal to the old boxes on Low/Medium and ~+14% on High up close. No umbrellas (the game has no rain). Older numbers for the box figures: the crowd adds ~9 draw calls and about +35k / +90k / +180k triangles on Low / Medium / High (≈130 / 380 / 880 people on the 18th, which has the grandstand). Frame time is dominated by the terrain/ocean shaders; leave it off on older phones.

- Voices are synthesised live with WebAudio (formant synth, no samples, so no extra assets or credits). They respect the in-game mute and are rate-limited. They are stylised, not natural speech.

## Host commentary
A TV-broadcast-style host talks you through each hole as the fly-over starts: par and yardage, prevailing wind, the hazards, ocean and cliffs, gorse, bunkers, and where to miss. Scripts are written from the in-game par/yardage plus generic hole descriptions. Clips that speak a real resort name are disabled via `"disabled": true` in `manifest.json` (files kept; see docs/APP_STORE.md).

- **Voice:** [ElevenLabs](https://elevenlabs.io) premade voice "George" (`eleven_v4`), one voice for every hole. The audio is **AI-generated** speech; it does not imitate any real person.
- **Files:** `audio/commentary/<course>/<NN>.mp3` (mono, 48 kbps, 12–23 s each, ~11 MB total) plus `audio/commentary/manifest.json` (script text and durations). Clips load lazily, and the next hole's clip is prefetched.
- **Controls:** a **Skip** button appears while the host is talking; the 🎙 button (or **C**) turns commentary on/off (remembered in `localStorage`); **M** mutes everything including the host. Commentary also stops on your first shot, on pause, and when the hole ends.
- **Holes without a clip** (the voice-generation credit quota ran out before every hole was rendered) just stay silent: see `manifest.json` for what's present.
- Audio is decoded and played through the same WebAudio graph as the other sounds and unlocks on the first tap/click/key (iOS Safari safe).
