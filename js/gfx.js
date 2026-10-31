/* Bandon Links — graphics module: quality levels, PBR terrain, sky/IBL, ocean, vegetation.
   Needs three.js r149 (global build, no addons). All textures are CC0 (see README). */
(function () {
  'use strict';
  const BG = window.BG = window.BG || {};
  // linear working space + ACES + sRGB output (must be set before any Color is created)
  THREE.ColorManagement.legacyMode = false;

  // ------------------------------------------------------------------ levels
  const LEVELS = {
    low: { id: 'low', label: 'Low', tex: 512, detailN: false, shadow: 0, shadowR: 0, env: false, grass: 0, flowers: 0, treeQ: 0, gorseQ: 0, dpr: 1.5, splat: 2, ocean: 0, exposure: 1.0, farGrass: 0, aer: 1 },
    medium: { id: 'medium', label: 'Medium', tex: 512, detailN: true, shadow: 1024, shadowR: 58, env: true, grass: 5000, flowers: 5, treeQ: 1, gorseQ: 1, dpr: 2, splat: 1, ocean: 1, exposure: 1.0, aer: 2 },
    high: { id: 'high', label: 'High', tex: 1024, detailN: true, shadow: 2048, shadowR: 72, env: true, grass: 16000, flowers: 12, treeQ: 2, gorseQ: 2, dpr: 2, splat: 1, ocean: 2, exposure: 1.0, aer: 2 }
  };
  const ORDER = ['auto', 'low', 'medium', 'high'];
  let gl2 = null;
  function gpuInfo() {
    try {
      const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl');
      const e = g && g.getExtension('WEBGL_debug_renderer_info');
      const r = e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '';
      const lose = g && g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return r;
    } catch (er) { return ''; }
  }
  function detect() {
    const ua = navigator.userAgent || '', plat = navigator.platform || '';
    const iPhone = /iPhone|iPod/.test(ua);
    const iPad = /iPad/.test(ua) || (plat === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const small = Math.min(screen.width, screen.height) < 700;
    const gpu = gpuInfo();
    if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) return 'low';
    if (iPhone || (android && small) || (matchMedia && matchMedia('(pointer:coarse)').matches && small)) return 'low';
    if (iPad || android) return 'medium';
    if (/NVIDIA|GeForce|RTX|GTX|Radeon|AMD|Apple M|Apple GPU|Arc /i.test(gpu) && !/Intel\(R\) (UHD|HD)/i.test(gpu)) return 'high';
    return 'medium';
  }
  let pref = 'auto', autoLevel = 'medium';
  try { pref = localStorage.getItem('bg.gfx') || 'auto'; } catch (e) {}
  try { const q = new URLSearchParams(location.search).get('gfx'); if (q && ORDER.includes(q)) pref = q; } catch (e) {}
  if (!ORDER.includes(pref)) pref = 'auto';
  autoLevel = detect();
  const Gfx = BG.Gfx = {
    LEVELS, pref: () => pref, autoLevel: () => autoLevel,
    level: () => LEVELS[pref === 'auto' ? autoLevel : pref],
    label: () => (pref === 'auto' ? 'Auto (' + LEVELS[autoLevel].label + ')' : LEVELS[pref].label),
    setPref(p) { pref = ORDER.includes(p) ? p : 'auto'; try { localStorage.setItem('bg.gfx', pref); } catch (e) {} },
    cycle() { Gfx.setPref(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]); return Gfx.level(); }
  };

  // ------------------------------------------------------------------ asset loading
  const BASE = 'assets/';
  function loadImg(url) {
    return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => rej(new Error('load ' + url)); im.src = url; });
  }
  const LAYERS = ['fairway', 'green', 'rough', 'deep', 'sand', 'gorse', 'rock'];
  const texCache = {};
  function loadTextureArrays(lv) {
    const key = lv.tex + (lv.detailN ? 'n' : '');
    if (texCache[key]) return texCache[key];
    const S = lv.tex;
    const work = document.createElement('canvas'); work.width = work.height = S; const g = work.getContext('2d', { willReadFrequently: true });
    const mk = (files) => Promise.all(files.map(loadImg)).then((ims) => {
      const data = new Uint8Array(S * S * 4 * ims.length);
      ims.forEach((im, i) => { g.clearRect(0, 0, S, S); g.drawImage(im, 0, 0, S, S); data.set(g.getImageData(0, 0, S, S).data, i * S * S * 4); });
      const t = new THREE.DataArrayTexture(data, S, S, ims.length);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
      return t;
    });
    const p = Promise.all([
      mk(LAYERS.map((n) => `${BASE}tex/${S}/${n}_a.webp`)).then((t) => { t.encoding = THREE.sRGBEncoding; return t; }),
      lv.detailN ? mk(LAYERS.map((n) => `${BASE}tex/${S}/${n}_n.webp`)) : Promise.resolve(null)
    ]).then(([alb, nrm]) => ({ alb, nrm }));
    texCache[key] = p; return p;
  }

  // ---- sky: pre-tonemapped dome (webp) + tiny HDR (RGBE → half float) for image based lighting
  let skyMeta = null, skyPromise = null; const skyTex = {}, skyEnv = {};
  function parseRGBE(buf) {
    const u = new Uint8Array(buf); let p = 0; const w = 128, h = 64;
    const out = new Uint16Array(w * h * 4), HF = THREE.DataUtils.toHalfFloat;
    // raw 128x64 RGBE, 4 bytes per pixel
    for (let i = 0; i < w * h; i++) {
      const r = u[p++], g = u[p++], b = u[p++], e = u[p++], f = e ? Math.pow(2, e - 136) : 0;
      out[i * 4] = HF(r * f); out[i * 4 + 1] = HF(g * f); out[i * 4 + 2] = HF(b * f); out[i * 4 + 3] = HF(1);
    }
    // file is stored top row first, DataTexture row 0 = bottom: flip
    const flipped = new Uint16Array(out.length);
    for (let y = 0; y < h; y++) flipped.set(out.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
    const t = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
    t.mapping = THREE.EquirectangularReflectionMapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  }
  function loadSky() {
    if (skyPromise) return skyPromise;
    skyPromise = fetch(BASE + 'sky/sky.json').then((r) => r.json()).then((meta) => {
      skyMeta = meta;
      return Promise.all(Object.keys(meta).map((k) => loadImg(`${BASE}sky/${meta[k].file}.webp`).then((im) => {
        const t = new THREE.Texture(im); t.encoding = THREE.sRGBEncoding; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; skyTex[k] = t;
      }))).then(() => Promise.all(Object.keys(meta).map((k) => fetch(`${BASE}sky/${meta[k].file}.rgbe`).then((r) => r.arrayBuffer()).then((b) => { skyEnv[k] = parseRGBE(b); }))));
    }).then(() => skyMeta);
    return skyPromise;
  }
  Gfx.loadSky = loadSky; Gfx.skyMeta = () => skyMeta;
  Gfx.skyTex = (k) => skyTex[k]; Gfx.skyEnvRaw = (k) => skyEnv[k];
  Gfx.loadTextures = loadTextureArrays;
  Gfx.preload = (lv) => Promise.all([loadSky(), loadTextureArrays(lv || Gfx.level())]);

  // ------------------------------------------------------------------ terrain
  // Per-cell data textures: two splat maps (surface class weights), world-space normals + height.
  function buildTerrainData(h, lv) {
    const st = lv.splat, W = Math.ceil((h.W - 1) / st) + 1, H = Math.ceil((h.H - 1) / st) + 1;
    const A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4), N = new Uint8Array(W * H * 4);
    const Sm = h.Sm, Hm = h.Hm, Sa = h.Sa, S = BG.Phys.S, res = h.res, sea = h.SEA_Y || 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const ci = Math.min(h.W - 1, i * st), cj = Math.min(h.H - 1, j * st), k = cj * h.W + ci, o = (j * W + i) * 4;
      const s = Sm[k];
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0;
      switch (s) {
        case S.TEE: a0 = 255; break;
        case S.FAIRWAY: a0 = 255; b3 = (Sa && (Math.floor(Sa[k] / 9) & 1)) ? 255 : 0; break;
        case S.FRINGE: a0 = 120; a1 = 135; break;
        case S.GREEN: a1 = 255; break;
        case S.SAND: a2 = 255; break;
        case S.ROUGH: a3 = 255; break;
        case S.GORSE: b1 = 255; break;
        case S.WATER: a2 = 150; b2 = 105; break;
        default: b0 = 255;
      }
      A[o] = a0; A[o + 1] = a1; A[o + 2] = a2; A[o + 3] = a3; B[o] = b0; B[o + 1] = b1; B[o + 2] = b2; B[o + 3] = b3;
      const il = Math.max(0, ci - st), ir = Math.min(h.W - 1, ci + st), jt = Math.max(0, cj - st), jb = Math.min(h.H - 1, cj + st);
      const gx = (Hm[cj * h.W + ir] - Hm[cj * h.W + il]) / ((ir - il) * res), gz = (Hm[jb * h.W + ci] - Hm[jt * h.W + ci]) / ((jb - jt) * res);
      const l = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      N[o] = (-gx * l * 0.5 + 0.5) * 255; N[o + 1] = (l * 0.5 + 0.5) * 255; N[o + 2] = (-gz * l * 0.5 + 0.5) * 255;
      N[o + 3] = Math.max(0, Math.min(255, (Hm[k] - sea + 12) / 24 * 255));
    }
    const mk = (d, mip) => { const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.generateMipmaps = !!mip; t.needsUpdate = true; return t; };
    return { W, H, st, A: mk(A, true), B: mk(B, true), N: mk(N, true), dispose() { this.A.dispose(); this.B.dispose(); this.N.dispose(); } };
  }

  // tint (linear multiplier on the albedo), tiling (1/metres), detail-normal strength per layer
  const LAYER_TINT = [[1.15, 1.22, 0.7], [1.0, 1.18, 0.8], [0.95, 0.95, 0.62], [0.46, 0.58, 0.34], [0.82, 0.8, 0.7], [0.95, 1.05, 0.58], [1.15, 1.08, 1.0]];
  const LAYER_SCALE = [0.62, 0.9, 0.42, 0.30, 0.55, 0.45, 0.22];
  const LAYER_NSTR = [0.9, 0.35, 1.0, 1.0, 0.9, 1.0, 1.6];

  const TERRAIN_FS_HEAD = `
varying vec3 vWorld;
uniform highp sampler2DArray uAlb; uniform highp sampler2DArray uNrm;
uniform sampler2D uSplA, uSplB, uNTex, uDet;
uniform vec4 uGrid; uniform vec2 uWH; uniform float uSea; uniform float uDetailN;
uniform vec3 uTint[7]; uniform float uScale[7]; uniform float uNStr[7];
uniform vec4 uGreen; // cx, cz, hx, hz  (green heading for mowing stripes)
uniform float uHasGreen;
uniform sampler2D uAer; uniform vec4 uAerRect; uniform float uAerK, uAerGain, uAerMown; uniform vec3 uAerAvg;
vec3 tNormalW; float tRough;
`;
  const TERRAIN_MAP = `
{
  vec2 tuv = ((vWorld.xz - uGrid.xy) / uGrid.z + 0.5) / uWH;
  vec4 nt = texture2D(uNTex, tuv);
  vec3 nG = normalize(nt.xyz * 2.0 - 1.0);
  vec4 sA = texture2D(uSplA, tuv), sB = texture2D(uSplB, tuv);
  float n1 = texture2D(uDet, vWorld.xz * 0.0071).r;
  float n2 = texture2D(uDet, vWorld.xz * 0.043 + 0.31).r;
  float n3 = texture2D(uDet, vWorld.xz * 0.23 + 0.7).r;
  float jit = (n3 - 0.5) * 0.34;
  float wt[7];
  wt[0] = sA.r; wt[1] = sA.g; wt[2] = sA.b; wt[3] = sA.a; wt[4] = sB.r; wt[5] = sB.g; wt[6] = sB.b;
  // beach: sandy band along the waterline
  float yy = vWorld.y - uSea;
  float beach = smoothstep(3.2, 0.6, yy) * (1.0 - wt[0] - wt[1]);
  // cliffs / steep dunes -> rock
  float rockW = smoothstep(0.66, 0.44, nG.y) * (1.0 - wt[2]) * (1.0 - wt[1]);
  float tot = 0.0;
  for (int i = 0; i < 7; i++) { wt[i] = smoothstep(0.12, 0.88, wt[i] + jit * step(0.001, wt[i])); }
  wt[2] += beach * 0.9 * (1.0 - wt[0]);
  tot = wt[0] + wt[1] + wt[2] + wt[3] + wt[4] + wt[5] + wt[6] + 1e-4;
  for (int i = 0; i < 7; i++) wt[i] /= tot;
  float keep = 1.0 - rockW; for (int i = 0; i < 6; i++) wt[i] *= keep; wt[6] = wt[6] * keep + rockW;

  vec2 dxz = dFdx(vWorld.xz), dyz = dFdy(vWorld.xz);
  vec3 col = vec3(0.0); vec2 nacc = vec2(0.0); float racc = 0.0;
  float distN = 1.0 - smoothstep(25.0, 110.0, length(vViewPosition));
  for (int i = 0; i < 7; i++) {
    float w = wt[i]; if (w < 0.02) continue;
    float sc = uScale[i];
    vec3 a; vec4 nr = vec4(0.5, 0.5, 1.0, 0.9);
    if (i == 6) {
      // bi-planar mapping so cliff faces do not smear
      vec3 an = abs(nG); float bx = an.x / (an.x + an.z + 1e-4);
      vec2 u1 = vec2(vWorld.z, vWorld.y) * sc, u2 = vec2(vWorld.x, vWorld.y) * sc, u3 = vWorld.xz * sc;
      float topW = smoothstep(0.7, 0.95, nG.y);
      vec3 a1 = textureGrad(uAlb, vec3(u1, 6.0), vec2(dxz.y, 0.0) * sc, vec2(dyz.y, 0.0) * sc).rgb;
      vec3 a2 = textureGrad(uAlb, vec3(u2, 6.0), vec2(dxz.x, 0.0) * sc, vec2(dyz.x, 0.0) * sc).rgb;
      vec3 a3 = textureGrad(uAlb, vec3(u3, 6.0), dxz * sc, dyz * sc).rgb;
      a = mix(mix(a2, a1, bx), a3, topW);
      if (uDetailN > 0.5) { nr = textureGrad(uNrm, vec3(mix(u2, u1, bx), 6.0), vec2(dxz.x, dxz.y) * sc, vec2(dyz.x, dyz.y) * sc); }
    } else {
      vec2 uv = vWorld.xz * sc, gx = dxz * sc, gy = dyz * sc;
      a = textureGrad(uAlb, vec3(uv, float(i)), gx, gy).rgb;
      if (uDetailN > 0.5) nr = textureGrad(uNrm, vec3(uv, float(i)), gx, gy);
    }
    col += a * uTint[i] * w;
    nacc += (nr.xy * 2.0 - 1.0) * uNStr[i] * w;
    racc += nr.z * w;
  }
  if (uDetailN < 0.5) racc = 0.9;
  // large scale colour variation (breaks up tiling): sun-bleached / lush patches
  float mac = n1 * 0.55 + n2 * 0.45;
  col *= 0.78 + 0.5 * mac;
  col = mix(col, col * vec3(1.14, 1.0, 0.72), smoothstep(0.35, 0.75, n2) * (wt[2] + wt[3] + wt[4] + wt[5]) * 0.6);
  // real aerial imagery (USDA NAIP, public domain): macro colour for the natural ground, light pattern on mown turf
  if (uAerK > 0.001) {
    vec2 auv = (vWorld.xz - uAerRect.xy) * uAerRect.zw;
    vec2 aed = min(auv, 1.0 - auv);
    float ain = smoothstep(0.0, 0.035, min(aed.x, aed.y)) * uAerK;
    vec3 aer = texture2D(uAer, clamp(auv, 0.0, 1.0)).rgb;
    float afar = smoothstep(12.0, 85.0, length(vViewPosition));
    float bsand = min(wt[2], beach);
    float natW = wt[3] + wt[4] + wt[5] + wt[6] + bsand;
    float aw = natW * mix(0.4, 0.92, afar) * ain;
    float al = dot(aer, vec3(0.2126, 0.7152, 0.0722)), aavg = dot(uAerAvg, vec3(0.2126, 0.7152, 0.0722)) + 1e-4;
    float pat = clamp(al / aavg, 0.82, 1.22);
    float mw = (wt[0] * 0.55 + (wt[2] - bsand) * 0.35) * afar * ain;
    col = mix(col, aer * uAerGain, aw);
    // mown turf keeps its own luminance/detail but takes the real hue (colour match)
    vec3 atint = clamp(aer / max(al, 0.004), 0.7, 1.45); atint.b = min(atint.b, atint.g * 0.88); atint.r = max(atint.r, atint.g * 0.86);
    col = mix(col, atint * dot(col, vec3(0.2126, 0.7152, 0.0722)) * uAerMown, (wt[0] * 0.5 + wt[1] * 0.3) * ain);
    col *= mix(1.0, pat, mw);
  }
  // mowing: fairway bands from the baked stripe parity, green bands across its heading
  float fwW = wt[0], grW = wt[1];
  col *= 1.0 + (sB.a - 0.5) * 0.22 * fwW;
  if (uHasGreen > 0.5) {
    vec2 gp = vWorld.xz - uGreen.xy; float gs = gp.x * uGreen.z + gp.y * uGreen.w;
    float band = smoothstep(0.35, 0.65, abs(fract(gs / 4.4) * 2.0 - 1.0));
    col *= 1.0 + (band - 0.5) * 0.14 * grW;
    racc = mix(racc, 0.9 + 0.05 * band, grW);
  }
  // wet sand / damp ground at the tide line
  col *= mix(1.0, 0.62, smoothstep(1.1, 0.0, yy));
  diffuseColor.rgb = col;
  tRough = clamp(racc * mix(1.0, 0.92, wt[1]), 0.86, 1.0);
  vec3 nd = vec3(nacc.x, 0.0, -nacc.y) * distN * 0.9;
  tNormalW = normalize(nG + nd);
}
`;
  function terrainMaterial(h, data, T, lv, detTex) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const AU = { uAer: { value: aerDummy() }, uAerRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uAerK: { value: 0 }, uAerGain: { value: AER_GAIN }, uAerMown: { value: 0.88 }, uAerAvg: { value: new THREE.Vector3(0.1, 0.1, 0.1) } };
    m.userData.aerU = AU;
    const g = h.green, hd = g && g.hx !== undefined;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uAlb: { value: T.alb }, uNrm: { value: T.nrm || T.alb }, uSplA: { value: data.A }, uSplB: { value: data.B }, uNTex: { value: data.N }, uDet: { value: detTex },
        uGrid: { value: new THREE.Vector4(h.x0, h.z0, h.res * data.st, 1) }, uWH: { value: new THREE.Vector2(data.W, data.H) }, uSea: { value: h.SEA_Y || 0 }, uDetailN: { value: lv.detailN ? 1 : 0 },
        uTint: { value: LAYER_TINT.map((c) => new THREE.Vector3(c[0], c[1], c[2])) }, uScale: { value: LAYER_SCALE }, uNStr: { value: LAYER_NSTR },
        uAer: AU.uAer, uAerRect: AU.uAerRect, uAerK: AU.uAerK, uAerGain: AU.uAerGain, uAerMown: AU.uAerMown, uAerAvg: AU.uAerAvg,
        uGreen: { value: new THREE.Vector4(hd ? g.x : 0, hd ? g.z : 0, hd ? g.hx : 1, hd ? g.hz : 0) }, uHasGreen: { value: hd ? 1 : 0 }
      });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorld;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TERRAIN_FS_HEAD)
        .replace('#include <map_fragment>', TERRAIN_MAP)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tNormalW, 0.0)).xyz);');
    };
    m.customProgramCacheKey = () => 'bgterrain2' + (lv.detailN ? 'n' : '');
    return m;
  }
  Gfx.buildTerrainData = buildTerrainData; Gfx.terrainMaterial = terrainMaterial;

  // ------------------------------------------------------------------ aerial imagery (lazy, per hole)
  const AER_GAIN = 1.12;
  let _aerDummy = null;
  function aerDummy() { if (!_aerDummy) { _aerDummy = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); _aerDummy.needsUpdate = true; } return _aerDummy; }
  const AER = { idx: null, cache: new Map(), base: 'assets/aerial/' };
  function aerIndex() { if (!AER.idx) AER.idx = fetch(AER.base + 'index.json').then((r) => r.ok ? r.json() : {}).catch(() => ({})); return AER.idx; }
  function aerialFile(course, no, lv) { return AER.base + course + '/' + no + (lv.aer >= 2 ? '' : '_s') + '.webp'; }
  function aerialTex(course, no, lv) {
    const key = course + '/' + no + '/' + lv.aer;
    if (AER.cache.has(key)) { const c = AER.cache.get(key); AER.cache.delete(key); AER.cache.set(key, c); return c; }
    const pr = aerIndex().then((idx) => {
      const meta = idx[course] && idx[course][no]; if (!meta) return null;
      return new Promise((res) => {
        new THREE.TextureLoader().load(aerialFile(course, no, lv), (t) => {
          t.encoding = THREE.sRGBEncoding; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
          t.anisotropy = lv.aer >= 2 ? 4 : 1; t.needsUpdate = true; res({ tex: t, meta });
        }, undefined, () => res(null));
      });
    });
    AER.cache.set(key, pr);
    while (AER.cache.size > 3) { const k0 = AER.cache.keys().next().value; const old = AER.cache.get(k0); AER.cache.delete(k0); old.then((o) => { if (o && o.tex) o.tex.dispose(); }); }
    return pr;
  }
  function prefetchAerial(course, no, lv) { if (course && no) aerialTex(course, no, lv); }
  // attach to a terrain material; fades in once loaded. Returns a promise resolving true when applied.
  function attachAerial(mat, course, no, lv) {
    if (/[?&]aer=0/.test(location.search)) return Promise.resolve(false);
    const AU = mat && mat.userData.aerU; if (!AU || !lv.aer) return Promise.resolve(false);
    return aerialTex(course, no, lv).then((r) => {
      if (!r || mat.userData.disposed) return false;
      const m = r.meta;
      AU.uAer.value = r.tex;
      AU.uAerRect.value.set(m.x0, m.z0, 1 / (m.x1 - m.x0), 1 / (m.z1 - m.z0));
      AU.uAerAvg.value.set(m.avg[0], m.avg[1], m.avg[2]);
      mat.needsUpdate = true;
      const t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / 700); AU.uAerK.value = k; if (k < 1 && !mat.userData.disposed) requestAnimationFrame(step); };
      step(); return true;
    });
  }
  Gfx.attachAerial = attachAerial; Gfx.prefetchAerial = prefetchAerial; Gfx.aerialTex = aerialTex;

  // ------------------------------------------------------------------ sky dome
  function makeSkyDome() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSky: { value: null }, uYaw: { value: 0 } }, depthWrite: false, depthTest: false, fog: false, side: THREE.BackSide,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform sampler2D uSky; uniform float uYaw; varying vec3 vDir;
        #include <common>
        void main(){
          vec3 d = normalize(vDir); float a = atan(d.z, d.x) + uYaw;
          vec2 uv = vec2(a * RECIPROCAL_PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
          vec4 c = texture2D(uSky, uv);
          // below the horizon: fade to the haze colour of the horizon row
          vec4 hz = texture2D(uSky, vec2(uv.x, 0.5004));
          c = mix(c, hz, smoothstep(0.0, -0.06, d.y));
          gl_FragColor = c;
          #include <encodings_fragment>
        }`
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -10; m.name = 'skyDome';
    return m;
  }

  // ------------------------------------------------------------------ ocean
  function makeOcean(lv, normTex, detTex) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      defines: { OCEAN_Q: lv.ocean },
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uNrm: { value: normTex }, uDet: { value: detTex }, uSky: { value: null }, uYaw: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.7, 0.4) },
        uSunCol: { value: new THREE.Vector3(1, 0.95, 0.85) }, uDeep: { value: new THREE.Color(0x0a3550) }, uShallow: { value: new THREE.Color(0x2a8f9a) },
        uHeight: { value: null }, uGrid: { value: new THREE.Vector4(0, 0, 1, 1) }, uWH: { value: new THREE.Vector2(1, 1) }, uSea: { value: 0 }, uSkyAvg: { value: new THREE.Vector3(0.5, 0.6, 0.7) }, uWind: { value: new THREE.Vector2(1, 0.3) }
      }]),
      vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime, uSea, uYaw; uniform sampler2D uNrm, uDet, uSky, uHeight; uniform vec3 uSun, uSunCol, uSkyAvg; uniform vec3 uDeep, uShallow; uniform vec4 uGrid; uniform vec2 uWH, uWind;
        varying vec3 vW;
        #include <common>
        #include <fog_pars_fragment>
        vec3 skyAt(vec3 d){ float a = atan(d.z, d.x) + uYaw; return texture2D(uSky, vec2(a * RECIPROCAL_PI2 + 0.5, clamp(asin(clamp(d.y, 0.0, 1.0)) * RECIPROCAL_PI + 0.5, 0.5, 0.999))).rgb; }
        void main(){
          vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
          vec2 p = vW.xz; float t = uTime;
          vec2 wd = normalize(uWind);
          vec2 n1 = texture2D(uNrm, p * 0.0045 + wd * t * 0.006).xy * 2.0 - 1.0;
          vec2 n2 = texture2D(uNrm, mat2(0.8, 0.6, -0.6, 0.8) * p * 0.0137 - wd.yx * vec2(1.0, -1.0) * t * 0.011 + 0.27).xy * 2.0 - 1.0;
          vec2 n3 = vec2(0.0);
          #if OCEAN_Q > 0
          n3 = texture2D(uNrm, mat2(0.28, 0.96, -0.96, 0.28) * p * 0.049 + wd * t * 0.021 + 0.61).xy * 2.0 - 1.0;
          #endif
          float far = exp(-dist * 0.0011);
          vec2 sl = (n1 * 0.55 + n2 * 0.42 + n3 * 0.30 * far) * (0.30 + 0.70 * far);
          vec3 N = normalize(vec3(sl.x, 1.0, sl.y));
          float nv = max(dot(N, V), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
          fres = clamp(fres * 0.92 + 0.03, 0.0, 1.0);
          vec3 R = reflect(-V, N); R.y = abs(R.y);
          vec3 refl = skyAt(R);
          // depth from the terrain height texture
          vec2 tuv = ((vW.xz - uGrid.xy) / uGrid.z + 0.5) / uWH;
          float depth = 14.0;
          if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) depth = uSea - (texture2D(uHeight, tuv).a * 24.0 - 12.0 + uSea);
          else depth = 14.0;
          depth = clamp(depth, -2.0, 14.0);
          float sh = exp(-max(depth, 0.0) * 0.42);
          vec3 body = mix(uDeep, uShallow, sh);
          body *= 0.75 + 0.35 * dot(N, normalize(uSun)) ;
          // subsurface glow in wave crests facing the sun
          body += uShallow * 0.35 * pow(max(dot(normalize(vec3(sl.x, 0.6, sl.y)), uSun), 0.0), 3.0) * (1.0 - sh * 0.5);
          vec3 H = normalize(uSun + V);
          float spec = pow(max(dot(N, H), 0.0), 520.0) * 3.5 + pow(max(dot(N, H), 0.0), 60.0) * 0.12;
          vec3 col = mix(body, refl, fres) + uSunCol * spec * smoothstep(-0.05, 0.25, uSun.y);
          // foam: shoreline surf + breaking caps
          float fn = texture2D(uDet, p * 0.09 + wd * t * 0.02).r, fn2 = texture2D(uDet, p * 0.31 - wd * t * 0.03).r;
          float surf = 0.0, caps = 0.0;
          #if OCEAN_Q > 0
          float wave = 0.5 + 0.5 * sin(t * 0.9 + depth * 2.2 + fn * 6.0);
          float edge = smoothstep(2.4 + 1.0 * wave, 0.0, depth);
          surf = edge * smoothstep(0.38, 0.62, fn * 0.65 + fn2 * 0.5) ;
          surf += smoothstep(0.35, 0.0, depth) * 0.8;
          caps = smoothstep(0.50, 0.85, length(sl) * 1.6 + (fn2 - 0.5) * 0.5) * (0.25 + 0.5 * smoothstep(8.0, 0.5, depth)) * far;
          #else
          surf = smoothstep(1.6, 0.0, depth) * smoothstep(0.35, 0.65, fn) + smoothstep(0.35, 0.0, depth);
          #endif
          float foam = clamp(surf + caps, 0.0, 1.0);
          col = mix(col, vec3(0.92, 0.95, 0.96) * (0.55 + 0.45 * smoothstep(-0.1, 0.5, uSun.y)), foam * 0.92);
          float alpha = smoothstep(-0.2, 0.55, depth);
          alpha = max(alpha, foam * 0.9);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
          #include <fog_fragment>
        }`
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), mat); m.rotation.x = -Math.PI / 2; m.name = 'ocean'; m.renderOrder = 2; m.frustumCulled = false;
    return m;
  }
  Gfx.makeSkyDome = makeSkyDome; Gfx.makeOcean = makeOcean;

  // ------------------------------------------------------------------ vegetation geometry
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  class GB {
    constructor() { this.p = []; this.c = []; this.i = []; this.uv = []; }
    v(x, y, z, col, u, w) { this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]); this.uv.push(u || 0, w || 0); return this.p.length / 3 - 1; }
    tri(a, b, c) { this.i.push(a, b, c); }
    geo(smooth) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setIndex(this.i); g.computeVertexNormals(); return g;
    }
  }
  function icoMesh(det) {
    const ico = new THREE.IcosahedronGeometry(1, det), pos = ico.attributes.position, map = new Map(), verts = [], remap = [];
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
      if (!map.has(key)) { map.set(key, verts.length); const l = Math.hypot(x, y, z); verts.push([x / l, y / l, z / l]); }
      remap.push(map.get(key));
    }
    const tris = []; for (let t = 0; t < remap.length; t += 3) tris.push([remap[t], remap[t + 1], remap[t + 2]]);
    ico.dispose(); return { verts, tris };
  }
  // linear-space colours
  const C_DK = [0.012, 0.045, 0.02], C_LT = [0.05, 0.13, 0.045], C_BARK = [0.07, 0.04, 0.022], C_BARK2 = [0.035, 0.025, 0.02];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Sitka spruce / Douglas fir: drooping ragged tiers, unit height, unit max crown radius
  function spruceGeo(q) {
    const g = new GB(), r = rng(7), T = [4, 6, 8][q], seg = [7, 9, 12][q];
    // trunk
    const tb = g.v(0.0, 0, 0, C_BARK), tr = 3 + q * 2; const ring = [];
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; ring.push(g.v(Math.cos(a) * 0.028, 0.0, Math.sin(a) * 0.028, C_BARK)); }
    const top = []; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; top.push(g.v(Math.cos(a) * 0.012, 0.62, Math.sin(a) * 0.012, C_BARK2)); }
    for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; g.tri(ring[k], top[k], ring[k2]); g.tri(ring[k2], top[k], top[k2]); }
    for (let t = 0; t < T; t++) {
      const f = t / (T - 1), yb = 0.1 + f * 0.62, ytop = yb + 0.34 - f * 0.1, R = 1.0 - f * 0.86;
      const apex = g.v(0, Math.min(1, ytop + 0.05 + (t === T - 1 ? 0.2 : 0)), 0, mixc(C_LT, C_DK, 0.2));
      const rg = [], rg2 = [];
      for (let k = 0; k < seg; k++) {
        const a = (k + (t % 2) * 0.5) / seg * 6.283 + r() * 0.15, ragged = (k % 2 ? 0.72 : 1.0) * (0.86 + r() * 0.18);
        const rr = R * ragged, droop = rr * 0.22 + r() * 0.02;
        rg.push(g.v(Math.cos(a) * rr, yb - droop, Math.sin(a) * rr, mixc(C_DK, C_LT, 0.15 + r() * 0.45)));
        rg2.push(g.v(Math.cos(a) * rr * 0.52, yb + (ytop - yb) * 0.4, Math.sin(a) * rr * 0.52, mixc(C_DK, C_LT, 0.35 + r() * 0.3)));
      }
      for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; g.tri(apex, rg2[k], rg2[k2]); g.tri(rg2[k], rg[k], rg[k2]); g.tri(rg2[k], rg[k2], rg2[k2]); }
      const cen = g.v(0, yb - R * 0.1, 0, [0.004, 0.012, 0.006]);
      for (let k = 0; k < seg; k++) g.tri(cen, rg[(k + 1) % seg], rg[k]);
    }
    return g.geo();
  }
  // Shore pine: wind-bent trunk with asymmetric foliage pads (leans toward +x)
  function pineGeo(q) {
    const g = new GB(), r = rng(11), pads = [3, 5, 7][q];
    const seg = 6, rings = [], N = 6;
    const trunkAt = (y) => [0.34 * y * y + 0.05 * Math.sin(y * 5.0), y, 0.06 * Math.sin(y * 3.0 + 1.0)];
    for (let j = 0; j <= N; j++) {
      const y = j / N * 0.72, c = trunkAt(y), rad = 0.035 * (1 - y * 0.8), ring = [];
      for (let k = 0; k < seg; k++) { const a = k / seg * 6.283; ring.push(g.v(c[0] + Math.cos(a) * rad, c[1], c[2] + Math.sin(a) * rad, mixc(C_BARK, C_BARK2, y))); }
      rings.push(ring);
    }
    for (let j = 0; j < N; j++) for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; g.tri(rings[j][k], rings[j + 1][k], rings[j][k2]); g.tri(rings[j][k2], rings[j + 1][k], rings[j + 1][k2]); }
    const ico = icoMesh(q === 0 ? 0 : 1);
    for (let n = 0; n < pads; n++) {
      const f = pads === 1 ? 1 : n / (pads - 1), y = 0.42 + f * 0.5, c = trunkAt(Math.min(y, 0.72)), cx = c[0] + (r() - 0.3) * 0.3 + f * 0.1, cz = c[2] + (r() - 0.5) * 0.3, cy = y + (r() - 0.5) * 0.05;
      const rx = (0.5 - f * 0.18) * (0.9 + r() * 0.3), ry = 0.15 + r() * 0.07, rz = rx * 0.85, base = g.p.length / 3, seed = r() * 10;
      ico.verts.forEach((vv) => {
        const x = vv[0], yy = vv[1], z = vv[2];
        const bump = 1 + 0.22 * Math.sin(x * 5 + seed) * Math.cos(z * 4 + seed * 1.7) + (r() - 0.5) * 0.1;
        const tip = Math.max(0, yy);
        g.v(cx + x * rx * bump, cy + yy * ry * bump * (yy < 0 ? 0.55 : 1), cz + z * rz * bump, mixc(C_DK, C_LT, 0.2 + tip * 0.55 + r() * 0.15));
      });
      ico.tris.forEach((t) => g.tri(base + t[0], base + t[1], base + t[2]));
    }
    return g.geo();
  }
  // Gorse bush: lumpy dome, speckled with yellow flower clusters in the vertex colours
  function gorseGeo(q) {
    const ico = icoMesh([0, 1, 2][q]), r = rng(5), g = new GB();
    const DG = [0.018, 0.05, 0.014], LG = [0.05, 0.1, 0.02], YL = [0.8, 0.52, 0.015];
    const ids = ico.verts.map((v) => {
      const b = 0.8 + r() * 0.32, up = Math.max(0, v[1]);
      let col = mixc(DG, LG, r() * 0.7 + up * 0.3); if (r() < 0.2 + up * 0.22) col = mixc(col, YL, 0.75 + r() * 0.25);
      return g.v(v[0] * b, Math.max(v[1], -0.3) * b * 0.85, v[2] * b, col);
    });
    ico.tris.forEach((t) => g.tri(ids[t[0]], ids[t[1]], ids[t[2]]));
    return g.geo();
  }
  // tuft of grass: three crossed cards, bendable by the vertex shader (uv.y = height factor)
  function grassGeo() {
    const g = new GB(), W = 0.55;
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI, cx = Math.cos(a) * W, cz = Math.sin(a) * W;
      const a0 = g.v(-cx, 0, -cz, [1, 1, 1], 0, 0), a1 = g.v(cx, 0, cz, [1, 1, 1], 1, 0), a2 = g.v(-cx * 0.9, 1, -cz * 0.9, [1, 1, 1], 0, 1), a3 = g.v(cx * 0.9, 1, cz * 0.9, [1, 1, 1], 1, 1);
      g.tri(a0, a1, a2); g.tri(a1, a3, a2);
    }
    const geo = g.geo(); const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return geo;
  }
  function grassTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128); const r = rng(3);
    for (let b = 0; b < 26; b++) {
      const bx = 6 + r() * 116, hgt = 50 + r() * 76, lean = (r() - 0.5) * 44, w = 2.2 + r() * 2.2, sh = 0.55 + r() * 0.45;
      x.fillStyle = `rgb(${Math.round(255 * sh)},${Math.round(255 * sh)},${Math.round(255 * (sh * 0.85))})`;
      x.beginPath(); x.moveTo(bx - w, 128); x.quadraticCurveTo(bx - w * 0.6 + lean * 0.3, 128 - hgt * 0.55, bx + lean, 128 - hgt); x.quadraticCurveTo(bx + w * 0.6 + lean * 0.3, 128 - hgt * 0.55, bx + w, 128); x.closePath(); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; return t;
  }
  function flowerTexture() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32; const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 1, 16, 16, 15);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  Gfx.geo = { spruce: spruceGeo, pine: pineGeo, gorse: gorseGeo, grass: grassGeo };
  Gfx.grassTexture = grassTexture; Gfx.flowerTexture = flowerTexture; Gfx.rng = rng;

  // ------------------------------------------------------------------ scene-level helpers
  let renderer = null, pmrem = null; const envRT = {};
  const timeU = { value: 0 }; Gfx.timeU = timeU;
  Gfx.init = (r) => { renderer = r; pmrem = new THREE.PMREMGenerator(r); };
  Gfx.applyRenderer = (r, lv) => {
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = lv.exposure;
    r.shadowMap.enabled = lv.shadow > 0; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = true;
  };
  Gfx.envFor = (kind) => {
    if (!envRT[kind]) { envRT[kind] = pmrem.fromEquirectangular(skyEnv[kind]); }
    return envRT[kind].texture;
  };
  // sun direction after yawing the sky by `yaw`
  Gfx.sunDir = (kind, yaw) => {
    const m = skyMeta[kind].sun, a = Math.atan2(m[2], m[0]) - yaw, hl = Math.hypot(m[0], m[2]);
    return new THREE.Vector3(Math.cos(a) * hl, m[1], Math.sin(a) * hl).normalize();
  };

  // shadow camera follows the view (snapped to texels so the shadows do not swim)
  Gfx.updateShadow = (sun, camera, lv, sunDir) => {
    if (!lv.shadow) return;
    const R = lv.shadowR, sc = sun.shadow.camera;
    if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 520; sc.updateProjectionMatrix(); sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.18; sun.shadow.radius = 2.5; }
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const tx = camera.position.x + f.x * R * 0.55, tz = camera.position.z + f.z * R * 0.55;
    const tsz = (2 * R) / lv.shadow, qx = Math.round(tx / tsz) * tsz, qz = Math.round(tz / tsz) * tsz;
    const ty = camera.position.y * 0 + sun.userData.groundY;
    sun.target.position.set(qx, ty, qz); sun.target.updateMatrixWorld();
    sun.position.set(qx + sunDir.x * 260, ty + sunDir.y * 260, qz + sunDir.z * 260);
    sun.updateMatrixWorld();
  };

  // ------------------------------------------------------------------ vegetation instances
  function instanced(geo, mat, items, fn) {
    const im = new THREE.InstancedMesh(geo, mat, items.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < items.length; i++) { fn(items[i], p, q, sv, c, i); M.compose(p, q, sv); im.setMatrixAt(i, M); im.setColorAt(i, c); }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; return im;
  }
  const UP = new THREE.Vector3(0, 1, 0);
  Gfx.buildVegetation = (h, lv) => {
    const out = [], o = h.objs, r = rng(h.no * 131 + 17), tmp = new THREE.Quaternion();
    const shadows = lv.shadow > 0;
    // --- gorse bushes + yellow flowers
    if (o.gorse.length) {
      const geo = gorseGeo(lv.gorseQ), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
      const im = instanced(geo, mat, o.gorse, (it, p, q, sv, c) => { p.set(it.x, it.y + it.sy * 0.32, it.z); sv.set(it.sx, it.sy, it.sx * (0.8 + it.c * 0.4)); q.setFromAxisAngle(UP, it.c * 6.28); const k = 0.8 + it.c * 0.45; c.setRGB(k, k, k); });
      im.castShadow = lv.shadow > 0 && lv.gorseQ >= 2; im.receiveShadow = shadows; im.name = 'gorse'; out.push(im);
      if (lv.flowers > 0) {
        const items = []; const nPer = lv.flowers;
        o.gorse.forEach((it) => { for (let k = 0; k < nPer; k++) items.push(it); });
        const fg = new GB(); [0, 1].forEach((k) => { const a = k * Math.PI / 2, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5; const v0 = fg.v(-cx, -0.1, -cz, [1, 1, 1], 0, 0), v1 = fg.v(cx, -0.1, cz, [1, 1, 1], 1, 0), v2 = fg.v(-cx, 0.5, -cz, [1, 1, 1], 0, 1), v3 = fg.v(cx, 0.5, cz, [1, 1, 1], 1, 1); fg.tri(v0, v1, v2); fg.tri(v1, v3, v2); });
        const fgeo = fg.geo(), fmat = new THREE.MeshBasicMaterial({ map: flowerTexture(), alphaTest: 0.45, side: THREE.DoubleSide, toneMapped: true });
        const fm = instanced(fgeo, fmat, items, (it, p, q, sv, c) => {
          const th = r() * 6.283, ph = Math.acos(0.15 + r() * 0.85), sy = Math.sin(ph);
          p.set(it.x + Math.cos(th) * sy * it.sx * 0.9, it.y + it.sy * 0.32 + Math.cos(ph) * it.sy * 0.78, it.z + Math.sin(th) * sy * it.sx * 0.9 * (0.8 + it.c * 0.4));
          const s0 = 0.16 + r() * 0.16; sv.set(s0, s0, s0); q.setFromAxisAngle(UP, r() * 6.28);
          c.setRGB(1.0, 0.62 + r() * 0.2, 0.02 + r() * 0.05);
        });
        fm.name = 'gorseFlowers'; out.push(fm);
      }
    }
    // --- trees: Sitka spruce + shore pine
    if (o.trees.length) {
      const sp = [], pn = [];
      o.trees.forEach((it) => { (h.forest ? it.c < 0.1 : it.c < 0.55) ? pn.push(it) : sp.push(it); });
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      const mk = (geo, list, sc, name) => {
        if (!list.length) return;
        const im = instanced(geo, mat, list, (it, p, q, sv, c) => { p.set(it.x, it.y - 0.05, it.z); sv.set(it.cr * sc, it.h, it.cr * sc); q.setFromAxisAngle(UP, it.c * 43.7); const k = 0.72 + ((it.c * 7.13) % 1) * 0.5; c.setRGB(k, k * (0.96 + it.c * 0.08), k * 0.95); });
        im.castShadow = shadows; im.receiveShadow = shadows; im.name = name; out.push(im);
      };
      mk(spruceGeo(lv.treeQ), sp, 1.0, 'spruce'); mk(pineGeo(lv.treeQ), pn, 1.9, 'pine');
    }
    // --- dune grass tufts along the corridor
    if (lv.grass > 0) {
      const S = BG.Phys.S, items = []; let tries = 0;
      while (items.length < lv.grass && tries++ < lv.grass * 5) {
        const s = r() * h.L, pt = h.pathAt(s), side = r() < 0.5 ? -1 : 1, off = (6 + Math.pow(r(), 1.6) * 75) * side;
        const x = pt.x - pt.hz * off, z = pt.z + pt.hx * off, sf = h.surf(x, z);
        if (sf !== S.DEEP && sf !== S.ROUGH && !(sf === S.OB && r() < 0.5)) continue;
        if (sf === S.ROUGH && r() < 0.6) continue;
        items.push({ x, z, y: h.h(x, z), c: r(), w: 0.5 + r() * 0.7, hh: 0.4 + r() * 0.5, tall: r() < 0.16 });
      }
      if (items.length) {
        const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = timeU;
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
            { float sw = uv.y * uv.y; vec3 ip = vec3(instanceMatrix[3]); float g = sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) + 0.5 * sin(uTime * 3.1 + ip.x * 0.9);
              transformed.x += g * 0.09 * sw; transformed.z += g * 0.05 * sw; }`);
        };
        const im = instanced(grassGeo(), mat, items, (it, p, q, sv, c) => {
          p.set(it.x, it.y - 0.02, it.z); const k = it.tall ? 1.7 : 1; sv.set(it.w * k, it.hh * k * (it.tall ? 1.0 : 1.0), it.w * k); q.setFromAxisAngle(UP, it.c * 25.3);
          const gt = (it.c * 13.7) % 1; c.setRGB(0.42 - gt * 0.18, 0.36 - gt * 0.06, 0.13 + gt * 0.02); c.multiplyScalar(1.4);
        });
        im.name = 'grass'; out.push(im);
      }
    }
    return out;
  };
})();
