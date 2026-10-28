// tools/lab hood: the mage's hood against its reference, by numbers. Tuned by eye from pictures in the forest, one
// change to its cut reshaped the whole of it (a deeper face opening buckled the capelet, a wider dome turned the back
// to a blob) and four reviews in a row failed it. Here it's read two ways:
// - its outline in the studio from the front, his left and the back, laid over the reference's (its figure cut from
//   its plain backdrop), both on one grid in the face's own unit (the eye line to the chin, `E`, from marks on the
//   reference and the head's anatomy on ours): how much of the two outlines is shared, how high the hood stands over
//   the eyes and how wide or deep it is at the crown, the temples, the chin, the neck and the shoulders;
// - its shape on the head, from its cloth, against the sizes the reference was made to (its modelling notes): how far
//   its rim stands ahead of the brow and of the cheeks and out from the cheeks, how far its point rises above the
//   scalp and how far its capelet falls below the nape; and how much it changes shape as he walks;
// - how its capelet lies on him (`hoodLie.ts`): how far it stands off his front, his shoulders and his back;
// - what its cloth costs a frame as he stands and walks (`HoodCloth.update`, by the browser's own clock).
import * as THREE from 'three';
import type { Lab, Fixture, Report, Pictured, Tile } from './lab';
import { cameraOn, shoot, studio, type Shot } from './studio';
import { G } from '../../../src/state';
import { toGroup } from '../../../src/entities/models/head';
import { EYE } from '../../../src/entities/models/face';
import { HoodCloth } from '../../../src/entities/models/hood';
import { lieCanary, lieLines, lieOf, lieRows, type CapeletMesh } from './hoodLie';
import { timeCalls, type CallTimes } from './timing';

/** A reference picture and where its face is on it (shares of the picture across and down). */
export interface HoodReference {
  url: string;
  eyes: [number, number];
  chin: [number, number];
}

export interface HoodOptions {
  fixture: Fixture;
  /** the reference's pictures from the front, his left and the back, each with its marks */
  reference?: Partial<Record<ViewName, HoodReference>>;
  /** the sizes the reference was made to (cm, the least and the most), where its marks give them */
  sizes?: Partial<Record<Size, [number, number]>>;
  /** plant the faults the measures must catch: the hood narrowed, and its rim pulled in to the face */
  canary?: boolean;
  /** list each view's outline every `EDGES_STEP` down the window, ours beside the reference's */
  edges?: boolean;
  /** list how the capelet lies on him row by row */
  rows?: boolean;
}

type ViewName = 'front' | 'left' | 'back';

/** The sides the hood is read from: the camera's way from him (he faces +z, his left +x). His left: the reference's
 *  profile faces the picture's left, as he does seen from there. */
const VIEWS: { name: ViewName; from: THREE.Vector3Tuple }[] = [
  { name: 'front', from: [0, 0, 1] },
  { name: 'left', from: [1, 0, 0] },
  { name: 'back', from: [0, 0, -1] },
];

/** the grid the outlines are read on, in `E` from the eyes (across, + to the picture's right; up, + up) and its cell */
const WINDOW = { left: -3.2, right: 3.2, top: 2.0, bottom: -2.6, cell: 0.05 };
/** the heights the outline's width (or, from the side, its reach ahead and behind) is read at, in `E` over the eyes */
const LEVELS = [
  { name: 'crown', up: 1.2 },
  { name: 'temples', up: 0.4 },
  { name: 'chin', up: -1.0 },
  { name: 'neck', up: -1.6 },
  { name: 'shoulders', up: -2.2 },
];
/** how far apart the heights `--edges` lists are (`E`) */
const EDGES_STEP = 0.2;
/** what the camera frames round the head's joint (m): across, below it (the capelet, the shoulders), above it */
const FRAME = { across: 0.3, below: 0.32, above: 0.3 };
/** how far a reference's pixel may be from its backdrop's colour and still count as backdrop (0-255 a channel) */
const BACKDROP_SLACK = 24;
/** a reference's backdrop is read from its rows down to here (a share of it): below, the figure reaches its sides */
const BACKDROP_ROWS = 0.55;
/** the sizes the first reference was made to (cm, its modelling notes), the least and the most, where a reference's
 *  marks give none of their own (`sizes`); round the cheeks, as its pictures draw them, where the notes disagree with
 *  them (4-6 cm ahead of the cheeks and out from them): from the front its opening is 10 cm out from the cheekbones at
 *  their height, and from the side the whole profile shows, its near rim behind the ear (and its far one ahead of the
 *  face, as the three-quarter view has it too: laid between them, the rim runs a little behind the cheekbones) */
