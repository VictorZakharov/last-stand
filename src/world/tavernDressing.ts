// The tavern's dressing: the bottles on the shelves behind the bar, the bunches of herbs hung from the beam over it,
// and what stands on the hearth's mantel (#733's follow-up). Each is one merged mesh coloured by its vertices, from a stream of its own, so the room's
// stream draws as it did and nothing built after them moves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from '../util';
import { candle, tankard, type Mats } from './rooms';
import { CLAY } from './potShelf';
import { GLAZED } from './pottery';
import { facing, pitcher, tallJug } from './potForms';

/** A bottle's outline, foot to lip (radius, height, m), and where its stopper starts (a share of its points). */
interface Form {
  outline: readonly [number, number][];
  /** the points from which up it's its stopper's colour (cork, wax), none: open */
  stopperFrom?: number;
  /** its sides round: 4 is a case bottle's square */
  sides: number;
  /** how much shelf it takes (m) */
  room: number;
  /** how likely it is, against the others */
  chance: number;
  /** its body's colours, glass or stoneware */
  bodies: readonly number[];
  /** stoneware, drawn in the pottery's clay (opaque, a glaze's soft sheen), not as glass */
  stoneware?: boolean;
}

/** glass as country bottles were blown: dark green, olive, amber, brown, a deep red, a little cobalt, one near clear */
const GLASS = [0x1f4a22, 0x3c4a1a, 0x8a5a16, 0x5a3014, 0x4a1420, 0x1a2c5a, 0x8a9a86];
/** stoneware's salt glazes: buff under a brown dip, grey */
const STONEWARE = [0xa08060, 0x8a8478, 0x6a4a2c];
/** a stopper: cork, or wax over it, red or black */
const STOPPERS = [0x9a7448, 0x9a7448, 0x7a1810, 0x1a1414];

/** the bottles' forms: a wine bottle, a squat flask, a tall slim one, a square case bottle, a stoneware jar-bottle */
const FORMS: readonly Form[] = [
  {
    outline: [[0, 0], [0.034, 0], [0.037, 0.008], [0.037, 0.16], [0.03, 0.19], [0.014, 0.215], [0.012, 0.27],
      [0.015, 0.275], [0.015, 0.285], [0.011, 0.29], [0, 0.29]],
    stopperFrom: 7, sides: 10, room: 0.085, chance: 0.34, bodies: GLASS,
  },
  {
    outline: [[0, 0], [0.04, 0], [0.055, 0.03], [0.058, 0.07], [0.045, 0.11], [0.016, 0.135], [0.013, 0.175],
      [0.016, 0.18], [0.012, 0.19], [0, 0.19]],
    stopperFrom: 6, sides: 10, room: 0.125, chance: 0.18, bodies: GLASS,
  },
  {
    outline: [[0, 0], [0.028, 0], [0.03, 0.01], [0.03, 0.2], [0.012, 0.28], [0.01, 0.32], [0.013, 0.325],
      [0.009, 0.335], [0, 0.335]],
    stopperFrom: 5, sides: 9, room: 0.07, chance: 0.18, bodies: GLASS,
  },
  {
    outline: [[0, 0], [0.042, 0], [0.046, 0.01], [0.046, 0.17], [0.03, 0.195], [0.013, 0.205], [0.013, 0.225],
      [0.009, 0.23], [0, 0.23]],
    stopperFrom: 5, sides: 4, room: 0.09, chance: 0.14, bodies: GLASS,
  },
  {
    outline: [[0, 0], [0.04, 0], [0.046, 0.02], [0.05, 0.1], [0.04, 0.16], [0.02, 0.185], [0.018, 0.21],
      [0.021, 0.215], [0.016, 0.22], [0, 0.22]],
    sides: 10, room: 0.11, chance: 0.16, bodies: STONEWARE, stoneware: true,
  },
];

/** One bottle thrown from its form: its body's colour to its stopper, a stoneware's top dipped darker. */
function bottle(form: Form, rng: () => number): THREE.BufferGeometry {
  const points = form.outline.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, form.sides);
  // (a case bottle's square turned to face the room)
  if (form.sides === 4) geometry.rotateY(Math.PI / 4);
  const body = new THREE.Color(form.bodies[Math.floor(rng() * form.bodies.length)]);
  const stopper = new THREE.Color(STOPPERS[Math.floor(rng() * STOPPERS.length)]);
  const dip = body.clone().multiplyScalar(0.55);
  const top = form.outline[form.outline.length - 1][1];
  const colours: number[] = [];
  const position = geometry.attributes.position;
  for (let k = 0; k < position.count; k++) {
    const index = k % points.length, y = position.getY(k);
    // (glass a shade lighter at the shoulder, where it's thin; stoneware dipped dark above its shoulder)
    let colour = body;
    if (form.stopperFrom !== undefined && index >= form.stopperFrom) colour = stopper;
    else if (form.stoneware && y > top * 0.62) colour = dip;
    colours.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  // (stoneware's uv on the clay's glazed row: its shine a glaze's, `clayMaterial` in pottery.ts)
  if (form.stoneware) {
    const uv = geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.5, GLAZED);
  }
  return geometry;
}

