"""Face harness, the head's side outline: ours against a reference's true profile, with no landmarks (facelab.mjs --turn).

turn.py lays the side out from the near eye, which MediaPipe places badly on a strict profile; the skull's own shape (how
long and how high it is, how the forehead runs into it, where the back of the head and the jaw's underside are) needs
the whole outline instead. Both heads are cut out against their backgrounds, faced to the picture's left, scaled to one
head length (the row through the back of the skull's furthest point, from the brow to it: no feature of the face moves
it; scaled by the crown to the nose's tip, a longer nose shrank the whole head) and laid over each other at the crown's
height and that furthest point. Then, at each height (a share of the length below the crown), how far forward and back
of that point each reaches, in the same share.
Writes sheet-outline-side.png (the reference red, ours cyan, grey where both) and, given our clay picture from the same
camera, sheet-side-clay.png (the reference and ours side by side, laid out alike), and appends to report.txt.
python outline.py <the reference's side view> <our side silhouette, white on black> <out dir> [our clay side view]
"""
import sys
import cv2
import numpy as np

REF, OURS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
CLAY = sys.argv[4] if len(sys.argv) > 4 else None
SIZE = 1000           # the sheet's side, px
LENGTH = 560          # the head's length on the sheet, px
BACK_AT = (800, 100)  # where the back of the skull's furthest point (x) and the crown (y) land on the sheet
ROWS = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05]


def largest(mask):
    """the largest connected piece of a mask, its holes filled"""
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n < 2:
        raise SystemExit('outline: nothing found against the background')
    keep = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    flood = keep.copy()
    cv2.floodFill(flood, np.zeros((keep.shape[0] + 2, keep.shape[1] + 2), np.uint8), (0, 0), 1)
    return keep | (1 - flood)


def reference_mask(img):
    """the reference's head and neck against its plain background: warmer (redder over blue) than the background, sampled
    along its top edge (by brightness alone, the clay in shade came out as background: Codex's clay views)"""
    warmth = img[..., 2].astype(np.float32) - img[..., 0]
    bg = float(np.median(warmth[:8]))
    warm = warmth > bg + 10
    return largest(cv2.morphologyEx(warm.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)))


def ours_mask(img):
    """our head's silhouette, rendered white on black (the hair hidden)"""
    return largest(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) > 128)


def nose_tip(mask, crown):
    """the nose's tip: the furthest-forward (leftmost) point of the outline between 0.45 and 1.0 of the head's length
    below the crown (the length its upper half's widest row; a head's crown to its nose's tip is about 0.75 of it)"""
    cols = mask[crown:crown + (mask.shape[0] - crown) // 2].sum(1)
    length = int(cols.max())
    best = None
    for y in range(crown + int(0.45 * length), min(mask.shape[0], crown + int(1.0 * length))):
        xs = np.flatnonzero(mask[y])
        if xs.size and (best is None or xs[0] < best[0]):
            best = (int(xs[0]), y)
    return best


def layout(mask):
    """the transform onto the sheet: the head's length LENGTH long (the row through the back's furthest point, above the
    nose's tip, which only bounds the search), that point and the crown at BACK_AT"""
    crown = int(np.flatnonzero(mask.any(1))[0])
    tip = nose_tip(mask, crown)
    backs = [(int(np.flatnonzero(mask[y])[-1]), y) for y in range(crown, tip[1]) if mask[y].any()]
    back_x, back_y = max(backs)
    length = back_x - int(np.flatnonzero(mask[back_y])[0])
    k = LENGTH / length
    return np.float32([[k, 0, BACK_AT[0] - back_x * k], [0, k, BACK_AT[1] - crown * k]])


def laid_out(mask, M):
    """the mask on the sheet"""
    return cv2.warpAffine(mask * 255, M, (SIZE, SIZE), flags=cv2.INTER_LINEAR) > 127


def row_at(share):
    """the sheet's row a share of the head's length below the crown"""
    return int(BACK_AT[1] + share * LENGTH)


def reach(mask, share):
    """how far forward and back (shares of the head's length, from the back's furthest point) the outline reaches"""
    y = row_at(share)
    xs = np.flatnonzero(mask[y]) if 0 <= y < SIZE else np.array([])
    if not xs.size:
        return None
    return (BACK_AT[0] - xs[0]) / LENGTH, (BACK_AT[0] - xs[-1]) / LENGTH


ref_img = cv2.imread(REF)
if ref_img is None:
    raise SystemExit(f'outline: no {REF}')
ref_m = reference_mask(ref_img)
# (faced to the picture's left like ours: the side whose outline reaches further from the head's middle is the face)
cols = np.flatnonzero(ref_m.any(0))
mid = (cols[0] + cols[-1]) / 2
upper = ref_m[: ref_m.shape[0] // 2]
if np.flatnonzero(upper.any(0))[-1] - mid > mid - np.flatnonzero(upper.any(0))[0]:
    ref_m = ref_m[:, ::-1].copy()
    ref_img = ref_img[:, ::-1].copy()
ours_m = ours_mask(cv2.imread(OURS))
MR, MO = layout(ref_m), layout(ours_m)
R, O = laid_out(ref_m, MR), laid_out(ours_m, MO)
if CLAY:
    clay = cv2.imread(CLAY)
    if clay is None:
        raise SystemExit(f'outline: no {CLAY}')
    pair = [cv2.warpAffine(img, M, (SIZE, SIZE), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
            for img, M in ((ref_img, MR), (clay, MO))]
    cv2.imwrite(f'{OUT}/sheet-side-clay.png', np.hstack(pair))

sheet = np.full((SIZE, SIZE, 3), 70, np.uint8)
sheet[R] = (60, 60, 200)
sheet[O] = (200, 200, 60)
sheet[R & O] = (170, 170, 170)
for s in ROWS:
    y = row_at(s)
    cv2.line(sheet, (0, y), (12, y), (255, 255, 255), 1)
cv2.putText(sheet, 'side outline: reference red, ours cyan, both grey', (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
cv2.imwrite(f'{OUT}/sheet-outline-side.png', sheet)

lines = ['', 'the side outline (outline.py: no landmarks; scaled to one head length, laid over at the crown and the back), by',
         'height as a share of the length below the crown: how far forward and back of the back\'s furthest point each reaches',
         '   height   reference fwd/back   ours fwd/back   ours minus the reference']
for s in ROWS:
    a, b = reach(R, s), reach(O, s)
    if a is None or b is None:
        lines.append(f'   {s:5.2f}    (outside one of them)')
        continue
    lines.append(f'   {s:5.2f}    {a[0]:+.3f} {a[1]:+.3f}       {b[0]:+.3f} {b[1]:+.3f}    {b[0] - a[0]:+.3f} {b[1] - a[1]:+.3f}')
ra, oa = R.sum(), O.sum()
lines.append(f'   overlap (IoU) {(R & O).sum() / (R | O).sum():.3f}; area ours / the reference {oa / ra:.3f}')
text = '\n'.join(lines) + '\n'
print(text, end='')
with open(f'{OUT}/report.txt', 'a', encoding='utf-8') as f:
    f.write(text)