const SIZES = {
  brim: { least: 6, most: 8, what: 'the rim ahead of the brow' },
  cheeks: { least: -4, most: 0, what: 'the rim ahead of the cheeks' },
  clear: { least: 7, most: 11, what: 'the rim out from the cheeks' },
  rise: { least: 5, most: 7, what: 'the point above the scalp' },
  fall: { least: 16, most: 18, what: 'the capelet below the nape' },
};
type Size = keyof typeof SIZES;
/** the most the hood's top half may change shape from its standing one as he walks (cm): a tip flipping, or the dome
 *  trailing the head as he runs (7 cm, carried as the capelet is) */
const MOST_SWAY = 4;
const STAND_FRAMES = 60;
const WALK_FRAMES = 120;
/** with --canary: how much narrower the hood is made, and how much the measures must read it so */
const CANARY_NARROW = 0.7;
const CANARY_LEAST_CLEAR = 1;
const CANARY_LEAST_TEMPLES = 0.2;

/** An outline on the grid: a cell a value, true where the figure covers it, row by row from the top. */
interface Outline {
  across: number;
  down: number;
  cells: boolean[];
}

/** Where the face is in a picture (px, down from its top) and its unit `E` (px). */
interface FaceMarks {
  eyes: THREE.Vector2;
  unit: number;
}

/** The hood's cloth: its outside's mesh and its grid (`HoodCloth`'s `userData.grid`: its columns and rows, and how far
 *  down it each row is, 0 to 1), and the row its capelet begins on if it says. */
interface HoodMesh {
  mesh: THREE.Mesh;
  across: number;
  down: number;
  rows: number[];
  capelet?: number;
}

function gridSize(): { across: number; down: number } {
  const across = Math.round((WINDOW.right - WINDOW.left) / WINDOW.cell);
  const down = Math.round((WINDOW.top - WINDOW.bottom) / WINDOW.cell);
  return { across, down };
}

/** The cell's middle in `E` from the eyes. */
function cellAt(i: number, j: number): { across: number; up: number } {
  return { across: WINDOW.left + (i + 0.5) * WINDOW.cell, up: WINDOW.top - (j + 0.5) * WINDOW.cell };
}

/** An outline read off a picture's `covered` pixels, the face where `marks` say. */
function outlineOf(covered: (x: number, y: number) => boolean, marks: FaceMarks): Outline {
  const { across, down } = gridSize();
  const cells: boolean[] = [];
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < across; i++) {
      const at = cellAt(i, j);
      const x = Math.round(marks.eyes.x + at.across * marks.unit);
      const y = Math.round(marks.eyes.y - at.up * marks.unit);
      cells.push(covered(x, y));
    }
  }
  return { across, down, cells };
}

/** The share of the two outlines' cells that both cover, of those either covers. */
function overlap(ours: Outline, theirs: Outline): number {
  let both = 0;
  let either = 0;
  for (let k = 0; k < ours.cells.length; k++) {
    if (ours.cells[k] && theirs.cells[k]) both++;
    if (ours.cells[k] || theirs.cells[k]) either++;
  }
  return either ? both / either : 0;
}

