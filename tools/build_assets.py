#!/usr/bin/env python3
"""Builds the compressed runtime assets in assets/ from the CC0 source downloads.
Sources (CC0): ambientCG Grass006/Grass008/Grass004/Rock030 (1K-JPG zips), Poly Haven withered_grass/sand_01/brown_mud_leaves_01 (1k jpg),
Poly Haven HDRIs kloofendal_48d_partly_cloudy_puresky / kloofendal_overcast_puresky / kloofendal_misty_morning_puresky (2k .hdr).
Usage: python3 tools/build_assets.py <srcdir> <outdir>"""
import sys, os, json, struct
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
LAYERS = [  # name, albedo, normal, roughness
  ('fairway', 'Grass006/Grass006_1K-JPG_Color.jpg', 'Grass006/Grass006_1K-JPG_NormalGL.jpg', 'Grass006/Grass006_1K-JPG_Roughness.jpg'),
  ('green',   'Grass008/Grass008_1K-JPG_Color.jpg', 'Grass008/Grass008_1K-JPG_NormalGL.jpg', 'Grass008/Grass008_1K-JPG_Roughness.jpg'),
  ('rough',   'Grass004/Grass004_1K-JPG_Color.jpg', 'Grass004/Grass004_1K-JPG_NormalGL.jpg', 'Grass004/Grass004_1K-JPG_Roughness.jpg'),
  ('deep',    'withered_grass/diff.jpg', 'withered_grass/nor.jpg', 'withered_grass/rough.jpg'),
  ('sand',    'sand_01/diff.jpg', 'sand_01/nor.jpg', 'sand_01/rough.jpg'),
  ('gorse',   'brown_mud_leaves_01/diff.jpg', 'brown_mud_leaves_01/nor.jpg', 'brown_mud_leaves_01/rough.jpg'),
  ('rock',    'Rock030/Rock030_1K-JPG_Color.jpg', 'Rock030/Rock030_1K-JPG_NormalGL.jpg', 'Rock030/Rock030_1K-JPG_Roughness.jpg'),
]
for size in (512, 1024):
    for name, a, n, r in LAYERS:
        A = Image.open(os.path.join(src, a)).convert('RGB').resize((size, size), Image.LANCZOS)
        A.save(f'{out}/tex/{size}/{name}_a.webp', quality=82 if size == 1024 else 80, method=6)
        N = Image.open(os.path.join(src, n)).convert('RGB').resize((size, size), Image.LANCZOS)
        rp = os.path.join(src, r)
        R = Image.open(rp).convert('L').resize((size, size), Image.LANCZOS) if os.path.exists(rp) else Image.new('L', (size, size), 230)
        nn = np.array(N); nn[..., 2] = np.array(R)   # RG = tangent normal (GL), B = roughness
        Image.fromarray(nn).save(f'{out}/tex/{size}/{name}_n.webp', quality=84, method=6)

# ---------------- HDRI skies
def read_hdr(path):
    f = open(path, 'rb'); w = h = 0
    while True:
        l = f.readline().decode('latin1').strip()
        if l.startswith('-Y') or l.startswith('+Y'):
            p = l.split(); h = int(p[1]); w = int(p[3]); break
    data = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        b = f.read(4)
        if b[0] == 2 and b[1] == 2 and ((b[2] << 8) | b[3]) == w:
            for c in range(4):
                x = 0
                while x < w:
                    n = f.read(1)[0]
                    if n > 128:
                        n -= 128; v = f.read(1)[0]; data[y, x:x + n, c] = v
                    else:
                        data[y, x:x + n, c] = np.frombuffer(f.read(n), np.uint8)
                    x += n
        else:
            raise SystemExit('non-RLE hdr unsupported')
    m = data[..., :3].astype(np.float32) * np.exp2(data[..., 3:4].astype(np.float32) - 136)
    m[data[..., 3] == 0] = 0
    return m

AI = np.array([[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]])
AO = np.array([[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]])
def aces(c, exposure=1.0):
    c = c * exposure / 0.6; c = c @ AI.T
    a = c * (c + 0.0245786) - 0.000090537; b = c * (0.983729 * c + 0.4329510) + 0.238081
    c = np.clip((a / b) @ AO.T, 0, 1); return c
def srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 1e-9), 1 / 2.4) - 0.055)

SKIES = {'clear': ('kloofendal_48d_partly_cloudy_puresky', 0.85), 'broken': ('kloofendal_48d_partly_cloudy_puresky', 0.85),
         'over': ('kloofendal_overcast_puresky', 1.1), 'mist': ('kloofendal_misty_morning_puresky', 1.0)}
meta = {}; done = {}
for key, (hd, ex) in SKIES.items():
    if hd in done: meta[key] = dict(done[hd]); continue
    H = read_hdr(f'{src}/{hd}.hdr'); h, w, _ = H.shape
    lum = H @ np.array([0.2126, 0.7152, 0.0722])
    # sun / key-light direction: centroid of the brightest 0.05% of the upper hemisphere
    yy, xx = np.mgrid[0:h, 0:w]
    el = (0.5 - (yy + 0.5) / h) * np.pi            # +pi/2 at row 0 (zenith)
    az = ((xx + 0.5) / w - 0.5) * 2 * np.pi
    up = el > 0.05
    thr = np.quantile(lum[up], 0.9995)
    msk = up & (lum >= thr)
    wgt = lum * msk
    dx = (np.cos(el) * np.cos(az) * wgt).sum() / wgt.sum(); dy = (np.sin(el) * wgt).sum() / wgt.sum(); dz = (np.cos(el) * np.sin(az) * wgt).sum() / wgt.sum()
    L = np.sqrt(dx * dx + dy * dy + dz * dz); sun = [dx / L, dy / L, dz / L]
    # horizon haze colour (elevation 0..8 deg band, linear) for fog
    band = (el > 0.0) & (el < 0.14)
    hz = H[band].mean(axis=0)
    zen = H[el > 1.2].mean(axis=0)
    # LDR background, consistent with the renderer's ACES tone mapping
    img = (srgb(aces(H, ex)) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(img).resize((2048, 1024), Image.LANCZOS).save(f'{out}/sky/{hd}.webp', quality=82, method=6)
    # small RGBE for IBL (flat, uncompressed, 128x64)
    small = np.array(Image.fromarray(np.clip(H / H.max() * 255, 0, 255).astype(np.uint8)).size)  # dummy to keep PIL import used
    sh, sw = 64, 128
    S = np.minimum(H.reshape(sh, h // sh, sw, w // sw, 3).mean(axis=(1, 3)), 3.5)  # clip the sun disc: the sun is a DirectionalLight in-game
    mx = S.max(axis=2); e = np.where(mx > 1e-32, np.ceil(np.log2(np.maximum(mx, 1e-32))), 0)
    sc = np.where(mx > 1e-32, 256.0 / np.exp2(e), 0)
    rgbe = np.concatenate([np.clip(S * sc[..., None], 0, 255), (e + 128)[..., None]], axis=2).astype(np.uint8)
    open(f'{out}/sky/{hd}.rgbe', 'wb').write(rgbe.tobytes())
    m = {'file': hd, 'sun': [round(float(v), 4) for v in sun], 'horizon': [round(float(v * ex), 5) for v in hz], 'fog': [round(float(v), 4) for v in srgb(aces(hz, ex))], 'zenith': [round(float(v * ex), 5) for v in zen], 'exposure': ex}
    meta[key] = m; done[hd] = m; print(key, m)
json.dump(meta, open(f'{out}/sky/sky.json', 'w'), indent=1)
