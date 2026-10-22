# Photos

The photos the game's maps take their colours from (`src/core/photos/`): a Poly Haven ground made into a recipe's
two files, and a photo's edges checked. What a photo must be is in `src/core/photos/AGENTS.md`.

Needs Python with Pillow and numpy (`pip install -r tools/photos/requirements.txt`).

```bash
npm run photos -- ground leaves_forest_ground forest-leaves   # Poly Haven's texture into forest-leaves(-height).webp
npm run photos -- seams src/core/photos/cobblestone.webp      # how a stored photo's edges meet, as the game decodes it
```

- **`ground id name`** fetches Poly Haven's texture `id` (its name in `polyhaven.com/a/<id>`; every texture there is
  CC0) at 1k (`--resolution 2k` for more), its colour JPEG and its displacement PNG, into `tools/photos/out/<id>/`,
  and writes `src/core/photos/<name>.webp` (the colour, WebP at quality 82) and `<name>-height.webp` (the
  displacement as 8-bit grey over its whole range, quality 90), each with 5 px of itself wrapped round its edges. It
  says the texture's authors and size in the world, each file's size, and how its edges meet against its steps
  inside, in the original and as the game decodes it. A recipe that takes them, its entry in `PHOTO_FILES` and its
  row in the photos' table are then yours to write; `npm run lab -- maps` checks the map they make tiles.
- **`seams picture...`** says how stored photos' edges meet inside their margin: about 1 tiles, a seam steps further.

The sources are small modules: `polyhaven.py` fetches a texture, `webp.py` writes a photo with its margin and decodes
it as the game does, `seams.py` measures its edges, and `photos.py` is the command line (`photos.mjs` runs it with the
system's Python).
