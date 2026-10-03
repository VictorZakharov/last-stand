"""Face harness: our head against the reference everywhere on its surface, not at a few points and outlines.

The reference rebuilt in 3D (recon.py: the Basel Face Model fitted to its views) is compared with our head's own distance
field (sdf.mjs), as 3D face reconstruction is scored against a scan (the NoW benchmark: the distance from each of the
scan's points to the other surface after a rigid alignment). Three maps, each from the front, the reference's three-quarter
and its side panel's turn:
  - ours against the reference: how far ours stands out of it (red) or sinks under it (blue), per region in mm;
  - ours against the real face nearest it: the same face model fitted straight to our surface; what it can't follow is
    where ours is unlike any real face (a lump, a hollow, a shelf), whatever the reference;
  - the curvature of our skin's own mesh: a groove or a seam is a thin line of strong curvature, a lump a spot of it.
The reference is laid onto ours by the inner landmarks (brows, eyes, nose, mouth) of the two fitted face models, which
correspond one to one (geometric morphometrics' Procrustes fit), scaled to our eyes. Also writes the target the fitter uses
(fit.mjs: the aligned reference with a weight per point, the eyes, the front view's widths from the hand-placed points).
  python dense.py <out dir> <recon dir> [class] [points.json]
"""
import sys, os, json, subprocess
import cv2, numpy as np
from matplotlib.path import Path
from recon import BFM

HERE = os.path.dirname(os.path.abspath(__file__))
OUT, REC = sys.argv[1], sys.argv[2]
CLS = sys.argv[3] if len(sys.argv) > 3 else 'warrior'
PTS = sys.argv[4] if len(sys.argv) > 4 else None


