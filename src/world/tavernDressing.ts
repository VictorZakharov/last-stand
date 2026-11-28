// The tavern's dressing: the bottles on the shelves behind the bar, the bunches of herbs hung from the beam over it,
// and what stands on the hearth's mantel (#733's follow-up). Each is one merged mesh coloured by its vertices, from a stream of its own, so the room's
// stream draws as it did and nothing built after them moves.
import {
  Attribute, Box3, Color, floats, Geometry, LitMaterial, mergeGeometries, Mesh, Node, Vec2, Vec3,
} from '../engine/api/index.ts';
import * as shapes from '../engine/api/shapes/index.ts';
import { mulberry } from '../util';
import { candle, tankard, type Mats } from './rooms';
import { CLAY } from './potShelf';
import { GLAZED } from './pottery';
import { facing, pitcher, tallJug } from './potForms';
import { candleDish } from './candleKit';
import { LABELS, labelMaterial, labelOn, type LabelPlace } from './bottleLabels';

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
  /** stoneware, drawn in the pottery's clay (opaque and dull, a salt glaze's), not as glass */
  stoneware?: boolean;
  /** where its paper label sits, if it takes one (`bottleLabels.ts`) */
  label?: LabelPlace;
  /** its round body's run in its outline (from point, to point), which a moulding is pressed into */
  body?: readonly [number, number];
}

/** what's pressed into a glass bottle as it's blown in its mould: nothing, ribs up it, a quilt of diamonds, or a
 *  glass seal on its shoulder (from play, "not all bottles need to be flat glass, some could have engravings on them") */
type Moulding = 'plain' | 'fluted' | 'quilted' | 'seal';
/** how its glass is finished: glossy, matte (dull, as if frosted with age), or clear, its drink seen in it (from play,
 *  "some could be matte, some could be glossy, some transparent etc") */
type Finish = 'glossy' | 'matte' | 'clear';
/** the drinks a clear bottle shows: amber, a red wine's, gold, a green cordial's */
const DRINKS = [0x8a4a10, 0x4a0c12, 0xb8902c, 0x4a5a14];

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
    stopperFrom: 7, sides: 10, room: 0.085, chance: 0.34, bodies: GLASS, body: [2, 3],
    label: { from: 0.05, to: 0.13, radius: 0.037, arc: 1.5 },
  },
  {
    outline: [[0, 0], [0.04, 0], [0.055, 0.03], [0.058, 0.07], [0.045, 0.11], [0.016, 0.135], [0.013, 0.175],
      [0.016, 0.18], [0.012, 0.19], [0, 0.19]],
    stopperFrom: 6, sides: 10, room: 0.125, chance: 0.18, bodies: GLASS, body: [1, 4],
    label: { from: 0.052, to: 0.088, radius: 0.058, arc: 1.1 },
  },
  {
    outline: [[0, 0], [0.028, 0], [0.03, 0.01], [0.03, 0.2], [0.012, 0.28], [0.01, 0.32], [0.013, 0.325],
      [0.009, 0.335], [0, 0.335]],
    stopperFrom: 5, sides: 9, room: 0.07, chance: 0.18, bodies: GLASS, body: [2, 3],
    label: { from: 0.07, to: 0.17, radius: 0.03, arc: 1.6 },
  },
  {
    outline: [[0, 0], [0.042, 0], [0.046, 0.01], [0.046, 0.17], [0.03, 0.195], [0.013, 0.205], [0.013, 0.225],
      [0.009, 0.23], [0, 0.23]],
    stopperFrom: 5, sides: 4, room: 0.09, chance: 0.14, bodies: GLASS, body: [2, 3],
    // (on its flat face toward the room, 0.046 m out at its corners: 0.0325 at its faces' middles)
    label: { from: 0.05, to: 0.14, face: 0.0325, wide: 0.044 },
  },
  {
    outline: [[0, 0], [0.04, 0], [0.046, 0.02], [0.05, 0.1], [0.04, 0.16], [0.02, 0.185], [0.018, 0.21],
      [0.021, 0.215], [0.016, 0.22], [0, 0.22]],
    sides: 10, room: 0.11, chance: 0.16, bodies: STONEWARE, stoneware: true,
  },
];

/** One bottle thrown from its form: its body's colour to its stopper, a stoneware's top dipped darker. */
/** `form`'s outline, its body's run cut into `steps` rows (a moulding needs rows to be pressed into), and the run's
 *  first and last points in it */