/** How far the outline reaches across at a height (`E` from the eyes), or null where it covers none of that row. */
function reachAt(outline: Outline, up: number): { from: number; to: number } | null {
  const j = Math.round((WINDOW.top - up) / WINDOW.cell - 0.5);
  let from = Infinity;
  let to = -Infinity;
  for (let i = 0; i < outline.across; i++) {
    if (!outline.cells[j * outline.across + i]) continue;
    const at = cellAt(i, j).across;
    from = Math.min(from, at - WINDOW.cell / 2);
    to = Math.max(to, at + WINDOW.cell / 2);
  }
  return from === Infinity ? null : { from, to };
}

/** How high the outline reaches over the eyes (`E`). */
function topOf(outline: Outline): number {
  for (let j = 0; j < outline.down; j++) {
    for (let i = 0; i < outline.across; i++) {
      if (outline.cells[j * outline.across + i]) return cellAt(i, j).up + WINDOW.cell / 2;
    }
  }
  return -Infinity;
}

/** The outline's readings at `LEVELS`, as a line: widths from the front and the back, reach ahead and behind from
 *  the side (the face is to the picture's left from his left). */
function readings(outline: Outline, view: ViewName): string {
  const parts = LEVELS.map((level) => {
    const reach = reachAt(outline, level.up);
    if (!reach) return `${level.name} -`;
    if (view !== 'left') return `${level.name} ${(reach.to - reach.from).toFixed(2)}`;
    return `${level.name} ${(-reach.from).toFixed(2)} ahead, ${reach.to.toFixed(2)} behind`;
  });
  return `top ${topOf(outline).toFixed(2)}; ${parts.join('; ')}`;
}

/** The outlines' edges every `EDGES_STEP` down the window, ours beside the reference's (`E` from the eyes: from the
 *  front and the back, its left and right edges on the picture; from the side, its reach ahead and behind). */
function edgeLines(ours: Outline, theirs: Outline | null, view: ViewName): string[] {
  const edges = (outline: Outline | null, up: number): string => {
    const reach = outline ? reachAt(outline, up) : null;
    if (!reach) return '-'.padStart(11);
    const [first, second] = view === 'left' ? [-reach.from, reach.to] : [reach.from, reach.to];
    return `${first.toFixed(2)} ${second.toFixed(2)}`.padStart(11);
  };
  const what = view === 'left' ? 'ahead, behind' : 'left, right';
  const lines = [`  every ${EDGES_STEP} E down (${what}): ours | the reference's`];
  for (let step = 1; WINDOW.top - step * EDGES_STEP > WINDOW.bottom; step++) {
    const up = WINDOW.top - step * EDGES_STEP;
    lines.push(`  ${up.toFixed(1).padStart(5)}: ${edges(ours, up)} | ${edges(theirs, up)}`);
  }
  return lines;
}

/** An image from a data URL, its pixels readable. */
async function pixelsOf(url: string): Promise<ImageData> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** A reference's figure: each pixel that isn't its backdrop, the backdrop's colour read row by row off its two sides
 *  (it's shaded down the picture) down to `BACKDROP_ROWS`, and the last of those below. */
function figureOf(image: ImageData): (x: number, y: number) => boolean {
  const { width, height, data } = image;
  const backdropRow = (y: number) => {
    const row = Math.min(y, Math.floor(height * BACKDROP_ROWS));
    const colour = [0, 0, 0];
    for (const x of [2, 3, 4, width - 5, width - 4, width - 3]) {
      for (let c = 0; c < 3; c++) colour[c] += data[(row * width + x) * 4 + c] / 6;
    }
    return colour;
  };
  return (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const backdrop = backdropRow(y);
    let off = 0;
    for (let c = 0; c < 3; c++) off = Math.max(off, Math.abs(data[(y * width + x) * 4 + c] - backdrop[c]));
    return off > BACKDROP_SLACK;
  };
}

/** The reference's outline from its marks. */
async function referenceOutline(reference: HoodReference): Promise<{ outline: Outline; image: ImageData }> {
  const image = await pixelsOf(reference.url);
  const eyes = new THREE.Vector2(reference.eyes[0] * image.width, reference.eyes[1] * image.height);
  const unit = (reference.chin[1] - reference.eyes[1]) * image.height;
  return { outline: outlineOf(figureOf(image), { eyes, unit }), image };
}

/** The head's group (where the face's anatomy is placed, `toGroup`) and its face. */
function headOf(lab: Lab): { group: THREE.Object3D; face: THREE.Mesh } {
  const face = lab.model.root.getObjectByName('face') as THREE.Mesh | undefined;
  if (!face?.parent) throw new Error('lab: hood: the hero has no face');
  return { group: face.parent, face };
}

/** The hood's outside, or a throw: the hero wears none. */
function hoodOf(lab: Lab): HoodMesh {
  let found: HoodMesh | undefined;
  lab.model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry.name === 'hood' && mesh.visible) {
      const grid = mesh.geometry.userData.grid as { across: number; down: number; rows: number[]; capelet?: number };
      found = { mesh, across: grid.across, down: grid.down, rows: grid.rows, capelet: grid.capelet };
    }
  });
  if (!found) throw new Error('lab: hood: the hero wears no hood (--wear helm)');
  return found;
}

