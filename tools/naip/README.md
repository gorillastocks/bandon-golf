# NAIP aerial imagery pipeline

Real aerial photos draped on the terrain (macro colour for rough/dunes/gorse/beach, light hue/pattern on mown turf).

Source: **USDA Farm Service Agency NAIP** (National Agriculture Imagery Program), 0.3-0.6 m, acquired 2022-06-23 for the Bandon area,
served by the USGS National Map `USGSNAIPImagery` ImageServer. NAIP is US-government work: **public domain**.

```
node tools/naip/dump.js          # BG.Real -> tools/naip/holes.json (hole paths, polygons, projection frame)
python3 tools/naip/fetch.py      # exportImage per hole -> tools/naip/raw/<course>_<hole>.jpg   (not committed)
python3 tools/naip/bake.py       # WebP crops (full <=1024 px and half <=512 px) + assets/aerial/index.json
python3 tools/naip/overlay.py bandon:1 pacific:11   # draw OSM green/tee/fairway/bunker outlines over a crop to check alignment
```

Georeferencing: the game's local frame is a linear equirectangular projection (E=(lon-lon0)*mlon, N=(lat-lat0)*mlat, tee at origin, x east, z south),
so each crop is requested in EPSG:4326 with bbox = hole path bounding box +-170 m and maps to the shader with a plain affine
(`uAerRect = x0, z0, 1/(x1-x0), 1/(z1-z0)`). Row 0 of the image is the north edge (`flipY=false`).
`assets/aerial/index.json` holds each crop's bounds in the hole frame and its mean linear colour (used to normalise the mown-turf pattern).
