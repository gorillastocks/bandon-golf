# Abandoned Dunes — App Store submission guide

Everything that can be prepared without a Mac is done. This file lists **what is already in the repo** and the **exact remaining steps** you must do on a Mac with Xcode.

- Bundle ID: `com.gorillastocks.abandoneddunes` &nbsp;·&nbsp; App name: **Abandoned Dunes** &nbsp;·&nbsp; Version `1.0` (build `1`)
- Web version (still live): https://gorillastocks.github.io/bandon-golf/
- Privacy policy URL: https://gorillastocks.github.io/bandon-golf/docs/privacy.html
- Support URL: https://gorillastocks.github.io/bandon-golf/docs/support.html
- Capacitor 8 (Swift Package Manager, no CocoaPods), iOS deployment target 15.0, iPhone + iPad, portrait and landscape.

> **Strongly recommended before submitting — rename the GitHub repo** (e.g. `abandoned-dunes`). The Pages URL currently contains the old name (`/bandon-golf/`), and reviewers and users see the Privacy/Support URLs. Renaming the repo changes the Pages URL to `https://gorillastocks.github.io/abandoned-dunes/` (GitHub Pages URLs do not redirect). Do it in GitHub → Settings → Repository name, wait for Pages to rebuild, then update the URLs in this file, `README.md` and `docs/privacy.html` / `docs/support.html` (GitHub issue links), and use the new URLs in App Store Connect.

---

## 1. What is in the repo

| Path | What |
|---|---|
| `capacitor.config.json` | appId `com.gorillastocks.abandoneddunes`, appName `Abandoned Dunes`, `webDir: www`, dark `#0b2630` background, no scrolling/link previews, SplashScreen + StatusBar config |
| `tools/build-www.js` | assembles the self-contained web bundle into `www/` (index.html, css, js, vendor/three.min.js, assets, audio, icons, manifest, privacy/support pages). **No remote URLs anywhere — everything is vendored/offline** |
| `ios/App/` | the Xcode project (`App.xcodeproj`), `Info.plist`, `App.entitlements` (Game Center), icons and splash, Swift Package manifest `CapApp-SPM` |
| `plugins/capacitor-game-center/` | small local Swift plugin (GameKit): sign-in, leaderboards, achievements — **iOS only** |
| `resources/icon-1024.png` | 1024×1024 RGB app icon, **no alpha channel** (also copied to `ios/App/App/Assets.xcassets/AppIcon.appiconset/`) |
| `resources/splash-2732.png` | splash (copied into `Splash.imageset`; content kept inside the central square so it never crops) |
| `icons/` + `manifest.webmanifest` | PWA icons (192/512/1024/apple-touch) and updated PWA manifest |
| `docs/privacy.html`, `docs/support.html` | privacy policy ("no data collected, localStorage only") and support page, published by GitHub Pages |
| `docs/gamecenter/` | 4 achievement images (1024×1024) for App Store Connect |
| `store/screenshots/` | App Store screenshots (see section 6) |
| `js/native.js` | zoom/selection/context-menu lockdown + Capacitor Haptics hooks (strike, cup, splash, UI taps) |
| `js/gamecenter.js` | Game Center bridge, active only when `Capacitor.isNativePlatform()` is true on iOS |

Plugins in the app: `@capacitor/haptics`, `@capacitor/splash-screen`, `@capacitor/status-bar`, local `capacitor-game-center`.

Regenerate artwork: `python3 tools/make_icons.py` (icon + splash), `python3 tools/make_achievements.py`.

### Guideline 4.2 ("Minimum Functionality" / web-wrapper) risk and mitigation
Apple rejects apps that are just a repackaged website. This is a real 3D game with its own rendering/physics engine, but it is still a WKWebView app, so some risk remains. Mitigations done:

- **Fully offline**: all three.js code, textures, terrain data, audio and crowd models ship in the app bundle; nothing is fetched from the network.
- **Native feel**: status bar hidden, no rubber-band bounce / scrolling (`scrollEnabled:false`, `overscroll-behavior:none`, fixed body), no pinch/double-tap zoom, no text selection or long-press callouts, no tap highlight, safe-area insets on HUD and menus, native splash screen, proper app icon.
- **Native haptics** via Capacitor Haptics on ball strike (light/medium/heavy by power), cup drop, water/OB splash, tree hit and menu taps.
- **Native Game Center** integration (sign-in, 21 leaderboards, 4 achievements) via a Swift/GameKit plugin: functionality that does not exist on the web.
- Both orientations supported; iPad supported.
- Unique, substantial content: seven courses, three difficulty levels, wind/physics, save & continue, crowd, commentary.