/** The hood's points in the head group's space (m). */
function hoodPoints(hood: HoodMesh, group: THREE.Object3D): THREE.Vector3[] {
  const toHead = new THREE.Matrix4().copy(group.matrixWorld).invert().multiply(hood.mesh.matrixWorld);
  const at = hood.mesh.geometry.attributes.position;
  const points: THREE.Vector3[] = [];
  for (let k = 0; k < at.count; k++) points.push(new THREE.Vector3().fromBufferAttribute(at, k).applyMatrix4(toHead));
  return points;
}

/** The face's skin points (the head group's space, m). */
function skinPoints(face: THREE.Mesh): THREE.Vector3[] {
  const at = face.geometry.attributes.position;
  const points: THREE.Vector3[] = [];
  for (let k = 0; k < at.count; k++) points.push(new THREE.Vector3().fromBufferAttribute(at, k));
  return points;
}

/** The hood's shape on the head (cm), as the reference's modelling notes size it. */
function sizesOf(lab: Lab): Record<Size, number> {
  const { group, face } = headOf(lab);
  const hood = hoodOf(lab);
  const cloth = hoodPoints(hood, group);
  const skin = skinPoints(face);
  const brow = toGroup(0, EYE.y + 15, 0).y;
  const cheek = toGroup(0, EYE.y - 25, 0).y;
  const chin = toGroup(0, 0, 0).y;
  const near = (y: number, band: number) => (p: THREE.Vector3) => Math.abs(p.y - y) < band;
  // (the rim: the face's edge on each side, the fine grid's first and last columns, above the chin)
  const rim: THREE.Vector3[] = [];
  for (let row = 0; row < hood.down; row++) {
    for (const column of [0, hood.across - 1]) {
      const p = cloth[row * hood.across + column];
      if (p.y > chin) rim.push(p);
    }
  }
  const most = (points: THREE.Vector3[], of: (p: THREE.Vector3) => number) => Math.max(...points.map(of));
  const least = (points: THREE.Vector3[], of: (p: THREE.Vector3) => number) => Math.min(...points.map(of));
  const browSkin = skin.filter((p) => near(brow, 0.008)(p) && Math.abs(p.x) < 0.02);
  const cheekSkin = skin.filter(near(cheek, 0.008));
  const cheekWide = most(cheekSkin, (p) => Math.abs(p.x));
  const cheekFront = most(cheekSkin.filter((p) => Math.abs(p.x) > cheekWide * 0.6), (p) => p.z);
  const rimAtCheek = rim.filter(near(cheek, 0.015));
  const rimAtBrow = rim.filter((p) => p.y > brow && Math.abs(p.x) < 0.04);
  const behind = cloth.filter((p) => p.z < 0 && Math.abs(p.x) < 0.05);
  const nape = least(skin.filter((p) => p.z < -0.02), (p) => p.y);
  if (!browSkin.length || !cheekSkin.length || !rimAtCheek.length || !rimAtBrow.length || !behind.length) {
    throw new Error('lab: hood: the face\'s brow and cheeks or the rim at them weren\'t found');
  }
  const cm = (m: number) => m * 100;
  return {
    brim: cm(most(rimAtBrow, (p) => p.z) - most(browSkin, (p) => p.z)),
    cheeks: cm(most(rimAtCheek, (p) => p.z) - cheekFront),
    clear: cm(least(rimAtCheek, (p) => Math.abs(p.x)) - cheekWide),
    rise: cm(most(cloth, (p) => p.y) - most(skin, (p) => p.y)),
    fall: cm(nape - least(behind, (p) => p.y)),
  };
}

