// Assemble the self-contained web bundle that Capacitor ships inside the iOS app (./www).
// Everything the game needs is copied locally: no CDN, no remote requests.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ['css', 'js', 'vendor', 'assets', 'audio', 'icons']) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
fs.mkdirSync(path.join(out, 'docs'));
for (const f of ['privacy.html', 'support.html']) fs.copyFileSync(path.join(root, 'docs', f), path.join(out, 'docs', f));
// drop the clips that are disabled in the manifest (they never play) to keep the app small
const mp = path.join(out, 'audio/commentary/manifest.json'), m = JSON.parse(fs.readFileSync(mp, 'utf8'));
for (const c of Object.values(m.clips)) if (c.disabled) fs.rmSync(path.join(out, c.file), { force: true });
// bundle the Capacitor JS runtime for non-bundled use? Not needed: the iOS bridge injects window.Capacitor natively.
console.log('www ready:', out);
