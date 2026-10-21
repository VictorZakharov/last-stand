# `src/core/photos`

The photos a map recipe takes its colours from (`PHOTO_URLS` in `../pbr.ts`): the exception to "everything is
procedural" the owner made for textures, which a photo makes look far better than a recipe for little of the game's
size. Each one:

- **is the owner's, or free to use** (CC0), its source and licence in the table below;
- **tiles**: its left edge meets its right and its top its bottom (`npm run lab -- maps --maps <recipe>` fails on a
  seam);
- **is small**: WebP, 1024 square at most, a few hundred KB (the offline worker precaches every built file,
  `scripts/AGENTS.md`);
- **is decoded where its recipe runs**: `photosFor` decodes the photos a recipe takes before it runs, in a loading
  worker (no document there: an `OffscreenCanvas`), or on the page for a map a worker failed. Its map is then made
  as the procedural ones are, kept across visits with them, and a recipe whose photo fails makes its procedural map;
- **is laid at its own size**: one tile on a surface is what the surface's UVs and the map's repeat make it, so a
  surface drawn with a photo has the repeat that makes its tile the photo's size (`npm run lab -- tiles` reads each
  surface's tile in metres; the forest's bark ran a tile round a whole trunk, 2.2 m, where the photo is 0.36 m).

| Photo | Source | Used by |
| --- | --- | --- |
| `oak-bark.webp` | sdf-harness's `viewer/textures/oak-bark.png` at ac504b2 (the owner's: generated for it; MIT), WebP at quality 82: 350 KB from a 2.4 MB PNG | `bark` in `pbr.ts`: the forest's trees, stumps, logs, roots and gates, the crypt's dead trees, the thornlings, treants and sporecallers |
