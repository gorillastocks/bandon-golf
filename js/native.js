/* Native-app glue (Capacitor iOS wrapper). Everything here is a no-op in a plain browser.
   - blocks pinch / double-tap zoom, context menus and text selection (the game handles all touch itself)
   - haptics through the Capacitor Haptics plugin (window.Capacitor.Plugins.Haptics), hooked onto the audio events:
     ball strike, ball in the cup, water / OB splash, UI taps.  Toggle with localStorage 'bg.haptics' = '0'. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const doc = root.document;
  const cap = root.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const H = native && cap.Plugins ? cap.Plugins.Haptics : null;
  let on = true; try { on = root.localStorage.getItem('bg.haptics') !== '0'; } catch (e) {}
  let last = 0;
  const ok = () => { const t = Date.now(); if (!on || !H || t - last < 40) return false; last = t; return true; };
  const run = (p) => { try { const r = p(); if (r && r.catch) r.catch(() => {}); } catch (e) {} };
  const Hap = BG.Haptics = {
    native, enabled: () => on,
    setEnabled(v) { on = !!v; try { root.localStorage.setItem('bg.haptics', on ? '1' : '0'); } catch (e) {} },
    impact(style) { if (ok()) run(() => H.impact({ style: style || 'MEDIUM' })); },
    select() { if (ok()) run(() => H.selectionChanged()); },
    notify(type) { if (ok()) run(() => H.notification({ type: type || 'SUCCESS' })); },
  };

  // ---- zoom / selection / callout lockdown (harmless in browsers, essential in WKWebView) ----
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => doc.addEventListener(n, (e) => e.preventDefault(), { passive: false }));
  doc.addEventListener('contextmenu', (e) => { if (!/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) e.preventDefault(); });
  doc.addEventListener('selectstart', (e) => { if (!/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) e.preventDefault(); });
  doc.addEventListener('dblclick', (e) => e.preventDefault());
  doc.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // ---- hook haptics onto the existing audio events ----
  const A = BG.Audio;
  if (A && H) {
    const wrap = (name, fn) => { const o = A[name]; if (typeof o === 'function') A[name] = function () { try { fn.apply(null, arguments); } catch (e) {} return o.apply(this, arguments); }; };
    wrap('hit', (p, putt) => { if (putt) Hap.impact('LIGHT'); else Hap.impact(p > 0.75 ? 'HEAVY' : 'MEDIUM'); });
    wrap('cup', () => Hap.notify('SUCCESS'));
    wrap('splash', () => Hap.notify('WARNING'));
    wrap('tree', () => Hap.impact('LIGHT'));
    wrap('ui', () => Hap.select());
  }
  // light tap feedback on any menu / modal button
  doc.addEventListener('click', (e) => { const b = e.target && e.target.closest && e.target.closest('.btn,.ccard,.dcard,#sideBtns button'); if (b) Hap.select(); }, true);
})(window);
