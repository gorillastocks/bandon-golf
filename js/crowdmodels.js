// Realistic spectators: CC0 rigged human characters (Quaternius "Ultimate Modular Men/Women", see assets/crowd/CREDITS.md),
// baked offline by tools/crowd/bake.py into 3 mesh LODs + per-frame skinning matrices, drawn with GPU-skinned instancing
// (one InstancedMesh per character x LOD, a shared MeshStandardMaterial patched with onBeforeCompile).
// BG.CrowdModels.load() -> Promise<boolean>; BG.CrowdModels.make(N, opts) -> renderer with .write(...) / .group
(function (root) {
  'use strict';
  const BG = root.BG = root.BG || {};
  const THREE = root.THREE;
  const BASE = 'assets/crowd/';
  let META = null, BONES = null, state = 'idle', promise = null, GEOS = null;

  // hair colour palette (linear), picked per instance by iC3.w
  const HAIR = [[0.012, 0.007, 0.004], [0.05, 0.022, 0.008], [0.2, 0.11, 0.035], [0.45, 0.33, 0.14], [0.3, 0.3, 0.32], [0.14, 0.04, 0.02]];

  function half2float(h) {
    const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  async function fetchBuf(url) {
    const r = await fetch(url); if (!r.ok) throw new Error('crowd assets ' + r.status);
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    const ds = r.body.pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).arrayBuffer();
  }

  function buildGeos(buf) {
    GEOS = META.chars.map((ch) => {
      const lods = ch.lods.map((L) => {
        const nv = L.nv, o = L.off, g = new THREE.BufferGeometry();
        const q = new Int16Array(buf, o.pos, nv * 4), pos = new Float32Array(nv * 3);
        for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = L.min[k] + (q[i * 4 + k] + 32768) / 65535 * L.ext[k];
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const n4 = new Int8Array(buf, o.nrm, nv * 4), nrm = new Int8Array(nv * 3);
        for (let i = 0; i < nv; i++) { nrm[i * 3] = n4[i * 4]; nrm[i * 3 + 1] = n4[i * 4 + 1]; nrm[i * 3 + 2] = n4[i * 4 + 2]; }
        g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
        const c4 = new Uint8Array(buf, o.col, nv * 4), col = new Uint8Array(nv * 3), role = new Uint8Array(nv);
        for (let i = 0; i < nv; i++) { col[i * 3] = c4[i * 4]; col[i * 3 + 1] = c4[i * 4 + 1]; col[i * 3 + 2] = c4[i * 4 + 2]; role[i] = c4[i * 4 + 3] >> 4; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
        g.setAttribute('aRole', new THREE.BufferAttribute(role, 1));
        g.setAttribute('aJ', new THREE.BufferAttribute(new Uint8Array(buf, o.ji, nv * 4).slice(), 4));
        g.setAttribute('aW', new THREE.BufferAttribute(new Uint8Array(buf, o.wt, nv * 4).slice(), 4, true));
        g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, o.idx, L.ni).slice(), 1));
        return g;
      });
      return { lods, mat: ch.mat };
    });
    // bone matrices: one texture, rows = char * frames + frame, 3 texels per bone
    const NB = META.bones, W = NB * 3, nch = META.chars.length, F = META.chars[0].mat.frames, rows = nch * F;
    const data = new Uint16Array(rows * W * 4);
    META.chars.forEach((ch, ci) => data.set(new Uint16Array(buf, ch.mat.off, F * W * 4), ci * F * W * 4));
    const tex = new THREE.DataTexture(data, W, rows, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    BONES = tex; META.F = F;
  }

  function load() {
    if (promise) return promise;
    state = 'loading';
    promise = (async () => {
      try {
        META = await (await fetch(BASE + 'crowd.json')).json();
        const buf = await fetchBuf(BASE + 'crowd.bin.gz');
        buildGeos(buf); state = 'ready'; return true;
      } catch (e) { state = 'failed'; console.warn('crowd models unavailable, using the simple figures:', e && e.message); return false; }
    })();
    return promise;
  }

  // ---- material ----
  const HEAD = `
    attribute float aRole; attribute vec4 aJ; attribute vec4 aW;
    attribute vec4 iAnim; attribute vec4 iC0; attribute vec4 iC1; attribute vec4 iC2; attribute vec4 iC3;
    uniform highp sampler2D uBones; uniform vec3 uHair[6];
    varying vec3 vCol;
    vec4 bgR0, bgR1, bgR2;
    void bgAcc(int row, float w, int b) { bgR0 += w * texelFetch(uBones, ivec2(b, row), 0); bgR1 += w * texelFetch(uBones, ivec2(b + 1, row), 0); bgR2 += w * texelFetch(uBones, ivec2(b + 2, row), 0); }
    void bgSkin() {
      bgR0 = vec4(0.0); bgR1 = vec4(0.0); bgR2 = vec4(0.0);
      int ra = int(iAnim.x + 0.5), rb = int(iAnim.y + 0.5); float mx = iAnim.z;
      for (int c = 0; c < 4; c++) {
        float w = aW[c]; if (w <= 0.0) continue; int b = int(aJ[c] + 0.5) * 3;
        bgAcc(ra, w * (1.0 - mx), b); if (mx > 0.0) bgAcc(rb, w * mx, b);
      }
    }`;
  function patch(sh, depthOnly) {
    sh.uniforms.uBones = { value: BONES };
    sh.uniforms.uHair = { value: HAIR.map((c) => new THREE.Vector3(c[0], c[1], c[2])) };
    sh.vertexShader = sh.vertexShader.replace('void main() {', HEAD + '\nvoid main() {');
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `
      bgSkin();
      vec3 objectNormal = vec3(dot(bgR0.xyz, normal), dot(bgR1.xyz, normal), dot(bgR2.xyz, normal));
      #ifdef USE_TANGENT
      vec3 objectTangent = vec3(tangent.xyz);
      #endif`);
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', (depthOnly ? 'bgSkin();' : '') + `
      vec4 bgP = vec4(position, 1.0);
      vec3 transformed = vec3(dot(bgR0, bgP), dot(bgR1, bgP), dot(bgR2, bgP));
      float bgStyle = iC0.w;
      // cap (1): dome(5) + brim(7); visor (2): band(6) + brim(7)
      if ((aRole > 4.5 && aRole < 5.5 && bgStyle != 1.0) || (aRole > 5.5 && aRole < 6.5 && bgStyle != 2.0) || (aRole > 6.5 && bgStyle < 0.5)) transformed = vec3(0.0);`);
    if (!depthOnly) {
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `
        #if defined( USE_COLOR_ALPHA )
        vColor = vec4( 1.0 );
        #elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
        vColor = vec3( 1.0 );
        #endif
        vec3 bgBase = pow(color.rgb, vec3(2.2)); float bgG = color.r * 1.7;
        vec3 bgC = bgBase;
        if (aRole > 0.5 && aRole < 1.5) bgC = iC2.rgb * bgG;
        else if (aRole < 2.5) bgC = iC0.rgb * bgG;
        else if (aRole < 3.5) bgC = iC1.rgb * bgG;
        else if (aRole < 4.5) bgC = uHair[int(iC3.w + 0.5)] * (bgG * 1.0);
        else if (aRole < 7.5) bgC = iC3.rgb * (0.85 + 0.15 * bgG);
        vCol = bgC;`);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vCol;\nvoid main() {');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vCol;');
    }
  }
  let MAT = null, DEPTH = null;
  function material() {
    if (MAT) return MAT;
    MAT = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: true });
    MAT.onBeforeCompile = (sh) => { THREE.Material.prototype.onBeforeCompile.call(MAT, sh); patch(sh, false); };
    MAT.customProgramCacheKey = () => 'bgcrowdskin1';
    DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    DEPTH.onBeforeCompile = (sh) => patch(sh, true);
    DEPTH.customProgramCacheKey = () => 'bgcrowdskin1d';
    return MAT;
  }

  // ---- instanced renderer ----
  // cap[l]: max instances per (char, lod) mesh
  function make(cap, shadow) {
    const mat = material(), group = new THREE.Group(); group.name = 'crowdSkin';
    const nch = META.chars.length, meshes = [];
    for (let ci = 0; ci < nch; ci++) {
      meshes.push([]);
      for (let l = 0; l < 3; l++) {
        const base = GEOS[ci].lods[l], n = Math.max(1, cap[l]), g = new THREE.InstancedBufferGeometry();
        g.index = base.index; for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
        const ia = (sz) => new THREE.InstancedBufferAttribute(new Float32Array(n * sz), sz).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('iAnim', ia(4)); g.setAttribute('iC0', ia(4)); g.setAttribute('iC1', ia(4)); g.setAttribute('iC2', ia(4)); g.setAttribute('iC3', ia(4));
        const m = new THREE.InstancedMesh(g, mat, n); m.count = 0; m.frustumCulled = false; m.userData.skin = true;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (shadow && l < 2) { m.castShadow = true; m.customDepthMaterial = DEPTH; }
        m.receiveShadow = !!shadow;
        group.add(m); meshes[ci][l] = m;
      }
    }
    const fill = new Int32Array(nch * 3);
    return {
      group, meshes, META,
      begin() { fill.fill(0); },
      // add one instance: ci char, l lod, e = Float32Array(16) matrix, a = [rowA,rowB,mix], c0..c3 = vec4 arrays
      add(ci, l, mtx, ra, rb, mx, c0, c1, c2, c3) {
        const m = meshes[ci][l], i = fill[ci * 3 + l]; if (i >= m.instanceMatrix.count) return false; fill[ci * 3 + l]++;
        m.instanceMatrix.array.set(mtx, i * 16);
        const g = m.geometry.attributes, s = (a, v0, v1, v2, v3) => { const o = i * 4, r = a.array; r[o] = v0; r[o + 1] = v1; r[o + 2] = v2; r[o + 3] = v3; };
        s(g.iAnim, ra, rb, mx, 0); s(g.iC0, c0[0], c0[1], c0[2], c0[3]); s(g.iC1, c1[0], c1[1], c1[2], 0); s(g.iC2, c2[0], c2[1], c2[2], 0); s(g.iC3, c3[0], c3[1], c3[2], c3[3]);
        return true;
      },
      end() {
        for (let ci = 0; ci < nch; ci++) for (let l = 0; l < 3; l++) {
          const m = meshes[ci][l], n = fill[ci * 3 + l]; m.count = n; if (!n) continue;
          m.instanceMatrix.needsUpdate = true; const g = m.geometry.attributes;
          g.iAnim.needsUpdate = g.iC0.needsUpdate = g.iC1.needsUpdate = g.iC2.needsUpdate = g.iC3.needsUpdate = true;
        }
      },
      dispose() { group.traverse((o) => { if (o.isInstancedMesh) { o.dispose(); o.geometry.dispose(); } }); },
    };
  }

  BG.CrowdModels = { load, make, meta: () => META, state: () => state, ready: () => state === 'ready' };
})(typeof window !== 'undefined' ? window : globalThis);