function rowsOf(form: Form, steps: number): { points: Vec2[]; from: number; to: number } {
  const points = form.outline.map(([r, y]) => new Vec2(r, y));
  if (!form.body || steps <= 1) return { points, from: -1, to: -1 };
  const [a, b] = form.body, rows: Vec2[] = [];
  for (let k = a; k < b; k++) {
    const each = Math.max(1, Math.round(steps * (points[k + 1].y - points[k].y) / (points[b].y - points[a].y)));
    for (let step = 0; step < each; step++) rows.push(points[k].clone().lerp(points[k + 1], step / each));
  }
  return { points: [...points.slice(0, a), ...rows, ...points.slice(b)], from: a, to: a + rows.length };
}

/** each point of a moulded body's rows pressed in or out (a share of its radius) at angle `round` and `up` (0 to 1)
 *  its run */
function pressed(moulding: Moulding, round: number, up: number): number {
  // (eased in at the body's foot and shoulder, as a mould's pattern fades where the glass bends)
  const ease = Math.min(1, Math.sin(Math.PI * up) * 2.5);
  if (moulding === 'fluted') return 0.1 * ease * Math.abs(Math.cos(round * 4));
  if (moulding === 'quilted') {
    const a = round * 8 / Math.PI + up * 5, b = round * 8 / Math.PI - up * 5;
    return 0.09 * ease * Math.abs(Math.sin(Math.PI * a / 2) * Math.sin(Math.PI * b / 2));
  }
  return 0;
}

/** A seal of glass pressed onto `form`'s shoulder facing +z, a coin of the bottle's own glass. */
function sealOn(form: Form): Geometry {
  const [, b] = form.body!, [r0, y0] = form.outline[b], [r1, y1] = form.outline[b + 1];
  const r = r0 + (r1 - r0) * 0.3, y = y0 + (y1 - y0) * 0.3;
  // (leant back with the shoulder's slope)
  const lean = Math.atan2(r0 - r1, y1 - y0);
  return shapes.cylinder(0.011, 0.012, 0.006, 12).rotateX(Math.PI / 2 - lean).translate(0, y, r);
}

/** a geometry's every point in one colour (merged with the bottles, which have colours) */
function coloured(geometry: Geometry, colour: Color): Geometry {
  const colours = new Float32Array(geometry.attributes.position.count * 3);
  for (let k = 0; k < colours.length; k += 3) colour.toArray(colours, k);
  geometry.setAttribute('color', new Attribute(colours, 3));
  return geometry;
}

/** The drink in a clear bottle of `form`, filled to `fill` of its body's height: its glass's outline drawn in a little,
 *  up to there, in `colour`. */
export function drinkIn(form: Form, fill: number, colour: Color): Geometry {
  const top = form.outline[form.body![1]][1] * fill, points: Vec2[] = [];
  for (let k = 0; k < form.outline.length && form.outline[k][1] < top; k++) {
    const [r, y] = form.outline[k];
    points.push(new Vec2(r * 0.86, y + 0.004));
  }
  const last = points[points.length - 1];
  points.push(new Vec2(last.x, top), new Vec2(0, top));
  return coloured(shapes.lathe(points, form.sides), colour);
}

