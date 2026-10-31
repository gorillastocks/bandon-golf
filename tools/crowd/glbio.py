"""Minimal GLB reader + FK for the Quaternius modular-character rig (numpy only)."""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class GLB:
    def __init__(self, path):
        d = open(path, 'rb').read()
        n = struct.unpack('<I', d[12:16])[0]
        self.j = json.loads(d[20:20 + n])
        off = 20 + n
        m = struct.unpack('<I', d[off:off + 4])[0]
        self.bin = d[off + 8:off + 8 + m]

    def acc(self, i):
        a = self.j['accessors'][i]
        bv = self.j['bufferViews'][a['bufferView']]
        dt = CT[a['componentType']]
        nc = NC[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride')
        cnt = a['count']
        isz = np.dtype(dt).itemsize * nc
        if stride and stride != isz:
            raw = np.frombuffer(self.bin, np.uint8, count=stride * cnt, offset=off).reshape(cnt, stride)[:, :isz].copy()
            arr = raw.view(dt).reshape(cnt, nc)
        else:
            arr = np.frombuffer(self.bin, dt, count=cnt * nc, offset=off).reshape(cnt, nc)
        arr = arr.astype(np.float64) if dt == np.float32 else arr
        if a.get('normalized'):
            mx = {np.uint8: 255, np.uint16: 65535, np.int8: 127, np.int16: 32767}[dt]
            arr = arr.astype(np.float64) / mx
        return arr[:, 0] if nc == 1 else arr


def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                     w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])


def qconj(q): return np.array([-q[0], -q[1], -q[2], q[3]])


def qaxis(axis, ang):
    axis = np.asarray(axis, float); axis = axis / np.linalg.norm(axis)
    s = np.sin(ang / 2); return np.array([axis[0] * s, axis[1] * s, axis[2] * s, np.cos(ang / 2)])


def qfrom_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    d = float(np.dot(a, b))
    if d > 0.999999: return np.array([0, 0, 0, 1.0])
    if d < -0.999999:
        ax = np.cross(a, [1, 0, 0]);
        if np.linalg.norm(ax) < 1e-3: ax = np.cross(a, [0, 1, 0])
        return qaxis(ax, np.pi)
    c = np.cross(a, b); q = np.array([c[0], c[1], c[2], 1 + d]); return q / np.linalg.norm(q)


def qrot(q, v):
    x, y, z, w = q; u = np.array([x, y, z]); v = np.asarray(v, float)
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def qslerp(a, b, t):
    d = float(np.dot(a, b))
    if d < 0: b = -b; d = -d
    if d > 0.9995:
        r = a + (b - a) * t; return r / np.linalg.norm(r)
    th = np.arccos(d); return (a * np.sin((1 - t) * th) + b * np.sin(t * th)) / np.sin(th)


