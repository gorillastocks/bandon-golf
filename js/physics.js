/* Ball flight, bounce, roll and wind physics (SI units internally). */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const G = 9.81, R = 0.02135, M = 0.04593, RHO = 1.2, AREA = Math.PI * R * R, KI = 0.4;
  const MPH = 0.44704, YD = 0.9144, FT = 0.3048, RPM = Math.PI / 30;
  const S = { TEE: 1, FAIRWAY: 2, FRINGE: 3, ROUGH: 4, DEEP: 5, SAND: 6, GREEN: 7, WATER: 8, OB: 9, GORSE: 10 };
  const SURF_NAME = { 1: 'Tee box', 2: 'Fairway', 3: 'Fringe', 4: 'Rough', 5: 'Deep native', 6: 'Bunker', 7: 'Green', 8: 'Water', 9: 'Out of bounds', 10: 'Gorse' };
  // e: normal restitution, mu: impact friction, roll: rolling resistance, loss: extra tangential loss at impact
  const SP = [];
  SP[S.TEE] = { e: 0.32, mu: 0.5, roll: 0.17, loss: 0.2 };
  SP[S.FAIRWAY] = { e: 0.32, mu: 0.5, roll: 0.17, loss: 0.2 };
  SP[S.FRINGE] = { e: 0.28, mu: 0.55, roll: 0.15, loss: 0.25 };
  SP[S.ROUGH] = { e: 0.20, mu: 0.7, roll: 0.45, loss: 0.42 };
  SP[S.DEEP] = { e: 0.08, mu: 0.8, roll: 0.95, loss: 0.7 };
  SP[S.SAND] = { e: 0.02, mu: 0.9, roll: 1.8, loss: 0.88 };
  SP[S.GREEN] = { e: 0.26, mu: 0.55, roll: 0.056, loss: 0.1 };
  SP[S.GORSE] = { e: 0.05, mu: 0.9, roll: 2.0, loss: 0.9 };
  SP[S.WATER] = SP[S.OB] = SP[S.DEEP];

  // ---------- small utils ----------
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---------- wind ----------
  function Wind(o) {
    const rng = mulberry32(o.seed || 1);
    this.base = o.mph * MPH; this.gust = o.gust; this.dir = o.dir; this.dirVar = (o.dirVar || 0) * Math.PI / 180;
    this.ph = []; for (let i = 0; i < 8; i++) this.ph.push(rng() * 6.283);
    this.t = 0; this.refresh();
  }
  Wind.prototype.noise = function (t, k) { const p = this.ph, o = k * 4; return (Math.sin(t * 0.37 + p[o]) * 0.5 + Math.sin(t * 0.93 + p[o + 1]) * 0.3 + Math.sin(t * 1.71 + p[o + 2]) * 0.2); };
  Wind.prototype.refresh = function () {
    const g = this.noise(this.t, 0) * 0.5 + 0.5 * Math.abs(this.noise(this.t * 1.7 + 3, 1));
    this.speed = Math.max(0, this.base * (1 + this.gust * (g * 1.6 - 0.35)));
    this.angle = this.dir + this.dirVar * this.noise(this.t * 0.4, 1);
    this.vx = Math.cos(this.angle) * this.speed; this.vz = Math.sin(this.angle) * this.speed;
  };
  Wind.prototype.update = function (dt) { this.t += dt; this.refresh(); };
  Wind.prototype.at = function (h) { const f = clamp(Math.pow(Math.max(h, 0.3) / 10, 0.2), 0.5, 1.45); return [this.vx * f, this.vz * f]; };
  Wind.prototype.mph = function () { return this.speed / MPH; };

  // ---------- clubs ----------
  // carry: target full-swing carry in yards on flat ground, no wind
  const CLUBS = [
    { id: 'DR', name: 'Driver', carry: 250, launch: 12.0, spin: 2650, disp: 1.0, type: 'wood', rough: 0.55 },
    { id: '3W', name: '3 Wood', carry: 228, launch: 12.5, spin: 3300, disp: 0.95, type: 'wood', rough: 0.6 },
    { id: '5W', name: '5 Wood', carry: 212, launch: 13.5, spin: 3900, disp: 0.9, type: 'wood', rough: 0.68 },
    { id: '4I', name: '4 Iron', carry: 192, launch: 14.5, spin: 4400, disp: 0.85, type: 'iron', rough: 0.75 },
    { id: '5I', name: '5 Iron', carry: 180, launch: 15.5, spin: 4900, disp: 0.8, type: 'iron', rough: 0.8 },
    { id: '6I', name: '6 Iron', carry: 168, launch: 17.0, spin: 5500, disp: 0.77, type: 'iron', rough: 0.83 },
    { id: '7I', name: '7 Iron', carry: 156, launch: 18.5, spin: 6200, disp: 0.74, type: 'iron', rough: 0.86 },
    { id: '8I', name: '8 Iron', carry: 144, launch: 20.5, spin: 7000, disp: 0.7, type: 'iron', rough: 0.88 },
    { id: '9I', name: '9 Iron', carry: 132, launch: 23.0, spin: 7800, disp: 0.66, type: 'iron', rough: 0.9 },
    { id: 'PW', name: 'Pitching Wedge', carry: 118, launch: 26.0, spin: 8600, disp: 0.6, type: 'wedge', rough: 0.92 },
    { id: 'GW', name: 'Gap Wedge', carry: 102, launch: 28.5, spin: 9000, disp: 0.55, type: 'wedge', rough: 0.93 },
    { id: 'SW', name: 'Sand Wedge', carry: 86, launch: 32.0, spin: 9300, disp: 0.5, type: 'wedge', rough: 0.94 },
    { id: 'LW', name: 'Lob Wedge', carry: 68, launch: 38.0, spin: 9500, disp: 0.5, type: 'wedge', rough: 0.95 },
    { id: 'PT', name: 'Putter', carry: 0, launch: 0, spin: 0, disp: 0.3, type: 'putter', rough: 1 },
  ];

  function flatTerrain() { return { h: () => 0, n: (x, z, o) => { o[0] = 0; o[1] = 1; o[2] = 0; return o; }, surf: () => S.FAIRWAY }; }

  // ---------- flight / bounce / roll ----------
  function newBall(x, y, z) {
    return { x, y, z, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, mode: 'flight', t: 0, bounces: 0, landed: false, land: null,
      maxY: y, start: { x, y, z }, hazard: null, hazardPos: null, rest: 0, treeCd: 0, events: [], holed: false, lastGood: { x, z }, dist: 0 };
  }
  const _n = [0, 1, 0];

  function stepFlight(b, dt, env) {
    const T = env.terrain;
    let wx = 0, wz = 0;
    if (env.wind) { const w = env.wind.at(b.y - T.h(b.x, b.z)); wx = w[0]; wz = w[1]; }
    const rx = b.vx - wx, ry = b.vy, rz = b.vz - wz;
    const sp = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-6;
    const wm = Math.sqrt(b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
    const Sp = R * wm / sp;
    let Cd = 0.215 + 0.2 * Math.min(Sp, 0.5) + 0.35 * Math.max(0, (28 - sp) / 28);
    let Cl = wm > 1 ? Math.min(0.33, 0.5 * Math.pow(Sp, 0.45)) : 0;
    const k = 0.5 * RHO * AREA / M;
    let ax = -k * Cd * sp * rx, ay = -G - k * Cd * sp * ry, az = -k * Cd * sp * rz;
    if (Cl > 0) {
      const ox = b.wx / wm, oy = b.wy / wm, oz = b.wz / wm;
      const cx = oy * rz - oz * ry, cy = oz * rx - ox * rz, cz = ox * ry - oy * rx;
      ax += k * Cl * sp * cx; ay += k * Cl * sp * cy; az += k * Cl * sp * cz;
    }
    b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const dec = 1 - 0.05 * dt; b.wx *= dec; b.wy *= dec; b.wz *= dec;
    b.t += dt; if (b.y > b.maxY) b.maxY = b.y;
    if (env.trees && b.treeCd <= 0) treeCollide(b, env, T);
    else b.treeCd -= dt;
    const gh = T.h(b.x, b.z);
    if (b.y - R <= gh && b.vy < 5) contact(b, env, gh);
  }

  function treeCollide(b, env, T) {
    const tr = env.trees.query(b.x, b.z, b.y - T.h(b.x, b.z));
    if (!tr) return;
    const rng = env.rng || Math.random;
    const sp = Math.hypot(b.vx, b.vz);
    b.vx = -b.vx * 0.12 + (rng() - 0.5) * 3; b.vz = -b.vz * 0.12 + (rng() - 0.5) * 3;
    b.vy = Math.min(b.vy, 0) * 0.3; b.wx = b.wy = b.wz = 0; b.treeCd = 0.25;
    b.events.push({ type: 'tree', speed: sp });
  }

  function hazardHit(b, kind) { b.mode = 'hazard'; b.hazard = kind; b.hazardPos = { x: b.x, z: b.z }; b.vx = b.vy = b.vz = 0; b.events.push({ type: kind }); }

  function contact(b, env, gh) {
    const T = env.terrain;
    T.n(b.x, b.z, _n);
    const nx = _n[0], ny = _n[1], nz = _n[2];
    b.y = gh + R;
    let vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn >= 0) return;
    let surf = T.surf(b.x, b.z);
    if (!b.landed) {
      b.landed = true;
      b.land = { x: b.x, y: b.y, z: b.z, t: b.t, surf, speed: Math.hypot(b.vx, b.vy, b.vz), carry: Math.hypot(b.x - b.start.x, b.z - b.start.z) };
    }
    if (surf === S.WATER || surf === S.OB) { hazardHit(b, surf === S.WATER ? 'water' : 'ob'); return; }
    if (surf === S.GORSE) { if (env.rules && env.rules.gorsePenalty) { hazardHit(b, 'gorse'); return; } surf = S.DEEP; }
    const p = SP[surf];
    const impact = -vn;
    if (surf === S.GREEN && env.cup) cupCheck(b, env);
    if (b.holed) return;
    let vtx = b.vx - nx * vn, vty = b.vy - ny * vn, vtz = b.vz - nz * vn;
    if (impact < 1.3) { b.vx = vtx; b.vy = vty; b.vz = vtz; b.mode = 'roll'; b.wx = b.wy = b.wz = 0; return; }
    const e = p.e * (impact > 25 ? 0.85 : 1);
    // contact-point velocity: u = vt + w x rc, rc = -n*R
    const wcx = b.wy * nz - b.wz * ny, wcy = b.wz * nx - b.wx * nz, wcz = b.wx * ny - b.wy * nx;
    const ux = vtx - R * wcx, uy = vty - R * wcy, uz = vtz - R * wcz;
    const us = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (us > 1e-5) {
      const uhx = ux / us, uhy = uy / us, uhz = uz / us;
      const Jn = (1 + e) * impact;
      const j = Math.min(p.mu * Jn, us / (1 + 1 / KI));
      vtx -= uhx * j; vty -= uhy * j; vtz -= uhz * j;
      // dw = (n x uh) * j / (KI*R)
      const cx = ny * uhz - nz * uhy, cy = nz * uhx - nx * uhz, cz = nx * uhy - ny * uhx;
      const f = j / (KI * R);
      b.wx += cx * f; b.wy += cy * f; b.wz += cz * f;
    }
    const keep = 1 - p.loss;
    vtx *= keep; vty *= keep; vtz *= keep;
    const vnn = e * impact;
    b.vx = vtx + nx * vnn; b.vy = vty + ny * vnn; b.vz = vtz + nz * vnn;
    b.bounces++;
    if (vnn < 0.9) { b.vx = vtx; b.vy = vty; b.vz = vtz; b.mode = 'roll'; b.wx = b.wy = b.wz = 0; }
    b.events.push({ type: 'bounce', speed: impact, surf });
  }

  function cupCheck(b, env) {
    const c = env.cup;
    const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
    const sp = Math.hypot(b.vx, b.vz);
    const cs = env.capScale || 1;
    if (d < 0.054 * cs + 0.01 && sp < 1.7 * cs) { b.holed = true; b.mode = 'holed'; b.x = c.x; b.z = c.z; b.vx = b.vy = b.vz = 0; b.events.push({ type: 'holed' }); return true; }
    if (d < 0.054 && sp < 2.4 && !b.lip) { b.lip = true; // lip out: deflect
      const a = (Math.random() - 0.5) * 1.6; const cs2 = Math.cos(a), sn = Math.sin(a);
      const nvx = b.vx * cs2 - b.vz * sn, nvz = b.vx * sn + b.vz * cs2; b.vx = nvx * 0.7; b.vz = nvz * 0.7; b.events.push({ type: 'lip' });
    }
    return false;
  }

  function stepRoll(b, dt, env) {
    const T = env.terrain;
    T.n(b.x, b.z, _n);
    let nx = _n[0], ny = _n[1], nz = _n[2];
    const surf = T.surf(b.x, b.z);
    if (surf === S.WATER || surf === S.OB) { hazardHit(b, surf === S.WATER ? 'water' : 'ob'); return; }
    if (surf === S.GORSE) { if (env.rules && env.rules.gorsePenalty) { hazardHit(b, 'gorse'); return; } }
    const p = SP[surf === S.GORSE ? S.DEEP : surf];
    const mu = surf === S.GREEN ? (env.greenRoll || 0.056) : p.roll;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    b.vx -= nx * vn; b.vy -= ny * vn; b.vz -= nz * vn;
    // tangential gravity
    const gx = G * ny * nx, gy = -G + G * ny * ny, gz = G * ny * nz;
    const gt = Math.hypot(gx, gy, gz);
    b.vx += gx * dt; b.vy += gy * dt; b.vz += gz * dt;
    let sp = Math.hypot(b.vx, b.vy, b.vz);
    const cq = surf === S.GREEN || surf === S.FRINGE ? 0.07 : 0.02;
    const red = (mu * G * ny + cq * sp * sp) * dt;
    if (sp <= red) { b.vx = b.vy = b.vz = 0; sp = 0; } else { const f = (sp - red) / sp; b.vx *= f; b.vy *= f; b.vz *= f; sp -= red; }
    if (sp < 0.02 && gt <= mu * G * 1.0) { b.rest += dt; if (b.rest > 0.2) { b.mode = 'stopped'; b.vx = b.vy = b.vz = 0; return; } } else b.rest = 0;
    const px = b.x, py = b.y, pz = b.z;
    b.x += b.vx * dt; b.z += b.vz * dt; b.t += dt;
    if (surf === S.GREEN && env.cup && cupCheck(b, env)) return;
    const gh = T.h(b.x, b.z);
    const yb = py + (b.vy - 0.5 * G * dt) * dt;
    if (yb > gh + R + 0.035 && sp > 1.2) { b.y = yb; b.vy -= G * dt; b.mode = 'flight'; b.wx = b.wy = b.wz = 0; b.events.push({ type: 'airborne' }); }
    else b.y = gh + R;
    b.dist += Math.hypot(b.x - px, b.z - pz);
    if (env.trees && b.treeCd <= 0) treeCollide(b, env, T); else b.treeCd -= dt;
    if (surf !== S.SAND && surf !== S.GORSE && surf !== S.DEEP && surf !== S.WATER && surf !== S.OB) { b.lastGood.x = b.x; b.lastGood.z = b.z; }
  }

  function stepBall(b, dt, env) {
    if (b.mode === 'flight') stepFlight(b, dt, env);
    else if (b.mode === 'roll') stepRoll(b, dt, env);
  }

  // ---------- launching ----------
  // returns initial state set on ball b. shot: {club, power(0..1.1), yaw(rad, + = right), mods:{speed,launch,spin,side,sideSpin}}
  function launch(b, shot) {
    const c = shot.club, m = shot.mods || {};
    if (c.type === 'putter') {
      const d = shot.puttDist; // metres on flat
      const mu = shot.rollMu || 0.056;
      const cq = 0.07, v0 = Math.sqrt((mu * G / cq) * (Math.exp(2 * cq * Math.max(d, 0.05)) - 1));
      b.mode = 'roll'; b.vx = Math.sin(shot.yaw) * v0; b.vz = -Math.cos(shot.yaw) * v0; b.vy = 0; b.putt = true;
      b.v0 = v0; b.launch = 0; b.spinRpm = 0;
      return b;
    }
    const pw = clamp(shot.power, 0.02, 1.15);
    const sf = Math.pow(pw, 0.55);
    const v0 = c.v * sf * (m.speed || 1);
    const la = (c.launch + (m.launch || 0)) * Math.PI / 180;
    const yaw = shot.yaw + (m.yaw || 0);
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    b.vx = fx * Math.cos(la) * v0; b.vy = Math.sin(la) * v0; b.vz = fz * Math.cos(la) * v0;
    const back = c.spin * sf * (m.spin == null ? 1 : m.spin) * RPM;
    b.wx = -fz * back; b.wz = fx * back; b.wy = (m.sideSpin || 0) * RPM;
    b.v0 = v0; b.launch = la * 180 / Math.PI; b.spinRpm = back / RPM; b.mode = 'flight';
    return b;
  }

  function flatCarry(club, v) {
    const b = newBall(0, R, 0);
    launch(b, { club: Object.assign({}, club, { v }), power: 1, yaw: 0 });
    const env = { terrain: flatTerrain() };
    for (let i = 0; i < 4000; i++) { stepFlight(b, 1 / 240, env); if (b.landed) break; }
    return b.land ? -b.land.z / YD : 0;
  }
  function calibrate() {
    CLUBS.forEach(c => {
      if (c.type === 'putter') { c.v = 0; return; }
      let lo = 10, hi = 90;
      for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (flatCarry(c, mid) < c.carry) lo = mid; else hi = mid; }
      c.v = (lo + hi) / 2;
    });
  }
  calibrate();

  // ---------- intentional shot shaping (right-handed golfer) ----------
  // shape: -2 Big Draw, -1 Draw, 0 Straight, 1 Fade, 2 Big Fade. A draw starts right of the aim line and curves left (+yaw, +sideSpin);
  // a fade starts left and curves right. The start yaw and the side spin are solved per club and power on flat ground with no wind,
  // so the ball finishes on the aim line at carry distance: the curve (start line to landing) is 12 yd for a driver draw, scaling with
  // (carry/250)^1.5, so a 7-iron draw is ~6 yd and wedges 2-4 yd. Big shapes double it. A draw flies slightly lower with less backspin
  // (more rollout); a fade flies slightly higher with more backspin (softer landing).
  const SHAPES = {
    '-2': { name: 'Big Draw', dir: 1, mag: 2, dl: -1.3, ds: 0.85 }, '-1': { name: 'Draw', dir: 1, mag: 1, dl: -0.7, ds: 0.92 },
    '0': { name: 'Straight', dir: 0, mag: 0, dl: 0, ds: 1 },
    '1': { name: 'Fade', dir: -1, mag: 1, dl: 0.8, ds: 1.08 }, '2': { name: 'Big Fade', dir: -1, mag: 2, dl: 1.5, ds: 1.16 },
  };
  const SHAPE_BASE_YD = 12, SHAPE_POW = [0.3, 0.5, 0.7, 0.85, 1.0, 1.15];
  function shapeLand(club, p, yaw, mods) {
    const b = newBall(0, R, 0); launch(b, { club, power: p, yaw: 0, mods: Object.assign({ speed: 1, launch: 0, spin: 1, yaw, sideSpin: 0 }, mods) });
    const env = { terrain: flatTerrain() };
    for (let i = 0; i < 4000 && !b.landed; i++) stepFlight(b, 1 / 240, env);
    return b.land ? { x: b.land.x / YD, z: -b.land.z / YD } : { x: 0, z: 0 };
  }
  const _shapeCal = {};
  function shapeCal(club, shape) {
    const key = club.id + ':' + shape; if (_shapeCal[key]) return _shapeCal[key];
    const d = SHAPES[shape], rows = [];
    for (const p of SHAPE_POW) {
      const m = { launch: d.dl, spin: d.ds }, L = shapeLand(club, p, 0, m).z, C = SHAPE_BASE_YD * Math.pow(L / 250, 1.5) * d.mag;
      const yaw = d.dir * Math.asin(clamp(C / Math.max(L, 1), 0, 0.5));
      // side spin that brings the landing back onto the aim line (landing x is ~linear in side spin)
      let s0 = d.dir * C * 25, x0 = shapeLand(club, p, yaw, Object.assign({ sideSpin: s0 }, m)).x, s1 = s0 * 1.25 + d.dir * 5, x1 = shapeLand(club, p, yaw, Object.assign({ sideSpin: s1 }, m)).x;
      for (let i = 0; i < 4 && Math.abs(x1) > 0.05 && x1 !== x0; i++) { const s2 = s1 - x1 * (s1 - s0) / (x1 - x0); s0 = s1; x0 = x1; s1 = s2; x1 = shapeLand(club, p, yaw, Object.assign({ sideSpin: s1 }, m)).x; }
      rows.push({ yaw, sideSpin: s1 });
    }
    return (_shapeCal[key] = rows);
  }
  // launch modifiers for an intentional shape; add yaw/sideSpin/launch to the shot's mods and multiply spin
  function shapeMods(club, shape, power) {
    const d = SHAPES[shape];
    if (!d || !shape || club.type === 'putter' || !club.v) return { yaw: 0, sideSpin: 0, launch: 0, spin: 1 };
    const rows = shapeCal(club, shape), pw = clamp(power, SHAPE_POW[0], SHAPE_POW[SHAPE_POW.length - 1]);
    let i = 0; while (i < SHAPE_POW.length - 2 && pw > SHAPE_POW[i + 1]) i++;
    const t = (pw - SHAPE_POW[i]) / (SHAPE_POW[i + 1] - SHAPE_POW[i]), a = rows[i], b = rows[i + 1];
    return { yaw: lerp(a.yaw, b.yaw, t), sideSpin: lerp(a.sideSpin, b.sideSpin, t), launch: d.dl, spin: d.ds };
  }

  // trajectory preview: simulate to first landing
  function preview(b0, env, shot, maxT) {
    const b = newBall(b0.x, b0.y, b0.z);
    launch(b, shot);
    const pts = [[b.x, b.y, b.z]];
    const dt = 1 / 120;
    let n = 0;
    const penv = { terrain: env.terrain, wind: env.wind, rules: env.rules, cup: null };
    while (!b.landed && b.t < (maxT || 10) && n < 1500) { stepFlight(b, dt, penv); n++; if (n % 6 === 0) pts.push([b.x, b.y, b.z]); }
    pts.push([b.x, b.y, b.z]);
    return { pts, land: b.land, apex: b.maxY - b0.y, t: b.t };
  }
  function putPreview(b0, env, shot) {
    const b = newBall(b0.x, b0.y, b0.z);
    launch(b, shot);
    const pts = [[b.x, b.y, b.z]];
    const penv = { terrain: env.terrain, rules: env.rules, cup: env.cup, greenRoll: env.greenRoll, capScale: env.capScale };
    const dt = 1 / 120;
    for (let i = 0; i < 120 * 12 && b.mode === 'roll'; i++) { stepRoll(b, dt, penv); if (i % 6 === 0) pts.push([b.x, b.y, b.z]); }
    pts.push([b.x, b.y, b.z]);
    return { pts, end: { x: b.x, z: b.z }, holed: b.holed };
  }

  BG.Phys = { G, R, M, YD, FT, MPH, S, SURF_NAME, SP, CLUBS, Wind, newBall, stepBall, stepFlight, stepRoll, launch, preview, putPreview, flatTerrain, mulberry32, hashStr, clamp, lerp, smooth, gauss, flatCarry, RPM, SHAPES, shapeMods };
})(typeof window !== 'undefined' ? window : globalThis);
