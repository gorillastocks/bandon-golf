// Headless check of every hole: builds it, checks bounds / surfaces / reachability, then plays it with a simple bot using the
// real physics (no rendering). Usage: node tools/verify_holes.js [courseId] [--quiet]
global.window = global;
const path = require('path');
['layouts', 'data', 'physics', 'course'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const P = BG.Phys, S = P.S, YD = P.YD, R = P.R || 0.021;
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null, quiet = process.argv.includes('--quiet');
const onlyHole = +process.env.HOLE || 0;
const DIFF = BG.DIFFICULTY.normal;
const SURF = {}; Object.keys(S).forEach((k) => (SURF[S[k]] = k));
let bad = 0, nholes = 0; const rows = [];
const fail = (c, h, m) => { bad++; console.log('FAIL', c.id, h, m); };

function play(h, seed) {
  const rr = P.mulberry32(seed);
  const wind = new P.Wind({ seed: seed + 5, mph: DIFF.windMph[0] + (DIFF.windMph[1] - DIFF.windMph[0]) * rr(), gust: DIFF.gust, dir: rr() * 6.283, dirVar: DIFF.dirVar });
  const env = { terrain: h, wind, cup: { x: h.pin.x, z: h.pin.z }, trees: h.trees, rules: { gorsePenalty: DIFF.gorsePenalty }, greenRoll: 0.057, capScale: DIFF.capScale, rng: rr };
  let bx = h.tee.x, bz = h.tee.z, strokes = 0, gir = null, hazards = 0, longest = 0;
  const clubs = P.CLUBS.filter((c) => c.type !== 'putter'), putter = P.CLUBS.find((c) => c.type === 'putter');
  for (let n = 0; n < 16; n++) {
    const dx = h.pin.x - bx, dz = h.pin.z - bz, dm = Math.hypot(dx, dz), dy = dm / YD, surf = h.surf(bx, bz);
    if (dm < 0.9) return { strokes, gir, hazards, holed: true, longest };
    const b = P.newBall(bx, h.h(bx, bz) + R, bz); b.lastGood = { x: bx, z: bz };
    const yaw = Math.atan2(dx, -dz);
    const onGreen = surf === S.GREEN || (surf === S.FRINGE && dm < 18);
    if (surf === S.GREEN && gir === null) gir = strokes <= h.par - 2;
    if (onGreen) P.launch(b, { club: putter, power: 0.5, yaw: yaw + (rr() - 0.5) * 0.1, puttDist: Math.min(dm * (0.95 + rr() * 0.4), 40), rollMu: 0.057 });
    else {
      let club = clubs[0], tgt = dy * 0.93;
      for (const c of clubs) if (c.carry >= tgt) club = c;
      if (dy < 60) club = clubs[clubs.length - 1];
      let lo = 0.1, hi = 1.1;
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; const pv = P.preview(b, env, { club, power: mid, yaw, mods: {} }); const c = pv.land ? Math.hypot(pv.land.x - bx, pv.land.z - bz) / YD : 0; if (c < Math.min(tgt, club.carry * 1.1)) lo = mid; else hi = mid; }
      P.launch(b, { club, power: (lo + hi) / 2, yaw: yaw + (rr() - 0.5) * 0.03, mods: { speed: 1, launch: 0, spin: 1, yaw: 0, sideSpin: 0 } });
    }
    strokes++; if (process.env.TRACE) console.log('shot', strokes, SURF[surf], 'd=' + dy.toFixed(0) + 'yd', onGreen ? 'putt' : 'full');
    for (let i = 0; i < 240 * 40 && b.mode !== 'stopped' && b.mode !== 'hazard' && b.mode !== 'holed'; i++) { P.stepBall(b, 1 / 240, env); wind.update(1 / 240); if (!isFinite(b.x + b.y + b.z)) return { err: 'NaN ball' }; }
    if (process.env.TRACE) console.log('  ->', b.mode, b.hazard || '', SURF[h.surf(b.x, b.z)], Math.hypot(h.pin.x - b.x, h.pin.z - b.z).toFixed(1) + 'm');
    longest = Math.max(longest, Math.hypot(b.x - bx, b.z - bz) / YD);
    if (b.mode === 'holed') return { strokes, gir, hazards, holed: true, longest };
    if (b.mode === 'hazard') { hazards++; strokes++; bx = b.lastGood.x; bz = b.lastGood.z; continue; }
    if (b.mode !== 'stopped') return { err: 'ball never stopped' };
    bx = b.x; bz = b.z;
  }
  return { strokes, gir, hazards, holed: false, longest };
}