If Apple still pushes back (4.2), reply in Resolution Center describing the custom 3D engine, offline play, Game Center, haptics and the amount of content; consider adding more native touches later (e.g. local notifications are *not* recommended — keep it simple).

### Trademark / content notes
- Display name is **Abandoned Dunes**; all seven courses are parody-named. No resort name appears in the UI, metadata, listing copy or manifest.
- Internal course ids (`bandon`, `pacific`, `trails`, `oldmac`, `sheep`, `preserve`, `shortys`) still exist in code, audio folder names and the Pages repo name — not user-visible in the app.
- **Host commentary audio**: three clips that say "Bandon" are **disabled** (`"disabled": true` in `audio/commentary/manifest.json`; files kept, never played, not bundled in the iOS app): `bandon_01`, `bandon_12`, `trails_01`. Clips that still **speak real course names** (not "Bandon") and that you may want to disable or re-record too: `pacific_01` ("Welcome to Pacific Dunes"), `sheep_01` ("Welcome to The Sheep Ranch"), `oldmac_01` ("Welcome to Old Macdonald"). To disable, add `"disabled": true` to that clip in the manifest (`oldmac_01` etc.). Other clips mention generic terms (e.g. "Punchbowl" template hole, "the Pacific") only.
- Disclosures are in the app menu and the listing ("Course names are parodies… not affiliated with or endorsed by any real golf course or resort").
- The app uses OpenStreetMap-derived data (ODbL, credit shown in-app) and USGS/USDA public-domain data. Keep the credit line.

---

## 2. Game Center — IDs to create in App Store Connect

Game Center is wired up in code and works **only in the iOS app** (no Game Center UI exists in the web version). The app authenticates the player silently on launch (Apple shows its sign-in sheet only if the player is signed out; declining just disables Game Center). A **Leaderboards** button appears on the main menu (iOS only) and a **Leaderboard** button on the end-of-round screen. Scores are submitted only after finishing **every hole** of a course (a 9-hole or front-nine round is not submitted).

**Create these exactly (IDs are case-sensitive and cannot be changed later).**

### Leaderboards (21) — Classic leaderboards
For every row: **Score Format = Integer**, **Score Submission Type = Best Score**, **Sort Order = Low to High** (lower strokes are better), Score Range optional (min `1`, max `500`), add a **Localization**: language English (U.S.), Name = the text in the "Display name" column, Score Format Suffix = `strokes` (singular `stroke`).

| Leaderboard ID | Display name | Holes |
|---|---|---|
| `abandoneddunes.lb.bandit.simple` | Bandit Dunes — Simple | 18 |
| `abandoneddunes.lb.bandit.normal` | Bandit Dunes — Normal | 18 |
| `abandoneddunes.lb.bandit.realistic` | Bandit Dunes — Realistic | 18 |
| `abandoneddunes.lb.terrific.simple` | Terrific Dunes — Simple | 18 |
| `abandoneddunes.lb.terrific.normal` | Terrific Dunes — Normal | 18 |
| `abandoneddunes.lb.terrific.realistic` | Terrific Dunes — Realistic | 18 |
| `abandoneddunes.lb.abandon.simple` | Abandon Trails — Simple | 18 |
| `abandoneddunes.lb.abandon.normal` | Abandon Trails — Normal | 18 |
| `abandoneddunes.lb.abandon.realistic` | Abandon Trails — Realistic | 18 |
| `abandoneddunes.lb.oldmac.simple` | Old MacDonald Had a Links — Simple | 18 |
| `abandoneddunes.lb.oldmac.normal` | Old MacDonald Had a Links — Normal | 18 |
| `abandoneddunes.lb.oldmac.realistic` | Old MacDonald Had a Links — Realistic | 18 |
| `abandoneddunes.lb.sheepwreck.simple` | Sheep Wreck — Simple | 18 |
| `abandoneddunes.lb.sheepwreck.normal` | Sheep Wreck — Normal | 18 |
| `abandoneddunes.lb.sheepwreck.realistic` | Sheep Wreck — Realistic | 18 |
| `abandoneddunes.lb.preserveus.simple` | Preserve Us! — Simple | 13 |
| `abandoneddunes.lb.preserveus.normal` | Preserve Us! — Normal | 13 |
| `abandoneddunes.lb.preserveus.realistic` | Preserve Us! — Realistic | 13 |
| `abandoneddunes.lb.shortcircuit.simple` | Short Circuit — Simple | 9 |
| `abandoneddunes.lb.shortcircuit.normal` | Short Circuit — Normal | 9 |
| `abandoneddunes.lb.shortcircuit.realistic` | Short Circuit — Realistic | 9 |

