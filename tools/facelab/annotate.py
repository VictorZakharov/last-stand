"""Face harness: placing landmarks by hand on a reference picture, and checking them.

The landmark detector can't see what a reference's beard and hair hide (the jaw's angles and line, the cheekbones' width
under the hair, the chin under the beard), so those points are placed by hand once per reference, in a JSON file of
{view: {name: [x, y]}} in the picture's pixels (views: front, 34, side). Ours come from the model itself (facelab.mjs
projects them) and points.py compares the two.

  python annotate.py grid <picture> x0 y0 x1 y1 [out.png]   a zoomed crop with a grid labelled in the picture's pixels,
                                                            to read a point's position off
  python annotate.py show <picture> <points.json> <view> [out.png]   the points drawn on the picture, to check them
"""
import sys, json
import cv2, numpy as np


def grid(path, x0, y0, x1, y1, out):
    im = cv2.imread(path)
    c = im[y0:y1, x0:x1]
    k = max(1, round(1300 / max(c.shape[:2])))
    c = cv2.resize(c, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    span = max(x1 - x0, y1 - y0)
    step = 10 if span <= 200 else 20 if span <= 400 else 50
    for x in range((x0 // step + 1) * step, x1, step):
        major = x % (step * 5) == 0
        cv2.line(c, ((x - x0) * k, 0), ((x - x0) * k, c.shape[0]), (0, 255, 0) if major else (0, 140, 0), 1)
        if major or step >= 20: cv2.putText(c, str(x), ((x - x0) * k + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 255), 1, cv2.LINE_AA)
    for y in range((y0 // step + 1) * step, y1, step):
        major = y % (step * 5) == 0
        cv2.line(c, (0, (y - y0) * k), (c.shape[1], (y - y0) * k), (0, 255, 0) if major else (0, 140, 0), 1)
        if major or step >= 20: cv2.putText(c, str(y), (2, (y - y0) * k - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 255), 1, cv2.LINE_AA)
    cv2.imwrite(out, c)


def show(path, pts_path, view, out):
    im = cv2.imread(path)
    P = json.load(open(pts_path))[view]
    s = max(1, im.shape[1] // 700)
    for name, (x, y) in P.items():
        cv2.circle(im, (int(x), int(y)), 3 * s, (0, 255, 0), -1, cv2.LINE_AA)
        cv2.putText(im, name, (int(x) + 4 * s, int(y) - 3 * s), cv2.FONT_HERSHEY_SIMPLEX, 0.35 * s, (0, 255, 255), max(1, s // 2), cv2.LINE_AA)
    cv2.imwrite(out, im)


if __name__ == '__main__':
    if sys.argv[1] == 'grid':
        x0, y0, x1, y1 = map(int, sys.argv[3:7])
        grid(sys.argv[2], x0, y0, x1, y1, sys.argv[7] if len(sys.argv) > 7 else 'grid.png')
    elif sys.argv[1] == 'show':
        show(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else 'points.png')
