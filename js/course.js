/* Procedural, stylized hole generation: path, terrain height map, surface map, baked-light colour map, objects. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const P = BG.Phys, S = P.S, YD = P.YD;
  const clamp = P.clamp, lerp = P.lerp, smooth = P.smooth;

  // ---------- noise ----------
  function Noise(seed) {
    const rng = P.mulberry32(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rng() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    function n2(x, z) {
      const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
      const X = xi & 255, Z = zi & 255;
      const a = vals[perm[perm[X] + Z]], b = vals[perm[perm[X + 1] + Z]], c = vals[perm[perm[X] + Z + 1]], d = vals[perm[perm[X + 1] + Z + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, z, oct) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * n2(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
    return { n2, fbm };
  }

  function rot(f, a) { return [f[0] * Math.cos(a) - f[1] * Math.sin(a), f[0] * Math.sin(a) + f[1] * Math.cos(a)]; }

  // ---------- path ----------
  function buildPath(par, L, rng, style) {
    let theta = 0, b = 0.6;
    if (!style.short && par >= 4 && rng() < 0.65) { theta = (rng() < 0.5 ? -1 : 1) * (15 + rng() * 24) * Math.PI / 180; b = 0.5 + rng() * 0.2; if (par === 5) theta *= 1.15; }
    else if (par === 3) theta = (rng() - 0.5) * 0.12;
    const f0 = [0, -1], f1 = rot(f0, theta);
    let k = 1, pts;
    for (let it = 0; it < 6; it++) {
      const l1 = b * L * k, l2 = (1 - b) * L * k;
      const P1 = [f0[0] * l1, f0[1] * l1], P2 = [P1[0] + f1[0] * l2, P1[1] + f1[1] * l2];
      const rc = Math.min(70, l1 * 0.4, l2 * 0.4);
      pts = [[0, 0]];
      if (Math.abs(theta) < 1e-4 || rc < 1) { pts.push(P1); } else {
        const A = [P1[0] - f0[0] * rc, P1[1] - f0[1] * rc], B = [P1[0] + f1[0] * rc, P1[1] + f1[1] * rc];
        pts.push(A);
        for (let i = 1; i < 16; i++) { const t = i / 16, a = (1 - t) * (1 - t), bb = 2 * t * (1 - t), c = t * t; pts.push([a * A[0] + bb * P1[0] + c * B[0], a * A[1] + bb * P1[1] + c * B[1]]); }
        pts.push(B);
      }
      pts.push(P2);
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      k *= L / len;
      if (Math.abs(len - L) < 0.3) break;
    }
    return finishPath(pts, theta);
  }

  // resample a polyline (array of [x,z], tee at 0,0) every 4 m by arc length, add extensions
  function finishPath(pts, theta) {
    const ds = 4, out = [];
    let acc = 0, seg = 1, sx = pts[0][0], sz = pts[0][1];
    out.push({ x: sx, z: sz, s: 0 });
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let j = 0;
    for (let s = ds; s < total; s += ds) {
      while (cum[j + 1] < s) j++;
      const t = (s - cum[j]) / (cum[j + 1] - cum[j]);
      out.push({ x: lerp(pts[j][0], pts[j + 1][0], t), z: lerp(pts[j][1], pts[j + 1][1], t), s });
    }
    const last = pts[pts.length - 1];
    out.push({ x: last[0], z: last[1], s: total });
    // headings
    const hd = (a, c) => { const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
    const hs = hd(out[0], out[3]), he = hd(out[out.length - 4], out[out.length - 1]);
    // extensions
    const pre = [], post = [];
    for (let i = 1; i <= 16; i++) pre.unshift({ x: -hs[0] * i * ds, z: -hs[1] * i * ds, s: -i * ds });
    for (let i = 1; i <= 26; i++) post.push({ x: last[0] + he[0] * i * ds, z: last[1] + he[1] * i * ds, s: total + i * ds });
    const all = pre.concat(out, post);
    const n = all.length, px = new Float64Array(n), pz = new Float64Array(n), ps = new Float64Array(n);
    all.forEach((p, i) => { px[i] = p.x; pz[i] = p.z; ps[i] = p.s; });
    const sx_ = new Float64Array(n - 1), sz_ = new Float64Array(n - 1), sl = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) { const dx = px[i + 1] - px[i], dz = pz[i + 1] - pz[i], l = Math.hypot(dx, dz); sl[i] = l; sx_[i] = dx / l; sz_[i] = dz / l; }
    return { n, px, pz, ps, dx: sx_, dz: sz_, len: sl, L: total, i0: pre.length, theta, headS: hs, headE: he, end: last };
  }

  function nearest(path, x, z, hint, out) {
    const n = path.n - 1;
    let lo = Math.max(0, hint - 10), hi = Math.min(n - 1, hint + 10), best = 1e18, bi = hint, bt = 0;
    for (let guard = 0; guard < 6; guard++) {
      best = 1e18;
      for (let i = lo; i <= hi; i++) {
        const rx = x - path.px[i], rz = z - path.pz[i];
        let t = rx * path.dx[i] + rz * path.dz[i]; t = t < 0 ? 0 : t > path.len[i] ? path.len[i] : t;
        const qx = rx - path.dx[i] * t, qz = rz - path.dz[i] * t, d2 = qx * qx + qz * qz;
        if (d2 < best) { best = d2; bi = i; bt = t; }
      }
      if ((bi === lo && lo > 0) || (bi === hi && hi < n - 1)) { lo = Math.max(0, lo - 24); hi = Math.min(n - 1, hi + 24); } else break;
    }
    const i = bi;
    const cx = path.px[i] + path.dx[i] * bt, cz = path.pz[i] + path.dz[i] * bt;
    const d = Math.sqrt(best);
    const u = (x - cx) * (-path.dz[i]) + (z - cz) * path.dx[i];
    out.s = path.ps[i] + bt; out.u = u; out.d = d; out.i = i; out.cx = cx; out.cz = cz;
    return out;
  }

  function pathAt(path, s) {
    const f = clamp((s - path.ps[0]) / 4, 0, path.n - 1.001), i = Math.floor(f), t = f - i;
    return { x: lerp(path.px[i], path.px[i + 1], t), z: lerp(path.pz[i], path.pz[i + 1], t), hx: path.dx[i], hz: path.dz[i] };
  }

  // ---------- trees spatial hash ----------
  function TreeSet(trees, hmap) {
    const cell = 6, map = new Map();
    trees.forEach((t, idx) => { const k = Math.floor(t.x / cell) + ',' + Math.floor(t.z / cell); let a = map.get(k); if (!a) map.set(k, (a = [])); a.push(idx); });
    this.trees = trees;
    this.query = function (x, z, ya) {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = map.get((cx + i) + ',' + (cz + j)); if (!a) continue;
        for (let q = 0; q < a.length; q++) {
          const t = trees[a[q]]; const dx = x - t.x, dz = z - t.z, d2 = dx * dx + dz * dz;
          if (d2 > 16) continue;
          if (ya < 0 || ya > t.h) continue;
          const d = Math.sqrt(d2);
          if (d < 0.35) return t;
          if (ya > 2) { const cr = t.cr * (1 - (ya - 2) / (t.h - 2)); if (d < cr) return t; }
        }
      }
      return null;
    };
  }

  // ---------- hole build ----------
  const BASE_Y = 24, SEA_Y = 0, SEA_FLOOR = -9;

  function build(course, idx, diff, opt) {
    opt = opt || {};
    if (!opt.procedural && BG.Course.buildReal) { const hr = BG.Course.buildReal(course, idx, diff, opt); if (hr) return hr; }
    const no = idx + 1, par = course.pars[idx], yds = course.yds[idx], style = course.style;
    const rng = P.mulberry32(P.hashStr(course.id) + no * 7919);
    const noise = Noise(P.hashStr(course.id) * 3 + no);
    const L = yds * YD;
    const path = buildPath(par, L, rng, style);
    const forest = !!(course.forestHoles && course.forestHoles.indexOf(no) >= 0);
    const coastDef = course.coast[no];
    const coast = coastDef ? { side: coastDef[0], f0: coastDef[1], f1: coastDef[2], off: coastDef[3] } : null;

    // fairway width profile
    const fwBase = style.fw * (par === 3 ? 0.9 : 1) * (0.85 + rng() * 0.3);
    const roughW = style.rough * (0.8 + rng() * 0.4);
    const s0 = par === 3 ? Math.max(8, L - Math.max(34, Math.min(0.55 * L, 70))) : 34;
    const greenR = style.green * (par === 3 ? 1.08 : 1) * (0.85 + rng() * 0.3);
    const fwPhase = rng() * 100;
    function fwHalf(s) {
      let w = fwBase * (0.82 + 0.18 * noise.n2(s * 0.014 + fwPhase, 3.3));
      w *= 1 + 0.22 * Math.exp(-Math.pow((s - 0.58 * L) / 55, 2));
      const t = smooth(L - 85, L - 14, s);
      w = lerp(w, Math.max(greenR * 0.85, 8.5), t);
      if (par === 3) w = lerp(w, greenR * 1.1, smooth(s0, s0 + 12, s));
      const ramp = smooth(s0 - 12, s0 + 14, s);
      return w * ramp;
    }
    const obDist = fwBase * 1.22 + roughW + (forest ? 48 : 32) + style.dunes * 1.6;

    // elevation profile
    const amp = (style.short ? 7 : 6) + style.dunes * 0.5;
    const ec = [BASE_Y + amp * (0.25 + rng() * 0.65), BASE_Y + amp * (rng() * 0.4 - 0.1), BASE_Y + amp * (rng() * 0.5 - 0.35), BASE_Y + amp * (rng() * 0.6 - 0.25)];
    if (coast) for (let i = 0; i < 4; i++) ec[i] += 2;
    if (par === 3) ec[0] += amp * 0.4;
    function baseElev(s) {
      const f = clamp(s / L, 0, 1) * 3, i = Math.min(2, Math.floor(f)), t = f - i;
      const a = ec[Math.max(0, i - 1)], b = ec[i], c = ec[i + 1], d = ec[Math.min(3, i + 2)];
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    }

    // green + tee
    const hE = path.headE, G0 = path.end;
    const gAng = Math.atan2(hE[1], hE[0]);
    const green = { x: G0[0], z: G0[1], rz: greenR, rx: greenR * (0.82 + rng() * 0.3), ph1: rng() * 6, ph2: rng() * 6, hx: hE[0], hz: hE[1] };
    green.rxw = green.rx; green.rzw = green.rz;
    const tilt = (0.008 + rng() * 0.014) * (style.green > 15 ? 1.25 : 1) * diff.greenSlope, tAng = rng() * Math.PI * 2;
    green.tiltA = Math.cos(tAng) * tilt; green.tiltB = Math.sin(tAng) * tilt;
    green.bumps = [];
    const nb = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < nb; i++) green.bumps.push({ a: (rng() * 2 - 1) * green.rx * 0.7, b: (rng() * 2 - 1) * green.rz * 0.7, amp: (rng() < 0.5 ? -1 : 1) * (0.06 + rng() * 0.16) * diff.greenSlope * (style.green > 15 ? 1.2 : 1), sg: 4 + rng() * 3.5 });
    const tee = { x: 0, z: 0, rx: 5, rz: 3.2 };
    const pinA = (rng() * 2 - 1) * green.rx * 0.5, pinB = (rng() * 2 - 1) * green.rz * 0.5;

    // bunkers
    const bunkers = [];
    function addBunker(x, z, rx, rz, ang, depth) { bunkers.push({ x, z, rx, rz, ca: Math.cos(ang), sa: Math.sin(ang), depth, R: Math.max(rx, rz) * 1.7, ph: rng() * 50 }); }
    const bs = style.bunker;
    const rightOf = (hx, hz) => [-hz, hx];
    // greenside
    {
      const nG = par === 3 ? 4 : 3 + ((rng() * 2) | 0);
      const angs = [Math.PI - 0.8, -(Math.PI - 0.8), Math.PI / 2 + 0.2, -(Math.PI / 2 + 0.2), 0.15, -0.3];
      for (let i = 0; i < nG; i++) {
        const a = angs[i] + (rng() - 0.5) * 0.35, br = (3.2 + rng() * 3) * bs;
        const ra = Math.cos(a) * green.rx, rb = Math.sin(a) * green.rz, edge = Math.hypot(ra, rb);
        const dist = edge + br * 0.75, ax = Math.cos(a) * dist, bz = Math.sin(a) * dist;
        const r = rightOf(hE[0], hE[1]);
        addBunker(green.x + hE[0] * ax + r[0] * bz, green.z + hE[1] * ax + r[1] * bz, br * (1 + rng() * 0.5), br * (0.7 + rng() * 0.4), Math.atan2(hE[1], hE[0]) + a, 0.9 + rng() * 0.6);
      }
    }
    // fairway bunkers
    if (par >= 4 && L > 240) {
      const dd = 225 + rng() * 30;
      const list = [dd - 30 + rng() * 15, dd + 8 + rng() * 18];
      if (par === 5 || L > 440) list.push(L - 135 - rng() * 30);
      let side = rng() < 0.5 ? -1 : 1;
      list.forEach(sb => {
        if (sb < 100 || sb > L - 60) return;
        const p = pathAt(path, sb), r = rightOf(p.hx, p.hz), w = fwHalf(sb), br = (4 + rng() * 4) * bs;
        const off = side * (w + br * 0.2 + rng() * 3);
        addBunker(p.x + r[0] * off, p.z + r[1] * off, br * 1.2, br * 0.75, Math.atan2(p.hz, p.hx) + (rng() - 0.5) * 0.6, 0.8);
        if (rng() < 0.45 && style.bunker > 1.2) addBunker(p.x + r[0] * off * 0.8 + p.hx * 14, p.z + r[1] * off * 0.8 + p.hz * 14, br * 0.9, br * 0.6, Math.atan2(p.hz, p.hx), 0.7);
        side = -side;
      });
    }
    // scattered pot / waste bunkers
    {
      const n = Math.round((style.short ? 2 : 3) * bs);
      for (let i = 0; i < n; i++) {
        const sb = 45 + rng() * Math.max(10, L - 90), p = pathAt(path, sb), r = rightOf(p.hx, p.hz), w = fwHalf(sb) + roughW + 3 + rng() * 16;
        const sd = rng() < 0.5 ? -1 : 1, br = (2.2 + rng() * 2.5) * Math.min(bs, 1.6);
        addBunker(p.x + r[0] * w * sd, p.z + r[1] * w * sd, br, br * (0.7 + rng() * 0.4), rng() * 3, 0.7 + rng() * 0.5);
      }
    }

    // bounds
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = path.i0 - 6; i < path.n - 8; i++) { minX = Math.min(minX, path.px[i]); maxX = Math.max(maxX, path.px[i]); minZ = Math.min(minZ, path.pz[i]); maxZ = Math.max(maxZ, path.pz[i]); }
    const margin = Math.max(obDist + 34, coast ? coast.off + 90 : 0);
    minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;
    let res = 1;
    while ((maxX - minX) / res > 1150 || (maxZ - minZ) / res > 1400) res += 0.25;
    if (opt.res) res = opt.res;
    const W = Math.ceil((maxX - minX) / res) + 1, H = Math.ceil((maxZ - minZ) / res) + 1;
    const x0 = minX, z0 = minZ;

    const info = { s: 0, u: 0, d: 0, i: 0 };
    const gorseSeed = rng() * 100, wobSeed = rng() * 100;
    const duneAmp = style.dunes * (forest ? 0.7 : 1), rollAmp = 0.9 * style.roll;
    const wallH = 15;

    function greenLocal(x, z) {
      const rx = x - green.x, rz = z - green.z;
      const a = rx * green.hx + rz * green.hz, b = -rx * green.hz + rz * green.hx; // along heading, right
      return [a, b];
    }
    function greenE(a, b) {
      const th = Math.atan2(b / green.rz, a / green.rx);
      const wob = 1 + 0.1 * Math.sin(3 * th + green.ph1) + 0.07 * Math.sin(5 * th + green.ph2);
      return ((a / green.rx) * (a / green.rx) + (b / green.rz) * (b / green.rz)) / (wob * wob);
    }
    function ceAt(s) { return coast.off + 6 * noise.n2(s * 0.02 + 7, 1.7); }

    // base (no green/tee/bunker) height
    function baseH(x, z, inf) {
      const s = inf.s, d = inf.d;
      let h = baseElev(s);
      const dR = fwHalf(Math.max(s, s0 + 20)) + roughW;
      const inner = 1 - smooth(dR * 0.8, dR + 14, d);
      h += noise.fbm(x * 0.03 + 11, z * 0.03 + 5, 3) * rollAmp * (0.45 + 0.55 * inner);
      const outer = smooth(dR * 0.6, dR + 24, d);
      const nearG = smooth(1.2, 5.5, greenE.apply(null, greenLocal(x, z)));
      const dn = noise.fbm(x * 0.017 + 3, z * 0.017 + 9, 4);
      h += outer * duneAmp * (dn * 1.0 + 0.4) * (0.35 + 0.65 * nearG) + outer * 0.5 * noise.n2(x * 0.11, z * 0.11);
      const ex = Math.max(-inf.s - 14, inf.s - L - 34);
      let wall = Math.pow(clamp((d - obDist + 8) / 32, 0, 1), 1.5);
      if (ex > 0) wall = Math.max(wall, Math.pow(clamp(ex / 30, 0, 1), 1.5));
      if (coast) { const uo = coast.side * inf.u; if (uo > 0) wall = ex > 0 ? wall : 0; }
      h += wall * wallH;
      return h;
    }
    const greenY = (function () { const inf = { s: L, u: 0, d: 0 }; return baseH(green.x, green.z, inf); })();
    green.y = greenY;
    const teeY0 = baseElev(0) + 0.2;
    tee.y = teeY0;

    function heightAt(x, z, inf) {
      let h = baseH(x, z, inf);
      // tee
      const tr = (x * x) / (tee.rx * tee.rx) + (z * z) / (tee.rz * tee.rz);
      // (tee heading approximated as -z; fine for flat plate)
      if (tr < 9) h = lerp(h, teeY0, 1 - smooth(1.1, 3.5, tr));
      // green
      const gl = greenLocal(x, z), ge = greenE(gl[0], gl[1]);
      if (ge < 5) {
        const wg = 1 - smooth(1.05, 2.4, ge);
        if (wg > 0) {
          let hg = green.y + green.tiltA * gl[0] + green.tiltB * gl[1];
          for (let i = 0; i < green.bumps.length; i++) { const bu = green.bumps[i], da = gl[0] - bu.a, db = gl[1] - bu.b; hg += bu.amp * Math.exp(-(da * da + db * db) / (2 * bu.sg * bu.sg)); }
          h = lerp(h, hg, wg);
        }
      }
      // bunkers
      for (let i = 0; i < bunkers.length; i++) {
        const bk = bunkers[i], dx = x - bk.x, dz = z - bk.z;
        if (dx * dx + dz * dz > bk.R * bk.R) continue;
        const a = dx * bk.ca + dz * bk.sa, b = -dx * bk.sa + dz * bk.ca;
        const rr = (a / bk.rx) * (a / bk.rx) + (b / bk.rz) * (b / bk.rz);
        const re = rr * (1 + 0.3 * noise.n2(x * 0.22 + bk.ph, z * 0.22));
        if (re < 1.6) h -= bk.depth * smooth(1.35, 0.3, re) - 0.25 * Math.exp(-Math.pow((re - 1.45) / 0.18, 2));
      }
      // coast
      if (coast) {
        const uo = coast.side * inf.u;
        const cw = smooth(coast.f0 * L - 40, coast.f0 * L + 30, inf.s) * (1 - smooth(coast.f1 * L + 20, coast.f1 * L + 70, inf.s));
        const ce = ceAt(inf.s);
        if (cw > 0.01) {
          h += cw * 1.4 * Math.exp(-Math.pow((uo - (ce - 7)) / 6, 2));
          const dropT = smooth(ce - 1, ce + 15, uo);
          h = lerp(h, SEA_FLOOR - 3 + (SEA_FLOOR + 5 - (SEA_FLOOR - 3)) * 0, dropT * cw) ;
          // cw blend: when cw<1 the cliff fades out as land
        }
      }
      return h;
    }

    function surfAt(x, z, inf, h) {
      const s = inf.s, d = inf.d;
      const ex = Math.max(-s - 14, s - L - 34);
      let uo = -1e9, ce = 1e9, cw = 0;
      if (coast) {
        uo = coast.side * inf.u; ce = ceAt(s);
        cw = smooth(coast.f0 * L - 40, coast.f0 * L + 30, s) * (1 - smooth(coast.f1 * L + 20, coast.f1 * L + 70, s));
        if (cw > 0.5 && uo > ce) return S.WATER;
      }
      if ((d > obDist && !(coast && uo > 0 && ex <= 0)) || ex > 0) return S.OB;
      if (h < SEA_Y + 1.5) return S.WATER;
      const gl = greenLocal(x, z), ge = greenE(gl[0], gl[1]);
      // bunkers
      let sand = false;
      for (let i = 0; i < bunkers.length; i++) {
        const bk = bunkers[i], dx = x - bk.x, dz = z - bk.z;
        if (dx * dx + dz * dz > bk.R * bk.R) continue;
        const a = dx * bk.ca + dz * bk.sa, b = -dx * bk.sa + dz * bk.ca;
        const rr = (a / bk.rx) * (a / bk.rx) + (b / bk.rz) * (b / bk.rz);
        if (rr * (1 + 0.3 * noise.n2(x * 0.22 + bk.ph, z * 0.22)) < 1) { sand = true; break; }
      }
      if (ge < 1) return S.GREEN;
      if (sand) return S.SAND;
      const tr = (x * x) / (tee.rx * tee.rx) + (z * z) / (tee.rz * tee.rz);
      if (tr < 1) return S.TEE;
      if (ge < 1.3) return S.FRINGE;
      const fj = noise.n2(x * 0.09 + wobSeed, z * 0.09) * 0.9;
      const fw = fwHalf(s);
      if (fw > 0 && d < fw + fj && s < L + 6) return S.FAIRWAY;
      const corridor = s < s0 ? Math.max(5.5, fwBase * 0.45) * smooth(-30, 8, s) : 0;
      const rw = Math.max(fw, corridor) + roughW + fj * 1.2;
      if (d < rw) return S.ROUGH;
      if (!forest) {
        const gn = noise.fbm(x * 0.04 + gorseSeed, z * 0.04 + gorseSeed * 0.7, 3);
        const thr = 0.5 - style.gorse * 0.62;
        const gl2 = ge > 7 && (x * x + z * z) > 400;
        if (gl2 && gn > thr && d > rw + 2.5 && d < obDist - 4) return S.GORSE;
      }
      return S.DEEP;
    }

    // ----- raster pass 1: height + surface -----
    const Hm = new Float32Array(W * H), Sm = new Uint8Array(W * H), Sa = new Float32Array(W * H), Um = new Float32Array(W * H);
    let hint = path.i0;
    for (let j = 0; j < H; j++) {
      const z = z0 + j * res;
      let rowHint = hint;
      for (let i = 0; i < W; i++) {
        const x = x0 + i * res;
        nearest(path, x, z, hint, info);
        hint = info.i; if (i === 0) rowHint = hint;
        const h = heightAt(x, z, info);
        const k = j * W + i;
        Hm[k] = h; Sa[k] = info.s; Um[k] = info.u;
        Sm[k] = surfAt(x, z, info, h);
      }
      hint = rowHint;
    }

    // sampling API
    const iw = 1 / res;
    function hAt(x, z) {
      let fx = (x - x0) * iw, fz = (z - z0) * iw;
      if (fx < 0) fx = 0; else if (fx > W - 1.001) fx = W - 1.001;
      if (fz < 0) fz = 0; else if (fz > H - 1.001) fz = H - 1.001;
      const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, k = iz * W + ix;
      const a = Hm[k], b = Hm[k + 1], c = Hm[k + W], d = Hm[k + W + 1];
      return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
    }
    function normalAt(x, z, o) {
      const e = 0.6 + res * 0.4;
      const dx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e), dz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
      const l = Math.sqrt(dx * dx + 1 + dz * dz);
      o[0] = -dx / l; o[1] = 1 / l; o[2] = -dz / l; return o;
    }
    function surfNow(x, z) {
      const i = Math.round((x - x0) * iw), j = Math.round((z - z0) * iw);
      if (i < 0 || j < 0 || i >= W || j >= H) return S.OB;
      return Sm[j * W + i];
    }

    // pin
    const pr = rightOf(hE[0], hE[1]);
    const pin = { x: green.x + hE[0] * pinA + pr[0] * pinB, z: green.z + hE[1] * pinA + pr[1] * pinB };
    pin.y = hAt(pin.x, pin.z);
    const teeP = { x: 0, z: 0, y: hAt(0, 0) };

    // ----- raster pass 2: colours with baked light -----
    const tex = new Uint8ClampedArray(W * H * 4);
    const Lx = 0.5, Ly = 0.72, Lz = 0.48, Ll = Math.hypot(Lx, Ly, Lz);
    const CL = { tee: [112, 176, 76], fw: [122, 168, 72], fr: [102, 164, 74], ro: [98, 136, 60], deep: [176, 160, 90], deep2: [128, 126, 66], gorse: [66, 84, 40], sand: [233, 216, 164], green: [88, 182, 88], rock: [140, 122, 98], forest: [84, 82, 48], ob: [160, 148, 88] };
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i, st = Sm[k];
        const x = x0 + i * res, z = z0 + j * res;
        const il = Math.max(0, i - 1), ir = Math.min(W - 1, i + 1), jt = Math.max(0, j - 1), jb = Math.min(H - 1, j + 1);
        let gx = (Hm[j * W + ir] - Hm[j * W + il]) / ((ir - il) * res), gz = (Hm[jb * W + i] - Hm[jt * W + i]) / ((jb - jt) * res);
        let ex = 1;
        if (st === S.GREEN || st === S.FRINGE) ex = 3.2;
        const nl = Math.sqrt(gx * gx * ex * ex + 1 + gz * gz * ex * ex);
        const nd = (-gx * ex * Lx + Ly - gz * ex * Lz) / (nl * Ll);
        let lit = 0.5 + 0.62 * Math.max(0, nd);
        const slope = Math.sqrt(gx * gx + gz * gz);
        const nz1 = noise.n2(x * 0.5 + 40, z * 0.5), nz2 = noise.n2(x * 0.13, z * 0.13 + 60), nz3 = noise.n2(x * 1.7, z * 1.7);
        let c;
        switch (st) {
          case S.TEE: c = CL.tee; break;
          case S.FAIRWAY: {
            c = CL.fw; const stripe = ((Math.floor(Sa[k] / 9) & 1) ? 0.045 : -0.03); lit *= 1 + stripe; break;
          }
          case S.FRINGE: c = CL.fr; break;
          case S.ROUGH: c = CL.ro; break;
          case S.GREEN: { c = CL.green; lit *= 1 + (((Math.floor((Sa[k] + Um[k] * 0.3) / 2.2)) & 1) ? 0.025 : -0.015); break; }
          case S.SAND: c = CL.sand; break;
          case S.GORSE: c = CL.gorse; break;
          case S.WATER: c = CL.rock; break;
          default: c = forest ? CL.forest : (st === S.OB ? CL.ob : CL.deep);
        }
        let r = c[0], g = c[1], b = c[2];
        if (st === S.DEEP || st === S.OB) {
          // tawny fescue, greener in hollows, paler on crests
          const t = clamp(0.5 + nz2 * 0.6 + (Hm[k] - baseElev(Sa[k])) * 0.03, 0, 1);
          if (!forest) { r = lerp(CL.deep2[0], CL.deep[0], t); g = lerp(CL.deep2[1], CL.deep[1], t); b = lerp(CL.deep2[2], CL.deep[2], t); }
          const sandy = slope > 0.55 ? clamp((slope - 0.55) * 2, 0, 1) : 0;
          r = lerp(r, 205, sandy * 0.4); g = lerp(g, 188, sandy * 0.4); b = lerp(b, 140, sandy * 0.4);
        } else if (st === S.GORSE) {
          const y = nz3 > 0.55 ? (nz3 - 0.55) * 2.2 : 0; r = lerp(r, 196, y); g = lerp(g, 170, y); b = lerp(b, 50, y);
        } else if (st === S.WATER) {
          const sandy = clamp(nz2 * 0.5 + 0.5, 0, 1); r = lerp(138, 190, sandy); g = lerp(120, 170, sandy); b = lerp(98, 128, sandy);
        }
        if (slope > 1.0 && st !== S.SAND && st !== S.GREEN) { const t = clamp((slope - 1.0) * 1.2, 0, 0.8); r = lerp(r, CL.rock[0], t); g = lerp(g, CL.rock[1], t); b = lerp(b, CL.rock[2], t); }
        const v = 1 + nz1 * 0.05 + nz3 * (st === S.GREEN ? 0.012 : 0.035);
        lit *= v;
        if (st === S.SAND) lit *= 1 + nz3 * 0.03;
        const o = k * 4;
        tex[o] = r * lit; tex[o + 1] = g * lit; tex[o + 2] = b * lit; tex[o + 3] = st === S.GREEN ? 28 : st === S.FRINGE ? 80 : st === S.TEE ? 60 : st === S.FAIRWAY ? 130 : st === S.SAND ? 170 : 255;
      }
    }

    // ----- objects -----
    const objs = { gorse: [], trees: [], markers: [] };
    {
      const r2 = P.mulberry32(P.hashStr(course.id) + no * 31 + 5);
      if (!forest && style.gorse > 0.05) {
        const target = Math.round(260 + style.gorse * 700);
        for (let a = 0; a < 30000 && objs.gorse.length < target; a++) {
          const x = x0 + r2() * (W - 1) * res, z = z0 + r2() * (H - 1) * res;
          if (surfNow(x, z) !== S.GORSE) continue;
          objs.gorse.push({ x, z, y: hAt(x, z), sx: 0.9 + r2() * 1.7, sy: 0.55 + r2() * 0.9, c: r2() });
        }
      }
      if (forest) {
        for (let a = 0; a < 60000 && objs.trees.length < 1150; a++) {
          const x = x0 + r2() * (W - 1) * res, z = z0 + r2() * (H - 1) * res;
          const st = surfNow(x, z);
          if (st !== S.DEEP && st !== S.OB) continue;
          nearest(path, x, z, path.i0 + Math.floor(clamp(((z === z) ? 0 : 0), 0, 1)), info);
          if (info.d < fwBase * 1.2 + roughW + 5) continue;
          if (info.d < fwBase * 1.2 + roughW + 16 && r2() < 0.55) continue;
          if (surfNow(x, z) === S.SAND) continue;
          const hh = 10 + r2() * 11;
          objs.trees.push({ x, z, y: hAt(x, z), h: hh, cr: 2.0 + hh * 0.13 + r2() * 0.8, c: r2() });
        }
      } else if (course.id === 'trails' || course.id === 'bandon') {
        // a few lone shore pines
        for (let a = 0; a < 3000 && objs.trees.length < (course.id === 'trails' ? 140 : 14); a++) {
          const x = x0 + r2() * (W - 1) * res, z = z0 + r2() * (H - 1) * res;
          const st = surfNow(x, z); if (st !== S.DEEP && st !== S.OB) continue;
          nearest(path, x, z, path.i0, info); if (info.d < fwBase + roughW + 18) continue;
          const hh = 6 + r2() * 6; objs.trees.push({ x, z, y: hAt(x, z), h: hh, cr: 1.8 + hh * 0.1, c: r2() });
        }
      }
      // yardage markers (to pin, along centreline)
      [200, 150, 100].forEach((yd, qi) => {
        const sM = L - yd * YD; if (sM < 20) return;
        const p = pathAt(path, sM), r = rightOf(p.hx, p.hz), w = fwHalf(sM) + 1.5;
        const x = p.x - r[0] * w, z = p.z - r[1] * w;
        objs.markers.push({ x, z, y: hAt(x, z), yd, col: [0x2a6ed6, 0xf4f4f4, 0xd83030][qi] });
      });
    }

    // description tags
    const tags = [];
    if (Math.abs(path.theta) > 0.12) tags.push((path.theta > 0 ? 'Dogleg right' : 'Dogleg left'));
    if (coast) tags.push('Ocean ' + (coast.side > 0 ? 'right' : 'left'));
    if (forest) tags.push('Forest');
    else if (style.gorse > 0.3) tags.push('Gorse');
    if (style.green > 15) tags.push('Huge green');
    if (par === 3) tags.push('Par 3');
    if (!tags.length) tags.push(par === 5 ? 'Reachable in three' : 'Open links');

    const hole = {
      no, par, yds, L, course, path, green, pin, tee: teeP, fwHalf, roughW, obDist, forest, coast, tags,
      W, H, res, x0, z0, Hm, Sm, tex, bunkers, objs, SEA_Y,
      h: hAt, n: normalAt, surf: surfNow,
      trees: objs.trees.length ? new TreeSet(objs.trees) : null,
      nearest: (x, z) => { const o = {}; nearest(path, x, z, path.i0 + 20 | 0, o); return o; },
      pathAt: s => pathAt(path, s),
    };
    // nearest with global search
    hole.nearest = function (x, z) {
      const o = {}; let best = 1e18, bi = path.i0;
      for (let i = 0; i < path.n - 1; i += 4) { const dx = x - path.px[i], dz = z - path.pz[i], d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
      nearest(path, x, z, bi, o); return o;
    };
    // drop / relief location
    hole.relief = function (x, z, kind) {
      const o = hole.nearest(x, z);
      let dx = o.cx - x, dz = o.cz - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let px = x, pz = z, found = false;
      for (let i = 0; i < 400; i++) {
        px += dx; pz += dz;
        const st = surfNow(px, pz);
        if (st === S.FAIRWAY || st === S.ROUGH || st === S.FRINGE || st === S.TEE || (st === S.DEEP && kind === 'gorse')) { found = true; break; }
      }
      if (!found) return { x: o.cx, z: o.cz };
      for (let i = 0; i < 3; i++) { const nx = px + dx, nz = pz + dz; const st = surfNow(nx, nz); if (st === S.FAIRWAY || st === S.ROUGH || st === S.FRINGE || st === S.DEEP && kind === 'gorse') { px = nx; pz = nz; } }
      return { x: px, z: pz };
    };
    // default aim target
    hole.aimTarget = function (x, z) {
      const dp = Math.hypot(pin.x - x, pin.z - z);
      if (dp < 215) return { x: pin.x, z: pin.z, pin: true };
      const o = hole.nearest(x, z);
      const p = pathAt(path, Math.min(L - 40, o.s + 215));
      const ang = Math.abs(Math.atan2(pin.x - x, -(pin.z - z)) - Math.atan2(p.x - x, -(p.z - z)));
      if (ang < 0.1) return { x: pin.x, z: pin.z, pin: true };
      return { x: p.x, z: p.z, pin: false };
    };
    return hole;
  }

  BG.Course = { build, Noise, _int: { nearest, pathAt, TreeSet, finishPath } };
})(typeof window !== 'undefined' ? window : globalThis);