### Achievements (4)
For every row: **Hidden = No**, **Achievable More Than Once = No**, Points as listed (total 110 ≤ 1000). Each needs a localization with Title, Pre-earned Description, Earned Description and a 512–2048 px image (upload the PNG listed).

| Achievement ID | Title | Points | Pre-earned description | Earned description | Image |
|---|---|---|---|---|---|
| `abandoneddunes.ach.firstbirdie` | First Birdie | 10 | Make a birdie (1 under par) on any hole. | You made your first birdie! | `docs/gamecenter/achievement-firstbirdie.png` |
| `abandoneddunes.ach.eagle` | Eagle Eye | 25 | Make an eagle (2 under par) on any hole. | You made an eagle! | `docs/gamecenter/achievement-eagle.png` |
| `abandoneddunes.ach.holeinone` | Hole in One | 50 | Hole out in a single stroke. | Ace! You made a hole in one! | `docs/gamecenter/achievement-holeinone.png` |
| `abandoneddunes.ach.breakpar` | Par Breaker | 25 | Finish a complete course under par. | You finished a full course under par! | `docs/gamecenter/achievement-breakpar.png` |

### Exact steps
1. **Xcode:** open `ios/App/App.xcodeproj` → target **App** → **Signing & Capabilities** → confirm **Game Center** is listed (it is pre-configured through `App/App.entitlements`; if missing: **+ Capability → Game Center**). Sign in with your Apple Developer team and select it as Team (Automatic signing).
2. **App Store Connect** → **My Apps** → **+ New App** (see section 5) — the bundle ID must exist first (Xcode creates it when you pick the team; or Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App → Bundle ID `com.gorillastocks.abandoneddunes` with the **Game Center** capability ticked).
3. In the app → **Services** (sidebar) → **Game Center** → enable. (On newer App Store Connect versions: **Distribution → Game Center → Enable**.)
4. **Leaderboards → (+) → Classic Leaderboard**, create the 21 rows above (Reference Name can equal the display name; ID exactly as listed; settings as described).
5. **Achievements → (+)**, create the 4 rows above, with localization + image.
6. On the app version page (**Distribution → iOS App → 1.0 Prepare for Submission**) find the **Game Center** section and add the leaderboards and achievements to this version (they ship in review together with the first build).
7. Test on a real iPhone (Game Center does not work in the simulator reliably): sign in with a **Sandbox** Game Center account (Settings → Game Center, sandbox tester added under App Store Connect → Users and Access → Sandbox), run a build from Xcode, finish an 18-hole round. Leaderboards created for an unreleased app appear for TestFlight/Xcode builds.

---

## 3. Remaining steps on your Mac (exact)

