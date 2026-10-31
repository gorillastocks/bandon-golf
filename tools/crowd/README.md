# Crowd bake pipeline

Builds `assets/crowd/crowd.bin.gz` + `crowd.json` (the runtime loads them lazily with `DecompressionStream`; see `js/crowdmodels.js`).

1. Download the 7 GLBs listed in `chars.json` (`src` = poly.pizza page, CC0) plus their animation GLBs into `tools/crowd/src/` (git-ignored, ~32 MB).
2. `python3 tools/crowd/bake.py` (numpy only; Python 3).

What it does: reads the 62-joint rig, keeps 21 bones, builds 3 LODs per character by vertex clustering (~6.5k / ~1.7k / ~420 tris), tags every
vertex with a role (skin / shirt / pants / hair / hat parts) so the shader can tint it per spectator, and bakes 14 clips at 24 fps into a half-float
matrix texture (3x4 skin matrix per bone per frame). `poses.py` is a small IK poser used for the procedural clips (clap, cheer, groan, alert, duck,
seated variants); `glbio.py` is a minimal GLB reader.
