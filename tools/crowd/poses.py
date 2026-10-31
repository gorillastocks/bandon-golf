"""Procedural spectator poses layered on top of the pack's own Idle/Run/Walk/Hit animations.
Armature space: Z up, -Y forward, +X = character's left. Metres."""
import numpy as np
from glbio import *

X = np.array([1.0, 0, 0]); Y = np.array([0, 1.0, 0]); Z = np.array([0, 0, 1.0])
FWD = -Y


class Poser:
    def __init__(self, sk):
        self.sk = sk; self.id = sk.idx
        bw = sk.bindW
        self.bp = {nm: bw[k][:3, 3].copy() for nm, k in sk.idx.items()}
        # bone local end vectors (bind), used to measure current direction
        def end(a, b): return np.linalg.inv(bw[sk.idx[a]])[:3, :3] @ (self.bp[b] - self.bp[a])
        self.endv = {}
        for s in 'LR':
            self.endv['UpperArm.' + s] = end('UpperArm.' + s, 'LowerArm.' + s)
            self.endv['LowerArm.' + s] = end('LowerArm.' + s, 'Wrist.' + s)
            self.endv['UpperLeg.' + s] = end('UpperLeg.' + s, 'LowerLeg.' + s)
            self.endv['LowerLeg.' + s] = end('LowerLeg.' + s, 'Foot.' + s)
        self.len = {k: float(np.linalg.norm(v)) for k, v in self.endv.items()}

    # --- world helpers
    def W(self, pose): return self.sk.world(pose)

    def wpos(self, pose, nm): return self.W(pose)[self.id[nm]][:3, 3]

    def set_world_rot(self, pose, nm, qw, W=None):
        """Force joint nm to world rotation qw (keeping its local translation)."""
        sk = self.sk; k = self.id[nm]; W = W if W is not None else self.W(pose)
        p = sk.par[k]
        qp = mat_to_trs(W[p])[1] if p >= 0 else np.array([0, 0, 0, 1.0])
        pose[1][k] = qmul(qconj(qp), qw)

    def rot_world(self, pose, nm, qd):
        """Pre-multiply world rotation of nm by qd (rotate about the joint)."""
        W = self.W(pose); k = self.id[nm]
        qc = mat_to_trs(W[k])[1]; self.set_world_rot(pose, nm, qmul(qd, qc), W)

    def aim(self, pose, nm, target_pt):
        """Rotate joint nm so its bone points at world point target_pt."""
        W = self.W(pose); k = self.id[nm]; R = W[k][:3, :3]; pos = W[k][:3, 3]
        cur = R @ self.endv[nm]; d = target_pt - pos
        qd = qfrom_to(cur, d); qc = mat_to_trs(W[k])[1]
        self.set_world_rot(pose, nm, qmul(qd, qc), W)

    def ik2(self, pose, up, lo, target, pole, stretch=0.998):
        """Two-bone IK: up/lo = bone names; places end of lo at target."""
        W = self.W(pose); S = W[self.id[up]][:3, 3]; a = self.len[up]; b = self.len[lo]
        v = target - S; d = np.linalg.norm(v); dirv = v / max(d, 1e-6)
        d = min(max(d, abs(a - b) + 0.01), (a + b) * stretch)
        x = (a * a - b * b + d * d) / (2 * d); y = np.sqrt(max(a * a - x * x, 0.0))
        pp = pole - dirv * np.dot(pole, dirv); n = np.linalg.norm(pp)
        pp = pp / n if n > 1e-6 else np.cross(dirv, Z)
        E = S + dirv * x + pp * y; T = S + dirv * d
        self.aim(pose, up, E)
        self.aim(pose, lo, T)
        return T

    # --- stance layers
    def seat(self, pose, hip_z=0.50, thigh=0.43):
        """Sit on an invisible seat: hips lowered, thighs forward, shins down."""
        k = self.id['Body']; W = self.W(pose)
        hz = W[self.id['UpperLeg.L']][2, 3]
        drop = hz - hip_z
        self._body_dz(pose, -drop)
        # feet: move forward below the knees
        W = self.W(pose)
        for s in 'LR':
            H = W[self.id['UpperLeg.' + s]][:3, 3]
            fx = H[0] * 1.15
            foot = np.array([fx, H[1] + FWD[1] * thigh * 0.98, self.bp['Foot.' + s][2]])
            self.place_foot(pose, s, foot)
            self.ik2(pose, 'UpperLeg.' + s, 'LowerLeg.' + s, foot + np.array([0, 0, 0.0]), FWD * 1.0 + Z * 0.2)

    def place_foot(self, pose, s, wp):
        sk = self.sk; k = self.id['Foot.' + s]; p = sk.par[k]
        W = self.W(pose)
        Mp = W[p] if p >= 0 else np.eye(4)
        pose[0][k] = (np.linalg.inv(Mp) @ np.append(wp, 1.0))[:3]

    def crouch(self, pose, amount, lean=0.0):
        """amount 0..1: hips drop to ~0.55 m, knees forward."""
        if amount <= 1e-4: return
        k = self.id['Body']; W = self.W(pose)
        hz = W[self.id['UpperLeg.L']][2, 3]
        drop = amount * (hz - 0.52)
        self._body_dz(pose, -drop)
        W = self.W(pose)
        for s in 'LR':
            H = W[self.id['UpperLeg.' + s]][:3, 3]
            foot = W[self.id['Foot.' + s]][:3, 3].copy()
            self.ik2(pose, 'UpperLeg.' + s, 'LowerLeg.' + s, foot, FWD + Z * 0.0)

    def _body_dz(self, pose, dz):
        sk = self.sk; k = self.id['Body']; p = sk.par[k]; W = self.W(pose)
        Rp = W[p][:3, :3] if p >= 0 else np.eye(3)
        pose[0][k] = pose[0][k] + Rp.T @ np.array([0, 0, dz])

    # --- spine
    def lean(self, pose, ang, head=0.0, yaw=0.0, roll=0.0):
        """Pitch the spine forward by ang rad total (spread over Abdomen/Torso/Chest) and head by 'head'; yaw/roll for head."""
        for nm, f in (('Abdomen', 0.3), ('Torso', 0.35), ('Chest', 0.35)):
            self.rot_world(pose, nm, qaxis(X, ang * f))
        if head: self.rot_world(pose, 'Head', qaxis(X, head))
        if yaw: self.rot_world(pose, 'Head', qaxis(Z, yaw))
        if roll: self.rot_world(pose, 'Head', qaxis(Y, roll))

    def twist(self, pose, ang):
        for nm, f in (('Abdomen', 0.3), ('Torso', 0.35), ('Chest', 0.35)):
            self.rot_world(pose, nm, qaxis(Z, ang * f))
