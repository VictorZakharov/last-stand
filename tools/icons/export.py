"""A painted original made into a skill's icon as the game loads it: squared, padded to fit the round touch buttons
(shrunk onto a larger black square, which is exact on a black background and leaves the art as it was), and written
as a 384 px square WebP at quality 88 (the largest slot is a tablet's touch attack button, 125 css px; a phone's is 93
at three to three and a half device pixels each)."""
from pathlib import Path

from PIL import Image

from fit import MARGIN, REACH, measure

# the icon's side in the game, and its WebP's quality
SIDE = 384
QUALITY = 88
# how far inside the limits an original is padded to: resized to the game's size its glow spreads by a pixel, and
# padded to the limits exactly an icon came out 1% past them
SLACK = 0.01


def squared(image: Image.Image) -> Image.Image:
    """The picture's middle square, in RGB."""
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    return image.convert('RGB').crop((left, top, left + side, top + side))


def padded(image: Image.Image) -> Image.Image:
    """The square picture shrunk onto black about its middle until it fits the round button: `WITHIN` of its light
    inside `REACH` and its content `MARGIN` clear of the edges. One that fits already is kept as it is."""
    fit = measure(image)
    within = (REACH - SLACK) / max(fit.reach, 1e-6)
    clear = (0.5 - MARGIN - SLACK) / max(0.5 - fit.margin, 1e-6)
    scale = min(1.0, within, clear)
    if scale >= 1.0:
        return image
    side = image.width
    shrunk = round(side * scale)
    out = Image.new('RGB', (side, side), (0, 0, 0))
    offset = (side - shrunk) // 2
    out.paste(image.resize((shrunk, shrunk), Image.LANCZOS), (offset, offset))
    return out


def icon_from(picture: Path) -> Image.Image:
    """The icon a painted original makes, at the game's size."""
    with Image.open(picture) as image:
        return padded(squared(image)).resize((SIDE, SIDE), Image.LANCZOS)


def export(picture: Path, out: Path) -> Image.Image:
    """Writes the icon a painted original makes to `out` (a WebP) and returns it."""
    icon = icon_from(picture)
    icon.save(out, 'WEBP', quality=QUALITY, method=6)
    return icon
