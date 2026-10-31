"""Clip generators -> list of poses (T,Q) for one character."""
import numpy as np
from glbio import *
from poses import *

FPS = 24

def smooth(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)

def loop_base(sk, name, n):
    dur = sk.clips[name][0]
    return [sk.sample(name, dur * i / n) for i in range(n)]

class ClipBuilder:
    def __init__(self, sk):
        self.sk = sk; self.P = Poser(sk)
        self.bindR = {nm: mat_to_trs(sk.bindW[k])[1] for nm, k in sk.idx.items()}

    def chest_frame(self, pose):
        W = self.P.W(pose); k = self.P.id['Chest']
        R = W[k][:3, :3] @ np.linalg.inv(sk_rot(self.sk, k)); return W[k][:3, 3], R

    def hands(self, pose, tl, tr, poleL=None, poleR=None, rel='chest'):
        """tl/tr: offsets (bind frame, from chest or head) for left/right hands."""
        P = self.P
        if rel == 'chest': o, R = self.chest_frame(pose)
        else:
            W = P.W(pose); k = P.id['Head']; o = W[k][:3, 3]; R = W[k][:3, :3] @ np.linalg.inv(sk_rot(self.sk, k))
        for s, t, pole in (('L', tl, poleL), ('R', tr, poleR)):
            if t is None: continue
            pole = pole if pole is not None else np.array([0.6 if s == 'L' else -0.6, 0.3, -0.7])
            P.ik2(pose, 'UpperArm.' + s, 'LowerArm.' + s, o + R @ np.asarray(t, float), pole)

def sk_rot(sk, k): return sk.bindW[k][:3, :3]

def copy_pose(p): return (p[0].copy(), p[1].copy())

