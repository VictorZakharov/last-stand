"""Facelab's reference views, read alike: a side view facing the picture's right is mirrored to face its left, as ours does.

The side's profile is read from the picture's left edge (turn.py, recon.py), so a right-facing reference gave the frame's
edge in every row (a constant 95 mm ahead of the eye) and a fitted turn of 120 degrees. Which way it faces comes from
its landmarks: the nose's tip ahead of the eyes. With no face found, the picture is kept as it is.
"""
import cv2
import numpy as np

NOSE_TIP = 1
EYES = (468, 473)


def faces_right(landmarks):
    """whether a view's face points to the picture's right: its nose's tip right of its eyes"""
    eyes_x = np.mean([landmarks[i][0] for i in EYES])
    return landmarks[NOSE_TIP][0] > eyes_x


def read_view(path, name, find_landmarks):
    """a reference view (`name` front, 34 or side), a right-facing side mirrored; `find_landmarks(img)` gives the
    MediaPipe points or None"""
    img = cv2.imread(path)
    if img is None or name != 'side':
        return img
    landmarks = find_landmarks(img)
    if landmarks is not None and faces_right(landmarks):
        return cv2.flip(img, 1)
    return img