/** the heights the head's width is read at, in `E` over the eyes (its crown, its temples, the eyes, its cheeks), and
 *  how far round each a skin point may be and count */
const HEAD_LEVELS = [0.8, 0.4, 0, -0.4];
const HEAD_BAND = 0.05;
/** the brow's height (`E` over the eyes: `sizesOf`'s, 15 mm) and how far from the middle its skin is read (m) */
const BROW_UP = 15 / EYE.y;
const BROW_ACROSS = 0.02;

/** The head the hood is laid round, in `E` from the eyes as the outlines are read: how high its scalp rises, how far
 *  its brow stands ahead of the eyes and its skull's back behind them, and how wide it is at each `HEAD_LEVELS`. */
function headLine(lab: Lab): string {
  const skin = skinPoints(headOf(lab).face);
  const eyes = toGroup(0, EYE.y, EYE.z);
  const unit = toGroup(0, EYE.y, 0).y - toGroup(0, 0, 0).y;
  const up = (p: THREE.Vector3) => (p.y - eyes.y) / unit;
  const at = (level: number) => skin.filter((p) => Math.abs(up(p) - level) < HEAD_BAND);
  const scalp = Math.max(...skin.map(up));
  const brow = Math.max(...at(BROW_UP).filter((p) => Math.abs(p.x) < BROW_ACROSS).map((p) => p.z));
  const back = Math.min(...skin.map((p) => p.z));
  const sides = HEAD_LEVELS.map((level) => {
    const wide = Math.max(...at(level).map((p) => Math.abs(p.x)));
    return `${level.toFixed(1)}: ${(wide / unit).toFixed(2)}`;
  });
  return `the head under it, E from the eyes: its scalp ${scalp.toFixed(2)} up, its brow `
    + `${((brow - eyes.z) / unit).toFixed(2)} ahead, its skull's back ${((eyes.z - back) / unit).toFixed(2)} behind; `
    + `its half width at each height up, ${sides.join(', ')}`;
}

/** The sizes as a line, and a problem for each outside the reference's (`given`, where its marks give them). */
function sizeLines(sizes: Record<Size, number>, given: HoodOptions['sizes'], problems: string[]): string {
  const parts = (Object.keys(SIZES) as Size[]).map((size) => {
    const { what } = SIZES[size];
    const [least, most] = given?.[size] ?? [SIZES[size].least, SIZES[size].most];
    const read = sizes[size];
    if (read < least || read > most) {
      problems.push(`hood: ${what} ${read.toFixed(1)} cm, the reference's ${least} to ${most}`);
    }
    return `${what} ${read.toFixed(1)} (${least}-${most})`;
  });
  return `on the head, cm (the reference's): ${parts.join('; ')}`;
}

/** Where the face is in a studio picture of ours (px of the tile `shoot` reads, down from its top). */
function ourMarks(lab: Lab, camera: THREE.Camera, tile: { width: number; height: number }): FaceMarks {
  const { group } = headOf(lab);
  const canvas = G.renderer.getContext();
  const onTile = (point: THREE.Vector3) => {
    const ndc = point.applyMatrix4(group.matrixWorld).project(camera);
    const x = ((ndc.x + 1) / 2) * canvas.drawingBufferWidth - (canvas.drawingBufferWidth - tile.width) / 2;
    const y = ((1 - ndc.y) / 2) * canvas.drawingBufferHeight;
    return new THREE.Vector2(x, y);
  };
  const eyes = onTile(toGroup(0, EYE.y, EYE.z));
  const chin = onTile(toGroup(0, 0, EYE.z));
  return { eyes, unit: chin.y - eyes.y };
}

