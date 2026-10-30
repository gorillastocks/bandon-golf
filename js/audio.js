/* Tiny procedural audio: wind, surf, club strike, bounces, splash, cup. No assets. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  let ctx = null, master = null, windG = null, windF = null, surfG = null, noiseBuf = null, muted = false, ready = false;
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
    if (ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
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
  BG.Audio = {
    init,
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
    cheer() { burst(1200, 1.4, 0.35, 'bandpass', 0.4); },
    ui() { tone(520, 0.05, 0.12, 'triangle'); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
