/* Tiny procedural audio: wind, surf, club strike, bounces, splash, cup. No assets. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  let ctx = null, master = null, analyser = null, crowdCur = null, windG = null, windF = null, surfG = null, noiseBuf = null, muted = false, ready = false;
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

  // ---------- crowd: procedural applause + cheers (no samples, so nothing repeats) ----------
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
  const TIER = { polite: 1, cheer: 2, roar: 3, mega: 4 };
  // crowd(tier): 'polite' golf claps, 'cheer' huge cheer, 'roar' bigger (eagle / hard + birdie), 'mega' (ace / albatross)
  // returns true if audio was started (false if not ready, muted, or a louder crowd is already playing)
  function crowd(tier) {
    const rank = TIER[tier] || 1;
    stats.last = tier; stats.count++;
    if (!ready || muted) return false;
    const t = ctx.currentTime;
    if (crowdCur && crowdCur.until > t) {
      if (rank <= crowdCur.rank) return false;
      crowdCur.g.gain.cancelScheduledValues(t); crowdCur.g.gain.setValueAtTime(crowdCur.g.gain.value, t); crowdCur.g.gain.linearRampToValueAtTime(0, t + 0.35); // swell into the bigger one
    }
    const cg = ctx.createGain(); cg.gain.value = { polite: 1.8, cheer: 1.3, roar: 1.2, mega: 1.2 }[tier] || 1;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; cg.connect(comp); comp.connect(master);
    const t0 = t + 0.04; let dur;
    if (tier === 'polite') {
      dur = rnd(2.0, 3.0); applause(cg, t0, dur, rnd(9, 16), 0.5, 0);
      if (Math.random() < 0.35) cheerVoices(cg, t0 + rnd(0.2, 0.6), 0.9, 1, 0.12, { high: true }); // a lone "nice!"
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
  const stats = { last: null, count: 0 };
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
    init, unlock, crowd, stats,
    level() { if (!analyser) return 0; const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d); let m = 0; for (let i = 0; i < d.length; i++) m += d[i] * d[i]; return Math.sqrt(m / d.length); },
    state: () => (ctx ? ctx.state : 'none'),
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    isMuted: () => muted,
    ambient(windMph, ocean) {
      if (!ready) return; const t = ctx.currentTime;
      windG.gain.setTargetAtTime(Math.min(0.5, 0.02 + windMph * 0.014), t, 0.3);
      windF.frequency.setTargetAtTime(280 + windMph * 25, t, 0.5);
      surfG.base = ocean ? 0.22 : 0.03;
    },
    hit(power, putt) { if (putt) { burst(2200, 0.05, 0.25, 'highpass'); tone(180, 0.06, 0.2, 'sine', 90); return; } burst(1800, 0.09, 0.6 * (0.4 + power), 'highpass'); tone(150, 0.12, 0.5 * (0.4 + power), 'sine', 60); },
    bounce(v, surf) { if (surf === 6) burst(500, 0.12, 0.3, 'lowpass'); else tone(110 + Math.min(v, 20) * 3, 0.08, Math.min(0.35, 0.05 + v * 0.02), 'sine', 60); },
    splash() { burst(900, 0.5, 0.6, 'bandpass', 0.5); },
    tree() { burst(700, 0.2, 0.5, 'bandpass', 2); tone(90, 0.15, 0.3, 'triangle', 50); },
    cup() { tone(880, 0.12, 0.25, 'sine'); setTimeout(() => tone(660, 0.18, 0.25, 'sine'), 90); burst(1500, 0.06, 0.3, 'highpass'); },
    cheer() { crowd('cheer'); },
    ui() { tone(520, 0.05, 0.12, 'triangle'); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
