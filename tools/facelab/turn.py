"""Face harness, the turnaround half: ours against a reference's three-quarter and side views (facelab.mjs --turn).

A turnaround's head views are cropped from one sheet, so they share a scale: the front view's eye spacing gives it in
millimetres (the reference taken to have our eyes' 64 mm), and ours comes from the renderer's own projection. Every view
is laid out in millimetres from the near eye, so a difference reads as one in the head itself:
  - the three-quarter: ours at the turn whose landmarks match the reference's best (a sweep, turn-<az>.png), the
    landmarks' offsets in mm (the far cheek's and the jaw's outline, the nose, the mouth, the chin);
  - the side: the profile from the brow to the chin, the reference's skin, hair and beard against the background and
    ours from its silhouette; its landmarks (glabella, nasion, nose tip, subnasale, lips, chin) found the same way on
    both, the profile angles beside the norms for a man's face, and the profile itself row by row.
Writes sheet-turn.png (reference | ours | ours in clay | both outlines over each other) and appends to report.txt.
python turn.py <prefix of head_front.png, head_34.png, head_side.png> <out dir>
"""
import sys, json
import cv2, numpy as np
import mediapipe as mp
import sideprofile

PRE, OUT = sys.argv[1], sys.argv[2]
EYE_MM = 64.0  # our eyes' centres apart (face.ts EYE.x twice)
S = 3.0        # the sheet's pixels per mm
# the sheet's frame round the near eye (mm: x to the picture's right, y up), per view
FRAMES = {'34': (-135, 115, -175, 105), 'side': (-95, 195, -175, 160)}
X0, X1, Y0, Y1 = FRAMES['34']


def landmarks(img):
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True, max_num_faces=1, min_detection_confidence=0.2) as fm:
        k = 900 / max(img.shape[:2])
        c = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
        r = fm.process(cv2.cvtColor(c, cv2.COLOR_BGR2RGB))
    if not r.multi_face_landmarks: return None
    h, w = c.shape[:2]
    return np.array([[p.x * w / k, p.y * h / k] for p in r.multi_face_landmarks[0].landmark])


def to_frame(img, eye, mm, interp=cv2.INTER_AREA):
    """the picture laid out in the sheet's frame: `mm` of its pixels a millimetre, the near eye at the frame's origin"""
    k = S / mm
    M = np.float32([[k, 0, -X0 * S - eye[0] * k], [0, k, Y1 * S - eye[1] * k]])
    return cv2.warpAffine(img, M, (int((X1 - X0) * S), int((Y1 - Y0) * S)), flags=interp, borderMode=cv2.BORDER_REPLICATE), M


