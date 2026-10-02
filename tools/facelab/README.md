# facelab: the face harness

Compares a hero's head with a reference picture, feature by feature, so a face is tuned against measurements and
close-ups instead of screenshots judged by eye in a biome's changing light.

```bash
npm run facelab -- --setup                                  # once: a Python venv in tools/facelab/.venv
npm run facelab -- --ref path/to/reference.jpg --tag try1   # render and compare
```

Options: `--class warrior|mage` (the hero), `--tag name` (the output folder, `latest` by default), `--helm` (with a
head item worn), `--size 1200` (pixels), `--fov 14` (degrees: a long lens, as a portrait's).

The reference picture is not kept in the repository (pictures are only allowed as screenshots in `docs/`): keep it
where you like and pass its path. Any front view of a face works, a full-body shot too (the face is found in it).

## What it does

1. **Studio render** (`facelab.mjs`): starts its own Vite dev server and a headless browser (the Playwright Chromium
   if installed, `npx playwright install chromium`, else Edge or Chrome), opens the lobby with the hero, hides the
   biome and lights the head like a portrait: a grey backdrop, a soft key light from the front and above. The camera
   is square to the face in the head's own frame (the idle's tilt doesn't count), at eye level, and the training
   dummies are sent far ahead (the head turns to the nearest foe). Besides the picture (`ours.png`) it renders the
   hair alone (`ours-hair.png`), the face's skin alone (`ours-face.png`) and its depth (`ours-depth.png`), and
   projects the model's own points (`points.json`).
2. **Comparison** (`compare.py`): MediaPipe's face mesh finds 478 landmarks on both pictures, so they are measured
   alike. Ours is aligned onto the reference by the eye corners alone, so everything else that is off shows as a
   proportion error. Where the detector misreads ours (the chin under a beard), the model's own point is used. The
   face's outline is ours's real one: its skin's silhouette, and below the jaw's angle the jaw's edge standing in
   front of the neck (where its depth jumps), against the reference's landmark oval.

## Output (`tools/facelab/out/<tag>/`)

- `sheet-eyes.png`, `sheet-nose.png`, `sheet-mouth.png`, `sheet-face.png`, `sheet-head.png`: the same crop of both,
  zoomed to the same scale (about 800 px across): reference | ours | overlay (ours over the reference, the
  reference's landmarks green, ours red, a line from each to its match).
- `sheet-outline.png`: the face's outline from the eyes down, the reference's green against ours red.
- `sheet-hair.png`: the hair's outline: the reference's alone red, ours alone blue, both white.
- `report.txt` (and `.json`): proportions as shares of the distance between the eye centres (eye size and opening,
  brow height, nose length and width, lips, mouth to chin, face and jaw width), the reference's beside ours; each
  feature's mean landmark error; the outline's half-width every 0.2 eye distances down from the eye line; the brows
  (the dark band above each eye, found the same way in both pictures: its height, thickness, inner and outer ends);
  the hair's overlap and its width by height.

Work one feature at a time: change the face (`FACES` / `LOOKS` in `src/entities/models/face.ts`, the hair in
`head.ts`), run it with a new tag, and compare the report and the sheets with the previous tag's.
