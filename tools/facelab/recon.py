"""Face harness: the reference's face rebuilt in 3D with a statistical model of real faces (the Basel Face Model, BFM),
so our head can be compared with it everywhere on its surface instead of at a few points and outlines.

A network (3DDFA_V2, ECCV 2020) regresses the model's parameters from each picture: the head's pose, 40 shape and 10
expression coefficients. The shape is a weighted sum of the ways real faces differ (from 200 laser scans), so whatever
the picture hides (the jaw under a beard, the sides under hair) comes out as a real face's would. Each view gives its own
estimate; the views are then fitted together, one shape and a pose per view, to their landmarks (MediaPipe's), the side
view's profile and the hand-placed jaw outline: how a front and a side photo are combined (multi-view 3DMM fitting).
Each view's turn is fitted too: a turnaround's "side" panel can be far from a profile (this reference's is turned about
68 degrees: the detector finds his face in it, which it can't in a profile, and held at 90 the fit strains to a face
16% too big with its coefficients at 5 sd). The result is the neutral shape in mm.
Checked on our own renders (the same views of our head, whose shape is known): it recovers the view turns within a few
degrees where it has landmarks, and the shape within the face model's reach (dense.py measures what's beyond it).

  python recon.py <out dir> <view>=<picture>[:x0,y0,x1,y1] ... [--points=<points.json>] [--free-scale]
  (views: front, 34, side; the box roughly round the face, needed only where the detector finds none)

Writes recon.npz (the mesh: vertices in mm, x to his left, y up, z forwards; triangles; the 68 landmark indices),
recon.json (each view's turn, the scale, the shape's coefficients in sd, the report lines) and recon-views.png (each
picture with the fitted mesh over it and its landmarks, the detector's green and the model's red; the rebuilt head in
clay from each side).
The model's files come from `npm run facelab -- --setup` (tools/facelab/models, not committed: the BFM's licence is
for research, so it's used here and never shipped).
"""
import sys, os, pickle
import cv2, numpy as np, onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, 'models')


class BFM:
    def __init__(self):
        b = pickle.load(open(os.path.join(MODELS, 'bfm_noneck_v3.pkl'), 'rb'))
        self.u = b['u'].astype(np.float64).ravel()
        self.ws = b['w_shp'].astype(np.float64)
        self.we = b['w_exp'].astype(np.float64)
        self.kp = b['keypoints'].astype(np.int64)  # 68 landmarks, three rows each (x, y, z)
        self.lm = self.kp[::3] // 3
        self.tri = pickle.load(open(os.path.join(MODELS, 'tri.pkl'), 'rb')).T.astype(np.int64)
        ms = pickle.load(open(os.path.join(MODELS, 'param_mean_std_62d_120x120.pkl'), 'rb'))
        self.mean, self.std = ms['mean'], ms['std']

    def shape(self, a, e=None):
        """the mesh (N, 3) in the model's units (micrometres) for shape a and expression e"""
        v = self.u + self.ws @ a + (self.we @ e if e is not None else 0)
        return v.reshape(-1, 3)


