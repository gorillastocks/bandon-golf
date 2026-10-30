/* Tournament crowd: instanced, animated spectators behind gallery ropes (fairway sides, tees, greens, 18th-green grandstand).
   Off by default (Pause/Main menu toggle, remembered in localStorage 'bg.crowd'); density follows the Graphics level.
   People watch the ball, clap / cheer in sync with BG.Audio.crowd(), and — using a forward simulation of every shot —
   shout "Fore!", duck and scramble away when the ball is heading their way, then wander back to their spot.
   The ball can deflect off them; a ball that finishes in the gallery gets a TV-style free drop. */
(function (root) {
  const BG = root.BG, THREE = root.THREE, P = BG.Phys, S = P.S;
  const KEY = 'bg.crowd';
  let enabled = false; try { enabled = localStorage.getItem(KEY) === '1'; } catch (e) {}
  const DENS = {
    low: { cap: 110, step: 6.5, rows: 1, tee: 8, stand: [3, 8], active: 150 },
    medium: { cap: 340, step: 3.4, rows: 2, tee: 16, stand: [4, 12], active: 200 },
    high: { cap: 800, step: 2.0, rows: 2, tee: 28, stand: [5, 18], active: 260 },
  };
  const IN_OK = {}; IN_OK[S.FAIRWAY] = IN_OK[S.FRINGE] = IN_OK[S.TEE] = IN_OK[S.GREEN] = 1;
  const SPOT_OK = {}; SPOT_OK[S.ROUGH] = SPOT_OK[S.DEEP] = SPOT_OK[S.FAIRWAY] = SPOT_OK[S.FRINGE] = SPOT_OK[S.TEE] = 1;
  const DROP_OK = Object.assign({}, SPOT_OK); DROP_OK[S.GREEN] = 1;
  const IDLE = 0, CLAP = 1, CHEER = 2, ALERT = 3, DUCK = 4, FLEE = 5, RETURN = 6, HIT = 7;
  const SHIRTS = [[0.85, 0.12, 0.12], [0.95, 0.95, 0.95], [0.1, 0.18, 0.45], [0.95, 0.8, 0.15], [0.1, 0.45, 0.2], [0.9, 0.45, 0.6], [0.95, 0.5, 0.1], [0.1, 0.55, 0.6], [0.45, 0.45, 0.5], [0.3, 0.2, 0.55], [0.7, 0.85, 0.95], [0.15, 0.15, 0.17], [0.55, 0.12, 0.2], [0.85, 0.75, 0.6]];
  const PANTS = [[0.1, 0.12, 0.25], [0.55, 0.45, 0.3], [0.35, 0.35, 0.38], [0.08, 0.08, 0.09], [0.85, 0.82, 0.75], [0.3, 0.38, 0.25], [0.22, 0.28, 0.45]];
  const SKINS = [[0.96, 0.78, 0.65], [0.87, 0.66, 0.5], [0.72, 0.52, 0.37], [0.55, 0.37, 0.26], [0.38, 0.25, 0.18], [0.93, 0.72, 0.58]];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TWO_PI = Math.PI * 2;
  const yawFor = (dx, dz) => Math.atan2(-dx, -dz);
  function angDiff(a, b) { let d = (b - a) % TWO_PI; if (d > Math.PI) d -= TWO_PI; if (d < -Math.PI) d += TWO_PI; return d; }

  // ---- shared geometry (one low-poly person built from 7 instanced parts) ----
  let GEO = null, MAT = null;
  function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
  function geoInit() {
    if (GEO) return;
    GEO = {
      leg: box(0.16, 0.86, 0.2, 0, -0.43, 0), torso: box(0.42, 0.6, 0.25, 0, 0.3, 0), arm: box(0.09, 0.56, 0.1, 0, -0.28, 0),
      head: (() => { const g = new THREE.SphereGeometry(0.12, 7, 5); g.scale(1, 1.15, 1); g.translate(0, 0.14, 0); return g; })(),
      hat: (() => { const a = new THREE.CylinderGeometry(0.125, 0.13, 0.075, 8); a.translate(0, 0.25, 0); const b = new THREE.CylinderGeometry(0.17, 0.17, 0.014, 8); b.translate(0, 0.215, -0.1); return mergeGeos([a, b]); })(),
    };
    MAT = mkMat({ color: 0xffffff });
  }
  function mergeGeos(list, colors) {
    let n = 0; const ns = list.map((g) => g.toNonIndexed()); ns.forEach((g) => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = colors ? new Float32Array(n * 3) : null; let o = 0;
    ns.forEach((g, gi) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (col) for (let k = 0; k < g.attributes.position.count; k++) { col[(o + k) * 3] = colors[gi][0]; col[(o + k) * 3 + 1] = colors[gi][1]; col[(o + k) * 3 + 2] = colors[gi][2]; } o += g.attributes.position.count; g.dispose(); });
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3)); return m;
  }

  // ---- state ----
  let group = null, meshes = null, people = [], N = 0, hole = null, lv = 'medium', D = DENS.medium, scene = null;
  let homeHash = new Map(), ropeHash = new Map(), treeHash = new Map();
  let clock = 0, watchUntil = 0, pending = [], last = { ball: { x: 0, y: 0, z: 0 }, phase: '', cx: 0, cz: 0, rx: 1, rz: 0 }, dirty = false;
  let stats = { people: 0, ropes: 0, stand: false, planned: 0, hits: 0, drops: 0, shouts: [] };
  const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _l = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  const hkey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  function hadd(map, cell, x, z, v) { const k = hkey(Math.floor(x / cell), Math.floor(z / cell)); let a = map.get(k); if (!a) map.set(k, (a = [])); a.push(v); }

  function active() { return enabled && !!group && N > 0; }
  function clear() {
    if (group) { if (scene) scene.remove(group); group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.userData.own && o.geometry) o.geometry.dispose(); if (o.userData.own && o.material) o.material.dispose(); }); }
    group = null; meshes = null; people = []; N = 0; homeHash = new Map(); ropeHash = new Map(); treeHash = new Map(); pending = []; hole = null;
    stats.people = 0; stats.ropes = 0; stats.stand = false;
  }

  // ---- placement helpers ----
  function treeNear(x, z, rad) {
    const k = [Math.floor(x / 8), Math.floor(z / 8)];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = treeHash.get(hkey(k[0] + i, k[1] + j)); if (!a) continue; for (let q = 0; q < a.length; q++) { const t = a[q], dx = x - t.x, dz = z - t.z, r = rad + Math.max(0.5, t.cr * 0.45); if (dx * dx + dz * dz < r * r) return true; } }
    return false;
  }
  function slopeOK(x, z) { const h = hole.h; const g = Math.max(Math.abs(h(x + 1, z) - h(x - 1, z)), Math.abs(h(x, z + 1) - h(x, z - 1))) / 2; return g < 0.55; }
  // From (x,z) walk along (dx,dz): leave the playable turf, then return the distance of a rope line `off` m beyond it (or -1 if hazards / bunkers / trees get in the way)
  function castRope(x, z, dx, dz, off, rows) {
    const surf = hole.surf; let r0 = -1;
    for (let r = 0; r <= 60; r++) { if (!IN_OK[surf(x + dx * r, z + dz * r)]) { r0 = r; break; } }
    if (r0 < 3) return -1;
    let rope = r0 + off;
    for (let it = 0; it < 4; it++) {
      let lastSand = -1;
      for (let q = r0; q <= rope + 3; q++) { const st = surf(x + dx * q, z + dz * q); if (st === S.WATER || st === S.OB || st === S.GORSE) return -1; if (st === S.SAND) lastSand = q; }
      if (lastSand < 0) break; rope = lastSand + 4;
    }
    if (rope - r0 > 40) return -1;
    for (let q = rope - 1; q <= rope + 1.5 + rows * 1.2; q += 1) { const px = x + dx * q, pz = z + dz * q; if (!SPOT_OK[surf(px, pz)] || !slopeOK(px, pz)) return -1; }
    return rope;
  }
  function addRopeRun(run) { // run: array of {x,z,nx,nz}
    runs.push(run); run.forEach((s) => hadd(ropeHash, 6, s.x, s.z, s));
  }
  let runs = [], cand = [];
  function ropeSides(x, z, dx, dz, off) { return castRope(x, z, dx, dz, off, D.rows); }
  // generate rope samples along a ray fan / path; each sample: spectators later placed outward (n) of the rope
  function sampleFan(cx, cz, ang0, ang1, off, spacing, skip) {
    let run = [];
    const flush = () => { if (run.length > 1) addRopeRun(run); run = []; };
    // estimate radius from a first pass to keep arc spacing ~ spacing
    for (let a = ang0; a < ang1;) {
      const dx = Math.cos(a), dz = Math.sin(a);
      if (skip && skip(a)) { flush(); a += 0.1; continue; }
      const r = ropeSides(cx, cz, dx, dz, off);
      if (r < 0) { flush(); a += 0.08; continue; }
      const x = cx + dx * r, z = cz + dz * r;
      if (treeNear(x, z, 1.2)) { flush(); a += spacing / r; continue; }
      run.push({ x, z, nx: dx, nz: dz }); a += spacing / r;
    }
    flush();
  }
  function samplePath(h, s0, s1, off, spacing) {
    for (const side of [-1, 1]) {
      let run = [], prevR = -1;
      const flush = () => { if (run.length > 1) { // smooth the lateral wobble
          const rs = run.map((q) => q.r); for (let i = 0; i < run.length; i++) { const a = rs[Math.max(0, i - 1)], b = rs[i], c = rs[Math.min(run.length - 1, i + 1)], m = (a + b + c) / 3, q = run[i]; q.x = q.ox + q.nx * m; q.z = q.oz + q.nz * m; }
          addRopeRun(run); } run = []; };
      for (let s = s0; s < s1; s += spacing) {
        const p = h.pathAt(s), nx = -p.hz * side, nz = p.hx * side;
        const r = ropeSides(p.x, p.z, nx, nz, off);
        if (r < 0) { flush(); continue; }
        const x = p.x + nx * r, z = p.z + nz * r;
        if (treeNear(x, z, 1.2)) { flush(); prevR = -1; continue; }
        if (prevR >= 0 && Math.abs(r - prevR) > 6) flush();
        prevR = r; run.push({ x, z, nx, nz, r, ox: p.x, oz: p.z });
      }
      flush();
    }
  }

  function mkMat(o) { // Standard so it picks up the scene IBL like the terrain/trees (hemi light is off on Medium/High)
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 1, metalness: 0 }, o)); if (scene && scene.userData && scene.userData.envI != null) m.envMapIntensity = scene.userData.envI; return m;
  }
  function makePerson(x, z, yaw, rng, extra) {
    const p = Object.assign({
      hx: x, hz: z, x, z, gy: hole.h(x, z), yaw, homeYaw: yaw, sc: 0.93 + rng() * 0.17, st: IDLE, until: 0, start: 0, ph: rng() * 6.28,
      shirt: SHIRTS[(rng() * SHIRTS.length) | 0], pants: PANTS[(rng() * PANTS.length) | 0], skin: SKINS[(rng() * SKINS.length) | 0], hat: rng() < 0.45 ? (rng() < 0.5 ? SHIRTS[(rng() * SHIRTS.length) | 0] : [0.92, 0.92, 0.9]) : null,
      female: rng() < 0.4, oblivious: rng() < 0.1, seated: false,
      aA: 0, aB: 0, crouch: 0, lean: 0, hop: 0, swing: 0, tx: x, tz: z, releaseAt: 0, dirty: true, speed: 0, hitCd: 0,
    }, extra || {});
    return p;
  }

  // ---- build ----
  function build(h, levelId, sc) {
    clear(); scene = sc || scene; if (!enabled || !h || !scene) return;
    geoInit(); hole = h; lv = levelId in DENS ? levelId : 'medium'; D = DENS[lv]; runs = []; cand = [];
    const rng = P.mulberry32(P.hashStr('crowd' + h.no + (h.course && h.course.name ? h.course.name : '') + h.L));
    if (h.trees) h.trees.trees.forEach((t) => hadd(treeHash, 8, t.x, t.z, t));
    // gallery rope runs: fairway sides, tee surround, green surround
    const L = h.L, pEnd = h.pathAt(L), pStart = h.pathAt(0);
    samplePath(h, 28, L - 55, 7, D.step);
    sampleFan(h.tee.x, h.tee.z, 0, TWO_PI, 5, D.step, (a) => { const f = Math.atan2(pStart.hz, pStart.hx); return Math.abs(angDiff(a, f)) < 1.1; });
    const gx = h.green.x, gz = h.green.z, back = Math.atan2(-pEnd.hz, -pEnd.hx);
    sampleFan(gx, gz, 0, TWO_PI, 9, D.step, (a) => Math.abs(angDiff(a, back)) < 0.75);
    // spectators behind ropes
    const people0 = [];
    runs.forEach((run) => run.forEach((s, i) => {
      for (let row = 0; row < D.rows; row++) {
        if (rng() > 0.92) continue;
        const off = 1.3 + row * 1.25 + rng() * 0.4, tn = (rng() - 0.5) * D.step * 0.7, tx = -s.nz, tz = s.nx;
        const x = s.x + s.nx * off + tx * tn, z = s.z + s.nz * off + tz * tn;
        if (!SPOT_OK[h.surf(x, z)] || treeNear(x, z, 0.6)) continue;
        people0.push([x, z, yawFor(-s.nx + (rng() - 0.5) * 0.7, -s.nz + (rng() - 0.5) * 0.7)]);
      }
    }));
    // trim to the per-level cap (random thinning keeps coverage everywhere)
    let list = people0; const capMain = D.cap;
    if (list.length > capMain) { for (let i = list.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = list[i]; list[i] = list[j]; list[j] = t; } list = list.slice(0, capMain); }
    list.forEach((q) => people.push(makePerson(q[0], q[1], q[2], rng)));
    // grandstand behind the last green
    const lastHole = h.no === 18 || (h.course && h.course.holes && h.no === h.course.holes.length);
    const stand = lastHole ? buildStand(h, rng, pEnd) : null;
    N = people.length;
    group = new THREE.Group(); group.name = 'crowd';
    // ropes mesh
    const rg = buildRopes(h);
    if (rg) { const m = new THREE.Mesh(rg, mkMat({ vertexColors: true })); m.userData.own = true; m.frustumCulled = false; m.receiveShadow = lv === 'high'; group.add(m); }
    if (stand) { stand.userData.own = true; group.add(stand); }
    // instanced parts
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, MAT, Math.max(1, N)); im.frustumCulled = false; im.castShadow = lv === 'high'; im.count = N; group.add(im); return im; };
    meshes = { legL: mk(GEO.leg), legR: mk(GEO.leg), torso: mk(GEO.torso), head: mk(GEO.head), armL: mk(GEO.arm), armR: mk(GEO.arm), hat: mk(GEO.hat) };
    const c = new THREE.Color();
    people.forEach((p, i) => {
      p.i = i; hadd(homeHash, 12, p.hx, p.hz, p);
      c.setRGB(p.pants[0], p.pants[1], p.pants[2]); meshes.legL.setColorAt(i, c); meshes.legR.setColorAt(i, c);
      c.setRGB(p.shirt[0], p.shirt[1], p.shirt[2]); meshes.torso.setColorAt(i, c); meshes.armL.setColorAt(i, c); meshes.armR.setColorAt(i, c);
      c.setRGB(p.skin[0], p.skin[1], p.skin[2]); meshes.head.setColorAt(i, c);
      const hc = p.hat || [1, 1, 1]; c.setRGB(hc[0], hc[1], hc[2]); meshes.hat.setColorAt(i, c);
      writePose(p);
    });
    for (const k in meshes) { meshes[k].instanceMatrix.needsUpdate = true; if (meshes[k].instanceColor) meshes[k].instanceColor.needsUpdate = true; }
    scene.add(group); { const ei = scene.userData && scene.userData.envI; group.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial && ei != null) o.material.envMapIntensity = ei; }); }
    stats.people = N; stats.ropes = runs.reduce((a, r) => a + r.length, 0); stats.stand = !!stand;
    clock = 0; watchUntil = 0;
  }

  function buildRopes(h) {
    const geos = [], cols = [], WH = [0.92, 0.9, 0.85], PO = [0.12, 0.3, 0.16];
    const RY = 0.95, tube = (a, b, w) => { // 4-sided tube between points a and b
      const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = dir.length() || 1; dir.divideScalar(l);
      const g = new THREE.BoxGeometry(w, w, l); g.translate(0, 0, l / 2);
      const qq = new THREE.Quaternion().setFromUnitVectors(AZ, dir);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), qq, new THREE.Vector3(1, 1, 1))); return g;
    };
    runs.forEach((run) => {
      for (let i = 0; i < run.length; i++) {
        const s = run[i], y = h.h(s.x, s.z);
        if (i % Math.max(1, Math.round(5 / D.step)) === 0) { const g = new THREE.CylinderGeometry(0.035, 0.045, 1.05, 5); g.translate(s.x, y + 0.52, s.z); geos.push(g); cols.push(PO); const c = new THREE.SphereGeometry(0.07, 5, 4); c.translate(s.x, y + 1.06, s.z); geos.push(c); cols.push(PO); }
        if (i + 1 < run.length) {
          const t = run[i + 1], d = Math.hypot(t.x - s.x, t.z - s.z); if (d > D.step * 2.6) continue;
          const seg = 3; let prev = [s.x, y + RY, s.z];
          for (let k = 1; k <= seg; k++) { const u = k / seg, x = s.x + (t.x - s.x) * u, z = s.z + (t.z - s.z) * u, yy = h.h(x, z) + RY - Math.sin(u * Math.PI) * 0.12 - (u === 1 ? 0 : 0); const cur = [x, yy, z]; geos.push(tube(prev, cur, 0.035)); cols.push(WH); prev = cur; }
        }
      }
    });
    return geos.length ? mergeGeos(geos, cols) : null;
  }

  function buildStand(h, rng, pEnd) {
    const tiers = D.stand[0], seats = D.stand[1], tw = seats * 0.64 + 1, dep = 1.15, rise = 0.55;
    const gx = h.green.x, gz = h.green.z, base0 = Math.atan2(pEnd.hz, pEnd.hx);
    for (const da of [0, 0.5, -0.5, 1.0, -1.0]) {
      const a = base0 + da, dx = Math.cos(a), dz = Math.sin(a), r = castRope(gx, gz, dx, dz, 8, 1);
      if (r < 0) continue;
      const cx = gx + dx * (r + 3 + (tiers * dep) / 2), cz = gz + dz * (r + 3 + (tiers * dep) / 2), tx = -dz, tz = dx;
      // footprint check
      let ok = true, hmax = -1e9, hmin = 1e9;
      for (let i = -1; i <= 1 && ok; i += 2) for (let j = -1; j <= 1; j += 2) { const x = cx + tx * tw / 2 * i + dx * tiers * dep / 2 * j, z = cz + tz * tw / 2 * i + dz * tiers * dep / 2 * j; if (!SPOT_OK[h.surf(x, z)] && h.surf(x, z) !== S.SAND) ok = false; const y = h.h(x, z); hmax = Math.max(hmax, y); hmin = Math.min(hmin, y); }
      if (!ok || hmax - hmin > 2.4) continue;
      const geos = [], cols = [], STEEL = [0.5, 0.54, 0.6], DARK = [0.2, 0.22, 0.26], WHITE = [0.9, 0.92, 0.95], TEAL = [0.1, 0.4, 0.45];
      const yaw = Math.atan2(dx, dz); // local +Z → stand depth direction (away from green); local X along tangent
      const place = (g, lx, ly, lz) => { g.rotateY(yaw); g.translate(cx + tx * lx + dx * lz, ly, cz + tz * lx + dz * lz); return g; };
      for (let k = 0; k < tiers; k++) { const top = hmax + rise * (k + 1); const g = new THREE.BoxGeometry(tw, top - (hmin - 3), dep); geos.push(place(g, 0, (top + hmin - 3) / 2, (k - (tiers - 1) / 2) * dep)); cols.push(k % 2 ? STEEL : [0.56, 0.6, 0.66]); }
      const topY = hmax + rise * tiers, roofY = topY + 3.0;
      geos.push(place(new THREE.BoxGeometry(tw + 1.2, 0.18, tiers * dep + 1.4), 0, roofY, 0)); cols.push(WHITE);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { geos.push(place(new THREE.BoxGeometry(0.16, roofY - hmin + 3, 0.16), sx * (tw / 2 + 0.3), (roofY + hmin - 3) / 2, sz * (tiers * dep / 2 + 0.1))); cols.push(DARK); }
      geos.push(place(new THREE.BoxGeometry(tw, 0.9, 0.08), 0, topY + 1.2, tiers * dep / 2 + 0.05)); cols.push(TEAL); // back banner
      geos.push(place(new THREE.BoxGeometry(tw, 0.07, 0.07), 0, hmax + rise + 0.95, -(tiers * dep) / 2 - 0.1)); cols.push(DARK); // front rail
      const mesh = new THREE.Mesh(mergeGeos(geos, cols), mkMat({ vertexColors: true }));
      mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = lv !== 'low';
      // seated spectators (facing the green = -dir)
      for (let k = 0; k < tiers; k++) for (let i = 0; i < seats; i++) {
        if (rng() < 0.12) continue;
        const lx = (i - (seats - 1) / 2) * 0.64 + (rng() - 0.5) * 0.08, lz = (k - (tiers - 1) / 2) * dep + 0.05, top = hmax + rise * (k + 1);
        const x = cx + tx * lx + dx * lz, z = cz + tz * lx + dz * lz;
        const p = makePerson(x, z, yawFor(-dx + (rng() - 0.5) * 0.3, -dz + (rng() - 0.5) * 0.3), rng, { seated: true, gy: top - 0.05, oblivious: true });
        people.push(p);
      }
      return mesh;
    }
    return null;
  }

  // ---- posing ----
  function writePose(p) {
    const i = p.i, hipY = p.seated ? 0.5 : 0.86 - p.crouch * 0.42;
    _q.setFromAxisAngle(AY, p.yaw); _p.set(p.x, p.gy + p.hop, p.z); _s.setScalar(p.sc); _r.compose(_p, _q, _s);
    for (let sd = -1; sd <= 1; sd += 2) {
      const rx = p.seated ? 1.45 : sd * p.swing, ys = p.seated ? 1 : 1 - p.crouch * 0.4;
      _q.setFromAxisAngle(AX, rx); _p.set(sd * 0.1, hipY, p.seated ? -0.02 : 0); _s.set(1, ys, 1); _l.compose(_p, _q, _s); _m.multiplyMatrices(_r, _l);
      (sd < 0 ? meshes.legL : meshes.legR).setMatrixAt(i, _m);
    }
    _q.setFromAxisAngle(AX, -p.lean); _p.set(0, hipY, 0); _s.set(1, 1, 1); _l.compose(_p, _q, _s); _t.multiplyMatrices(_r, _l); meshes.torso.setMatrixAt(i, _t);
    _l.makeTranslation(0, 0.6, 0); _m.multiplyMatrices(_t, _l); meshes.head.setMatrixAt(i, _m);
    if (p.hat) meshes.hat.setMatrixAt(i, _m); else { _s.set(0, 0, 0); _p.set(0, -50, 0); _l.compose(_p, _q.identity(), _s); meshes.hat.setMatrixAt(i, _l); }
    for (let sd = -1; sd <= 1; sd += 2) {
      const th = sd * p.aB * (p.aA > 1.57 ? -1 : 1);
      _q.setFromAxisAngle(AX, p.aA); _q2.setFromAxisAngle(AZ, th); _q2.multiply(_q); _p.set(sd * 0.27, 0.54, 0); _s.set(1, 1, 1); _l.compose(_p, _q2, _s); _m.multiplyMatrices(_t, _l);
      (sd < 0 ? meshes.armL : meshes.armR).setMatrixAt(i, _m);
    }
    dirty = true;
  }

  // ---- reactions ----
  let lastGasp = 0, lastVoice = 0;
  function say(kind, p, gain) {
    if (!BG.Audio || !BG.Audio.shout) return;
    const dx = p.x - last.cx, dz = p.z - last.cz, d = Math.hypot(dx, dz) || 1;
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (kind === 'gasp') { if (d > 90 || nowMs - lastGasp < 220) return; lastGasp = nowMs; }
    else if (nowMs - lastVoice < 120) return; else lastVoice = nowMs;
    const pan = Math.max(-1, Math.min(1, (dx * last.rx + dz * last.rz) / d)) * 0.85;
    const g = Math.max(0.1, Math.min(1, 1.15 - d / 220)) * (gain || 1);
    BG.Audio.shout(kind, { pan, gain: g, female: p.female });
    stats.shouts.push(kind); if (stats.shouts.length > 40) stats.shouts.shift();
  }
  function setSt(p, st) { p.st = st; p.dirty = true; }
  function fleeTarget(p, fx, fz, dist) {
    let dx = p.hx - fx, dz = p.hz - fz, l = Math.hypot(dx, dz); if (l < 0.3) { const a = Math.random() * TWO_PI; dx = Math.cos(a); dz = Math.sin(a); l = 1; } dx /= l; dz /= l;
    for (let d = dist; d >= 2; d -= 1) { const x = p.hx + dx * d, z = p.hz + dz * d; if (SPOT_OK[hole.surf(x, z)] && !treeNear(x, z, 0.5)) return [x, z]; }
    return null;
  }
  function trigger(ev) {
    const p = ev.p; if (!p || p.seated) return;
    if (ev.kind === 'alert') { if (p.st === IDLE || p.st === CLAP || p.st === CHEER) { setSt(p, ALERT); p.until = clock + 6; } }
    else if (ev.kind === 'duck') {
      if (p.oblivious) return;
      p.releaseAt = 0; p.duckStart = clock;
      if (ev.flee) { p.tx = ev.flee[0]; p.tz = ev.flee[1]; setSt(p, FLEE); p.speed = 3.3 + Math.random(); } else setSt(p, DUCK);
      if (Math.random() < 0.55) say('gasp', p, 0.7);
    } else if (ev.kind === 'say') say(ev.say, p, ev.gain);
  }
  // simulate the ball forward (same physics) so spectators know where it is heading before it gets there
  function plan(b0, env) {
    if (!active() || b0.putt) return;
    const T = hole, b = Object.assign({}, b0, { events: [] }), e2 = Object.assign({}, env, { rng: () => 0.5 }), dt = 1 / 120, pts = [];
    let t = 0;
    for (let n = 0; n < 6000; n++) {
      P.stepBall(b, dt, e2); t += dt; b.events.length = 0;
      if (n % 10 === 0) pts.push({ t, x: b.x, z: b.z, ya: b.y - T.h(b.x, b.z), roll: b.mode === 'roll' });
      if (b.mode === 'stopped' || b.mode === 'hazard' || b.mode === 'holed' || t > 45) break;
    }
    pts.push({ t, x: b.x, z: b.z, ya: 0, roll: true });
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; pts.forEach((q) => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); });
    const danger = [];
    for (let i = 0; i < N; i++) {
      const p = people[i]; if (p.seated || p.hx < x0 - 16 || p.hx > x1 + 16 || p.hz < z0 - 16 || p.hz > z1 + 16) continue;
      let best = 1e9, bq = null, first = null;
      for (let k = 0; k < pts.length; k++) {
        const q = pts[k], d = Math.hypot(q.x - p.hx, q.z - p.hz), R = q.roll ? 6 : 12;
        if (q.ya > 26) continue;
        if (d < R && !first) first = q; if (d < best) { best = d; bq = q; }
      }
      if (first) danger.push({ p, first, best, bq });
    }
    if (!danger.length) return;
    stats.planned++;
    danger.sort((a, c) => a.first.t - c.first.t);
    const add = (at, ev) => { ev.at = clock + Math.max(0.02, at); pending.push(ev); };
    danger.forEach((dg, idx) => {
      const p = dg.p, tF = dg.first.t, lead = rnd(1.0, 1.7);
      add(tF - lead - 0.8 - rnd(0, 0.4), { kind: 'alert', p });
      let flee = null;
      if (!p.oblivious && dg.best < 9 && Math.random() < 0.65) flee = fleeTarget(p, dg.bq.x, dg.bq.z, Math.max(3, Math.min(9, 12 - dg.best)) * rnd(0.85, 1.2));
      add(tF - lead - rnd(0, 0.35), { kind: 'duck', p, flee });
    });
    // voices: a few spectators nearest the ball's line shout the warning
    const shouters = danger.slice(0, 3);
    shouters.forEach((dg, i) => {
      const tF = dg.first.t;
      if (i === 0) add(Math.max(0.15, tF - rnd(2.4, 3.4)), { kind: 'say', p: dg.p, say: 'fore', gain: 1 });
      if (i === 1) add(Math.max(0.5, tF - rnd(1.6, 2.4)), { kind: 'say', p: dg.p, say: 'lookout', gain: 0.9 });
      if (i === 2) add(Math.max(0.7, tF - rnd(1.2, 2.0)), { kind: 'say', p: dg.p, say: 'fore', gain: 0.8 });
    });
    if (danger.length >= 4) add(Math.max(1, danger[0].first.t - 0.9), { kind: 'say', p: danger[(danger.length / 2) | 0].p, say: 'lookout', gain: 0.8 });
  }

  function shotEnd() {
    if (!active()) return;
    watchUntil = clock + 1.6;
    for (let i = 0; i < N; i++) { const p = people[i]; if (p.st === DUCK || p.st === FLEE || p.st === HIT || p.st === ALERT) p.releaseAt = clock + rnd(1.0, 3.2) + (p.st === ALERT ? 0 : 0.3); }
    pending = pending.filter((e) => e.kind === 'say' ? false : (e.kind !== 'duck' && e.kind !== 'alert'));
  }
  const CHEER_DUR = { polite: 2.6, cheer: 4.2, roar: 5.6, mega: 8 };
  function cheer(tier) {
    if (!active()) return;
    const key = typeof tier === 'number' ? ['', 'polite', 'cheer', 'roar', 'mega'][tier] : tier, dur = CHEER_DUR[key] || 3, clap = key === 'polite';
    const R = key === 'mega' ? 320 : key === 'roar' ? 260 : 200, b = last.ball;
    for (let i = 0; i < N; i++) {
      const p = people[i]; if (!(p.st === IDLE || p.st === ALERT || p.st === CLAP || p.st === CHEER)) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z); if (d > R || (d > 70 && Math.random() < 0.3)) continue;
      p.start = clock + rnd(0, 0.55); p.until = p.start + dur * rnd(0.65, 1.0); setSt(p, clap ? CLAP : CHEER);
    }
    watchUntil = Math.max(watchUntil, clock + dur);
  }

  // ---- ball interaction ----
  function collide(b) {
    if (!active() || (b.mode !== 'flight' && b.mode !== 'roll')) return null;
    const cx = Math.floor(b.x / 12), cz = Math.floor(b.z / 12);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = homeHash.get(hkey(cx + i, cz + j)); if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const p = a[q], dx = b.x - p.x, dz = b.z - p.z;
        if (dx * dx + dz * dz > 0.2 || p.hitCd > clock) continue;
        const top = p.gy + 1.8 * p.sc * (1 - p.crouch * 0.45) - (p.seated ? 0.5 : 0);
        if (b.y < p.gy - 0.05 || b.y > top) continue;
        p.hitCd = clock + 2;
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        if (b.mode === 'flight') { b.vx = -b.vx * 0.14 + (Math.random() - 0.5) * 2.5; b.vz = -b.vz * 0.14 + (Math.random() - 0.5) * 2.5; b.vy = Math.abs(b.vy) * 0.18 + 1.2; }
        else { b.vx *= 0.08; b.vz *= 0.08; }
        b.wx = b.wy = b.wz = 0;
        stats.hits++; b.events.push({ type: 'crowd', p, speed: sp });
        return p;
      }
    }
    return null;
  }
  function onHit(p) {
    if (!p) return;
    setSt(p, HIT); p.until = clock + 1.1; p.releaseAt = 0;
    say(Math.random() < 0.6 ? 'ouch' : 'whoa', p, 1);
    // neighbours gasp
    let n = 0; for (let i = 0; i < N && n < 4; i++) { const o = people[i]; if (o !== p && Math.abs(o.x - p.x) < 7 && Math.abs(o.z - p.z) < 7 && Math.random() < 0.4) { say('gasp', o, 0.7); n++; } }
  }
  function beyondRope(x, z) {
    const cx = Math.floor(x / 6), cz = Math.floor(z / 6); let best = 1e9, bs = null;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const a = ropeHash.get(hkey(cx + i, cz + j)); if (!a) continue; for (let q = 0; q < a.length; q++) { const s = a[q], d = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z); if (d < best) { best = d; bs = s; } } }
    if (!bs || best > 144) return false;
    return (x - bs.x) * bs.nx + (z - bs.z) * bs.nz > -0.3;
  }
  function nearHome(x, z, r) {
    const cx = Math.floor(x / 12), cz = Math.floor(z / 12);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = homeHash.get(hkey(cx + i, cz + j)); if (!a) continue; for (let q = 0; q < a.length; q++) { const p = a[q]; if ((x - p.hx) * (x - p.hx) + (z - p.hz) * (z - p.hz) < r * r) return true; } }
    return false;
  }
  // TV-style free drop: returns {x,z} (nearest clear turf toward the fairway) when the ball finished in the gallery, else null
  function dropFor(x, z) {
    if (!active() || !(beyondRope(x, z) || nearHome(x, z, 2.4))) return null;
    const o = hole.nearest(x, z); let dx = o.cx - x, dz = o.cz - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let i = 0; i <= 90; i++) { const px = x + dx * i, pz = z + dz * i; if (!DROP_OK[hole.surf(px, pz)] || beyondRope(px, pz) || nearHome(px, pz, 4.5)) continue; stats.drops++; return { x: px, z: pz }; }
    return null;
  }

  // ---- per frame ----
  function update(dt, simDt, ctx) {
    if (!active()) return;
    clock += simDt; last.ball = ctx.ball; last.phase = ctx.phase;
    const cam = ctx.camera, cp = cam.position; last.cx = cp.x; last.cz = cp.z;
    const e = cam.matrixWorld.elements; last.rx = e[0]; last.rz = e[2]; { const l = Math.hypot(last.rx, last.rz) || 1; last.rx /= l; last.rz /= l; }
    if (pending.length) { for (let i = pending.length - 1; i >= 0; i--) { if (pending[i].at <= clock) { const ev = pending[i]; pending.splice(i, 1); trigger(ev); } } }
    const watching = ctx.phase === 'ball' || clock < watchUntil, bx = ctx.ball.x, bz = ctx.ball.z, act2 = D.active * D.active, kT = 1 - Math.exp(-dt * 10), kY = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < N; i++) {
      const p = people[i]; let ta = 0, tb = 0, tc = 0, tl = 0, th = 0, sw = 0, ty = p.homeYaw, anim = false;
      switch (p.st) {
        case IDLE: if (watching && Math.abs(p.x - bx) < 150 && Math.abs(p.z - bz) < 150) ty = yawFor(bx - p.x, bz - p.z); break;
        case CLAP: if (clock < p.start) break; if (clock > p.until) { setSt(p, IDLE); break; } ta = 1.3; tb = -0.1 - 0.28 * (0.5 + 0.5 * Math.sin(clock * 11 + p.ph)); anim = true; ty = yawFor(bx - p.x, bz - p.z); break;
        case CHEER: if (clock < p.start) break; if (clock > p.until) { setSt(p, IDLE); break; } ta = 3.0 + 0.15 * Math.sin(clock * 9 + p.ph); tb = 0.3 + 0.25 * Math.sin(clock * 7 + p.ph); p.hop = p.seated ? 0 : Math.max(0, Math.sin(clock * 8 + p.ph)) * 0.1; anim = true; ty = yawFor(bx - p.x, bz - p.z); break;
        case ALERT: ty = yawFor(bx - p.x, bz - p.z); tl = 0.08; if (p.releaseAt && clock > p.releaseAt) setSt(p, IDLE); else if (clock > p.until) setSt(p, IDLE); break;
        case DUCK: tc = 1; tl = 0.55; ta = 2.5; tb = 0.5; ty = yawFor(bx - p.x, bz - p.z); if ((p.releaseAt && clock > p.releaseAt) || clock > p.duckStart + 14) { if (Math.hypot(p.x - p.hx, p.z - p.hz) > 0.25) { setSt(p, RETURN); p.speed = 1.7; } else setSt(p, IDLE); } break;
        case FLEE: case RETURN: {
          const gx = p.st === FLEE ? p.tx : p.hx, gz = p.st === FLEE ? p.tz : p.hz, dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz), st = Math.min(d, p.speed * simDt0(simDt, dt));
          if (d < 0.08) { if (p.st === FLEE) setSt(p, DUCK); else { p.x = p.hx; p.z = p.hz; p.gy = p.seated ? p.gy : hole.h(p.x, p.z); setSt(p, IDLE); } break; }
          p.x += dx / d * st; p.z += dz / d * st; p.gy = hole.h(p.x, p.z); ty = yawFor(dx, dz); anim = true;
          const run = p.st === FLEE; sw = Math.sin(clock * (run ? 14 : 8) + p.ph) * (run ? 0.8 : 0.45); ta = run ? 0.4 : 0.1; tb = 0.1; tl = run ? 0.25 : 0.05; p.hop = Math.abs(Math.sin(clock * (run ? 14 : 8) + p.ph)) * (run ? 0.07 : 0.03); break;
        }
        case HIT: tl = 0.5; ta = 2.0; tb = 0.2; tc = 0.5; if (clock > p.until) { setSt(p, DUCK); p.duckStart = clock; if (!p.releaseAt && last.phase !== 'ball') p.releaseAt = clock + rnd(0.8, 2); } anim = true; break;
        default: break;
      }
      if (p.st === IDLE || p.st === ALERT || p.st === CLAP) p.hop *= 0.8;
      // ease pose toward targets
      const nA = p.aA + (ta - p.aA) * kT, nB = p.aB + (tb - p.aB) * kT, nC = p.crouch + (tc - p.crouch) * kT, nL = p.lean + (tl - p.lean) * kT;
      const dy = angDiff(p.yaw, ty), nY = p.yaw + dy * kY;
      const chg = Math.abs(nA - p.aA) + Math.abs(nB - p.aB) + Math.abs(nC - p.crouch) + Math.abs(nL - p.lean) + Math.abs(dy);
      p.aA = nA; p.aB = nB; p.crouch = nC; p.lean = nL; p.yaw = nY; p.swing = sw;
      if (chg > 0.002 || anim || p.dirty) {
        const dx = p.x - cp.x, dz = p.z - cp.z;
        if (dx * dx + dz * dz < act2) { writePose(p); p.dirty = false; } else p.dirty = true;
      }
    }
    if (dirty) { for (const k in meshes) meshes[k].instanceMatrix.needsUpdate = true; dirty = false; }
  }
  function simDt0(simDt, dt) { return simDt; }

  function setEnabled(v) { enabled = !!v; try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {} if (!enabled) clear(); }
  BG.Crowd = {
    isEnabled: () => enabled, setEnabled, active, build, clear, update, plan, shotEnd, cheer, collide, onHit, dropFor, beyondRope,
    stats: () => Object.assign({}, stats, { n: N, pending: pending.length }),
    _people: () => people,
  };
})(typeof window !== 'undefined' ? window : globalThis);
