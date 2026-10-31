/* Optional "Green slope arrows" overlay (web + iOS).  Setting stored in localStorage 'bg.slope' ('1' / '0'), default OFF
   (Pause menu / Main menu toggle).  When ON and the ball is on the green and you are lining up a putt, a grid of small
   arrows lies on the putting surface pointing DOWNHILL; length and colour grow with steepness (white = gentle, yellow,
   orange, red = steep).  The slope comes straight from the terrain normal the ball physics uses (hole.n), so the arrows match
   the real break.  One instanced draw call (<= CAP arrows), animated in the vertex shader (gentle downhill flow), faded
   near the ball and the cup and dimmed along the ball -> cup line so they never hide the aim line. */
(function (root) {
  const BG = root.BG, THREE = root.THREE, S = BG.Phys.S;
  const KEY = 'bg.slope', CAP = 900, STEP = 1.5, RANGE = 30;
  let enabled = false; try { enabled = localStorage.getItem(KEY) === '1'; } catch (e) {}

  const VERT = `
    attribute vec3 aOff; attribute vec2 aDir; attribute float aSlope; attribute float aPhase;
    uniform float uTime; uniform vec3 uBall; uniform vec3 uPin; uniform float uFade;
    varying vec4 vCol;
    vec3 ramp(float s) {
      vec3 w = vec3(1.0), y = vec3(1.0, 0.86, 0.25), o = vec3(1.0, 0.52, 0.14), r = vec3(1.0, 0.2, 0.15);
      vec3 c = mix(w, y, smoothstep(1.0, 2.2, s));
      c = mix(c, o, smoothstep(2.2, 3.4, s));
      return mix(c, r, smoothstep(3.4, 5.0, s));
    }
    void main() {
      float len = mix(0.5, 1.25, clamp((aSlope - 0.3) / 4.0, 0.0, 1.0));
      len *= clamp(distance(cameraPosition, aOff) / 12.0, 1.0, 3.0);   // keep them readable from the high overview camera
      float ph = fract(uTime * 0.33 + aPhase);
      vec2 c = aOff.xz + aDir * (ph - 0.5) * 0.6;
      vec2 loc = position.xz * len;
      vec2 w = vec2(loc.x * aDir.x - loc.y * aDir.y, loc.x * aDir.y + loc.y * aDir.x);
      vec3 p = vec3(c.x + w.x, aOff.y + 0.05, c.y + w.y);
      float fb = smoothstep(0.5, 2.2, distance(c, uBall.xz));
      float fp = smoothstep(0.5, 1.6, distance(c, uPin.xz));
      vec2 ab = uPin.xz - uBall.xz; float t = clamp(dot(c - uBall.xz, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
      float fl = mix(0.3, 1.0, smoothstep(0.25, 1.0, distance(c, uBall.xz + ab * t)));
      float a = (0.55 + 0.4 * clamp(aSlope / 3.0, 0.0, 1.0)) * sin(3.14159 * ph) * fb * fp * fl * uFade * step(0.25, aSlope);
      vCol = vec4(ramp(aSlope), a);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`;
  const FRAG = 'varying vec4 vCol; void main() { if (vCol.a < 0.01) discard; gl_FragColor = vCol; }';

  function arrowGeometry() {
    // flat arrow in the XZ plane pointing +X, unit length (-0.5 .. 0.5)
    const v = [
      -0.5, 0, -0.06, 0.12, 0, -0.06, 0.12, 0, 0.06,   -0.5, 0, -0.06, 0.12, 0, 0.06, -0.5, 0, 0.06,
      0.05, 0, -0.2, 0.5, 0, 0, 0.05, 0, 0.2];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return g;
  }

  let mesh = null, g = null, count = 0, vis = false;
  const A = { off: new Float32Array(CAP * 3), dir: new Float32Array(CAP * 2), slope: new Float32Array(CAP), phase: new Float32Array(CAP) };
  const nrm = [0, 1, 0];

  function ensure(scene) {
    if (mesh) return;
    g = arrowGeometry();
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(A.off, 3));
    g.setAttribute('aDir', new THREE.InstancedBufferAttribute(A.dir, 2));
    g.setAttribute('aSlope', new THREE.InstancedBufferAttribute(A.slope, 1));
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(A.phase, 1));
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uBall: { value: new THREE.Vector3() }, uPin: { value: new THREE.Vector3() }, uFade: { value: 1 } },
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false; scene.add(mesh);
  }
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

  const Slope = BG.Slope = {
    isEnabled: () => enabled,
    setEnabled(v) { enabled = !!v; try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {} if (!enabled && mesh) mesh.visible = false; return enabled; },
    // slope (percent grade) of the terrain at x,z, from the same normals the ball rolls on
    at(h, x, z) { h.n(x, z, nrm); return Math.hypot(nrm[0], nrm[2]) / Math.max(0.2, nrm[1]) * 100; },
    count: () => count,
    // sample the green around the pin once per hole (and when graphics change)
    build(h, scene) {
      ensure(scene);
      let n = 0; const px = h.pin.x, pz = h.pin.z;
      const x0 = Math.round(px / STEP) * STEP, z0 = Math.round(pz / STEP) * STEP, m = Math.ceil(RANGE / STEP);
      for (let i = -m; i <= m && n < CAP; i++) for (let j = -m; j <= m && n < CAP; j++) {
        const x = x0 + i * STEP, z = z0 + j * STEP;
        if (h.surf(x, z) !== S.GREEN) continue;
        // stay clear of the fringe: all four neighbours (0.9 m) must also be green
        if (h.surf(x + 0.9, z) !== S.GREEN || h.surf(x - 0.9, z) !== S.GREEN || h.surf(x, z + 0.9) !== S.GREEN || h.surf(x, z - 0.9) !== S.GREEN) continue;
        h.n(x, z, nrm);
        const hz = Math.hypot(nrm[0], nrm[2]); if (hz < 1e-6) continue;
        A.off[n * 3] = x; A.off[n * 3 + 1] = h.h(x, z); A.off[n * 3 + 2] = z;
        A.dir[n * 2] = nrm[0] / hz; A.dir[n * 2 + 1] = nrm[2] / hz;   // horizontal part of the normal points downhill
        A.slope[n] = hz / Math.max(0.2, nrm[1]) * 100; A.phase[n] = hash(i, j); n++;
      }
      count = n; g.instanceCount = n;
      ['aOff', 'aDir', 'aSlope', 'aPhase'].forEach((k) => { g.attributes[k].needsUpdate = true; });
      return n;
    },
    // per frame: show only while putting
    update(t, ball, pin, show) {
      if (!mesh) return;
      vis = !!(enabled && show && count > 0); mesh.visible = vis; if (!vis) return;
      const u = mesh.material.uniforms; u.uTime.value = t; u.uBall.value.set(ball.x, ball.y, ball.z); u.uPin.value.set(pin.x, pin.y, pin.z);
    },
    visible: () => vis,
  };
})(window);
