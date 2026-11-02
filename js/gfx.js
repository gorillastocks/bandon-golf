/* Abandoned Dunes — graphics module: quality levels, PBR terrain, sky/IBL, ocean, vegetation.
   Needs three.js r149 (global build, no addons). All textures are CC0 (see README). */
(function () {
  'use strict';
  const BG = window.BG = window.BG || {};
  // linear working space + ACES + sRGB output (must be set before any Color is created)
  THREE.ColorManagement.legacyMode = false;

  // ------------------------------------------------------------------ fog: ocean mist (height-dependent extra density near sea level) + aerial perspective
  // uMistP = (strength, sea-level y, unused, unused); zero strength = plain exponential fog. Works for every material that uses fog.
  const mistU = { value: new THREE.Vector4(0, 0, 0, 0) };
  THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying float vFogWY;\n#endif';
  THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogWY = cameraPosition.y + dot(viewMatrix[1].xyz, mvPosition.xyz);\n#endif';
  THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying float vFogWY; uniform vec4 uMistP;\n #ifdef FOG_EXP2\n  uniform float fogDensity;\n #else\n  uniform float fogNear; uniform float fogFar;\n #endif\n#endif';
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fdv = fogDensity * vFogDepth;
    float mistH = uMistP.x * exp(-max(vFogWY - uMistP.y, 0.0) / 11.0);
    float fogFactor = 1.0 - exp(-fdv * fdv * (1.0 + 2.8 * mistH));
    vec3 fogC = fogColor * mix(vec3(1.0), vec3(0.94, 0.985, 1.05), smoothstep(250.0, 1300.0, vFogDepth) * uMistP.x) + vec3(0.035) * mistH * fogFactor;
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth); vec3 fogC = fogColor;
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogFactor);
#endif`;
  THREE.Material.prototype.onBeforeCompile = function (sh) { sh.uniforms.uMistP = mistU; };

  // ------------------------------------------------------------------ levels
  const LEVELS = {
    low: { id: 'low', label: 'Low', tex: 512, detailN: false, shadow: 0, shadowR: 0, env: false, grass: 0, flowers: 0, treeQ: 0, gorseQ: 0, dpr: 1.5, splat: 2, ocean: 0, exposure: 1.0, farGrass: 0, blades: 0, mist: 0 },
    medium: { id: 'medium', label: 'Medium', tex: 512, detailN: true, shadow: 1024, shadowR: 58, env: true, grass: 5000, flowers: 5, treeQ: 1, gorseQ: 1, dpr: 2, splat: 1, ocean: 1, exposure: 1.0, blades: 4500, bladeR: 26, mist: 0.6, ao: 1 },
    high: { id: 'high', label: 'High', tex: 1024, detailN: true, shadow: 2048, shadowR: 72, env: true, grass: 16000, flowers: 12, treeQ: 2, gorseQ: 2, dpr: 2, splat: 1, ocean: 2, exposure: 1.0, blades: 12000, bladeR: 32, mist: 1.0, ao: 1 },
    // Ultra = High + post pipeline (MSAA scene target, light bloom, flyover tilt-shift DoF, grade), tile-breaking second albedo tap, denser near grass
    ultra: { id: 'ultra', label: 'Ultra', tex: 1024, detailN: true, shadow: 2048, shadowR: 80, env: true, grass: 20000, flowers: 14, treeQ: 2, gorseQ: 2, dpr: 2, splat: 1, ocean: 2, exposure: 1.0, blades: 18000, bladeR: 36, mist: 1.0, ao: 1, tilefix: true, post: true }
  };
  const ORDER = ['auto', 'low', 'medium', 'high', 'ultra'];
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
  let pref = 'high', autoLevel = 'medium'; // first-run default: High (a saved 'bg.gfx' choice, including 'auto', wins)
  try { pref = localStorage.getItem('bg.gfx') || 'high'; } catch (e) {}
  try { const q = new URLSearchParams(location.search).get('gfx'); if (q && ORDER.includes(q)) pref = q; } catch (e) {}
  if (!ORDER.includes(pref)) pref = 'high';
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
  const LAYER_TINT = [[0.98, 1.05, 0.6], [0.9, 1.08, 0.7], [0.86, 0.9, 0.56], [0.44, 0.55, 0.32], [0.88, 0.84, 0.72], [0.62, 0.72, 0.36], [1.1, 1.05, 0.98]];
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
      #ifdef BG_TILEFIX
      { mat2 rm = mat2(0.8, 0.6, -0.6, 0.8) * 0.37; vec3 a2 = textureGrad(uAlb, vec3(rm * uv + vec2(0.31, 0.57), float(i)), rm * gx, rm * gy).rgb; a = mix(a, a2, smoothstep(0.3, 0.7, n2 * 0.6 + n1 * 0.4) * 0.75); }
      #endif
      if (uDetailN > 0.5) nr = textureGrad(uNrm, vec3(uv, float(i)), gx, gy);
    }
    col += a * uTint[i] * w;
    nacc += (nr.xy * 2.0 - 1.0) * uNStr[i] * w;
    racc += nr.z * w;
  }
  if (uDetailN < 0.5) racc = 0.9;
  #ifdef BG_AO
  {
    // cavity occlusion from the height map: hollows and dune lee-sides are darker, crests slightly lighter (no extra textures)
    vec2 q1 = vec2(3.0) / (uGrid.z * uWH), q2 = vec2(10.0) / (uGrid.z * uWH);
    float hC = nt.a;
    float h1 = texture2D(uNTex, tuv + vec2(q1.x, 0.0)).a + texture2D(uNTex, tuv - vec2(q1.x, 0.0)).a + texture2D(uNTex, tuv + vec2(0.0, q1.y)).a + texture2D(uNTex, tuv - vec2(0.0, q1.y)).a;
    float h2 = texture2D(uNTex, tuv + vec2(q2.x, 0.0)).a + texture2D(uNTex, tuv - vec2(q2.x, 0.0)).a + texture2D(uNTex, tuv + vec2(0.0, q2.y)).a + texture2D(uNTex, tuv - vec2(0.0, q2.y)).a;
    float cav1 = (h1 * 0.25 - hC) * 24.0, cav2 = (h2 * 0.25 - hC) * 24.0;
    float ao = 1.0 - clamp(cav1 * 0.45 + cav2 * 0.12, 0.0, 0.5) + clamp(-(cav1 * 0.2 + cav2 * 0.05), 0.0, 0.1);
    col *= mix(ao, 1.0, wt[1] * 0.7);
    col = mix(col, col * vec3(0.8, 1.02, 0.6), clamp(cav2 * 0.35, 0.0, 0.7) * (wt[2] + wt[3]));   // damp hollows hold greener turf, crests bleach
  }
  #endif
  // large scale colour variation (breaks up tiling): sun-bleached / lush patches
  float mac = n1 * 0.55 + n2 * 0.45;
  col *= 0.7 + 0.62 * mac;
  col = mix(col, col * vec3(1.14, 1.0, 0.72), smoothstep(0.35, 0.75, n2) * (wt[2] + wt[3] + wt[4] + wt[5]) * 0.6);
  // mowing: fairway bands from the baked stripe parity, green bands across its heading
  float fwW = wt[0], grW = wt[1];
  col *= 1.0 + (sB.a - 0.5) * 0.36 * fwW;
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
    const g = h.green, hd = g && g.hx !== undefined;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uAlb: { value: T.alb }, uNrm: { value: T.nrm || T.alb }, uSplA: { value: data.A }, uSplB: { value: data.B }, uNTex: { value: data.N }, uDet: { value: detTex },
        uGrid: { value: new THREE.Vector4(h.x0, h.z0, h.res * data.st, 1) }, uWH: { value: new THREE.Vector2(data.W, data.H) }, uSea: { value: h.SEA_Y || 0 }, uDetailN: { value: lv.detailN ? 1 : 0 },
        uTint: { value: LAYER_TINT.map((c) => new THREE.Vector3(c[0], c[1], c[2])) }, uScale: { value: LAYER_SCALE }, uNStr: { value: LAYER_NSTR },
        uMistP: mistU,
        uGreen: { value: new THREE.Vector4(hd ? g.x : 0, hd ? g.z : 0, hd ? g.hx : 1, hd ? g.hz : 0) }, uHasGreen: { value: hd ? 1 : 0 }
      });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorld;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TERRAIN_FS_HEAD)
        .replace('#include <map_fragment>', TERRAIN_MAP)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tNormalW, 0.0)).xyz);');
    };
    m.defines = {}; if (lv.ao) m.defines.BG_AO = 1; if (lv.tilefix) m.defines.BG_TILEFIX = 1;
    m.customProgramCacheKey = () => 'bgterrain3' + (lv.detailN ? 'n' : '') + (lv.ao ? 'a' : '') + (lv.tilefix ? 't' : '');
    return m;
  }
  Gfx.buildTerrainData = buildTerrainData; Gfx.terrainMaterial = terrainMaterial;

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
        uHeight: { value: null }, uGrid: { value: new THREE.Vector4(0, 0, 1, 1) }, uWH: { value: new THREE.Vector2(1, 1) }, uSea: { value: 0 }, uSkyAvg: { value: new THREE.Vector3(0.5, 0.6, 0.7) }, uWind: { value: new THREE.Vector2(1, 0.3) }, uMistP: mistU,
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
          // sun glitter: tiny wave facets catching the sun, only in the sun-lit direction and fading with distance
          vec2 gq = p * 1.7 + wd * t * 0.35; vec2 gn = (texture2D(uDet, gq * 0.11).rg + texture2D(uNrm, gq * 0.07).rg - 1.0) * 0.5;
          vec3 Ng = normalize(vec3(sl.x + gn.x * 0.55, 1.0, sl.y + gn.y * 0.55)); float gl = pow(max(dot(Ng, H), 0.0), 900.0);
          col += uSunCol * gl * 4.0 * exp(-dist * 0.0016) * smoothstep(0.0, 0.3, uSun.y);
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
  const C_DK = [0.008, 0.026, 0.012], C_LT = [0.032, 0.075, 0.03], C_BARK = [0.07, 0.04, 0.022], C_BARK2 = [0.035, 0.025, 0.02];
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
    { const geo = g.geo(), P = geo.attributes.position, N = geo.attributes.normal;   // soft conical shading instead of facets (foliage only; trunk keeps its normals)
      for (let i = 0; i < N.count; i++) { if (P.getY(i) < 0.1 && Math.hypot(P.getX(i), P.getZ(i)) < 0.05) continue; const x = P.getX(i), z = P.getZ(i), l = Math.hypot(x, z) || 1; N.setXYZ(i, x / l * 0.8, 0.55, z / l * 0.8); }
      return geo; }
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
    // Gorse (whin): a dark woody mound bristling with spiky green shoots (thin crossed blades), yellow-tipped on the sunny side.
    // q = 0 low, 1 medium, 2 high. Normals blend the radial direction with up so the clump shades as one soft form, not as facets.
    const r = rng(5), g = new GB();
    const core = icoMesh([0, 1, 1][q]), DG = [0.012, 0.03, 0.01], MG = [0.03, 0.065, 0.014], TG = [0.07, 0.12, 0.022], YL = [0.75, 0.46, 0.012];
    const cids = core.verts.map((v) => { const b = 0.62 + r() * 0.12; return g.v(v[0] * b, Math.max(v[1], -0.3) * b * 0.8, v[2] * b, mixc(DG, MG, 0.2 + 0.4 * Math.max(0, v[1]))); });
    core.tris.forEach((t) => g.tri(cids[t[0]], cids[t[1]], cids[t[2]]));
    const NS = [26, 70, 130][q], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < NS; i++) {
      const yy = 1 - (i + 0.5) / NS * 1.3, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = i * ga + r() * 0.5;   // Fibonacci cap: upper hemisphere + skirt
      let dx = Math.cos(th) * rr, dy = yy, dz = Math.sin(th) * rr;
      dy += 0.25; const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const rb = 0.58 + r() * 0.1, len = 0.34 + r() * 0.3 + (dy > 0.3 ? 0.08 : 0), w = 0.045 + r() * 0.03;
      const bx = dx * rb, by = Math.max(dy * rb * 0.8, -0.3), bz = dz * rb;
      const tx = bx + dx * len + (r() - 0.5) * 0.18, ty = by + dy * len + 0.1 * len, tz = bz + dz * len + (r() - 0.5) * 0.18;
      const sun = Math.max(0, dy), yel = r() < 0.12 + sun * 0.3;
      const cb = mixc(DG, MG, r() * 0.8), cm = mixc(MG, TG, r() * 0.9), ct = yel ? mixc(TG, YL, 0.8 + r() * 0.2) : mixc(cm, TG, 0.6);
      const ax = -dz * w, az = dx * w, ay = 0;                       // blade A: horizontal cross-section vector
      let bxv = dy * az - dz * ay, byv = dz * ax - dx * az, bzv = dx * ay - dy * ax; const bl = Math.hypot(bxv, byv, bzv) || 1; bxv *= w / bl; byv *= w / bl; bzv *= w / bl;   // blade B: d x A
      const a0 = g.v(bx - ax, by, bz - az, cb), a1 = g.v(bx + ax, by, bz + az, cb), at = g.v(tx, ty, tz, ct);
      const b0 = g.v(bx - bxv, by - byv, bz - bzv, cb), b1 = g.v(bx + bxv, by + byv, bz + bzv, cb);
      g.tri(a0, a1, at); g.tri(b0, b1, at); void cm;
    }
    const geo = g.geo(); const P = geo.attributes.position, N = geo.attributes.normal;
    for (let i = 0; i < N.count; i++) { let x = P.getX(i), y = P.getY(i) + 0.05, z = P.getZ(i); const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; N.setXYZ(i, x * 0.6, y * 0.6 + 0.55, z * 0.6); }
    return geo;
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
  const timeU = { value: 0 }; Gfx.timeU = timeU; Gfx.setMist = (lv, seaY, coast) => { mistU.value.set((lv.mist || 0) * (coast ? 1 : 0.45), seaY || 0, 0, 0); };
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
  // The frustum is tightened when the camera is low (aiming / putting) so near shadows are 2x sharper, and widens smoothly for the fly-over / ball flight.
  let shR = 0;
  Gfx.updateShadow = (sun, camera, lv, sunDir) => {
    if (!lv.shadow) return;
    const gy = sun.userData.groundY || 0, hAbove = Math.max(0, camera.position.y - gy);
    const tgt = lv.shadowR * (0.5 + 0.5 * Math.min(1, Math.max(0, (hAbove - 4) / 28)));
    shR = shR ? shR + (tgt - shR) * 0.06 : tgt;
    const sc = sun.shadow.camera, R0 = lv.shadowR;
    if (sc.userData.R0 !== R0) { sc.near = 1; sc.far = 520; sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.18; sun.shadow.radius = 2.5; sc.userData.R0 = R0; }
    const tsz0 = (2 * R0) / lv.shadow; let R = Math.round(shR / tsz0 / 8) * tsz0 * 8; R = Math.max(R, R0 * 0.45);   // quantised so the frustum only changes in discrete steps (no shimmer)
    if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const tx = camera.position.x + f.x * R * 0.55, tz = camera.position.z + f.z * R * 0.55;
    const tsz = (2 * R) / lv.shadow, qx = Math.round(tx / tsz) * tsz, qz = Math.round(tz / tsz) * tsz;
    const ty = gy;
    sun.target.position.set(qx, ty, qz); sun.target.updateMatrixWorld();
    sun.position.set(qx + sunDir.x * 260, ty + sunDir.y * 260, qz + sunDir.z * 260);
    sun.updateMatrixWorld();
  };

  // ------------------------------------------------------------------ post pipeline (Ultra only)
  // Scene -> 4x MSAA RGBA8 target (tone mapped + sRGB encoded by the materials themselves: the target is flagged like an XR target so r149 keeps ACES + sRGB output),
  // -> 1/4-res downsample -> separable blur (x2) -> composite: bloom (display-referred highlights), tilt-shift depth-of-field during fly-overs, soft vignette, grade, dither.
  // Costs 4 small passes + 1 full-screen pass. Not used on Low/Medium/High (they render straight to the canvas).
  const POST = { rt: null, a: null, b: null, quad: null, cam: null, mats: null, w: 0, h: 0, fly: 0 };
  function postInit() {
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mk = (fs, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
    POST.mats = {
      down: mk(`uniform sampler2D tIn; uniform vec2 uTexel; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tIn, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tIn, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.0, 1.0)).rgb;
          gl_FragColor = vec4(c * 0.25, 1.0); }`, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      blur: mk(`uniform sampler2D tIn; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tIn, vUv).rgb * 0.2270270;
          c += (texture2D(tIn, vUv + uDir * 1.3846154).rgb + texture2D(tIn, vUv - uDir * 1.3846154).rgb) * 0.3162162;
          c += (texture2D(tIn, vUv + uDir * 3.2307692).rgb + texture2D(tIn, vUv - uDir * 3.2307692).rgb) * 0.0702703;
          gl_FragColor = vec4(c, 1.0); }`, { tIn: { value: null }, uDir: { value: new THREE.Vector2() } }),
      comp: mk(`uniform sampler2D tScene, tBlur; uniform float uFly, uBloom, uTime; uniform vec2 uRes; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb, bl = texture2D(tBlur, vUv).rgb;
          // tilt-shift DoF: the middle band (the fairway) stays sharp, near foreground and far horizon soften, only while flying over
          float band = smoothstep(0.30, 0.0, vUv.y) * 0.9 + smoothstep(0.62, 1.0, vUv.y) * 0.55;
          c = mix(c, bl, clamp(band * uFly, 0.0, 0.85));
          // bloom: display-referred highlights above ~0.72 luma, spread by the blur
          float lum = dot(bl, vec3(0.299, 0.587, 0.114)); float k = smoothstep(0.80, 1.05, lum);
          c += max(bl - 0.74, 0.0) * k * uBloom * 2.0;
          // vignette + gentle warm grade
          vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * 0.55; c *= v;
          c = mix(c, c * vec3(1.03, 1.0, 0.965), 0.5); c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.06);
          c += (hash(vUv * uRes + uTime) - 0.5) / 255.0;
          gl_FragColor = vec4(c, 1.0); }`, { tScene: { value: null }, tBlur: { value: null }, uFly: { value: 0 }, uBloom: { value: 0.22 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } })
    };
    POST.quad = new THREE.Mesh(tri, POST.mats.comp); POST.quad.frustumCulled = false; POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  function postSize(r) {
    const sz = r.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(2, sz.x), h = Math.max(2, sz.y);
    if (POST.rt && POST.w === w && POST.h === h) return;
    postDispose(); POST.w = w; POST.h = h;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false, samples: 4 });
    rt.texture.generateMipmaps = false;
    // r149 skips tone mapping / sRGB output for render targets unless they look like an XR target with an sRGB texture. The GL buffers must be created as plain RGBA8 first
    // (an sRGB texture would not match the MSAA renderbuffer), so initialise the target, then flip the flags the program setup reads.
    r.setRenderTarget(rt); r.setRenderTarget(null); rt.isXRRenderTarget = true; rt.texture.encoding = THREE.sRGBEncoding;
    const sm = (ww, hh) => new THREE.WebGLRenderTarget(ww, hh, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    POST.rt = rt; POST.a = sm(Math.ceil(w / 4), Math.ceil(h / 4)); POST.b = sm(Math.ceil(w / 4), Math.ceil(h / 4));
  }
  function postDispose() { ['rt', 'a', 'b'].forEach((k) => { if (POST[k]) { POST[k].dispose(); POST[k] = null; } }); POST.w = 0; }
  const pass = (r, mat, target) => { POST.quad.material = mat; r.setRenderTarget(target); r.render(POST.quad, POST.cam); };
  // Gfx.render(renderer, scene, camera, flyAmount 0..1, time)
  Gfx.render = (r, scene, camera, fly, time) => {
    const lv = Gfx.level();
    if (!lv.post) { if (POST.rt) postDispose(); r.render(scene, camera); return; }
    if (!POST.mats) postInit();
    postSize(r);
    r.setRenderTarget(POST.rt); r.render(scene, camera);
    const M = POST.mats;
    M.down.uniforms.tIn.value = POST.rt.texture; M.down.uniforms.uTexel.value.set(1 / POST.w, 1 / POST.h); pass(r, M.down, POST.a);
    M.blur.uniforms.tIn.value = POST.a.texture; M.blur.uniforms.uDir.value.set(1 / POST.a.width, 0); pass(r, M.blur, POST.b);
    M.blur.uniforms.tIn.value = POST.b.texture; M.blur.uniforms.uDir.value.set(0, 1 / POST.a.height); pass(r, M.blur, POST.a);
    M.blur.uniforms.tIn.value = POST.a.texture; M.blur.uniforms.uDir.value.set(2 / POST.a.width, 0); pass(r, M.blur, POST.b);
    M.blur.uniforms.tIn.value = POST.b.texture; M.blur.uniforms.uDir.value.set(0, 2 / POST.a.height); pass(r, M.blur, POST.a);
    const cu = M.comp.uniforms; cu.tScene.value = POST.rt.texture; cu.tBlur.value = POST.a.texture; cu.uFly.value = fly || 0; cu.uTime.value = (time || 0) % 7; cu.uRes.value.set(POST.w, POST.h);
    pass(r, M.comp, null);
  };
  Gfx.postStats = () => ({ on: !!POST.rt, w: POST.w, h: POST.h, mb: POST.rt ? Math.round((POST.w * POST.h * 4 * 5 + POST.a.width * POST.a.height * 8) / 1048576) : 0 });

  // ------------------------------------------------------------------ near-field grass blades (camera-following, LOD, wind sway)
  // Clumps of curved blades scattered on rough/deep-rough/OB ground in a disc ahead of the camera. Placement is a jittered world grid with a
  // per-cell hash, so blades stay put as the camera moves; density falls off with distance and the vertex shader shrinks blades to nothing
  // at the edge (no popping). Only Medium/High build this (lv.blades > 0).
  function bladeGeo() {
    const g = new GB(), r = rng(91), NB = 5;
    for (let b = 0; b < NB; b++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 0.16, ox = Math.cos(a) * d, oz = Math.sin(a) * d, th = r() * 6.283, w = 0.012 + r() * 0.01, hh = 0.75 + r() * 0.5, lean = 0.12 + r() * 0.28;
      const cx = Math.cos(th), cz = Math.sin(th), lx = Math.cos(th + 1.57) * lean, lz = Math.sin(th + 1.57) * lean;
      const sh = 0.55 + r() * 0.45;
      const v0 = g.v(ox - cx * w, 0, oz - cz * w, [0.45 * sh, 0.5 * sh, 0.3 * sh], 0, 0), v1 = g.v(ox + cx * w, 0, oz + cz * w, [0.45 * sh, 0.5 * sh, 0.3 * sh], 1, 0);
      const m0 = g.v(ox - cx * w * 0.7 + lx * 0.35 * hh, 0.55 * hh, oz - cz * w * 0.7 + lz * 0.35 * hh, [0.75 * sh, 0.8 * sh, 0.42 * sh], 0, 0.55), m1 = g.v(ox + cx * w * 0.7 + lx * 0.35 * hh, 0.55 * hh, oz + cz * w * 0.7 + lz * 0.35 * hh, [0.75 * sh, 0.8 * sh, 0.42 * sh], 1, 0.55);
      const t = g.v(ox + lx * hh, hh, oz + lz * hh, [1.0 * sh, 1.0 * sh, 0.62 * sh], 0.5, 1);
      g.tri(v0, v1, m0); g.tri(v1, m1, m0); g.tri(m0, m1, t);
    }
    const geo = g.geo(); const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return geo;
  }
  const nearU = { uTime: timeU, uWindV: { value: new THREE.Vector3(1, 0, 0.6) }, uBladeR: { value: 30 } };
  function hash2(i, j, k) { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  Gfx.makeNearGrass = (lv) => {
    if (!lv.blades) return null;
    const cap = lv.blades, R = lv.bladeR, cell = (lv.id === 'high' || lv.id === 'ultra') ? 0.8 : 1.15;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = nearU.uTime; sh.uniforms.uWindV = nearU.uWindV; sh.uniforms.uBladeR = nearU.uBladeR; sh.uniforms.uMistP = mistU;
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uBladeR; uniform vec3 uWindV;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(instanceMatrix[3]); float hf = uv.y; float sw = hf * hf;
          float ph = ip.x * 0.37 + ip.z * 0.29;
          float gst = sin(uTime * (1.3 + uWindV.z * 0.5) + ph) + 0.5 * sin(uTime * 2.9 + ph * 1.7);
          float amp = (0.05 + 0.11 * uWindV.z) * (0.6 + 0.4 * gst);
          transformed.xz += normalize(uWindV.xy + vec2(1e-4)) * amp * sw * (0.5 + 0.5 * gst);
          transformed.x += 0.02 * sin(uTime * 4.0 + ph * 3.0) * sw;
          float dc = length(ip - cameraPosition); transformed *= 1.0 - smoothstep(uBladeR * 0.62, uBladeR, dc); }`);
    };
    mat.customProgramCacheKey = () => 'bgblade';
    const im = new THREE.InstancedMesh(bladeGeo(), mat, cap); im.frustumCulled = false; im.count = 0; im.name = 'blades';
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), col = new THREE.Color();
    im.setColorAt(0, col.setRGB(1, 1, 1));
    let lx = 1e9, lz = 1e9, lt = -9; const f = new THREE.Vector3();
    nearU.uBladeR.value = R;
    im.userData.update = (h, camera, now, wind) => {
      if (wind) nearU.uWindV.value.set(wind[0], wind[1], Math.min(1.5, Math.hypot(wind[0], wind[1]) / 8));
      camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
      const cx = camera.position.x + f.x * R * 0.3, cz = camera.position.z + f.z * R * 0.3;
      if (now - lt < 0.12 || (Math.hypot(cx - lx, cz - lz) < 1.6 && now - lt < 1.5)) return;
      lx = cx; lz = cz; lt = now;
      const S = BG.Phys.S, i0 = Math.floor((cx - R) / cell), i1 = Math.floor((cx + R) / cell), j0 = Math.floor((cz - R) / cell), j1 = Math.floor((cz + R) / cell);
      let n = 0;
      for (let j = j0; j <= j1 && n < cap; j++) for (let i = i0; i <= i1 && n < cap; i++) {
        const x = (i + hash2(i, j, 1)) * cell, z = (j + hash2(i, j, 2)) * cell, d = Math.hypot(x - cx, z - cz); if (d > R) continue;
        if (hash2(i, j, 3) > 1.15 - d / R * 1.15) continue;
        const sf = h.surf(x, z); let hh;
        if (sf === S.DEEP) hh = 0.34; else if (sf === S.ROUGH) hh = 0.17; else if (sf === S.OB) hh = 0.3; else continue;
        const c = hash2(i, j, 4); hh *= 0.7 + c * 0.75;
        p.set(x, h.h(x, z) - 0.015, z); q.setFromAxisAngle(UP, hash2(i, j, 5) * 6.283); sv.set(1.1 + c * 0.5, hh, 1.1 + c * 0.5);
        M.compose(p, q, sv); im.setMatrixAt(n, M);
        const gt = hash2(i, j, 6), dry = sf === S.DEEP ? 0.55 : 0.2; col.setRGB(0.5 + gt * 0.28 + dry * 0.25, 0.46 + gt * 0.16, 0.2 + gt * 0.06); im.setColorAt(n, col); n++;
      }
      im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    };
    return im;
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
      const geo = gorseGeo(lv.gorseQ), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
      mat.onBeforeCompile = (sh) => { sh.uniforms.uMistP = mistU; sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')); }; mat.customProgramCacheKey = () => 'bggorse';
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
      // needle-clump detail: two octaves of 3D value noise on the tree's local position modulate the albedo, breaking the smooth low-poly look
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uMistP = mistU;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTP = position * vec3(1.0, 1.0, 1.0);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vTP;
          float th31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float tn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(th31(i), th31(i + vec3(1,0,0)), f.x), mix(th31(i + vec3(0,1,0)), th31(i + vec3(1,1,0)), f.x), f.y), mix(mix(th31(i + vec3(0,0,1)), th31(i + vec3(1,0,1)), f.x), mix(th31(i + vec3(0,1,1)), th31(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          { float nn = tn3(vTP * 38.0) * 0.6 + tn3(vTP * 95.0) * 0.4; diffuseColor.rgb *= 0.45 + 1.15 * nn * nn + 0.2; }`);
      };
      mat.customProgramCacheKey = () => 'bgtree2';
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
          sh.uniforms.uTime = timeU; sh.uniforms.uMistP = mistU;
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