class Regressor:
    """3DDFA_V2: 120x120 crop -> 62 parameters (a 3x4 pose, 40 shape, 10 expression)"""
    def __init__(self, bfm, net='resnet22'):
        self.bfm = bfm
        self.s = ort.InferenceSession(os.path.join(MODELS, f'{net}.onnx'), providers=['CPUExecutionProvider'])

    def run(self, img, roi):
        sx, sy, ex, ey = [int(round(v)) for v in roi]
        crop = np.zeros((ey - sy, ex - sx, 3), np.uint8)
        h, w = img.shape[:2]
        a0, b0, a1, b1 = max(0, sx), max(0, sy), min(w, ex), min(h, ey)
        crop[b0 - sy:b1 - sy, a0 - sx:a1 - sx] = img[b0:b1, a0:a1]
        x = cv2.resize(crop, (120, 120), interpolation=cv2.INTER_LINEAR).astype(np.float32).transpose(2, 0, 1)[None]
        p = self.s.run(None, {'input': (x - 127.5) / 128})[0].ravel() * self.bfm.std + self.bfm.mean
        P = p[:12].reshape(3, 4)
        return P[:, :3], P[:, 3], p[12:52].astype(np.float64), p[52:62].astype(np.float64)

    def project(self, R, t, a, e, roi):
        """the mesh in the picture's pixels (x right, y down, z towards the viewer, scaled alike)"""
        v = R @ self.bfm.shape(a, e).T + t[:, None]
        v[0] -= 1; v[2] -= 1; v[1] = 120 - v[1]
        sx, sy, ex, ey = roi
        k = (ex - sx) / 120
        return np.stack([v[0] * k + sx, v[1] * k + sy, v[2] * k], 1)

    def fit(self, img, box, rounds=3):
        """from a rough box round the face to a crop round its own landmarks, as 3DDFA_V2 tracks"""
        x0, y0, x1, y1 = box
        size = ((x1 - x0) + (y1 - y0)) / 2 * 1.58
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + size / 1.58 * 0.14
        roi = [cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2]
        for _ in range(rounds):
            R, t, a, e = self.run(img, roi)
            lm = self.project(R, t, a, e, roi)[self.bfm.lm]
            bx = [lm[:, 0].min(), lm[:, 1].min(), lm[:, 0].max(), lm[:, 1].max()]
            c = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2]
            L = np.hypot(bx[2] - bx[0], bx[3] - bx[1])
            roi = [c[0] - L / 2, c[1] - L / 2, c[0] + L / 2, c[1] + L / 2]
        R, t, a, e = self.run(img, roi)
        return dict(R=R, t=t, a=a, e=e, roi=roi)


# the 68-point scheme's points (the BFM's landmarks) and MediaPipe's for the same spots: brows, nose, eyes, lips, chin.
# The jaw's outline (0-16) is left out: on a turned face it's where the outline happens to fall, not a fixed point.
MP68 = {17: 70, 18: 63, 19: 105, 20: 66, 21: 107, 22: 336, 23: 296, 24: 334, 25: 293, 26: 300,
        27: 168, 28: 6, 29: 197, 30: 1, 31: 98, 33: 2, 35: 327,
        36: 33, 37: 160, 38: 158, 39: 133, 40: 153, 41: 144, 42: 362, 43: 385, 44: 387, 45: 263, 46: 373, 47: 380,
        48: 61, 51: 0, 54: 291, 57: 17, 62: 13, 66: 14, 8: 152}
# his right side's points (the picture's left in a front view), hidden or unreliable once he turns his left to us
RIGHT = {17, 18, 19, 20, 21, 31, 36, 37, 38, 39, 40, 41, 48}


def rodrigues(r):
    return cv2.Rodrigues(np.asarray(r, np.float64).reshape(3, 1))[0]


