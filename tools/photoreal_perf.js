// Headless perf probe (SwiftShader = CPU rasteriser, so FPS is only a *relative* cost measure between builds/levels, not a GPU number).
//   PORT=8123 LABEL=after node tools/photoreal_perf.js   -> /workspace/photoreal/<LABEL>-perf.json
const { chromium } = require('/workspace/pwtest/node_modules/playwright');
const fs = require('fs');
const PORT = process.env.PORT || 8123, LABEL = process.env.LABEL || 'after', OUT = process.env.OUT || '/workspace/photoreal';
const LEVELS = (process.env.LEVELS || 'low,medium,high,ultra').split(',');
const HOLES = [[0, 3], [1, 9], [2, 17]];
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const res = {};
  for (const lv of LEVELS) {
    const ctx = await br.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('bg.crowd', '1'); } catch (e) {} });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    const t0 = Date.now(); await pg.goto(`http://localhost:${PORT}/index.html?gfx=${lv}`); await pg.waitForFunction(() => window.__bg && __bg.G.hole, null, { timeout: 120000 }); const boot = Date.now() - t0;
    const rows = [];
    for (const [ci, hi] of HOLES) {
      const tl = Date.now();
      await pg.evaluate(([c, h]) => __bg.startRound(BG.COURSES[c], 'normal', [h]), [ci, hi]);
      await pg.waitForFunction(() => __bg.G.phase === 'flyover' && !__bg.G.loading, null, { timeout: 120000 }); const loadMs = Date.now() - tl;
      await pg.keyboard.press('Space'); await pg.waitForTimeout(3000);
      const m = await pg.evaluate(() => new Promise((ok) => {
        let n = 0; const t0 = performance.now(); const gl = __bg.renderer.getContext();
        (function f() { n++; if (performance.now() - t0 < 6000) requestAnimationFrame(f); else { gl.finish(); const r = __bg.renderer.info; ok({ fps: n / ((performance.now() - t0) / 1000), calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, post: BG.Gfx.postStats ? BG.Gfx.postStats() : null, crowd: BG.Crowd.stats().n }); } })();
      }));
      rows.push(Object.assign({ course: ci, hole: hi + 1, loadMs }, m));
    }
    res[lv] = { bootMs: boot, rows, errs: errs.slice(0, 5) }; console.log(lv, JSON.stringify(rows.map((r) => [r.fps.toFixed(1), r.calls, r.tris, r.heapMB])));
    await ctx.close();
  }
  fs.writeFileSync(`${OUT}/${LABEL}-perf.json`, JSON.stringify(res, null, 1)); await br.close();
})();
