# Repo rename and history-scrub plan (not executed)

Status: **plan only.** Nothing here has been done. The repo is still `gorillastocks/bandon-golf`, history is untouched, and the App Store Connect (ASC) URLs are unchanged. The app was Waiting for Review when this was written, so do not touch the URLs below until the review outcome is known.

## Why
- The repo name, the Pages URL (`https://gorillastocks.github.io/bandon-golf/`), and the git history (59 commits) still contain the real resort name, and older commits contain the OpenStreetMap/USGS/NAIP-derived course data, real hole names and real-name commentary.
- The working tree and the latest commit are clean after the legal cleanup. Only the repo name, the URLs and the history still carry the real name.

## URLs that must keep working
These are registered in ASC (support, marketing and privacy URLs) and printed in the in-app credits and the listing:
- `https://gorillastocks.github.io/bandon-golf/` (marketing URL and web version)
- `https://gorillastocks.github.io/bandon-golf/docs/privacy.html`
- `https://gorillastocks.github.io/bandon-golf/docs/support.html`

GitHub Pages does **not** redirect after a repo rename. A plain rename of `bandon-golf` to `abandoned-dunes` makes all three URLs return 404 immediately (and the github.com repo URLs redirect, but Pages does not). So never do a bare rename while the ASC listing still points at the old URLs.

## New name
`abandoned-dunes` (matches the app, bundle id `com.gorillastocks.abandoneddunes`, `package.json`). New Pages URL: `https://gorillastocks.github.io/abandoned-dunes/`.

## Recommended: new repo for the game + stub `bandon-golf` Pages repo (fresh, squashed history)
This gives the rename and the history scrub in one go, with no force-push, and keeps the old URLs alive.

1. **Create `gorillastocks/abandoned-dunes`** (public, Pages from `main`, `/`). Push one squashed commit of the current tree (`git checkout --orphan clean && git add -A && git commit -m "Abandoned Dunes"`; push as `main`). The old history is not carried over.
2. In the new repo: re-create the Actions secrets (`ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_KEY_P8`, `DIST_CERT_P12`, `DIST_CERT_PASSWORD`; the values come from you and are not readable via the API), and change the three `if: github.repository == 'gorillastocks/bandon-golf'` guards in `.github/workflows/ios-*.yml`, plus the URLs in `fastlane/asc_script.rb`, `README.md`, `docs/*.md`, `docs/privacy.html`, `docs/support.html` and `js/mp.js` / `js/ui.js` if they hold the Pages URL. Run the TestFlight workflow once to confirm signing works from the new repo.
3. **Replace the old repo with a stub.** The old repo has to be removed, not just emptied, or its history stays public:
   1. Rename the old repo to `bandon-golf-old` (Settings > Repository name) and make it **private** (Settings > Danger zone). Its Pages site goes offline at once, so do steps 3.2 and 3.3 straight after (a few minutes of 404).
   2. Create a new repo named `bandon-golf` (public, Pages from `main`) containing only static files:
      - `index.html` that redirects to `https://gorillastocks.github.io/abandoned-dunes/` (`<meta http-equiv="refresh">` plus `location.replace`, and a visible link),
      - `docs/privacy.html` and `docs/support.html` as **full copies** of the real pages (not redirects). A real page at the exact registered URL is the safest for App Review; add a link to the new URL.
      - a `README` with only the parody name and the non-affiliation line.
   3. Check the three URLs return 200.
   4. Delete `bandon-golf-old` once you are happy (the history then leaves GitHub, apart from caches below).
4. Later, when the next ASC version is prepared, point the support, marketing and privacy URLs at the new repo's Pages. The stub can stay indefinitely, or be retired after the old URLs are no longer in any live listing.

Risks and notes:
- Short Pages outage between 3.1 and 3.2. Do it when no review is in flight.
- Stars, issues, releases and Actions run history do not carry over. There are 0 forks, 0 PRs and no stars today, so little is lost.
- Secrets must be re-entered by you. No code signing or ASC change happens, so the app's bundle id and the build pipeline are unaffected.
- GitHub keeps unreachable commits reachable by SHA for a while, and caches may persist. To purge them, ask GitHub Support to run garbage collection. Deleting the repo is the strongest option available.
- Anyone who already cloned the old repo keeps the old history. Public mirrors or archives (for example the Wayback Machine) are outside our control.

## Alternative: rename in place + `git filter-repo` + force-push
Keeps secrets, workflow settings and the repo id, but needs a force-push and still breaks the URLs unless a stub repo is added anyway.
1. Back up (`git clone --mirror`). Run `git filter-repo --invert-paths --path js/realdata.js --path js/real.js --path assets/aerial --path tools/naip ...` (and `--replace-text` for the real names), or squash everything to one commit.
2. Force-push `main` (`git push --force origin main`). Delete other refs and tags.
3. Rename to `abandoned-dunes`, then create the stub `bandon-golf` Pages repo as in step 3.2 above.

Risks: **rewrites all 59 commit SHAs, force-push to the default branch**; the old commits stay fetchable on GitHub by SHA until GitHub garbage-collects them (needs a Support request); open clones and the CI cache diverge; any tool that stored a commit SHA (for example TestFlight build notes) no longer matches. It also needs `filter-repo` to be run against every historical path where names appear, which is easy to get wrong. A fresh repo is simpler and safer.

## Decisions needed from Sean
1. Approve the **new repo + stub** option (recommended) or the in-place filter-repo option, or leave history as it is.
2. When to do the swap: after the current review resolves, ideally before the next ASC version. Doing it during review risks URL downtime.
3. Whether to keep the stub `bandon-golf` repo permanently or delete it after the ASC URLs are updated.
4. Who re-enters the Actions secrets in the new repo (the values are not readable via the API).
