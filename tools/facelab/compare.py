"""Face harness, the comparison half (tools/facelab/facelab.mjs renders ours and runs this).

Compares a render of a hero's head with a reference picture, feature by feature. MediaPipe's face mesh (478
landmarks) runs on both, so they are measured alike; where it misreads ours (the chin under a beard) the model's own
point is used instead (points.json, projected by the renderer), and the face's outline comes from our skin's own
silhouette and its depth (the jaw standing in front of the neck), not from the detector. Ours is aligned onto the
reference by the eye corners alone (a similarity: scale, turn, shift), so whatever else is off shows as a proportion
error. Every crop is zoomed to the same scale on both, so they can be compared up close. Writes, into the out dir:
  sheet-<feature>.png  eyes, nose, mouth, face, head: reference | ours | overlay (ours blended over the reference,
                       the reference's landmarks green, ours red, a line from each to its match)
  sheet-outline.png    the face's outline from the eyes down: the reference's (green) against ours (red)
  sheet-hair.png       the hair's outline: reference only red, ours only blue, both white
  report.txt/.json     proportions as shares of the distance between the eye centres, the reference's beside ours;
                       each feature's mean landmark error; the outline's half-widths by height; the brows (the dark
                       band above each eye, found the same way in both pictures); the hair's overlap
python compare.py <reference> <out dir> [tag]
"""
import sys, json
import cv2, numpy as np
import mediapipe as mp

REF, OUT = sys.argv[1], sys.argv[2]
TAG = sys.argv[3] if len(sys.argv) > 3 else ''
Z = 4  # how far the reference's pixels are zoomed (each sheet sets its own, about 800 px across)

OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
GROUPS = {
    'brows': [46, 53, 52, 65, 55, 70, 63, 105, 66, 107, 276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
    'eyes': [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    'nose': [168, 6, 197, 195, 5, 4, 1, 2, 98, 327, 64, 294, 129, 358, 48, 278, 102, 331],
    'mouth': [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 13, 14],
    'jaw': [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
}
# zoomed crops: the landmarks they frame, and a margin (shares of the distance between the eyes)
SHEETS = {
    'eyes': (GROUPS['brows'] + GROUPS['eyes'], 0.18),
    'nose': (GROUPS['nose'] + [133, 362], 0.15),
    'mouth': (GROUPS['mouth'] + [152, 2], 0.2),
    'face': (OVAL, 0.12),
    'head': (OVAL, 1.1),
}


def landmarks(img, what):
    """the landmarks in the image's pixels; a small face (a full-body shot) is looked for again in zoomed crops of the image's upper middle"""
    h, w = img.shape[:2]
    tries = [(0, 0, w, h)] + [(int(w * a), int(h * b), int(w * (a + s)), int(h * (b + s))) for s in (0.5, 0.35) for a, b in ((0.25, 0), (0.325, 0), (0.25, 0.1))]
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True, max_num_faces=1, min_detection_confidence=0.3) as fm:
        for x0, y0, x1, y1 in tries:
            c = img[y0:min(h, y1), x0:min(w, x1)]
            k = 900 / max(c.shape[:2])
            c = cv2.resize(c, (int(c.shape[1] * k), int(c.shape[0] * k)), interpolation=cv2.INTER_CUBIC)
            r = fm.process(cv2.cvtColor(c, cv2.COLOR_BGR2RGB))
            if r.multi_face_landmarks:
                ch, cw = c.shape[:2]
                return np.array([[x0 + p.x * cw / k, y0 + p.y * ch / k] for p in r.multi_face_landmarks[0].landmark], np.float64)
    raise SystemExit(f'no face found in {what}')


def eye_centre(L, side):
    return L[468] if side == 'r' else L[473]


ref = cv2.imread(REF)
ours = cv2.imread(f'{OUT}/ours.png')
hair = cv2.imread(f'{OUT}/ours-hair.png', cv2.IMREAD_GRAYSCALE)
LR, LO = landmarks(ref, 'the reference'), landmarks(ours, 'ours')
# the model's own points where the detector misreads it (the chin under a beard), from render.mjs
PTS = json.load(open(f'{OUT}/points.json'))
sanity = {k: float(np.linalg.norm(LO[i] - np.array(PTS[k]))) for k, i in (('chin', 152), ('pupilR', 468), ('pupilL', 473))}
LO[152] = PTS['chin']
face_mask = cv2.imread(f'{OUT}/ours-face.png', cv2.IMREAD_GRAYSCALE)

# ours onto the reference by the eye corners
src = LO[[33, 133, 362, 263]].astype(np.float32); dst = LR[[33, 133, 362, 263]].astype(np.float32)
M, _ = cv2.estimateAffinePartial2D(src, dst)
LOa = (np.c_[LO, np.ones(len(LO))] @ M.T)
iod = np.linalg.norm(eye_centre(LR, 'r') - eye_centre(LR, 'l'))


def measures(L):
    """proportions as shares of the distance between the eye centres (the face upright: y down)"""
    e = np.linalg.norm(eye_centre(L, 'r') - eye_centre(L, 'l'))
    d = lambda a, b: np.linalg.norm(L[a] - L[b]) / e
    dy = lambda a, b: (L[b][1] - L[a][1]) / e
    return {
        'eye width': (d(33, 133) + d(362, 263)) / 2,
        'eye opening': (d(159, 145) + d(386, 374)) / 2,
        'inner eye gap': d(133, 362),
        'brow above eye (mid)': (dy(105, 159) + dy(334, 386)) / 2,
        'brow above eye (inner)': (dy(107, 133) + dy(336, 362)) / 2,
        'brow above eye (outer)': (dy(70, 33) + dy(300, 263)) / 2,
        'brow length': (d(70, 107) + d(300, 336)) / 2,
        'nose length (nasion-base)': dy(168, 2),
        'nose width (alae)': d(98, 327),
        'eyes to mouth': dy(168, 13) - dy(168, 168),
        'mouth width': d(61, 291),
        'upper lip height': dy(0, 13),
        'lower lip height': dy(14, 17),
        'mouth to chin': dy(13, 152),
        'face width (cheeks)': d(234, 454),
        'jaw width (angles)': d(172, 397),
        'chin width': d(148, 377),
        'face height (10-152)': dy(10, 152),
    }


mr, mo = measures(LR), measures(LO)
lines = [f'{TAG}  reference vs ours (shares of the distance between the eye centres; diff = ours - ref)', '']
for k in mr:
    lines.append(f'{k:28s} ref {mr[k]:6.3f}   ours {mo[k]:6.3f}   diff {mo[k] - mr[k]:+6.3f}  ({(mo[k] / mr[k] - 1) * 100:+5.0f}%)')
lines.append('')
lines.append('mean landmark error after aligning on the eye corners (shares of the eye distance):')
err = {}
for g, idx in GROUPS.items():
    err[g] = float(np.mean(np.linalg.norm(LOa[idx] - LR[idx], axis=1)) / iod)
    lines.append(f'  {g:8s} {err[g]:.3f}')
lines.append(f'  {"all":8s} {np.mean(list(err.values())):.3f}')
iod_o = np.linalg.norm(LO[468] - LO[473])
lines.append("detector on ours vs the model's own points (eye distances): " + ', '.join(f'{k} {v / iod_o:.3f}' for k, v in sanity.items()) + "  (the chin uses the model's)")


def crop_box(idx, margin):
    pts = LR[idx]
    x0, y0 = pts.min(0) - margin * iod; x1, y1 = pts.max(0) + margin * iod
    return int(x0), int(y0), int(x1), int(y1)


def warp_ours(img, box, interp=cv2.INTER_AREA):
    """ours, aligned onto the reference, over the crop `box` of the reference at zoom Z"""
    x0, y0, x1, y1 = box
    A = M.copy() * Z; A[0, 2] -= x0 * Z; A[1, 2] -= y0 * Z
    return cv2.warpAffine(img, A, ((x1 - x0) * Z, (y1 - y0) * Z), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=(140, 140, 140))


def zoom_ref(box):
    x0, y0, x1, y1 = box
    return cv2.resize(ref[max(0, y0):y1, max(0, x0):x1], ((x1 - x0) * Z, (y1 - y0) * Z), interpolation=cv2.INTER_CUBIC)


def to_crop(P, box):
    return ((P - np.array(box[:2])) * Z).astype(int)


def label(img, text):
    cv2.rectangle(img, (0, 0), (len(text) * 11 + 10, 26), (0, 0, 0), -1)
    cv2.putText(img, text, (5, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    return img


for name, (idx, margin) in SHEETS.items():
    box = crop_box(idx, margin)
    # (each crop zoomed to about 800 px across)
    Z = max(2, round(800 / (box[2] - box[0])))
    a, b = zoom_ref(box), warp_ours(ours, box)
    over = cv2.addWeighted(a, 0.5, b, 0.5, 0)
    pr, po = to_crop(LR, box), to_crop(LOa, box)
    show = idx if name != 'head' else OVAL + GROUPS['brows'] + GROUPS['eyes'] + GROUPS['nose'] + GROUPS['mouth']
    r = max(2, Z // 2)
    for i in show:
        cv2.line(over, tuple(pr[i]), tuple(po[i]), (0, 255, 255), 1, cv2.LINE_AA)
        cv2.circle(over, tuple(pr[i]), r, (0, 220, 0), -1, cv2.LINE_AA)
        cv2.circle(over, tuple(po[i]), r, (0, 0, 255), -1, cv2.LINE_AA)
    sheet = np.concatenate([label(a.copy(), 'reference'), label(b.copy(), 'ours'), label(over, 'overlay: ref green, ours red')], 1)
    # (not wider than 2400 px)
    if sheet.shape[1] > 2400: sheet = cv2.resize(sheet, (2400, int(sheet.shape[0] * 2400 / sheet.shape[1])), interpolation=cv2.INTER_AREA)
    cv2.imwrite(f'{OUT}/sheet-{name}.png', sheet)

# the hair's outline: the reference's dark pixels (hair, not the grey backdrop or skin) outside the face's oval and
# above the jaw, against ours (its hair pass) aligned the same way
box = crop_box(OVAL, 1.1)
Z = max(2, round(800 / (box[2] - box[0])))
x0, y0, x1, y1 = box
hsv = cv2.cvtColor(zoom_ref(box), cv2.COLOR_BGR2HSV)
mref = (hsv[..., 2] < 95).astype(np.uint8)
oval = np.zeros(mref.shape, np.uint8); cv2.fillPoly(oval, [to_crop(LR[OVAL], box)], 1)
# (below the chin it's the collar's fur, not hair)
limit = np.zeros(mref.shape, np.uint8); limit[: int((LR[152][1] + 0.25 * iod - y0) * Z)] = 1
mref = mref * (1 - oval) * limit
mref = cv2.morphologyEx(mref, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
mo_ = (warp_ours(hair, box, cv2.INTER_LINEAR) > 110).astype(np.uint8) * (1 - oval) * limit
mo_ = cv2.morphologyEx(mo_, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
inter, union = int((mref & mo_).sum()), int((mref | mo_).sum())
vis = np.zeros(mref.shape + (3,), np.uint8)
vis[(mref == 1) & (mo_ == 0)] = (0, 0, 255); vis[(mref == 0) & (mo_ == 1)] = (255, 120, 0); vis[(mref == 1) & (mo_ == 1)] = (255, 255, 255)
cv2.polylines(vis, [to_crop(LR[OVAL], box)], True, (0, 200, 0), 1, cv2.LINE_AA)
a = zoom_ref(box)
cv2.imwrite(f'{OUT}/sheet-hair.png', np.concatenate([label(a, 'reference'), label(warp_ours(ours, box), 'ours'), label(vis, 'hair: ref only red, ours only blue, both white')], 1))
# where ours is short of the reference's outline or past it, by side: rows of the mask's width
rows = []
for yy in range(0, mref.shape[0], max(1, mref.shape[0] // 12)):
    def span(m):
        xs = np.nonzero(m[yy])[0]
        return (xs.min() / Z / iod, xs.max() / Z / iod) if len(xs) else None
    rows.append((yy / Z / iod, span(mref), span(mo_)))
lines.append('')
lines.append(f'hair outline overlap (IoU) {inter / max(1, union):.3f}   ref-only {int(((mref == 1) & (mo_ == 0)).sum()) / max(1, union):.3f}   ours-only {int(((mref == 0) & (mo_ == 1)).sum()) / max(1, union):.3f}')
lines.append('hair width by height (eye distances from the crop top: left..right, ref | ours):')
for yy, s1, s2 in rows:
    f = lambda s: f'{s[0]:5.2f}..{s[1]:5.2f}' if s else '     --     '
    lines.append(f'  {yy:5.2f}   {f(s1)} | {f(s2)}')
# --- the face's outline from the eyes down: the reference's oval of landmarks against ours (its skin's own silhouette)
box = crop_box(OVAL, 0.3)
Z = max(2, round(800 / (box[2] - box[0])))
x0, y0, x1, y1 = box
fm = (warp_ours(face_mask, box, cv2.INTER_LINEAR) > 110).astype(np.uint8)
po = to_crop(LR[OVAL], box)
eye_y = (eye_centre(LR, 'r')[1] + eye_centre(LR, 'l')[1]) / 2
mid_x = (eye_centre(LR, 'r')[0] + eye_centre(LR, 'l')[0]) / 2


def oval_span(yref):
    """where a row crosses the reference's oval (its polygon)"""
    xs, P = [], LR[OVAL]
    for i in range(len(P)):
        (xa, ya), (xb, yb) = P[i], P[(i + 1) % len(P)]
        if (ya - yref) * (yb - yref) <= 0 and ya != yb:
            xs.append(xa + (yref - ya) * (xb - xa) / (yb - ya))
    return (min(xs), max(xs)) if len(xs) >= 2 else None


dep = warp_ours(cv2.imread(f'{OUT}/ours-depth.png', cv2.IMREAD_GRAYSCALE), box, cv2.INTER_NEAREST).astype(np.int32)
dep[fm == 0] = 0


def mask_span(yref):
    """our face's edge on a row, out from the middle each way: where its skin ends, or where its depth jumps back
    (the jaw standing in front of the neck: the outline a photo shows)"""
    r = int((yref - y0) * Z)
    if r < 0 or r >= dep.shape[0]: return None
    row, c0, step = dep[r], int((mid_x - x0) * Z), max(1, Z)
    if row[c0] == 0: return None
    on = np.nonzero(row)[0]
    edge = []
    # (in from the outside: the first jump nearer is the jaw over the neck; none before the middle, the skin's own edge)
    for sgn, start in ((-1, on.min()), (1, on.max())):
        c, found = start, start
        while (c - c0) * sgn > step:
            nxt = c - sgn * step
            if row[nxt] - row[c] >= 4: found = nxt; break
            c = nxt
        edge.append(x0 + found / Z)
    return tuple(edge)


lines.append('')
lines.append('face outline from the eye line down (eye distances below it): half-width left | right of the middle, ref vs ours')
chin_ref = (LR[152][1] - eye_y) / iod
for k in np.arange(0, chin_ref + 0.01, 0.2):
    yr = eye_y + k * iod
    r_, o_ = oval_span(yr), mask_span(yr)
    f = lambda sp: f'{(mid_x - sp[0]) / iod:5.2f} | {(sp[1] - mid_x) / iod:5.2f}' if sp else '    --      '
    lines.append(f'  {k:4.1f}   ref {f(r_)}   ours {f(o_)}')
lines.append(f'  chin below the eye line: ref {chin_ref:.2f}, ours {(LOa[152][1] - eye_y) / iod:.2f}')
# (ours as the points found row by row, from the eye line to the chin)
edge_pts = []
for yr in np.arange(eye_y, LOa[152][1], 1.0 / Z * 3):
    sp = mask_span(yr)
    if sp: edge_pts += [(sp[0], yr), (sp[1], yr)]
cnt = [np.array([[int((x - x0) * Z), int((y - y0) * Z)] for x, y in edge_pts], np.int32).reshape(-1, 1, 2)]
ov = zoom_ref(box)
cv2.polylines(ov, [po], True, (0, 220, 0), 2, cv2.LINE_AA)
for q in cnt[0]: cv2.circle(ov, tuple(q[0]), 2, (0, 0, 255), -1)
cv2.circle(ov, tuple(to_crop(LOa, box)[152]), 6, (0, 0, 255), -1); cv2.circle(ov, tuple(po[OVAL.index(152)]), 6, (0, 220, 0), -1)
ours_c = warp_ours(ours, box)
for q in cnt[0]: cv2.circle(ours_c, tuple(q[0]), 2, (0, 0, 255), -1)
cv2.imwrite(f'{OUT}/sheet-outline.png', np.concatenate([label(ov, 'face outline: ref green, ours red'), label(ours_c, 'ours')], 1))

# --- the brows, found the same way in both: the dark band above each eye, column by column
box = crop_box(SHEETS['eyes'][0], SHEETS['eyes'][1])
Z = max(2, round(800 / (box[2] - box[0])))
x0, y0, x1, y1 = box


def brow_band(img, side):
    """the dark band between the eye's corners (a little past each), from just over the eye to well above it"""
    oc, ic = (LR[33], LR[133]) if side == 'r' else (LR[263], LR[362])
    xa, xb = sorted([oc[0], ic[0]]); xa -= 0.12 * iod; xb += 0.12 * iod
    ec = eye_centre(LR, side)
    ya, yb = ec[1] - 0.65 * iod, ec[1] - 0.1 * iod
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    ca, cb, ra, rb = int((xa - x0) * Z), int((xb - x0) * Z), int((ya - y0) * Z), int((yb - y0) * Z)
    ra = max(0, ra)
    reg = g[ra:rb, ca:cb]
    thr = np.median(reg) * 0.78
    tops, bots, cols = [], [], []
    for c in range(reg.shape[1]):
        d = np.nonzero(reg[:, c] < thr)[0]
        if len(d) < 2: continue
        # (the longest run of dark rows in the column)
        runs = np.split(d, np.nonzero(np.diff(d) > 2)[0] + 1); run = max(runs, key=len)
        tops.append(run[0]); bots.append(run[-1]); cols.append(c)
    if not cols: return None
    to_y = lambda r: (ra + r) / Z + y0
    tops, bots = np.array(tops, float), np.array(bots, float)
    n = len(cols); k = max(1, n // 6)
    # (the right brow's inner end is on the image's right)
    inner, outer = (slice(n - k, n), slice(0, k)) if side == 'r' else (slice(0, k), slice(n - k, n))
    h = lambda sl: (ec[1] - to_y((tops[sl] + bots[sl]) / 2).mean()) / iod
    return {'height': (ec[1] - to_y((tops + bots) / 2).mean()) / iod, 'thick': ((bots - tops).mean() / Z) / iod, 'inner': h(inner), 'outer': h(outer)}


lines.append('')
lines.append('brows (the dark band above each eye; eye distances): its middle above the eye centre, thickness, inner and outer end heights')
ra_, oa_ = zoom_ref(box), warp_ours(ours, box)
for side in ('r', 'l'):
    br, bo = brow_band(ra_, side), brow_band(oa_, side)
    f = lambda b: f"h {b['height']:.3f} thick {b['thick']:.3f} inner {b['inner']:.3f} outer {b['outer']:.3f}" if b else 'not found'
    lines.append(f'  {"right" if side == "r" else "left "}  ref  {f(br)}')
    lines.append(f'         ours {f(bo)}')
open(f'{OUT}/report.txt', 'w').write('\n'.join(lines))
json.dump({'measures_ref': mr, 'measures_ours': mo, 'err': err, 'hair_iou': inter / max(1, union)}, open(f'{OUT}/report.json', 'w'), indent=1)
print('\n'.join(lines))
