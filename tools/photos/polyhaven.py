"""A Poly Haven texture's colour and displacement maps, fetched once into the tool's `out/` (all its textures are
CC0: https://polyhaven.com/license)."""
import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path

API = 'https://api.polyhaven.com'
# Poly Haven asks each client to say who it is
USER_AGENT = 'last-stand-photos-tool'


@dataclass
class Texture:
    """A texture's name, authors, size in the world (m) and its two maps on disk."""
    name: str
    authors: str
    metres: float
    colour: Path
    height: Path


def fetch(url: str) -> bytes:
    """The body at `url`."""
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def fetch_json(url: str) -> dict:
    """The JSON at `url`."""
    return json.loads(fetch(url))


def fetch_to(url: str, path: Path) -> Path:
    """`url` saved at `path`, unless it was before."""
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(fetch(url))
    return path


def map_url(files: dict, kind: str, resolution: str, file_type: str) -> str:
    """The URL of a texture's map of `kind` at `resolution` as `file_type`, or an error naming what there is."""
    try:
        return files[kind][resolution][file_type]['url']
    except KeyError:
        have = ', '.join(sorted(files.get(kind, {})))
        raise SystemExit(f'no {kind} map at {resolution} as {file_type} (there are: {have or "none"})')


def texture(texture_id: str, resolution: str, out: Path) -> Texture:
    """Texture `texture_id` (its name in polyhaven.com/a/<id>), its maps at `resolution` (1k, 2k...) in `out/<id>/`."""
    info = fetch_json(f'{API}/info/{texture_id}')
    if info.get('type') != 1:
        raise SystemExit(f'{texture_id} is not a Poly Haven texture')
    files = fetch_json(f'{API}/files/{texture_id}')
    folder = out / texture_id
    colour = fetch_to(map_url(files, 'Diffuse', resolution, 'jpg'), folder / f'colour-{resolution}.jpg')
    height = fetch_to(map_url(files, 'Displacement', resolution, 'png'), folder / f'height-{resolution}.png')
    authors = ', '.join(info.get('authors', {}))
    metres = info['dimensions'][0] / 1000
    return Texture(info['name'], authors, metres, colour, height)
