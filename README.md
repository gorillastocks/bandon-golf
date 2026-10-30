# Bandon Dunes Golf

A first-person, slingshot-style golf game set on the seven courses at Bandon Dunes (Bandon Dunes, Pacific Dunes, Bandon Trails, Old Macdonald, Sheep Ranch, Bandon Preserve, Shorty's). Pure static HTML/JS + three.js, no build step.

**Play:** https://gorillastocks.github.io/bandon-golf/

## Controls
- **Swing:** press/touch and pull back (away from the target) like a slingshot; pull length = power, pull angle = aim. Release to hit.
- **Aim:** ◀ ▶ buttons or A/D / arrow keys; P or the crosshair button aims at the pin.
- **Club:** ‹ › or W/S; mouse wheel. A club is auto-suggested from distance, elevation, wind and lie.
- **Other:** V overview map, T scorecard, M mute, Esc pause, Space fast-forward the ball.

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
- **Fallbacks (procedural, recorded per hole in `hole.real.fallbacks`)** – gorse and tree placement inside mapped woods, fine green contours (the DEM is too coarse), fairway where OSM has no polygon along the centre-line, tee plates / green ellipses when a polygon is missing, forests on Bandon Trails (no wood polygons there).
- Shorty's: OSM maps 19 par-3 lines but the course has 9 holes, so each of the 9 holes is matched to the mapped line with the closest scorecard yardage.

`tools/` has the scripts that fetched and packed the data into `js/realdata.js` (see `tools/README.md`). The old fully procedural builder is still available with `BG.Course.build(course, idx, diff, {procedural:true})`.

Pacific Dunes #11 — before (procedural) and after (real OSM layout + USGS terrain):

![before](docs/real-proc-pacific11-flyover.jpg)
![after](docs/real-pacific11-flyover.jpg)

![Old Macdonald 6](docs/real-oldmac6-aim.jpg)
![Sheep Ranch 4](docs/real-sheep4-flyover.jpg)
