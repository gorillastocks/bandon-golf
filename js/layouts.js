/* Original hole designs for all seven courses (112 holes). Every hole is hand-authored here as one compact row:
     [par, yards, route, elevation, features]
   and expanded into a design object that js/course.js turns into a path, height map and hazards, on a synthetic
   (noise + dune) terrain. Nothing here is derived from any real course, survey, aerial image or elevation data.

   route     S straight · sl/sr slight bend · L/R dogleg · LL/RR sharp dogleg · el/er early bend · dl/dr late bend
             cl/cr sweeping curve · SL/SR S-bend (starts left/right) · DL/DR double dogleg (par 5)
   elevation f flat · u uphill · U steep uphill · d downhill · D elevated tee · c crest · v valley · p plateau green · w wave
   features  fl:Y fr:Y fc:Y fairway bunker left/right/centre at Y yards from the tee (optional :size)
             xb:Y cross bunkers · ws:Y:side:len waste area · pn:f pinched fairway · nw/wd narrow/wide · sg/bg small/big green
             gF gB gL gR gA greenside bunkers front/back/left/right/all · tr forest · cL/cR:f0:f1:off ocean
             rg:f:h:w ridge · pt:n pot bunkers */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const ROUTES = {
    S: [[1, 0]],
    sl: [[.55, 0], [.45, -9]], sr: [[.55, 0], [.45, 9]],
    L: [[.58, 0], [.42, -22]], R: [[.58, 0], [.42, 22]],
    LL: [[.5, 0], [.5, -38]], RR: [[.5, 0], [.5, 38]],
    el: [[.36, 0], [.64, -26]], er: [[.36, 0], [.64, 26]],
    dl: [[.7, 0], [.3, -30]], dr: [[.7, 0], [.3, 30]],
    cl: [[.34, 0], [.33, -13], [.33, -13]], cr: [[.34, 0], [.33, 13], [.33, 13]],
    SL: [[.3, 0], [.36, -24], [.34, 26]], SR: [[.3, 0], [.36, 24], [.34, -26]],
    DL: [[.28, 0], [.3, -22], [.22, 42], [.2, -20]], DR: [[.28, 0], [.3, 22], [.22, -42], [.2, 20]],
  };
  const ELEV = {
    f: [1, 0.8, 0.6, 0.8], u: [0, 2, 4.5, 7], U: [0, 3, 7, 11], d: [7, 4.5, 2, 0.5], D: [11, 7, 3, 0.5],
    c: [2, 5, 3.5, 1], v: [4, 0.5, 1, 4.5], p: [1, 1.5, 2.5, 6], w: [2, 4.5, 0.5, 3.5],
  };
  const ELEV_TAG = { u: 'Uphill', U: 'Steep uphill', d: 'Downhill', D: 'Elevated tee', c: 'Blind crest', v: 'Valley', p: 'Plateau green', w: 'Rolling' };
  const ROUTE_TAG = { SL: 'S-bend', SR: 'S-bend', DL: 'Double dogleg', DR: 'Double dogleg', cl: 'Sweeping left', cr: 'Sweeping right' };
  // greenside bunker angles (degrees; 0 = behind the green, 180 = short of it, +90 = right, -90 = left)
  const GS = { F: [150, -150], B: [25, -25], L: [-95], R: [95] };

  function expand(row) {
    const par = row[0], yds = row[1], route = row[2], ev = row[3], feat = (row[4] || '').split(/\s+/).filter(Boolean);
    const D = { legs: ROUTES[route] || ROUTES.S, e: ELEV[ev] || ELEV.f, fb: [], xb: [], ws: [], rg: [], pn: [], tg: [] };
    const gs = [];
    feat.forEach((t) => {
      const a = t.split(':'), k = a[0];
      if (k === 'fl' || k === 'fr' || k === 'fc') D.fb.push([+a[1], k === 'fl' ? -1 : k === 'fr' ? 1 : 0, +(a[2] || 5.5)]);
      else if (k === 'xb') D.xb.push(+a[1]);
      else if (k === 'ws') D.ws.push([+a[1], +(a[2] || 1), +(a[3] || 60)]);
      else if (k === 'pn') D.pn.push([+a[1] || 0.7, 0.62, 38]);
      else if (k === 'rg') D.rg.push([+a[1], +a[2], +a[3]]);
      else if (k === 'nw') D.w = 0.78;
      else if (k === 'wd') D.w = 1.22;
      else if (k === 'sg') D.g = 0.8;
      else if (k === 'bg') D.g = 1.22;
      else if (k === 'tr') D.tr = true;
      else if (k === 'pt') D.pot = +a[1];
      else if (k === 'cL' || k === 'cR') D.coast = [k === 'cR' ? 1 : -1, +(a[1] || 0), +(a[2] || 1), +(a[3] || 40)];
      else if (k[0] === 'g' && k.length === 2) { if (k[1] === 'A') ['F', 'B', 'L', 'R'].forEach((q) => gs.push.apply(gs, GS[q])); else if (GS[k[1]]) gs.push.apply(gs, GS[k[1]]); }
    });
    if (gs.length) D.gs = gs;
    // description tags shown on the hole card / toast
    if (ELEV_TAG[ev]) D.tg.push(ELEV_TAG[ev]);
    if (ROUTE_TAG[route]) D.tg.push(ROUTE_TAG[route]);
    if (D.xb.length) D.tg.push('Cross bunkers');
    if (D.ws.length) D.tg.push('Waste area');
    if (D.pn.length) D.tg.push('Pinched fairway');
    if (D.w && D.w < 1) D.tg.push('Narrow');
    if (par === 5 && yds < 520) D.tg.push('Reachable in two');
    if (par === 4 && yds < 340) D.tg.push('Drivable');
    return D;
  }

  const T = {};
  T.bandit = [
    [4, 398, 'S', 'd', 'fl:245 fr:270 gF gR'],
    [5, 531, 'R', 'f', 'fl:240 xb:420 gF gB bg'],
    [3, 176, 'S', 'p', 'gF gL gR sg cR:0:1:46'],
    [4, 441, 'dr', 'c', 'cR:0.3:1:36 fl:260 gB rg:.5:3:30'],
    [4, 366, 'sl', 'd', 'cR:0:1:34 fr:240 gF gL pn:.72'],
    [3, 152, 'S', 'D', 'cR:0:.8:40 gF gB sg'],
    [4, 423, 'L', 'u', 'fr:255 fl:240 gA'],
    [5, 574, 'el', 'f', 'xb:300 fr:260 fl:410 gB gF'],
    [4, 387, 'S', 'v', 'ws:210:1:70 gF gB'],
    [4, 417, 'SR', 'd', 'fl:250 fr:285 gL gR'],
    [3, 203, 'S', 'f', 'gA bg'],
    [5, 548, 'dl', 'c', 'cL:.5:1:38 fl:255 fr:420 gF gR rg:.4:3:30'],
    [4, 344, 'S', 'd', 'cL:0:1:42 fr:235 gF gB gR sg'],
    [4, 468, 'cl', 'u', 'cL:0.2:1:38 fr:265 fl:290 gB gF'],
    [3, 138, 'S', 'D', 'cL:0:1:44 sg gF gR'],
    [4, 402, 'R', 'p', 'fl:250 xb:340 gF gL'],
    [4, 372, 'S', 'v', 'ws:200:-1:60 fc:240 gB gF pn:.6'],
    [5, 562, 'SL', 'd', 'fr:255 fl:275 fl:430 gF gB gR cR:.55:1:48'],
  ];
  T.terrific = [
    [4, 389, 'S', 'd', 'fl:250 fr:262 gF gR'],
    [3, 167, 'S', 'p', 'gF gL gR sg'],
    [5, 512, 'R', 'f', 'cR:.3:1:40 fl:240 xb:395 gF gB'],
    [4, 421, 'el', 'u', 'fr:255 fl:280 gB gR rg:.55:3:28'],
    [4, 352, 'S', 'D', 'cL:0:1:36 fr:230 gF gL sg pn:.7'],
    [4, 437, 'SL', 'f', 'cL:0:.7:44 fl:250 fr:290 gF gB gR'],
    [4, 447, 'dl', 'c', 'fl:265 fc:300 gB gF'],
    [3, 214, 'S', 'd', 'gA bg'],
    [4, 415, 'sr', 'v', 'ws:225:1:60 gF gB'],
    [4, 378, 'L', 'd', 'cR:0:1:36 fl:245 fr:260 gL'],
    [3, 128, 'S', 'D', 'cR:0:1:38 sg gF gR gB'],
    [5, 586, 'DR', 'u', 'cR:.2:1:44 fr:250 fl:300 xb:430 gF gB'],
    [4, 331, 'S', 'f', 'fc:235 gA sg pn:.6'],
    [4, 436, 'cr', 'c', 'fl:260 fr:285 gF gL'],
    [3, 181, 'S', 'p', 'gF gB gL'],
    [4, 412, 'dr', 'd', 'cL:.35:1:34 fr:250 gF gB'],
    [4, 458, 'S', 'u', 'cL:0:1:46 fl:255 fr:275 gF gR gB'],
    [5, 571, 'el', 'f', 'xb:300 fr:250 fl:260 fl:430 gF gB bg'],
  ];
  T.trails = [
    [4, 378, 'S', 'f', 'fr:250 gF gB'],
    [5, 506, 'dr', 'd', 'fl:245 fr:420 gF gL gR'],
    [4, 402, 'R', 'u', 'tr fl:235 gB gF'],
    [3, 188, 'S', 'c', 'tr gA sg'],
    [4, 440, 'sl', 'd', 'tr fr:250 gF gB pn:.65'],
    [4, 359, 'L', 'f', 'tr fl:240 gR gL'],
    [5, 553, 'SR', 'u', 'tr fl:250 xb:440 gF gB'],
    [3, 156, 'S', 'D', 'tr gF gR sg'],
    [4, 417, 'cl', 'v', 'tr fr:260 gF gL gB'],
    [4, 391, 'S', 'd', 'tr pn:.5 gF gR'],
    [4, 462, 'el', 'c', 'tr fl:255 fr:275 gF gB bg'],
    [3, 218, 'S', 'p', 'tr gA bg'],
    [4, 335, 'R', 'f', 'tr fc:230 gF gB sg'],
    [5, 538, 'dl', 'd', 'tr fl:250 fr:410 gB gR'],
    [4, 424, 'S', 'u', 'tr xb:240 gF gL'],
    [3, 143, 'S', 'd', 'gF gB sg'],
    [4, 454, 'sr', 'c', 'fl:260 fr:285 gA'],
    [4, 386, 'S', 'd', 'fr:250 gF gB wd'],
  ];
  T.oldmac = [
    [4, 364, 'S', 'f', 'fc:230 fr:255 gA wd'],
    [3, 164, 'S', 'f', 'gA'],
    [4, 412, 'sl', 'f', 'fc:235 xb:300 gF gB wd'],
    [5, 521, 'R', 'u', 'ws:150:-1:80 fl:250 fr:405 gF gR gB'],
    [3, 202, 'S', 'd', 'gF gL gR'],
    [4, 438, 'L', 'f', 'ws:240:1:70 fl:260 gB gF'],
    [5, 566, 'SL', 'f', 'fc:250 fr:430 xb:350 gA wd'],
    [3, 143, 'S', 'c', 'sg gF gL gB'],
    [4, 395, 'S', 'f', 'fl:240 fr:255 fc:290 gF gB'],
    [4, 478, 'dr', 'd', 'fl:260 fr:290 gB gL'],
    [4, 421, 'S', 'd', 'ws:200:-1:90 gF gR'],
    [3, 226, 'S', 'f', 'gA'],
    [4, 356, 'sr', 'c', 'fc:240 gF gB gL sg'],
    [5, 523, 'cl', 'f', 'fl:250 xb:380 fr:420 gF gB'],
    [4, 389, 'el', 'u', 'fr:245 fl:270 gF gR'],
    [4, 441, 'S', 'f', 'fc:260 gA'],
    [5, 561, 'dl', 'd', 'ws:260:1:80 fl:250 fr:420 gF gB'],
    [4, 427, 'SL', 'f', 'xb:240 fl:260 fr:280 gF gB gL wd'],
  ];
  T.sheep = [
    [5, 524, 'R', 'd', 'cL:.3:1:60 fl:255 fr:420 gF gB'],
    [4, 377, 'S', 'f', 'cL:0:1:54 fr:250 gL gF'],
    [3, 188, 'S', 'D', 'cL:0:1:46 sg gF gB'],
    [4, 449, 'el', 'u', 'cR:.4:1:56 fl:265 fr:280 gB gR'],
    [4, 312, 'S', 'f', 'fc:225 gA sg pn:.65'],
    [5, 541, 'dl', 'c', 'fl:250 xb:420 fr:260 gF gB gR'],
    [3, 134, 'S', 'd', 'cR:0:1:44 gF gR sg'],
    [4, 421, 'sr', 'd', 'cR:0:1:50 fl:250 fr:270 gF gL'],
    [4, 403, 'S', 'v', 'ws:215:-1:70 gF gB'],
    [4, 456, 'cl', 'f', 'fl:255 fr:285 gB gL'],
    [4, 373, 'R', 'u', 'fr:240 fl:260 gA'],
    [3, 213, 'S', 'p', 'gF gB gL gR'],
    [5, 556, 'SR', 'f', 'xb:250 fl:420 fr:430 gF gB'],
    [4, 398, 'S', 'd', 'ws:240:1:60 fl:240 gF gR'],
    [4, 436, 'L', 'c', 'cR:.2:1:52 fr:255 fl:280 gB gF'],
    [3, 172, 'S', 'd', 'cR:0:1:46 gF gL gB sg'],
    [4, 428, 'dr', 'f', 'cR:0:1:54 fl:260 fr:250 gF gL'],
    [5, 579, 'DL', 'd', 'cR:.5:1:60 fl:250 fr:300 xb:440 gF gB bg'],
  ];
  T.preserve = [
    [3, 112, 'S', 'd', 'gF gR sg'],
    [3, 74, 'S', 'D', 'gA sg'],
    [3, 143, 'sl', 'p', 'cR:0:1:36 gF gB'],
    [3, 96, 'S', 'f', 'cR:0:1:34 gL gB'],
    [3, 151, 'S', 'u', 'gF gL gR'],
    [3, 66, 'S', 'D', 'gA sg'],
    [3, 127, 'sr', 'c', 'gF gB'],
    [3, 108, 'S', 'v', 'gL gR gB'],
    [3, 89, 'S', 'd', 'ws:30:-1:30 gF'],
    [3, 134, 'S', 'p', 'cL:0:1:40 gF gR'],
    [3, 79, 'S', 'f', 'gA sg'],
    [3, 146, 'S', 'D', 'cL:0:1:36 gF gB'],
    [3, 121, 'S', 'u', 'gF gL gR sg'],
  ];
  T.circuit = [
    [3, 72, 'S', 'd', 'gA sg'],
    [3, 138, 'S', 'f', 'gF gB'],
    [3, 101, 'S', 'D', 'gF gR sg'],
    [3, 164, 'sl', 'u', 'gF gL gR'],
    [3, 89, 'S', 'v', 'gA'],
    [3, 121, 'S', 'p', 'gB gL'],
    [3, 154, 'sr', 'c', 'gF gB gR'],
    [3, 67, 'S', 'd', 'sg gF'],
    [3, 109, 'S', 'f', 'gA'],
  ];

  const cache = {};
  BG.LAYOUTS = {
    rows: T,
    pars: (id) => T[id].map((r) => r[0]),
    yds: (id) => T[id].map((r) => r[1]),
    get: (id, idx) => { const k = id + ':' + idx; return cache[k] || (cache[k] = T[id] && T[id][idx] ? expand(T[id][idx]) : null); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
