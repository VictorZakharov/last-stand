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
  sheet-tone.png       appearance: ours at the reference's resolution, warped onto its landmarks, the colour
                       difference and the regions measured; sheet-likeness.png both heads at that resolution
  sheet-hairflow.png   the direction the hair's strands run, cell by cell; sheet-views.png the other views
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
                return np.array([[x0 + p.x * cw / k, y0 + p.y * ch / k, p.z * cw / k] for p in r.multi_face_landmarks[0].landmark], np.float64)
    raise SystemExit(f'no face found in {what}')


def eye_centre(L, side):
    return L[468] if side == 'r' else L[473]


ref = cv2.imread(REF)
ours = cv2.imread(f'{OUT}/ours.png')
hair = cv2.imread(f'{OUT}/ours-hair.png', cv2.IMREAD_GRAYSCALE)
LR3, LO3 = landmarks(ref, 'the reference'), landmarks(ours, 'ours')
LR, LO = LR3[:, :2].copy(), LO3[:, :2].copy()
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

# --- the face's sides as the pictures show them: the skin and beard the hair leaves in view, found alike on both (the
# reference's warm, light region round its cheeks, the hair far darker; ours its skin where no hair covers it, the jaw
# where it stands in front of the neck). A face whose sides run straight down from the temples to the jaw's angles reads
# square and lean; one widest at the cheekbones, curving in above and below, reads round and swollen
hsv_r = cv2.cvtColor(zoom_ref(box), cv2.COLOR_BGR2HSV)
skin_r = (((hsv_r[..., 0] < 25) | (hsv_r[..., 0] > 165)) & (hsv_r[..., 1] > 50) & (hsv_r[..., 2] > 105)).astype(np.uint8)
skin_r = cv2.morphologyEx(skin_r, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
_, lab_r = cv2.connectedComponents(skin_r)
seeds = [lab_r[q[1], q[0]] for q in to_crop(LR[[50, 280, 205, 425, 101, 330]], box) if 0 <= q[1] < lab_r.shape[0] and 0 <= q[0] < lab_r.shape[1]]
seeds = [k for k in seeds if k]
vis_r = (lab_r == max(set(seeds), key=seeds.count)).astype(np.uint8) if seeds else np.zeros_like(skin_r)
hair_o = warp_ours(hair, box, cv2.INTER_LINEAR) > 60
dep_vis = dep.copy(); dep_vis[hair_o] = 0


def vis_span(yref, who):
    r = int((yref - y0) * Z)
    if who == 'ours':
        if r < 0 or r >= dep_vis.shape[0] or not dep_vis[r].any(): return None
        global dep
        keep, dep = dep, dep_vis
        try: return mask_span(yref)
        finally: dep = keep
    if r < 0 or r >= vis_r.shape[0]: return None
    on = np.nonzero(vis_r[r])[0]
    return (x0 + on.min() / Z, x0 + on.max() / Z) if on.size else None


lines.append('')
lines.append("the face's sides as the pictures show them (skin and beard in view; eye distances from the middle, rows below the eye line)")
sides = {}
for who in ('ref', 'ours'):
    pts = []
    for k in np.arange(-0.5, 1.95, 0.1):
        sp = vis_span(eye_y + k * iod, who)
        if sp: pts.append((k, (mid_x - sp[0]) / iod, (sp[1] - mid_x) / iod))
    sides[who] = np.array(pts) if pts else np.zeros((0, 3))
for k in np.arange(-0.5, 1.95, 0.1):
    f = lambda who: next((f'{a:5.2f} | {b:5.2f}' for kk, a, b in sides[who] if abs(kk - k) < 1e-6), '     --     ')
    lines.append(f'  {k:+4.1f}   ref {f("ref")}   ours {f("ours")}')


def straight(P, lo=-0.4, hi=1.1):
    """each side from the temple to the jaw's angle: a line fitted to it, its slope (degrees in from upright, going down) and
    how far it bows out of that line (eye-distance hundredths, the most and the mean)"""
    out = []
    for c in (1, 2):
        Q = P[(P[:, 0] >= lo - 1e-6) & (P[:, 0] <= hi + 1e-6)]
        if len(Q) < 5: out.append(None); continue
        b, a = np.polyfit(Q[:, 0], Q[:, c], 1)
        dev = Q[:, c] - (a + b * Q[:, 0])
        out.append((float(np.degrees(np.arctan(-b))), float(dev.max() * 100), float(np.abs(dev).mean() * 100)))
    return out


for who in ('ref', 'ours'):
    st = straight(sides[who])
    f = lambda t: f'slope {t[0]:+5.1f} deg, bows out {t[1]:4.1f} (mean off {t[2]:3.1f})' if t else '--'
    lines.append(f"  {who:4s} sides temple to jaw angle (-0.4..1.1): his right {f(st[0])}; his left {f(st[1])}")
w_at = lambda who, k: next((a + b for kk, a, b in sides[who] if abs(kk - k) < 1e-6), float('nan'))
for who in ('ref', 'ours'):
    lines.append(f"  {who:4s} full width at the temples (-0.4) {w_at(who, -0.4):.2f}, cheekbones (+0.3) {w_at(who, 0.3):.2f}, mouth (+1.0) {w_at(who, 1.0):.2f}, "
                 f"jaw (+1.3) {w_at(who, 1.3):.2f}, chin (+1.6) {w_at(who, 1.6):.2f}; jaw over temples {w_at(who, 1.0) / w_at(who, -0.4):.2f}")
sv = zoom_ref(box)
for who, col in (('ref', (0, 220, 0)), ('ours', (0, 0, 255))):
    for kk, a, b in sides[who]:
        yy = int((eye_y + kk * iod - y0) * Z)
        for xx in (mid_x - a * iod, mid_x + b * iod): cv2.circle(sv, (int((xx - x0) * Z), yy), 4, col, -1)
so = warp_ours(ours, box)
so[dep_vis > 0] = (so[dep_vis > 0] * 0.6 + np.array([0, 0, 100])).astype(np.uint8)
cv2.imwrite(f'{OUT}/sheet-sides.png', np.concatenate([label(sv, "face's sides in view: ref green, ours red"), label(so, 'ours, its face in view tinted')], 1))

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

# --- appearance: proportions can match while the look doesn't (black brows, a beard like a mask, flat hair). Ours is
# brought down to the reference's own resolution (a small face in a full-body shot: finer detail than it has would
# only mislead) and warped feature by feature onto its landmarks, then compared region by region in CIELAB.
s_ = float(np.sqrt(abs(np.linalg.det(M[:, :2]))))
small = cv2.resize(ours, None, fx=s_, fy=s_, interpolation=cv2.INTER_AREA)
Ms = M.copy(); Ms[:, :2] /= s_
RH, RW = ref.shape[:2]
ours_r = cv2.warpAffine(small, Ms, (RW, RH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
hair_r = cv2.warpAffine(cv2.resize(hair, None, fx=s_, fy=s_, interpolation=cv2.INTER_AREA), Ms, (RW, RH), flags=cv2.INTER_LINEAR)
# the morph works 4x up from the reference's pixels (so the triangles' edges don't step), on interior landmarks only: the
# detector's jaw points on ours are the ones it misreads under a beard (the chin is the model's own)
ZM = 4
up = lambda im: cv2.resize(im, None, fx=ZM, fy=ZM, interpolation=cv2.INTER_CUBIC)
ref4, ours4 = up(ref), up(ours_r)
keep = [i for i in range(len(LR)) if i not in GROUPS['jaw'] or i == 152]


def delaunay(P, idx):
    x0_, y0_ = P[idx].min(0) - 10; x1_, y1_ = P[idx].max(0) + 10
    sd = cv2.Subdiv2D((int(x0_), int(y0_), int(x1_ - x0_) + 1, int(y1_ - y0_) + 1))
    for i in idx: sd.insert((float(P[i, 0]), float(P[i, 1])))
    Q, tris = P[idx], []
    for t in sd.getTriangleList():
        ids = [idx[int(np.argmin(np.sum((Q - t[2 * k:2 * k + 2]) ** 2, 1)))] for k in range(3)]
        if len(set(ids)) == 3: tris.append(ids)
    return tris


def morph(img, src, dst, tris):
    out = img.copy()
    for a, b, c in tris:
        S, D = np.float32([src[a], src[b], src[c]]), np.float32([dst[a], dst[b], dst[c]])
        x, y, w, h = cv2.boundingRect(D)
        x, y = max(0, x), max(0, y); w, h = min(w, out.shape[1] - x), min(h, out.shape[0] - y)
        if w <= 0 or h <= 0: continue
        A = cv2.getAffineTransform(S, D - np.float32([x, y]))
        patch = cv2.warpAffine(img, A, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        m = np.zeros((h, w), np.uint8); cv2.fillConvexPoly(m, np.int32(np.round(D - [x, y])), 1)
        out[y:y + h, x:x + w][m == 1] = patch[m == 1]
    return out


LR4, LO4 = LR * ZM, LOa * ZM
morphed = morph(ours4, LO4, LR4, delaunay(LR4, keep))
lab = lambda im: cv2.cvtColor(im.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)
labR, labO = lab(ref4), lab(morphed)
# the eye frame: from the right eye's centre to the left's, y down, in eye distances
ec = (eye_centre(LR4, 'r') + eye_centre(LR4, 'l')) / 2
ex_ = (eye_centre(LR4, 'l') - eye_centre(LR4, 'r')) / (iod * ZM); ey_ = np.array([-ex_[1], ex_[0]])
F_ = lambda u, v: ec + (u * ex_ + v * ey_) * iod * ZM
chin_v = float(np.dot(LR4[152] - ec, ey_) / (iod * ZM))


def mask_poly(P):
    m = np.zeros(labR.shape[:2], np.uint8); cv2.fillPoly(m, [np.int32(np.round(P))], 1); return m


def mask_circle(c, r):
    m = np.zeros(labR.shape[:2], np.uint8); cv2.circle(m, tuple(np.int32(np.round(c))), int(round(r)), 1, -1); return m


ring = lambda i0: np.mean([np.linalg.norm(LR4[i] - LR4[i0]) for i in range(i0 + 1, i0 + 5)])
EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]
EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]
LOW_R, LOW_L = [33, 7, 163, 144, 145, 153, 154, 155, 133], [263, 249, 390, 373, 374, 380, 381, 382, 362]
LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
band = lambda ids, dv: np.r_[LR4[ids], (LR4[ids] + ey_ * dv * iod * ZM)[::-1]]
iris_m = {s: mask_circle(LR4[i], ring(i) * 0.85) for s, i in (('R', 468), ('L', 473))}
REG = {
    'forehead': mask_poly([F_(-0.35, -0.85), F_(0.35, -0.85), F_(0.35, -0.55), F_(-0.35, -0.55)]),
    'brow R': mask_poly(LR4[[70, 63, 105, 66, 107, 55, 65, 52, 53, 46]]),
    'brow L': mask_poly(LR4[[300, 293, 334, 296, 336, 285, 295, 282, 283, 276]]),
    'iris R': iris_m['R'], 'iris L': iris_m['L'],
    # (the iris's own colour, between the pupil and its rim: an iris can read black with the region's mean right)
    'iris ring R': mask_circle(LR4[468], ring(468) * 0.85) * (1 - mask_circle(LR4[468], ring(468) * 0.45)),
    'iris ring L': mask_circle(LR4[473], ring(473) * 0.85) * (1 - mask_circle(LR4[473], ring(473) * 0.45)),
    'sclera R': mask_poly(LR4[EYE_R]) * (1 - mask_circle(LR4[468], ring(468) * 1.1)),
    'sclera L': mask_poly(LR4[EYE_L]) * (1 - mask_circle(LR4[473], ring(473) * 1.1)),
    'under eye R': mask_poly(band(LOW_R, 0.14)), 'under eye L': mask_poly(band(LOW_L, 0.14)),
    # (the lid between the eye and the brow: shaded under a heavy brow, bright on a flat-lit face)
    'upper lid R': mask_poly(np.r_[LR4[[33, 246, 161, 160, 159, 158, 157, 173, 133]], LR4[[55, 65, 52, 53, 46]]]),
    'upper lid L': mask_poly(np.r_[LR4[[263, 466, 388, 387, 386, 385, 384, 398, 362]], LR4[[285, 295, 282, 283, 276]]]),
    'cheekbone R': mask_circle(LR4[50], 0.1 * iod * ZM), 'cheekbone L': mask_circle(LR4[280], 0.1 * iod * ZM),
    'lower cheek R': mask_circle((LR4[50] + LR4[136]) / 2, 0.09 * iod * ZM), 'lower cheek L': mask_circle((LR4[280] + LR4[365]) / 2, 0.09 * iod * ZM),
    'nose bridge': mask_circle(LR4[197], 0.06 * iod * ZM), 'nose tip': mask_circle(LR4[4], 0.07 * iod * ZM),
    'moustache': mask_poly(LR4[[61, 40, 37, 0, 267, 270, 291, 327, 2, 98]]),
    'lips': mask_poly(LR4[LIPS]),
    'chin': mask_poly(LR4[[91, 181, 84, 17, 314, 405, 321, 400, 377, 152, 148, 176]]),
    'jaw R': mask_circle(LR4[136] * 0.7 + LR4[61] * 0.3, 0.08 * iod * ZM), 'jaw L': mask_circle(LR4[365] * 0.7 + LR4[291] * 0.3, 0.08 * iod * ZM),
    # (the ears, just outside the face's outline at the tragus: how much they stand out, pale, from the hair round them)
    'ear R': mask_circle(LR4[234] - ex_ * 0.12 * iod * ZM, 0.07 * iod * ZM), 'ear L': mask_circle(LR4[454] + ex_ * 0.12 * iod * ZM, 0.07 * iod * ZM),
    'neck': mask_poly([F_(-0.22, chin_v + 0.12), F_(0.22, chin_v + 0.12), F_(0.22, chin_v + 0.35), F_(-0.22, chin_v + 0.35)]),
}
stats = {}
for k, m in REG.items():
    on = m == 1
    if on.sum() < 4: continue
    stats[k] = {'ref': labR[on].mean(0).tolist(), 'ours': labO[on].mean(0).tolist(), 'ref_sd': float(labR[on][:, 0].std()), 'ours_sd': float(labO[on][:, 0].std())}
fl_r, fl_o = stats['forehead']['ref'][0], stats['forehead']['ours'][0]
lines.append('')
lines.append('appearance (CIELAB; ours at the reference\'s resolution, warped onto its landmarks): L lightness 0..100, a green-red, b blue-yellow;')
lines.append('  "vs forehead" is the region\'s lightness minus the forehead\'s (the lighting cancels out), "sd" the spread of its lightness (texture, shading)')
lines.append(f'  {"region":14s} {"ref L    a    b":>17s}   {"ours L    a    b":>17s}   {"dE":>5s}   {"vs forehead ref/ours":>21s}   {"sd ref/ours":>11s}')
dEs = []
for k, s in stats.items():
    r, o = s['ref'], s['ours']
    dE = float(np.linalg.norm(np.subtract(o, r))); dEs.append(dE); s['dE'] = dE
    lines.append(f'  {k:14s} {r[0]:5.1f} {r[1]:5.1f} {r[2]:5.1f}   {o[0]:5.1f} {o[1]:5.1f} {o[2]:5.1f}   {dE:5.1f}   {r[0] - fl_r:+8.1f} / {o[0] - fl_o:+6.1f}   {s["ref_sd"]:5.1f}/{s["ours_sd"]:4.1f}')
lines.append(f'  mean dE over the regions {np.mean(dEs):.1f}')
# --- relief: the light and shade of forms a few mm to a couple of cm across (a cheekbone, a brow ridge, a jaw standing out),
# the skin's fine texture and the broad fall of the light both filtered off: a face whose bones stand out shades strongly
# over them, a smooth one gently. Lightness band-passed (Gaussians of 0.035 and 0.22 eye distances), its spread per region
bp = lambda L: cv2.GaussianBlur(L, (0, 0), 0.035 * iod * ZM) - cv2.GaussianBlur(L, (0, 0), 0.22 * iod * ZM)
reliefR, reliefO = bp(labR[..., 0]), bp(labO[..., 0])
# (ours in clay under the same light, warped the same way: the share of the relief that is the shape, not the paint)
clay_img = cv2.imread(f'{OUT}/ours-clay.png')
reliefC = None
if clay_img is not None:
    clay4 = up(cv2.warpAffine(cv2.resize(clay_img, None, fx=s_, fy=s_, interpolation=cv2.INTER_AREA), Ms, (RW, RH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE))
    reliefC = bp(lab(morph(clay4, LO4, LR4, delaunay(LR4, keep)))[..., 0])
RREG = {
    'forehead': REG['forehead'], 'temple R': mask_circle(F_(-0.95, -0.35), 0.13 * iod * ZM), 'temple L': mask_circle(F_(0.95, -0.35), 0.13 * iod * ZM),
    'brow R': REG['brow R'], 'brow L': REG['brow L'], 'upper lid R': REG['upper lid R'], 'upper lid L': REG['upper lid L'],
    'under eye R': REG['under eye R'], 'under eye L': REG['under eye L'],
    'cheekbone R': mask_circle(F_(-0.72, 0.35), 0.16 * iod * ZM), 'cheekbone L': mask_circle(F_(0.72, 0.35), 0.16 * iod * ZM),
    'cheek R': mask_circle(F_(-0.7, 0.85), 0.16 * iod * ZM), 'cheek L': mask_circle(F_(0.7, 0.85), 0.16 * iod * ZM),
    'beside nose R': mask_circle(F_(-0.3, 0.45), 0.1 * iod * ZM), 'beside nose L': mask_circle(F_(0.3, 0.45), 0.1 * iod * ZM),
    'jaw R': REG['jaw R'], 'jaw L': REG['jaw L'], 'chin': REG['chin'],
}
lines.append('')
lines.append("relief (lightness of forms 2-14 mm across, the texture and the light's broad fall filtered off): its spread per region,")
lines.append('  ref / ours painted / ours in clay (the shape alone, same light); more: the forms there stand out more, or the paint is blotchier')
rel = []
for k, m in RREG.items():
    on = m == 1
    if on.sum() < 4: continue
    a_, b_ = float(reliefR[on].std()), float(reliefO[on].std()); c_ = float(reliefC[on].std()) if reliefC is not None else float('nan')
    rel.append((k, a_, b_, c_))
    lines.append(f'  {k:14s} {a_:5.2f} / {b_:5.2f} / {c_:5.2f}   painted {b_ / max(a_, 1e-3):4.1f}x, clay {c_ / max(a_, 1e-3):4.1f}x')
lines.append(f'  all regions: ref {np.mean([r[1] for r in rel]):.2f}, ours painted {np.mean([r[2] for r in rel]):.2f}, in clay {np.nanmean([r[3] for r in rel]):.2f}')
vis = lambda R_: cv2.applyColorMap(np.uint8(np.clip(R_ * 6 + 128, 0, 255)), cv2.COLORMAP_TWILIGHT_SHIFTED)
cut_ = crop_box(OVAL, 0.35)
sh_ = lambda R_: cv2.resize(vis(R_)[max(0, cut_[1] * ZM):cut_[3] * ZM, max(0, cut_[0] * ZM):cut_[2] * ZM], (700, int(700 * (cut_[3] - cut_[1]) / (cut_[2] - cut_[0]))), interpolation=cv2.INTER_AREA)
tiles_ = [label(sh_(reliefR), 'relief: reference'), label(sh_(reliefO), 'ours painted')] + ([label(sh_(reliefC), 'ours in clay')] if reliefC is not None else [])
cv2.imwrite(f'{OUT}/sheet-relief.png', np.concatenate(tiles_, 1))
# (the iris's own colour: at a full-body shot's resolution an iris is a few pixels, its mean mixed with the pupil, lashes
# and the lid's shadow; its lightest quarter is the iris itself)
for side in ('R', 'L'):
    on = REG[f'iris ring {side}'] == 1
    if on.sum() >= 8:
        q = lambda L_: (lambda px: px[px[:, 0] >= np.percentile(px[:, 0], 75)].mean(0))(L_[on])
        a_, b_ = q(labR), q(labO)
        lines.append(f'  iris {side} lightest quarter: ref L {a_[0]:4.1f} a {a_[1]:4.1f} b {a_[2]:4.1f}   ours L {b_[0]:4.1f} a {b_[1]:4.1f} b {b_[2]:4.1f}')
# --- the beard: hairs on skin, not a flat block. Its lightness percentiles (the darkest hairs .. the skin showing between
# them) region by region, then the lightness down each cheek into it: where it starts and how softly (a block's edge is hard)
lines.append('')
lines.append('beard: lightness percentiles 10 / 50 / 90 (its dark hairs .. the skin between them), ref | ours')
for k in ('moustache', 'chin', 'jaw R', 'jaw L', 'lower cheek R', 'lower cheek L'):
    on = REG[k] == 1
    if on.sum() < 8: continue
    pr, po = np.percentile(labR[on][:, 0], [10, 50, 90]), np.percentile(labO[on][:, 0], [10, 50, 90])
    lines.append(f'  {k:14s} {pr[0]:5.1f} {pr[1]:5.1f} {pr[2]:5.1f}   |   {po[0]:5.1f} {po[1]:5.1f} {po[2]:5.1f}   spread {pr[2] - pr[0]:5.1f} | {po[2] - po[0]:5.1f}')
blurL = lambda L_: cv2.GaussianBlur(L_, (0, 0), 0.03 * iod * ZM)
bR_, bO_ = blurL(labR[..., 0]), blurL(labO[..., 0])
at_ = lambda im, u, v: (lambda p: float(im[int(np.clip(round(p[1]), 0, im.shape[0] - 1)), int(np.clip(round(p[0]), 0, im.shape[1] - 1))]))(F_(u, v))
cols_, rows_ = (-0.75, -0.55, 0.55, 0.75), np.round(np.arange(0.3, min(chin_v, 2.2) + 1e-6, 0.1), 2)
lines.append("beard's edge down the cheek: lightness minus the forehead's at u eye distances from the middle (- his right), by v below the eye line")
lines.append('  v      ' + '   '.join(f'u {u:+.2f} ref / ours' for u in cols_))
prof = {u: ([at_(bR_, u, v) - fl_r for v in rows_], [at_(bO_, u, v) - fl_o for v in rows_]) for u in cols_}
for i, v in enumerate(rows_):
    lines.append(f'  {v:4.1f}   ' + '   '.join(f'     {prof[u][0][i]:+6.1f} / {prof[u][1][i]:+6.1f}' for u in cols_))
def edge_(p):
    # (from the cheek's skin, the mean over v 0.3..0.5, down to the beard's darkest: where it's a quarter, half and three quarters down)
    p = np.asarray(p); top = p[:3].mean(); lo_i = int(np.argmin(p)); bot = p[lo_i]
    if top - bot < 4: return None
    cross = lambda f: next((rows_[i] for i in range(lo_i + 1) if p[i] <= top - f * (top - bot)), float('nan'))
    return cross(0.25), cross(0.5), cross(0.75), top - bot
for u in cols_:
    er, eo = edge_(prof[u][0]), edge_(prof[u][1])
    show = lambda e: 'no edge' if e is None else f'starts {e[0]:.2f}, half {e[1]:.2f}, 3/4 {e[2]:.2f} (width {e[2] - e[0]:.2f}), drop {e[3]:4.1f}'
    lines.append(f'  u {u:+.2f}: ref {show(er)}   ours {show(eo)}')
# the mouth's width by the lips' colour (the detector places our mouth's corners by its own idea of a mouth: they barely
# moved when our lips widened 13%): out along the eye line from the mouth's middle, the redness (a*) of the reddest pixel
# across the lips, until it falls halfway from the lips' to the skin's beside the mouth
def lip_width(lab_, P):
    c = (P[13] + P[14]) / 2; step = 0.01 * iod * ZM
    S = np.arange(-0.65, 0.651, 0.01)
    def red(s):
        vals = []
        for q in np.linspace(-0.06, 0.06, 7):
            p = c + (s * ex_ + q * ey_) * iod * ZM
            x, y = int(round(p[0])), int(round(p[1]))
            if 0 <= y < lab_.shape[0] and 0 <= x < lab_.shape[1]: vals.append(lab_[y, x, 1])
        return max(vals) if vals else np.nan
    A = cv2.GaussianBlur(np.float32([red(s) for s in S])[None], (0, 0), 1.5)[0]
    lip = np.median(A[np.abs(S) < 0.12]); skin = np.median(A[np.abs(S) > 0.58]); half = (lip + skin) / 2
    ends = []
    for sg in (-1, 1):
        i0 = int(np.argmin(np.abs(S))); i = i0
        while 0 <= i + sg < len(S) and A[i + sg] > half: i += sg
        ends.append(abs(S[i]))
    return sum(ends), lip, skin
labU = cv2.cvtColor(ours4.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)
lw_r, lw_o = lip_width(labR, LR4), lip_width(labU, LO4)
lines.append('')
lines.append(f"mouth width by the lips' colour (eye distances): ref {lw_r[0]:.3f}  ours {lw_o[0]:.3f}  ({(lw_o[0] / lw_r[0] - 1) * 100:+.0f}%)"
             f"   lips' redness a* ref {lw_r[1]:.1f} ours {lw_o[1]:.1f}, beside them ref {lw_r[2]:.1f} ours {lw_o[2]:.1f}")
# the eyes' look: the reference's opening from the detector's lid contour (reliable on a photo), ours from the render's own
# mask of the eyeball that shows (ours-parts.png: on our render the detector draws its idea of an eye, and missed that ours
# was a slot): its width and height (eye distances), its height across it from the inner corner to the outer (shares of its
# tallest: an almond tapers to its corners, a slot stays tall), the iris across against the eye, the white either side of it
# (its area against the iris's)
def profile_(xs, ys, a, ax_, n_):
    t = (xs - a[0]) * ax_[0] + (ys - a[1]) * ax_[1]; h = (xs - a[0]) * n_[0] + (ys - a[1]) * n_[1]
    t0, t1 = t.min(), t.max(); w_ = t1 - t0
    hs = []
    for f in (0.15, 0.3, 0.5, 0.7, 0.85):
        sel = np.abs(t - (t0 + f * w_)) < 0.02 * w_ + 1
        hs.append(float(h[sel].max() - h[sel].min()) if sel.sum() else 0.0)
    return w_, hs
def eye_ref(side):
    P = LR4
    inner, outer, up_, lo_, ic = (133, 33, [173, 157, 158, 159, 160, 161, 246], [155, 154, 153, 145, 144, 163, 7], 468) if side == 'R' else         (362, 263, [398, 384, 385, 386, 387, 388, 466], [382, 381, 380, 374, 373, 390, 249], 473)
    poly = np.r_[P[[inner]], P[up_], P[[outer]], P[lo_[::-1]]]
    m = np.zeros(labR.shape[:2], np.uint8); cv2.fillPoly(m, [np.int32(np.round(poly))], 1)
    ys, xs = np.nonzero(m)
    r_ = np.mean([np.linalg.norm(P[i] - P[ic]) for i in range(ic + 1, ic + 5)])
    return xs, ys, P[ic], r_
parts_ = cv2.imread(f'{OUT}/ours-parts.png')
eyes_o = None
if parts_ is not None:
    pr_ = up(cv2.warpAffine(cv2.resize(parts_, None, fx=s_, fy=s_, interpolation=cv2.INTER_NEAREST), Ms, (RW, RH), flags=cv2.INTER_NEAREST))
    eyes_o = (pr_[..., 0] > 170) & (pr_[..., 1] > 180) & (pr_[..., 2] < 200) & (pr_[..., 2] > 120)
def eye_ours(side):
    if eyes_o is None: return None
    c_ = eye_centre(LR4 / ZM, 'r' if side == 'R' else 'l') * ZM
    n_, lab_n = cv2.connectedComponents(np.uint8(eyes_o))
    best, bd = 0, 1e9
    for k in range(1, n_):
        ys, xs = np.nonzero(lab_n == k)
        if len(xs) < 20: continue
        d = np.hypot(xs.mean() - c_[0], ys.mean() - c_[1])
        if d < bd: bd, best = d, k
    if not best: return None
    ys, xs = np.nonzero(lab_n == best)
    # (the iris: the eyeball's darker pixels; its centre and radius from their spread along the eye line)
    L_ = labU[ys, xs, 0]; dark = L_ < np.percentile(L_, 35) + 0.5 * (np.percentile(L_, 90) - np.percentile(L_, 35)) * 0.4
    cx, cy = xs[dark].mean(), ys[dark].mean()
    t = (xs[dark] - cx) * ex_[0] + (ys[dark] - cy) * ex_[1]
    r_ = (np.percentile(t, 97) - np.percentile(t, 3)) / 2
    return xs, ys, np.array([cx, cy]), r_
lines.append('')
lines.append("eyes' look: the reference's lid contour, ours the eyeball the render shows; width and height (eye distances), height from the inner")
lines.append('  corner to the outer (shares of its tallest), the iris across against the eye, the white either side of it (area against the iris)')
for side in ('R', 'L'):
    row = []
    for e in (eye_ref(side), eye_ours(side)):
        if e is None: row.append(None); continue
        xs, ys, ic_, r_ = e
        inward = -ex_ if side == 'R' else ex_
        a = np.array([xs.mean(), ys.mean()])
        w_, hs = profile_(xs, ys, a, ex_, ey_)
        hm = max(hs) or 1
        # (inner corner first)
        if side == 'L': hs = hs[::-1]
        t = (xs - ic_[0]) * ex_[0] + (ys - ic_[1]) * ex_[1]; rr = np.hypot(xs - ic_[0], ys - ic_[1]); out_ = rr > r_ * 1.05
        nasal = t * (1 if side == 'R' else -1) > 0
        area = np.pi * r_ * r_
        row.append((w_ / (iod * ZM), hm / (iod * ZM), [h / hm for h in hs], 2 * r_ / w_, (out_ & nasal).sum() / area, (out_ & ~nasal).sum() / area))
    if row[0] is None or row[1] is None: continue
    rf, ou = row
    lines.append(f'  {side} width {rf[0]:.3f} / {ou[0]:.3f}   height {rf[1]:.3f} / {ou[1]:.3f}   height across ref ' + ' '.join(f'{h:.2f}' for h in rf[2]) + '   ours ' + ' '.join(f'{h:.2f}' for h in ou[2]))
    lines.append(f'  {side} iris / eye width {rf[3]:.2f} / {ou[3]:.2f}   white inner | outer: ref {rf[4]:.2f} | {rf[5]:.2f}   ours {ou[4]:.2f} | {ou[5]:.2f}')
# a heat map of the colour difference (blurred over about a reference pixel: its noise isn't a difference)
dmap = np.linalg.norm(cv2.GaussianBlur(labO, (0, 0), ZM) - cv2.GaussianBlur(labR, (0, 0), ZM), axis=2)
heat = cv2.applyColorMap(np.uint8(np.clip(dmap / 40 * 255, 0, 255)), cv2.COLORMAP_INFERNO)
box = crop_box(OVAL, 0.45)
bx0, by0, bx1, by1 = [v * ZM for v in box]
crop = lambda im: im[max(0, by0):by1, max(0, bx0):bx1]
regv = crop(ref4).copy()
for k, m in REG.items():
    cs, _ = cv2.findContours(crop(m).copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(regv, cs, -1, (0, 255, 255), 1, cv2.LINE_AA)
zf = max(1, round(600 / regv.shape[1]))
big = lambda im: cv2.resize(im, None, fx=zf, fy=zf, interpolation=cv2.INTER_CUBIC)
cv2.imwrite(f'{OUT}/sheet-tone.png', np.concatenate([label(big(crop(ref4)), 'reference'), label(big(crop(ours4)), 'ours at its resolution'), label(big(crop(morphed)), 'ours warped onto it'),
                                                     label(big(crop(heat)), 'colour difference (dE 0..40)'), label(big(regv), 'regions')], 1))
# the whole head at the reference's resolution, side by side: how alike they look at the detail the reference has
box = crop_box(OVAL, 1.1)
bx0, by0, bx1, by1 = [v * ZM for v in box]
zf = max(1, round(900 / (bx1 - bx0)))
cv2.imwrite(f'{OUT}/sheet-likeness.png', np.concatenate([label(big(crop(ref4)), 'reference'), label(big(crop(ours4)), 'ours at the reference\'s resolution')], 1))

# --- the hair's look: where it frames the forehead (the skin's width above the brows, row by row), how high it stands
# over the head, where it ends at the sides, its tones (dark roots, light crests)
hsvR, hsvO = cv2.cvtColor(ref4, cv2.COLOR_BGR2HSV), cv2.cvtColor(ours4, cv2.COLOR_BGR2HSV)
skin = lambda hv: ((hv[..., 1] > 40) & (hv[..., 2] > 105)).astype(np.uint8)
skR, skO = skin(hsvR), skin(hsvO)
hmR = (hsvR[..., 2] < 95).astype(np.uint8)
hmO = (up(hair_r) > 110).astype(np.uint8)
lines.append('')
lines.append('forehead framed by the hair: the bare skin\'s half-width left | right of the middle, by height above the eye line (eye distances)')


def run_at(m, v):
    """the run of `m` through the middle on the row `v` eye distances below the eye line: its half-widths each way"""
    p = F_(0, v); r, c = int(round(p[1])), int(round(p[0]))
    if r < 0 or r >= m.shape[0] or not m[r, c]: return None
    row = m[r]; a = c; b = c
    while a > 0 and row[a - 1]: a -= 1
    while b < len(row) - 1 and row[b + 1]: b += 1
    return (c - a) / (iod * ZM), (b - c) / (iod * ZM)


frame_rows = []
for v in np.arange(-0.4, -1.45, -0.1):
    a_, b_ = run_at(skR, v), run_at(skO, v)
    f = lambda s: f'{s[0]:4.2f} | {s[1]:4.2f}' if s else ' hair/none '
    frame_rows.append((float(-v), a_, b_))
    lines.append(f'  {-v:4.1f}   ref {f(a_)}   ours {f(b_)}')


def top_of(m):
    """the hair's highest point over the middle third (eye distances above the eye line)"""
    best = None
    for u in np.linspace(-0.4, 0.4, 17):
        for v in np.arange(-2.5, -0.3, 0.01):
            p = F_(u, v); r, c = int(p[1]), int(p[0])
            if 0 <= r < m.shape[0] and 0 <= c < m.shape[1] and m[r, c]:
                best = max(best or 0, -v); break
    return best


def side_end(m, sgn):
    """how far below the eye line the hair reaches beside the face (outside 0.85 eye distances from the middle)"""
    low = None
    for u in np.linspace(0.85, 1.4, 12):
        for v in np.arange(2.6, -0.5, -0.01):
            p = F_(sgn * u, v); r, c = int(p[1]), int(p[0])
            if 0 <= r < m.shape[0] and 0 <= c < m.shape[1] and m[r, c]:
                low = max(low if low is not None else -9, v); break
    return low


lim = np.ones_like(hmR); lim[int(LR4[152][1] + 0.25 * iod * ZM):] = 0
# (not the brows, eyes or beard: only what's outside the face's outline)
oval4 = np.zeros_like(hmR); cv2.fillPoly(oval4, [np.int32(np.round(LR4[OVAL]))], 1)
hmR2 = cv2.morphologyEx(hmR * lim * (1 - oval4), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
hmO = hmO * (1 - oval4)
lines.append(f'hair top above the eye line: ref {top_of(hmR2):.2f}, ours {top_of(hmO):.2f}')
for sgn, nm in ((-1, 'right'), (1, 'left')):
    a_, b_ = side_end(hmR2, sgn), side_end(hmO, sgn)
    lines.append(f'hair ends below the eye line, {nm:5s} side: ref {a_ if a_ is None else round(a_, 2)}, ours {b_ if b_ is None else round(b_, 2)}')
hlR, hlO = labR[..., 0][hmR2 == 1], cv2.cvtColor(ours4.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)[..., 0][hmO == 1]
pc = lambda x: np.percentile(x, [10, 50, 90]) if len(x) else [0, 0, 0]
lines.append('hair lightness percentiles 10/50/90: ref ' + '/'.join(f'{v:.0f}' for v in pc(hlR)) + '   ours ' + '/'.join(f'{v:.0f}' for v in pc(hlO)))
hab = lambda L_, m: L_[m == 1][:, 1:].mean(0) if (m == 1).any() else [0, 0]
lines.append('hair colour a/b: ref ' + '/'.join(f'{v:.1f}' for v in hab(labR, hmR2)) + '   ours ' + '/'.join(f'{v:.1f}' for v in hab(cv2.cvtColor(ours4.astype(np.float32) / 255, cv2.COLOR_BGR2LAB), hmO)))
# (the average can match while the crests are orange and the hollows grey: its light quarter's and dark quarter's colours)
labO4 = cv2.cvtColor(ours4.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)


def tones(L_, m):
    px = L_[m == 1]
    if len(px) < 10: return None
    lo, hi = np.percentile(px[:, 0], [25, 75])
    return px[px[:, 0] >= hi].mean(0), px[px[:, 0] <= lo].mean(0)


tr, to = tones(labR, hmR2), tones(labO4, hmO)
if tr and to:
    f = lambda v: f'L {v[0]:4.1f} a {v[1]:4.1f} b {v[2]:4.1f}'
    lines.append(f'hair crests (light quarter): ref {f(tr[0])}   ours {f(to[0])}')
    lines.append(f'hair hollows (dark quarter): ref {f(tr[1])}   ours {f(to[1])}')

# --- which way the hair runs (its strands' direction, cell by cell, from the structure tensor of the lightness): swept up
# and back off the forehead and waving down the sides, or combed flat; the angle between the two in each cell both have
# hair with a clear direction
def flow(L_, m):
    gx, gy = cv2.Sobel(L_, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(L_, cv2.CV_32F, 0, 1, ksize=3)
    sg = 0.6 * ZM
    jxx, jyy, jxy = (cv2.GaussianBlur(a, (0, 0), sg) for a in (gx * gx, gy * gy, gx * gy))
    return jxx, jyy, jxy


box = crop_box(OVAL, 1.1)
bx0, by0, bx1, by1 = [v * ZM for v in box]
LRl = labR[..., 0]; LOl = cv2.cvtColor(ours4.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)[..., 0]
JR, JO = flow(LRl, hmR2), flow(LOl, hmO)
cell = int(0.12 * iod * ZM)
fr, fo = crop(ref4).copy(), crop(ours4).copy()
angs, cellsR, cellsO = [], {}, {}
for r0 in range(max(0, by0), min(by1, ref4.shape[0]) - cell, cell):
    for c0 in range(max(0, bx0), min(bx1, ref4.shape[1]) - cell, cell):
        sl = (slice(r0, r0 + cell), slice(c0, c0 + cell))
        res = []
        for (jxx, jyy, jxy), m in ((JR, hmR2), (JO, hmO)):
            if m[sl].mean() < 0.6: res.append(None); continue
            a, b, c = jxx[sl].sum(), jyy[sl].sum(), jxy[sl].sum()
            coh = np.sqrt((a - b) ** 2 + 4 * c * c) / max(1e-6, a + b)
            # (the strands run across the gradient)
            res.append((0.5 * np.arctan2(2 * c, a - b) + np.pi / 2, coh))
        for cells, rr in ((cellsR, res[0]), (cellsO, res[1])):
            if rr and rr[1] > 0.25: cells[(r0 // cell, c0 // cell)] = rr[0]
        ctr = (c0 + cell // 2 - max(0, bx0), r0 + cell // 2 - max(0, by0))
        for (img_, rr) in ((fr, res[0]), (fo, res[1])):
            if rr and rr[1] > 0.25:
                d = np.array([np.cos(rr[0]), np.sin(rr[0])]) * cell * 0.45
                cv2.line(img_, tuple(np.int32(ctr - d)), tuple(np.int32(ctr + d)), (0, 255, 255), 2, cv2.LINE_AA)
        if res[0] and res[1] and res[0][1] > 0.25 and res[1][1] > 0.25:
            da = abs(res[0][0] - res[1][0]) % np.pi
            angs.append(min(da, np.pi - da))
zf = max(1, round(700 / fr.shape[1]))
cv2.imwrite(f'{OUT}/sheet-hairflow.png', np.concatenate([label(big(fr), 'reference: strand direction'), label(big(fo), 'ours')], 1))
lines.append(f'hair flow: mean angle between the strands\' directions {np.degrees(np.mean(angs)) if angs else float("nan"):.0f} deg over {len(angs)} cells (0 alike, 45 unrelated)')


def curl(cells):
    """how much the strands' direction changes from cell to cell (0 all parallel, straight; 1 every way, curly): one
    minus the length of the mean of the doubled angles over each cell's 3x3 neighbourhood"""
    out = []
    for (i, j), a in cells.items():
        nb = [cells[(i + di, j + dj)] for di in (-1, 0, 1) for dj in (-1, 0, 1) if (i + di, j + dj) in cells]
        if len(nb) >= 5: out.append(1 - abs(np.mean(np.exp(2j * np.array(nb)))))
    return float(np.mean(out)) if out else float('nan')


def ragged(m):
    """the hair outline's length against a smoothed outline's (1 smooth; more, curls and wisps standing out of it)"""
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    sm_ = (cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.15 * iod * ZM) > 0.5).astype(np.uint8)
    per = lambda x: sum(cv2.arcLength(c, True) for c in cv2.findContours(x, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0] if cv2.contourArea(c) > (0.1 * iod * ZM) ** 2)
    return per(m) / max(1.0, per(sm_))


lines.append(f'hair curl (strand direction changing cell to cell, 0 straight .. 1 every way): ref {curl(cellsR):.3f}, ours {curl(cellsO):.3f}')
lines.append(f"hair outline raggedness (its length against a smoothed one's): ref {ragged(hmR2):.2f}, ours {ragged(hmO):.2f}")

# --- the face's shading across it: lightness against the forehead's along rows at the cheekbones, under the nose, the
# mouth and the chin (a lean face darkens to its sides under the cheekbones; a flat-lit one stays light to its edge)
lines.append('')
lines.append("shading across the face (lightness minus the forehead's; rows in eye distances below the eye line, columns from his right to his left)")
xs = np.round(np.arange(-1.0, 1.01, 0.2), 1)
lines.append('           ' + ' '.join(f'{x:+6.1f}' for x in xs))
oval4b = np.zeros(labR.shape[:2], np.uint8); cv2.fillPoly(oval4b, [np.int32(np.round(LR4[OVAL]))], 1)
prof_err, profiles = [], {}
for v in (0.25, 0.55, 0.95, 1.3, 1.6):
    rowsR, rowsO = [], []
    for x in xs:
        p_ = F_(x, v); r_, c_ = int(round(p_[1])), int(round(p_[0])); h_ = max(1, int(0.03 * iod * ZM))
        if not (0 <= r_ < labR.shape[0] and 0 <= c_ < labR.shape[1]) or not oval4b[r_, c_]: rowsR.append(None); rowsO.append(None); continue
        rowsR.append(float(np.median(labR[r_ - h_:r_ + h_ + 1, c_ - h_:c_ + h_ + 1, 0])) - fl_r)
        rowsO.append(float(np.median(labO[r_ - h_:r_ + h_ + 1, c_ - h_:c_ + h_ + 1, 0])) - fl_o)
    f = lambda vals: ' '.join('     .' if q is None else f'{q:+6.0f}' for q in vals)
    lines.append(f'  {v:4.2f} ref  {f(rowsR)}')
    lines.append(f'       ours {f(rowsO)}')
    prof_err += [abs(a - b) for a, b in zip(rowsR, rowsO) if a is not None and b is not None]
    profiles[v] = (rowsR, rowsO)
lines.append(f'  mean difference {np.mean(prof_err):.1f}')

# --- how hooded the eyes are: the share of the iris the upper lid covers (and the lower lid), from the landmarks
lines.append('')
for nm, ci, up_, lo_ in (('right', 468, 159, 145), ('left', 473, 386, 374)):
    def cover(L_):
        c_, r_ = L_[ci], np.mean([np.linalg.norm(L_[k] - L_[ci]) for k in range(ci + 1, ci + 5)])
        return (L_[up_][1] - (c_[1] - r_)) / (2 * r_), ((c_[1] + r_) - L_[lo_][1]) / (2 * r_)
    a_, b_ = cover(LR), cover(LO)
    lines.append(f'iris covered by the lids, {nm:5s} eye (top, bottom; shares of its height): ref {a_[0]:.2f}, {a_[1]:.2f}   ours {b_[0]:.2f}, {b_[1]:.2f}')

# --- the face's 3D shape: the depth of each landmark as the detector reconstructs the face from the picture, the same
# way on both (cheekbones standing out, hollows under them, how the face curves back to its sides, how far the eyes sit
# behind the brow): a face can match in outline and colour and still be the wrong shape
from scipy.interpolate import LinearNDInterpolator
sc_ = float(np.sqrt(abs(np.linalg.det(M[:, :2]))))


def depth(L3, pts2):
    """toward the camera from the eye corners' depth, in eye distances, at the landmarks"""
    z = -(L3[:, 2] - L3[[33, 133, 362, 263], 2].mean())
    return z


zR = depth(LR3, LR) / iod
zO = depth(LO3, LOa) * sc_ / iod
interR = LinearNDInterpolator(LR[:468], zR[:468])
interO = LinearNDInterpolator(LOa[:468, :2], zO[:468])
ec2 = (eye_centre(LR, 'r') + eye_centre(LR, 'l')) / 2
ex2 = (eye_centre(LR, 'l') - eye_centre(LR, 'r')) / iod; ey2 = np.array([-ex2[1], ex2[0]])
F2 = lambda u, v: ec2 + (u * ex2 + v * ey2) * iod
lines.append('')
lines.append('the face\'s 3D shape (depth toward the camera from the eye corners, in hundredths of the eye distance, as the face')
lines.append('  mesh reconstructs both pictures alike; rows in eye distances below the eye line, columns from his right to his left)')
lines.append('           ' + ' '.join(f'{x:+6.1f}' for x in xs))
shape_err = []
for v in (-0.6, -0.25, 0.25, 0.55, 0.95, 1.3, 1.6):
    a_ = [float(interR(*F2(x, v))) for x in xs]; b_ = [float(interO(*F2(x, v))) for x in xs]
    f = lambda vals: ' '.join('     .' if not np.isfinite(q) else f'{q * 100:+6.0f}' for q in vals)
    lines.append(f'  {v:+5.2f} ref  {f(a_)}')
    lines.append(f'        ours {f(b_)}')
    shape_err += [abs(a - b) for a, b in zip(a_, b_) if np.isfinite(a) and np.isfinite(b)]
lines.append(f'  mean difference {np.mean(shape_err) * 100:.1f} hundredths')
# (key points: how far each stands out)
KEY = {'nose tip': [1], 'brow ridge (mid)': [105, 334], 'iris centre': [468, 473], 'cheekbone (under the outer eye)': [116, 345],
       'cheek below it': [123, 352], 'cheek hollow (beside the mouth)': [207, 427], 'mouth corner': [61, 291], 'chin': [152],
       'jaw angle': [172, 397], 'temple': [127, 356], 'forehead': [10]}
lines.append('  points (hundredths of the eye distance toward the camera): ref vs ours')
for k, ids in KEY.items():
    lines.append(f'    {k:32s} ref {np.mean(zR[ids]) * 100:+6.0f}   ours {np.mean(zO[ids]) * 100:+6.0f}')
# the depth maps, coloured, with their contour lines, side by side
box = crop_box(OVAL, 0.15)
Zs = 4
x0, y0, x1, y1 = box
gx, gy = np.meshgrid(np.arange(x0, x1, 1 / Zs), np.arange(y0, y1, 1 / Zs))
dR, dO = interR(gx, gy), interO(gx, gy)
def dimg(d):
    v = np.nan_to_num(np.clip((d + 0.1) / 0.75, 0, 1), nan=0)
    im = cv2.applyColorMap(np.uint8(v * 255), cv2.COLORMAP_TURBO)
    im[~np.isfinite(d)] = 40
    for lev in np.arange(-0.1, 0.65, 0.05):
        m = np.uint8(np.nan_to_num(d, nan=-9) > lev)
        cs, _ = cv2.findContours(m, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(im, cs, -1, (255, 255, 255), 1, cv2.LINE_AA)
    return im
diff = dO - dR
dv = cv2.applyColorMap(np.uint8(np.nan_to_num(np.clip(diff / 0.2 * 127 + 128, 0, 255), nan=128)), cv2.COLORMAP_COOL)
dv[~np.isfinite(diff)] = 40
cv2.imwrite(f'{OUT}/sheet-shape.png', np.concatenate([label(dimg(dR), 'reference: depth (contours every 0.05 eye distances)'), label(dimg(dO), 'ours'),
                                                      label(dv, 'ours nearer (pink) / further (cyan), +-0.2')], 1))

# --- the eyes' shape: the tilt from the inner corner to the outer, how open for how wide, where the upper lid peaks, the
# lids' curves (height above and below the line between the corners, at a quarter, half and three quarters of the way out)
lines.append('')
lines.append('eye shape (shares of the eye\'s width; tilt in degrees, + the outer corner higher)')
UP = {'R': [133, 173, 157, 158, 159, 160, 161, 246, 33], 'L': [362, 398, 384, 385, 386, 387, 388, 466, 263]}
LO_ = {'R': [133, 155, 154, 153, 145, 144, 163, 7, 33], 'L': [362, 382, 381, 380, 374, 373, 390, 249, 263]}


def eye_shape(L_, side):
    inner, outer = (L_[133], L_[33]) if side == 'R' else (L_[362], L_[263])
    ax_ = outer - inner; wdt = np.linalg.norm(ax_); ux = ax_ / wdt; uy = np.array([-ux[1], ux[0]])
    if uy[1] > 0: uy = -uy  # up
    tilt = np.degrees(np.arctan2(-(outer[1] - inner[1]), abs(outer[0] - inner[0])))
    def curve(ids):
        P = np.array([[np.dot(L_[i] - inner, ux) / wdt, np.dot(L_[i] - inner, uy) / wdt] for i in ids])
        P = P[np.argsort(P[:, 0])]
        return [float(np.interp(t, P[:, 0], P[:, 1])) for t in (0.25, 0.5, 0.75)], float(P[np.argmax(np.abs(P[:, 1])), 0])
    (up, upk), (lo, lok) = curve(UP[side]), curve(LO_[side])
    return tilt, up, upk, lo, lok


for side in ('R', 'L'):
    a_, b_ = eye_shape(LR, side), eye_shape(LOa, side)
    f = lambda e: f"tilt {e[0]:+5.1f}  upper lid {'/'.join(f'{q:+.2f}' for q in e[1])} peak at {e[2]:.2f}  lower lid {'/'.join(f'{q:+.2f}' for q in e[3])} lowest at {e[4]:.2f}"
    lines.append(f'  {"right" if side == "R" else "left "} ref  {f(a_)}')
    lines.append(f'        ours {f(b_)}')

# --- the other views (nothing to compare them with: they show what the front hides), side by side
views = [(n, cv2.imread(f'{OUT}/view-{n}.png')) for n in ('three-quarter', 'side', 'back', 'above')]
views = [(n, v) for n, v in views if v is not None]
if views:
    h0 = views[0][1].shape[0]
    tiles = [label(cv2.resize(v[int(h0 * 0.02):int(h0 * 0.82), int(h0 * 0.12):int(h0 * 0.88)], (600, 632)), n) for n, v in views]
    cv2.imwrite(f'{OUT}/sheet-views.png', np.concatenate(tiles, 1))

# --- the shape in clay from all round, the reference's head beside the front view at the same scale
clays = [(n, cv2.imread(f'{OUT}/clay-{n}.png')) for n in ('front', 'three-quarter-r', 'profile-r', 'three-quarter-l', 'profile-l', 'below', 'above')]
clays = [(n, v) for n, v in clays if v is not None]
if clays:
    h0 = clays[0][1].shape[0]
    cut = lambda v: v[int(h0 * 0.05):int(h0 * 0.85), int(h0 * 0.1):int(h0 * 0.9)]
    tiles = [cut(v) for _, v in clays]
    # (the reference's head in the same frame as ours: ours is aligned onto it by the eye corners, so that maps back)
    Minv = cv2.invertAffineTransform(M)
    rc = cv2.warpAffine(ref, Minv, (ours.shape[1], ours.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    tiles = [label(cut(rc), 'reference')] + [label(t, n) for t, (n, _) in zip(tiles, clays)]
    th = 560
    tiles = [cv2.resize(t, (int(t.shape[1] * th / t.shape[0]), th), interpolation=cv2.INTER_AREA) for t in tiles]
    row1, row2 = np.concatenate(tiles[:4], 1), np.concatenate(tiles[4:], 1)
    if row2.shape[1] < row1.shape[1]: row2 = np.concatenate([row2, np.full((th, row1.shape[1] - row2.shape[1], 3), 255, np.uint8)], 1)
    cv2.imwrite(f'{OUT}/sheet-clay.png', np.concatenate([row1, row2], 0))

open(f'{OUT}/report.txt', 'w').write('\n'.join(lines))
json.dump({'measures_ref': mr, 'measures_ours': mo, 'err': err, 'hair_iou': inter / max(1, union), 'tone': stats, 'tone_dE': float(np.mean(dEs)), 'frame': frame_rows}, open(f'{OUT}/report.json', 'w'), indent=1)
print('\n'.join(lines))
