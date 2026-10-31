/* Freemium / in-app purchase — iOS (Capacitor) build ONLY.
   In a normal browser (the GitHub Pages web version) window.Capacitor is absent: BG.IAP.freemium is false, BG.IAP.unlocked()
   is always true and nothing is ever locked or shown, so the web game is unchanged.
   iOS: free teaser = Terrific Dunes ('pacific') holes 1-5; everything else needs the single non-consumable IAP
   "All Courses" (product id com.gorillastocks.abandoneddunes.fullgame) through the native StoreKit 2 plugin ("Store").
   Entitlement is re-checked from Transaction.currentEntitlements on every launch; the last known state is cached in
   localStorage 'bg.fullgame' ('1') so the unlock also works instantly/offline. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const cap = root.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.getPlatform && cap.getPlatform() === 'ios');
  const P = native && cap.Plugins ? cap.Plugins.Store : null;
  const PRODUCT = 'com.gorillastocks.abandoneddunes.fullgame', KEY = 'bg.fullgame';
  const FREE_COURSE = 'pacific', FREE_HOLES = 5;
  let owned = false; try { owned = root.localStorage.getItem(KEY) === '1'; } catch (e) {}
  let product = null; const subs = [];
  const call = (fn, dflt) => { if (!P) return Promise.resolve(dflt); try { return Promise.resolve(fn()).catch(() => dflt); } catch (e) { return Promise.resolve(dflt); } };
  function setOwned(v) {
    v = !!v; if (v === owned) return;
    owned = v; try { v ? root.localStorage.setItem(KEY, '1') : root.localStorage.removeItem(KEY); } catch (e) {}
    subs.forEach((f) => { try { f(owned); } catch (e) {} });
  }
  const IAP = BG.IAP = {
    freemium: !!P, PRODUCT, FREE_COURSE, FREE_HOLES,
    unlocked: () => !P || owned,
    // may this course / hole list be played right now?
    allowed: (courseId, list) => !P || owned || (courseId === FREE_COURSE && Array.isArray(list) && list.length > 0 && list.every((h) => h >= 0 && h < FREE_HOLES)),
    isTeaser: (courseId, list) => !!P && !owned && courseId === FREE_COURSE && Array.isArray(list) && list.length <= FREE_HOLES,
    // localized price string straight from StoreKit (never hardcoded); '' until the product has loaded
    price: () => (product && product.displayPrice) || '',
    productLoaded: () => !!product,
    onChange: (f) => subs.push(f),
    // launch: entitlement check + product lookup (never rejects)
    init() {
      if (!P) return Promise.resolve(true);
      try { P.addListener('entitlementChanged', (e) => { if (e && typeof e.owned === 'boolean') setOwned(e.owned); }); } catch (e) {}
      const ent = call(() => P.isEntitled({ productId: PRODUCT }), null).then((r) => { if (r && typeof r.owned === 'boolean') setOwned(r.owned); });
      const prod = IAP.loadProduct();
      return Promise.all([ent, prod]).then(() => owned);
    },
    loadProduct() { return call(() => P.getProduct({ productId: PRODUCT }), null).then((r) => { if (r && r.found) product = r; return product; }); },
    // -> { status: 'success'|'pending'|'cancelled'|'unavailable'|'failed' }
    purchase() {
      return call(() => P.purchase({ productId: PRODUCT }), { status: 'failed' }).then((r) => {
        r = r || { status: 'failed' }; if (r.status === 'success') setOwned(true); return r;
      });
    },
    // -> { owned, error? }
    restore() {
      return call(() => P.restore({ productId: PRODUCT }), { owned: false, error: 'Store unavailable' }).then((r) => {
        r = r || { owned: false }; if (r.owned) setOwned(true); return r;
      });
    },
  };
  if (P) IAP.init();
})(window);
