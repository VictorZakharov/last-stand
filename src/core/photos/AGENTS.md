# `src/core/photos`

The photos a map recipe takes its colours (and a ground its height) from (`PHOTO_FILES` in `../pbr.ts`): the
exception to "everything is procedural" the owner made for textures, which a photo makes look far better than a
recipe for little of the game's size. Each one:

- **is the owner's, or free to use** (CC0), its source and licence in the table below;
- **tiles**: its left edge meets its right and its top its bottom (`npm run lab -- maps --maps <recipe>` fails on a
  seam). Lossy coding can't see across a picture's edges, so it steps there: in a ground's smooth height, a seam the
  original hadn't. So a picture may be stored with a margin of itself wrapped round each edge, which `decode` crops
  off (`margin` in `PHOTO_FILES`; 5 px, not a coding block's 16, at whose edges a picture steps as well);
- **is small**: WebP, 1024 square at most, a few hundred KB (the offline worker precaches every built file,
  `scripts/AGENTS.md`);
- **is decoded where its recipe runs**: `photosFor` decodes the photos a recipe takes before it runs, in a loading
  worker (no document there: an `OffscreenCanvas`), or on the page for a map a worker failed. Its map is then made
  as the procedural ones are, kept across visits with them, and a recipe whose photo fails makes its procedural map;
- **is laid at its own size, or as big as reads**: one tile on a surface is what the surface's UVs and the map's
  repeat make it (`npm run lab -- tiles` reads each surface's tile in metres; the forest's bark ran a tile round a
  whole trunk, 2.2 m, where the photo is 0.36 m). A ground is seen from metres off, so it's laid larger than life:
  at their own size the forest's leaves were a brown blur and the crypt's cobbles a glitter of noise from the camera.
  Judge a ground at full size in the frames `npm run lab -- light --ab` writes (`out/light/`), not shrunk.

How a Poly Haven texture became its two files: its 1k colour JPEG and 1k displacement PNG; the colour as WebP at
quality 82, the displacement as 8-bit grey stretched over the whole range at quality 90, each with 5 px wrapped round
it. A ground's albedo is scaled to the mean of the map it stands in for (`lab maps` lists the means), as each biome's
light was set for that.

| Photo | Source | Used by |
| --- | --- | --- |
| `oak-bark.webp` | sdf-harness's `viewer/textures/oak-bark.png` at ac504b2 (the owner's: generated for it; MIT), WebP at quality 82: 350 KB from a 2.4 MB PNG | `bark` in `pbr.ts`: the forest's trees, stumps, logs, roots and gates, the crypt's dead trees, the thornlings, treants and sporecallers |
| `forest-leaves.webp`, `forest-leaves-height.webp` | Poly Haven's [Leaves Forest Ground](https://polyhaven.com/a/leaves_forest_ground) (Dimitrios Savva, Dario Barresi; CC0), 1.26 m: 323 KB and 169 KB | `forestFloor` in `pbr.ts`: the forest's ground, laid at 3 m |
| `cobblestone.webp`, `cobblestone-height.webp` | Poly Haven's [Cobblestone Floor 04](https://polyhaven.com/a/cobblestone_floor_04) (Rob Tuytel; CC0), 1.5 m: 185 KB and 70 KB | `cobblestone` in `pbr.ts`: the crypt's ground, laid at 3.5 m |
