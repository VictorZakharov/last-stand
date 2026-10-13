"""How alike a piece is to itself, moment by moment: its self-similarity drawn as a picture (time across and down,
brighter the more alike), where a section that comes back shows as a line parallel to the diagonal, a lag of the
period off it."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from audio import Audio
from period import ANALYSIS_RATE, HOP, features

# the picture's pixels a second, and how far from white the least alike is drawn (cosine)
PIXELS_A_SECOND = 4
FLOOR = 0.3
# a tick and its label every so many seconds
TICK = 10


def moments(audio: Audio) -> np.ndarray:
    """The piece's frames averaged into moments a pixel each, each scaled to length 1."""
    frames = features(audio)
    per_pixel = max(1, int(round(ANALYSIS_RATE / HOP / PIXELS_A_SECOND)))
    count = len(frames) // per_pixel
    pooled = frames[:count * per_pixel].reshape(count, per_pixel, -1).mean(axis=1)
    return pooled / np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-9)


def draw_map(audio: Audio, path: Path, marks: list[tuple[float, float]] | None = None) -> None:
    """The piece's self-similarity as a picture at `path`, its seconds ticked, and each (from, to) mark ringed."""
    pooled = moments(audio)
    alike = np.clip((pooled @ pooled.T - FLOOR) / (1 - FLOOR), 0, 1)
    side = len(alike)
    margin = 36
    picture = Image.new('RGB', (side + margin, side + margin), 'white')
    picture.paste(Image.fromarray((alike * 255).astype(np.uint8)).convert('RGB'), (margin, margin))
    draw = ImageDraw.Draw(picture)
    for second in range(0, int(audio.seconds) + 1, TICK):
        at = margin + second * PIXELS_A_SECOND
        draw.line([(at, margin - 6), (at, margin)], fill='black')
        draw.line([(margin - 6, at), (margin, at)], fill='black')
        draw.text((at + 2, 2), str(second), fill='black')
        draw.text((2, at + 2), str(second), fill='black')
    for start, end in marks or []:
        x = margin + start * PIXELS_A_SECOND
        y = margin + end * PIXELS_A_SECOND
        draw.ellipse([x - 5, y - 5, x + 5, y + 5], outline='red', width=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    picture.save(path)