/** a form by its chance */
function pickForm(rng: () => number): Form {
  let left = rng() * FORMS.reduce((sum, form) => sum + form.chance, 0);
  for (const form of FORMS) {
    left -= form.chance;
    if (left <= 0) return form;
  }
  return FORMS[0];
}

/** The numbers the old bottles drew from the room's stream, still drawn: what's built after them (the banner) stays
 *  as it was. */
export function oldBottleDraws(rng: () => number): void {
  for (const _shelf of [0, 1]) {
    for (let x = -2.2; x < 0.2; x += 0.11 + rng() * 0.05) {
      rng();
      rng();
    }
  }
}

/** The bottles on the bar's shelves (on the east wall's frame: along x from `from` to `to`, at each of `shelves`' tops,
 *  `out` from the wall): every form, spaced by its own width, a gap now and then, one mesh. */
export function bottles(frame: THREE.Object3D, shelves: readonly number[], from: number, to: number,
  out: number): THREE.Mesh[] {
  const rng = mulberry(7341), glassMade: THREE.BufferGeometry[] = [], stonewareMade: THREE.BufferGeometry[] = [];
  for (const top of shelves) {
    let x = from;
    for (;;) {
      const form = pickForm(rng), scale = 0.85 + rng() * 0.3;
      const room = form.room * scale;
      if (x + room > to) break;
      const one = bottle(form, rng).scale(scale, scale, scale);
      // (turned so their faces aren't all alike, and set a little in or out along the shelf)
      one.rotateY(rng() * Math.PI * 2);
      one.translate(x + room / 2, top, out + (rng() - 0.5) * 0.08);
      (form.stoneware ? stonewareMade : glassMade).push(one);
      // (a gap here and there, where one's been taken down)
      x += room + 0.012 + (rng() < 0.06 ? 0.08 : 0);
    }
  }
  // (the glass a little rough: at 0.18 its facets threw star-like glints, from review)
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.15 });
  const meshes = [[glassMade, glass, 'bottles'], [stonewareMade, CLAY, 'stoneware bottles']] as const;
  return meshes.filter(([geometries]) => geometries.length).map(([geometries, material, name]) => {
    const mesh = new THREE.Mesh(mergeGeometries([...geometries]), material);
    mesh.name = name;
    mesh.castShadow = true;
    frame.add(mesh);
    return mesh;
  });
}

/** What stands on the mantel, along it from its west end (m from the hearth's middle): jugs as the shelves' are,
 *  tankards, a candle either side of its middle. Five tankards alike in a row read as one copied, and stood a
 *  centimetre over its top (from play, "cups on fireplace"). */
const ON_THE_MANTEL: readonly { at: number; thing: 'tallJug' | 'pitcher' | 'oak' | 'brass' | 'candle' }[] = [
  { at: -0.95, thing: 'tallJug' },
  { at: -0.62, thing: 'oak' },
  { at: -0.3, thing: 'candle' },
  { at: 0.55, thing: 'candle' },
  { at: 0.78, thing: 'pitcher' },
  { at: 1.02, thing: 'brass' },
];

/** The mantel's things on its top at `top`, along x from the hearth's middle `x`, `z` out from the breast. */
export function mantel(g: THREE.Object3D, M: Mats, x: number, top: number, z: number): void {
  const rng = mulberry(7361);
  for (const { at, thing } of ON_THE_MANTEL) {
    if (thing === 'oak' || thing === 'brass') tankard(g, M, x + at, top, z, thing === 'brass');
    else if (thing === 'candle') {
      // (in an iron dish: stood bare on the stone they read as sticks, from review; brass caught the hearth as a second flame)
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.014, 14), M.iron);
      dish.position.set(x + at, top + 0.007, z);
      g.add(dish);
      candle(g, M, x + at, top + 0.014, z, 0.16 + rng() * 0.05);
    }
    else {
      const jug = new THREE.Mesh(thing === 'pitcher' ? pitcher(rng) : tallJug(rng), CLAY);
      jug.rotation.y = facing(rng);
      jug.castShadow = true;
      // (set down by its lowest point as it stands turned, as the shelves' are: a thrown pot leans)
      jug.updateMatrix();
      const box = new THREE.Box3().setFromBufferAttribute(jug.geometry.attributes.position as THREE.BufferAttribute);
      jug.position.set(x + at, top - box.min.y, z);
      g.add(jug);
    }
  }
}

/** A herb's look: its stalks' and leaves' greens, and the heads at its stalks' tips, if it flowers. */
interface Herb {
  stalk: number;
  leaves: readonly number[];
  head?: number;
}

/** dried herbs as they hang: sage, thyme, lavender, yarrow, tansy, mint, gone grey-olive, straw and brown as they
 *  dry (in fresh greens they read as live fronds, from review) */
