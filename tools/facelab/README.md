# facelab: the face harness

Compares a hero's head with a reference picture, feature by feature, so a face is tuned against measurements and
close-ups instead of screenshots judged by eye in a biome's changing light.

```bash
npm run facelab -- --setup                                  # once: a Python venv in tools/facelab/.venv and the face
                                                            # model (tools/facelab/models, not committed: research licence)
npm run facelab -- --ref path/to/reference.jpg --tag try1   # render and compare
# with a turnaround's head views and landmarks placed by hand on the reference (see below)
npm run facelab -- --ref head_front.png --turn path/to/head_ --points points.json --tag try2
```

Options: `--class warrior|mage` (the hero), `--tag name` (the output folder, `latest` by default), `--helm` (with a
head item worn), `--size 1200` (pixels), `--fov 14` (degrees: a long lens, as a portrait's), `--key 20,30` (the key
light's direction as the reference is lit: degrees round from the front, + from the picture's right, and up; the
cheeks' lightness left and right in the report shows which side it comes from), `--fill 1.3` (the soft light from all
round against the key), `--exposure 1.3` (both together, so the forehead's lightness matches the reference's). Only
these two lights light the studio: the biome's and the hero's own point lights are dimmed (they flicker, and a run
would differ from the last), and the grade's adaptation is held off (`?adapt=0`: the face's colours would follow how
much of the frame is dark hair). Two runs of the same model give the same numbers.

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
   structure tensor cell by cell: swept from a part, or combed flat). The beard: its lightness percentiles region by
   region (its dark hairs against the skin between them: a flat tone reads as a block) and the lightness down each
   cheek into it (where it starts, how softly). The mouth's width by the lips' colour, and the eyes' look: the
   reference's opening from its lid contour, ours from the eyeball the render shows (`ours-parts.png`), their width,
   height and height across them (an almond tapers to its corners, a slot stays tall), the iris against the eye and
   the white either side of it. On our render the detector's points follow its own idea of a face (they barely moved
   when our lips widened, and drew an almond round an eye that rendered as a slot): ours is measured from the
   render's own passes or colours where it matters.

4. **Shape** (the face's form, which paint and hair hide; judge it first, colour after): the head in grey clay from all
   round (`clay-*.png`, `sheet-clay.png`), lit from high to one side so its forms throw shadows, and in clay under the
   studio's own light (`ours-clay.png`). **Relief**: the lightness of forms 2 to 14 mm across, region by region
   (temples, brows, upper lids, cheekbones, cheeks, beside the nose, jaw, chin), on the reference, ours painted and ours
   in clay: whether bones stand out more than the reference's, and whether that is the shape or the paint.
   **The face's sides** as the pictures show them (the skin and beard the hair leaves in view): their widths from the
   temples to the chin and how far each bows out of a straight line.
5. **Landmarks placed by hand** (`--points`, `points.py`): the detector can't see what a beard and hair hide (the jaw's
   angles and line, the chin under the beard, the cheekbones' width under the hair), so those are placed once on the
   reference (`annotate.py grid` draws a zoomed crop with a grid in the picture's pixels to read them off;
   `annotate.py show` draws them back to check), in a JSON of `{"front": {"name": [x, y]}}`: `pupil_r/l`, `ft_r/l`
   (the face's side at the brows), `zy_r/l` (its widest at the cheekbones), `cheek_r/l` (its side at the mouth's
   corners), `go_r/l` (the jaw's angles: the corner between the side and the jaw's line), `jaw_r/l` (the jaw line's
   middle), `chin_r/l` (where it turns along the chin's bottom), `me` (the chin's bottom). Ours are found on the model
   with the same definitions (`landmarks.ts`, from its distance field) and projected by the renderer; both are laid out
   in mm from the pupils: each point, the widths at each height, how far each side bows out of a straight line from
   the temple to the jaw's angle, the jaw line's slope.
6. **A turnaround** (`--turn <prefix>`, `turn.py`): the head's front, three-quarter and side views cropped from one
   sheet (`<prefix>front.png`, `34.png`, `side.png`), so at one scale: the front view's eye spacing gives it in mm.
   The three-quarter: ours at the turn whose landmarks fit best (a sweep of 20 to 45 degrees), the points' offsets in
   mm. The side: the profile from the brow to the chin (the reference's skin and beard against the background, the
   hair over the forehead left out; ours from its silhouette rendered without the post effects), its soft-tissue
   landmarks found alike on both (glabella, nasion, nose tip, subnasale, lips, chin: `sideprofile.py`), the profile
   angles beside the norms for a man's face (facial convexity, nasofrontal, nasolabial, the lips to the E-line), and
   the profile row by row; the head's outline with the hair. `sheet-turn.png` shows each view: reference | ours | ours
   in clay | both over each other. A turnaround's "side" needn't be a profile: it is compared with ours at the side
   panel's own turn, which the 3D rebuild fits (this reference's is about 65 degrees); the profile norms are a true
   profile's.
