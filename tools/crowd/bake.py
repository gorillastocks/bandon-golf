#!/usr/bin/env python3
"""Bake the CC0 Quaternius modular characters into a compact skinned-instancing pack for js/crowd.js.

 in : tools/crowd/src/*.glb   (see README.md for the exact files / sources)
 out: assets/crowd/crowd.json, assets/crowd/crowd.bin.gz

Per character: 3 LODs of the skinned mesh (original, ~1500 tris, ~350 tris) with vertex roles for recolouring
(skin / shirt / pants / hair / cap / visor), plus per-frame 3x4 skinning matrices (21 bones) for all clips.
"""
import json, os, sys, gzip, struct, math
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from glbio import *
from clips import build_clips, FPS

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src'); OUT = os.path.join(HERE, '..', '..', 'assets', 'crowd')
CHARS = json.load(open(os.path.join(HERE, 'chars.json')))

KEEP = ['Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head']
for s in 'LR': KEEP += [f'Shoulder.{s}', f'UpperArm.{s}', f'LowerArm.{s}', f'Wrist.{s}']
for s in 'LR': KEEP += [f'UpperLeg.{s}', f'LowerLeg.{s}', f'Foot.{s}']
NB = len(KEEP)
C = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)  # armature (Z up, -Y fwd) -> game (Y up, +Z fwd)
ROLE = dict(fixed=0, skin=1, shirt=2, pants=3, hair=4, dome=5, band=6, brim=7)

def bone_map(sk):
    m = np.zeros(sk.n, int)
    for k in range(sk.n):
        a = k
        while True:
            nm = sk.rig.name[sk.jn[a]]
            if nm in KEEP: m[k] = KEEP.index(nm); break
            if nm.startswith('PT.'): m[k] = KEEP.index('Foot.' + nm[-1]); break
            a = sk.par[a]
            if a < 0: m[k] = KEEP.index('Body'); break
    return m

def luma(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def to_srgb(c): return np.clip(np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 1e-9), 1 / 2.4) - 0.055), 0, 1)

def roles_and_colors(m):
    n = len(m['pos']); role = np.zeros(n, int); col = np.zeros((n, 3)); mid = np.zeros(n, int)
    off = 0
    dom = {}  # (part-role) -> dominant luma
    segs = []
    for mi, (nm, c, cnt, part) in enumerate(m['mats']):
        l = nm.lower()
        if l.startswith('skin'): r = 'skin'
        elif l.startswith('hair'): r = 'hair'
        elif l.startswith('eye'): r = 'fixed'
        elif part == 'body': r = 'shirt'
        elif part == 'legs': r = 'pants'
        else: r = 'fixed'
        segs.append((off, cnt, r, np.array(c), mi)); off += cnt
    for r in ('skin', 'shirt', 'pants', 'hair'):
        best = None
        for off, cnt, rr, c, mi in segs:
            if rr == r and (best is None or cnt > best[0]): best = (cnt, luma(c))
        dom[r] = max(best[1], 0.003) if best else 1.0
    for off, cnt, r, c, mi in segs:
        role[off:off + cnt] = ROLE[r]; mid[off:off + cnt] = mi
        if r == 'fixed': col[off:off + cnt] = to_srgb(c)
        else:
            g = min(luma(c) / dom[r], 1.7); col[off:off + cnt] = g / 1.7  # sRGB grey; shader multiplies by 1.7*tint
    return role, col, mid

