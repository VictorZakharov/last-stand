"""The photos map recipes take (`src/core/photos/`): a Poly Haven ground made into a recipe's two files, and a photo's
edges checked. Run through `npm run photos -- <command>` (tools/photos/README.md)."""
import argparse
import sys
from pathlib import Path

import numpy as np

import polyhaven
import webp
from seams import seams

ROOT = Path(__file__).resolve().parents[2]
PHOTOS = ROOT / 'src' / 'core' / 'photos'
OUT = ROOT / 'tools' / 'photos' / 'out'


def kilobytes(data: bytes) -> str:
    """A file's size, as the photos' table gives it (and Vite's build: a thousand bytes a KB)."""
    return f'{len(data) / 1000:.0f} KB'


def made(label: str, path: Path, original: np.ndarray, data: bytes) -> None:
    """Writes one photo and says how big it is and how its edges meet, before and as the game decodes it."""
    webp.write(path, data)
    print(f'  {label}: {path.relative_to(ROOT)}, {kilobytes(data)}')
    print(f'    original: {seams(original)}')
    print(f'    as decoded: {seams(webp.decoded(data))}')


def run_ground(args: argparse.Namespace) -> int:
    """Makes Poly Haven texture `id` into `<name>.webp` (its colour) and `<name>-height.webp` (its displacement)."""
    texture = polyhaven.texture(args.id, args.resolution, OUT)
    print(f'{texture.name} ({texture.authors}; CC0), {texture.metres:.2f} m a tile')
    colour = webp.colour_of(texture.colour)
    height = webp.height_of(texture.height)
    made('colour', PHOTOS / f'{args.name}.webp', colour, webp.encoded(colour, webp.COLOUR_QUALITY))
    made('height', PHOTOS / f'{args.name}-height.webp', height, webp.encoded(height, webp.HEIGHT_QUALITY))
    print('Its recipe and its row in src/core/photos/AGENTS.md are yours to add; check with npm run lab -- maps.')
    return 0


def run_seams(args: argparse.Namespace) -> int:
    """Says how each photo's edges meet as the game decodes it (inside its margin)."""
    for picture in args.pictures:
        path = Path(picture)
        if not path.exists():
            sys.exit(f'no such picture: {picture}')
        print(f'{path.name}: {seams(webp.decoded(path.read_bytes()))}')
    return 0


def parser() -> argparse.ArgumentParser:
    """The command line."""
    commands = argparse.ArgumentParser(prog='npm run photos --', description=__doc__)
    sub = commands.add_subparsers(dest='command', required=True)
    ground = sub.add_parser('ground', help='a Poly Haven texture made into a ground recipe\'s two photos')
    ground.add_argument('id', help='its name on Poly Haven (polyhaven.com/a/<id>), e.g. leaves_forest_ground')
    ground.add_argument('name', help='the photos\' name in src/core/photos, e.g. forest-leaves')
    ground.add_argument('--resolution', default='1k', help='its maps\' size on Poly Haven (1k by default)')
    ground.set_defaults(run=run_ground)
    check = sub.add_parser('seams', help='how stored photos\' edges meet, inside their margin')
    check.add_argument('pictures', nargs='+', help='photos in src/core/photos stored with a margin')
    check.set_defaults(run=run_seams)
    return commands


if __name__ == '__main__':
    arguments = parser().parse_args()
    sys.exit(arguments.run(arguments))