Requirements: a Mac with the current **Xcode** (App Store uploads require the Xcode version Apple currently mandates — check App Store Connect → Apps → "Upcoming requirements"), Node.js ≥ 20, and an **Apple Developer Program** membership (**US$99/year**, enroll at https://developer.apple.com/programs/enroll/ — approval can take up to 48 h).

```bash
git clone https://github.com/gorillastocks/bandon-golf.git abandoned-dunes   # or your renamed repo
cd abandoned-dunes
npm install                # installs Capacitor, plugins, and links plugins/capacitor-game-center
npm run ios:sync           # builds ./www and runs `cap sync ios`
npm run ios:open           # opens ios/App/App.xcodeproj in Xcode
```

In **Xcode** (first-time pass, SPM dependencies resolve automatically; wait for "Resolving Packages"):

1. Select project **App** → target **App** → **Signing & Capabilities**: tick *Automatically manage signing*, choose your **Team**. Bundle Identifier stays `com.gorillastocks.abandoneddunes`. Confirm the **Game Center** capability is present.
2. **General** tab: Display Name `Abandoned Dunes`, Version `1.0`, Build `1`. Deployment target iOS 15.0. Devices: iPhone + iPad. Orientation: Portrait, Landscape Left/Right (already set).
3. Plug in your iPhone (or pick a simulator), press **Run** (⌘R) to smoke-test: splash → menu → play a hole, haptics (device only), Leaderboards button visible.
4. **Archive**: set the run destination to **Any iOS Device (arm64)** → **Product → Archive**.
5. In the Organizer, select the archive → **Distribute App → App Store Connect → Upload** (keep default options: upload symbols, manage version/build number automatically). Wait for the "processing" e-mail (10–30 min); fix export-compliance prompt: `ITSAppUsesNonExemptEncryption` is already `false`, so Apple will not ask.
6. Optional but recommended: in App Store Connect → **TestFlight**, install the processed build on your phone and verify Game Center end-to-end first.

Every later release: bump **Build** (and Version), `npm run ios:sync`, Archive, Upload.

## 4. Privacy / age rating

- **App Privacy ("nutrition label")**: App Store Connect → App Privacy → *Get Started* → "Do you or your third-party partners collect data from this app?" → **No** → result: **Data Not Collected**. (The app has no analytics, ads, accounts or third-party SDKs; settings and saves live in on-device local storage. Game Center data is processed by Apple under Apple's own policy and is not collected by the app/developer; privacy policy states this.) Privacy Policy URL = the privacy page above.
- **Age rating** (Apple's questionnaire): answer **None / No** to every content question (cartoon or realistic violence, sexual content, profanity, horror, alcohol/tobacco/drugs, gambling, contests, medical info, unrestricted web access, user-generated content, in-app chat). Expected rating: **4+**.
- **Export compliance**: uses only standard OS encryption (HTTPS not even used) → exempt, already declared in Info.plist.
- **Content rights**: you are confirming you hold rights to all content — all bundled assets are CC0/public domain/ODbL (credits in-app and in `assets/CREDITS.md`), commentary audio is generated with ElevenLabs (check your plan allows commercial use) and course names are parodies. Tick "does not contain third-party content" only if you are comfortable; otherwise tick "contains, and I have rights" — the data/audio credits are in the repo.
- **Copyright**: `2026 Gorilla Stocks` (or your legal name).
- **Price**: Free (no in-app purchases). **Availability**: all territories, or your choice.

## 5. App Store Connect form — listing copy

**Create the app:** My Apps → **+ → New App** → Platforms: **iOS**; Name: `Abandoned Dunes`; Primary language: English (U.S.); Bundle ID: `com.gorillastocks.abandoneddunes`; SKU: `abandoneddunes-ios-001`; User Access: Full Access.

**Name** (15/30): `Abandoned Dunes`

**Subtitle** (28/30): `Slingshot golf on wild links`

**Promotional text** (130/170): 
> Pull back, release, and carry the wind across seven parody links courses. Fully offline. No ads, no tracking, no in-app purchases.

**Keywords** (89/100, comma-separated, no spaces, no trademarked names): 
`golf,slingshot,links,dunes,coast,wind,putting,fairway,offline,3d,sports,leaderboard,gorse`

**Categories:** Primary **Games** (subcategory **Sports**; second subcategory optional **Simulation**). Secondary category: **Sports**.

**Support URL:** https://gorillastocks.github.io/bandon-golf/docs/support.html  
**Marketing URL (optional):** https://gorillastocks.github.io/bandon-golf/  
**Privacy Policy URL:** https://gorillastocks.github.io/bandon-golf/docs/privacy.html

**Description** (1946/4000):

```
Pull back. Aim into the wind. Let it fly.

Abandoned Dunes is a first-person, slingshot-style golf game set on wind-whipped coastal links: towering dunes, gorse, cliffs above the sea, and greens that roll like the ocean. Drag back to set power and aim, release to swing, and read the wind dial before every shot.

SEVEN PARODY COURSES
• Bandit Dunes – the cliffside classic that robs you in broad daylight
• Terrific Dunes – a clifftop showpiece with blowout bunkers
• Abandon Trails – dunes, meadow, then deep forest
• Old MacDonald Had a Links – wide-open fairways, huge rolling greens
• Sheep Wreck – bluff-top fairways with nowhere to hide
• Preserve Us! – thirteen par 3s tumbling toward the beach
• Short Circuit – nine quick par 3s, perfect for a warm-up

BUILT FOR THE WIND
• Real wind that gusts and shifts, with a live wind dial
• Three difficulty levels: Simple, Normal and Realistic (full wind, lie penalties, no aim assist)
• Smart club suggestions based on distance, elevation, wind and lie
• Putting with real green slopes, plus an optional Auto 2-putt to keep rounds moving

LOOKS AND SOUNDS THE PART
• Terrain shaped from real elevation and aerial imagery
• Ocean mist, dune grass, wind sway and dynamic shadows
• Optional tournament crowd with cheers, groans and claps
• Optional host commentary on selected holes
• Haptic feedback on every strike, splash and cup drop

PLAY YOUR WAY
• Play 18, front 9, back 9, or just a few holes
• Save & Continue Later: pick your round up where you left off
• Track your personal bests for every course and difficulty
• Game Center leaderboards for every course and difficulty, plus achievements for birdies, eagles, aces and breaking par

PRIVATE AND OFFLINE
Everything is on your device. No account, no ads, no tracking, no in-app purchases. Just you, the dunes and the wind.

Course names are parodies. Abandoned Dunes is not affiliated with or endorsed by any real golf course or resort.
```

**What's New (1.0):** `First release. Seven parody courses, three difficulty levels, Game Center leaderboards and achievements.`

**App Review Information:** Sign-in required: **No**. Contact: your name, phone, e-mail. Notes for review:
```
Abandoned Dunes is a 3D first-person slingshot golf game with its own rendering and physics engine (three.js in a native shell). It is fully playable offline, uses haptics and Game Center (leaderboards/achievements) and requires no account. To play: tap "Play a Round", pick any course and difficulty, tap "Tee it up", then drag back on the screen and release to hit. Course names are parodies; the app is not affiliated with any real golf resort.
```

**Version release:** manual or automatic — your choice. Then **Add for Review → Submit to App Review**. Review is usually 24–48 h.

## 6. Screenshots

Apple needs **at least 1 and at most 10** screenshots per device size, PNG or JPEG, RGB, no alpha, in the exact pixel sizes below. If the app supports iPad you must also supply iPad screenshots. **The 6.9" iPhone set is enough for all iPhone sizes** (App Store Connect scales it down), and the 13" iPad set covers all iPads.

| Display | Accepted sizes (portrait × landscape) | In repo |
|---|---|---|
| iPhone 6.9" (16/15 Pro Max, 16/15 Plus) — **required** | 1320×2868, 1290×2796, 1260×2736 / 2868×1320, 2796×1290, 2736×1260 | `store/screenshots/iphone-6.9-portrait-1320x2868/` and `…landscape-2868x1320/` |
| iPhone 6.5" (optional fallback) | 1284×2778, 1242×2688 / 2778×1284, 2688×1242 | not needed if 6.9" is supplied |
| iPad 13" (M4 / Air 13") — **required for iPad** | 2064×2752, 2048×2732 / 2752×2064, 2732×2048 | `store/screenshots/ipad-13-portrait-2064x2752/` |

Upload one orientation per device size (all screenshots in a set must share it). Recommended: upload the **portrait** iPhone set as the primary (the portrait layout is the most common way people hold the phone for the slingshot), or landscape if you prefer a wider course view. Files are numbered in the best story order: menu, courses, fly-over, aim, flight, result, scorecard. Regenerate with `tools/store_screenshots.js` (headless Chromium + a mocked iOS platform so the iOS-only Leaderboards button is visible); real-device screenshots from Xcode (⌘S in the simulator, 6.9" = iPhone 16 Pro Max) are also fine. You can add captions/frames in Apple's Screenshot tooling or Previewed/Rotato if desired.

## 7. Pre-submission checklist
- [ ] Apple Developer Program active
- [ ] (Recommended) GitHub repo renamed; Support/Privacy URLs updated
- [ ] Decide on disabling the `pacific_01`, `sheep_01`, `oldmac_01` commentary clips (real course names)
- [ ] Game Center: 21 leaderboards + 4 achievements created and added to the version
- [ ] App Privacy = Data Not Collected; age rating questionnaire → 4+
- [ ] Screenshots uploaded; description/keywords/subtitle pasted
- [ ] Archive uploaded, build selected on the version, review notes added
- [ ] TestFlight smoke test on a physical iPhone (haptics + Game Center)
