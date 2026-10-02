# facelab: the face harness

Compares a hero's head with a reference picture, feature by feature, so a face is tuned against measurements and
close-ups instead of screenshots judged by eye in a biome's changing light.

```bash
npm run facelab -- --setup                                  # once: a Python venv in tools/facelab/.venv
npm run facelab -- --ref path/to/reference.jpg --tag try1   # render and compare
```

Options: `--class warrior|mage` (the hero), `--tag name` (the output folder, `latest` by default), `--helm` (with a
head item worn), `--size 1200` (pixels), `--fov 14` (degrees: a long lens, as a portrait's), `--key 30,30` (the key
light's direction as the reference is lit: degrees round from the front, + from the picture's right, and up; the
cheeks' lightness left and right in the report shows which side it comes from).

The reference picture is not kept in the repository (pictures are only allowed as screenshots in `docs/`): keep it
where you like and pass its path. Any front view of a face works, a full-body shot too (the face is found in it).

## What it does

1. **Studio render** (`facelab.mjs`): starts its own Vite dev server and a headless browser (the Playwright Chromium
   if installed, `npx playwright install chromium`, else Edge or Chrome), opens the lobby with the hero, hides the
   biome and lights the head like a portrait: a grey backdrop, a soft key light from the front and above. The camera
   is square to the face in the head's own frame (the idle's tilt doesn't count), at eye level, and the training
   dummies are sent far ahead (the head turns to the nearest foe). Besides the picture (`ours.png`) it renders the
   hair alone (`ours-hair.png`), the face's skin alone (`ours-face.png`), its depth (`ours-depth.png`), every mesh in
   a flat colour (`ours-parts.png`: face red, neck green, ears yellow, eyes cyan, hair blue: what a surface in the
   picture actually is), the head from the other side, the back and above behind as the game's camera sees it
   (`view-*.png`), and projects the model's own points (`points.json`). The game's own lights and shadows are kept:
   a face has to look right without shadows finer than the game's.
2. **Comparison** (`compare.py`): MediaPipe's face mesh finds 478 landmarks on both pictures, so they are measured
   alike. Ours is aligned onto the reference by the eye corners alone, so everything else that is off shows as a
   proportion error. Where the detector misreads ours (the chin under a beard), the model's own point is used. The
   face's outline is ours's real one: its skin's silhouette, and below the jaw's angle the jaw's edge standing in
   front of the neck (where its depth jumps), against the reference's landmark oval.
3. **Appearance**: proportions can match while the look doesn't. Ours is brought down to the reference's own
   resolution (a face in a full-body shot has little detail; more would only mislead) and warped feature by feature
   onto the reference's landmarks, then compared region by region in CIELAB: forehead, brows, irises, the whites of
   the eyes, under the eyes, cheekbones, lower cheeks, the nose, moustache, lips, chin, jaw, the neck under it; each
   region's lightness also against the forehead's (the lighting cancels out) and its spread (texture, shading). The
   hair: how it frames the forehead (the bare skin's width row by row above the brows), how high it stands and how
   low it falls, its tones (lightness percentiles: roots and crests) and colour, and which way its strands run (the
   structure tensor cell by cell: swept from a part, or combed flat).

## Output (`tools/facelab/out/<tag>/`)

- `sheet-eyes.png`, `sheet-nose.png`, `sheet-mouth.png`, `sheet-face.png`, `sheet-head.png`: the same crop of both,
  zoomed to the same scale (about 800 px across): reference | ours | overlay (ours over the reference, the
  reference's landmarks green, ours red, a line from each to its match).
- `sheet-outline.png`: the face's outline from the eyes down, the reference's green against ours red.
- `sheet-hair.png`: the hair's outline: the reference's alone red, ours alone blue, both white.
- `sheet-tone.png`: the reference | ours at its resolution | ours warped onto it | the colour difference (dE) | the
  regions measured.
- `sheet-likeness.png`: the whole head of both at the reference's resolution, side by side: how alike they look at
  the detail the reference has.
- `sheet-hairflow.png`: the direction the strands run, cell by cell, on both.
- `sheet-views.png`: the three-quarter view, the side, the back and from above (nothing to compare them with: they
  show what the front hides).
- `report.txt` (and `.json`): proportions as shares of the distance between the eye centres (eye size and opening,
  brow height, nose length and width, lips, mouth to chin, face and jaw width), the reference's beside ours; each
  feature's mean landmark error; the outline's half-width every 0.2 eye distances down from the eye line; the brows
  (the dark band above each eye, found the same way in both pictures: its height, thickness, inner and outer ends);
  the hair's overlap and its width by height; the regions' colours, the forehead's framing, the hair's top, ends,
  tones and flow.

Work one feature at a time: change the face (`FACES` / `LOOKS` in `src/entities/models/face.ts`, the hair in
`head.ts`), run it with a new tag, and compare the report and the sheets with the previous tag's. When the face still
doesn't look like the reference with every number close, the harness is missing a measure: add it here first.