class Rig:
    """Node tree FK. Pose = dict node->(t, q, s)."""
    def __init__(self, g):
        self.g = g; j = g.j; self.nodes = j['nodes']; n = len(self.nodes)
        self.parent = [-1] * n
        for i, nd in enumerate(self.nodes):
            for c in nd.get('children', []): self.parent[c] = i
        sk = j['skins'][0]
        self.joints = sk['joints']
        self.ibm = g.acc(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row matrices
        self.name = [nd.get('name', '') for nd in self.nodes]
        self.byname = {}
        for i, nm in enumerate(self.name): self.byname.setdefault(nm, i)
        self.rest = {}
        for i, nd in enumerate(self.nodes):
            self.rest[i] = (np.array(nd.get('translation', [0, 0, 0]), float), np.array(nd.get('rotation', [0, 0, 0, 1]), float), np.array(nd.get('scale', [1, 1, 1]), float))
        self.order = self._order()

    def _order(self):
        out = []; seen = set()
        def rec(i):
            if i in seen: return
            if self.parent[i] >= 0: rec(self.parent[i])
            seen.add(i); out.append(i)
        for i in range(len(self.nodes)): rec(i)
        return out

    def clips(self):
        res = {}
        for a in self.g.j.get('animations', []):
            ch = {}
            smp = a['samplers']
            for c in a['channels']:
                s = smp[c['sampler']]; t = self.g.acc(s['input']); v = self.g.acc(s['output'])
                ch[(c['target']['node'], c['target']['path'])] = (t, v, s.get('interpolation', 'LINEAR'))
            dur = max(float(v[0][-1]) for v in ch.values())
            res[a['name'].split('|')[-1]] = (dur, ch)
        return res

    def sample(self, clip, t):
        dur, ch = clip
        pose = {}
        for i in range(len(self.nodes)): pose[i] = list(self.rest[i])
        for (node, path), (ts, vs, interp) in ch.items():
            k = int(np.searchsorted(ts, t, side='right')) - 1
            if k < 0: val = vs[0]
            elif k >= len(ts) - 1: val = vs[-1]
            else:
                f = (t - ts[k]) / max(1e-9, ts[k + 1] - ts[k])
                if path == 'rotation': val = qslerp(vs[k], vs[k + 1], f)
                else: val = vs[k] * (1 - f) + vs[k + 1] * f
            pose[node][{'translation': 0, 'rotation': 1, 'scale': 2}[path]] = np.array(val, float)
        return pose

    def world(self, pose):
        W = {}
        for i in self.order:
            t, q, s = pose[i]
            M = np.eye(4); M[:3, :3] = qmat(q) * s[None, :]; M[:3, 3] = t
            p = self.parent[i]
            W[i] = (W[p] @ M) if p >= 0 else M
        return W


# ---------------------------------------------------------------------------
# Armature-space helpers (the Quaternius export is Z-up, -Y forward, cm*0.01 units)
# ---------------------------------------------------------------------------
def mat_to_trs(M):
    t = M[:3, 3].copy(); R = M[:3, :3].copy()
    s = np.linalg.norm(R, axis=0); R = R / s[None, :]
    # matrix -> quaternion
    tr = R[0, 0] + R[1, 1] + R[2, 2]
    if tr > 0:
        S = np.sqrt(tr + 1) * 2; q = np.array([(R[2, 1] - R[1, 2]) / S, (R[0, 2] - R[2, 0]) / S, (R[1, 0] - R[0, 1]) / S, 0.25 * S])
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        S = np.sqrt(1 + R[0, 0] - R[1, 1] - R[2, 2]) * 2; q = np.array([0.25 * S, (R[0, 1] + R[1, 0]) / S, (R[0, 2] + R[2, 0]) / S, (R[2, 1] - R[1, 2]) / S])
    elif R[1, 1] > R[2, 2]:
        S = np.sqrt(1 + R[1, 1] - R[0, 0] - R[2, 2]) * 2; q = np.array([(R[0, 1] + R[1, 0]) / S, 0.25 * S, (R[1, 2] + R[2, 1]) / S, (R[0, 2] - R[2, 0]) / S])
    else:
        S = np.sqrt(1 + R[2, 2] - R[0, 0] - R[1, 1]) * 2; q = np.array([(R[0, 2] + R[2, 0]) / S, (R[1, 2] + R[2, 1]) / S, 0.25 * S, (R[1, 0] - R[0, 1]) / S])
    return t, q / np.linalg.norm(q)


def trs_to_mat(t, q):
    M = np.eye(4); M[:3, :3] = qmat(q); M[:3, 3] = t; return M


class Skel:
    """Joint-only skeleton in metres, armature space (Z-up). Pose = (T[n,3], Q[n,4])."""
    def __init__(self, g):
        self.g = g; j = g.j; sk = j['skins'][0]
        self.rig = Rig(g)
        self.jn = sk['joints']; self.n = len(self.jn)
        self.idx = {self.rig.name[nd]: k for k, nd in enumerate(self.jn)}
        node2k = {nd: k for k, nd in enumerate(self.jn)}
        self.par = [node2k.get(self.rig.parent[nd], -1) for nd in self.jn]
        ibm = self.rig.ibm.copy(); ibm[:, :3, 3] *= 100.0
        self.ibm = ibm
        self.bindW = np.array([np.linalg.inv(m) for m in ibm])
        self.T = np.zeros((self.n, 3)); self.Q = np.zeros((self.n, 4))
        for k in range(self.n):
            L = self.bindW[k] if self.par[k] < 0 else np.linalg.inv(self.bindW[self.par[k]]) @ self.bindW[k]
            self.T[k], self.Q[k] = mat_to_trs(L)
        self.node2k = node2k
        self.clips = self.rig.clips()

    def pose_bind(self): return self.T.copy(), self.Q.copy()

    def sample(self, name, t):
        dur, ch = self.clips[name]
        T, Q = self.pose_bind()
        for (node, path), (ts, vs, interp) in ch.items():
            k = self.node2k.get(node)
            if k is None: continue
            i = int(np.searchsorted(ts, t, side='right')) - 1
            if i < 0: val = vs[0]
            elif i >= len(ts) - 1: val = vs[-1]
            else:
                f = (t - ts[i]) / max(1e-9, ts[i + 1] - ts[i])
                val = qslerp(vs[i], vs[i + 1], f) if path == 'rotation' else vs[i] * (1 - f) + vs[i + 1] * f
            if path == 'rotation': Q[k] = val
            elif path == 'translation': T[k] = np.asarray(val) * 100.0
        return T, Q

    def world(self, pose):
        T, Q = pose; W = np.zeros((self.n, 4, 4))
        for k in range(self.n):  # parents precede children in joint order? ensure via order list
            pass
        for k in self.order():
            M = trs_to_mat(T[k], Q[k]); p = self.par[k]
            W[k] = (W[p] @ M) if p >= 0 else M
        return W

    def order(self):
        if hasattr(self, '_ord'): return self._ord
        out = []; seen = set()
        def rec(k):
            if k in seen: return
            if self.par[k] >= 0: rec(self.par[k])
            seen.add(k); out.append(k)
        for k in range(self.n): rec(k)
        self._ord = out; return out

    def skin(self, pose):
        W = self.world(pose); return np.einsum('kij,kjl->kil', W, self.ibm)  # armature-space skinning matrices


def load_char(path):
    """Merged skinned mesh in metres armature space + material info."""
    g = GLB(path); sk = Skel(g); j = g.j
    pos = []; nor = []; jnt = []; wgt = []; idx = []; mat = []; part = []; base = 0
    for ni, nd in enumerate(j['nodes']):
        if nd.get('mesh') is None or nd.get('skin') is None: continue
        pname = nd['name'].split('_')[-1].lower()
        for p in j['meshes'][nd['mesh']]['primitives']:
            at = p['attributes']; P = g.acc(at['POSITION']) * 100.0; N = g.acc(at['NORMAL']); Jt = g.acc(at['JOINTS_0']).astype(int); Wt = g.acc(at['WEIGHTS_0']); I = g.acc(p['indices']).astype(int)
            m = j['materials'][p['material']]
            col = m['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1])
            pos.append(P); nor.append(N); jnt.append(Jt); wgt.append(Wt); idx.append(I + base); base += len(P)
            mat.append((m['name'], col[:3], len(P), pname))
    return sk, dict(pos=np.concatenate(pos), nor=np.concatenate(nor), jnt=np.concatenate(jnt), wgt=np.concatenate(wgt), idx=np.concatenate(idx).reshape(-1, 3), mats=mat)
