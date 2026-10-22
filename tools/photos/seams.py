"""How a tiling picture's edges meet: the step from its last column to its first (and last row to first) against the
steps between its lines inside. A picture that tiles steps across its edges as it does inside (1 or so); a seam
steps further (`npm run lab -- maps` judges the map made from it)."""
from dataclasses import dataclass

import numpy as np


@dataclass
class Seams:
    """Each edge's mean step over the median step between lines inside: across u (left to right) and v."""
    u: float
    v: float

    def __str__(self) -> str:
        return f'edges step {self.u:.2f} (u) and {self.v:.2f} (v) times the steps inside'


def grey(pixels: np.ndarray) -> np.ndarray:
    """A picture's brightness, as floats."""
    values = pixels.astype(np.float64)
    return values[..., :3].mean(axis=2) if values.ndim == 3 else values


def edge_over_inside(values: np.ndarray, axis: int) -> float:
    """Across `axis`: the mean step from the last line to the first over the median step between lines inside."""
    inside = np.median(np.abs(np.diff(values, axis=axis)).mean(axis=1 - axis))
    first = np.take(values, 0, axis=axis)
    last = np.take(values, -1, axis=axis)
    return float(np.abs(first - last).mean() / (inside or 1))


def seams(pixels: np.ndarray) -> Seams:
    """How `pixels`' edges meet."""
    values = grey(pixels)
    return Seams(u=edge_over_inside(values, axis=1), v=edge_over_inside(values, axis=0))
