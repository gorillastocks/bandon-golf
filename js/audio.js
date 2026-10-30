/* Audio: procedural wind, surf, club strike, bounces, splash, cup; real recorded crowd reactions (assets/audio/crowd). */
(function (root) {
  const BG = (root.BG = root.BG || {});
  let ctx = null, master = null, analyser = null, crowdCur = null, windG = null, windF = null, surfG = null, waveG = null, waveBuf = null, waveSrc = null, noiseBuf = null, muted = false, ready = false;
  function noise() {
    if (noiseBuf) return noiseBuf;
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
    return (noiseBuf = b);
  }
  function loop(freq, q, type) {
    const s = ctx.createBufferSource(); s.buffer = noise(); s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    return { g, f };
  }
  function init() {
    if (ready) { if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} } return; }
    try {
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; master.connect(analyser);
      const w = loop(500, 0.6); windG = w.g; windF = w.f;
      const s = loop(260, 0.5, 'lowpass'); surfG = s.g;
      ready = true;
      loadCrowd(); loadWaves();
      (function lfo() { if (!ready) return; const t = ctx.currentTime; if (surfG && surfG.base != null) surfG.gain.setTargetAtTime(surfG.base * (0.55 + 0.45 * Math.sin(t * 0.55)), t, 0.4); setTimeout(lfo, 250); })();
    } catch (e) { ready = false; }
  }
  function burst(freq, dur, vol, type, q) {
    if (!ready) return; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noise(); const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone(freq, dur, vol, type, slide) {
    if (!ready) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------- crowd: real recorded applause/cheers (assets/audio/crowd); procedural applause only as a fallback ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  // one hand-clap: a short band-passed noise crack, sometimes a flam (2-3 hits a few ms apart)
  function clapHit(t, vol, bus) {
    const hits = Math.random() < 0.3 ? 2 : 1;
    for (let k = 0; k < hits; k++) {
      const s = ctx.createBufferSource(); s.buffer = noise(); const g = ctx.createGain();
      const tt = t + k * rnd(0.006, 0.016), d = rnd(0.018, 0.045);
      g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(vol, tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, tt + d);
      s.connect(g); g.connect(bus); s.start(tt, Math.random() * 1.8); s.stop(tt + d + 0.02);
    }
  }
  // applause: claps scheduled by a rate envelope (ramp up, hold, fade); `rate` = claps / second at peak
  function applause(out, t0, dur, rate, vol, wash) {
    const buses = [1100, 1800, 2700].map((f, i) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * rnd(0.9, 1.15); b.Q.value = 0.9 + i * 0.4; const g = ctx.createGain(); g.gain.value = [0.8, 1, 0.7][i]; b.connect(g); g.connect(out); return b; });
    const rise = Math.min(0.45, dur * 0.25), fall = dur * 0.45;
    let t = 0;
    while (t < dur) {
      const env = t < rise ? t / rise : t > dur - fall ? Math.max(0, (dur - t) / fall) : 1;
      const r = Math.max(1.5, rate * (0.15 + 0.85 * env) * rnd(0.7, 1.3));
      t += -Math.log(1 - Math.random()) / r;           // Poisson spacing
      if (t >= dur) break;
      clapHit(t0 + t, vol * rnd(0.35, 1) * (0.4 + 0.6 * env), pick(buses));
    }
    if (wash) { // dense applause becomes a hiss
      const s = ctx.createBufferSource(); s.buffer = noise(); s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(wash, t0 + rise); g.gain.setValueAtTime(wash, t0 + dur - fall); g.gain.linearRampToValueAtTime(0, t0 + dur);
      s.connect(f); f.connect(g); g.connect(out); s.start(t0, Math.random()); s.stop(t0 + dur + 0.1);
    }
  }
  const VOWELS = { a: [730, 1090, 2440], o: [570, 840, 2410], u: [350, 640, 2300], e: [530, 1840, 2480], w: [450, 1100, 2350] };
  // crowd voices: noise through vowel formants (the roar) + a few pitched, vibrato "whoo!" voices
  function cheerVoices(out, t0, dur, n, vol, opt) {
    opt = opt || {};
    const bed = ctx.createGain(); bed.gain.setValueAtTime(0, t0); bed.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.5, dur * 0.2));
    bed.gain.setValueAtTime(vol * 0.9, t0 + dur * 0.55); bed.gain.exponentialRampToValueAtTime(0.001, t0 + dur); bed.connect(out);
    // roar bed: 3 formant filters per layer, a couple of layers with different vowels
    for (let layer = 0; layer < 3; layer++) {
      const v = VOWELS[pick(Object.keys(VOWELS))], s = ctx.createBufferSource(); s.buffer = noise(); s.loop = true;
      const lg = ctx.createGain(); lg.gain.value = 0.9 / (layer + 1);
      v.forEach((f, i) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * rnd(0.92, 1.1); b.Q.value = 3 + i * 1.5; const fg = ctx.createGain(); fg.gain.value = [1, 0.8, 0.35][i] * 1.6; s.connect(b); b.connect(fg); fg.connect(lg);
        const lfo = ctx.createOscillator(), lg2 = ctx.createGain(); lfo.frequency.value = rnd(0.5, 2.2); lg2.gain.value = b.frequency.value * 0.06; lfo.connect(lg2); lg2.connect(b.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.1); });
      lg.connect(bed); s.start(t0 + rnd(0, 0.2), Math.random() * 1.5); s.stop(t0 + dur + 0.1);
    }
    // individual voices
    for (let i = 0; i < n; i++) {
      const t = t0 + rnd(0, Math.min(0.7, dur * 0.3)), d = rnd(0.7, 1.0) * dur * rnd(0.5, 0.95);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f0 = opt.high && Math.random() < 0.4 ? rnd(380, 560) : pick([rnd(110, 150), rnd(170, 240), rnd(210, 300)]);
      o.frequency.setValueAtTime(f0 * 0.85, t); o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.05, 1.5), t + Math.min(0.35, d * 0.4)); o.frequency.exponentialRampToValueAtTime(f0 * rnd(0.8, 1.05), t + d);
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = rnd(4.5, 7); vg.gain.value = f0 * 0.025; vib.connect(vg); vg.connect(o.frequency);
      const v = VOWELS[pick(['a', 'a', 'o', 'w', 'e'])], g = ctx.createGain(), vg2 = vol * rnd(0.06, 0.14);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vg2, t + 0.12); g.gain.setValueAtTime(vg2, t + d * 0.5); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      v.forEach((f, k) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * rnd(0.95, 1.08); b.Q.value = 5; const fg = ctx.createGain(); fg.gain.value = [1, 0.6, 0.25][k]; o.connect(b); b.connect(fg); fg.connect(g); });
      g.connect(bed); o.start(t); o.stop(t + d + 0.05); vib.start(t); vib.stop(t + d + 0.05);
    }
    if (opt.whistle) { // a couple of whistles on the big ones
      for (let i = 0; i < opt.whistle; i++) {
        const t = t0 + rnd(0.2, dur * 0.5), d = rnd(0.45, 0.9), o = ctx.createOscillator(), g = ctx.createGain(), f = rnd(2300, 3500);
        o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * rnd(1.1, 1.3), t + d * 0.6); o.frequency.linearRampToValueAtTime(f * 0.95, t + d);
        const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = rnd(8, 14); vg.gain.value = 40; vib.connect(vg); vg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0005, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); vib.start(t); vib.stop(t + d + 0.05);
      }
    }
  }
  const TIER = { aww: 0.5, polite: 1, cheer: 2, roar: 3, mega: 4 }; // 'aww' (disappointed groan) ranks below everything: any cheer wins, and it never cuts one off
  // ---- real crowd recordings (CC0, see assets/audio/crowd/CREDITS.md): preloaded + decoded, random variant per tier ----
  const CROWD_FILES = { aww: 4, polite: 4, cheer: 3, roar: 3, mega: 3 };
  const crowdBufs = { aww: [], polite: [], cheer: [], roar: [], mega: [] }, crowdLast = {};
  let crowdLoad = null, crowdFailed = 0, crowdTotal = 0;
  function loadCrowd() {
    if (crowdLoad || !ready) return crowdLoad;
    const jobs = [];
    Object.keys(CROWD_FILES).forEach(tier => {
      for (let i = 1; i <= CROWD_FILES[tier]; i++) {
        crowdTotal++;
        jobs.push(root.fetch('assets/audio/crowd/' + tier + i + '.mp3')
          .then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then(ab => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); }))
          .then(b => { crowdBufs[tier].push(b); })
          .catch(() => { crowdFailed++; }));
      }
    });
    return (crowdLoad = Promise.all(jobs));
  }
  // ---- ocean: a real recording of waves rolling in and out (CC0, assets/audio/ambient/CREDITS.md), looped; swells and near-silent gaps come from the recording
  let waveLoad = null, waveFailed = false;
  function loadWaves() {
    if (waveLoad || !ready) return;
    waveLoad = root.fetch('assets/audio/ambient/waves.mp3').then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); }))
      .then(b => { waveBuf = b; }).catch(() => { waveFailed = true; });
  }
  function ensureWaves() {
    if (waveSrc || !waveBuf || !ready) return;
    waveG = ctx.createGain(); waveG.gain.value = 0; waveG.connect(master);
    waveSrc = ctx.createBufferSource(); waveSrc.buffer = waveBuf; waveSrc.loop = true; waveSrc.connect(waveG); waveSrc.start(0, Math.random() * waveBuf.duration);
  }
  function pickBuf(tier) {
    const list = crowdBufs[tier]; if (!list.length) return null;
    let i = (Math.random() * list.length) | 0;
    if (list.length > 1 && i === crowdLast[tier]) i = (i + 1 + ((Math.random() * (list.length - 1)) | 0)) % list.length; // never the same clip twice running
    crowdLast[tier] = i; return list[i];
  }
  // crowd(tier): 'aww' disappointed groan (sample only), 'polite' golf claps, 'cheer' birdie / hard shot, 'roar' bigger (eagle / hard + birdie), 'mega' (ace / albatross)
  // returns true if audio was started (false if not ready, muted, or a louder crowd is already playing)
  function crowd(tier) {
    const rank = TIER[tier] || 1;
    if (!TIER[tier]) tier = 'polite';
    stats.last = tier; stats.count++;
    if (!ready || muted) return false;
    const t = ctx.currentTime;
    if (!crowdLoad) loadCrowd();
    const buf = pickBuf(tier);
    if (crowdCur && crowdCur.until > t) {
      if (rank <= crowdCur.rank) return false;
      crowdCur.g.gain.cancelScheduledValues(t); crowdCur.g.gain.setValueAtTime(crowdCur.g.gain.value, t); crowdCur.g.gain.linearRampToValueAtTime(0, t + 0.35); // swell into the bigger one
      if (crowdCur.src) { try { crowdCur.src.stop(t + 0.4); } catch (e) {} }
    }
    if (buf) {
      const src = ctx.createBufferSource(); src.buffer = buf;
      const cg = ctx.createGain(); cg.gain.value = 1;
      src.connect(cg); cg.connect(master);
      const t0 = t + 0.02; src.start(t0);
      stats.source = 'sample';
      crowdCur = { until: t0 + buf.duration + 0.2, rank, g: cg, src };
      src.onended = () => { try { src.disconnect(); cg.disconnect(); } catch (e) {} };
      return true;
    }
    if (tier === 'aww') return false; // no synthesized fallback for the groan: silent if the samples did not load
    stats.source = 'synth';
    return crowdSynth(tier, rank, t);
  }
  // fallback only: the old procedural crowd, used if the samples failed to load (or haven't finished loading yet)
  function crowdSynth(tier, rank, t) {
    const cg = ctx.createGain(); cg.gain.value = { polite: 3.2, cheer: 1.3, roar: 1.2, mega: 1.2 }[tier] || 1;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; cg.connect(comp); comp.connect(master);
    const t0 = t + 0.04; let dur;
    if (tier === 'polite') {
      dur = rnd(4.5, 5.5); applause(cg, t0, dur, rnd(28, 40), 1.0, 0.03);
      cheerVoices(cg, t0 + 0.1, dur * 0.7, 0, 0.3);
    } else if (tier === 'cheer') {
      dur = rnd(3.6, 4.6); applause(cg, t0 + 0.25, dur - 0.25, rnd(45, 70), 0.55, 0.05); cheerVoices(cg, t0, dur, 9, 0.55, { high: true });
    } else if (tier === 'roar') {
      dur = rnd(5.0, 6.0); applause(cg, t0 + 0.2, dur - 0.2, rnd(80, 110), 0.6, 0.08); cheerVoices(cg, t0, dur, 16, 0.75, { high: true, whistle: 2 });
    } else {
      dur = rnd(7.0, 8.5); applause(cg, t0 + 0.2, dur - 0.2, rnd(110, 150), 0.65, 0.11); cheerVoices(cg, t0, dur, 24, 0.9, { high: true, whistle: 4 });
      cheerVoices(cg, t0 + 1.8, dur - 1.8, 12, 0.6, { high: true, whistle: 2 });
    }
    crowdCur = { until: t + dur + 0.2, rank, g: cg };
    setTimeout(() => { try { cg.disconnect(); comp.disconnect(); } catch (e) {} }, (dur + 1) * 1000);
    return true;
  }
  const stats = { last: null, count: 0, source: null };

  // ---------- hole commentary: pre-rendered MP3 clips (ElevenLabs), decoded + played through the same master gain (so mute applies) ----------
  const Com = (function () {
    let manifest = null, mp = null, src = null, gain = null, token = 0, cur = null, onChange = null;
    const bufs = {}, pend = {};
    let enabled = true; try { enabled = root.localStorage.getItem('bg.commentary') !== '0'; } catch (e) {}
    function loadManifest() {
      if (manifest) return Promise.resolve(manifest);
      if (mp) return mp;
      return (mp = root.fetch('audio/commentary/manifest.json').then(r => r.ok ? r.json() : { clips: {} }).catch(() => ({ clips: {} })).then(m => (manifest = m.clips ? m : { clips: {} })));
    }
    const keyOf = (course, no) => course + '_' + (no < 10 ? '0' : '') + no;
    function buffer(key) {
      if (bufs[key]) return Promise.resolve(bufs[key]);
      if (pend[key]) return pend[key];
      return (pend[key] = loadManifest().then(m => {
        const c = m.clips[key]; if (!c) return null;
        return root.fetch(c.file).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(ab => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); })).then(b => (bufs[key] = b));
      }).catch(() => null).then(b => { delete pend[key]; return b; }));
    }
    function notify() { if (onChange) { try { onChange(!!cur, cur); } catch (e) {} } }
    function stop() {
      token++;
      if (src) { try { src.onended = null; src.stop(); } catch (e) {} try { src.disconnect(); } catch (e) {} src = null; }
      if (gain) { try { gain.disconnect(); } catch (e) {} gain = null; }
      if (cur) { cur = null; notify(); }
    }
    // play(courseId, holeNo): resolves true if a clip started. Missing clip / disabled / muted / no audio => false, silently.
    function play(course, no) {
      stop();
      if (!enabled || muted) return Promise.resolve(false);
      init(); if (!ready) return Promise.resolve(false);
      const my = token, key = keyOf(course, no);
      return buffer(key).then(b => {
        if (!b || my !== token || !enabled || muted) return false;
        try { if (ctx.state !== 'running') ctx.resume(); } catch (e) {}
        const g = ctx.createGain(); g.gain.value = 1.35;
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; g.connect(comp); comp.connect(master);
        const s = ctx.createBufferSource(); s.buffer = b; s.connect(g);
        s.onended = () => { if (src === s) { src = null; try { g.disconnect(); comp.disconnect(); } catch (e) {} gain = null; cur = null; notify(); } };
        src = s; gain = g; cur = { key, dur: b.duration, t0: ctx.currentTime, text: manifest.clips[key].text };
        s.start(ctx.currentTime + 0.05); notify(); return true;
      });
    }
    function prefetch(course, no) { init(); if (ready && enabled) buffer(keyOf(course, no)); }
    return {
      play, stop, prefetch,
      playing: () => !!cur, current: () => cur, has: (course, no) => loadManifest().then(m => !!m.clips[keyOf(course, no)]),
      isEnabled: () => enabled,
      setEnabled(v) { enabled = !!v; try { root.localStorage.setItem('bg.commentary', enabled ? '1' : '0'); } catch (e) {} if (!enabled) stop(); return enabled; },
      toggle() { return this.setEnabled(!enabled); },
      onChange(f) { onChange = f; },
      stats: () => ({ cached: Object.keys(bufs).length }),
    };
  })();

  // ---------- spectator voices: tiny formant synthesiser ("Fore!", "Look out!", gasps, "Ouch!") — no samples ----------
  // A sawtooth glottal source is shaped by three band-pass formant filters whose centre frequencies glide between
  // vowels; consonants are short filtered-noise bursts. Pitch / vowel / timing are randomised so no two shouts match.
  const FM = { ao: [600, 900, 2500], o: [450, 780, 2400], u: [330, 950, 2300], aw: [730, 1100, 2450], ah: [800, 1200, 2800], ow: [650, 1000, 2400], r: [420, 1300, 1700], l: [360, 1100, 2800] };
  function syl(out, t0, o) { // o: {d, f0:[a,b,(c)], Fa, Fb, amp, breath}
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const f0 = o.f0, d = o.d;
    osc.frequency.setValueAtTime(f0[0], t0); osc.frequency.linearRampToValueAtTime(f0[1], t0 + d * 0.5); osc.frequency.linearRampToValueAtTime(f0[2] != null ? f0[2] : f0[1], t0 + d);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = rnd(5, 7); vg.gain.value = f0[0] * 0.012; vib.connect(vg); vg.connect(osc.frequency);
    const env = ctx.createGain(), a = o.amp || 0.3;
    env.gain.setValueAtTime(0.0001, t0); env.gain.linearRampToValueAtTime(a, t0 + Math.min(0.05, d * 0.25)); env.gain.setValueAtTime(a * 0.9, t0 + d * 0.65); env.gain.exponentialRampToValueAtTime(0.0005, t0 + d);
    env.connect(out);
    const Fa = o.Fa, Fb = o.Fb || o.Fa, qs = [7, 9, 11], gs = [1, 0.55, 0.28];
    let nsrc = null;
    if (o.breath) { nsrc = ctx.createBufferSource(); nsrc.buffer = noise(); nsrc.loop = true; }
    for (let k = 0; k < 3; k++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = qs[k];
      bp.frequency.setValueAtTime(Fa[k], t0); bp.frequency.linearRampToValueAtTime(Fb[k], t0 + d);
      const fg = ctx.createGain(); fg.gain.value = gs[k]; osc.connect(bp); if (nsrc) { const ng = ctx.createGain(); ng.gain.value = o.breath; nsrc.connect(ng); ng.connect(bp); } bp.connect(fg); fg.connect(env);
    }
    osc.start(t0); osc.stop(t0 + d + 0.05); vib.start(t0); vib.stop(t0 + d + 0.05); if (nsrc) { nsrc.start(t0, Math.random()); nsrc.stop(t0 + d + 0.05); }
  }
  function cons(out, t0, freq, d, vol, type, q) {
    const s = ctx.createBufferSource(); s.buffer = noise(); const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + d); s.connect(f); f.connect(g); g.connect(out); s.start(t0, Math.random()); s.stop(t0 + d + 0.03);
  }
  // kind: 'fore' | 'lookout' | 'gasp' | 'ouch' | 'whoa'; opt: {pan -1..1, gain 0..1, female, delay}
  function shout(kind, opt) {
    return; // synthesized spectator voices disabled: they sounded artificial
    if (!ready || muted) return false; opt = opt || {};
    const t = ctx.currentTime + (opt.delay || 0) + 0.02, g = ctx.createGain(); g.gain.value = (opt.gain != null ? opt.gain : 1) * 1.2;
    let node = g;
    if (ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, opt.pan || 0)); g.connect(pn); node = pn; }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; node.connect(comp); comp.connect(master);
    const P = (opt.female ? rnd(1.55, 1.85) : rnd(0.85, 1.15)) * (opt.pitch || 1);
    let dur = 1;
    if (kind === 'fore') { // "Fff-OR!" — often shouted twice
      const reps = Math.random() < 0.55 ? 2 : 1;
      for (let i = 0; i < reps; i++) {
        const t0 = t + i * 0.78;
        cons(g, t0, 3600, 0.1, 0.5, 'highpass', 0.7);
        syl(g, t0 + 0.07, { d: 0.62, f0: [185 * P, 200 * P, 150 * P], Fa: FM.ao, Fb: FM.o, amp: 0.55, breath: 0.2 });
        syl(g, t0 + 0.55, { d: 0.14, f0: [150 * P, 140 * P], Fa: FM.o, Fb: FM.r, amp: 0.25 });
      }
      dur = reps * 0.8 + 0.5;
    } else if (kind === 'lookout') { // "Look OUT!"
      syl(g, t, { d: 0.12, f0: [165 * P, 175 * P], Fa: FM.l, Fb: FM.u, amp: 0.3 });
      syl(g, t + 0.1, { d: 0.17, f0: [175 * P, 180 * P], Fa: FM.u, Fb: FM.u, amp: 0.4 });
      cons(g, t + 0.27, 1600, 0.04, 0.3, 'bandpass', 1.5);
      syl(g, t + 0.34, { d: 0.55, f0: [205 * P, 235 * P, 175 * P], Fa: FM.aw, Fb: FM.u, amp: 0.55, breath: 0.12 });
      cons(g, t + 0.86, 4200, 0.06, 0.18, 'highpass', 0.7);
      dur = 1.2;
    } else if (kind === 'ouch') { // "Ow!"
      syl(g, t, { d: 0.4, f0: [260 * P, 300 * P, 190 * P], Fa: FM.aw, Fb: FM.u, amp: 0.55, breath: 0.1 }); dur = 0.6;
    } else if (kind === 'whoa') { // "Whoa…"
      syl(g, t, { d: 0.12, f0: [170 * P, 180 * P], Fa: FM.u, Fb: FM.o, amp: 0.25 });
      syl(g, t + 0.1, { d: 0.6, f0: [180 * P, 230 * P, 170 * P], Fa: FM.o, Fb: FM.ah, amp: 0.4, breath: 0.15 }); dur = 0.9;
    } else { // gasp: a sharp breath in
      const s = ctx.createBufferSource(); s.buffer = noise(); s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(700 * P, t); bp.frequency.exponentialRampToValueAtTime(2300 * P, t + 0.3);
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.9, t + 0.26); e.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      s.connect(bp); bp.connect(e); e.connect(g); s.start(t, Math.random()); s.stop(t + 0.45);
      syl(g, t + 0.05, { d: 0.3, f0: [240 * P, 330 * P], Fa: FM.ah, Fb: FM.ah, amp: 0.1, breath: 0.5 }); dur = 0.5;
    }
    setTimeout(() => { try { g.disconnect(); comp.disconnect(); } catch (e) {} }, (dur + (opt.delay || 0) + 1) * 1000);
    return true;
  }
  function thud(vol) { if (!ready || muted) return; burst(240, 0.14, vol || 0.5, 'lowpass', 1); tone(95, 0.12, (vol || 0.5) * 0.7, 'sine', 55); }
  // first-gesture unlock for mobile Safari: resume inside touchend/click and play a silent buffer
  function unlock() {
    init();
    if (!ctx) return;
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) {}
    if (ctx.state === 'running') BG.Audio.unlocked = true;
  }
  ['touchend', 'click', 'pointerup', 'keydown'].forEach(ev => root.addEventListener && root.addEventListener(ev, unlock, { passive: true }));
  if (root.document) root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden && ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} } });
  BG.Audio = {
    init, unlock, crowd, stats, crowdSamples: () => ({ loaded: Object.keys(crowdBufs).reduce((o, k) => (o[k] = crowdBufs[k].length, o), {}), failed: crowdFailed, total: crowdTotal }), crowdReady: () => crowdLoad, wavesState: () => ({ loaded: !!waveBuf, playing: !!waveSrc, failed: waveFailed, gain: waveG ? waveG.gain.value : null }), commentary: Com, shout, thud,
    level() { if (!analyser) return 0; const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d); let m = 0; for (let i = 0; i < d.length; i++) m += d[i] * d[i]; return Math.sqrt(m / d.length); },
    state: () => (ctx ? ctx.state : 'none'),
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; if (muted) Com.stop(); return muted; },
    isMuted: () => muted,
    ambient(windMph, ocean) {
      if (!ready) return; const t = ctx.currentTime;
      windG.gain.setTargetAtTime(Math.min(0.5, 0.02 + windMph * 0.014), t, 0.3);
      windF.frequency.setTargetAtTime(280 + windMph * 25, t, 0.5);
      ensureWaves();
      if (waveSrc) { waveG.gain.setTargetAtTime(ocean ? 0.45 : 0, t, ocean ? 1.5 : 0.8); surfG.base = ocean ? 0 : 0.03; } // real waves replace the constant surf hiss
      else surfG.base = waveFailed ? (ocean ? 0.22 : 0.03) : (ocean ? 0 : 0.03); // synthesized hiss only if the recording failed to load

    },
    hit(power, putt) { if (putt) { burst(2200, 0.05, 0.25, 'highpass'); tone(180, 0.06, 0.2, 'sine', 90); return; } burst(1800, 0.09, 0.6 * (0.4 + power), 'highpass'); tone(150, 0.12, 0.5 * (0.4 + power), 'sine', 60); },
    bounce(v, surf) { if (v < 1.5) return; burst(surf === 6 ? 500 : 260, 0.07, Math.min(0.25, 0.03 + v * 0.012), 'lowpass'); }, // soft natural turf thump, no beeps
    splash() { burst(900, 0.5, 0.6, 'bandpass', 0.5); },
    tree() { burst(700, 0.2, 0.5, 'bandpass', 2); tone(90, 0.15, 0.3, 'triangle', 50); },
    cup() { tone(880, 0.12, 0.25, 'sine'); setTimeout(() => tone(660, 0.18, 0.25, 'sine'), 90); burst(1500, 0.06, 0.3, 'highpass'); },
    cheer() { crowd('cheer'); },
    ui() { tone(520, 0.05, 0.12, 'triangle'); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