7. **The surface** (with `--turn`; `recon.py`, `dense.py`): outlines and a few points leave the surface between them
   free, and a face sculpted to match them alone came out with flat fronts, puffed cheeks, a shelf of a brow and
   grooves. So the reference is rebuilt in 3D the way face reconstruction is done: a statistical model of real faces
   (the Basel Face Model: a mean face and 40 ways faces differ, from laser scans; 10 more for expressions) fitted to
   all three views at once (3DDFA_V2's network gives each view a start; then one shape and a pose per view by least
   squares to MediaPipe's landmarks, the side's profile and the hand-placed jaw outline; the views' turns fitted too,
   from two starts). Whatever the pictures hide comes out as a real face's would. It's kept beside the views
   (`<prefix>recon/`, `recon-views.png` shows the fit on each view) until they change. Our head is then measured
   against it everywhere, as reconstructions are scored against scans (the NoW benchmark: each point's distance to the
   other surface after a rigid alignment), the two laid together by the inner landmarks (brows, eyes, nose, mouth) of
   the face model fitted to each (they correspond one to one: a Procrustes fit, as geometric morphometrics compares
   faces), at our eyes' spacing. Three maps, each from the front and the reference's own turns (`sheet-dense.png`):
   - **ours against the reference**: where ours stands out of it (red) or sinks under it (blue), region by region in mm;
   - **ours against the real face nearest it** (the same face model fitted straight to our distance field): what it
     can't follow is where ours is unlike any real face, whatever the reference: a lump, a hollow, a shelf;
   - **our skin's curvature** on its own mesh (the distance field's Laplacian): a groove or a seam shows as a thin line,
     however the light falls; the report gives how much of the skin away from the eyes, nose and mouth is sharper than
     a 7 mm radius, and the nose on its own: its profile down the middle against a smooth curve (a hump or a crease
     between the shapes it is built from leaves it) and how much of its front and sides is hollow.
   Checked on our own renders, whose shape is known: the rebuild recovers the views' turns within a few degrees where
   it has landmarks; what the face model can't represent (fine features: the eyes' lids, the nostrils, the lips' rolls)
   shows in both maps alike, so read the nose, lips and eyes from the landmarks and close-ups instead.
8. **Fitting the shape** (`node tools/facelab/fit.mjs <out dir> [--apply]`): instead of tuning knots by hand, the face's
   shape is fitted to the surface by least squares (Levenberg-Marquardt, analysis by synthesis): the mask's knots and
   the skull's, the brow's, the jaw's and the chin's values against the distance from our skin at 6000 points of the
   rebuilt reference (`fit-target.*`, written by `dense.py`), plus the front view's widths from the hand-placed points
   where the rebuilt face doesn't reach (the face's sides), the reference's pose free but its eyes on ours. The mask
   is kept smooth, every value pulled weakly to where it was, and the knots the reference doesn't reach are held; the
   nose, lips and eyes are left out (the face model's are coarse: fitted to it, the nose came out twice as wide), and
   the lips stay where they were when the muzzle moves. Check a fit's clay views and curvature map before keeping it:
   a value driven to an extreme can leave a needle of a shape between the target's points (a crease), and a shape the
   mask makes redundant can stand out of it with grooves round it.
   A face with no picture of its own (the mage) is fitted to the real face nearest it instead: `python dense.py <out
   dir> nearest <class>` writes that face, fitted to our surface, as the target, and the fit keeps the face's own
   proportions on a surface a real face could have (its lumps and shelves smoothed away). Start it from a mask copied
   from a face that has one.

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
- `sheet-clay.png`: the shape in clay from all round, beside the reference.
- `sheet-relief.png`: the relief (forms 2 to 14 mm across) of the reference, ours painted and ours in clay.
- `sheet-sides.png`: the face's sides as each picture shows them.
- `sheet-points.png` (with `--points`): the reference's hand-placed points green, ours red.
- `sheet-turn.png` (with `--turn`): the three-quarter and side views and their outlines.
- `sheet-dense.png` (with `--turn`): ours against the rebuilt reference, against the real face nearest it, and our
  skin's curvature, each from the front and the reference's turns; `fit-target.f32` / `.json`, the fitter's target.
- `report.txt` (and `.json`): proportions as shares of the distance between the eye centres (eye size and opening,
  brow height, nose length and width, lips, mouth to chin, face and jaw width), the reference's beside ours; each
  feature's mean landmark error; the outline's half-width every 0.2 eye distances down from the eye line; the brows
  (the dark band above each eye, found the same way in both pictures: its height, thickness, inner and outer ends);
  the hair's overlap and its width by height; the regions' colours, the forehead's framing, the hair's top, ends,
  tones and flow.

Work one feature at a time: change the face (`FACES` / `LOOKS` in `src/entities/models/face.ts`, the hair in
`head.ts`), run it with a new tag, and compare the report and the sheets with the previous tag's. When the face still
doesn't look like the reference with every number close, the harness is missing a measure: add it here first.
Shape before colour: when the clay views and the profile, landmarks and relief don't match, painting won't fix it.