/** Our figure from `camera`: every mesh of his drawn flat white on black, the staff in his hand hidden (it stands up
 *  through the outline), read back as the tile `shoot` reads. */
function ourFigure(lab: Lab, scene: THREE.Scene, camera: THREE.Camera): { covered: (x: number, y: number) => boolean;
  width: number; height: number; } {
  const hidden = heldThings(lab).filter((object) => object.visible);
  for (const object of hidden) object.visible = false;
  const renderer = G.renderer;
  const background = scene.background;
  scene.background = new THREE.Color(0x000000);
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const toneMapping = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const height = gl.drawingBufferHeight;
    const width = Math.round((height * 340) / 560);
    const left = Math.round((gl.drawingBufferWidth - width) / 2);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(left, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // (read bottom up)
    const covered = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      return pixels[((height - 1 - y) * width + x) * 4] > 128;
    };
    return { covered, width, height };
  } finally {
    (scene.overrideMaterial as THREE.Material).dispose();
    scene.overrideMaterial = null;
    scene.background = background;
    renderer.toneMapping = toneMapping;
    lab.drawing = drawing;
    for (const object of hidden) object.visible = true;
  }
}

/** What he holds in his hands (the staff, a book): each of a hand joint's children but the hand drawn on it. */
function heldThings(lab: Lab): THREE.Object3D[] {
  const held: THREE.Object3D[] = [];
  for (const hand of [lab.joints.handR, lab.joints.handL]) {
    for (const child of hand.children) {
      let drawnHand = false;
      child.traverse((object) => {
        if (object.userData.drawnHand === true) drawnHand = true;
      });
      if (!drawnHand) held.push(child);
    }
  }
  return held;
}

