/* Abandoned Dunes — game engine: rendering, input, shot logic, HUD. */
(function () {
  'use strict';
  const BG = window.BG, P = BG.Phys, UI = BG.UI, $ = UI.$;
  const COM = BG.Audio.commentary;
  const { YD, MPH, R, S, CLUBS } = P;
  const clamp = P.clamp, lerp = P.lerp, D2R = Math.PI / 180;
  const FT = P.FT;
  const iof = (id) => CLUBS.findIndex((c) => c.id === id);
  const Yd = (m) => Math.round(m / YD);

  // ------------------------------------------------------------------ renderer
  const glc = $('gl'), fxc = $('fx'), fx = fxc.getContext('2d');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b2630;color:#fff;font:18px sans-serif;text-align:center;padding:30px;z-index:99">Abandoned Dunes needs WebGL, which isn’t available in this browser.</div>');
    throw e;
  }
  const CR = BG.Crowd, Gfx = BG.Gfx; Gfx.init(renderer); Gfx.applyRenderer(renderer, Gfx.level());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.12, 4500);
  let VW = 1, VH = 1, DPR = 1;
  function resize() {
    VW = window.innerWidth; VH = window.innerHeight; DPR = Math.min(window.devicePixelRatio || 1, Gfx.level().dpr);
    renderer.setPixelRatio(DPR); renderer.setSize(VW, VH, false);
    fxc.width = Math.round(VW * DPR); fxc.height = Math.round(VH * DPR); fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    camera.aspect = VW / VH; camera.fov = camera.aspect < 0.9 ? 78 : camera.aspect < 1.3 ? 68 : 60; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ------------------------------------------------------------------ textures
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), sx), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), sx), sy);
  }
  function fbm(x, y) { let a = 0.5, s = 0, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }

  const skyDome = Gfx.makeSkyDome(); scene.add(skyDome);

  function noiseTex(size, seed) {
    const d = new Uint8Array(size * size * 4), r = P.mulberry32(seed), v = new Float32Array(size * size);
    for (let i = 0; i < v.length; i++) v[i] = r();
    const t = new Float32Array(v.length);
    for (let p = 0; p < 2; p++) { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { t[y * size + x] = (v[y * size + x] * 2 + v[y * size + (x + 1) % size] + v[y * size + (x + size - 1) % size] + v[((y + 1) % size) * size + x] + v[((y + size - 1) % size) * size + x]) / 6; } v.set(t); }
    let mn = 1, mx = 0; for (let i = 0; i < v.length; i++) { mn = Math.min(mn, v[i]); mx = Math.max(mx, v[i]); }
    for (let i = 0; i < v.length; i++) { const q = ((v[i] - mn) / (mx - mn)) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = q; d[i * 4 + 3] = 255; }
    const tx = new THREE.DataTexture(d, size, size, THREE.RGBAFormat); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; tx.needsUpdate = true;
    tx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return tx;
  }
  function waterNormals() {
    // tileable, irregular swell: many sine waves with random directions/frequencies (analytic gradient)
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), r = P.mulberry32(77);
    const waves = [];
    for (let i = 0; i < 40; i++) {
      const kk = 2 + Math.floor(Math.pow(r(), 1.7) * 38), th = r() * 6.2832;
      waves.push({ kx: Math.round(Math.cos(th) * kk) || 1, ky: Math.round(Math.sin(th) * kk) || 1, a: 1 / Math.pow(kk, 0.85) * (0.6 + r() * 0.8), p: r() * 6.28 });
    }
    const gx = new Float32Array(N * N), gy = new Float32Array(N * N); let mx = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) { const ph = ((w.kx * x + w.ky * y) / N) * 6.2832 + w.p, cs = Math.cos(ph) * w.a; dx += cs * w.kx; dy += cs * w.ky; }
      gx[y * N + x] = dx; gy[y * N + x] = dy; mx = Math.max(mx, Math.abs(dx), Math.abs(dy));
    }
    const k = 0.55 / (mx * 0.45);
    for (let i = 0; i < N * N; i++) {
      const nx = -gx[i] * k, ny = -gy[i] * k, nz = 1, l = Math.hypot(nx, ny, nz), o = i * 4;
      img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  function dotTex(soft) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, '#fff'); gr.addColorStop(soft ? 0.2 : 0.7, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }
  const detailTex = noiseTex(128, 5);
  const DOT = dotTex(false);

  // ------------------------------------------------------------------ lights, ocean, persistent objects
  const hemi = new THREE.HemisphereLight(0xd6e8ff, 0x6c7a48, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 1.0); sun.position.set(0.5, 0.72, 0.48); sun.userData.groundY = 0; scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.5, 0.7, 0.4);
  const ocean = Gfx.makeOcean(Gfx.level(), (() => { const t = waterNormals(); t.repeat.set(1, 1); return t; })(), detailTex); ocean.visible = false; scene.add(ocean);

  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, emissive: 0x303030 });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 12), ballMat); ballMesh.frustumCulled = false; scene.add(ballMesh);
  const shadowMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  shadowMesh.rotation.x = -Math.PI / 2; shadowMesh.renderOrder = 2; scene.add(shadowMesh);
  const teePeg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.011, 0.04, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(teePeg);

  const TRAIL_N = 600;
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3)); trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, toneMapped: false })); trail.frustumCulled = false; scene.add(trail);
  let trailN = 0;

  const AIM_N = 140;
  const aimGeo = new THREE.BufferGeometry(); aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_N * 3), 3)); aimGeo.setDrawRange(0, 0);
  const aimPts = new THREE.Points(aimGeo, new THREE.PointsMaterial({ color: 0xffe38a, size: 5, sizeAttenuation: false, map: DOT, transparent: true, alphaTest: 0.2, depthTest: false, toneMapped: false })); aimPts.frustumCulled = false; aimPts.renderOrder = 5; scene.add(aimPts);
  const landRing = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide, toneMapped: false }));
  landRing.rotation.x = -Math.PI / 2; landRing.visible = false; landRing.renderOrder = 6; scene.add(landRing);

  // pin
  const pinGroup = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 2.4, 6), new THREE.MeshPhongMaterial({ color: 0xf4f4f0 })); pole.position.y = 1.2; pinGroup.add(pole);
  const flagGeo = new THREE.PlaneGeometry(0.66, 0.4, 8, 2); flagGeo.translate(0.33, 0, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);
  const flagMesh = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: 0xe8332a, side: THREE.DoubleSide }));
  const flagHinge = new THREE.Group(); flagHinge.position.set(0, 2.2, 0); flagHinge.add(flagMesh); pinGroup.add(flagHinge);
  const cupMesh = new THREE.Mesh(new THREE.CircleGeometry(0.054, 16), new THREE.MeshBasicMaterial({ color: 0x050505, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  cupMesh.rotation.x = -Math.PI / 2; cupMesh.position.y = 0.03; pinGroup.add(cupMesh);
  scene.add(pinGroup);

  // ------------------------------------------------------------------ per-hole scene objects
  let holeObjs = [];
  function disposeHoleObjs() {
    holeObjs.forEach((o) => { scene.remove(o); if (o.isInstancedMesh) o.dispose(); if (o.userData.terrainData) o.userData.terrainData.dispose(); if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.userData.disposed = true; if (o.material.map && o.material.map !== DOT) o.material.map.dispose(); o.material.dispose(); } });
    holeObjs = []; nearGrass = null;
  }
  let terrainData = null, nearGrass = null;
  function buildTerrain(h, lv, T, course) {
    const step = Math.max(2, Math.ceil(Math.sqrt((h.W * h.H) / 130000)));
    const nx = Math.floor((h.W - 1) / step) + 1, nz = Math.floor((h.H - 1) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), nrm = new Float32Array(nx * nz * 3), e = step * h.res;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const gi = Math.min(i * step, h.W - 1), gj = Math.min(j * step, h.H - 1), o = (j * nx + i) * 3;
      const x = h.x0 + gi * h.res, z = h.z0 + gj * h.res;
      pos[o] = x; pos[o + 1] = h.Hm[gj * h.W + gi]; pos[o + 2] = z;
      const dx = (h.h(x + e, z) - h.h(x - e, z)) / (2 * e), dz = (h.h(x, z + e) - h.h(x, z - e)) / (2 * e), l = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      nrm[o] = -dx * l; nrm[o + 1] = l; nrm[o + 2] = -dz * l;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let k = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    terrainData = Gfx.buildTerrainData(h, lv);
    const mat = Gfx.terrainMaterial(h, terrainData, T, lv, detailTex);
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.receiveShadow = lv.shadow > 0; m.castShadow = lv.shadow >= 2048; m.userData.terrainData = terrainData; m.name = 'terrain'; scene.add(m); holeObjs.push(m);
  }
  function addInstanced(geo, mat, items, fn) {
    const im = new THREE.InstancedMesh(geo, mat, items.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    items.forEach((it, i) => { fn(it, p, q, s, c); M.compose(p, q, s); im.setMatrixAt(i, M); im.setColorAt(i, c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; scene.add(im); holeObjs.push(im); return im;
  }
  function buildObjects(h, lv) {
    const o = h.objs, qid = new THREE.Quaternion();
    Gfx.buildVegetation(h, lv).forEach((m) => { scene.add(m); holeObjs.push(m); });
    if (o.markers.length) {
      const g = new THREE.CylinderGeometry(0.13, 0.15, 0.7, 8); g.translate(0, 0.35, 0);
      addInstanced(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), o.markers, (it, p, q, s, c) => { p.set(it.x, it.y, it.z); s.set(1, 1, 1); q.identity(); c.setHex(it.col); });
    }
    // tee markers
    const p0 = h.pathAt(0), rx = -p0.hz, rz = p0.hx; // right vector (x,z) for heading (hx,hz)
    [-1, 1].forEach((sgn) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      m.position.set(rx * 3.8 * sgn - p0.hx * 0.3, h.h(rx * 3.8 * sgn, rz * 3.8 * sgn) + 0.2, rz * 3.8 * sgn - p0.hz * 0.3); scene.add(m); holeObjs.push(m);
    });
  }

  // ------------------------------------------------------------------ game state
  const G = {
    phase: 'menu', paused: false, course: null, diffKey: 'normal', diff: BG.DIFFICULTY.normal, holesOpt: 'all',
    list: [], li: 0, hole: null, env: null, wind: null, ball: null, strokes: 0, pens: 0, putts: 0, shots: [],
    aimYaw: 0, club: CLUBS[0], clubIdx: 0, clubAuto: true, sugIdx: 0, lieSurf: S.TEE, round: null, speedMul: 1, seed: 1,
    drag: null, hold: 0, settleT: 0, view: 'normal', t: 0, flyT: 0, shotStart: null, curShot: null, onGreenAt: 0, fwHit: null, tPrev: 0,
    camPos: new THREE.Vector3(0, 50, 0), camLook: new THREE.Vector3(0, 40, -10), camK: 4, mini: null, attract: false, carryNote: '',
  };
  window.__bg = { G, P, UI };

  const screens = ['scrMenu', 'scrCourses', 'scrDiff', 'scrLoading', 'scrCard', 'scrHoleDone', 'scrClubs', 'scrPause', 'scrHelp', 'scrEnd', 'scrConfirm', 'scrPaywall', 'scrMP', 'scrMPSetup', 'scrMPCard'];
  function showScr(id) { screens.forEach((s) => $(s).classList.toggle('hidden', s !== id)); if (id === 'scrMenu') refreshMenuSave(); }
  function hideModals() { ['scrCard', 'scrHoleDone', 'scrClubs', 'scrPause', 'scrHelp', 'scrEnd', 'scrLoading', 'scrConfirm', 'scrPaywall', 'scrMP', 'scrMPSetup', 'scrMPCard'].forEach((s) => $(s).classList.add('hidden')); }
  function anyModal() { return ['scrCard', 'scrHoleDone', 'scrClubs', 'scrPause', 'scrHelp', 'scrEnd', 'scrConfirm', 'scrPaywall'].some((s) => !$(s).classList.contains('hidden')); }

  let toastTimer = 0;
  function toast(html, ms) {
    const t = $('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastTimer); if (ms !== 0) toastTimer = setTimeout(() => t.classList.remove('on'), ms || 3200);
  }
  function hint(s) { $('hint').textContent = s || ''; }

  // ------------------------------------------------------------------ hole loading
  function holeSeed(course, no) { return (P.hashStr(course.id) + no * 977 + G.seed * 131) >>> 0; }
  function makeWind(h) {
    const r = P.mulberry32(holeSeed(G.course, h.no)), d = G.diff;
    const mph = lerp(d.windMph[0], d.windMph[1], r());
    return new P.Wind({ seed: holeSeed(G.course, h.no) + 5, mph, gust: d.gust, dir: r() * Math.PI * 2, dirVar: d.dirVar });
  }
  function buildMini(h) {
    const s = 3, w = Math.ceil(h.W / s), hh = Math.ceil(h.H / s), c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d'), img = g.createImageData(w, hh), d = img.data;
    const col = { [S.OB]: [58, 84, 60], [S.WATER]: [44, 110, 150], [S.GREEN]: [150, 232, 120], [S.SAND]: [240, 224, 168], [S.TEE]: [130, 200, 100], [S.FRINGE]: [112, 190, 90], [S.FAIRWAY]: [118, 184, 84], [S.ROUGH]: [84, 138, 66], [S.GORSE]: [58, 76, 38], [S.DEEP]: [150, 142, 82] };
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
      const st = h.Sm[Math.min(h.H - 1, j * s) * h.W + Math.min(h.W - 1, i * s)], cc = col[st] || [90, 120, 70], o = (j * w + i) * 4;
      d[o] = cc[0]; d[o + 1] = cc[1]; d[o + 2] = cc[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < h.path.n; i += 3) { x0 = Math.min(x0, h.path.px[i]); x1 = Math.max(x1, h.path.px[i]); z0 = Math.min(z0, h.path.pz[i]); z1 = Math.max(z1, h.path.pz[i]); }
    x0 = Math.min(x0, h.pin.x, 0) - 45; x1 = Math.max(x1, h.pin.x, 0) + 45; z0 = Math.min(z0, h.pin.z) - 40; z1 = Math.max(z1, 0) + 40;
    G.mini = { img: c, s, x0, x1, z0, z1 };
  }

  // ---- everything visual that depends on the hole + Graphics level (also re-run when Graphics changes)
  const SKY_LIGHT = { clear: { sun: 2.0, env: 1.0, fog: 0.00105, spec: 1.0 }, mist: { sun: 1.2, env: 1.1, fog: 0.0016, spec: 0.55 }, over: { sun: 0.55, env: 1.2, fog: 0.0013, spec: 0.12 }, broken: { sun: 2.0, env: 1.0, fog: 0.00105, spec: 1.0 } };
  const SKY_YAW = { v: 0, kind: 'clear' };
  function buildVisuals(h, course) {
    const lv = Gfx.level(), meta = Gfx.skyMeta();
    disposeHoleObjs();
    if (BG.Slope) BG.Slope.build(h, scene);   // green slope arrows (sampled from the physics terrain; drawn only when the setting is ON)
    buildTerrain(h, lv, G.texArr || { alb: null, nrm: null }, course); buildObjects(h, lv);
    nearGrass = Gfx.makeNearGrass(lv); if (nearGrass) { scene.add(nearGrass); holeObjs.push(nearGrass); }
    let kind = course.theme === 'forest' ? 'over' : (h.no * 7 + G.seed) % 5 === 0 ? 'clear' : (h.no + G.seed) % 3 === 0 ? 'over' : ((h.no * 3 + G.seed) % 2 ? 'clear' : 'mist');
    if (!meta[kind]) kind = 'clear';
    const L = SKY_LIGHT[kind], M = meta[kind], yaw = ((h.no * 1.7 + G.seed * 0.9 + P.hashStr(course.id) % 7) % 6.2832);
    SKY_YAW.v = yaw; SKY_YAW.kind = kind;
    skyDome.material.uniforms.uSky.value = Gfx.skyTex(kind); skyDome.material.uniforms.uYaw.value = yaw;
    sunDir.copy(Gfx.sunDir(kind, yaw));
    const fogC = new THREE.Color().setRGB(M.fog[0], M.fog[1], M.fog[2]);  // display-space colour: fog is applied after tone mapping
    scene.fog = new THREE.FogExp2(fogC, course.theme === 'forest' ? 0.0017 : L.fog);
    sun.intensity = L.sun; sun.color.setRGB(1.0, kind === 'clear' ? 0.93 : 0.96, kind === 'clear' ? 0.82 : 0.9);
    sun.castShadow = lv.shadow > 0; if (sun.shadow.map && sun.shadow.mapSize.x !== lv.shadow) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(lv.shadow || 1, lv.shadow || 1); sun.shadow.camera.right = 0; sun.shadow.camera.userData.R0 = 0;
    Gfx.setMist(lv, h.SEA_Y, !!h.coast || course.theme === 'coast');
    sun.position.copy(sunDir).multiplyScalar(260); sun.userData.groundY = h.tee.y;
    if (lv.env) { scene.environment = Gfx.envFor(kind); scene.userData.envI = L.env; hemi.intensity = 0; }
    else { scene.environment = null; hemi.color.setRGB(M.zenith[0] * 1.1, M.zenith[1] * 1.1, M.zenith[2] * 1.1); hemi.groundColor.setRGB(0.2, 0.22, 0.12); hemi.intensity = kind === 'over' ? 2.0 : 1.5; }
    scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = L.env; });
    ocean.visible = !!h.coast || course.theme === 'coast'; ocean.material.defines.OCEAN_Q = lv.ocean; ocean.material.needsUpdate = true;
    const ou = ocean.material.uniforms;
    ocean.position.set(h.x0 + h.W * h.res / 2, h.SEA_Y, h.z0 + h.H * h.res / 2);
    ou.uSky.value = Gfx.skyTex(kind); ou.uYaw.value = yaw; ou.uSun.value.copy(sunDir); ou.uSea.value = h.SEA_Y;
    ou.uSunCol.value.set(1.0, 0.92, 0.78).multiplyScalar(L.spec);
    if (kind === 'over') { ou.uDeep.value.setRGB(0.02, 0.07, 0.09); ou.uShallow.value.setRGB(0.06, 0.2, 0.21); } else { ou.uDeep.value.setRGB(0.008, 0.06, 0.1); ou.uShallow.value.setRGB(0.04, 0.27, 0.29); }
    ou.uHeight.value = terrainData.N; ou.uGrid.value.set(h.x0, h.z0, h.res * terrainData.st, 1); ou.uWH.value.set(terrainData.W, terrainData.H);
  }
  function loadHole(attract, cb) {
    G.attract = !!attract;
    const course = G.course, idx = attract ? attract.idx : G.list[G.li];
    const h = BG.Course.build(course, idx, G.diff);
    G.hole = h;
    buildVisuals(h, course); buildMini(h);
    if (attract) CR.clear(); else CR.build(h, Gfx.level().id, scene);
    G.wind = makeWind(h);
    G.env = { terrain: h, wind: G.wind, cup: { x: h.pin.x, z: h.pin.z }, trees: h.trees, rules: { gorsePenalty: G.diff.gorsePenalty }, greenRoll: G.diff.id === 'simple' ? 0.068 : G.diff.id === 'normal' ? 0.057 : 0.049, capScale: G.diff.capScale, rng: Math.random };
    pinGroup.position.set(h.pin.x, h.pin.y, h.pin.z);
    cupMesh.position.y = 0.05;
    G.strokes = 0; G.pens = 0; G.putts = 0; G.shots = []; G.onGreenAt = 0; G.fwHit = null; G.lieSurf = S.TEE; trailN = 0; trailGeo.setDrawRange(0, 0); G.trailPts = []; G.speedMul = 1; G.view = 'normal';
    G.ball = P.newBall(h.tee.x, h.tee.y + R + 0.04, h.tee.z); G.ball.mode = 'stopped';
    G.shotStart = { x: h.tee.x, z: h.tee.z };
    if (!attract) { G.aimYaw = defaultAim(); pickClub(true); }
    if (cb) cb();
  }
  function defaultAim() {
    const b = G.ball, t = G.hole.aimTarget(b.x, b.z);
    return Math.atan2(t.x - b.x, -(t.z - b.z));
  }

  // ------------------------------------------------------------------ clubs & lies
  function lieMods(surf, club, sev) {
    const m = { speed: 1, launch: 0, spin: 1, disp: 1 };
    if (club.type === 'putter') return m;
    const mix = (f) => 1 - (1 - f) * sev;
    switch (surf) {
      case S.FRINGE: m.speed = mix(0.97); m.spin = mix(0.9); break;
      case S.ROUGH: m.speed = mix(0.62 + 0.36 * club.rough); m.spin = mix(0.6); m.launch = 1.5 * sev; m.disp = 1 + 0.6 * sev; break;
      case S.DEEP: m.speed = mix(0.3 + 0.55 * club.rough); m.spin = mix(0.3); m.launch = 3 * sev; m.disp = 1 + 1.2 * sev; break;
      case S.SAND:
        if (club.type === 'wedge') { m.speed = mix(0.9); m.spin = mix(0.4); m.launch = 3 * sev; m.disp = 1 + 0.4 * sev; }
        else { m.speed = mix(0.62); m.spin = mix(0.5); m.launch = -2 * sev; m.disp = 1 + 1.5 * sev; }
        break;
      default: break;
    }
    return m;
  }
  function headwindMph(yaw) {
    const f = [Math.sin(yaw), -Math.cos(yaw)], w = G.wind.at(10);
    return -(w[0] * f[0] + w[1] * f[1]) / MPH;
  }
  function suggestClub() {
    const b = G.ball, h = G.hole, surf = G.lieSurf, dM = Math.hypot(h.pin.x - b.x, h.pin.z - b.z), dYd = dM / YD;
    if (surf === S.GREEN) return iof('PT');
    if (surf === S.FRINGE && dYd < 22) return iof('PT');
    let eff = dYd + (h.pin.y - b.y) / YD;
    const yaw = Math.atan2(h.pin.x - b.x, -(h.pin.z - b.z));
    eff *= 1 + headwindMph(yaw) * 0.01;
    const lm = lieMods(surf, CLUBS[6], G.diff.lie);
    eff /= Math.pow(lm.speed, 1.7);
    let pool = CLUBS.filter((c) => c.type !== 'putter');
    if (surf === S.DEEP) pool = pool.filter((c) => c.type !== 'wood');
    if (surf === S.SAND) { if (eff <= 105) return iof('SW'); pool = pool.filter((c) => c.type === 'iron' || c.type === 'wedge'); }
    if (surf === S.ROUGH && eff > 190) pool = pool.filter((c) => c.id !== 'DR');
    const f = eff < 200 ? 0.94 : 0.98;
    let best = pool[0];
    pool.slice().sort((a, b2) => a.carry - b2.carry).some((c) => { if (c.carry >= eff * f) { best = c; return true; } best = c; return false; });
    return iof(best.id);
  }
  function pickClub(auto) {
    G.sugIdx = suggestClub();
    if (auto) { G.clubAuto = true; G.clubIdx = G.sugIdx; G.club = CLUBS[G.clubIdx]; }
  }
  function setClub(i) {
    G.clubIdx = (i + CLUBS.length) % CLUBS.length; G.club = CLUBS[G.clubIdx]; G.clubAuto = false; BG.Audio.ui();
  }

  // ------------------------------------------------------------------ geometry helpers
  const _n3 = [0, 1, 0];
  function distPin() { const b = G.ball, h = G.hole; return Math.hypot(h.pin.x - b.x, h.pin.z - b.z); }
  function aimDir(yaw) { return [Math.sin(yaw), -Math.cos(yaw)]; }
  function readGreen() {
    const b = G.ball, h = G.hole, dx = h.pin.x - b.x, dz = h.pin.z - b.z, L = Math.hypot(dx, dz) || 1, f = [dx / L, dz / L], r = [-f[1], f[0]];
    let lat = 0, up = 0, n = 10;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = b.x + dx * t, z = b.z + dz * t; h.n(x, z, _n3);
      const sx = -_n3[0] / _n3[1], sz = -_n3[2] / _n3[1]; // uphill gradient (dh/dx,dh/dz)
      lat += -(sx * r[0] + sz * r[1]); up += sx * f[0] + sz * f[1];
    }
    return { lat: lat / n * 100, up: up / n * 100, rise: (h.pin.y - b.y) / FT };
  }

  // ------------------------------------------------------------------ shot construction
  function pullMax() { return clamp(VH * 0.3, 120, 250); }
  function puttDistFromPower(p) { return 30 * Math.pow(p, 1.7); }
  const YAW_SENS = 0.4, YAW_MAX = 14 * D2R;
  function yawFromPull(dx, dy) {
    const pl = Math.hypot(dx, dy), fy = dy;
    if (fy <= 1) return 0;
    const w = P.smooth(6, 40, pl);
    return clamp(Math.atan2(-dx, fy) * YAW_SENS, -YAW_MAX, YAW_MAX) * w;
  }
  // deterministic shot (no random error) used for previews
  function baseShot(p, yawOff) {
    const club = G.club, lm = lieMods(G.lieSurf, club, G.diff.lie), mods = { speed: lm.speed, launch: lm.launch, spin: lm.spin, yaw: 0, sideSpin: 0 };
    let yaw = G.aimYaw + yawOff;
    const a = G.diff.aimAssist;
    if (a > 0) {
      const b = G.ball, h = G.hole, yp = Math.atan2(h.pin.x - b.x, -(h.pin.z - b.z)); let dd = yp - yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      const lim = club.type === 'putter' ? 12 * D2R : 7 * D2R;
      if (Math.abs(dd) < lim) yaw += dd * a * 0.8;
    }
    const shot = { club, power: p, yaw, mods, lm, rollMu: G.env.greenRoll };
    if (club.type === 'putter') shot.puttDist = puttDistFromPower(p);
    return shot;
  }
  function randomize(shot, q, p) {
    const d = G.diff, club = shot.club, rng = Math.random, lm = shot.lm, note = [];
    if (d.disperse <= 0) return note;
    const gs = P.gauss;
    if (club.type === 'putter') {
      const sig = d.id === 'normal' ? 0.25 : 0.4 + 1.3 * (1 - q);
      shot.yaw += gs(rng) * sig * D2R;
      shot.puttDist *= 1 + gs(rng) * (d.id === 'normal' ? 0.02 : 0.025 + 0.06 * (1 - q));
      if (q < 0.55) note.push('Jerky stroke');
      return note;
    }
    const over = Math.max(0, p - 1);
    const sig = (d.id === 'normal' ? 0.45 + 0.9 * (1 - q) : 0.9 + 3.0 * (1 - q)) * club.disp * lm.disp * (1 + over * 5);
    shot.mods.yaw += gs(rng) * sig * D2R;
    shot.mods.sideSpin += gs(rng) * (d.id === 'normal' ? 160 : 260 + 700 * (1 - q)) * club.disp * lm.disp;
    shot.mods.speed *= 1 + gs(rng) * (d.id === 'normal' ? 0.012 : 0.015 + 0.04 * (1 - q));
    const chance = (d.id === 'normal' ? 0.012 + 0.16 * (1 - q) * (1 - q) : 0.03 + 0.5 * (1 - q) * (1 - q)) * (G.lieSurf === S.ROUGH || G.lieSurf === S.DEEP || G.lieSurf === S.SAND ? 1.6 : 1) * (1 + over * 6);
    if (rng() < chance) {
      const k = rng();
      if (k < 0.4) { shot.mods.speed *= 0.78 + rng() * 0.1; shot.mods.launch -= club.launch * 0.45; shot.mods.spin *= 0.55; note.push('Thin!'); }
      else if (k < 0.75) { shot.mods.speed *= 0.62 + rng() * 0.12; shot.mods.launch += 2; shot.mods.spin *= 0.6; note.push('Fat!'); }
      else { const sg = rng() < 0.5 ? -1 : 1; shot.mods.yaw += sg * (3 + rng() * 3) * D2R; shot.mods.sideSpin += sg * 1500; shot.mods.speed *= 0.93; note.push(sg > 0 ? 'Pushed off the toe' : 'Pulled off the heel'); }
    }
    if (q < 0.5 && !note.length) note.push('Sloppy pull');
    return note;
  }

  // ------------------------------------------------------------------ shot execution
  function lieLabel(surf) { return { [S.TEE]: 'Tee box', [S.FAIRWAY]: 'Fairway', [S.FRINGE]: 'Fringe', [S.ROUGH]: 'Rough', [S.DEEP]: 'Deep rough', [S.SAND]: 'Bunker', [S.GREEN]: 'Green', [S.GORSE]: 'Gorse' }[surf] || 'Fairway'; }

  function takeShot(p, yawOff, q) {
    COM.stop();
    const b0 = G.ball, club = G.club, h = G.hole;
    const shot = baseShot(p, yawOff);
    const note = randomize(shot, q, p);
    const b = P.newBall(b0.x, b0.y, b0.z);
    P.launch(b, shot);
    b.putt = club.type === 'putter';
    if (CR.active() && !G.attract) CR.plan(b, G.env);
    const fromD = distPin();
    G.ball = b; G.strokes++; if (b.putt) G.putts++;
    G.shotStart = { x: b0.x, y: b0.y, z: b0.z }; G.treeHit = false;
    G.curShot = { club: club.name, id: club.id, putt: b.putt, surf: G.lieSurf, note, p, q, yaw: shot.yaw, v0: b.v0, launch: b.launch, spin: b.spinRpm, fromD, n: G.strokes };
    trailN = 0; trailGeo.setDrawRange(0, 0); G.trailT = 0;
    G.phase = 'ball'; G.speedMul = 1; G.settleT = 0;
    aimGeo.setDrawRange(0, 0); landRing.visible = false; $('powerMeter').classList.remove('on');
    BG.Audio.init(); BG.Audio.hit(Math.min(p, 1.1), b.putt);
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) {} }
    hint(G.speedMul > 1 ? '' : 'Tap to fast-forward');
    $('toast').classList.remove('on');
  }


  // ------------------------------------------------------------------ crowd reactions
  const CROWD = {
    simple: { drive: 1.08, putt: 40, near: 0.6, carry: 1.2 },
    normal: { drive: 1.0, putt: 30, near: 1.0, carry: 1.0 },
    realistic: { drive: 0.94, putt: 22, near: 1.4, carry: 0.85 },
  };
  const TIERS = ['', 'polite', 'cheer', 'roar', 'mega'], ICON = ['', '👏', '🎉', '🔥', '🏆'];
  let calloutEl = null, calloutT = 0;
  function callout(main, sub, tier) {
    if (!calloutEl) { calloutEl = document.createElement('div'); calloutEl.id = 'callout'; $('hud').appendChild(calloutEl); }
    calloutEl.className = 't' + tier; calloutEl.innerHTML = `<b>${ICON[tier]} ${UI.esc(main)}</b>${sub ? `<span>${UI.esc(sub)}</span>` : ''}`;
    void calloutEl.offsetWidth; calloutEl.classList.add('on'); clearTimeout(calloutT);
    calloutT = setTimeout(() => calloutEl.classList.remove('on'), tier >= 3 ? 3600 : tier === 2 ? 2800 : 2200);
  }
  G.crowdLog = [];
  function react(tier, main, sub, delay) {
    G.crowdLog.push({ tier: TIERS[tier], main, sub: sub || '' });
    const go = () => { BG.Audio.crowd(TIERS[tier]); CR.cheer(tier); callout(main, sub, tier); };
    if (delay) setTimeout(go, delay); else go();
  }
  // after a non-holed shot comes to rest: great drive, close approach, big carry
  function crowdAfterShot(cs, b, sf, rem) {
    if (cs.putt || G.attract) return false;
    const D = CROWD[G.diffKey] || CROWD.normal, h = G.hole, tot = cs.total / YD, fromYd = cs.fromD / YD, remFt = rem / FT, cand = [];
    // carry over water / gorse along the actual flight + roll path
    { const a = trailGeo.attributes.position.array; let water = 0, gorse = 0;
      for (let i = 1; i < trailN; i++) { const x = a[i * 3], z = a[i * 3 + 2], st = h.surf(x, z), d = Math.hypot(x - a[i * 3 - 3], z - a[i * 3 - 1]); if (st === S.WATER) water += d; else if (st === S.GORSE) gorse += d; }
      water /= YD; gorse /= YD;
      if (water >= 50 * D.carry && tot >= 110) cand.push([2, h.coast ? 'Carried the ocean!' : 'Carried the water!', `${Math.round(water)} yd over the ${h.coast ? 'ocean' : 'hazard'}`]);
      else if (gorse >= 85 * D.carry) cand.push([1, 'Carried the gorse', `${Math.round(gorse)} yd over the waste`]); }
    // approach stopping close from long range
    if (cs.surf !== S.GREEN && sf === S.GREEN) {
      if ((fromYd >= 100 && remFt <= 8 * D.near) || (fromYd >= 160 && remFt <= 15 * D.near)) cand.push([2, 'Stuffed it!', `${Math.round(fromYd)} yd approach, ${Math.max(1, Math.round(remFt))} ft left`]);
      else if ((fromYd >= 80 && remFt <= 15 * D.near) || (fromYd >= 120 && remFt <= 30 * D.near)) cand.push([1, 'Great approach', `${Math.round(remFt)} ft from ${Math.round(fromYd)} yd`]);
      else if (fromYd >= 30 && remFt <= 20 * D.near) cand.push([1, 'Good shot', `${Math.round(remFt)} ft from ${Math.round(fromYd)} yd`]);
    }
    // great drive: long and finding the fairway, scaled to the difficulty
    if (cs.surf === S.TEE && h.par >= 4 && tot >= 240 * D.drive && (sf === S.FAIRWAY || sf === S.FRINGE || sf === S.GREEN)) cand.push([1, 'Great drive!', `${Math.round(tot)} yd, in the fairway`]);
    if (!cand.length) return false;
    cand.sort((p, q) => q[0] - p[0]);
    react(cand[0][0], cand[0][1], cand[0][2], 250);
    return true;
  }
  // disappointed "awww" after an errant non-putt shot (never in attract mode, never alongside a cheer): once per shot, ~0.3-0.6 s after the ball goes bad
  G.awwLog = [];
  function crowdAww(why) {
    if (G.attract) return;
    G.awwLog.push(why);
    setTimeout(() => { if (!G.attract) { BG.Audio.crowd('aww'); if (BG.Crowd && BG.Crowd.groan) BG.Crowd.groan(); } }, 300 + Math.random() * 300);
  }
  // is a ball that came to rest on `sf` an errant shot? (hazards are handled in endShot's hazard branch)
  function errantLie(cs, sf) {
    const h = G.hole;
    if (sf === S.SAND && cs.surf !== S.SAND) return 'bunker';
    if (G.treeHit && sf !== S.FAIRWAY && sf !== S.GREEN && sf !== S.FRINGE && sf !== S.TEE) return 'tree';
    if (sf === S.GORSE) return 'gorse';
    if (sf !== S.FAIRWAY && sf !== S.GREEN && sf !== S.FRINGE && sf !== S.TEE) {
      if (cs.note.some(n => /Thin|Fat|Pushed|Pulled|Sloppy/.test(n))) return 'mishit';
      if (sf === S.DEEP) return 'deep rough';
      if (sf === S.ROUGH && cs.surf !== S.ROUGH && cs.surf !== S.DEEP && cs.fromD / YD >= 60) return 'missed to rough';
    }
    if (cs.surf === S.TEE && h.par >= 4 && cs.n === 1) { if (sf === S.DEEP || (sf === S.ROUGH && cs.note.length)) return 'tee miss'; }
    return '';
  }
  // when the hole is finished: score reaction combined with how it was holed
  function crowdHole(picked) {
    const h = G.hole, s = G.strokes, d = s - h.par, hs = G.holeShot; G.holeShot = null;
    if (G.attract) return;
    const D = CROWD[G.diffKey] || CROWD.normal;
    let tier = 0, main = '', sub = '';
    if (s === 1) { tier = 4; main = 'HOLE IN ONE!'; } else if (d <= -3) { tier = 4; main = 'Albatross!'; } else if (d === -2) { tier = 3; main = 'Eagle!'; } else if (d === -1) { tier = 2; main = 'Birdie!'; } else if (d === 0) { tier = 1; main = 'Par'; }
    if (hs && s !== 1) {
      if (hs.surf === S.SAND) sub = 'Holed from the bunker!';
      else if (!hs.putt && hs.surf !== S.GREEN) sub = hs.fromYd < 40 ? `Chip-in from ${Math.round(hs.fromYd)} yd!` : `Holed out from ${Math.round(hs.fromYd)} yd!`;
      else if (hs.putt && hs.ft >= D.putt) sub = `${Math.round(hs.ft)}-ft putt dropped!`;
      if (sub) { tier = d <= -1 ? Math.min(4, Math.max(tier, 2) + 1) : Math.max(tier, 2); if (!main || d > 0) main = sub, sub = ''; }
    }
    if (hs && s === 1) sub = `${Math.round(hs.fromYd)} yd`;
    if (!tier) return;
    react(tier, main, sub, 350);
  }

  function processEvents(b) {
    for (let i = 0; i < b.events.length; i++) {
      const e = b.events[i];
      if (e.type === 'bounce') { BG.Audio.bounce(e.speed, e.surf); if (e.surf === S.SAND) G.sandHit = true; }
      else if (e.type === 'tree') { BG.Audio.tree(); G.treeHit = true; }
      else if (e.type === 'water' || e.type === 'ob') BG.Audio.splash();
      else if (e.type === 'holed') BG.Audio.cup();
      else if (e.type === 'crowd') { BG.Audio.thud(0.5); CR.onHit(e.p); }
    }
    b.events.length = 0;
  }

  function stepBallPhase(dt) {
    const b = G.ball, sub = 1 / 240;
    const n = Math.min(80, Math.ceil((dt * G.speedMul) / sub));
    for (let i = 0; i < n; i++) {
      P.stepBall(b, sub, G.env); if (CR.active()) CR.collide(b); processEvents(b);
      G.trailT += sub;
      if (G.trailT > 0.035 && trailN < TRAIL_N) { G.trailT = 0; const a = trailGeo.attributes.position.array; a[trailN * 3] = b.x; a[trailN * 3 + 1] = b.y; a[trailN * 3 + 2] = b.z; trailN++; trailGeo.setDrawRange(0, trailN); trailGeo.attributes.position.needsUpdate = true; }
      if (b.mode === 'stopped' || b.mode === 'hazard' || b.mode === 'holed') break;
      if (b.t > 75) { b.mode = 'stopped'; b.vx = b.vy = b.vz = 0; break; }
    }
    G.ballSim = (G.ballSim || 0) + n * sub;
    if (b.mode === 'stopped' || b.mode === 'hazard' || b.mode === 'holed') endShot();
  }

  function placeBall(x, z) {
    const h = G.hole; G.ball = P.newBall(x, h.h(x, z) + R, z); G.ball.mode = 'stopped'; G.lieSurf = h.surf(x, z);
  }

  function endShot() {
    const b = G.ball, h = G.hole, cs = G.curShot, st = G.shotStart;
    CR.shotEnd();
    const ex = b.mode === 'hazard' ? b.hazardPos.x : b.x, ez = b.mode === 'hazard' ? b.hazardPos.z : b.z;
    const total = Math.hypot(ex - st.x, ez - st.z);
    const carry = b.land ? Math.hypot(b.land.x - st.x, b.land.z - st.z) : total;
    cs.total = total; cs.carry = carry; cs.apex = Math.max(0, b.maxY - st.y);
    cs.pin = 0; let msg = '', pen = 0, kind = '';
    G.speedMul = 1; hint('');
    const rec = { n: cs.n, club: cs.club, putt: cs.putt, total, carry, from: lieLabel(cs.surf), result: '', note: cs.note.join(', '), pen: 0 };
    G.shots.push(rec);
    if (!cs.putt && total / YD > G.round.longest) G.round.longest = total / YD;
    G.round.dist += total;

    if (b.mode === 'holed') { rec.result = 'Holed!'; G.trailPts.push([h.pin.x, h.pin.z]); G.holeShot = { putt: cs.putt, surf: cs.surf, fromYd: cs.fromD / YD, ft: total / FT }; holeOut(); return; }

    if (b.mode === 'hazard') {
      const kindH = b.hazard; pen = 1; kind = kindH;
      if (!cs.putt) crowdAww(kindH);
      G.strokes += 1; G.pens += 1; rec.pen = 1;
      if (kindH === 'water') { rec.result = h.coast ? 'Ocean' : 'Water'; msg = h.coast ? 'Into the ocean!' : 'In the water!'; }
      else if (kindH === 'gorse') { rec.result = 'Gorse'; msg = 'Lost in the gorse!'; }
      else { rec.result = 'Out of bounds'; msg = 'Out of bounds!'; }
      if (kindH === 'ob' && G.diff.obPenalty === 'replay') { placeBall(st.x, st.z); G.lieSurf = cs.surf; msg += ' Stroke and distance — replay from the previous spot.'; }
      else { const rl = h.relief(b.hazardPos.x, b.hazardPos.z, kindH); placeBall(rl.x, rl.z); msg += ' +1 stroke, drop near the hazard.'; }
      const sp = msg.indexOf('! ');
      toast(`<div class="t1 bad">${sp > 0 ? msg.slice(0, sp + 1) : msg}</div><div class="t2">${sp > 0 ? msg.slice(sp + 2) : ''}<br>Now lying ${G.strokes + 1}</div>`, 3800);
    } else {
      b.y = h.h(b.x, b.z) + R; G.lieSurf = h.surf(b.x, b.z);
      let freeDrop = false;
      if (CR.active() && !G.attract) { const dr = CR.dropFor(b.x, b.z); if (dr) { placeBall(dr.x, dr.z); freeDrop = true; } }
      const sf = G.lieSurf;
      rec.result = lieLabel(sf) + (freeDrop ? ' (free drop)' : '');
      if (G.fwHit === null && cs.n === 1 && h.par >= 4) G.fwHit = sf === S.FAIRWAY || sf === S.FRINGE || sf === S.GREEN;
      if (sf === S.GREEN && !G.onGreenAt) { G.onGreenAt = G.strokes; G.girOK = G.strokes <= h.par - 2; }
      const rem = distPin();
      if (!freeDrop) { const cheered = crowdAfterShot(cs, b, sf, rem); if (!cheered && !cs.putt) { const why = errantLie(cs, sf); if (why) crowdAww(why); } }
      if (G.diff.gimme && sf === S.GREEN && rem < G.diff.gimme) {
        G.strokes += 1; G.putts += 1; rec.result = 'Conceded'; G.shots.push({ n: G.strokes, club: 'Putter', putt: true, total: rem, carry: rem, from: 'Green', result: 'Gimme', note: '', pen: 0 });
        toast('<div class="t1 good">Good, good!</div><div class="t2">Gimme putt conceded</div>', 1800); holeOut(true); return;
      }
      const t2 = cs.putt ? `Putt ${Math.round(total / FT)} ft` + (rem / FT < 80 ? ` · ${Math.round(rem / FT)} ft left` : ` · ${Yd(rem)} yd left`)
        : `Carry <b>${Yd(carry)}</b> · Total <b>${Yd(total)}</b> yd · <b>${Yd(rem)}</b> yd to pin<br>Apex ${Yd(cs.apex)} · ${Math.round(cs.v0 / MPH)} mph · ${cs.launch.toFixed(1)}° · ${Math.round(cs.spin).toLocaleString()} rpm`;
      const t2d = freeDrop ? t2 + '<br>Free relief from the crowd, no penalty' : t2;
      const t1 = freeDrop ? `Free drop from the gallery <span class="bad">·</span> ${lieLabel(sf)}` : cs.note.length ? `${cs.note.join(', ')} <span class="bad">·</span> ${lieLabel(sf)}` : `${cs.club} — ${lieLabel(sf)}`;
      toast(`<div class="t1 ${cs.note.length ? 'bad' : ''}">${t1}</div><div class="t2">${t2d}</div>`, 4200);
    }
    G.trailPts.push([G.ball.x, G.ball.z]);
    // pick up cap
    if (G.strokes >= h.par + 6) { G.strokes = h.par + 6; toast(`<div class="t1 bad">Pick up</div><div class="t2">Maximum score of ${h.par + 6} reached.</div>`, 2200); holeOut(true); return; }
    if (A2.auto && !cs.putt && !G.attract && G.lieSurf === S.GREEN) { setTimeout(() => { if (G.phase === 'settle' || G.phase === 'aim') auto2Putt(); }, 1400); }
    G.phase = 'settle'; G.settleT = 0;
    G.aimYaw = defaultAim(); pickClub(true);
    saveRound();
  }

  // ---------------------------------------------------------------- Auto 2-putt
  const A2 = { auto: false };
  try { A2.auto = localStorage.getItem('bg.auto2') === '1'; } catch (e) {}
  function auto2Putt() {
    if (G.attract || G.paused || !G.hole || G.lieSurf !== S.GREEN || (G.phase !== 'aim' && G.phase !== 'settle')) return false;
    const h = G.hole, remFt = distPin() / FT, n = remFt <= 3 ? 1 : 2, from = remFt;
    const room = h.par + 6 - G.strokes, add = Math.max(1, Math.min(n, room));
    $('btnAuto2').classList.remove('on'); G.phase = 'auto';
    for (let k = 0; k < add; k++) {
      G.strokes += 1; G.putts += 1;
      const first = add === 2 && k === 0, ft = add === 1 ? from : first ? from : Math.max(1.5, Math.min(3, from * 0.12));
      G.shots.push({ n: G.strokes, club: 'Putter', putt: true, total: ft * FT, carry: ft * FT, from: 'Green', result: first ? 'Lag to tap-in' : 'Holed', note: 'auto', pen: 0 });
    }
    G.round.autoPutts[G.li] = add;
    G.holeShot = null;
    toast(`<div class="t1 good">Auto ${add === 1 ? 'tap-in' : '2-putt'}</div><div class="t2">${add === 1 ? `Tap-in from ${Math.round(from)} ft · 1 putt` : `${Math.round(from)} ft · 2 putts`} · ${G.strokes} total</div>`, 2200);
    holeOut(false);
    return true;
  }
  function refreshAuto2() { $('pmAuto').textContent = 'Auto 2-putt every green: ' + (A2.auto ? 'ON' : 'OFF'); $('pmAuto').classList.toggle('primary', A2.auto); }
  setInterval(() => { $('btnAuto2').classList.toggle('on', G.phase === 'aim' && !G.paused && !G.drag && !G.attract && G.lieSurf === S.GREEN && !!G.hole); }, 150);
  $('btnAuto2').onclick = (e) => { e.stopPropagation(); auto2Putt(); };
  $('pmAuto').onclick = () => { A2.auto = !A2.auto; try { localStorage.setItem('bg.auto2', A2.auto ? '1' : '0'); } catch (e) {} refreshAuto2(); };
  refreshAuto2();
  window.__bg.auto2Putt = auto2Putt; window.__bg.A2 = A2;

  function holeOut(picked) {
    const h = G.hole, r = G.round, i = G.li;
    r.strokes[i] = G.strokes; r.putts[i] = G.putts; r.pens[i] = G.pens; r.fw[i] = G.fwHit; r.gir[i] = G.onGreenAt ? !!G.girOK : false; r.shotLog[i] = G.shots.slice();
    COM.stop(); G.phase = 'holeDone'; G.doneT = 0; trailN = trailN; $('powerMeter').classList.remove('on');
    saveRound();
    const par = h.par, s = G.strokes, d = s - par;
    if (!picked) BG.Audio.cup();
    crowdHole(picked);
    setTimeout(() => { if (G.phase === 'holeDone') showHoleDone(); }, picked ? 700 : 1500);
  }

  function showHoleDone() {
    const h = G.hole, r = G.round, i = G.li, s = r.strokes[i], par = h.par, last = G.li >= G.list.length - 1;
    const totS = r.strokes.filter((x) => x != null).reduce((a, b) => a + b, 0), totP = r.strokes.reduce((a, b, k) => a + (b != null ? G.course.pars[G.list[k]] : 0), 0);
    if (BG.GC && BG.GC.available && !G.attract) BG.GC.onHole(s, par);
    const name = UI.scoreName(s, par), cls = s - par < 0 ? 'good' : s - par === 0 ? 'gold' : 'bad';
    const rows = r.shotLog[i].map((x) => `<tr><td>${x.n}</td><td style="text-align:left">${x.club}${x.note ? ` <i style="color:var(--mut)">(${UI.esc(x.note)})</i>` : ''}</td><td>${x.putt ? Math.round(x.total / FT) + ' ft' : Yd(x.total) + ' yd'}</td><td style="text-align:left">${x.from} → ${x.result}${x.pen ? ' <b style="color:var(--red)">+1</b>' : ''}</td></tr>`).join('');
    $('hdBody').innerHTML = `<div style="color:var(--mut);letter-spacing:.1em;text-transform:uppercase;font-size:12px">${G.course.name} · Hole ${h.no} · Par ${par}</div>
      <div class="big-score ${s - par < 0 ? 'under' : s - par > 0 ? 'over' : 'even'}">${s}</div>
      <div class="t1 ${cls}" style="font-size:24px;font-weight:800">${name}</div>
      <table class="cardtbl" style="margin-top:12px"><tr><th>#</th><th style="text-align:left">Club</th><th>Distance</th><th style="text-align:left">Result</th></tr>${rows}</table>
      <div class="stats"><div class="stat"><b>${r.putts[i]}${r.autoPutts[i] ? ' <small style="font-size:.5em;color:var(--mut)">auto</small>' : ''}</b><span>Putts</span></div><div class="stat"><b>${UI.fmtDiff(totS - totP)}</b><span>Round to par</span></div><div class="stat"><b>${totS}</b><span>Total strokes</span></div></div>
      <button class="btn" id="hdCard">Scorecard</button><button class="btn primary" id="hdNext">${last ? 'Finish round ›' : 'Next hole ›'}</button>`;
    showScr('scrHoleDone'); $('scrHoleDone').classList.remove('hidden');
    $('hdNext').onclick = nextHole; $('hdCard').onclick = () => openCard('scrHoleDone');
  }
  function nextHole() {
    $('scrHoleDone').classList.add('hidden');
    if (G.li >= G.list.length - 1) { endRound(); return; }
    G.li++; startHole();
  }

  function endRound() {
    COM.stop(); clearSave();
    const r = G.round, c = G.course, n = r.list.length;
    const tot = r.strokes.reduce((a, b) => a + (b || 0), 0), par = r.list.reduce((a, h) => a + c.pars[h], 0), d = tot - par;
    const putts = r.putts.reduce((a, b) => a + (b || 0), 0), pen = r.pens.reduce((a, b) => a + (b || 0), 0);
    const fwN = r.list.filter((h, k) => c.pars[h] >= 4).length, fwH = r.fw.filter((x) => x === true).length, gir = r.gir.filter(Boolean).length;
    const teaser = !!(BG.IAP && BG.IAP.isTeaser(c.id, r.list));   // iOS free teaser round (holes 1-5): show the paywall end card; GC onRoundEnd never submits it (not a full 18)
    const mp = G.mp;   // async friends match round (iOS): not a personal best, never on the leaderboards
    const isBest = mp ? false : UI.setBest(c.id, G.diffKey, n, tot), best = mp ? null : UI.getBest(c.id, G.diffKey, n);
    const gcOn = !!(BG.GC && BG.GC.available); if (gcOn && !mp) BG.GC.onRoundEnd(c, G.diffKey, r.list, r.strokes);
    const msg = d <= -4 ? 'A masterclass on the links!' : d <= 0 ? 'Under par in the Dunes — outstanding!' : d <= 8 ? 'A solid round in the wind.' : d <= 20 ? 'The wind and gorse took their toll.' : 'The Dunes bite back. Come again!';
    $('endBody').innerHTML = `<div style="color:var(--mut);letter-spacing:.1em;text-transform:uppercase;font-size:12px">${UI.esc(c.name)} · ${BG.DIFFICULTY[G.diffKey].name} · ${n} holes</div>
      <div class="big-score ${d < 0 ? 'under' : d > 0 ? 'over' : 'even'}">${tot} <span style="font-size:.45em">(${UI.fmtDiff(d)})</span></div>
      <div style="color:var(--sand);margin-bottom:6px">${msg}${isBest ? ' <b style="color:var(--green)">New personal best!</b>' : best != null ? ` · Best: ${best}` : ''}</div>
      ${teaser ? `<div class="pw-card" style="margin:10px 0"><div style="font-weight:800;font-size:18px;color:var(--gold)">That’s the free front five!</div><div style="color:#c5dad7;font-size:14px;margin:4px 0 8px">Unlock all 7 courses, every hole, for a one-time purchase${BG.IAP.price() ? ' of ' + UI.esc(BG.IAP.price()) : ''} — no subscription.</div><button class="btn primary big" id="enUnlock">🔓 Unlock all 7 courses${BG.IAP.price() ? ' — ' + UI.esc(BG.IAP.price()) : ''}</button><br><button class="btn link" id="enRestore">Restore Purchases</button></div>` : ''}
      ${UI.scorecardHTML(r, -1)}
      <div class="stats"><div class="stat"><b>${putts}</b><span>Putts</span></div><div class="stat"><b>${fwN ? fwH + '/' + fwN : '–'}</b><span>Fairways</span></div><div class="stat"><b>${gir}/${n}</b><span>Greens in reg.</span></div><div class="stat"><b>${Math.round(r.longest)} yd</b><span>Longest shot</span></div><div class="stat"><b>${pen}</b><span>Penalties</span></div><div class="stat"><b>${(r.dist / YD / 1760).toFixed(2)} mi</b><span>Ball travel</span></div></div>
      <button class="btn ${teaser ? '' : 'primary'}" id="enAgain">Play again</button>${gcOn ? '<button class="btn" id="enLeaders">🏆 Leaderboard</button>' : ''}<button class="btn" id="enMenu">Choose course</button>`;
    if (mp && BG.MP) {
      $('endBody').innerHTML = `<div style="color:var(--mut);letter-spacing:.1em;text-transform:uppercase;font-size:12px">${UI.esc(c.name)} · ${BG.DIFFICULTY[G.diffKey].name} · ${n} holes · Friends match</div>
        <div class="big-score ${d < 0 ? 'under' : d > 0 ? 'over' : 'even'}">${tot} <span style="font-size:.45em">(${UI.fmtDiff(d)})</span></div>
        <div class="pw-status" id="mpEndStatus" role="status">Sending your round to your friends…</div><div id="mpEndRes"></div>
        ${UI.scorecardHTML(r, -1)}
        <button class="btn primary" id="enMatches">Back to matches</button><button class="btn" id="enMenu">Main menu</button>`;
      BG.MP.submitRound(r, mp).then((res) => {
        const st = $('mpEndStatus'); if (!st) return;
        if (res.ok) { st.textContent = res.match && res.match.status === 'ended' ? 'Match finished!' : 'Round submitted — Game Center will tell your friends it’s their turn.'; $('mpEndRes').innerHTML = res.match ? BG.MP.resultHTML(res.match) : ''; }
        else st.textContent = 'Couldn’t reach Game Center — your round is saved and will be sent automatically next time you open Play Friends.';
        BG.MP.refresh();
      });
    }
    showScr('scrEnd'); $('scrEnd').classList.remove('hidden');
    if (mp && BG.MP) { $('enMatches').onclick = () => { $('scrEnd').classList.add('hidden'); G.phase = 'menu'; BG.MP.open(); }; $('enMenu').onclick = () => toMenu(true); G.phase = 'over'; $('hud').classList.add('hidden'); return; }
    $('enAgain').onclick = () => { $('scrEnd').classList.add('hidden'); startRound(G.course, G.diffKey, G.holesOpt); };
    if (gcOn && $('enLeaders')) $('enLeaders').onclick = () => gcShow(() => BG.GC.showLeaderboard(c.id, G.diffKey));
    $('enMenu').onclick = toMenu;
    if (teaser) { $('enUnlock').onclick = () => showPaywall(); $('enRestore').onclick = () => showPaywall({ restore: true }); }
    G.phase = 'over'; $('hud').classList.add('hidden');
    if (d < 0) react(2, 'Round complete', 'Under par — well played!', 400); else if (d <= 8) react(1, 'Round complete', '', 400);
  }

  // ------------------------------------------------------------------ round / hole flow
  function holeList(course, opt) {
    const n = course.holes, all = [...Array(n).keys()]; if (Array.isArray(opt)) return opt;
    if (opt === 'front') return all.slice(0, 9); if (opt === 'back') return all.slice(9); if (opt === 'first') return all.slice(0, 4); if (opt === 'free') return all.slice(0, 5);
    return all;
  }
  function startRound(course, diffKey, opt, mpCtx) {
    if (BG.IAP && !BG.IAP.allowed(course.id, holeList(course, opt))) { showPaywall(); return; }   // iOS freemium guard (always allowed on the web)
    BG.Audio.init();
    G.course = course; G.diffKey = diffKey; G.diff = BG.DIFFICULTY[diffKey]; G.holesOpt = opt; G.seed = mpCtx ? mpCtx.seed | 0 : (Math.random() * 1e6) | 0; G.mp = mpCtx ? { matchID: mpCtx.matchID, seed: G.seed } : null;   // friends match: seed shared by all players => identical wind/weather
    G.list = holeList(course, opt); G.li = 0;
    G.round = { course, diffKey, list: G.list, strokes: G.list.map(() => null), putts: G.list.map(() => 0), pens: G.list.map(() => 0), fw: G.list.map(() => null), gir: G.list.map(() => false), shotLog: G.list.map(() => []), autoPutts: G.list.map(() => 0), longest: 0, dist: 0 };
    startHole();
  }
  function startHole() {
    COM.stop(); G.loading = true;
    hideModals(); showScr('scrLoading'); $('scrLoading').classList.remove('hidden'); $('loadTxt').textContent = `Building ${G.course.name} — hole ${G.list[G.li] + 1}…`;
    $('hud').classList.add('hidden'); $('toast').classList.remove('on');
    setTimeout(() => {
      loadHole(false);
      screens.forEach((s) => $(s).classList.add('hidden'));
      $('hud').classList.remove('hidden');
      G.phase = 'flyover'; G.flyT = 0; G.paused = false; G.view = 'normal'; $('miniWrap').classList.remove('big');
      const h = G.hole;
      toast(`<div class="t1">${UI.esc(G.course.name)} · Hole ${h.no}</div><div class="t2">Par ${h.par} · ${h.yds} yd — ${h.tags.join(' · ')}<br>${UI.esc(holeFlavor())}</div>`, 4200);
      hint('Click, tap or press Space to skip the fly-over');
      startCommentary();
      G.loading = false; saveRound();
    }, 40);
  }
  // TV-style host commentary for this hole (pre-voiced clip; silent if disabled, muted, or no clip exists)
  function startCommentary() {
    const nxt = G.list[G.li + 1];
    COM.play(G.course.id, G.list[G.li] + 1);
    if (nxt != null) COM.prefetch(G.course.id, nxt + 1);
  }
  function holeFlavor() { return 'Wind ' + Math.round(G.wind.mph()) + ' mph' + (G.diff.id === 'simple' ? ' (light)' : ''); }
  function toMenu(main) {
    COM.stop();
    G.phase = 'menu'; G.paused = false; $('hud').classList.add('hidden'); hideModals(); showScr(main === true ? 'scrMenu' : 'scrCourses');
    UI.courseCards(pickCourse); BG.Audio.ambient(0, false);
  }
  function pickCourse(c) {
    const IAP = BG.IAP, fm = !!(IAP && IAP.freemium && !IAP.unlocked());
    if (fm && c.id !== IAP.FREE_COURSE) { showPaywall(); return; }   // locked course (iOS only)
    G.course = c; $('diffTitle').textContent = c.name; showScr('scrDiff'); pendingHoles = fm ? 'free' : 'all';
    const rd = () => { UI.diffCards(G.diffKey, (k) => { G.diffKey = k; rd(); }); UI.holesPick(c, pendingHoles, (k) => { if (fm && k !== 'free') { showPaywall(); return; } pendingHoles = k; rd(); }); };
    rd();
  }
  let pendingHoles = 'all';

  function startAttract() {
    G.course = BG.COURSES[1]; G.diffKey = 'normal'; G.diff = BG.DIFFICULTY.normal; G.seed = 3;
    loadHole({ idx: 3 }); G.phase = 'menu';
  }

  // ------------------------------------------------------------------ camera
  const _v = new THREE.Vector3();
  function setCamTarget(pos, look, k) { G._cp = pos; G._cl = look; G.camK = k; }
  const camT = { p: new THREE.Vector3(), l: new THREE.Vector3(), k: 5 };
  function groundY(x, z) { return G.hole.h(x, z); }
  function updateCamera(dt) {
    const h = G.hole, b = G.ball; if (!h) return;
    const ph = G.phase, putt = G.club.type === 'putter';
    let k = 5;
    if (G.view === 'over' && ph !== 'flyover') {
      const px = (b.x + h.pin.x) / 2, pz = (b.z + h.pin.z) / 2, d = Math.hypot(h.pin.x - b.x, h.pin.z - b.z);
      camT.p.set(px + 0.01, Math.max(90, d * 1.15 + 40) + groundY(px, pz), pz + 0.01 + d * 0.03); camT.l.set(px, groundY(px, pz), pz); k = 3.5;
    } else if (G.attract || ph === 'menu') {
      const t = G.t * 0.07, g = h.green, rad = 55;
      camT.p.set(g.x + Math.cos(t) * rad, groundY(g.x, g.z) + 22 + Math.sin(t * 1.3) * 5, g.z + Math.sin(t) * rad); camT.l.set(g.x, groundY(g.x, g.z) + 2, g.z); k = 20;
    } else if (ph === 'flyover') {
      const T = 5.2, t = clamp(G.flyT / T, 0, 1), e = t * t * (3 - 2 * t), s = e * h.L * 0.97;
      const p = h.pathAt(s), p2 = h.pathAt(Math.min(h.L, s + 70));
      camT.p.set(p.x - p.hx * 28, groundY(p.x, p.z) + 24 - 10 * e, p.z - p.hz * 28); camT.l.set(p2.x, groundY(p2.x, p2.z) + 2, p2.z); k = 4.5;
    } else if (ph === 'ball') {
      const sp = Math.hypot(b.vx, b.vz), cs = G.curShot; let dx, dz;
      if (sp > 1.5) { dx = b.vx / sp; dz = b.vz / sp; } else { const a = aimDir(cs.yaw); dx = a[0]; dz = a[1]; }
      if (!G._fdx) { G._fdx = dx; G._fdz = dz; } G._fdx += (dx - G._fdx) * Math.min(1, dt * 3); G._fdz += (dz - G._fdz) * Math.min(1, dt * 3);
      const fl = Math.hypot(G._fdx, G._fdz) || 1; dx = G._fdx / fl; dz = G._fdz / fl;
      const putting = cs.putt, back = putting ? 2.2 : b.mode === 'flight' ? 9 : 7, up = putting ? 1.0 : b.mode === 'flight' ? 2.8 : 2.2;
      const cx = b.x - dx * back, cz = b.z - dz * back, cy = Math.max(groundY(cx, cz) + 0.7, b.y + up);
      camT.p.set(cx, cy, cz); camT.l.set(b.x + dx * (putting ? 2 : 10), Math.max(groundY(b.x, b.z), b.y - 0.8), b.z + dz * (putting ? 2 : 10)); k = putting ? 5 : 4.2;
    } else if (ph === 'holeDone') {
      const t = G.t * 0.35, g = h.pin, r = 7;
      camT.p.set(g.x + Math.cos(t) * r, groundY(g.x, g.z) + 2.4, g.z + Math.sin(t) * r); camT.l.set(g.x, g.y + 0.7, g.z); k = 4;
    } else {
      // first-person aim view behind the ball
      G._fdx = 0;
      const f = aimDir(G.aimYaw), back = putt ? 1.7 : 3.0, eye = putt ? 0.95 : 1.4;
      const cx = b.x - f[0] * back, cz = b.z - f[1] * back, gy = groundY(cx, cz);
      const cy = Math.max(gy + 0.45, (b.y - R) + eye);
      let T = putt ? Math.min(distPin() + 0.5, 11) : 130;
      const lx = b.x + f[0] * T, lz = b.z + f[1] * T;
      let pitch = Math.atan2((putt ? groundY(lx, lz) : groundY(lx, lz) + 2.5) - cy, T + back);
      pitch = putt ? clamp(pitch, -0.7, -0.08) : clamp(pitch - 0.09, -0.28, 0.04);
      const dist = T + back; camT.p.set(cx, cy, cz); camT.l.set(cx + f[0] * dist, cy + Math.tan(pitch) * dist, cz + f[1] * dist);
      k = G.hold !== 0 ? 14 : 5;
    }
    camT.k = k;
    const a = 1 - Math.exp(-k * dt);
    G.camPos.lerp(camT.p, a); G.camLook.lerp(camT.l, a);
    const gy = groundY(G.camPos.x, G.camPos.z) + 0.5; if (G.camPos.y < gy) G.camPos.y = gy;
    camera.position.copy(G.camPos); camera.lookAt(G.camLook);
    skyDome.position.copy(camera.position);
  }
  function snapCamera() { G.camPos.copy(camT.p); G.camLook.copy(camT.l); }

  // ------------------------------------------------------------------ HUD
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
  function updateHud() {
    const h = G.hole, b = G.ball, r = G.round, club = G.club;
    if (!h || !r || G.attract) return;
    const par = r.list.reduce((a, hh, k) => a + (r.strokes[k] != null ? G.course.pars[hh] : 0), 0), tot = r.strokes.reduce((a, s) => a + (s || 0), 0);
    setText('hcCourse', UI.esc(G.course.name)); setText('hcHole', 'Hole ' + h.no); setText('hcPar', h.par); setText('hcYds', h.yds);
    setText('hcStrokes', Math.min(G.strokes + 1, 99)); setText('hcScore', r.strokes.some((x) => x != null) ? `Round ${UI.fmtDiff(tot - par)}` : 'Round E'); setText('hcTags', h.tags.slice(0, 2).join(' · '));
    const d = distPin(), onGreen = G.lieSurf === S.GREEN || club.type === 'putter';
    const useFt = onGreen && d / FT < 120;
    setText('dToPin', useFt ? `${Math.round(d / FT)}<small> ft</small>` : `${Yd(d)}<small> yd</small>`);
    const elev = (h.pin.y - b.y) / YD, ev = Math.abs(elev) >= 1 ? ` · ${elev > 0 ? '▲' : '▼'}${Math.abs(Math.round(elev))} yd` : '';
    setText('dSub', `${lieLabel(G.lieSurf)}${useFt ? '' : ev}`);
    const slopeTxt = BG.Slope && BG.Slope.isEnabled() && G.lieSurf === S.GREEN ? `slope ${BG.Slope.at(h, b.x, b.z).toFixed(1)}%` : '';   // optional: grade at the ball
    if (club.type === 'putter' && G.diff.id !== 'realistic' && G.phase !== 'ball') {
      const g = readGreen(); const br = Math.abs(g.lat) < 0.4 ? 'straight' : `breaks ${g.lat > 0 ? 'right' : 'left'} ${Math.abs(g.lat).toFixed(1)}%`;
      const sl = Math.abs(g.up) < 0.4 ? 'flat' : g.up > 0 ? `uphill ${g.up.toFixed(1)}%` : `downhill ${Math.abs(g.up).toFixed(1)}%`;
      setText('dPutt', `${br} · ${sl}` + (slopeTxt ? ' · ' + slopeTxt : ''));
    } else setText('dPutt', slopeTxt && G.phase !== 'ball' ? slopeTxt : '');
    const ci = G.clubIdx, ct = club.type === 'putter' ? 'Green' : `${club.carry} yd`;
    setText('clubName', club.name); setText('clubSub', ci === G.sugIdx ? `${ct} · <span class="sug">★ suggested</span>` : ct);
    // wind
    const w = G.wind.at(10), f = aimDir(G.aimYaw), fw = (w[0] * f[0] + w[1] * f[1]) / MPH, rt = (w[0] * -f[1] + w[1] * f[0]) / MPH;
    const sp = G.wind.mph(); const ang = Math.atan2(rt, fw) * 180 / Math.PI;
    $('windArrow').setAttribute('transform', `rotate(${ang.toFixed(0)})`);
    setText('windMph', `${Math.round(sp)}<small> mph</small>`);
    setText('windSub', `${fw >= 0 ? 'Tail' : 'Head'} ${Math.abs(Math.round(fw))} · Cross ${Math.abs(Math.round(rt))} ${rt >= 0 ? '→' : '←'}`);
    // reticle visibility
    $('reticle').style.display = (G.phase === 'aim' || G.phase === 'drag') && G.view === 'normal' ? '' : 'none';
    $('aimBtns').style.opacity = G.phase === 'aim' ? 1 : 0; $('aimBtns').style.pointerEvents = G.phase === 'aim' ? '' : 'none';
    $('clubBar').style.display = G.phase === 'aim' || G.phase === 'drag' || G.phase === 'settle' ? '' : 'none';
  }

  function updateLabels() {
    const lab = $('pinLabel'), h = G.hole;
    if (!h || G.attract || !(G.phase === 'aim' || G.phase === 'drag' || G.phase === 'flyover' || G.phase === 'settle') || G.view === 'over') { lab.style.display = 'none'; return; }
    _v.set(h.pin.x, h.pin.y + 2.7 * pinGroup.scale.y, h.pin.z).project(camera);
    if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { lab.style.display = 'none'; return; }
    const d = distPin();
    lab.style.display = ''; lab.textContent = d / FT < 60 ? `${Math.round(d / FT)} ft` : `${Yd(d)} yd`;
    lab.style.left = ((_v.x * 0.5 + 0.5) * VW).toFixed(0) + 'px'; lab.style.top = ((-_v.y * 0.5 + 0.5) * VH - 6).toFixed(0) + 'px';
  }

  function drawMini() {
    const m = G.mini, c = $('mini'), g = c.getContext('2d'); if (!m || !G.hole) return;
    const w = c.width, hh = c.height; g.clearRect(0, 0, w, hh);
    const bw = m.x1 - m.x0, bh = m.z1 - m.z0, sc = Math.min(w / bw, hh / bh), ox = (w - bw * sc) / 2, oy = (hh - bh * sc) / 2;
    const X = (x) => ox + (x - m.x0) * sc, Z = (z) => oy + (z - m.z0) * sc, h = G.hole;
    g.fillStyle = '#2d5a4c'; g.fillRect(0, 0, w, hh);
    g.save(); g.imageSmoothingEnabled = true;
    g.drawImage(m.img, (m.x0 - h.x0) / h.res / m.s, (m.z0 - h.z0) / h.res / m.s, bw / h.res / m.s, bh / h.res / m.s, ox, oy, bw * sc, bh * sc); g.restore();
    // shots so far
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.2; g.setLineDash([5, 4]); g.beginPath();
    let sx = h.tee.x, sz = h.tee.z; g.moveTo(X(sx), Z(sz));
    (G.trailPts || []).forEach((p) => g.lineTo(X(p[0]), Z(p[1]))); g.stroke(); g.setLineDash([]);
    // aim line
    if (G.phase === 'aim' || G.phase === 'drag' || G.phase === 'settle') {
      const f = aimDir(G.aimYaw), b = G.ball; g.strokeStyle = 'rgba(255,215,90,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(b.x), Z(b.z)); g.lineTo(X(b.x + f[0] * 200), Z(b.z + f[1] * 200)); g.stroke();
    }
    g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc(X(h.pin.x), Z(h.pin.z), 4.5, 0, 6.3); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(G.ball.x), Z(G.ball.z), 4, 0, 6.3); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, hh - 22, w, 22); g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText(`Hole ${h.no} · ${h.yds} yd`, w / 2, hh - 6);
  }

  // ------------------------------------------------------------------ aim / drag preview
  function dragInfo() {
    const d = G.drag; if (!d) return null;
    const dx = d.x - d.ax, dy = d.y - d.ay, pl = Math.hypot(dx, dy), p = clamp(pl / pullMax(), 0, 1.12);
    return { dx, dy, pl, p, yawOff: yawFromPull(dx, dy), ok: dy > 6 && pl > 16 };
  }
  const _tmpWind = { at: () => [0, 0] };
  function setPoints(arr) {
    const a = aimGeo.attributes.position.array, n = Math.min(AIM_N, arr.length);
    for (let i = 0; i < n; i++) { a[i * 3] = arr[i][0]; a[i * 3 + 1] = arr[i][1]; a[i * 3 + 2] = arr[i][2]; }
    aimGeo.setDrawRange(0, n); aimGeo.attributes.position.needsUpdate = true;
  }
  function ringAt(x, z, r) { const h = G.hole; landRing.position.set(x, h.h(x, z) + 0.35, z); const cd = camera.position.distanceTo(landRing.position); landRing.scale.setScalar(Math.max(r, cd * 0.012)); landRing.visible = true; }
  function updatePreview() {
    const di = dragInfo(), h = G.hole, pm = $('powerMeter');
    if (!di || !di.ok || G.phase !== 'drag') { aimGeo.setDrawRange(0, 0); landRing.visible = false; pm.classList.remove('on'); return; }
    pm.classList.add('on'); $('pmFill').style.width = (di.p / 1.12 * 100).toFixed(1) + '%';
    const club = G.club, shot = baseShot(di.p, di.yawOff), prev = G.diff.preview, b = G.ball;
    let txt = '';
    if (club.type === 'putter') {
      const dm = shot.puttDist; txt = `Putt ${Math.round(dm / FT)} ft` + (G.diff.id !== 'realistic' ? ` · hole ${Math.round(distPin() / FT)} ft` : '');
      if (prev === 'full') {
        const pp = P.putPreview(b, G.env, shot); setPoints(pp.pts.map((q) => [q[0], h.h(q[0], q[2]) + 0.07, q[2]])); ringAt(pp.end.x, pp.end.z, 0.25);
      } else if (prev === 'line') {
        const f = aimDir(shot.yaw), pts = []; for (let s = 0; s <= dm; s += 0.5) pts.push([b.x + f[0] * s, h.h(b.x + f[0] * s, b.z + f[1] * s) + 0.07, b.z + f[1] * s]); setPoints(pts); landRing.visible = false;
      } else { aimGeo.setDrawRange(0, 0); landRing.visible = false; }
    } else {
      txt = `${Math.round(di.p * 100)}%`;
      if (prev === 'full') {
        const pr = P.preview(b, G.env, shot); setPoints(pr.pts); if (pr.land) { ringAt(pr.land.x, pr.land.z, 1.5); txt += ` · lands ≈ ${Yd(Math.hypot(pr.land.x - b.x, pr.land.z - b.z))} yd`; }
      } else if (prev === 'line') {
        const pr = P.preview(b, Object.assign({}, G.env, { wind: _tmpWind }), shot); const f = aimDir(shot.yaw), pts = [];
        if (pr.land) { const cd = Math.hypot(pr.land.x - b.x, pr.land.z - b.z); for (let s = 4; s <= cd; s += Math.max(3, cd / 100)) pts.push([b.x + f[0] * s, h.h(b.x + f[0] * s, b.z + f[1] * s) + 0.25, b.z + f[1] * s]); setPoints(pts); ringAt(b.x + f[0] * cd, b.z + f[1] * cd, 1.5); txt += ` · carry ≈ ${Yd(cd)} yd (no wind)`; }
      } else { aimGeo.setDrawRange(0, 0); landRing.visible = false; txt += ` · aim ${(di.yawOff / D2R >= 0 ? '+' : '') + (di.yawOff / D2R).toFixed(1)}°`; }
    }
    setText('pmText', txt);
    aimPts.material.color.set(di.p > 1 ? 0xff7a66 : 0xffe38a);
  }

  function clearFx() { fx.setTransform(1, 0, 0, 1, 0, 0); fx.shadowBlur = 0; fx.shadowColor = 'rgba(0,0,0,0)'; fx.clearRect(0, 0, fxc.width, fxc.height); fx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  let fxOn = true;
  function drawFx() {
    const di = dragInfo(), want = !!di && G.phase === 'drag';
    if (!want) { if (fxOn) { clearFx(); fxc.width = fxc.width; fx.setTransform(DPR, 0, 0, DPR, 0, 0); fxc.style.display = 'none'; fxOn = false; } return; }
    if (!fxOn) { fxc.style.display = 'block'; fxOn = true; }
    clearFx();
    const d = G.drag, col = di.p < 0.6 ? '#7be07f' : di.p < 1.0 ? '#ffd34d' : '#ff6b5e';
    const fork = 30;
    fx.lineCap = 'round'; fx.lineJoin = 'round';
    // sling frame
    fx.strokeStyle = '#6b4a2b'; fx.lineWidth = 7; fx.beginPath(); fx.moveTo(d.ax, d.ay + 36); fx.lineTo(d.ax, d.ay + 6); fx.moveTo(d.ax, d.ay + 6); fx.lineTo(d.ax - fork, d.ay - 26); fx.moveTo(d.ax, d.ay + 6); fx.lineTo(d.ax + fork, d.ay - 26); fx.stroke();
    // elastic
    fx.strokeStyle = col; fx.lineWidth = Math.max(2, 6 - di.p * 3); fx.beginPath(); fx.moveTo(d.ax - fork, d.ay - 26); fx.lineTo(d.x, d.y); fx.lineTo(d.ax + fork, d.ay - 26); fx.stroke();
    // launch direction arrow
    if (di.ok) {
      const ang = Math.atan2(-di.dy, -di.dx), len = 50 + di.p * 150, ex = d.ax + Math.cos(ang) * len, ey = d.ay + Math.sin(ang) * len;
      fx.setLineDash([2, 10]); fx.strokeStyle = 'rgba(255,255,255,.85)'; fx.lineWidth = 4; fx.beginPath(); fx.moveTo(d.ax, d.ay); fx.lineTo(ex, ey); fx.stroke(); fx.setLineDash([]);
      fx.fillStyle = 'rgba(255,255,255,.9)'; fx.beginPath(); fx.moveTo(ex + Math.cos(ang) * 14, ey + Math.sin(ang) * 14); fx.lineTo(ex + Math.cos(ang + 2.5) * 12, ey + Math.sin(ang + 2.5) * 12); fx.lineTo(ex + Math.cos(ang - 2.5) * 12, ey + Math.sin(ang - 2.5) * 12); fx.fill();
    }
    // anchor + pouch
    fx.strokeStyle = 'rgba(255,255,255,.7)'; fx.lineWidth = 2; fx.beginPath(); fx.arc(d.ax, d.ay, 12, 0, 6.3); fx.stroke();
    fx.fillStyle = '#fff'; fx.strokeStyle = col; fx.lineWidth = 4; fx.beginPath(); fx.arc(d.x, d.y, 11, 0, 6.3); fx.fill(); fx.stroke();
    // power arc
    fx.strokeStyle = col; fx.lineWidth = 5; fx.beginPath(); fx.arc(d.ax, d.ay, 26, -Math.PI / 2, -Math.PI / 2 + Math.min(di.p, 1) * 6.2832); fx.stroke();
    fx.fillStyle = '#fff'; fx.font = 'bold 15px sans-serif'; fx.textAlign = 'center'; fx.shadowColor = '#000'; fx.shadowBlur = 5; fx.fillText(Math.round(di.p * 100) + '%', d.x, d.y + 32); fx.shadowBlur = 0;
  }

  // ------------------------------------------------------------------ per-frame update
  const keys = {};
  let ambT = 0, firstShots = 0;
  function update(dt) {
    const h = G.hole; if (!h) return;
    G.wind.update(dt * (G.phase === 'ball' ? G.speedMul : 1));
    switch (G.phase) {
      case 'flyover': G.flyT += dt; if (G.flyT > 5.4) endFly(); break;
      case 'ball': stepBallPhase(dt); break;
      case 'settle': G.settleT += dt; if (G.settleT > 1.0) { G.phase = 'aim'; showAimHint(); } break;
      case 'aim': {
        let dir = G.hold || ((keys.arrowright || keys.d) ? 1 : 0) - ((keys.arrowleft || keys.a) ? 1 : 0);
        if (dir) { G.holdT = (G.holdT || 0) + dt; const rate = keys.shift ? 3 : Math.min(36, 9 + G.holdT * 18); G.aimYaw += dir * rate * D2R * dt; } else G.holdT = 0;
        break;
      }
      default: break;
    }
    G.holdActive = G.hold !== 0;
    updateCamera(dt);
    updateSceneObjects(dt);
  }
  function endFly() { G.phase = 'aim'; $('toast').classList.remove('on'); showAimHint(); }
  function showAimHint() {
    if (G.phase !== 'aim') return;
    if (firstShots < 3) { hint(G.club.type === 'putter' ? 'Pull back for a putt — pull distance sets putt length' : 'Press & pull back (like a slingshot), then release to swing'); }
    else hint('');
    firstShots++;
  }
  function updateSceneObjects(dt) {
    const h = G.hole, b = G.ball, cp = camera.position;
    const cd = Math.hypot(b.x - cp.x, b.y - cp.y, b.z - cp.z);
    const near = G.phase === 'aim' || G.phase === 'drag' || G.phase === 'settle';
    let sc = Math.max(1, cd * 0.0026 / R); if (near && !G.attract) sc = Math.max(sc, G.club.type === 'putter' ? 1.25 : 1.9); sc = Math.min(sc, 60);
    if (G.attract || G.phase === 'menu') sc = 1;
    ballMesh.position.set(b.x, b.y, b.z); ballMesh.scale.setScalar(sc); ballMesh.visible = !G.attract && G.phase !== 'holeDone' || false;
    if (b.mode === 'holed') ballMesh.visible = false;
    const gy = h.h(b.x, b.z), ht = Math.max(0, b.y - R - gy);
    shadowMesh.visible = ballMesh.visible && (G.phase === 'ball' || ht > 0.05);
    shadowMesh.position.set(b.x, gy + 0.08, b.z); shadowMesh.scale.setScalar(R * sc * 1.2 * (1 + ht * 0.01)); shadowMesh.material.opacity = 0.4 * clamp(1 - ht / 90, 0.2, 1);
    teePeg.visible = ballMesh.visible && G.strokes === 0 && G.lieSurf === S.TEE && G.phase !== 'ball'; teePeg.position.set(b.x, b.y - R - 0.02, b.z);
    trail.visible = G.phase === 'ball' || G.phase === 'settle';
    // pin scale & flag
    const pd = Math.hypot(h.pin.x - cp.x, h.pin.y - cp.y, h.pin.z - cp.z);
    pinGroup.scale.setScalar(clamp(pd / 55, 1, 4.5));
    const w = G.wind.at(2.2), spd = Math.hypot(w[0], w[1]);
    flagHinge.rotation.y = Math.atan2(-w[1], w[0]); flagHinge.rotation.z = -(1 - P.smooth(0, 6, spd)) * 1.25;
    const pa = flagGeo.attributes.position.array, amp = 0.015 + 0.012 * spd, om = 4 + spd * 1.4;
    for (let i = 0; i < pa.length; i += 3) { const x = flagBase[i], k = x / 0.66; pa[i + 2] = Math.sin(x * 9 - G.t * om) * amp * k * (1 + 0.5 * Math.sin(G.t * 1.7)); pa[i + 1] = flagBase[i + 1] - k * 0.04; }
    flagGeo.attributes.position.needsUpdate = true;
    CR.update(dt, G.phase === 'ball' ? (G.ballSim || 0) : dt, { camera, ball: b, phase: G.phase });
    G.ballSim = 0;
    Gfx.timeU.value = G.t; ocean.material.uniforms.uTime.value = G.t;
    if (nearGrass) nearGrass.userData.update(h, camera, G.t, G.wind.at(1.0));
    const lvN = Gfx.level(); if (lvN.shadow) { sun.userData.groundY = h.h(cp.x, cp.z); Gfx.updateShadow(sun, camera, lvN, sunDir); }
    ambT -= dt; if (ambT < 0) { ambT = 0.5; BG.Audio.ambient(G.wind.mph(), !!h.coast); }
  }

  // ------------------------------------------------------------------ input
  function toggleView() { if (!(G.phase === 'aim' || G.phase === 'settle' || G.phase === 'drag')) return; G.view = G.view === 'over' ? 'normal' : 'over'; }
  function releaseDrag() {
    const d = G.drag, di = dragInfo(); G.drag = null; clearFx();
    G.phase = 'aim';
    if (!di || !di.ok || di.pl < 22) { hint('Pull back farther (away from the target), then release'); aimGeo.setDrawRange(0, 0); landRing.visible = false; $('powerMeter').classList.remove('on'); return; }
    let q = 1;
    if (G.diff.id !== 'simple') {
      const ux = di.dx / di.pl, uy = di.dy / di.pl; let s2 = 0, n = 0;
      for (const pt of d.pts) { const rx = pt.x - d.ax, ry = pt.y - d.ay, along = rx * ux + ry * uy; if (along < 14) continue; const perp = rx * -uy + ry * ux; s2 += perp * perp; n++; }
      const dev = n ? Math.sqrt(s2 / n) : 0; q = clamp(1 - dev / di.pl / 0.16, 0, 1);
      const now = performance.now(), rec = d.pts.filter((p) => now - p.t < 100);
      if (rec.length > 1) { const a = rec[0], b = rec[rec.length - 1], dtm = Math.max(16, b.t - a.t) / 1000, v = Math.hypot(b.x - a.x, b.y - a.y) / dtm; q *= clamp(1 - (v - 700) / 3500, 0.45, 1); }
    }
    takeShot(di.p, di.yawOff, q);
  }
  glc.addEventListener('pointerdown', (e) => {
    BG.Audio.init(); if (G.paused || anyModal()) return;
    if (G.phase === 'flyover') { endFly(); return; }
    if (G.phase === 'ball') { G.speedMul = G.speedMul === 1 ? 3 : 1; hint(G.speedMul > 1 ? 'Fast-forward' : ''); return; }
    if (G.view === 'over') { G.view = 'normal'; return; }
    if (G.phase === 'settle') { G.phase = 'aim'; }
    if (G.phase !== 'aim' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    G.drag = { ax: e.clientX, ay: e.clientY, x: e.clientX, y: e.clientY, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], id: e.pointerId };
    G.phase = 'drag'; hint('');
    try { glc.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();
  });
  glc.addEventListener('pointermove', (e) => {
    const d = G.drag; if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX; d.y = e.clientY; d.pts.push({ x: d.x, y: d.y, t: performance.now() }); if (d.pts.length > 400) d.pts.shift();
  });
  const endPtr = (e) => { const d = G.drag; if (!d || e.pointerId !== d.id) return; d.x = e.clientX; d.y = e.clientY; if (e.type === 'pointercancel') { G.drag = null; G.phase = 'aim'; clearFx(); return; } releaseDrag(); };
  glc.addEventListener('pointerup', endPtr); glc.addEventListener('pointercancel', endPtr);
  glc.addEventListener('wheel', (e) => { if (G.phase === 'aim' && !anyModal()) { setClub(G.clubIdx + (e.deltaY > 0 ? 1 : -1)); e.preventDefault(); } }, { passive: false });
  glc.addEventListener('contextmenu', (e) => e.preventDefault());

  function holdBtn(id, dir) {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { G.hold = dir; G.holdT = 0; try { el.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); });
    const up = () => { G.hold = 0; }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  }
  holdBtn('aimL', -1); holdBtn('aimR', 1);
  $('aimPin').onclick = () => { const b = G.ball, h = G.hole; G.aimYaw = Math.atan2(h.pin.x - b.x, -(h.pin.z - b.z)); BG.Audio.ui(); };
  $('clubPrev').onclick = () => setClub(G.clubIdx - 1); $('clubNext').onclick = () => setClub(G.clubIdx + 1);
  $('clubMain').onclick = () => {
    if (G.phase !== 'aim' && G.phase !== 'settle') return;
    const sug = G.sugIdx;
    $('clubsBody').innerHTML = `<h2>Choose a club</h2><div class="clubgrid">${CLUBS.map((c, i) => `<div class="clubopt ${i === G.clubIdx ? 'sel' : ''}" data-i="${i}"><b>${c.name}</b><span>${c.type === 'putter' ? 'Green' : c.carry + ' yd'}${i === sug ? ' <span class="sug">★</span>' : ''}</span></div>`).join('')}</div><button class="btn" data-close="1">Close</button>`;
    $('scrClubs').classList.remove('hidden');
  };
  $('clubsBody').addEventListener('click', (e) => { const o = e.target.closest('.clubopt'); if (o) { setClub(+o.dataset.i); $('scrClubs').classList.add('hidden'); } });
  $('miniWrap').onclick = () => $('miniWrap').classList.toggle('big');
  $('btnView').onclick = toggleView;
  const refreshCom = () => { $('btnCom').classList.toggle('off', !COM.isEnabled()); };
  COM.onChange((on, cur) => { $('comPill').classList.toggle('on', on); if (on) { comT0 = performance.now(); comDur = cur.dur * 1000; } });
  let comT0 = 0, comDur = 1;
  setInterval(() => { if (COM.playing()) $('cpFill').style.width = Math.min(100, (performance.now() - comT0) / comDur * 100) + '%'; }, 200);
  const toggleCom = () => { const on = COM.toggle(); refreshCom(); hint(on ? 'Hole commentary on' : 'Hole commentary off'); if (on && (G.phase === 'flyover' || (G.phase === 'aim' && !G.strokes))) startCommentary(); setTimeout(() => hint(''), 1800); };
  $('btnCom').onclick = toggleCom; $('comSkip').onclick = (e) => { e.stopPropagation(); COM.stop(); };
  refreshCom();
  $('btnSound').onclick = () => { const m = BG.Audio.toggle(); $('btnSound').style.opacity = m ? 0.45 : 1; };
  $('btnCard').onclick = () => openCard();
  $('btnMenu').onclick = () => pause(true);

  function openCard(returnTo) {
    G._cardReturn = returnTo || null;
    $('cardBody').innerHTML = `<h2>${UI.esc(G.course.name)} — Scorecard</h2><div style="color:var(--mut);font-size:13px;margin-bottom:6px">${G.diff.name} · ${G.round.list.length} holes · Black tees</div>${UI.scorecardHTML(G.round, G.li)}<button class="btn primary" data-close="card">Close</button>`;
    if (returnTo) $(returnTo).classList.add('hidden');
    $('scrCard').classList.remove('hidden'); if (!returnTo) G.paused = true;
  }
  function closeCard() { $('scrCard').classList.add('hidden'); if (G._cardReturn) $(G._cardReturn).classList.remove('hidden'); else G.paused = false; G._cardReturn = null; }
  function pause(on) {
    if (on) COM.stop();
    if (G.phase === 'menu' || G.phase === 'over') return;
    if (on) { G.paused = true; $('scrPause').classList.remove('hidden'); } else { G.paused = false; $('scrPause').classList.add('hidden'); }
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]'); if (!c) return;
    if (c.dataset.close === 'card') closeCard();
    else { $('scrHelp').classList.add('hidden'); $('scrClubs').classList.add('hidden'); if (G.phase === 'menu' && $('scrMenu').classList.contains('hidden') === false) {} }
  });
  $('pmResume').onclick = () => pause(false);
  $('pmCard').onclick = () => { $('scrPause').classList.add('hidden'); openCard(); };
  $('pmHow').onclick = () => { $('helpBody').innerHTML = UI.helpHTML(); $('scrHelp').classList.remove('hidden'); };
  $('pmPick').onclick = () => { pause(false); const h = G.hole; G.strokes = Math.max(G.strokes, h.par + 4); toast('<div class="t1 bad">Picked up</div>', 1500); holeOut(true); };
  $('pmQuit').onclick = () => confirmBox({ title: 'Quit this round?', text: 'This abandons the round and deletes its autosave. To pick it up again later, use Save &amp; Quit instead.', ok: 'Quit &amp; discard', danger: true, cancel: 'Back' }, () => { clearSave(); G.paused = false; toMenu(); });
  $('pmSave').onclick = () => {
    if (saveRound()) { SAVE_NOTE.msg = 'Round saved — pick it up any time with Continue.'; SAVE_NOTE.good = true; G.paused = false; toMenu(true); }
    else confirmBox({ title: 'Couldn’t save', text: 'Your browser blocked saving (storage unavailable or full). Quit anyway and lose this round?', ok: 'Quit without saving', danger: true, cancel: 'Back' }, () => { G.paused = false; toMenu(true); });
  };

  // ------------------------------------------------------------------ Save & Continue Later
  // One slot in localStorage ('bg.save', JSON, version SAVE_V). Written after every shot, at the start of each hole and when a hole is
  // finished (also on tab hide); cleared when the round completes. See readSave() for validation of corrupt / old saves.
  const SAVE_KEY = 'bg.save', SAVE_V = 2, SAVE_NOTE = { msg: '', good: false };
  const SAVE_PHASES = ['flyover', 'aim', 'drag', 'settle', 'holeDone'];   // 'ball' (shot in flight) is never saved: the previous autosave is the pre-shot state
  const numArr = (a, n, f) => Array.isArray(a) && a.length === n && a.every(f);
  const isNum = (x) => typeof x === 'number' && isFinite(x), nullNum = (x) => x === null || isNum(x), nullBool = (x) => x === null || typeof x === 'boolean';
  function saveSummary(d, course) {
    const r = d.round; let played = 0, diff = 0;
    r.strokes.forEach((st, k) => { if (st != null) { played++; diff += st - course.pars[d.list[k]]; } });
    const holeNo = d.list[d.li] + 1;
    return { played, toPar: diff, holeNo, line: `${course.name}, hole ${holeNo}, ${played ? UI.fmtDiff(diff) + ' thru ' + played : 'no holes completed yet'}` };
  }
  function saveRound() {
    try {
      if (G.attract || G.loading || !G.round || !G.hole || !G.course || !SAVE_PHASES.includes(G.phase)) return false;
      const h = G.hole, r = G.round, done = G.phase === 'holeDone', b = G.ball;
      const d = {
        v: SAVE_V, savedAt: Date.now(), course: G.course.id, diff: G.diffKey, holesOpt: G.holesOpt, seed: G.seed, mp: G.mp ? { matchID: G.mp.matchID } : null, list: G.list.slice(), li: G.li,
        round: { strokes: r.strokes, putts: r.putts, pens: r.pens, fw: r.fw, gir: r.gir, shotLog: r.shotLog, autoPutts: r.autoPutts, longest: r.longest, dist: r.dist },
        hole: { no: h.no, done, strokes: G.strokes, pens: G.pens, putts: G.putts, shots: G.shots, onGreenAt: G.onGreenAt, girOK: !!G.girOK, fwHit: G.fwHit,
          x: done ? h.pin.x : b.x, z: done ? h.pin.z : b.z, lie: G.lieSurf, trail: (G.trailPts || []).slice(0, 400), aimYaw: G.aimYaw, clubIdx: G.clubIdx, clubAuto: G.clubAuto },
        wind: { t: G.wind.t, mph: G.wind.base / MPH, dir: G.wind.dir },
        settings: { gfx: Gfx.pref(), crowd: CR.isEnabled(), commentary: COM.isEnabled(), auto2: A2.auto, ambient: BG.Audio.ambVol() },
      };
      d.summary = saveSummary(d, G.course); delete d.summary.line;
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
      return true;
    } catch (e) { return false; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  // -> { status: 'none' } | { status: 'ok', data, course, summary, savedAt } | { status: 'bad', why } (bad saves are removed)
  function readSave() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return { status: 'none' }; }
    if (raw == null) return { status: 'none' };
    const bad = (why) => { clearSave(); SAVE_NOTE.msg = 'A saved round couldn’t be restored (' + why + ') and was discarded.'; SAVE_NOTE.good = false; return { status: 'bad', why }; };
    let d; try { d = JSON.parse(raw); } catch (e) { return bad('damaged data'); }
    if (!d || typeof d !== 'object') return bad('damaged data');
    if (d.v !== SAVE_V) return bad(d.v < SAVE_V ? 'from an older version of the game' : 'from a newer version of the game');
    try {
      const course = BG.COURSES.find((c) => c.id === d.course); if (!course) return bad('unknown course');
      if (BG.IAP && !BG.IAP.allowed(course.id, d.list)) return bad('needs the full game');
      if (!BG.DIFFICULTY[d.diff]) return bad('unknown difficulty');
      const n = Array.isArray(d.list) ? d.list.length : 0;
      if (!n || !d.list.every((i) => Number.isInteger(i) && i >= 0 && i < course.holes)) return bad('bad hole list');
      if (!Number.isInteger(d.li) || d.li < 0 || d.li >= n || !isNum(d.seed) || !isNum(d.savedAt)) return bad('bad position');
      const r = d.round, hs = d.hole;
      if (!r || !hs || !d.wind || !isNum(d.wind.t)) return bad('missing data');
      if (!numArr(r.strokes, n, nullNum) || !numArr(r.putts, n, isNum) || !numArr(r.pens, n, isNum) || !numArr(r.fw, n, nullBool) || !numArr(r.gir, n, nullBool) || !numArr(r.autoPutts, n, isNum) ||
        !numArr(r.shotLog, n, Array.isArray) || !isNum(r.longest) || !isNum(r.dist)) return bad('bad scorecard');
      if (!isNum(hs.x) || !isNum(hs.z) || !isNum(hs.strokes) || !isNum(hs.putts) || !isNum(hs.pens) || !Array.isArray(hs.shots) || !Array.isArray(hs.trail) || !nullBool(hs.fwHit)) return bad('bad ball state');
      const summary = saveSummary(d, course);
      return { status: 'ok', data: d, course, summary, savedAt: d.savedAt };
    } catch (e) { return bad('damaged data'); }
  }
  function resumeRound() {
    const sv = readSave();
    if (sv.status !== 'ok') { refreshMenuSave(); return; }
    const d = sv.data, hs = d.hole, st = d.settings || {};
    BG.Audio.init();
    if (typeof st.crowd === 'boolean' && st.crowd !== CR.isEnabled()) { CR.setEnabled(st.crowd); refreshCrowd(); }
    if (typeof st.commentary === 'boolean' && st.commentary !== COM.isEnabled()) { COM.setEnabled(st.commentary); refreshCom(); }
    if (typeof st.auto2 === 'boolean') { A2.auto = st.auto2; try { localStorage.setItem('bg.auto2', A2.auto ? '1' : '0'); } catch (e) {} refreshAuto2(); }
    if (isNum(st.ambient)) { BG.Audio.ambVol(st.ambient); refreshAmb(); }
    const gfxChange = typeof st.gfx === 'string' && st.gfx !== Gfx.pref();
    if (gfxChange) Gfx.setPref(st.gfx);
    const course = sv.course;
    G.course = course; G.diffKey = d.diff; G.diff = BG.DIFFICULTY[d.diff]; G.holesOpt = d.holesOpt; G.seed = d.seed | 0; G.mp = d.mp && typeof d.mp.matchID === 'string' && BG.MP && BG.MP.available ? { matchID: d.mp.matchID, seed: G.seed } : null;
    G.list = d.list.slice(); G.li = d.li; G.loading = true;
    const r = d.round;
    G.round = { course, diffKey: d.diff, list: G.list, strokes: r.strokes, putts: r.putts, pens: r.pens, fw: r.fw, gir: r.gir, shotLog: r.shotLog, autoPutts: r.autoPutts, longest: r.longest, dist: r.dist };
    COM.stop(); hideModals(); showScr('scrLoading'); $('scrLoading').classList.remove('hidden'); $('loadTxt').textContent = `Resuming ${course.name} — hole ${G.list[G.li] + 1}…`;
    $('hud').classList.add('hidden'); $('toast').classList.remove('on');
    setTimeout(() => {
      loadHole(false);
      const h = G.hole;
      G.strokes = hs.strokes; G.pens = hs.pens; G.putts = hs.putts; G.shots = hs.shots; G.onGreenAt = hs.onGreenAt || 0; G.girOK = !!hs.girOK; G.fwHit = hs.fwHit;
      placeBall(hs.x, hs.z); G.shotStart = { x: hs.x, y: G.ball.y, z: hs.z }; G.trailPts = hs.trail;
      if (Number.isInteger(hs.lie) && !hs.done) G.lieSurf = hs.lie;   // keep the saved lie (a ball on the tee must stay S.TEE, h.surf() there is not TEE: that would silence the drive reactions)
      G.wind.t = d.wind.t; G.wind.refresh();
      screens.forEach((s) => $(s).classList.add('hidden')); $('hud').classList.remove('hidden');
      G.paused = false; G.view = 'normal'; $('miniWrap').classList.remove('big'); G.t = G.t || 0;
      G.aimYaw = isNum(hs.aimYaw) ? hs.aimYaw : defaultAim(); pickClub(true);
      if (!hs.clubAuto && Number.isInteger(hs.clubIdx) && hs.clubIdx >= 0 && hs.clubIdx < CLUBS.length && G.lieSurf !== S.GREEN) { G.clubIdx = hs.clubIdx; G.club = CLUBS[hs.clubIdx]; G.clubAuto = false; }
      if (hs.done) { G.phase = 'holeDone'; G.doneT = 0; updateCamera(0.016); snapCamera(); showHoleDone(); }
      else if (!G.shots.length && G.strokes === 0) { G.phase = 'flyover'; G.flyT = 0; hint('Click, tap or press Space to skip the fly-over'); startCommentary(); toast(`<div class="t1">${UI.esc(course.name)} · Hole ${h.no}</div><div class="t2">Par ${h.par} · ${h.yds} yd — ${h.tags.join(' · ')}<br>${UI.esc(holeFlavor())}</div>`, 4200); }
      else {
        G.phase = 'aim'; hint(''); updateCamera(0.016); snapCamera();
        toast(`<div class="t1">Round resumed</div><div class="t2">${UI.esc(course.name)} · Hole ${h.no} · Par ${h.par} — stroke ${G.strokes + 1}, ${Yd(distPin())} yd to the pin<br>${UI.esc(holeFlavor())}</div>`, 4200);
      }
      G.loading = false;
      if (gfxChange) applyGfx(); else refreshGfx();
      saveRound();
    }, 40);
  }
  function refreshMenuSave() {
    const el = $('mmSave'); if (!el) return;
    const sv = readSave();   // (also discards bad saves and sets SAVE_NOTE)
    let html = '';
    if (sv.status === 'ok') {
      const s = sv.summary, dt = new Date(sv.savedAt);
      const when = isNaN(dt) ? '' : dt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      html = `<div class="sv-h">Continue round</div><div class="sv-b"><b>${UI.esc(sv.course.name)}</b> · ${BG.DIFFICULTY[sv.data.diff].name}<br>Hole ${s.holeNo} <small>(${sv.data.li + 1} of ${sv.data.list.length})</small> · <b>${s.played ? UI.fmtDiff(s.toPar) : 'E'}</b> to par${s.played ? ` thru ${s.played}` : ''}<br><small>Saved ${UI.esc(when)}</small></div>
        <div class="sv-btns"><button class="btn primary" id="mmContinue">Continue</button><button class="btn" id="mmDiscard">Discard</button></div>`;
    }
    const note = SAVE_NOTE.msg ? `<div class="sv-note ${SAVE_NOTE.good ? 'good' : 'bad'}">${UI.esc(SAVE_NOTE.msg)}</div>` : '';
    el.innerHTML = note + html; el.classList.toggle('hidden', !html && !note);
    if (sv.status === 'ok') {
      $('mmContinue').onclick = resumeRound;
      $('mmDiscard').onclick = () => confirmBox({ title: 'Discard saved round?', text: UI.esc(sv.summary.line) + ' will be deleted.', ok: 'Discard', danger: true, cancel: 'Keep it' }, () => { clearSave(); SAVE_NOTE.msg = ''; showScr('scrMenu'); });
    }
    SAVE_NOTE.msg = '';   // a note is shown once
  }
  // in-game confirm dialog (shown over whatever is up; the cancel path restores the previous screen)
  function confirmBox(o, onOk, onCancel) {
    const wasPause = !$('scrPause').classList.contains('hidden');
    $('cfBody').innerHTML = `<h2>${o.title}</h2><p style="color:var(--mut);margin:0 0 10px">${o.text}</p><button class="btn ${o.danger ? 'danger' : 'primary'}" id="cfOk">${o.ok}</button><button class="btn" id="cfNo">${o.cancel || 'Cancel'}</button>`;
    $('scrConfirm').classList.remove('hidden');
    const close = () => $('scrConfirm').classList.add('hidden');
    $('cfOk').onclick = () => { close(); onOk(); };
    $('cfNo').onclick = () => { close(); if (onCancel) onCancel(); else if (wasPause) { /* pause menu is still underneath */ } };
  }
  // ---- iOS freemium paywall (BG.IAP; never reachable on the web)
  function showPaywall(o) {
    const IAP = BG.IAP; if (!IAP || !IAP.freemium) return;
    if (IAP.unlocked()) { refreshIap(); return; }
    const render = () => {
      $('pwBody').innerHTML = `<div style="font-size:40px">🔓</div><h2>Unlock all 7 courses</h2>
        <ul><li>All 7 courses, all 18 holes each</li><li>Every course on all three difficulty levels</li><li>Full-round Game Center leaderboards</li><li>One-time purchase — no subscription, yours forever</li></ul>
        <div class="pw-status" id="pwStatus" role="status"></div>
        <button class="btn primary big" id="pwBuy">Unlock All Courses${IAP.price() ? ' — ' + UI.esc(IAP.price()) : ''}</button><br>
        <button class="btn" id="pwRestore">Restore Purchases</button><button class="btn ghost" id="pwClose">Not now</button>
        <div class="pw-fine">Payment is charged to your Apple ID. <a href="docs/privacy.html" target="_blank" rel="noopener">Privacy</a></div>`;
      $('pwClose').onclick = () => $('scrPaywall').classList.add('hidden');
      $('pwBuy').onclick = doBuy; $('pwRestore').onclick = doRestore;
    };
    const status = (t) => { const e = $('pwStatus'); if (e) e.textContent = t; };
    const busy = (b) => ['pwBuy', 'pwRestore'].forEach((id) => { const e = $(id); if (e) e.disabled = b; });
    const doBuy = () => {
      busy(true); status('Contacting the App Store…');
      IAP.purchase().then((r) => {
        busy(false);
        if (r.status === 'success') status('Unlocked — thank you!');
        else if (r.status === 'pending') status('Purchase pending approval (Ask to Buy). It will unlock automatically once approved.');
        else if (r.status === 'cancelled') status('');
        else if (r.status === 'unavailable') status('The store isn’t available right now. Please try again later.');
        else status('Purchase didn’t complete' + (r.error ? ': ' + r.error : '.') + ' You have not been charged.');
      });
    };
    const doRestore = () => {
      busy(true); status('Checking your purchases…');
      IAP.restore().then((r) => { busy(false); status(r.owned ? 'Purchase restored — thank you!' : (r.error ? 'Couldn’t restore: ' + r.error : 'No previous purchase was found for this Apple ID.')); });
    };
    render(); $('scrPaywall').classList.remove('hidden');
    if (!IAP.productLoaded()) IAP.loadProduct().then(() => { if (!$('scrPaywall').classList.contains('hidden') && !IAP.unlocked()) { const s = $('pwStatus') ? $('pwStatus').textContent : ''; render(); status(s); } });
    if (o && o.restore) doRestore();
  }
  function refreshIap() {
    const IAP = BG.IAP; if (!IAP) return;
    const fm = IAP.freemium && !IAP.unlocked();
    $('mmUnlock').classList.toggle('hidden', !fm); $('mmRestore').classList.toggle('hidden', !IAP.freemium || IAP.unlocked());
    UI.courseCards(pickCourse);
    const eu = $('enUnlock'); if (eu && !fm) eu.closest('.pw-card').classList.add('hidden');
    if (!fm) { setTimeout(() => $('scrPaywall').classList.add('hidden'), $('scrPaywall').classList.contains('hidden') ? 0 : 1200); if (!$('scrDiff').classList.contains('hidden') && G.course) pickCourse(G.course); }
  }
  if (BG.IAP) { BG.IAP.onChange(refreshIap); $('mmUnlock').onclick = () => showPaywall(); $('mmRestore').onclick = () => showPaywall({ restore: true }); refreshIap(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveRound(); });
  window.addEventListener('pagehide', () => { saveRound(); });
  Object.assign(window.__bg, { saveRound, readSave, resumeRound, clearSave, SAVE_KEY });
  refreshMenuSave();

  // ---- Graphics setting (Auto / Low / Medium / High)
  let gfxBusy = false, gfxAgain = false;
  function refreshGfx() { const t = 'Graphics: ' + Gfx.label(); $('pmGfx').textContent = t; $('mmGfx').textContent = t; }
  function applyGfx() {
    if (gfxBusy) { gfxAgain = true; return; }
    gfxBusy = true; const lv = Gfx.level();
    Gfx.loadTextures(lv).then((T) => { G.texArr = T; }).catch((e) => console.warn('graphics assets failed', e)).then(() => {
      Gfx.applyRenderer(renderer, lv); resize();
      if (G.hole) buildVisuals(G.hole, G.course);
      if (G.hole && !G.attract) CR.build(G.hole, lv.id, scene);
      scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
      refreshGfx(); gfxBusy = false; if (gfxAgain) { gfxAgain = false; applyGfx(); }
    });
  }
  const cycleGfx = () => { Gfx.cycle(); refreshGfx(); applyGfx(); };
  $('pmGfx').onclick = cycleGfx; $('mmGfx').onclick = cycleGfx; refreshGfx();
  function refreshAmb() { const pc = Math.round(BG.Audio.ambVol() * 100); ['mm', 'pm'].forEach((k) => { $(k + 'Amb').value = pc; $(k + 'AmbV').textContent = pc ? pc + '%' : 'Off'; }); }
  ['mm', 'pm'].forEach((k) => { $(k + 'Amb').oninput = (e) => { BG.Audio.ambVol(+e.target.value / 100); refreshAmb(); }; });
  refreshAmb();
  function refreshCrowd() { const t = 'Tournament crowd: ' + (CR.isEnabled() ? 'ON' : 'OFF'); $('pmCrowd').textContent = t; $('mmCrowd').textContent = t; $('pmCrowd').classList.toggle('primary', CR.isEnabled()); }
  const toggleCrowd = () => { CR.setEnabled(!CR.isEnabled()); refreshCrowd(); if (CR.isEnabled() && G.hole && !G.attract) CR.build(G.hole, Gfx.level().id, scene); };
  $('pmCrowd').onclick = toggleCrowd; $('mmCrowd').onclick = toggleCrowd; refreshCrowd();
  function refreshSlope() { const t = 'Green slope arrows: ' + (BG.Slope.isEnabled() ? 'ON' : 'OFF'); $('pmSlope').textContent = t; $('mmSlope').textContent = t; $('pmSlope').classList.toggle('primary', BG.Slope.isEnabled()); $('mmSlope').classList.toggle('primary', BG.Slope.isEnabled()); }
  const toggleSlope = () => { BG.Slope.setEnabled(!BG.Slope.isEnabled()); refreshSlope(); };
  $('pmSlope').onclick = toggleSlope; $('mmSlope').onclick = toggleSlope; refreshSlope();
  // Game Center (iOS app only; BG.GC.available is false in the browser so none of this ever appears on the web)
  function gcShow(fn) {
    BG.GC.signIn().then((ok) => (ok ? fn() : false)).then((ok) => {
      if (!ok) confirmBox({ title: 'Game Center', text: 'Sign in to Game Center in Settings &rsaquo; Game Center to see leaderboards and achievements.', ok: 'OK', cancel: 'Close' }, () => {});
    });
  }
  if (BG.GC && BG.GC.available) { $('mmLeaders').classList.remove('hidden'); $('mmLeaders').onclick = () => gcShow(() => BG.GC.showLeaderboards()); }
  Object.assign(window.__bg, { crowd: CR, scene, sun, hemi, renderer, camera, ocean, skyDome });
  window.__bg.setGfx = (p) => { Gfx.setPref(p); refreshGfx(); applyGfx(); };
  if (BG.MP && BG.MP.available) BG.MP.init({
    showScr, holeList, readSave, resumeRound, confirmBox, toast, showPaywall,
    idle: () => G.phase === 'menu' || G.phase === 'over',
    startRound: (c, diff, opt, mp) => { G.diffKey = diff; startRound(c, diff, opt, mp); },
  });
  $('mmPlay').onclick = () => { BG.Audio.init(); UI.courseCards(pickCourse); showScr('scrCourses'); };
  $('mmHow').onclick = () => { $('helpBody').innerHTML = UI.helpHTML(); $('scrHelp').classList.remove('hidden'); };
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.back === 'menu') showScr('scrMenu'); else showScr('scrCourses'); }));
  $('diffGo').onclick = () => {
    const sv = readSave();
    if (sv.status !== 'ok') { startRound(G.course, G.diffKey, pendingHoles); return; }
    confirmBox({ title: 'Replace saved round?', text: `You have a saved round (${UI.esc(sv.summary.line)}). Starting a new round will overwrite it.`, ok: 'Start new round', danger: true, cancel: 'Keep saved round' }, () => startRound(G.course, G.diffKey, pendingHoles), () => { showScr('scrMenu'); });
  };

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); keys[k] = true; if (k === 'shift') keys.shift = true;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (G.phase === 'menu' || G.phase === 'over') return;
    if (k === 'escape') {
      if (!$('scrCard').classList.contains('hidden')) closeCard();
      else if (!$('scrHelp').classList.contains('hidden')) $('scrHelp').classList.add('hidden');
      else if (!$('scrClubs').classList.contains('hidden')) $('scrClubs').classList.add('hidden');
      else pause(!G.paused);
      return;
    }
    if (G.paused) return;
    if (k === 't') openCard(); else if (k === 'v') toggleView(); else if (k === 'c') toggleCom(); else if (k === 'm') { const m = BG.Audio.toggle(); $('btnSound').style.opacity = m ? 0.45 : 1; }
    else if (k === ' ' || k === 'enter') {
      if (G.phase === 'flyover') endFly(); else if (G.phase === 'ball') G.speedMul = G.speedMul === 1 ? 3 : 1; else if (G.phase === 'holeDone' && !$('scrHoleDone').classList.contains('hidden')) nextHole();
    }
    if (G.phase === 'aim' || G.phase === 'settle') {
      if (k === 'arrowup' || k === 'w') setClub(G.clubIdx - 1); else if (k === 'arrowdown' || k === 's') setClub(G.clubIdx + 1);
      else if (k === 'p') $('aimPin').onclick();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; if (e.key === 'Shift') keys.shift = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; G.hold = 0; });

  // ------------------------------------------------------------------ main loop
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, ((ts - G.tPrev) / 1000) || 0.016); G.tPrev = ts; if (!G.paused) G.t += dt;
    if (G.hole) {
      if (!G.paused) { updatePreviewSafe(); update(dt); }
      if (BG.Slope) BG.Slope.update(G.t, G.ball, G.hole.pin, !G.attract && G.lieSurf === S.GREEN && (G.phase === 'aim' || G.phase === 'drag' || G.phase === 'settle') && !G.loading);
      G._fly = (G._fly || 0) + (((G.phase === 'flyover' && !G.attract) ? 1 : 0) - (G._fly || 0)) * Math.min(1, dt * 3);
      Gfx.render(renderer, scene, camera, G._fly, G.t);
      if (!G.attract && G.phase !== 'menu') { updateHud(); updateLabels(); drawFx(); G._mt = (G._mt || 0) + dt; if (G._mt > 0.1) { G._mt = 0; drawMini(); } }
    }
  }
  function updatePreviewSafe() { if (G.phase === 'drag') updatePreview(); else if (landRing.visible || aimGeo.drawRange.count) { aimGeo.setDrawRange(0, 0); landRing.visible = false; $('powerMeter').classList.remove('on'); } }

  // test / debug hooks
  window.__bg.crowdAfterShot = crowdAfterShot; window.__bg.crowdAww = crowdAww; window.__bg.crowdHole = crowdHole; window.__bg.setTrail = (pts) => { const a = trailGeo.attributes.position.array; pts.forEach((p, i) => { a[i * 3] = p[0]; a[i * 3 + 2] = p[1]; }); trailN = pts.length; }; window.__bg.takeShot = takeShot; window.__bg.placeBall = placeBall; window.__bg.startRound = startRound; window.__bg.skip = () => { if (G.phase === 'flyover') endFly(); };
  window.__bg.snapCam = () => { pickClub(true); updateCamera(0.016); snapCamera(); updateCamera(0.016); snapCamera(); }; window.__bg.endRound = endRound; window.__bg.showPaywall = showPaywall;
  window.__bg.state = () => ({ phase: G.phase, strokes: G.strokes, lie: lieLabel(G.lieSurf), club: G.club.id, dist: Yd(distPin()), hole: G.hole && G.hole.no, wind: G.wind && G.wind.mph(), shots: G.shots.length });

  // boot
  UI.courseCards(pickCourse);
  function boot() {
    try { startAttract(); } catch (e) { console.error(e); throw e; }
    snapCamera(); updateCamera(0.016);
    requestAnimationFrame(frame);
  }
  Gfx.preload(Gfx.level()).then((r) => { G.texArr = r[1]; }).catch((e) => console.warn('graphics assets failed', e)).then(boot);
})();
