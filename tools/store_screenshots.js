// Generates App Store screenshots with headless Chromium (Playwright). Needs: python3 -m http.server 8123 in the repo root.
//   cd /workspace/pwtest && node /workspace/bandon-golf/tools/store_screenshots.js
// The Capacitor/native platform is mocked so the iOS-only UI (Leaderboards button) is shown, as in the real app.
const { chromium } = require('/workspace/pwtest/node_modules/playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/bandon-golf/store/screenshots';
const SETS = [
  ['iphone-6.9-portrait-1320x2868', 440, 956, 3],
  ['iphone-6.9-landscape-2868x1320', 956, 440, 3],
  ['ipad-13-portrait-2064x2752', 1032, 1376, 2],
];
const ONLY = process.env.ONLY;
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  for (const [name, w, h, dsf] of SETS) {
    if (ONLY && !name.startsWith(ONLY)) continue;
    const dir = `${OUT}/${name}`; fs.mkdirSync(dir, { recursive: true });
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => {
      const ok = () => Promise.resolve({ ok: true, signedIn: false });
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { GameCenter: { signIn: ok, submitScore: ok, showLeaderboard: ok, showLeaderboards: ok, unlockAchievement: ok, isSignedIn: ok, showAchievements: ok }, Haptics: { impact: ok, notification: ok, selectionChanged: ok } } };
    });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    const shot = async (n) => { await pg.screenshot({ path: `${dir}/${n}.png`, timeout: 600000 }); };
    await pg.goto('http://localhost:8123/index.html?gfx=high', { timeout: 120000 }); await pg.waitForTimeout(4000);
    await shot('01-menu');
    await pg.click('#mmPlay'); await pg.waitForTimeout(800); await shot('02-courses');
    const start = async (ci, hole) => { await pg.evaluate(([c, hn]) => __bg.startRound(BG.COURSES[c], 'normal', [hn]), [ci, hole]); await pg.waitForTimeout(4500); };
    await start(1, 10); await pg.waitForTimeout(2500); await shot('03-flyover');
    await pg.evaluate(() => __bg.skip()); await pg.waitForTimeout(2500);
    await pg.evaluate(() => { const a = document.getElementById('aimPin'); a && a.onclick && a.onclick(); }); await pg.waitForTimeout(1500); await shot('04-aim');
    await pg.evaluate(() => __bg.takeShot(0.85, 0, 1)); await pg.waitForTimeout(1800); await shot('05-flight');
    for (let i = 0; i < 40; i++) { await pg.waitForTimeout(500); if (await pg.evaluate(() => __bg.G.phase !== 'flight' && __bg.G.phase !== 'shot')) break; }
    await pg.waitForTimeout(1500); await shot('06-result');
    await pg.evaluate(() => { const b = document.getElementById('btnCard'); b && b.click(); }); await pg.waitForTimeout(800); await shot('07-scorecard');
    console.log(name, 'errs', errs);
    await ctx.close();
  }
  await br.close();
})();