def multiview(bfm, views, starts, lam=1.0, shared_scale=True):
    """One shape for every view and a pose and expression per view (weak perspective, one scale: a turnaround's views
    share it), fitted together by least squares to what each view shows:
      - its landmarks (MediaPipe's, a detector apart from the network): brows, eyes, nose, lips, chin;
      - in a side view, the profile: how far forward the skin reaches in each row from the brow to the chin;
      - in a front view, the jaw's outline where it was placed by hand (under the beard);
      - in a three-quarter view, the far cheek's and jaw's outline as the detector found it.
    The shape is held to real faces' by a prior on its coefficients (their spread over the scans). Returns the shape,
    each view's pose, expression and residuals."""
    from scipy.optimize import least_squares
    sd_a, sd_e = bfm.std[12:52].astype(np.float64), bfm.std[52:62].astype(np.float64)
    nv = len(views)

    def unpack(x):
        a = x[:40]; s = x[40]; out = []
        for i in range(nv):
            q = x[41 + i * 16:41 + (i + 1) * 16]
            out.append((rodrigues(q[:3]), q[3:5], q[6:16], s * np.exp(q[5])))
        return a, s, out

    def proj(V, s, R, t):
        P = (R @ V.T).T * s
        return np.stack([P[:, 0] + t[0], -P[:, 1] + t[1], P[:, 2]], 1)

    def resid(x, parts=False):
        a, s, ps = unpack(x)
        res, named = [], {}
        for (R, t, e, sv), v in zip(ps, views):
            P = proj(bfm.shape(a, e), sv, R, t)
            r = []
            for k, (px, w) in v['lm'].items():
                r += list((P[bfm.lm[k], :2] - px) * w)
            # an outline: per target row, the model's extreme x among its vertices in that row
            for (row, xt, side, w, allow) in v.get('outline', []):
                m = np.abs(P[:, 1] - row) < 2.5
                if not m.any(): r.append(30 * w); continue
                xs = P[m, 0]
                xe = xs.min() if side < 0 else xs.max()
                d = (xe - xt) * side - allow * s * 1000  # + the model reaches out past the target
                r.append(d * w)
            named[v['name']] = np.array(r)
            res += r
            if 'yaw_prior' in v:  # (a front or a side view of a turnaround is drawn square to the face)
                m_, sd_ = v['yaw_prior']
                res.append(20 * (np.degrees(np.arctan2(R[0, 2], R[2, 2])) - m_) / sd_)
        res += list(np.sqrt(lam) * 3 * a / sd_a)
        for (_, _, e, sv) in ps: res += list(np.sqrt(lam) * 2 * e / sd_e) + ([1000 * np.log(sv / s)] if shared_scale else [])
        return named if parts else np.array(res)

    def run(a0):
        x = np.zeros(41 + nv * 16)
        x[:40] = a0
        x[40] = views[0]['s0']
        for i, v in enumerate(views):
            R = rodrigues([0, np.radians(v['yaw0']), 0])
            p = (R @ bfm.shape(a0)[bfm.lm[30]]) * v['s0']
            x[41 + i * 16:41 + i * 16 + 3] = [0, np.radians(v['yaw0']), 0]
            x[41 + i * 16 + 3:41 + i * 16 + 5] = v['L'][1] - np.array([p[0], -p[1]])
        # the poses first with the shape held, then everything
        free = np.ones_like(x, bool); free[:40] = False
        for i in range(nv): free[41 + i * 16 + 6:41 + (i + 1) * 16] = False
        f = lambda xf, base, mask: (lambda z: (z.__setitem__(mask, xf), resid(z))[1])(base.copy())
        r = least_squares(f, x[free], args=(x, free), x_scale='jac', max_nfev=200)
        x[free] = r.x
        return least_squares(resid, x, x_scale='jac', max_nfev=400)

    # (from several starts, the best kept: from one alone it can settle in a strained fit)
    fits = [run(a) for a in starts]
    print('  the fit from each start (its cost):', ', '.join(f'{f.cost:.0f}' for f in fits))
    r = min(fits, key=lambda f: f.cost)
    a, s, ps = unpack(r.x)
    return a, s, ps, resid(r.x, True)


def mp_landmarks(img):
    import mediapipe as mp
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True, max_num_faces=1, min_detection_confidence=0.2) as fm:
        k = 900 / max(img.shape[:2])
        c = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
        r = fm.process(cv2.cvtColor(c, cv2.COLOR_BGR2RGB))
    if not r.multi_face_landmarks: return None
    h, w = c.shape[:2]
    return np.array([[p.x * w / k, p.y * h / k] for p in r.multi_face_landmarks[0].landmark])