def label(img, text):
    cv2.rectangle(img, (0, 0), (len(text) * 11 + 10, 26), (0, 0, 0), -1)
    cv2.putText(img, text, (5, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def anaglyph(a, b):
    """the reference red, ours cyan: grey where they agree, a red or cyan fringe where one stands out of the other"""
    ga, gb = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    return cv2.merge([gb, gb, ga])


ref = {n: cv2.imread(f'{PRE}{n}.png') for n in ('front', '34', 'side')}
for n, v in ref.items():
    if v is None: raise SystemExit(f'turn: no {PRE}{n}.png')
LF = landmarks(ref['front'])
if LF is None: raise SystemExit('turn: no face found in the front view')
REF_MM = float(np.linalg.norm(LF[468] - LF[473])) / EYE_MM
PTS = {int(k): v for k, v in json.load(open(f'{OUT}/turn-points.json')).items()}
lines = ['', f'turnaround ({PRE}*): the reference at {REF_MM:.2f} px/mm from its front view\'s eye spacing']
rows = []

# --- the three-quarter view: the turn that matches the reference's best, its landmarks' offsets in mm
L34 = landmarks(ref['34'])
if L34 is None: raise SystemExit('turn: no face found in the three-quarter view')
NEAR, FAR = 473, 468  # (the reference turns his left side to us, as ours does at +az)
pick, best = None, 1e9
for az in sorted(a for a in PTS if a < 80):
    im = cv2.imread(f'{OUT}/turn-{az}.png')
    L = landmarks(im)
    if L is None: continue
    # (a similarity fit of all the landmarks: what's left is the shape and the turn)
    A, B = L[:468], L34[:468]
    Ma, _ = cv2.estimateAffinePartial2D(A.astype(np.float32), B.astype(np.float32))
    res = np.linalg.norm((A @ Ma[:, :2].T + Ma[:, 2]) - B, axis=1).mean() / np.linalg.norm(L34[NEAR] - L34[FAR])
    lines.append(f'  three-quarter turn {az:2d} deg: landmarks off by {res * 100:.1f} hundredths of the eye spacing after a fit')
    if res < best: best, pick = res, (az, im, L)
az, im34, LO34 = pick
lines.append(f'  the reference\'s three-quarter matches ours at {az} deg')
r34, Mr = to_frame(ref['34'], L34[NEAR], REF_MM)
o34, Mo = to_frame(im34, PTS[az]['eye'], PTS[az]['mm'])
c34, _ = to_frame(cv2.imread(f'{OUT}/turn-clay-{az}.png'), PTS[az]['eye'], PTS[az]['mm'])
mm_of = lambda L, M: (L @ M[:, :2].T + M[:, 2]) / S + np.array([X0, -Y1])
mr, mo = mm_of(L34, Mr), mm_of(LO34, Mo)
lines.append('  points in mm from the near eye (x to the picture\'s right, y down): reference, ours, ours minus the reference')
P34 = {'far eye': [FAR], 'nose tip': [1], 'nostril (far)': [64], 'mouth corner (far)': [61], 'mouth corner (near)': [291], 'chin': [152],
       'far cheekbone outline': [234, 93], 'far cheek outline': [132, 58], 'far jaw outline': [172, 136], 'near jaw angle': [397, 288],
       'brow (far, middle)': [105], 'brow (near, middle)': [334]}
err34 = []
for k, ids in P34.items():
    a, b = mr[ids].mean(0), mo[ids].mean(0)
    err34.append(np.linalg.norm(b - a))
    lines.append(f'    {k:24s} ({a[0]:+6.1f},{a[1]:+6.1f})  ({b[0]:+6.1f},{b[1]:+6.1f})  ({b[0] - a[0]:+5.1f},{b[1] - a[1]:+5.1f})')
lines.append(f'    mean {np.mean(err34):.1f} mm')
ov = anaglyph(r34, o34)
for p in mr[[1, 152, 61, 291, 234, 93, 132, 58, 172, 136, FAR]]: cv2.circle(ov, tuple(np.int32((p - [X0, -Y1]) * S)), 4, (0, 0, 255), -1)
for p in mo[[1, 152, 61, 291, 234, 93, 132, 58, 172, 136, FAR]]: cv2.circle(ov, tuple(np.int32((p - [X0, -Y1]) * S)), 4, (255, 255, 0), -1)
rows.append([label(r34.copy(), 'reference 3/4'), label(o34, f'ours at {az} deg'), label(c34, 'ours in clay'), label(ov, 'reference red, ours cyan')])

# --- the side: the profile from the brow to the chin, found alike on both
X0, X1, Y0, Y1 = FRAMES['side']
LS = landmarks(ref['side'])
if LS is None: raise SystemExit('turn: no face found in the side view')
rs, Mrs = to_frame(ref['side'], LS[NEAR], REF_MM)
os_, _ = to_frame(cv2.imread(f'{OUT}/turn-90.png'), PTS[90]['eye'], PTS[90]['mm'])
cs, _ = to_frame(cv2.imread(f'{OUT}/turn-clay-90.png'), PTS[90]['eye'], PTS[90]['mm'])
sil, _ = to_frame(cv2.imread(f'{OUT}/turn-sil-90.png'), PTS[90]['eye'], PTS[90]['mm'], cv2.INTER_LINEAR)
silh, _ = to_frame(cv2.imread(f'{OUT}/turn-silhair-90.png'), PTS[90]['eye'], PTS[90]['mm'], cv2.INTER_LINEAR)
# (the reference's head: skin, hair and beard, warm against the grey background; the hood under it is blue-green)
hsv = cv2.cvtColor(rs, cv2.COLOR_BGR2HSV).astype(np.float32)
bg = np.median(rs[:, :12].reshape(-1, 3), 0)
far_bg = np.linalg.norm(rs.astype(np.float32) - bg, axis=2) > 28
warm = (hsv[..., 0] < 25) | (hsv[..., 0] > 165)
ys = np.arange(Y1, Y0, -1.0 / S)
# (the hair hanging over the forehead isn't the forehead: above the eyes only skin, far lighter than the hair, counts)
skin = (hsv[..., 2] > 125) | (ys[:, None] < 5)
headR = cv2.morphologyEx((far_bg & warm).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
mR = cv2.morphologyEx((far_bg & warm & skin).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
mO = (cv2.cvtColor(sil, cv2.COLOR_BGR2GRAY) > 128).astype(np.uint8)


def front_line(m):
    """how far forward the head reaches in each row (mm forward of the near eye, the picture's left), from above the brow
    to below the chin; nan where nothing"""
    out = np.full(m.shape[0], np.nan)
    for r in range(m.shape[0]):
        c = np.flatnonzero(m[r])
        if c.size: out[r] = -(c[0] / S + X0)
    # (a stray hair or two standing out of the outline: a short median along it)
    k = int(2 * S)
    sm_ = out.copy()
    for r in range(m.shape[0]):
        w = out[max(0, r - k):r + k + 1]
        if np.isfinite(w).sum() > k: sm_[r] = np.nanmedian(w)
    return sm_


fR, fO = front_line(mR), front_line(mO)
pl, PR, PO = sideprofile.report(fR, fO, ys)
lines += pl
json.dump({'ys': ys.tolist(), 'f': [None if not np.isfinite(v) else float(v) for v in fR]}, open(f'{OUT}/turn-ref-profile.json', 'w'))

ov = anaglyph(rs, os_)
for f, col in ((fR, (0, 0, 255)), (fO, (255, 255, 0))):
    pts = [(int((-v - X0) * S), r) for r, v in enumerate(f) if np.isfinite(v)]
    for p, q in zip(pts, pts[1:]):
        if abs(p[0] - q[0]) < 6 * S: cv2.line(ov, p, q, col, 1, cv2.LINE_AA)
for P, col in ((PR, (0, 0, 255)), (PO, (255, 255, 0))):
    for k, v in (P or {}).items():
        p = (int((-v[0] - X0) * S), int((Y1 - v[1]) * S))
        cv2.circle(ov, p, 4, col, -1); cv2.putText(ov, k, (p[0] - 40, p[1] + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, col, 1, cv2.LINE_AA)
# (the hair's outline too: ours with its hair against the reference's head)
cH, _ = cv2.findContours((cv2.cvtColor(silh, cv2.COLOR_BGR2GRAY) > 24).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cR, _ = cv2.findContours(headR, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
hl = rs.copy()
cv2.drawContours(hl, [c for c in cR if cv2.contourArea(c) > 2000], -1, (0, 0, 255), 2, cv2.LINE_AA)
cv2.drawContours(hl, [c for c in cH if cv2.contourArea(c) > 2000], -1, (255, 255, 0), 2, cv2.LINE_AA)
rows.append([label(rs.copy(), 'reference side'), label(os_, 'ours'), label(cs, 'ours in clay'), label(ov, 'profiles: reference red, ours cyan')])
rows.append([label(hl, 'head outline: reference red, ours (with hair) cyan')])
grid = [cv2.resize(np.concatenate(r, 1), None, fx=0.6, fy=0.6, interpolation=cv2.INTER_AREA) for r in rows]
wd = max(g.shape[1] for g in grid)
grid = [np.concatenate([g, np.full((g.shape[0], wd - g.shape[1], 3), 255, np.uint8)], 1) for g in grid]
cv2.imwrite(f'{OUT}/sheet-turn.png', np.concatenate(grid, 0))
with open(f'{OUT}/report.txt', 'a', encoding='utf-8') as fh: fh.write('\n'.join(lines) + '\n')
print('\n'.join(lines))
