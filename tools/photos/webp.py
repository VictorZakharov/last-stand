"""A tiling picture written as the game's photos are (`src/core/photos/AGENTS.md`): WebP with `MARGIN` pixels of it
wrapped round its edges, which `decode` in `src/core/pbr.ts` crops off. Lossy coding can't see across a picture's
edges and steps there: in a ground's smooth height, a seam the original hadn't."""
import io
from pathlib import Path

import numpy as np
from PIL import Image

# as `margin` in `PHOTO_FILES` (src/core/pbr.ts); 5 px, not a coding block's 16, at whose edges a picture steps too
MARGIN = 5
COLOUR_QUALITY = 82
HEIGHT_QUALITY = 90


def colour_of(path: Path) -> np.ndarray:
    """A picture's RGB pixels."""
    return np.asarray(Image.open(path).convert('RGB'))


def height_of(path: Path) -> np.ndarray:
    """A displacement map (8 or 16 bit, grey or RGB) as 8-bit grey stretched over the whole range."""
    pixels = np.asarray(Image.open(path)).astype(np.float64)
    if pixels.ndim == 3:
        pixels = pixels[..., :3].mean(axis=2)
    low = pixels.min()
    span = pixels.max() - low or 1
    return np.round((pixels - low) / span * 255).astype(np.uint8)


def wrapped(pixels: np.ndarray) -> np.ndarray:
    """`pixels` with `MARGIN` of them wrapped round each edge."""
    pad = [(MARGIN, MARGIN), (MARGIN, MARGIN)] + [(0, 0)] * (pixels.ndim - 2)
    return np.pad(pixels, pad, mode='wrap')


def encoded(pixels: np.ndarray, quality: int) -> bytes:
    """`pixels` wrapped and coded as WebP."""
    mode = 'RGB' if pixels.ndim == 3 else 'L'
    buffer = io.BytesIO()
    Image.fromarray(wrapped(pixels), mode).save(buffer, 'WEBP', quality=quality, method=6)
    return buffer.getvalue()


def decoded(data: bytes) -> np.ndarray:
    """A photo's pixels as the game decodes it: inside its margin."""
    pixels = np.asarray(Image.open(io.BytesIO(data)))
    return pixels[MARGIN:-MARGIN, MARGIN:-MARGIN]


def write(path: Path, data: bytes) -> None:
    """`data` saved at `path`."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