def cap_geometry(m, sk, bm):
    """dome + visor band + brim rigidly bound to Head (armature space, metres)."""
    head = KEEP.index('Head'); P = m['pos']; J = m['jnt']; W = m['wgt']
    wh = np.zeros(len(P))
    for c in range(4): wh += W[:, c] * (bm[J[:, c]] == head)
    sel = wh > 0.6
    # exclude the neck: head bone verts above z of the head joint
    hz = sk.bindW[sk.idx['Head']][2, 3]
    sel &= P[:, 2] > hz - 0.02
    H = P[sel]
    ztop = H[:, 2].max(); cx = (H[:, 0].min() + H[:, 0].max()) / 2; cy = (H[:, 1].min() + H[:, 1].max()) / 2
    hw = (H[:, 0].max() - H[:, 0].min()) / 2; hd = (H[:, 1].max() - H[:, 1].min()) / 2
    # skull widest part ~ 60% of the way up; the shell sits just above the brow
    z0 = ztop - 0.115
    verts = []; nrm = []; idx = []; rl = []
    def add(ps, ns, tris, r):
        b = len(verts) // 1
        for p, n in zip(ps, ns): verts.append(p); nrm.append(n); rl.append(r)
        for t in tris: idx.append([b + t[0], b + t[1], b + t[2]])
    rx = hw * 1.045 + 0.006; ry = hd * 1.045 + 0.006; zr = ztop - z0 + 0.012
    nu, nv = 14, 6
    ps = []; ns = []
    for j in range(nv + 1):
        a = (math.pi / 2) * j / nv
        for i in range(nu):
            t = 2 * math.pi * i / nu
            x = math.cos(a) * math.cos(t); y = math.cos(a) * math.sin(t); z = math.sin(a)
            ps.append((cx + rx * x, cy + ry * y, z0 + zr * z)); n = np.array([x / rx, y / ry, z / zr]); ns.append(tuple(n / np.linalg.norm(n)))
    tris = []
    for j in range(nv):
        for i in range(nu):
            a0 = j * nu + i; a1 = j * nu + (i + 1) % nu; b0 = (j + 1) * nu + i; b1 = (j + 1) * nu + (i + 1) % nu
            tris += [(a0, a1, b1), (a0, b1, b0)]
    add(ps, ns, tris, ROLE['dome'])
    # visor band: ring z0 .. z0+0.05
    ps = []; ns = []; tris = []
    for lvl, zz in enumerate((z0 - 0.004, z0 + 0.045)):
        for i in range(nu):
            t = 2 * math.pi * i / nu; k = 1.0 + 0.012 * lvl
            ps.append((cx + rx * 1.01 * math.cos(t), cy + ry * 1.01 * math.sin(t), zz)); ns.append((math.cos(t), math.sin(t), 0))
    for i in range(nu):
        a0 = i; a1 = (i + 1) % nu; b0 = nu + i; b1 = nu + (i + 1) % nu
        tris += [(a0, a1, b1), (a0, b1, b0)]
    add(ps, ns, tris, ROLE['band'])
    # brim toward -Y (front): sector, double sided
    ps = []; ns = []; tris = []
    na = 9; ang0, ang1 = -math.radians(78), math.radians(78)
    for i in range(na + 1):
        a = ang0 + (ang1 - ang0) * i / na
        dx, dy = math.sin(a), -math.cos(a)
        inner = (cx + rx * 0.98 * dx, cy + ry * 0.98 * dy, z0 - 0.002)
        outer = (cx + (rx + 0.115) * dx, cy + (ry + 0.115) * dy, z0 - 0.028)
        ps += [inner, outer]
    for i in range(na):
        a0, a1, b0, b1 = 2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3
        tris += [(a0, a1, b1), (a0, b1, b0)]
    add(ps, [(0, 0, 1)] * len(ps), tris, ROLE['brim'])
    # reverse side
    bb = len(verts)
    for p in ps: verts.append(p); nrm.append((0, 0, -1)); rl.append(ROLE['brim'])
    for i in range(na):
        a0, a1, b0, b1 = 2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3
        idx += [[bb + a0, bb + b1, bb + a1], [bb + a0, bb + b0, bb + b1]]
    return np.array(verts), np.array(nrm), np.array(idx), np.array(rl)

