# Third-party notices

The game code, course designs and generated assets in this repository are proprietary (see `LICENSE`).
The components below are third-party and keep their own licences.

## Software

| Component | Use | Licence |
|---|---|---|
| [three.js](https://threejs.org) r149 (`vendor/three.min.js`) | 3D rendering. Copyright 2010-2023 three.js Authors | MIT |
| [Capacitor](https://capacitorjs.com) (`@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`) | native iOS shell. Copyright (c) 2017-present Drifty Co. | MIT |
| Capacitor plugins `@capacitor/haptics`, `@capacitor/splash-screen`, `@capacitor/status-bar` | haptics, splash screen, status bar. Copyright Ionic | MIT |

The full MIT licence text is available at https://opensource.org/license/mit and in each package's `LICENSE` file
(`node_modules/<package>/LICENSE` after `npm install`; `vendor/three.min.js` carries the SPDX header).

## CC0 / public-domain assets (no attribution required, credited anyway)

- **ambientCG** (https://ambientcg.com), CC0 1.0: Grass006 (fairway), Grass008 (green), Grass004 (rough), Rock030 (rock/cliff). Shipped as resized WebP textures in `assets/tex/`.
- **Poly Haven** (https://polyhaven.com), CC0 1.0: `withered_grass`, `sand_01`, `brown_mud_leaves_01` textures (`assets/tex/`), and the HDRIs *Kloofendal 48d Partly Cloudy (Pure Sky)*, *Kloofendal Overcast (Pure Sky)*, *Kloofendal Misty Morning (Pure Sky)* by Greg Zaal (sky edits by Jarod Guest), shipped in `assets/sky/`.
- **Quaternius** Ultimate Modular Men / Women packs (via poly.pizza), CC0 1.0: spectator character models, baked into `assets/crowd/`. See `assets/crowd/CREDITS.md`.
- **Freesound** crowd reaction clips (Breviceps, Department64, hz37, Zeraora, kyles, FoolBoyMedia, jonsept, Bansemer, qubodup, phmiller42, CHallSmith, mrrap4food and one deleted user), all CC0 1.0: `assets/audio/crowd/`. See `assets/audio/crowd/CREDITS.md`.
- **BigSoundBank** "Small waves and beach #2" by Joseph Sardin, CC0: `assets/audio/ambient/waves.mp3`. See `assets/audio/ambient/CREDITS.md`.

## Procedural assets (no third-party source)

The photorealism pass (Ultra level, cavity AO, tile breaking, tree bark/needle noise, gorse clumps, ball dimples, flag cloth, tee, cup and tee markers, ocean glitter, post-processing) uses only code and procedurally generated textures written for this project. No new third-party assets were added; the spectators remain the Quaternius CC0 characters listed above (no CC0 photoreal rigged human set with licence-clean clothing exists, and Mixamo assets are not CC0, so they were not used). Spectator clothing colours are muted procedural palettes with no logos.

## Generated content

The host commentary clips in `audio/commentary/` are AI-generated speech from [ElevenLabs](https://elevenlabs.io) (premade voice "George", model `eleven_v4`), generated under a paid ElevenLabs subscription. They do not imitate any real person.

## Not used

No map, survey, aerial-imagery or elevation data (OpenStreetMap, USGS, USDA NAIP) is included in or used by this project.
