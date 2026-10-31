# iOS CI (TestFlight pipeline)

Same approach as Blackspire. GitHub Actions on `macos-latest` + fastlane (`fastlane/Fastfile`), App Store Connect API key, ONE persistent Apple Distribution certificate imported from secrets (never revoked), App Store provisioning profile created or renewed through the API key. Swift Package Manager (no CocoaPods).

Secrets (repo Settings > Secrets, same Apple account and team as Blackspire): `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (PEM), `DIST_CERT_P12` (base64), `DIST_CERT_PASSWORD`. Team `HP68K73YFZ`.

Workflows
- `ios-admin.yml` (manual): `info` (read-only), `register` (bundle id + Game Center capability), `gamecenter` (21 leaderboards + 4 achievements through the ASC API, needs the app record), `compile_check` (unsigned Release build, compiles the Swift Game Center plugin, no secrets).
- `ios-testflight.yml` (manual or tag `ios-v*`): npm ci, `npm run ios:sync`, `fastlane ios beta` (sign, archive, upload to TestFlight; build number = latest TestFlight + 1). It does NOT submit for App Review.

One-time manual step: the ASC API cannot create app records. Create the app once in App Store Connect (Apps > + > New App; name Abandoned Dunes, iOS, English (U.S.), bundle id `com.gorillastocks.abandoneddunes`, SKU `abandoneddunes-ios-001`). Then run `gamecenter`, then `ios-testflight`.