for (const c of BG.COURSES) {
  if (only && c.id !== only) continue;
  if (c.pars.length !== { bandit: 18, terrific: 18, trails: 18, oldmac: 18, sheep: 18, preserve: 13, circuit: 9 }[c.id]) fail(c, 0, 'wrong hole count ' + c.pars.length);
  for (let i = 0; i < c.pars.length; i++) {
    if (onlyHole && onlyHole !== i + 1) continue;
    nholes++;
    let h;
    try { h = BG.Course.build(c, i, DIFF, {}); } catch (e) { fail(c, i + 1, 'build threw ' + e.message); continue; }
    const id = `${c.id} #${i + 1}`;
    const inb = (x, z) => x >= h.x0 && x <= h.x0 + (h.W - 1) * h.res && z >= h.z0 && z <= h.z0 + (h.H - 1) * h.res;
    if (!inb(0, 0) || !inb(h.pin.x, h.pin.z) || !inb(h.green.x, h.green.z)) fail(c, i + 1, 'tee/green outside bounds');
    if (h.surf(0, 0) !== S.TEE) fail(c, i + 1, 'tee surface is ' + SURF[h.surf(0, 0)]);
    if (h.surf(h.pin.x, h.pin.z) !== S.GREEN) fail(c, i + 1, 'pin surface is ' + SURF[h.surf(h.pin.x, h.pin.z)]);
    if (!(h.pin.y > h.SEA_Y + 1.5)) fail(c, i + 1, 'pin below sea level');
    if (h.par !== c.pars[i] || h.yds !== c.yds[i]) fail(c, i + 1, 'par/yds mismatch');
    let nan = 0; for (let k = 0; k < h.Hm.length; k++) if (!isFinite(h.Hm[k])) nan++;
    if (nan) fail(c, i + 1, 'NaN heights ' + nan);
    // centreline reachable: no water / OB between tee and green
    const P0 = h.path; let badS = 0, off = 0;
    for (let s = 6; s < h.L - 4; s += 4) { const p = h.pathAt(s), sf = h.surf(p.x, p.z); if (sf === S.WATER || sf === S.OB || sf === S.GORSE) badS++; if (!inb(p.x, p.z)) off++; }
    if (badS) fail(c, i + 1, 'centreline blocked at ' + badS + ' samples');
    if (off) fail(c, i + 1, 'centreline outside bounds');
    const straight = Math.hypot(h.pin.x, h.pin.z) / YD;
    if (straight > h.yds * 1.04 + 14 || straight < h.yds * 0.8) fail(c, i + 1, `tee-pin distance ${straight.toFixed(0)} vs ${h.yds} yd`);
    if (!h.bunkers.length) fail(c, i + 1, 'no bunkers');
    // play: best of 3 seeds must hole out within par+5; all must finish without errors
    let best = null;
    for (const sd of [11, 22, 33]) { const r = play(h, sd + i * 101); if (r.err) { fail(c, i + 1, r.err); best = null; break; } if (!best || (r.holed && r.strokes < best.strokes)) best = r; }
    if (best) {
      if (!best.holed) fail(c, i + 1, 'bot could not hole out in 16 shots');
      else if (best.strokes > h.par + 5) fail(c, i + 1, `bot needed ${best.strokes} strokes (par ${h.par})`);
      rows.push([id, h.par, h.yds, straight.toFixed(0), best.strokes, best.gir ? 'Y' : 'n', best.hazards, h.tags.join(' | ')]);
    }
  }
}
if (!quiet) { console.log('hole\tpar\tyds\tdirect\tbot\tGIR\thaz\ttags'); rows.forEach((r) => console.log(r.join('\t'))); }
console.log(`checked ${nholes} holes, ${bad} failures`);
process.exit(bad ? 1 : 0);
