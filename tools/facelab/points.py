"""Face harness: landmarks placed by hand on the reference (annotate.py) against the model's own (landmarks.ts, projected
by facelab.mjs into ours.png), for what the landmark detector can't see: the face's sides from the temples to the jaw's
angles, the jaw's line, the chin under the beard.

Ours is laid onto the reference by the pupils (a similarity), and everything is in mm from the pupils' midpoint (the
reference taken to have our eyes' 64 mm), x out to his left, y down. Reports each point, the widths at each height, how
far each side bows out of a straight line from the temple to the jaw's angle (a square face's sides run straight; a face
widest at the cheekbones bows out), and the jaw line's slope; writes sheet-points.png (reference green, ours red).
python points.py <points.json> <reference> <out dir>
"""
import sys, json
import cv2, numpy as np

PTS, REF, OUT = sys.argv[1:4]
R = {k: np.array(v, float) for k, v in json.load(open(PTS))['front'].items()}
O = {k: np.array(v, float) for k, v in json.load(open(f'{OUT}/points.json'))['lm'].items()}
ref, ours = cv2.imread(REF), cv2.imread(f'{OUT}/ours.png')


def similarity(a0, a1, b0, b1):
    """the turn, scale and shift taking a0, a1 onto b0, b1"""
    va, vb = a1 - a0, b1 - b0
    s = np.linalg.norm(vb) / np.linalg.norm(va)
    t = np.arctan2(vb[1], vb[0]) - np.arctan2(va[1], va[0])
    A = s * np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    return np.hstack([A, (b0 - A @ a0)[:, None]])


M = similarity(O['pupil_r'], O['pupil_l'], R['pupil_r'], R['pupil_l'])
Om = {k: M[:, :2] @ v + M[:, 2] for k, v in O.items()}
c = (R['pupil_r'] + R['pupil_l']) / 2
ex = (R['pupil_l'] - R['pupil_r']) / np.linalg.norm(R['pupil_l'] - R['pupil_r']); ey = np.array([-ex[1], ex[0]])
MM = 64.0 / np.linalg.norm(R['pupil_l'] - R['pupil_r'])
mm = lambda p: np.array([(p - c) @ ex, (p - c) @ ey]) * MM

lines = ['', 'landmarks placed on the reference against the model\'s (mm from the pupils\' midpoint: x out to his left, y down)']
lines.append('  point       reference          ours               ours minus the reference')
for k in sorted(R, key=lambda k: (R[k][1], R[k][0])):
    if k.startswith('pupil') or k not in Om: continue
    a, b = mm(R[k]), mm(Om[k])
    lines.append(f'  {k:9s} ({a[0]:+6.1f},{a[1]:+6.1f})   ({b[0]:+6.1f},{b[1]:+6.1f})   ({b[0] - a[0]:+5.1f},{b[1] - a[1]:+5.1f})')
lines.append('  widths (mm) and heights below the pupils (mm): reference, ours')
for n in ('ft', 'zy', 'cheek', 'go', 'jaw', 'chin'):
    if n + '_l' in R and n + '_l' in Om:
        wa, wb = mm(R[n + '_l'])[0] - mm(R[n + '_r'])[0], mm(Om[n + '_l'])[0] - mm(Om[n + '_r'])[0]
        ha, hb = (mm(R[n + '_l'])[1] + mm(R[n + '_r'])[1]) / 2, (mm(Om[n + '_l'])[1] + mm(Om[n + '_r'])[1]) / 2
        lines.append(f'    {n:6s} width {wa:6.1f} {wb:6.1f} ({wb - wa:+5.1f})   height {ha:6.1f} {hb:6.1f} ({hb - ha:+5.1f})')


def bow(P, side):
    """how far the side's middle points stand out of the line from its temple to its jaw angle (mm, + outwards), and the
    line's slope (degrees in from upright going down)"""
    a, b = P['ft_' + side], P['go_' + side]
    d = b - a; n = np.array([d[1], -d[0]]) / np.linalg.norm(d)
    out = 1 if side == 'l' else -1
    if n[0] * out < 0: n = -n
    return [float((P[k + '_' + side] - a) @ n) for k in ('zy', 'cheek')], float(np.degrees(np.arctan2(-out * d[0], d[1])))


lines.append('  the sides from the temple (ft) to the jaw angle (go): how far the cheekbone (zy) and the cheek stand out of a straight')
lines.append('  line (mm, + bowing out), the line\'s slope (deg, + in going down); and the jaw line from the angle to the chin\'s corner')
for who, P in (('reference', R), ('ours', Om)):
    if not all(k in P for k in ('ft_l', 'go_l', 'zy_l', 'cheek_l', 'ft_r', 'go_r', 'zy_r', 'cheek_r')): continue
    Pm = {k: mm(v) for k, v in P.items()}
    s = []
    for side in ('r', 'l'):
        (bz, bc), sl = bow(Pm, side)
        j = Pm['chin_' + side] - Pm['go_' + side]
        s.append(f"his {'right' if side == 'r' else 'left '}: zy {bz:+5.1f}, cheek {bc:+5.1f}, slope {sl:+5.1f}; jaw line {np.degrees(np.arctan2(j[1], abs(j[0]))):4.1f} deg below level")
    lines.append(f'    {who:9s} ' + ' | '.join(s))

# the sheet: the reference with both sets of points, ours with its own
box = np.array([min(p[0] for p in R.values()), min(p[1] for p in R.values()), max(p[0] for p in R.values()), max(p[1] for p in R.values())])
pad = 0.35 * np.linalg.norm(R['pupil_l'] - R['pupil_r'])
x0, y0 = np.maximum(0, (box[:2] - pad).astype(int)); x1, y1 = (box[2:] + pad).astype(int)
Z = max(1.0, 900 / (y1 - y0))
sheet = cv2.resize(ref[y0:y1, x0:x1], None, fx=Z, fy=Z, interpolation=cv2.INTER_CUBIC)
q = lambda p: (int((p[0] - x0) * Z), int((p[1] - y0) * Z))
for k, v in R.items():
    if k in Om: cv2.line(sheet, q(v), q(Om[k]), (255, 255, 255), 1, cv2.LINE_AA)
    cv2.circle(sheet, q(v), 5, (0, 220, 0), -1, cv2.LINE_AA)
for k, v in Om.items():
    if k in R or k.startswith('pupil'): cv2.circle(sheet, q(v), 5, (0, 0, 255), -1, cv2.LINE_AA)
W = cv2.warpAffine(ours, M, (ref.shape[1], ref.shape[0]), flags=cv2.INTER_AREA, borderValue=(140, 140, 140))[y0:y1, x0:x1]
W = cv2.resize(W, None, fx=Z, fy=Z, interpolation=cv2.INTER_CUBIC)
for k, v in Om.items():
    if k in R or k.startswith('pupil'): cv2.circle(W, q(v), 5, (0, 0, 255), -1, cv2.LINE_AA)
for img, t in ((sheet, 'reference: its points green, ours red'), (W, 'ours: its points')):
    cv2.rectangle(img, (0, 0), (len(t) * 11 + 10, 26), (0, 0, 0), -1)
    cv2.putText(img, t, (5, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
cv2.imwrite(f'{OUT}/sheet-points.png', np.concatenate([sheet, W], 1))
with open(f'{OUT}/report.txt', 'a', encoding='utf-8') as fh: fh.write('\n'.join(lines) + '\n')
print('\n'.join(lines))
