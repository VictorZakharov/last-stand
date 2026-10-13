"""How an icon fits the round touch buttons (`border-radius: 50%`, the circle inscribed in the square): the share of
its light the circle cuts off, the radius inside which nearly all of it lies, and how near its content comes to the
square's edges. An icon is painted on black, so its light is each pixel's brightest channel over the black."""
from dataclasses import dataclass

import numpy as np
from PIL import Image

# a pixel is the icon's light when its brightest channel is over this (the black background's noise isn't)
LIGHT = 24
# a pixel counts as the icon's content, for its margin to the edges, when brighter than this (a glow's faint fringe
# doesn't)
CONTENT = 60
# the share of an icon's light that must lie within `REACH` of the middle (in half the square's side: 1 is the circle)
WITHIN = 0.995
REACH = 1.0
# the least margin from the content to the square's edges, as a share of its side
MARGIN = 0.04


@dataclass
class Fit:
    """An icon's fit in the round button."""
    # the share of its light outside the circle
    cut: float
    # the radius, in half the square's side, inside which `WITHIN` of its light lies
    reach: float
    # its content's nearest approach to the square's edges, as a share of its side
    margin: float

    def problems(self) -> list[str]:
        """What keeps it from fitting: a line for each limit it's past."""
        problems = []
        if self.reach > REACH + 0.005:
            problems.append(f'{WITHIN:.1%} of its light reaches {self.reach:.2f} of the radius, past {REACH:.2f}')
        if self.margin < MARGIN - 0.002:
            problems.append(f'its content comes within {self.margin:.1%} of the edges, under {MARGIN:.0%}')
        return problems

    def line(self) -> str:
        """The fit as a line."""
        return f'cut {self.cut:6.2%}   {WITHIN:.1%} within {self.reach:4.2f}   margin {self.margin:5.1%}'


def light_of(image: Image.Image) -> np.ndarray:
    """Each pixel's light: its brightest channel, none where it's the background's black."""
    pixels = np.asarray(image.convert('RGB'), dtype=np.float32)
    light = pixels.max(axis=2)
    return np.where(light > LIGHT, light, 0)


def radii(side: int) -> np.ndarray:
    """Each pixel's distance from the square's middle, in half its side."""
    rows, cols = np.mgrid[0:side, 0:side]
    middle = (side - 1) / 2
    return np.hypot(cols - middle, rows - middle) / (side / 2)


def margin_of(light: np.ndarray) -> float:
    """The content's nearest approach to the square's edges, as a share of its side (half the side with none)."""
    side = light.shape[0]
    rows, cols = np.nonzero(light > CONTENT)
    if not len(rows):
        return 0.5
    nearest = min(cols.min(), rows.min(), side - 1 - cols.max(), side - 1 - rows.max())
    return nearest / side


def measure(image: Image.Image) -> Fit:
    """The icon's fit in the round button (a square picture)."""
    light = light_of(image)
    distance = radii(light.shape[0]).ravel()
    flat = light.ravel()
    total = flat.sum()
    if total == 0:
        return Fit(0, 0, 0.5)
    order = np.argsort(distance)
    gathered = np.cumsum(flat[order]) / total
    reach = distance[order][np.searchsorted(gathered, WITHIN)]
    cut = flat[distance > 1].sum() / total
    return Fit(float(cut), float(reach), margin_of(light))