/** The two outlines laid over each other as a tile: both white, the reference's alone red, ours alone green. */
function overlayTile(ours: Outline, theirs: Outline | null, name: string): Tile {
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = ours.across * scale;
  canvas.height = ours.down * scale;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#202024';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let j = 0; j < ours.down; j++) {
    for (let i = 0; i < ours.across; i++) {
      const k = j * ours.across + i;
      const mine = ours.cells[k];
      const theirsToo = theirs?.cells[k] ?? false;
      if (!mine && !theirsToo) continue;
      context.fillStyle = mine && theirsToo ? '#f0f0f0' : mine ? '#3fd06a' : '#e0404a';
      context.fillRect(i * scale, j * scale, scale, scale);
    }
  }
  // (the eye line and the chin)
  context.fillStyle = '#5fa8ff';
  for (const up of [0, -1]) context.fillRect(0, Math.round((WINDOW.top - up) / WINDOW.cell) * scale, canvas.width, 1);
  return { view: name, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** A picture cut to the grid's window round the face, as a tile the size of the overlay's. */
function windowTile(source: CanvasImageSource, marks: FaceMarks, name: string): Tile {
  const { across, down } = gridSize();
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = across * scale;
  canvas.height = down * scale;
  const context = canvas.getContext('2d')!;
  const sx = marks.eyes.x + WINDOW.left * marks.unit;
  const sy = marks.eyes.y - WINDOW.top * marks.unit;
  const sw = (WINDOW.right - WINDOW.left) * marks.unit;
  const sh = (WINDOW.top - WINDOW.bottom) * marks.unit;
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { view: name, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** An image of a data URL. */
async function imageOf(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** The hero's model taken into `scene` as he stands; `back` puts it back. */
function intoStudio(lab: Lab, scene: THREE.Scene): () => void {
  const root = lab.model.root;
  const parent = root.parent;
  scene.add(root);
  root.updateMatrixWorld(true);
  return () => {
    parent?.add(root);
    root.updateMatrixWorld(true);
  };
}

/** The camera on his head and shoulders from `from`. */
function cameraFrom(lab: Lab, from: THREE.Vector3Tuple): THREE.PerspectiveCamera {
  const head = lab.joints.head.getWorldPosition(new THREE.Vector3());
  const box = new THREE.Box3(
    new THREE.Vector3(head.x - FRAME.across, head.y - FRAME.below, head.z - FRAME.across),
    new THREE.Vector3(head.x + FRAME.across, head.y + FRAME.above, head.z + FRAME.across),
  );
  return cameraOn(box, from);
}

/** Each view's outline and readings, ours beside the reference's, with its pictures. */
async function outlines(lab: Lab, options: HoodOptions, lines: string[], moments: Pictured[]): Promise<Outline> {
  // (each view lit from its camera's side, as the reference's are)
  const scene = studio(true);
  const back = intoStudio(lab, scene);
  let frontOutline: Outline | null = null;
  try {
    const shots: Shot[] = VIEWS.map((view) => ({ name: view.name, camera: cameraFrom(lab, view.from) }));
    const { tiles } = shoot(lab, scene, shots);
    for (const [k, view] of VIEWS.entries()) {
      const camera = shots[k].camera;
      const figure = ourFigure(lab, scene, camera);
      const marks = ourMarks(lab, camera, figure);
      const ours = outlineOf(figure.covered, marks);
      if (view.name === 'front') frontOutline = ours;
      const reference = options.reference?.[view.name];
      const theirs = reference ? await referenceOutline(reference) : null;
      const shared = theirs ? `, ${(overlap(ours, theirs.outline) * 100).toFixed(0)}% of the outlines shared` : '';
      lines.push(`${view.name}${shared}`);
      lines.push(`  ours, E from the eyes: ${readings(ours, view.name)}`);
      if (theirs) lines.push(`  the reference's:       ${readings(theirs.outline, view.name)}`);
      if (options.edges) lines.push(...edgeLines(ours, theirs?.outline ?? null, view.name));
      const pictured = await imageOf(tiles[k].png);
      const row: Tile[] = [windowTile(pictured, marks, `${view.name}: ours`)];
      if (theirs && reference) {
        const image = await imageOf(reference.url);
        const eyes = new THREE.Vector2(reference.eyes[0] * image.naturalWidth, reference.eyes[1] * image.naturalHeight);
        const unit = (reference.chin[1] - reference.eyes[1]) * image.naturalHeight;
        row.push(windowTile(image, { eyes, unit }, `${view.name}: the reference`));
      }
      row.push(overlayTile(ours, theirs?.outline ?? null, `${view.name}: both (white), theirs (red), ours (green)`));
      moments.push({ label: view.name, tiles: row, notes: [] });
    }
  } finally {
    back();
  }
  return frontOutline!;
}

/** How the hood moves as he walks: how far its top half moves from its standing shape at most (cm, the hat's own
 *  space), and what its cloth's frames cost as he stands and walks. */
interface Sway {
  moved: number;
  cost: CallTimes;
}

/** How the hood moves and what it costs as he stands, then walks. */
async function sway(lab: Lab): Promise<Sway> {
  const hood = hoodOf(lab);
  const at = hood.mesh.geometry.attributes.position;
  // (its rows down to half its length: they're drawn finer where its creases are)
  const topHalf = hood.rows.filter((v) => v <= 0.5).length * hood.across;
  const standing: THREE.Vector3[] = [];
  const start = lab.player.pos.clone();
  const timing = timeCalls(HoodCloth.prototype, 'update');
  let most = 0;
  let cost: CallTimes;
  try {
    await lab.step(STAND_FRAMES);
    for (let k = 0; k < topHalf; k++) standing.push(new THREE.Vector3().fromBufferAttribute(at, k));
    const point = new THREE.Vector3();
    await lab.step(WALK_FRAMES, () => ({ keys: ['w'] }), () => {
      for (let k = 0; k < topHalf; k++) most = Math.max(most, point.fromBufferAttribute(at, k).distanceTo(standing[k]));
    });
  } finally {
    cost = timing.stop();
  }
  if (lab.player.pos.distanceTo(start) < 1) throw new Error('lab: hood: the hero never walked');
  if (cost.calls === 0) throw new Error('lab: hood: its cloth never stepped');
  const scale = hood.mesh.getWorldScale(new THREE.Vector3()).x;
  return { moved: most * scale * 100, cost };
}

/** How the capelet lies on him as he stands, row by row with --rows, and with --canary its canary. */
function capeletLie(lab: Lab, options: HoodOptions, problems: string[]): string[] {
  const hood = hoodOf(lab);
  if (hood.capelet === undefined) throw new Error('lab: hood: the hood says nowhere where its capelet begins');
  const capelet: CapeletMesh = { ...hood, capelet: hood.capelet };
  const held = heldThings(lab);
  const lie = lieOf(lab, capelet, held);
  const lines = lieLines(lie, problems);
  if (options.rows) lines.push(...lieRows(lie));
  if (options.canary) lines.push(lieCanary(lab, capelet, held, lie, problems));
  return lines;
}

/** The hood's meshes made narrower about the head for the canary; returns the undo. */
function narrowed(lab: Lab): () => void {
  const hood = hoodOf(lab);
  const meshes = hood.mesh.parent!.children.filter((child) => (child as THREE.Mesh).isMesh && child.userData.hoodPart);
  const parts = meshes.length ? meshes : [hood.mesh];
  for (const part of parts) {
    part.scale.x *= CANARY_NARROW;
    part.updateMatrixWorld(true);
  }
  return () => {
    for (const part of parts) {
      part.scale.x /= CANARY_NARROW;
      part.updateMatrixWorld(true);
    }
  };
}

export async function hood(lab: Lab, options: HoodOptions): Promise<Report> {
  await lab.setup(options.fixture);
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const sizes = sizesOf(lab);
  lines.push(sizeLines(sizes, options.sizes, problems));
  lines.push(headLine(lab));
  const front = await outlines(lab, options, lines, moments);
  if (options.canary) {
    const undo = narrowed(lab);
    try {
      const clear = sizesOf(lab).clear;
      const scene = studio();
      const back = intoStudio(lab, scene);
      let temples = 0;
      try {
        const camera = cameraFrom(lab, VIEWS[0].from);
        const figure = ourFigure(lab, scene, camera);
        const outline = outlineOf(figure.covered, ourMarks(lab, camera, figure));
        const was = reachAt(front, 0.4);
        const now = reachAt(outline, 0.4);
        temples = was && now ? was.to - was.from - (now.to - now.from) : 0;
      } finally {
        back();
      }
      const lost = sizes.clear - clear;
      const read = `canary, the hood ${CANARY_NARROW}x as wide: the rim ${lost.toFixed(1)} cm nearer the cheeks, `
        + `${temples.toFixed(2)} E narrower at the temples`;
      if (lost < CANARY_LEAST_CLEAR || temples < CANARY_LEAST_TEMPLES) problems.push(`missed: ${read}`);
      else lines.push(read);
    } finally {
      undo();
    }
  }
  lines.push(...capeletLie(lab, options, problems));
  const { moved, cost } = await sway(lab);
  lines.push(`walking, its top half moved at most ${moved.toFixed(1)} cm from its standing shape (${MOST_SWAY} at most)`);
  if (moved > MOST_SWAY) problems.push(`hood: its top half moved ${moved.toFixed(1)} cm from its shape as he walked`);
  lines.push(`its cloth a frame, standing and walking: ${cost.median.toFixed(2)} ms at the median, `
    + `${cost.p90.toFixed(2)} at the 90th percentile (${cost.calls} frames, by the browser's clock)`);
  return { text: lines.join('\n'), problems, moments };
}