def cluster_lod(P, N, J, Wt, R, Col, I, target_tris):
    """vertex clustering on bind-pose; returns reduced arrays."""
    lo, hi = 0.004, 0.2
    best = None
    for _ in range(18):
        h = math.sqrt(lo * hi)
        key = np.floor(P / h).astype(np.int64)
        k = np.concatenate([key, R[:, None], (Col[:, 0:1] * 255).astype(np.int64)], axis=1)
        _, inv = np.unique(k, axis=0, return_inverse=True)
        inv = inv.ravel()
        T = inv[I]; ok = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
        T = T[ok]
        ts = np.sort(T, axis=1); _, u = np.unique(ts, axis=0, return_index=True); T = T[np.sort(u)]
        nt = len(T)
        best = (h, inv, T) if best is None or abs(nt - target_tris) < abs(len(best[2]) - target_tris) else best
        if nt > target_tris: lo = h
        else: hi = h
    h, inv, T = best
    used = np.unique(T); remap = -np.ones(inv.max() + 1, int); remap[used] = np.arange(len(used)); T = remap[T]
    nv = len(used); cnt = np.bincount(inv, minlength=inv.max() + 1)[used][:, None].astype(float)
    def avg(A):
        out = np.zeros((inv.max() + 1, A.shape[1])); np.add.at(out, inv, A); return out[used] / cnt
    P2 = avg(P); N2 = avg(N); N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-6); Col2 = avg(Col)
    R2 = np.zeros(inv.max() + 1, int); R2[inv] = R; R2 = R2[used]
    # joint weights: accumulate per bone
    Wb = np.zeros((inv.max() + 1, NB))
    for c in range(4): np.add.at(Wb, (inv, J[:, c]), Wt[:, c])
    Wb = Wb[used]
    top = np.argsort(-Wb, axis=1)[:, :4]; w = np.take_along_axis(Wb, top, 1); w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
    return P2, N2, top, w, R2, Col2, T

def pack_mesh(P, N, J, Wt, R, Col, I, name, blobs):
    """returns descriptor; appends bytes to blobs (list of bytes). Positions in game space, int16 mm/…"""
    Pg = P @ C.T; Ng = N @ C.T
    mn = Pg.min(0); mx = Pg.max(0); ext = np.maximum(mx - mn, 1e-6)
    q = np.round((Pg - mn) / ext * 65535 - 32768).astype(np.int16)
    pos = np.concatenate([q, np.zeros((len(q), 1), np.int16)], axis=1)
    nrm = np.concatenate([np.round(Ng * 127).astype(np.int8), np.zeros((len(Ng), 1), np.int8)], axis=1)
    col = np.concatenate([np.round(np.clip(Col, 0, 1) * 255).astype(np.uint8), (R.astype(np.uint8) * 16)[:, None]], axis=1)
    ji = J.astype(np.uint8); wq = np.round(Wt * 255).astype(np.uint8)
    # fix rounding so each row sums to 255
    d = 255 - wq.sum(1).astype(int); wq[np.arange(len(wq)), 0] = np.clip(wq[np.arange(len(wq)), 0].astype(int) + d, 0, 255).astype(np.uint8)
    idx = I.astype(np.uint16).ravel()
    desc = dict(nv=int(len(P)), ni=int(len(idx)), min=[float(x) for x in mn], ext=[float(x) for x in ext], off={})
    for key, arr in (('pos', pos), ('nrm', nrm), ('col', col), ('ji', ji), ('wt', wq), ('idx', idx)):
        b = arr.tobytes(); pad = (-sum(len(x) for x in blobs)) % 4
        if pad: blobs.append(b'\0' * pad)
        desc['off'][key] = sum(len(x) for x in blobs); blobs.append(b)
    return desc

