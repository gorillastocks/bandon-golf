// End-to-end check + screenshots for shot shaping in the real game (headless Chromium via Playwright).
//   python3 -m http.server 8131   (repo root)   then   node tools/shaping_shots.js      env: OUT (default /workspace/shaping), PORT
// 1) measures draw/fade with a 7-iron and a driver through the game's own baseShot() on flat ground, no wind
// 2) screenshots the shape selector and the curved aim preview (desktop + phone portrait + phone landscape)
const { chromium } = require('/workspace/pwtest/node_modules/playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/workspace/shaping', PORT = process.env.PORT || 8131;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const errs = []; let results = null;
  for (const [tag, w, h, touch] of [['desktop', 1280, 720, false], ['phone-portrait', 390, 844, true], ['phone-landscape', 844, 390, true]]) {
    if (process.env.ONLY && process.env.ONLY !== tag) continue;
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('bg.audio', '0'); } catch (e) {} });
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
    await pg.goto(`http://localhost:${PORT}/index.html?gfx=low`, { timeout: 120000 }); await pg.waitForTimeout(4000);
    await pg.evaluate(() => __bg.startRound(BG.COURSES[0], 'normal', [BG.COURSES[0].pars.indexOf(5)])); await pg.waitForTimeout(4500);
    await pg.evaluate(() => __bg.skip()); await pg.waitForTimeout(2500);
    if (!results) {
      results = await pg.evaluate(() => {
        const G = __bg.G, P = BG.Phys, out = [], keep = G.diff, env = G.env, ball = G.ball;
        G.diff = Object.assign({}, keep, { aimAssist: 0 });
        G.env = Object.assign({}, env, { terrain: P.flatTerrain(), wind: null }); G.ball = P.newBall(0, P.R, 0); G.lieSurf = BG.Phys.S.FAIRWAY; G.aimYaw = 0;
        for (const id of ['7I', 'DR']) for (const sh of [-2, -1, 0, 1, 2]) {
          const ci = P.CLUBS.findIndex((c) => c.id === id); G.clubIdx = ci; G.club = P.CLUBS[ci]; G.shape = sh;
          const shot = __bg.baseShot(1, 0), b = P.newBall(0, P.R, 0); P.launch(b, shot);
          const sy = Math.atan2(b.vx, -b.vz);
          for (let i = 0; i < 4000 && !b.landed; i++) P.stepFlight(b, 1 / 240, G.env);
          const x = b.land.x / P.YD, z = -b.land.z / P.YD;
          out.push({ club: id, shape: P.SHAPES[sh].name, startYawDeg: +(sy * 180 / Math.PI).toFixed(2), landX: +x.toFixed(1), carry: +z.toFixed(1), curveYd: +(z * Math.tan(sy)).toFixed(1) });
        }
        G.diff = keep; G.env = env; G.ball = ball; G.shape = 0; return out;
      });
      console.table(results); fs.writeFileSync(`${OUT}/measured-curve.json`, JSON.stringify(results, null, 1));
    }
    // selector + preview: tee shot with the driver, Draw selected, mid-drag
    await pg.evaluate(() => { const G = __bg.G; G.clubIdx = 0; G.club = BG.Phys.CLUBS[0]; G.clubAuto = false; __bg.snapCam(); G.clubIdx = 0; G.club = BG.Phys.CLUBS[0]; G.clubAuto = false; }); await pg.waitForTimeout(1500);
    await pg.screenshot({ path: `${OUT}/${tag}-selector-straight.png`, timeout: 600000 });
    for (const [label, key, n] of [['draw', 'q', 1], ['bigfade', 'e', 3]]) {
      const key2 = key;
      if (label === 'draw') { await pg.keyboard.press('q'); } else { await pg.keyboard.press('e'); await pg.keyboard.press('e'); await pg.keyboard.press('e'); }
      await pg.waitForTimeout(1500);
      const lab = await pg.evaluate(() => document.getElementById('shapeBtn').textContent);
      const box = await pg.evaluate(() => { const r = document.getElementById('shapeBtn').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      console.log(tag, label, 'button label:', lab, 'size', box.join('x'));
      const cx = w * 0.5, cy = h * 0.55;
      await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx, cy + 40, { steps: 4 }); await pg.mouse.move(cx, cy + Math.min(h * 0.27, 230), { steps: 8 }); await pg.waitForTimeout(700);
      await pg.screenshot({ path: `${OUT}/${tag}-preview-${label}.png`, timeout: 600000 });
      await pg.mouse.up(); await pg.evaluate(() => { __bg.G.phase = 'aim'; __bg.G.drag = null; __bg.G.shape = 0; }); await pg.waitForTimeout(300);
    }
    await ctx.close();
  }
  console.log('page errors:', errs);
  await br.close();
})();
