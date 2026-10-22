# `tools/photos`

The photos' tool (`README.md`): `ground` makes a Poly Haven texture into a ground recipe's two photos, `seams` checks
a stored photo's edges. What a photo must be is in `src/core/photos/AGENTS.md`.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- The margin (`MARGIN` in `webp.py`) is the game's (`margin` in `PHOTO_FILES`, `src/core/pbr.ts`): change both, or
  the game crops what isn't a margin.
- Judge a ground in play at full size before keeping it (`npm run lab -- light --ab`, its frames in
  `tools/lab/out/light/`): at their own size Poly Haven's grounds read as a blur from the camera.