function bottle(form: Form, rng: () => number, moulding: Moulding = 'plain', clear = false): Geometry {
  const moulded = moulding === 'fluted' || moulding === 'quilted';
  const { points, from, to } = rowsOf(form, moulded ? 7 : 0);
  // (16 sides: two points a rib of its 8)
  const sides = moulded ? 16 : form.sides;
  let geometry: Geometry = shapes.lathe(points, sides);
  if (moulded) {
    // (a lathe's points run up its outline, then round: point k is row k % rows, turned k / rows of the way round)
    const position = geometry.attributes.position;
    for (let k = 0; k < position.count; k++) {
      const row = k % points.length;
      if (row < from || row > to) continue;
      const round = Math.floor(k / points.length) / sides * Math.PI * 2;
      const out = 1 + pressed(moulding, round, (row - from) / (to - from));
      position.setXYZ(k, position.getX(k) * out, position.getY(k), position.getZ(k) * out);
    }
    geometry.computeVertexNormals();
  }
  // (a case bottle's square turned to face the room)
  if (form.sides === 4) geometry.rotateY(Math.PI / 4);
  const body = new Color(form.bodies[Math.floor(rng() * form.bodies.length)]);
  // (clear glass tinted lighter, as thin pale glass is, the drink in it giving it its colour)
  if (clear) body.lerp(new Color(0xd8e4d0), 0.35);
  const stopper = new Color(STOPPERS[Math.floor(rng() * STOPPERS.length)]);
  const dip = body.clone().multiplyScalar(0.55);
  const top = form.outline[form.outline.length - 1][1];
  const colours: number[] = [];
  const position = geometry.attributes.position;
  // (the stopper's point in the outline, past the body's rows cut in)
  const stopperFrom = form.stopperFrom === undefined ? undefined : form.stopperFrom + points.length - form.outline.length;
  for (let k = 0; k < position.count; k++) {
    const index = k % points.length, y = position.getY(k);
    // (glass a shade lighter at the shoulder, where it's thin; stoneware dipped dark above its shoulder)
    let colour = body;
    if (stopperFrom !== undefined && index >= stopperFrom) colour = stopper;
    else if (form.stoneware && y > top * 0.62) colour = dip;
    colours.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', floats(colours, 3));
  // (stoneware's uv between the clay's two rows, `clayMaterial` in pottery.ts: a salt glaze's dull sheen. On the
  // glazed row alone it showed glass's streaks of light, from review)
  if (form.stoneware) {
    const uv = geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.5, (GLAZED + 0.75) / 2);
  }
  if (moulding === 'seal') geometry = mergeGeometries([geometry, coloured(sealOn(form), body)]);
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
export function bottles(frame: Node, shelves: readonly number[], from: number, to: number,
  out: number): Mesh[] {
  const rng = mulberry(7341), glassMade: Geometry[] = [], stonewareMade: Geometry[] = [];
  const labelsMade: Geometry[] = [], matteMade: Geometry[] = [];
  const clearMade: Geometry[] = [];
  for (const top of shelves) {
    let x = from;
    let last: Form | null = null;
    let lastLabel = -1;
    for (;;) {
      // (never one form twice side by side: two alike in a row read as one copied, from review)
      let form = pickForm(rng);
      while (form === last) form = pickForm(rng);
      last = form;
      const scale = 0.85 + rng() * 0.3;
      const room = form.room * scale;
      if (x + room > to) break;
      // (in two rows, a back one and a front one, not stood along one line as on a till: from review, "lined up")
      const back = rng() < 0.45, depth = out + (back ? -0.05 : 0.03) + (rng() - 0.5) * 0.03;
      // (turned a little, its label toward the room)
      const turn = (rng() - 0.5) * 1.2;
      const place = (geometry: Geometry): Geometry => geometry.scale(scale, scale, scale)
        .rotateY(turn).translate(x + room / 2, top, depth);
      const mould = rng(), moulding: Moulding = !form.body || form.sides === 4 || form.stoneware ? 'plain'
        : mould < 0.18 ? 'fluted' : mould < 0.3 ? 'quilted' : mould < 0.42 ? 'seal' : 'plain';
      // (pressed glass glossy, its pattern caught by the light: matte, a fluted bottle read as plain)
      const pressedGlass = moulding === 'fluted' || moulding === 'quilted';
      const shine = rng();
      const finish: Finish = form.stoneware ? 'matte' : pressedGlass || shine < 0.45 ? 'glossy'
        : shine < 0.75 ? 'matte' : 'clear';
      const made = place(bottle(form, rng, moulding, finish === 'clear'));
      if (form.stoneware) stonewareMade.push(made);
      else (finish === 'clear' ? clearMade : finish === 'matte' ? matteMade : glassMade).push(made);
      // (a clear bottle's drink in it, a third to most of the way up)
      if (finish === 'clear') {
        const drink = new Color(DRINKS[Math.floor(rng() * DRINKS.length)]);
        glassMade.push(place(drinkIn(form, 0.35 + rng() * 0.5, drink)));
      }
      // (most glass bottles labelled, a few bare, and few with a pattern pressed into the glass where it'd go)
      const labelled = form.label && rng() < (moulding === 'fluted' || moulding === 'quilted' ? 0.25 : 0.8);
      if (labelled) {
        // (never the last label again: two MEADs side by side read as one copied, from review)
        let label = Math.floor(rng() * LABELS);
        while (label === lastLabel) label = Math.floor(rng() * LABELS);
        lastLabel = label;
        labelsMade.push(place(labelOn(form.label!, label)));
      }
      // (close or a little apart, a gap where one's been taken down; a back one leaves room for the next before it)
      x += room * (back ? 0.75 : 1) + 0.004 + rng() * 0.02 + (rng() < 0.06 ? 0.08 : 0);
    }
  }
  // (the glass a little rough: at 0.18 its facets threw star-like glints, from review)
  // (glossy glass, dulled glass, and clear glass the drink shows through, drawn after what's behind it)
  const glass = new LitMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.15 });
  // (dull, not dead: at 0.6 it read as "fired clay or cardboard", from review)
  const matte = new LitMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.1 });
  const clear = new LitMaterial({
    vertexColors: true, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false,
  });
  const meshes = [
    [glassMade, glass, 'bottles'], [matteMade, matte, 'matte bottles'], [clearMade, clear, 'clear bottles'],
    [stonewareMade, CLAY, 'stoneware bottles'],
    [labelsMade, labelMaterial(), 'bottle labels'],
  ] as const;
  return meshes.filter(([geometries]) => geometries.length).map(([geometries, material, name]) => {
    const mesh = new Mesh(mergeGeometries([...geometries]), material);
    mesh.name = name;
    mesh.castShadow = material !== clear;
    frame.add(mesh);
    return mesh;
  });
}