const HERBS: readonly Herb[] = [
  { stalk: 0x6a6040, leaves: [0x8a8a68, 0x7a7a5a] },
  { stalk: 0x5a4628, leaves: [0x6a6438, 0x5a5430] },
  { stalk: 0x6a6040, leaves: [0x7a7a58], head: 0x6a4a8a },
  { stalk: 0x7a6a40, leaves: [0x8a7a48, 0x9a8650], head: 0xd8cca0 },
  { stalk: 0x5a5030, leaves: [0x7a7440, 0x8a7a3a], head: 0xc09a2a },
  { stalk: 0x4a4028, leaves: [0x5a5a38, 0x6a5a34] },
];

/** A thin strip from `a` to `b`, `wide` at `a` and to a point at `b`, facing `across`; both its faces. */
function strip(into: number[], colours: number[], a: THREE.Vector3, b: THREE.Vector3, across: THREE.Vector3,
  wide: number, colour: THREE.Color): void {
  const left = a.clone().addScaledVector(across, wide / 2), right = a.clone().addScaledVector(across, -wide / 2);
  for (const [p, q, r] of [[left, right, b], [right, left, b]]) {
    into.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    for (let k = 0; k < 3; k++) colours.push(colour.r, colour.g, colour.b);
  }
}

/** One bunch hung head down from its tie at the origin: its stalks fanned out and down, leaves along them drooping,
 *  heads at their tips if it flowers, the twine round its neck. */
function bunch(herb: Herb, rng: () => number): THREE.BufferGeometry {
  const at: number[] = [], colours: number[] = [];
  // (dense and gathered: a dozen sparse stalks read as a live frond, and from play as a few specks)
  const stalks = 24 + Math.floor(rng() * 8), long = 0.34 + rng() * 0.12, spread = 0.06 + rng() * 0.035;
  const stalkColour = new THREE.Color(herb.stalk);
  for (let s = 0; s < stalks; s++) {
    const round = rng() * Math.PI * 2, out = spread * Math.sqrt(rng()), length = long * (0.75 + rng() * 0.3);
    const foot = new THREE.Vector3(Math.cos(round) * 0.008, -0.03, Math.sin(round) * 0.008);
    const tip = new THREE.Vector3(Math.cos(round) * out, -0.03 - length, Math.sin(round) * out);
    const across = new THREE.Vector3(-Math.sin(round), 0, Math.cos(round));
    strip(at, colours, foot, tip, across, 0.006, stalkColour);
    // (leaves along it, hanging from it out and down, as they dried)
    for (let l = 0; l < 5; l++) {
      const along = 0.22 + l * 0.15 + rng() * 0.05, base = foot.clone().lerp(tip, along);
      const outward = new THREE.Vector3(Math.cos(round + (rng() - 0.5) * 1.6), -0.9, Math.sin(round + (rng() - 0.5) * 1.6));
      const end = base.clone().addScaledVector(outward.normalize(), 0.04 + rng() * 0.03);
      const leaf = new THREE.Color(herb.leaves[Math.floor(rng() * herb.leaves.length)]).multiplyScalar(0.85 + rng() * 0.3);
      strip(at, colours, base, end, across, 0.024, leaf);
    }
    if (herb.head !== undefined) {
      const head = new THREE.Color(herb.head).multiplyScalar(0.85 + rng() * 0.3);
      const below = tip.clone().add(new THREE.Vector3(0, -0.035, 0));
      strip(at, colours, tip, below, across, 0.022, head);
      strip(at, colours, tip, below, new THREE.Vector3(Math.cos(round), 0, Math.sin(round)), 0.022, head);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(at, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  // (the twine round its neck and up to the beam)
  // (a bound neck of twine, wound over the stalks' ends, and the cord up to the beam)
  const twine = new THREE.CylinderGeometry(0.02, 0.017, 0.06, 7).translate(0, -0.02, 0);
  const cord = new THREE.CylinderGeometry(0.005, 0.005, 0.1, 4).translate(0, 0.05, 0);
  const tied = [twine, cord].map((piece) => {
    const plain = piece.toNonIndexed();
    const twineColour = new THREE.Color(0x8a7450), count = plain.attributes.position.count;
    plain.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () =>
      [twineColour.r, twineColour.g, twineColour.b]).flat(), 3));
    plain.deleteAttribute('uv');
    return plain;
  });
  return mergeGeometries([geometry, ...tied]);
}

/** Bunches of dried herbs hung under a beam, their ties at (x, y, z) and `n` along x a third of a metre apart: one
 *  mesh, each bunch a herb of its own. */
export function herbs(g: THREE.Object3D, x: number, y: number, z: number, n: number): THREE.Mesh {
  const rng = mulberry(7351), made: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const one = bunch(HERBS[k % HERBS.length], rng);
    one.rotateY(rng() * Math.PI * 2);
    one.rotateZ((rng() - 0.5) * 0.12);
    one.translate(x + k * 0.32 + (rng() - 0.5) * 0.06, y - 0.1, z + (rng() - 0.5) * 0.1);
    made.push(one);
  }
  const mesh = new THREE.Mesh(mergeGeometries(made), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.name = 'herbs';
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