class SDF:
    """our head's distance field, through one Node process (sdf.mjs)"""
    def __init__(self):
        self.p = subprocess.Popen(['node', os.path.join(HERE, 'sdf.mjs')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, cwd=os.path.join(HERE, '../..'))
        self.i, self.o = os.path.abspath(os.path.join(OUT, '_pts.f32')), os.path.abspath(os.path.join(OUT, '_sdf.f32'))

    def ask(self, line):
        self.p.stdin.write(line + '\n'); self.p.stdin.flush()
        r = self.p.stdout.readline().strip()
        if r != 'ok': raise SystemExit(f'dense: sdf.mjs: {r}')

    def __call__(self, P):
        P.astype(np.float32).tofile(self.i)
        self.ask(f'eval {self.i} {self.o} {CLS}')
        o = np.fromfile(self.o, np.float32).reshape(-1, 4).astype(np.float64)
        return o[:, 0], o[:, 1:]

    def grid(self):
        self.ask(f'grid {self.o} {CLS}')
        return np.fromfile(self.o, np.float32).reshape(-1, 4).astype(np.float64)

    def close(self):
        self.p.stdin.write('quit\n'); self.p.stdin.flush()
        try: self.p.wait(timeout=10)
        except subprocess.TimeoutExpired: self.p.kill()
        for f in (self.i, self.o):
            if os.path.exists(f): os.remove(f)


def nearest_real_face(bfm, sdf, iters=30, lam=1.0):
    """the face model fitted straight to our surface (shape, expression and pose; Gauss-Newton on the distances, robust),
    starting with its eyes on ours"""
    W = np.concatenate([bfm.ws, bfm.we], 1).reshape(-1, 3, 50) / 1000.0
    sd = np.concatenate([bfm.std[12:52], bfm.std[52:62]]).astype(np.float64)
    c = np.zeros(50)
    V = lambda c: bfm.u.reshape(-1, 3) / 1000.0 + np.einsum('nkc,c->nk', W, c)
    V0 = V(c)
    R, t = np.eye(3), np.array([0, 114, 81.0]) - (V0[bfm.lm[36:42]].mean(0) + V0[bfm.lm[42:48]].mean(0)) / 2
    for _ in range(iters):
        P = V(c) @ R.T + t
        d, g = sdf(P)
        w = np.where(np.abs(d) < 3, 1.0, 3 / np.maximum(np.abs(d), 1e-9)) * (np.abs(d) < 25)
        cen = P.mean(0)
        J = np.concatenate([np.cross(P - cen, g), g, np.einsum('nk,kj,njc->nc', g, R, W)], 1)
        A = (J * w[:, None]).T @ J; b = (J * w[:, None]).T @ d
        pr = np.zeros(56); pr[6:] = lam * len(P) * 0.02 / sd ** 2
        A += np.diag(pr) + 1e-6 * np.eye(56); b[6:] += pr[6:] * c
        dx = -np.linalg.solve(A, b)
        Rd = cv2.Rodrigues(dx[:3])[0]
        R = Rd @ R; t = Rd @ (t - cen) + cen + dx[3:6]; c = c + dx[6:]
    P = V(c) @ R.T + t
    return P, sdf(P)[0], c / sd


def view(P, yaw, S=3.2, size=(520, 640)):
    a = np.radians(yaw); Ry = np.array([[np.cos(a), 0, -np.sin(a)], [0, 1, 0], [np.sin(a), 0, np.cos(a)]])
    Q = (P - [0, 85, 30]) @ Ry.T
    return np.stack([Q[:, 0] * S + size[0] / 2, -Q[:, 1] * S + size[1] / 2, Q[:, 2] * S], 1)


def draw(V, tri, col, size=(520, 640)):
    """a mesh coloured per vertex, nearest last, lightly shaded so its form reads"""
    img = np.full((size[1], size[0], 3), 255, np.uint8)
    T = V[tri]; n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    sh = np.clip(np.abs(n[:, 2]), 0, 1) * 0.35 + 0.65
    pts = np.round(T[:, :, :2] * 4).astype(np.int32)
    C = col[tri].mean(1) * sh[:, None]
    for i in np.argsort(T[:, :, 2].mean(1)):
        cv2.fillConvexPoly(img, pts[i], tuple(int(v) for v in C[i]), cv2.LINE_8, 2)
    return img


def diverging(v, full):
    """red for +, blue for -, white near 0"""
    k = np.clip(np.abs(v) / full, 0, 1)[:, None]
    return np.where(v[:, None] > 0, np.array([40, 40, 225.0]), np.array([225, 110, 30.0])) * k + 235 * (1 - k)


def label(img, text):
    cv2.rectangle(img, (0, 0), (len(text) * 10 + 10, 24), (0, 0, 0), -1)
    cv2.putText(img, text, (5, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def regions(P, lm):
    """the face's regions on the face model's mesh, from its landmarks (vertex masks)"""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    brow_y = P[lm[17:27], 1].mean(); eye_y = P[lm[36:48], 1].mean(); nose_b = P[lm[33], 1]
    mouth_y = P[lm[48:68], 1].mean(); lip_lo = P[lm[57], 1]; chin_y = P[lm[8], 1]
    eye_x = np.abs(P[lm[36:48], 0]).max(); mouth_x = np.abs(P[lm[[48, 54]], 0]).max(); nose_x = np.abs(P[lm[31:36], 0]).max()
    front = z > P[lm[[0, 16]], 2].mean() + 10
    R = {
        'forehead': (y > brow_y + 12) & (ax < eye_x) & front,
        'temples': (y > eye_y) & (ax >= eye_x) & (z > P[lm[[0, 16]], 2].mean()),
        'brow': (y > eye_y + 6) & (y <= brow_y + 12) & (ax < eye_x) & front,
        'under the eyes': (y < eye_y - 5) & (y > nose_b + 8) & (ax > nose_x + 3) & (ax < eye_x) & front,
        'cheekbones': (y < eye_y) & (y > nose_b) & (ax >= eye_x - 6),
        'nose': (y < P[lm[27], 1]) & (y > nose_b - 2) & (ax < nose_x + 2),
        'cheeks': (y <= nose_b + 8) & (y > mouth_y - 10) & (ax > mouth_x) & (ax < eye_x + 8),
        'mouth': (y <= nose_b - 2) & (y > lip_lo - 3) & (ax <= mouth_x + 2),
        'chin': (y <= lip_lo - 3) & (ax < mouth_x),
        'jaw': (y < mouth_y - 10) & (ax >= mouth_x),
    }
    return R


os.makedirs(OUT, exist_ok=True)
bfm = BFM()
# (`nearest` for the reference: a face with no picture of its own, fitted to the real face nearest it, its lumps and
# grooves smoothed away)
SELF = REC == 'nearest'
rec = None if SELF else np.load(os.path.join(REC, 'recon.npz'))
meta = json.load(open(os.path.join(REC, 'recon.json'))) if not SELF and os.path.exists(os.path.join(REC, 'recon.json')) else {}
YAW34, YAWS = abs(meta.get('yaw', {}).get('34', 25)), abs(meta.get('yaw', {}).get('side', 70))
sdf = SDF()
lines = meta.get('report', []) + ['', 'the surface (the reference rebuilt in 3D against our head\'s distance field; mm; + ours stands out, - sunk)']

# --- the real face nearest ours
Po, do, co = nearest_real_face(bfm, sdf)
lm = bfm.lm
lines.append(f'  the real face nearest ours (the face model fitted to our surface): off it by {np.median(np.abs(do)):.2f} mm median, '
             f'{np.sqrt(np.mean(np.minimum(do * do, 400))):.2f} rms; its shape {np.abs(co[:40]).max():.1f} sd at most from the mean face')

# --- the reference laid onto it by the inner landmarks, at our eyes' spacing
eyes = lambda X: (X[lm[36:42]].mean(0), X[lm[42:48]].mean(0))
V = Po.copy() if SELF else rec['V'].astype(np.float64)
a, b = eyes(V); c = (a + b) / 2
V = c + (V - c) * np.linalg.norm(np.subtract(*eyes(Po))) / np.linalg.norm(b - a)
inner = lm[17:68]
A, B = V[inner], Po[inner]
ca, cb = A.mean(0), B.mean(0)
U, _, Wt = np.linalg.svd((A - ca).T @ (B - cb))
D = np.eye(3); D[2, 2] = np.sign(np.linalg.det(U @ Wt))
Rr = (U @ D @ Wt).T
Pr = (V - ca) @ Rr.T + cb
dr = sdf(Pr)[0]
lines.append(f'  the reference laid onto ours by the brows, eyes, nose and mouth: ours off it by {np.median(np.abs(dr)):.2f} mm median, '
             f'{np.sqrt(np.mean(np.minimum(dr * dr, 400))):.2f} rms')
lines.append('  region            ours vs the reference      ours vs the real face nearest it')
lines.append('                    mean     rms    worst      mean     rms    worst')
Rg, Ro = regions(Pr, lm), regions(Po, lm)
for k in Rg:
    m, n = Rg[k], Ro[k]
    if m.sum() < 20: continue
    e, f = -dr[m], -do[n]
    worst = lambda v: v[np.argmax(np.abs(v))]
    lines.append(f'  {k:16s} {e.mean():+6.1f}  {np.sqrt(np.mean(e * e)):6.1f}  {worst(e):+6.1f}    {f.mean():+6.1f}  {np.sqrt(np.mean(f * f)):6.1f}  {worst(f):+6.1f}')
# (the landmarks' own offsets: where the reference's features sit against ours, after the fit)
names = {27: 'nasion', 30: 'nose tip', 33: 'subnasale', 51: 'upper lip', 57: 'lower lip', 48: 'mouth corner R', 54: 'mouth corner L', 8: 'chin',
         5: 'jaw R', 11: 'jaw L', 2: 'cheek outline R', 14: 'cheek outline L'}
lines.append('  the reference\'s points minus ours (the two fitted face models; x out to his left, y up, z forwards, mm)')
lines.append('    ' + '   '.join(f'{n} ({Pr[lm[k], 0] - Po[lm[k], 0]:+.0f},{Pr[lm[k], 1] - Po[lm[k], 1]:+.0f},{Pr[lm[k], 2] - Po[lm[k], 2]:+.0f})' for k, n in names.items()))

# --- our skin's curvature
G = sdf.grid()
Pg, H = G[:, :3], G[:, 3]
nu, nv = 220, 160
Wg = nu + 1
j, i = np.mgrid[0:nv, 0:nu]
q = (j * Wg + i).ravel()
gtri = np.concatenate([np.stack([q, q + 1, q + Wg + 1], 1), np.stack([q, q + Wg + 1, q + Wg], 1)])
# (away from the features, where a face has no sharp line: the cheeks, the jaw, the forehead, the temples)
xg, yg, zg = Pg[:, 0], Pg[:, 1], Pg[:, 2]
feat = ((np.abs(np.abs(xg) - 32) < 22) & (yg > 98) & (yg < 135)) | ((np.abs(xg) < 22) & (yg > 45) & (yg < 128)) | ((np.abs(xg) < 34) & (yg > 25) & (yg < 70))
face = (zg > 0) & (yg > 0) & (yg < 160) & ~feat
sharp = np.abs(H) > 0.15
lines.append(f'  our skin\'s curvature away from the eyes, nose and mouth: {100 * (sharp & face).sum() / face.sum():.1f}% of it sharper than a '
             f'7 mm radius (a groove, a seam, a lump); the sharpest {np.percentile(H[face], 0.5):+.2f} / {np.percentile(H[face], 99.5):+.2f} per mm')
# --- the nose (left out above: it has sharp forms of its own): its profile down the middle, from the nasion to the tip,
# against a smooth curve (a hump or a crease between the shapes it is built from leaves it), and how much of its front and
# sides is hollow, a crease (the wings' groove and the nostrils left out)
ys = np.arange(55.0, 140.0, 0.5)
Pn = np.stack([np.zeros_like(ys), ys, np.full_like(ys, 170.0)], 1)
for _ in range(300):
    dn = sdf(Pn)[0]
    if np.all(dn < 0.02): break
    Pn[:, 2] -= np.where(dn < 0.02, 0, np.maximum(0.05, dn * 0.9))
zn = Pn[:, 2]
it = int(np.argmax(np.where((ys > 70) & (ys < 115), zn, -1e9)))
up = (ys > ys[it] + 8) & (ys < 135)
ina = int(np.flatnonzero(up)[np.argmin(zn[up])])
dor = (ys > ys[it] + 5) & (ys < ys[ina] - 3)
cf = np.polyfit(ys[dor], zn[dor], 2)
res = zn[dor] - np.polyval(cf, ys[dor])
bend = np.convolve(np.gradient(np.gradient(zn, ys), ys), np.ones(5) / 5, 'same')[dor]
flips = int(np.sum(np.diff(np.sign(bend[np.abs(bend) > 0.01])) != 0))
lines.append(f'  the nose\'s profile from the nasion (y {ys[ina]:.0f}) to the tip (y {ys[it]:.0f}): off a smooth curve by {np.abs(res).max():.2f} mm at most '
             f'({np.sqrt(np.mean(res * res)):.2f} rms), its bend changing way {flips} times (a hump or a crease between its shapes)')
nose_f = (np.abs(xg) < 13) & (yg > ys[it] - 1) & (yg < ys[ina] - 2) & (zg > np.interp(yg, ys, zn) - 9)
lines.append(f'  the nose\'s front and sides: {100 * ((H < -0.1) & nose_f).sum() / max(1, nose_f.sum()):.1f}% hollow (a crease, sharper than a 10 mm radius), '
             f'the hollowest {np.percentile(H[nose_f], 0.5):+.2f} per mm')
sdf.close()

# --- the sheet
rows = []
for title, P, tri, col in (('ours against the reference: red ours stands out, blue sunk (full at 8 mm)', Pr, bfm.tri, diverging(-dr, 8)),
                           ('ours against the real face nearest it (where ours is unlike a face)', Po, bfm.tri, diverging(-do, 8)),
                           ('our skin\'s curvature: red bulging, blue hollow (full at a 8 mm radius)', Pg, gtri, diverging(H, 0.12))):
    tiles = [label(draw(view(P, yaw), tri, col), f'{name}') for yaw, name in ((0, 'front'), (YAW34, f'turned {YAW34:.0f}'), (YAWS, f'turned {YAWS:.0f}'))]
    row = np.concatenate(tiles, 1)
    bar = np.full((30, row.shape[1], 3), 255, np.uint8)
    cv2.putText(bar, title, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1, cv2.LINE_AA)
    rows += [bar, row]
cv2.imwrite(os.path.join(OUT, 'sheet-dense.png'), np.concatenate(rows, 0))

# --- the fitter's target: the reference's points (eye openings and nostrils out, the nose and lips out: a statistical
# model's are coarse and ours are fitted to the pictures' landmarks; the beard's and the hairline's guesses half)
w = np.ones(len(Pr))
for ids in (range(36, 42), range(42, 48)):
    poly = Pr[lm[list(ids)], :2]; cen = poly.mean(0)
    w[Path(cen + (poly - cen) * 1.35).contains_points(Pr[:, :2]) & (Pr[:, 2] > Pr[lm[list(ids)], 2].min() - 8)] = 0
w[(np.min(np.linalg.norm(Pr[:, None] - Pr[lm[31:36]][None], axis=2), 1) < 5) & (Pr[:, 1] < Pr[lm[30], 1])] = 0
w[(Pr[:, 1] < Pr[lm[33], 1]) & (np.abs(Pr[:, 0]) > 15)] *= 0.6
ny0, ny1 = Pr[lm[33], 1] - 2, Pr[lm[27], 1] - 4
wn = np.abs(Pr[lm[31:36], 0]).max() + 4
w[(Pr[:, 1] > ny0) & (Pr[:, 1] < ny1) & (np.abs(Pr[:, 0]) < wn * (0.45 + 0.55 * (ny1 - Pr[:, 1]) / (ny1 - ny0)))] = 0
ly0, ly1 = Pr[lm[57], 1] - 3, Pr[lm[33], 1]
w[(Pr[:, 1] > ly0) & (Pr[:, 1] < ly1) & (np.abs(Pr[:, 0]) < np.abs(Pr[lm[[48, 54]], 0]).max() + 3)] = 0
w[Pr[:, 1] > Pr[lm[19], 1] + 40] *= 0.5
sel = np.random.default_rng(1).choice(np.flatnonzero(w > 0), 6000, replace=False)
np.concatenate([Pr[sel], w[sel, None]], 1).astype(np.float32).tofile(os.path.join(OUT, 'fit-target.f32'))
target = {'eyesT': [v.tolist() for v in eyes(Pr)], 'eyesO': [v.tolist() for v in eyes(Po)], 'widths': []}
if PTS:
    # (the front view's half-widths from the hand-placed points, at our eyes' 64 mm: the temples, the cheekbones, the
    # cheeks, the jaw's angles; the jaw line and the chin are inner outlines, the neck showing past them)
    R_ = {k: np.array(v, float) for k, v in json.load(open(PTS))['front'].items()}
    ex = R_['pupil_l'] - R_['pupil_r']; mm = 64.0 / np.linalg.norm(ex); ex /= np.linalg.norm(ex); ey = np.array([-ex[1], ex[0]])
    c0 = (R_['pupil_l'] + R_['pupil_r']) / 2
    for k in ('ft', 'zy', 'cheek', 'go'):
        if k + '_l' in R_ and k + '_r' in R_:
            l, r = R_[k + '_l'] - c0, R_[k + '_r'] - c0
            target['widths'].append([114 - (l @ ey + r @ ey) / 2 * mm, (l @ ex - r @ ex) / 2 * mm, 1.5])
json.dump(target, open(os.path.join(OUT, 'fit-target.json'), 'w'))
with open(os.path.join(OUT, 'report.txt'), 'a', encoding='utf-8') as fh: fh.write('\n'.join(lines) + '\n')
print('\n'.join(lines))
