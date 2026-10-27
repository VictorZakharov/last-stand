"""Face harness, the head from several angles at once (facelab.mjs --turn): a face judged from the front alone went wrong
from the side, and the owner had to ask for the other views again and again.

One sheet, three columns (front, three-quarter, side) and three rows: the reference, ours in clay, ours painted. The
reference's side is faced to the picture's left, as ours is. Each picture is shown whole, square, at one size: the
renders frame the head alike, so the rows compare at a glance (the measures are in the other sheets).
Writes sheet-angles.png.
python angles.py <prefix of head_front.png, head_34.png, head_side.png> <out dir> <the three-quarter's turn> <the side's turn>
"""
import sys
import cv2
import numpy as np

PRE, OUT, AZ34, AZSIDE = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
TILE = 520


def read(path):
    img = cv2.imread(path)
    if img is None:
        raise SystemExit(f'angles: no {path}')
    return img


def square(img):
    """the picture cropped square about its middle and scaled to a tile"""
    h, w = img.shape[:2]
    n = min(h, w)
    y0, x0 = (h - n) // 2, (w - n) // 2
    return cv2.resize(img[y0:y0 + n, x0:x0 + n], (TILE, TILE), interpolation=cv2.INTER_AREA)


def faced_left(img):
    """a side view faced to the picture's left: its outline (against the top row's background) reaching further left"""
    bg = np.median(img[:8].reshape(-1, 3), 0)
    m = np.linalg.norm(img.astype(np.float32) - bg, axis=2) > 30
    upper = m[: m.shape[0] * 2 // 3]
    cols = np.flatnonzero(upper.any(0))
    if not cols.size:
        return img
    rows_mid = (cols[0] + cols[-1]) / 2
    weight = np.flatnonzero(upper.any(1))
    # (the face side is the one the nose reaches out to: more of the outline's extreme columns there, below the crown)
    band = upper[weight[0] + (weight[-1] - weight[0]) // 3:]
    left = np.mean([np.flatnonzero(r)[0] for r in band if r.any()])
    right = np.mean([np.flatnonzero(r)[-1] for r in band if r.any()])
    return img[:, ::-1].copy() if right - rows_mid > rows_mid - left else img


def label(img, text):
    cv2.rectangle(img, (0, 0), (len(text) * 10 + 10, 24), (0, 0, 0), -1)
    cv2.putText(img, text, (5, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    return img


rows = [
    ('reference', [read(f'{PRE}front.png'), read(f'{PRE}34.png'), faced_left(read(f'{PRE}side.png'))]),
    ('ours in clay', [read(f'{OUT}/ours-clay.png'), read(f'{OUT}/turn-clay-{AZ34}.png'), read(f'{OUT}/turn-clay-{AZSIDE}.png')]),
    ('ours painted', [read(f'{OUT}/ours.png'), read(f'{OUT}/turn-{AZ34}.png'), read(f'{OUT}/turn-{AZSIDE}.png')]),
]
views = ['front', 'three-quarter', 'side']
sheet = np.vstack([np.hstack([label(square(img), f'{name}: {views[i]}') for i, img in enumerate(imgs)])
                   for name, imgs in rows])
cv2.imwrite(f'{OUT}/sheet-angles.png', sheet)
print(f'angles: {OUT}/sheet-angles.png')
