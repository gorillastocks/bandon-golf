// Dump BG.Real (OSM-derived hole paths + polygon refs) to holes.json for the NAIP tools.  node tools/naip/dump.js
const path = require('path'), fs = require('fs');
global.window = global; require(path.join(__dirname, '../../js/realdata.js'));
const R = BG.Real, out = { frame: R.frame, kinds: R.kinds, holes: {}, poly: R.poly.map(p => [p[0], p[1]]) };
for (const c of Object.keys(R.holes)) { out.holes[c] = {}; for (const no of Object.keys(R.holes[c])) { const r = R.holes[c][no]; out.holes[c][no] = { r: r.r, f: r.f, gi: r.gi, ti: r.ti }; } }
fs.writeFileSync(path.join(__dirname, 'holes.json'), JSON.stringify(out));