def bake_char(ch, blobs):
    sk, m = load_char(os.path.join(SRC, ch['file']))
    bm = bone_map(sk)
    role, col, mid = roles_and_colors(m)
    P = m['pos']; N = m['nor']; I = m['idx']
    # bones: merge to kept bones, top-4
    Wb = np.zeros((len(P), NB))
    for c in range(4): np.add.at(Wb, (np.arange(len(P)), bm[m['jnt'][:, c]]), m['wgt'][:, c])
    top = np.argsort(-Wb, axis=1)[:, :4]; w = np.take_along_axis(Wb, top, 1); w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
    # accessories
    ap, an, ai, ar = cap_geometry(m, sk, bm)
    hj = KEEP.index('Head')
    P = np.concatenate([P, ap]); N = np.concatenate([N, an]); role = np.concatenate([role, ar])
    col = np.concatenate([col, np.zeros((len(ap), 3))])
    top = np.concatenate([top, np.tile([hj, 0, 0, 0], (len(ap), 1))]); w = np.concatenate([w, np.tile([1.0, 0, 0, 0], (len(ap), 1))])
    I = np.concatenate([I, ai + len(m['pos'])])
    lods = []
    lods.append(pack_mesh(P, N, top, w, role, col, I, ch['id'] + '0', blobs))
    Wd = np.zeros((len(P), NB)); np.add.at(Wd, (np.repeat(np.arange(len(P)), 4), top.ravel()), w.ravel())
    for tgt in (1700, 420):
        P2, N2, J2, W2, R2, C2, T2 = cluster_lod(P, N, top, w, role, col, I, tgt)
        lods.append(pack_mesh(P2, N2, J2, W2, R2, C2, T2, ch['id'], blobs))
    # clips -> matrices
    cl = build_clips(sk)
    names = list(cl.keys()); table = {}; mats = []; f0 = 0
    floor_z = []
    for nm in names:
        fr = cl[nm]['frames']; table[nm] = dict(start=f0, n=len(fr), loop=bool(cl[nm]['loop']))
        for pose in fr:
            S = sk.skin(pose)  # (n,4,4) armature space
            Sg = np.zeros((NB, 3, 4))
            for b, bn in enumerate(KEEP):
                # dropped bones share the kept bone's matrix: any skinned bone mapping to b has same chain; use the kept joint itself
                M = S[sk.idx[bn]]
                R3 = C @ M[:3, :3] @ C.T; t3 = C @ M[:3, 3]
                Sg[b, :, :3] = R3; Sg[b, :, 3] = t3
            mats.append(Sg)
        f0 += len(fr)
    mats = np.array(mats)  # (F, NB, 3, 4)
    # texel layout: for bone b, row r -> texel b*3+r, RGBA = (m[r][0..3])
    tex = mats.reshape(len(mats), NB * 3, 4).astype(np.float16)
    blobs.append(b'\0' * ((-sum(len(x) for x in blobs)) % 4))
    moff = sum(len(x) for x in blobs); blobs.append(tex.tobytes())
    # ground check: lowest skinned vertex over a few frames
    return dict(id=ch['id'], gender=ch['gender'], name=ch['name'], src=ch['src'], lods=lods, mat=dict(off=moff, frames=int(len(mats))), clips=table), table

def main():
    os.makedirs(OUT, exist_ok=True)
    blobs = []; chars = []; table = None
    for ch in CHARS:
        d, table = bake_char(ch, blobs); chars.append(d)
        print(ch['id'], [(l['nv'], l['ni'] // 3) for l in d['lods']], flush=True)
    meta = dict(version=1, fps=FPS, bones=NB, keep=KEEP, clips=table, chars=chars, roles=ROLE)
    bin_ = b''.join(blobs)
    open(os.path.join(OUT, 'crowd.json'), 'w').write(json.dumps(meta, separators=(',', ':')))
    with gzip.GzipFile(os.path.join(OUT, 'crowd.bin.gz'), 'wb', 9, mtime=0) as f: f.write(bin_)
    print('bin', len(bin_), 'gz', os.path.getsize(os.path.join(OUT, 'crowd.bin.gz')))

if __name__ == '__main__': main()