def build_clips(sk):
    """returns dict name -> dict(frames=[pose..], loop=bool) with fps=FPS"""
    cb = ClipBuilder(sk); P = cb.P; out = {}
    idle_n = 48
    idle = loop_base(sk, 'Idle_Neutral', idle_n)
    # sanity: which base keeps the arms relaxed? use Idle_Neutral.
    out['idle'] = dict(frames=idle, loop=True)
    # alert: lean in, head tracks (yaw sway), still arms
    fr = []
    for i in range(36):
        u = i / 36; p = copy_pose(idle[int(u * idle_n) % idle_n])
        P.lean(p, 0.11, head=0.07, yaw=0.12 * np.sin(2 * np.pi * u)); fr.append(p)
    out['alert'] = dict(frames=fr, loop=True)
    # clap (standing): 2 claps per loop (period 0.5s)
    def clap(base, sit=False):
        fr = []
        n = 12
        for i in range(n):
            u = i / n; p = copy_pose(base[(i * 2) % len(base)])
            if sit: P.seat(p)
            P.lean(p, 0.05 + 0.03 * np.sin(2 * np.pi * u), head=0.03)
            c = 0.5 + 0.5 * np.cos(2 * np.pi * u); c = c ** 2  # 1 = apart, 0 = together
            x = 0.035 + 0.24 * c
            cb.hands(p, (x, -0.27 + 0.02 * c, -0.14 + 0.05 * c), (-x, -0.27 + 0.02 * c, -0.14 + 0.05 * c), (0.7, 0.4, -0.6), (-0.7, 0.4, -0.6))
            fr.append(p)
        return dict(frames=fr, loop=True)
    out['clap'] = clap(idle)
    # cheer: arms up with waving, bounce
    def cheer(base, sit=False):
        fr = []
        n = 20
        for i in range(n):
            u = i / n; p = copy_pose(base[(i * 3) % len(base)])
            if sit: P.seat(p)
            else:
                P._body_dz(p, -0.05 * (0.5 + 0.5 * np.cos(4 * np.pi * u)))  # knee-bob handled via crouch ik below
                P.crouch(p, 0.0)
            P.lean(p, -0.10 + 0.04 * np.sin(2 * np.pi * u), head=-0.18)
            w = np.sin(2 * np.pi * u)
            cb.hands(p, (0.30 + 0.05 * w, -0.05, 0.62 + 0.04 * np.cos(2 * np.pi * u)), (-0.30 - 0.05 * w, -0.05, 0.62 + 0.04 * np.cos(2 * np.pi * u + 1.5)), (0.8, 0.0, -0.1), (-0.8, 0.0, -0.1))
            fr.append(p)
        return dict(frames=fr, loop=True)
    out['cheer'] = cheer(idle)
    # groan ("aww"): hands to head, head shake, slumped shoulders; 1.6 s one shot with in/out easing
    def groan(base, sit=False):
        fr = []
        n = 40
        for i in range(n):
            u = i / n; e = smooth(min(u / 0.2, 1)) * (1 - smooth((u - 0.85) / 0.15))
            p = copy_pose(base[i % len(base)])
            if sit: P.seat(p)
            P.lean(p, 0.20 * e, head=0.16 * e, yaw=0.20 * e * np.sin(2 * np.pi * u * 2.5))
            P.twist(p, 0.06 * e * np.sin(2 * np.pi * u * 2.5))
            if e > 0.01:
                # arms: blend from idle arms by building IK only for e>0.3, else keep idle arms (smooth by pole)
                o = e
                cb_hands_blend(cb, p, base[i % len(base)], e,
                               (0.12, -0.05, 0.17), (-0.12, -0.05, 0.17), rel='head')
            fr.append(p)
        return dict(frames=fr, loop=False)
    out['groan'] = groan(idle)
    # sitting variants
    sidle = []
    for i in range(36):
        u = i / 36; p = copy_pose(idle[(i * idle_n // 36) % idle_n]); P.seat(p)
        # hands on knees
        cb.hands(p, (0.13, -0.28, -0.62), (-0.13, -0.28, -0.62), (0.7, 0.4, -0.2), (-0.7, 0.4, -0.2))
        P.lean(p, 0.02 + 0.01 * np.sin(2 * np.pi * u))
        sidle.append(p)
    out['sidle'] = dict(frames=sidle, loop=True)
    out['sclap'] = clap(idle, True)
    out['scheer'] = cheer(idle, True)
    out['sgroan'] = groan(idle, True)
    # duck: in (crouch + hands over head), hold (tremble)
    fr = []
    n = 10
    for i in range(n):
        u = (i + 1) / n; e = smooth(u)
        p = copy_pose(idle[0]); P.crouch(p, 0.95 * e); P.lean(p, 0.65 * e, head=0.35 * e)
        cb_hands_blend(cb, p, idle[0], e, (0.15, 0.02, 0.16), (-0.15, 0.02, 0.16), rel='head')
        fr.append(p)
    out['duck_in'] = dict(frames=fr, loop=False)
    fr = []
    n = 16
    for i in range(n):
        u = i / n; p = copy_pose(idle[0]); P.crouch(p, 0.95); P.lean(p, 0.65 + 0.03 * np.sin(2 * np.pi * u * 2), head=0.35)
        cb.hands(p, (0.15, 0.02, 0.16 + 0.01 * np.sin(2 * np.pi * u * 4)), (-0.15, 0.02, 0.16), (0.9, 0.2, -0.1), (-0.9, 0.2, -0.1)) if False else cb_hands_blend(cb, p, idle[0], 1.0, (0.15, 0.02, 0.16), (-0.15, 0.02, 0.16), rel='head')
        fr.append(p)
    out['duck'] = dict(frames=fr, loop=True)
    out['run'] = dict(frames=loop_base(sk, 'Run', 20), loop=True)
    out['walk'] = dict(frames=loop_base(sk, 'Walk', 32), loop=True)
    hd = sk.clips['HitRecieve'][0]; nh = max(2, int(hd * FPS))
    out['hit'] = dict(frames=[sk.sample('HitRecieve', hd * i / (nh - 1)) for i in range(nh)], loop=False)
    return out

def cb_hands_blend(cb, pose, basepose, e, tl, tr, rel='chest'):
    """Move the hands from where the idle pose leaves them to the IK target by e (target-space lerp, no T-pose in between)."""
    P = cb.P; ids = cb.sk.idx
    W = P.W(pose)
    if rel == 'chest': o, R = cb.chest_frame(pose)
    else:
        k = ids['Head']; o = W[k][:3, 3]; R = W[k][:3, :3] @ np.linalg.inv(sk_rot(cb.sk, k))
    for s, t in (('L', tl), ('R', tr)):
        cur = W[ids['Wrist.' + s]][:3, 3]; goal = o + R @ np.asarray(t, float)
        tgt = cur + (goal - cur) * e
        pole = np.array([0.6 if s == 'L' else -0.6, 0.3, -0.7]) * (1 - e) + np.array([1.0 if s == 'L' else -1.0, 0.0, 0.0]) * e
        P.ik2(pose, 'UpperArm.' + s, 'LowerArm.' + s, tgt, pole)
