Data pipeline (run from a scratch dir; paths are as used when the data was generated):

1. `fetch.py` – downloads golf features around the resort from the OSM public REST API (the Overpass API was unreachable from the build box).
2. `extract.py` – builds polygons/ways, assigns each `golf=hole` line to a course.
3. `dem.py` – samples USGS NED 10 m elevation (OpenTopoData `ned10m`) on a 25 m grid.
4. `gen.py` – orients routes tee→green, picks tee / green polygons, matches scorecard yardage, selects nearby features per hole.
5. `pack.py` – writes `js/realdata.js` (OSM © OpenStreetMap contributors, ODbL).
`cmp.py` compares OSM par / yardage tags to the scorecard in `js/data.js`.
