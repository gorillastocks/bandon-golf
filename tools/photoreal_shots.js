// Before/after screenshots + headless perf probe for the photoreal pass.
//   python3 -m http.server 8123   (repo root)   then   LABEL=before node tools/photoreal_shots.js
// env: LABEL (before|after), GFX (low|medium|high|ultra), OUT (default /workspace/photoreal), W/H (viewport), PERF=1 (also write perf json)
const { chromium } = require('/workspace/pwtest/node_modules/playwright');
const fs = require('fs');
const LABEL = process.env.LABEL || 'after', GFX = process.env.GFX || 'high', OUT = process.env.OUT || '/workspace/photoreal';
const W = +(process.env.W || 1280), H = +(process.env.H || 720), DSF = +(process.env.DSF || 1);
// [tag, courseIdx, holeIdx(0-based)]
const SHOTS = [['bandit-h4', 0, 3], ['terrific-h10', 1, 9], ['trails-h18', 2, 17]];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const ctx = await br.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  await ctx.addInitScript(() => { try { localStorage.setItem('bg.crowd', '1'); localStorage.setItem('bg.audio', '0'); } catch (e) {} });
  const pg = await ctx.newPage(); const errs = []; const perf = {};
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const t0 = Date.now();
  await pg.goto(`http://localhost:8123/index.html?gfx=${GFX}`, { timeout: 120000 }); await pg.waitForTimeout(6000);
  perf.bootMs = Date.now() - t0;
  for (const [tag, ci, hi] of SHOTS) {
    await pg.evaluate(([c, hn]) => __bg.startRound(BG.COURSES[c], 'normal', [hn]), [ci, hi]); await pg.waitForTimeout(5000);
    await pg.evaluate(() => { __bg.G.flyT = Math.max(__bg.G.flyT, 0); });
    await pg.waitForTimeout(3500);
    await pg.screenshot({ path: `${OUT}/${LABEL}-${tag}-flyover.png`, timeout: 600000 });
    await pg.keyboard.press('Space'); await pg.waitForTimeout(3500);
    await pg.screenshot({ path: `${OUT}/${LABEL}-${tag}-firstperson.png`, timeout: 600000 });
    // crowd close-up: turn the camera toward the nearest spectator group is hole-specific; use a low camera at the tee looking along the ropes
    const info = await pg.evaluate(() => { const r = __bg.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, heap: performance.memory && performance.memory.usedJSHeapSize }; });
    perf[tag] = info;
  }
  perf.errs = errs.slice(0, 10);
  fs.writeFileSync(`${OUT}/${LABEL}-info.json`, JSON.stringify(perf, null, 1));
  console.log(JSON.stringify(perf));
  await br.close();
})();