def profile_rows(img, top, bottom, eye_y, step=4):
    """a side view's profile (the face looking to the picture's left): per row from `top` to `bottom`, the first column of
    the head against the grey background (warm skin, hair and beard; above the eyes only skin, far lighter than hair)"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    bg = np.median(img[:, :12].reshape(-1, 3), 0)
    far = np.linalg.norm(img.astype(np.float32) - bg, axis=2) > 28
    warm = (hsv[..., 0] < 25) | (hsv[..., 0] > 165)
    skin = (hsv[..., 2] > 125) | (np.arange(img.shape[0])[:, None] > eye_y)
    m = cv2.morphologyEx((far & warm & skin).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    out = []
    for y in range(int(top), int(bottom), step):
        c = np.flatnonzero(m[y])
        if c.size: out.append((y, float(c[0])))
    return out


def render(V, tri, size, light=(0.4, -0.5, 1.0), color=(200, 205, 210), bg=None):
    """the mesh in pixels (x right, y down, z towards the viewer) drawn in clay, nearest last (painter's)"""
    img = np.full((size[1], size[0], 3), 128, np.uint8) if bg is None else bg.copy()
    T = V[tri]
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    n[n[:, 2] < 0] *= -1
    L = np.array(light, float); L /= np.linalg.norm(L)
    sh = np.clip(n @ L, 0, 1) * 0.8 + 0.2
    order = np.argsort(T[:, :, 2].mean(1))
    pts = np.round(T[:, :, :2] * 4).astype(np.int32)
    for i in order:
        c = tuple(int(v * sh[i]) for v in color)
        cv2.fillConvexPoly(img, pts[i], c, cv2.LINE_8, 2)
    return img


def main():
    import json
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    spec = {}
    for a in sys.argv[2:]:
        if a.startswith('--'): continue
        n, rest = a.split('=', 1)
        path, box = (rest.split(':') + [None])[:2]
        spec[n] = (path, [float(v) for v in box.split(',')] if box else None)
    pts = next((json.load(open(a[9:])) for a in sys.argv[2:] if a.startswith('--points=')), {})
    bfm = BFM(); reg = Regressor(bfm)
    views, a_each = [], []
    for n, (path, box) in spec.items():
        img = cv2.imread(path)
        L = mp_landmarks(img)
        if box is None:
            if L is None: raise SystemExit(f'recon: no face found in {path}; give a box round it ({n}={path}:x0,y0,x1,y1)')
            box = [L[:, 0].min(), L[:, 1].min(), L[:, 0].max(), L[:, 1].max()]
        f = reg.fit(img, box)
        a_each.append(f['a'])
        side = n == 'side'
        # (no face found by the detector, as in a full profile: the network's own landmarks stand in for the rows the
        # profile is read between, and the profile alone is fitted, the view held square to the face)
        F68 = reg.project(f['R'], f['t'], f['a'], f['e'], f['roi'])[bfm.lm][:, :2]
        mp_ok = L is not None
        if not mp_ok:
            L = np.zeros((478, 2))
            for k, i in MP68.items(): L[i] = F68[k]
            L[473] = F68[42:48].mean(0); L[468] = F68[36:42].mean(0)
        lm = {}
        if mp_ok:
            for k, i in MP68.items():
                if side and k in RIGHT: continue
                lm[k] = (L[i], 0.5 if n == '34' and k in RIGHT else 1.0)
        outline = []
        if side:
            eye = L[473]; top = min(L[105, 1], L[334, 1]) - 25; bot = L[152, 1] + 6
            sub = L[2, 1]
            for y, x in profile_rows(img, top, bot, eye[1]):
                outline.append((y, x, -1, 1.0, 2.0 if y > sub else 0.0))
            lm.pop(8, None)  # (the chin's point: the profile has it)
        if n == 'front' and 'front' in pts:
            P = pts['front']
            for k in ('go', 'jaw', 'chin'):
                for sd, sgn in (('r', -1), ('l', 1)):
                    if f'{k}_{sd}' in P: outline.append((P[f'{k}_{sd}'][1], P[f'{k}_{sd}'][0], sgn, 1.0, 0.0))
        if n == '34':
            for i, al in ((234, 0), (93, 0), (132, 2), (58, 2), (172, 2), (136, 2)):
                outline.append((L[i, 1], L[i, 0], -1, 0.7, al))
        # (a turnaround's "side" needn't be a profile: its turn is fitted, unless no landmarks hold it)
        yaw0 = {'front': 0, '34': -30, 'side': -90}[n]
        views.append(dict(name=n, img=img, L=L, lm=lm, outline=outline, yaw0=yaw0, **({'yaw_prior': (yaw0, 3.0)} if n == 'front' or not mp_ok else {})))
    # (the scale from the front view's eyes, taken as our 64 mm)
    s0 = next((np.linalg.norm(v['L'][468] - v['L'][473]) / 64000 for v in views if v['name'] == 'front'), 2.76e-3)
    for v in views: v['s0'] = s0
    starts = [np.zeros(40), np.mean(a_each, 0)]
    a, s, ps, parts = multiview(bfm, views, starts, shared_scale='--free-scale' not in sys.argv)
    lines = ['', 'the reference rebuilt in 3D (a statistical model of real faces, the BFM, fitted to every view at once)']
    lines.append(f'  scale {s * 1000:.2f} px/mm; shape coefficients in their spread over real faces (sd): '
                 + ' '.join(f'{v:+.1f}' for v in (a / bfm.std[12:52])[:12]) + ' ...')
    for (R, t, e, sv), v in zip(ps, views):
        yaw = np.degrees(np.arctan2(R[0, 2], R[2, 2])); pitch = np.degrees(np.arcsin(-R[1, 2]))
        r = parts[v['name']]
        nl = 2 * len(v['lm'])
        lines.append(f"  {v['name']:5s} turned {yaw:+5.1f} deg, tipped {pitch:+5.1f}; landmarks off {np.sqrt(np.mean(r[:nl] ** 2)) / (s * 1000):.1f} mm rms"
                     + (f", outline off {np.sqrt(np.mean(r[nl:] ** 2)) / (s * 1000):.1f} mm rms" if len(r) > nl else ''))
        if v['name'] == 'front' and v['outline']:
            lines.append('    the jaw outline placed by hand, the model past it (+) or inside (-), mm: ' + ', '.join(
                f"{k} {d / (s * 1000):+.1f}" for k, d in zip(('go_r', 'go_l', 'jaw_r', 'jaw_l', 'chin_r', 'chin_l'), r[nl:])))
    V = bfm.shape(a) / 1000.0
    np.savez(f'{out}/recon.npz', V=V, tri=bfm.tri, lm=bfm.lm, a=a)
    yaws = {v['name']: float(np.degrees(np.arctan2(R[0, 2], R[2, 2]))) for (R, t, e, sv), v in zip(ps, views)}
    json.dump({'yaw': yaws, 'scale': float(s * 1000), 'sd': (a / bfm.std[12:52]).tolist(), 'report': lines}, open(f'{out}/recon.json', 'w'))
    # the sheet: each view with the fitted mesh over it, then the rebuilt head in clay from the same sides
    tiles, clay = [], []
    for (R, t, e, sv), v in zip(ps, views):
        img = v['img']
        P = (R @ bfm.shape(a, e).T).T * sv
        P = np.stack([P[:, 0] + t[0], -P[:, 1] + t[1], P[:, 2]], 1)
        ov = cv2.addWeighted(img, 0.5, render(P, bfm.tri, (img.shape[1], img.shape[0]), bg=img), 0.5, 0)
        for k, (px, w) in v['lm'].items():
            cv2.circle(ov, tuple(np.int32(px)), 4, (0, 255, 0), -1)
            cv2.circle(ov, tuple(np.int32(P[bfm.lm[k], :2])), 4, (0, 0, 255), -1)
        for (row, xt, sd, w, al) in v['outline']:
            cv2.circle(ov, (int(xt), int(row)), 3, (255, 255, 0), -1)
        tiles.append(ov)
        Pn = (R @ bfm.shape(a).T).T * sv
        Pn = np.stack([Pn[:, 0] + t[0], -Pn[:, 1] + t[1], Pn[:, 2]], 1)
        clay.append(render(Pn, bfm.tri, (img.shape[1], img.shape[0])))
    H = 600
    row = lambda ims: np.concatenate([cv2.resize(i, (int(i.shape[1] * H / i.shape[0]), H)) for i in ims], 1)
    a_, b_ = row(tiles), row(clay)
    wd = max(a_.shape[1], b_.shape[1])
    pad = lambda m: np.concatenate([m, np.full((m.shape[0], wd - m.shape[1], 3), 255, np.uint8)], 1)
    cv2.imwrite(f'{out}/recon-views.png', np.concatenate([pad(a_), pad(b_)], 0))
    print('\n'.join(lines))
    with open(f'{out}/report.txt', 'a', encoding='utf-8') as fh: fh.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
