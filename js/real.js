/* Real-geometry hole builder: uses BG.Real (OpenStreetMap golf features + USGS elevation) for a hole.
   Falls back, per feature, to procedural pieces and records them in hole.real.fallbacks. */
(function (root) {
  const BG = root.BG, P = BG.Phys, S = P.S, YD = P.YD;
  const clamp = P.clamp, lerp = P.lerp, smooth = P.smooth;
  const C = BG.Course, I = C._int, nearest = I.nearest, pathAt = I.pathAt, TreeSet = I.TreeSet;
  const SEA_Y = 0;
  const K = { green: 0, tee: 1, fairway: 2, bunker: 3, rough: 4, water: 5, lateral: 6, wood: 7, scrub: 8, wetland: 9, beach: 10 };

  // ---- elevation ----
  let DEM = null;
  function dem() {
    if (DEM) return DEM;
    const R = BG.Real, b = atob(R.dem), n = b.length >> 1, a = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = b.charCodeAt(2 * i) | (b.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; a[i] = v / 10; }
    return (DEM = a);
  }
  function cr(t) { const t2 = t * t, t3 = t2 * t; return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2]; }
  function demAt(E, N) {
    const f = BG.Real.frame, z = dem(), cols = f.cols, rows = f.rows;
    let fx = (E - f.E0) / f.step, fy = (N - f.N0) / f.step;
    fx = clamp(fx, 1, cols - 3.001); fy = clamp(fy, 1, rows - 3.001);
    const ix = Math.floor(fx), iy = Math.floor(fy), wx = cr(fx - ix), wy = cr(fy - iy);
    let s = 0;
    for (let j = 0; j < 4; j++) { let r = 0; const o = (iy - 1 + j) * cols + ix - 1; for (let i = 0; i < 4; i++) r += wx[i] * z[o + i]; s += wy[j] * r; }
    return s;
  }

  // ---- raster helpers ----
  function fillPoly(mask, val, rings, x0, z0, res, W, H) {
    let minz = 1e18, maxz = -1e18;
    for (const r of rings) for (let i = 1; i < r.length; i += 2) { if (r[i] < minz) minz = r[i]; if (r[i] > maxz) maxz = r[i]; }
    const j0 = Math.max(0, Math.ceil((minz - z0) / res)), j1 = Math.min(H - 1, Math.floor((maxz - z0) / res));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = z0 + j * res; xs.length = 0;
      for (const r of rings) {
        const n = r.length >> 1;
        for (let a = 0, b = n - 1; a < n; b = a++) {
          const za = r[2 * a + 1], zb = r[2 * b + 1];
          if ((za > z) !== (zb > z)) xs.push(r[2 * a] + (z - za) / (zb - za) * (r[2 * b] - r[2 * a]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - x0) / res)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / res));
        for (let i = i0; i <= i1; i++) mask[j * W + i] = val;
      }
    }
  }
  // chamfer distance (metres) from nearest cell where pred(mask)=true; 0 on those cells
  function dt(mask, W, H, res, invert) {
    const out = new Float32Array(W * H), BIG = 1e9, d1 = res, d2 = res * 1.4142;
    for (let k = 0; k < W * H; k++) out[k] = ((mask[k] !== 0) !== !!invert) ? 0 : BIG;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i; let v = out[k]; if (v === 0) continue;
      if (i > 0 && out[k - 1] + d1 < v) v = out[k - 1] + d1;
      if (j > 0) { if (out[k - W] + d1 < v) v = out[k - W] + d1; if (i > 0 && out[k - W - 1] + d2 < v) v = out[k - W - 1] + d2; if (i < W - 1 && out[k - W + 1] + d2 < v) v = out[k - W + 1] + d2; }
      out[k] = v;
    }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i; let v = out[k]; if (v === 0) continue;
      if (i < W - 1 && out[k + 1] + d1 < v) v = out[k + 1] + d1;
      if (j < H - 1) { if (out[k + W] + d1 < v) v = out[k + W] + d1; if (i < W - 1 && out[k + W + 1] + d2 < v) v = out[k + W + 1] + d2; if (i > 0 && out[k + W - 1] + d2 < v) v = out[k + W - 1] + d2; }
      out[k] = v;
    }
    return out;
  }
  function chaikin(pts, it) {
    for (let n = 0; n < it; n++) {
      const o = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      o.push(pts[pts.length - 1]); pts = o;
    }
    return pts;
  }
  function ellipseRing(cx, cz, rx, rz, ang) {
    const r = []; for (let i = 0; i < 28; i++) { const t = i / 28 * Math.PI * 2, a = Math.cos(t) * rx, b = Math.sin(t) * rz; r.push(cx + a * Math.cos(ang) - b * Math.sin(ang), cz + a * Math.sin(ang) + b * Math.cos(ang)); }
    return [r];
  }

  C.buildReal = function (course, idx, diff, opt) {
    const R = BG.Real; if (!R || !R.frame || !R.frame.cols || !R.dem) return null;
    const no = idx + 1, rec = R.holes[course.id] && R.holes[course.id][no]; if (!rec) return null;
    const par = course.pars[idx], yds = course.yds[idx], style = course.style;
    const rng = P.mulberry32(P.hashStr(course.id) + no * 7919);
    const noise = C.Noise(P.hashStr(course.id) * 3 + no);
    const fallbacks = [], notes = rec.note ? rec.note.slice() : [];
    const forest = !!(course.forestHoles && course.forestHoles.indexOf(no) >= 0);

    // ---- frame: tee at origin, x east, z south ----
    const teeE = rec.r[0] / 2, teeN = rec.r[1] / 2;
    const toL = flat => { const o = new Array(flat.length); for (let i = 0; i < flat.length; i += 2) { o[i] = flat[i] / 2 - teeE; o[i + 1] = -(flat[i + 1] / 2 - teeN); } return o; };
    const raw = []; for (let i = 0; i < rec.r.length; i += 2) raw.push([rec.r[i] / 2 - teeE, -(rec.r[i + 1] / 2 - teeN)]);
    const pts = chaikin(raw, 3);
    const path = I.finishPath(pts, 0);
    const L = path.L;
    { const hs = path.headS, he = path.headE; path.theta = Math.atan2(hs[0] * he[1] - hs[1] * he[0], hs[0] * he[0] + hs[1] * he[1]); }
    const hE = path.headE;

    const obDist = forest ? 80 : 115, roughW = style.rough * 0.9, fwBase = style.fw;
    const fwHalf = s => fwBase * 0.9;

    // ---- raster bounds ----
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = path.i0 - 6; i < path.n - 8; i++) { minX = Math.min(minX, path.px[i]); maxX = Math.max(maxX, path.px[i]); minZ = Math.min(minZ, path.pz[i]); maxZ = Math.max(maxZ, path.pz[i]); }
    const margin = obDist + 130;
    minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;
    let res = 1;
    while ((maxX - minX) / res > 1150 || (maxZ - minZ) / res > 1400) res += 0.25;
    if (opt && opt.res) res = opt.res;
    const W = Math.ceil((maxX - minX) / res) + 1, H = Math.ceil((maxZ - minZ) / res) + 1, x0 = minX, z0 = minZ, N = W * H;

    // ---- rasterise OSM polygons ----
    const mk = () => new Uint8Array(N);
    const mGreen = mk(), mTee = mk(), mFw = mk(), mBunk = mk(), mRough = mk(), mWater = mk(), mWood = mk(), mScrub = mk(), mBeach = mk();
    const counts = { green: 0, tee: 0, fairway: 0, bunker: 0, rough: 0, water: 0, wood: 0, scrub: 0, beach: 0 };
    let waterId = 0;
    const own = { g: rec.gi, t: rec.ti };
    for (const fi of rec.f) {
      const pl = R.poly[fi], k = pl[0], rings = pl[1].map(toL);
      switch (k) {
        case K.green: if (fi === own.g) { fillPoly(mGreen, 1, rings, x0, z0, res, W, H); counts.green++; } else fillPoly(mFw, 2, rings, x0, z0, res, W, H); break; // neighbouring greens drawn as short grass
        case K.tee: fillPoly(mTee, fi === own.t ? 2 : 1, rings, x0, z0, res, W, H); counts.tee++; break;
        case K.fairway: fillPoly(mFw, 1, rings, x0, z0, res, W, H); counts.fairway++; break;
        case K.bunker: fillPoly(mBunk, 1, rings, x0, z0, res, W, H); counts.bunker++; break;
        case K.beach: fillPoly(mBeach, 1, rings, x0, z0, res, W, H); counts.beach++; break;
        case K.rough: fillPoly(mRough, 1, rings, x0, z0, res, W, H); counts.rough++; break;
        case K.water: case K.lateral: case K.wetland: if (k !== K.wetland) { waterId = Math.min(250, waterId + 1); fillPoly(mWater, waterId, rings, x0, z0, res, W, H); counts.water++; } break;
        case K.wood: fillPoly(mWood, 1, rings, x0, z0, res, W, H); counts.wood++; break;
        case K.scrub: fillPoly(mScrub, 1, rings, x0, z0, res, W, H); counts.scrub++; break;
      }
    }
    // real-geometry tees: only own tee drawn as tee surface (other tees of the hole are tee surface too)
    // fallbacks for missing pieces
    let realFwCov = 1;
    const gc = [0, 0]; // green centre (local)
    gc[0] = path.end[0]; gc[1] = path.end[1];
    let greenR = style.green * (par === 3 ? 1.08 : 1);
    if (!counts.green) { fallbacks.push('green (ellipse)'); fillPoly(mGreen, 1, ellipseRing(gc[0], gc[1], greenR * 0.95, greenR, Math.atan2(hE[1], hE[0])), x0, z0, res, W, H); }
    if (!counts.tee) { fallbacks.push('tee (plate)'); fillPoly(mTee, 2, ellipseRing(0, 0, 5, 3.2, Math.atan2(path.headS[1], path.headS[0]) + Math.PI / 2), x0, z0, res, W, H); }
    {
      // fairway coverage along the centreline: fill gaps in the OSM mapping with a procedural corridor
      const fw = fwBase * 0.85, s0 = par === 3 ? Math.max(8, L - 62) : 38, s1 = L - 24;
      let tot = 0, hit = 0; const gaps = [];
      for (let s = s0; s < s1; s += 4) { const p = pathAt(path, s), ci = Math.round((p.x - x0) / res), cj = Math.round((p.z - z0) / res); tot++; if (mFw[cj * W + ci] === 1) hit++; else gaps.push(s); }
      const cov = tot ? hit / tot : 0;
      if (cov < 0.9) {
        for (const s of gaps) { const p = pathAt(path, s), w = fw * (1 - 0.3 * smooth(L - 80, L - 12, s)); fillPoly(mFw, 1, ellipseRing(p.x, p.z, Math.max(2, w), 5, Math.atan2(p.hz, p.hx) + Math.PI / 2), x0, z0, res, W, H); }
        fallbacks.push(counts.fairway ? 'fairway gaps (' + Math.round((1 - cov) * 100) + '% of centreline filled procedurally)' : 'fairway (procedural corridor)');
      }
      realFwCov = cov;
    }
    let woodFallback = false;
    if (forest && !counts.wood) { woodFallback = true; fallbacks.push('trees (procedural forest)'); }

    // ---- distance fields ----
    const dGreenOut = dt(mGreen, W, H, res), dGreenIn = dt(mGreen, W, H, res, true);
    const dBunkIn = dt(mBunk, W, H, res, true), dBunkOut = dt(mBunk, W, H, res);
    const dTeeOut = dt(mTee, W, H, res);
    const mPlay = new Uint8Array(N); for (let k = 0; k < N; k++) mPlay[k] = (mFw[k] | mGreen[k] | mTee[k]) ? 1 : 0;
    const dPlay = dt(mPlay, W, H, res);

    // ---- green shape ----
    let gsx = 0, gsz = 0, gn = 0, gpx = 0, gpz = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (mGreen[j * W + i]) { gsx += x0 + i * res; gsz += z0 + j * res; gn++; }
    if (gn) { gc[0] = gsx / gn; gc[1] = gsz / gn; }
    let ra = 0, rb = 0;
    for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) if (mGreen[j * W + i]) { const dx = x0 + i * res - gc[0], dz = z0 + j * res - gc[1]; ra = Math.max(ra, Math.abs(dx * hE[0] + dz * hE[1])); rb = Math.max(rb, Math.abs(-dx * hE[1] + dz * hE[0])); }
    const green = { x: gc[0], z: gc[1], rx: Math.max(ra, 4), rz: Math.max(rb, 4), hx: hE[0], hz: hE[1], ph1: 0, ph2: 0 };
    green.rxw = green.rx; green.rzw = green.rz;
    const tilt = (0.008 + rng() * 0.014) * (style.green > 15 ? 1.25 : 1) * diff.greenSlope, tAng = rng() * Math.PI * 2;
    green.tiltA = Math.cos(tAng) * tilt; green.tiltB = Math.sin(tAng) * tilt;
    green.bumps = [];
    const nb = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < nb; i++) green.bumps.push({ a: (rng() * 2 - 1) * green.rx * 0.6, b: (rng() * 2 - 1) * green.rz * 0.6, amp: (rng() < 0.5 ? -1 : 1) * (0.06 + rng() * 0.16) * diff.greenSlope * (style.green > 15 ? 1.2 : 1), sg: 3.5 + rng() * 3.5 });
    fallbacks.push('green contours (procedural)');
    const tee = { x: 0, z: 0, rx: 5, rz: 3.2 };

    // ---- base elevation raster ----
    const gE = teeE, gN = teeN;
    const wE = x => x + gE, wN = z => -z + gN;
    const Hm = new Float32Array(N), Sm = new Uint8Array(N), Sa = new Float32Array(N), Um = new Float32Array(N), Dd = new Float32Array(N);
    const info = { s: 0, u: 0, d: 0, i: 0 };
    const duneAmp = style.dunes * (forest ? 0.5 : 0.35), rollAmp = 0.5 * style.roll;
    let hint = path.i0;
    for (let j = 0; j < H; j++) {
      const z = z0 + j * res; let rowHint = hint;
      for (let i = 0; i < W; i++) {
        const x = x0 + i * res, k = j * W + i;
        nearest(path, x, z, hint, info); hint = info.i; if (i === 0) rowHint = hint;
        Sa[k] = info.s; Um[k] = info.u; Dd[k] = info.d;
        let h = demAt(wE(x), wN(z));
        const play = smooth(0, 22, dPlay[k]);
        h += noise.fbm(x * 0.03 + 11, z * 0.03 + 5, 3) * rollAmp * (0.3 + 0.7 * play) + play * duneAmp * noise.fbm(x * 0.05 + 3, z * 0.05 + 9, 2);
        Hm[k] = h;
      }
      hint = rowHint;
    }
    // ponds / water hazards: flatten to lowest level in the polygon
    if (waterId) {
      const mn = new Float32Array(waterId + 1).fill(1e9);
      for (let k = 0; k < N; k++) { const w = mWater[k]; if (w && Hm[k] < mn[w]) mn[w] = Hm[k]; }
      for (let k = 0; k < N; k++) { const w = mWater[k]; if (w) Hm[k] = Math.min(Hm[k], mn[w] - 0.5 - 0.8 * smooth(0, 3, 0)); }
    }
    // tee plate, green, bunkers
    let teeY = 0, tn = 0, greenY = 0, gcount = 0;
    for (let k = 0; k < N; k++) { if (mTee[k] === 2) { teeY += Hm[k]; tn++; } if (mGreen[k]) { greenY += Hm[k]; gcount++; } }
    teeY = tn ? teeY / tn : Hm[((-z0 / res) | 0) * W + ((-x0 / res) | 0)];
    greenY = gcount ? greenY / gcount : demAt(wE(gc[0]), wN(gc[1]));
    green.y = greenY; tee.y = teeY + 0.15;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, x = x0 + i * res, z = z0 + j * res;
      let h = Hm[k];
      if (mBunk[k] || dBunkOut[k] < 2.5) {
        const depth = 0.85 + 0.35 * noise.n2(x * 0.1, z * 0.1 + 20);
        const inn = mBunk[k] ? smooth(0, 1.6, dBunkIn[k]) : 0, ring = 1 - smooth(0, 2.5, dBunkOut[k]);
        h -= depth * (mBunk[k] ? 0.25 + 0.75 * inn : 0.22 * ring);
        if (!mBunk[k]) h += 0.12 * Math.exp(-Math.pow((dBunkOut[k] - 1.3) / 0.7, 2)); // rim lip
      }
      if (mTee[k] || dTeeOut[k] < 3) { const w = 1 - smooth(0.2, 3, dTeeOut[k]); if (w > 0) h = lerp(h, teeY, w); }
      if (mGreen[k] || dGreenOut[k] < 3) {
        const w = 1 - smooth(0.2, 3, dGreenOut[k]);
        if (w > 0) {
          const rx = x - green.x, rz = z - green.z, a = rx * green.hx + rz * green.hz, b = -rx * green.hz + rz * green.hx;
          let hg = greenY + green.tiltA * a + green.tiltB * b;
          for (let q = 0; q < green.bumps.length; q++) { const bu = green.bumps[q], da = a - bu.a, db = b - bu.b; hg += bu.amp * Math.exp(-(da * da + db * db) / (2 * bu.sg * bu.sg)); }
          h = lerp(h, hg, w);
        }
      }
      // sea: pull sub-1.5 m ground below the water plane so the shoreline reads
      if (h < 1.5) h = 1.5 - (1.5 - h) * 1.0 - 2.5 * smooth(1.5, 0, h);
      // edge walls (hide the raster edge, inland only)
      const wall = Math.pow(clamp((Dd[k] - obDist - 80) / 90, 0, 1), 1.5);
      if (wall > 0 && h > 3) h += wall * 18;
      Hm[k] = h;
    }

    // ---- surfaces ----
    const gorseSeed = rng() * 100, wobSeed = rng() * 100;
    let waterCells = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, x = x0 + i * res, z = z0 + j * res, h = Hm[k], d = Dd[k];
      let st;
      if (mWater[k] && !mGreen[k] && !mBunk[k]) st = S.WATER;
      else if (h < SEA_Y + 1.5 && !mGreen[k] && !mTee[k]) { st = S.WATER; if (d < 160) waterCells++; }
      else if (d > obDist) st = S.OB;
      else if (mGreen[k]) st = S.GREEN;
      else if (mBunk[k] || mBeach[k]) st = S.SAND;
      else if (mTee[k]) st = S.TEE;
      else if (dGreenOut[k] < 1.4) st = S.FRINGE;
      else if (mFw[k]) st = S.FAIRWAY;
      else {
        const fj = noise.n2(x * 0.09 + wobSeed, z * 0.09) * 1.2;
        if (mRough[k] || dPlay[k] < 7 + fj) st = S.ROUGH;
        else if (mScrub[k]) st = S.GORSE;
        else {
          st = S.DEEP;
          if (!forest && !mWood[k] && style.gorse > 0.05 && dGreenOut[k] > 7) {
            const gnz = noise.fbm(x * 0.04 + gorseSeed, z * 0.04 + gorseSeed * 0.7, 3), thr = 0.5 - style.gorse * 0.62;
            if (gnz > thr && dPlay[k] > 9) st = S.GORSE;
          }
        }
      }
      Sm[k] = st;
    }

    // ---- sampling API ----
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
      const l = Math.sqrt(dx * dx + 1 + dz * dz); o[0] = -dx / l; o[1] = 1 / l; o[2] = -dz / l; return o;
    }
    function surfNow(x, z) {
      const i = Math.round((x - x0) * iw), j = Math.round((z - z0) * iw);
      if (i < 0 || j < 0 || i >= W || j >= H) return S.OB;
      return Sm[j * W + i];
    }

    // ---- pin: inside the green polygon, away from the edge ----
    let maxIn = 0; for (let k = 0; k < N; k++) if (mGreen[k] && dGreenIn[k] > maxIn) maxIn = dGreenIn[k];
    const want = Math.min(4.5, maxIn * 0.7), cands = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (mGreen[k] && dGreenIn[k] >= want) cands.push(k); }
    let pk = cands.length ? cands[(rng() * cands.length) | 0] : -1;
    const pin = pk >= 0 ? { x: x0 + (pk % W) * res, z: z0 + ((pk / W) | 0) * res } : { x: green.x, z: green.z };
    pin.y = hAt(pin.x, pin.z);
    const teeP = { x: 0, z: 0, y: hAt(0, 0) };

    // ---- colour map with baked light ----
    const tex = new Uint8ClampedArray(N * 4);
    const Lx = 0.5, Ly = 0.72, Lz = 0.48, Ll = Math.hypot(Lx, Ly, Lz);
    const CL = { tee: [112, 176, 76], fw: [122, 168, 72], fr: [102, 164, 74], ro: [98, 136, 60], deep: [176, 160, 90], deep2: [128, 126, 66], gorse: [66, 84, 40], sand: [233, 216, 164], green: [88, 182, 88], rock: [140, 122, 98], forest: [84, 82, 48], ob: [160, 148, 88], pond: [64, 108, 126] };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, st = Sm[k], x = x0 + i * res, z = z0 + j * res;
      const il = Math.max(0, i - 1), ir = Math.min(W - 1, i + 1), jt = Math.max(0, j - 1), jb = Math.min(H - 1, j + 1);
      const gx = (Hm[j * W + ir] - Hm[j * W + il]) / ((ir - il) * res), gz = (Hm[jb * W + i] - Hm[jt * W + i]) / ((jb - jt) * res);
      let ex = 1; if (st === S.GREEN || st === S.FRINGE) ex = 3.2;
      const nl = Math.sqrt(gx * gx * ex * ex + 1 + gz * gz * ex * ex);
      const nd = (-gx * ex * Lx + Ly - gz * ex * Lz) / (nl * Ll);
      let lit = 0.5 + 0.62 * Math.max(0, nd);
      const slope = Math.sqrt(gx * gx + gz * gz);
      const nz1 = noise.n2(x * 0.5 + 40, z * 0.5), nz2 = noise.n2(x * 0.13, z * 0.13 + 60), nz3 = noise.n2(x * 1.7, z * 1.7);
      const wood = mWood[k] || (forest && woodFallback);
      let c;
      switch (st) {
        case S.TEE: c = CL.tee; break;
        case S.FAIRWAY: c = CL.fw; lit *= 1 + ((Math.floor(Sa[k] / 9) & 1) ? 0.045 : -0.03); break;
        case S.FRINGE: c = CL.fr; break;
        case S.ROUGH: c = CL.ro; break;
        case S.GREEN: c = CL.green; lit *= 1 + (((Math.floor((Sa[k] + Um[k] * 0.3) / 2.2)) & 1) ? 0.025 : -0.015); break;
        case S.SAND: c = CL.sand; break;
        case S.GORSE: c = CL.gorse; break;
        case S.WATER: c = (mWater[k] && Hm[k] > 2.5) ? CL.pond : CL.rock; break;
        default: c = wood ? CL.forest : (st === S.OB ? CL.ob : CL.deep);
      }
      let r = c[0], g = c[1], b = c[2];
      if (st === S.DEEP || st === S.OB) {
        if (!wood) { const t = clamp(0.5 + nz2 * 0.6, 0, 1); r = lerp(CL.deep2[0], CL.deep[0], t); g = lerp(CL.deep2[1], CL.deep[1], t); b = lerp(CL.deep2[2], CL.deep[2], t); }
        const sandy = slope > 0.55 ? clamp((slope - 0.55) * 2, 0, 1) : 0;
        r = lerp(r, 205, sandy * 0.4); g = lerp(g, 188, sandy * 0.4); b = lerp(b, 140, sandy * 0.4);
      } else if (st === S.GORSE) { const y = nz3 > 0.55 ? (nz3 - 0.55) * 2.2 : 0; r = lerp(r, 196, y); g = lerp(g, 170, y); b = lerp(b, 50, y); }
      else if (st === S.WATER && c === CL.rock) { const sandy = clamp(nz2 * 0.5 + 0.5, 0, 1); r = lerp(138, 190, sandy); g = lerp(120, 170, sandy); b = lerp(98, 128, sandy); }
      if (slope > 1.0 && st !== S.SAND && st !== S.GREEN && st !== S.WATER) { const t = clamp((slope - 1.0) * 1.2, 0, 0.8); r = lerp(r, CL.rock[0], t); g = lerp(g, CL.rock[1], t); b = lerp(b, CL.rock[2], t); }
      lit *= 1 + nz1 * 0.05 + nz3 * (st === S.GREEN ? 0.012 : 0.035);
      if (st === S.SAND) lit *= 1 + nz3 * 0.03;
      const o = k * 4;
      tex[o] = r * lit; tex[o + 1] = g * lit; tex[o + 2] = b * lit; tex[o + 3] = st === S.GREEN ? 28 : st === S.FRINGE ? 80 : st === S.TEE ? 60 : st === S.FAIRWAY ? 130 : st === S.SAND ? 170 : 255;
    }

    // ---- objects ----
    const objs = { gorse: [], trees: [], markers: [] };
    {
      const r2 = P.mulberry32(P.hashStr(course.id) + no * 31 + 5);
      if (!forest && style.gorse > 0.05) {
        const target = Math.round(260 + style.gorse * 700);
        for (let a = 0; a < 40000 && objs.gorse.length < target; a++) {
          const x = x0 + r2() * (W - 1) * res, z = z0 + r2() * (H - 1) * res;
          if (surfNow(x, z) !== S.GORSE) continue;
          objs.gorse.push({ x, z, y: hAt(x, z), sx: 0.9 + r2() * 1.7, sy: 0.55 + r2() * 0.9, c: r2() });
        }
      }
      // trees inside real wood polygons (placement within the polygon is procedural)
      const wantTrees = counts.wood || woodFallback ? 1300 : 0;
      for (let a = 0; a < 90000 && objs.trees.length < wantTrees; a++) {
        const x = x0 + r2() * (W - 1) * res, z = z0 + r2() * (H - 1) * res;
        const ci = Math.round((x - x0) * iw), cj = Math.round((z - z0) * iw), k = cj * W + ci;
        if (!woodFallback && !mWood[k]) continue;
        const st = Sm[k]; if (st !== S.DEEP && st !== S.OB && !(st === S.ROUGH && mWood[k] && dPlay[k] > 3.5)) continue;
        if (dPlay[k] < 5) continue;
        if (dPlay[k] < 14 && r2() < 0.5) continue;
        if (woodFallback && Dd[k] < fwBase * 1.1 + roughW + 6) continue;
        const hh = 9 + r2() * 12;
        objs.trees.push({ x, z, y: hAt(x, z), h: hh, cr: 2.0 + hh * 0.13 + r2() * 0.8, c: r2() });
      }
      [200, 150, 100].forEach((yd, qi) => {
        const sM = L - yd * YD; if (sM < 20) return;
        const p = pathAt(path, sM), rr = [-p.hz, p.hx], w = 11;
        const x = p.x - rr[0] * w, z = p.z - rr[1] * w;
        objs.markers.push({ x, z, y: hAt(x, z), yd, col: [0x2a6ed6, 0xf4f4f4, 0xd83030][qi] });
      });
    }
    if (!counts.bunker) notes.push('no bunkers mapped');
    if (!forest && style.gorse > 0.05 && !counts.scrub) fallbacks.push('gorse (procedural)');

    const tags = [];
    if (Math.abs(path.theta) > 0.2) tags.push(path.theta > 0 ? 'Dogleg right' : 'Dogleg left');
    if (waterCells > 400) tags.push('Pacific Ocean');
    if (objs.trees.length > 500 || forest) tags.push('Forest');
    else if (style.gorse > 0.3) tags.push('Gorse');
    tags.push('Real layout');
    if (par === 3 && tags.length < 3) tags.push('Par 3');
    const coast = waterCells > 400 ? { side: 0, real: true } : null;

    const hole = {
      no, par, yds, L, course, path, green, pin, tee: teeP, fwHalf, roughW, obDist, forest, coast, tags,
      W, H, res, x0, z0, Hm, Sm, tex, bunkers: [], objs, SEA_Y,
      h: hAt, n: normalAt, surf: surfNow,
      trees: objs.trees.length ? new TreeSet(objs.trees) : null,
      pathAt: s => pathAt(path, s),
      real: { osmWay: rec.osm, fairwayCoverage: +realFwCov.toFixed(2), routeYds: Math.round(L / YD), counts, fallbacks, notes, ocean: !!coast },
    };
    hole.nearest = function (x, z) {
      const o = {}; let best = 1e18, bi = path.i0;
      for (let i = 0; i < path.n - 1; i += 4) { const dx = x - path.px[i], dz = z - path.pz[i], d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
      nearest(path, x, z, bi, o); return o;
    };
    hole.relief = function (x, z, kind) {
      const o = hole.nearest(x, z);
      let dx = o.cx - x, dz = o.cz - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let px = x, pz = z, found = false;
      for (let i = 0; i < 400; i++) {
        px += dx; pz += dz; const st = surfNow(px, pz);
        if (st === S.FAIRWAY || st === S.ROUGH || st === S.FRINGE || st === S.TEE || (st === S.DEEP && kind === 'gorse')) { found = true; break; }
      }
      if (!found) return { x: o.cx, z: o.cz };
      for (let i = 0; i < 3; i++) { const nx = px + dx, nz = pz + dz; const st = surfNow(nx, nz); if (st === S.FAIRWAY || st === S.ROUGH || st === S.FRINGE || (st === S.DEEP && kind === 'gorse')) { px = nx; pz = nz; } }
      return { x: px, z: pz };
    };
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