/** What stands on the mantel, along it from its west end (m from the hearth's middle): jugs as the shelves' are,
 *  tankards, two candles, none mirrored across its middle (from review, "a staged, symmetric row"). Five tankards alike in a row read as one copied, and stood a
 *  centimetre over its top (from play, "cups on fireplace"). */
const ON_THE_MANTEL: readonly { at: number; thing: 'tallJug' | 'pitcher' | 'oak' | 'brass' | 'candle' }[] = [
  { at: -0.98, thing: 'tallJug' },
  { at: -0.72, thing: 'candle' },
  { at: -0.5, thing: 'oak' },
  { at: 0.3, thing: 'brass' },
  { at: 0.62, thing: 'candle' },
  { at: 0.95, thing: 'pitcher' },
];

/** The mantel's things on its top at `top`, along x from the hearth's middle `x`, `z` out from the breast. */
export function mantel(g: Node, M: Mats, x: number, top: number, z: number): void {
  const rng = mulberry(7361);
  for (const { at, thing } of ON_THE_MANTEL) {
    if (thing === 'oak' || thing === 'brass') tankard(g, M, x + at, top, z, thing === 'brass');
    else if (thing === 'candle') {
      // (in an iron dish: stood bare on the stone they read as sticks, from review; brass caught the hearth as a second flame)
      // (the lectern's dish, `candleKit.ts`: its well 6 mm up)
      const dish = new Mesh(candleDish(), M.iron);
      dish.position.set(x + at, top, z);
      g.add(dish);
      candle(g, M, x + at, top + 0.006, z, 0.13 + rng() * 0.06);
    }
    else {
      const jug = new Mesh(thing === 'pitcher' ? pitcher(rng) : tallJug(rng), CLAY);
      jug.rotation.y = facing(rng);
      jug.castShadow = true;
      // (set down by its lowest point as it stands turned, as the shelves' are: a thrown pot leans)
      jug.updateMatrix();
      const box = new Box3().setFromBufferAttribute(jug.geometry.attributes.position as Attribute);
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
function strip(into: number[], colours: number[], a: Vec3, b: Vec3, across: Vec3,
  wide: number, colour: Color, endWide = 0): void {
  const left = a.clone().addScaledVector(across, wide / 2), right = a.clone().addScaledVector(across, -wide / 2);
  const endLeft = b.clone().addScaledVector(across, endWide / 2), endRight = b.clone().addScaledVector(across, -endWide / 2);
  // (both faces; a quad where it keeps a width to its end)
  const faces = endWide > 0
    ? [[left, right, endRight], [left, endRight, endLeft], [right, left, endRight], [endRight, left, endLeft]]
    : [[left, right, b], [right, left, b]];
  for (const [p, q, r] of faces) {
    into.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    for (let k = 0; k < 3; k++) colours.push(colour.r, colour.g, colour.b);
  }
}

/** One bunch hung head down from its tie at the origin: its stalks fanned out and down, leaves along them drooping,
 *  heads at their tips if it flowers, the twine round its neck. */
function bunch(herb: Herb, rng: () => number): Geometry {
  const at: number[] = [], colours: number[] = [];
  // (dense and gathered: a dozen sparse stalks read as a live frond, and from play as a few specks)
  const stalks = 24 + Math.floor(rng() * 8), long = 0.34 + rng() * 0.12, spread = 0.06 + rng() * 0.035;
  const stalkColour = new Color(herb.stalk);
  for (let s = 0; s < stalks; s++) {
    const round = rng() * Math.PI * 2, out = spread * Math.sqrt(rng()), length = long * (0.75 + rng() * 0.3);
    const foot = new Vec3(Math.cos(round) * 0.008, -0.03, Math.sin(round) * 0.008);
    const tip = new Vec3(Math.cos(round) * out, -0.03 - length, Math.sin(round) * out);
    const across = new Vec3(-Math.sin(round), 0, Math.cos(round));
    strip(at, colours, foot, tip, across, 0.006, stalkColour);
    // (leaves along it, hanging from it out and down, as they dried)
    for (let l = 0; l < 5; l++) {
      const along = 0.22 + l * 0.15 + rng() * 0.05, base = foot.clone().lerp(tip, along);
      const outward = new Vec3(Math.cos(round + (rng() - 0.5) * 1.6), -0.9, Math.sin(round + (rng() - 0.5) * 1.6));
      const end = base.clone().addScaledVector(outward.normalize(), 0.04 + rng() * 0.03);
      const leaf = new Color(herb.leaves[Math.floor(rng() * herb.leaves.length)]).multiplyScalar(0.85 + rng() * 0.3);
      strip(at, colours, base, end, across, 0.024, leaf);
    }
    if (herb.head !== undefined) {
      // (a spike on down the stalk's end, as wide at its end as its foot, two crossed: tapered to a point, the heads read
      // as "triangle confetti", from review)
      const head = new Color(herb.head).multiplyScalar(0.85 + rng() * 0.3);
      const start = foot.clone().lerp(tip, 0.88);
      const below = tip.clone().addScaledVector(tip.clone().sub(foot).normalize(), 0.028);
      const facingOut = new Vec3(Math.cos(round), 0, Math.sin(round));
      strip(at, colours, start, below, across, 0.011, head, 0.008);
      strip(at, colours, start, below, facingOut, 0.011, head, 0.008);
    }
  }
  const geometry = new Geometry();
  geometry.setAttribute('position', floats(at, 3));
  geometry.setAttribute('color', floats(colours, 3));
  geometry.computeVertexNormals();
  // (the twine round its neck and up to the beam)
  // (a bound neck of twine, wound over the stalks' ends, and the cord up to the beam)
  const twine = shapes.cylinder(0.02, 0.017, 0.06, 7).translate(0, -0.02, 0);
  const cord = shapes.cylinder(0.005, 0.005, 0.1, 4).translate(0, 0.05, 0);
  const tied = [twine, cord].map((piece) => {
    const plain = piece.toNonIndexed();
    const twineColour = new Color(0x8a7450), count = plain.attributes.position.count;
    plain.setAttribute('color', floats(Array.from({ length: count }, () =>
      [twineColour.r, twineColour.g, twineColour.b]).flat(), 3));
    plain.deleteAttribute('uv');
    return plain;
  });
  return mergeGeometries([geometry, ...tied]);
}

/** Bunches of dried herbs hung under a beam, their ties at (x, y, z) and `n` along x a third of a metre apart: one
 *  mesh, each bunch a herb of its own. */
export function herbs(g: Node, x: number, y: number, z: number, n: number): Mesh {
  const rng = mulberry(7351), made: Geometry[] = [];
  for (let k = 0; k < n; k++) {
    const one = bunch(HERBS[k % HERBS.length], rng);
    one.rotateY(rng() * Math.PI * 2);
    one.rotateZ((rng() - 0.5) * 0.12);
    one.translate(x + k * 0.32 + (rng() - 0.5) * 0.06, y - 0.1, z + (rng() - 0.5) * 0.1);
    made.push(one);
  }
  const mesh = new Mesh(mergeGeometries(made), new LitMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.name = 'herbs';
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
