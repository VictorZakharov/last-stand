"""Face harness, the side of the head's curvature: the skin's mean curvature mapped over its side, seen from the side,
from the distance field (sdf.mjs grid). A band of shade across a cheek is either a crease (a stripe of hollow here)
or the light alone (nothing here); widths alone (section.mjs) can't tell, as a crease needn't change how wide the head
is (the mage's cheeks, 2026-10-27).
Writes sidemap-<class>.png: blue hollow, red bulging, white flat; lines every 10 mm up and forward, labelled each 20.
python sidemap.py <class> <out dir>
"""
import os
import subprocess
import sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CLS, OUT = sys.argv[1], os.path.abspath(sys.argv[2])
SCALE = 4                       # px per mm
Z0, Z1, Y0, Y1 = -110, 130, -20, 240
LIMIT = 0.06                    # the curvature (1/mm) shown at full colour


def grid():
    """the skin's mesh points and their mean curvature (x, y, z, H), through sdf.mjs"""
    path = os.path.join(OUT, f'sidemap-{CLS}.f32')
    p = subprocess.Popen(['node', os.path.join(HERE, 'sdf.mjs')], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         text=True, cwd=os.path.join(HERE, '../..'))
    p.stdin.write(f'grid {path} {CLS}\n')
    p.stdin.flush()
    answer = p.stdout.readline().strip()
    p.stdin.write('quit\n')
    p.stdin.flush()
    p.wait()
    if answer != 'ok':
        raise SystemExit(f'sidemap: sdf.mjs: {answer}')
    pts = np.fromfile(path, dtype=np.float32).reshape(-1, 4)
    os.remove(path)
    return pts


pts = grid()
side = pts[pts[:, 0] > 5]
W, H = (Z1 - Z0) * SCALE, (Y1 - Y0) * SCALE
img = np.full((H, W, 3), 60, np.uint8)
# (the outermost point wins each pixel: the side as it is seen)
order = np.argsort(side[:, 0])
for x, y, z, h in side[order]:
    c = int((z - Z0) * SCALE)
    r = int((Y1 - y) * SCALE)
    if not (0 <= c < W and 0 <= r < H):
        continue
    t = float(np.clip(h / LIMIT, -1, 1))
    colour = (255, int(255 * (1 + t)), int(255 * (1 + t))) if t < 0 else (int(255 * (1 - t)), int(255 * (1 - t)), 255)
    cv2.circle(img, (c, r), 3, colour, -1)
for z in range(-100, Z1, 10):
    cv2.line(img, (int((z - Z0) * SCALE), 0), (int((z - Z0) * SCALE), H), (120, 120, 120), 1)
    if z % 20 == 0:
        cv2.putText(img, f'z{z}', (int((z - Z0) * SCALE) + 2, H - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (230, 230, 230), 1)
for y in range(0, Y1, 10):
    cv2.line(img, (0, int((Y1 - y) * SCALE)), (W, int((Y1 - y) * SCALE)), (120, 120, 120), 1)
    if y % 20 == 0:
        cv2.putText(img, f'y{y}', (2, int((Y1 - y) * SCALE) - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (230, 230, 230), 1)
cv2.imwrite(os.path.join(OUT, f'sidemap-{CLS}.png'), img)
print(f'sidemap: {OUT}/sidemap-{CLS}.png')
