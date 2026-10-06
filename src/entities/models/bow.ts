// The ranger's recurve bow as a working spring, and its arrows. Its limbs bend as the string is drawn: the string keeps
// its length, so as the nock goes back the tips come back and in, each limb bending along its working part and not in
// its stiff recurved tip. Loosed, the limbs spring forward past rest and ring out. The bow's own frame: the grip's pivot at
// the origin, +y up its limbs, +z its back (towards the target), +x the archer's left; metres at the model's scale.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperTube, twist, scaleUV } from './armor';
import { clamp } from '../../util';

/** half the riser's length, to the limbs' pockets, which stand this far in front of the grip (a deflexed riser) */
const RISER = 0.24, POCKET_Z = 0.03;
/** each limb's length along it, and the share of it that bends (the recurve beyond it is stiff) */
const LIMB = 0.5, WORK = 0.72;
/** the braced limb: its lean back from the pocket (rad), its curve back along the working part and forward round the recurve (rad/m) */
const LEAN = 0.25, CURVE = 1.6, RECURVE = -5;
/** the arrow's rest above the grip's pivot, on the riser's shelf (the string's nocking point is level with it) */
export const REST_Y = 0.045;
/** the fist's middle on the grip (the bow's frame), below the shelf, and the grip's radius */
export const GRIP = new THREE.Vector3(0, -0.0185, 0.003), GRIP_R = 0.022;
/** a fan's arrows lie side by side in the window, all on its face, `FAN_PITCH` apart up the bow from the rest (m: their
 *  heads' sockets just apart), nocked as far apart along a stretch of string the fingers hold straight, so they lie
 *  parallel and fan out only in flight (fanned out from one nock across the flat bow's top, each lay on what it crossed,
 *  a limb, the riser or the fist, 2 to 5 cm higher or lower than the next) */
export const FAN_PITCH = 2 * 0.0066 + 0.0004;
/** half the string the fingers hold straight for `n` arrows side by side (m) */
export const fanHold = (n: number): number => (Math.max(1, n) - 1) / 2 * FAN_PITCH;
/** an arrow (38 in: as long as the hero's draw, which is what his arms reach, and its head out past the riser at full draw;
 *  at 30 in it stopped short of the riser) and its shaft's radius */
export const ARROW = 0.96;
const SHAFT = 0.0055;
const SEG = 18, RING = 12;
/** the serving's length up and down the string from where it's nocked (m) */
const SERVE = 0.0425;
/** the shelf the arrow lies on, and the sight window above it, cut past the riser's middle on its right (the bow's frame,
 *  m): the riser no further to the right than `x` from the shelf up to `top`, coming out again in a curve `round` high
 *  above it, the shelf's edge bevelled `bevel` down; the arrow passes at x 0, beside it, on a leather pad (through a round
 *  riser, it ran 3 to 5 cm through the riser and the grip's brass collar at every shot). On the right, as the bow is
 *  canted to the left, so the arrow lies against the riser and the window faces up, to the eyes (on the left it faced
 *  down, away from them, and the riser leaning over it hid the arrow: through the eyes it went in behind the riser). Tall
 *  enough for a fan's five arrows side by side (`FAN_PITCH`) */
const SHELF = REST_Y - SHAFT, WINDOW = { x: SHAFT + 0.0013, top: 0.108, round: 0.03, bevel: 0.0025 };
/** the riser's radius by height: wider under the grip's leather, slimmer up to the limbs' pockets */
const RISER_R: [number, number][] = [[-0.25, 0.017], [-0.17, 0.019], [-0.075, 0.0205], [0.035, 0.0205], [0.07, 0.0185], [0.13, 0.0163], [0.2, 0.016], [0.25, 0.017]];
const riserR = (y: number): number => {
  const k = RISER_R.findIndex(([ky]) => ky >= y);
  if (k <= 0) return RISER_R[k < 0 ? RISER_R.length - 1 : 0][1];
  const [y0, r0] = RISER_R[k - 1], [y1, r1] = RISER_R[k];
  return r0 + (r1 - r0) * THREE.MathUtils.smoothstep(y, y0, y1);
};

/** The riser: a tube along `pts`, its rings `n` evenly along it and more at the shelf and round the window's top, each
 *  level with its seam on the bow's back (+z), cut past the middle at the window (each point there no further left than
 *  the window's face), closed at both ends. (Square to the curve, which leans to the right above the grip, the rings
 *  tilted and the shelf's edge stood 4 mm up into the arrow) */
function riserGeometry(pts: THREE.Vector3[], n: number, radial: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const tAt = (y: number): number => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (curve.getPointAt(m).y < y) lo = m; else hi = m; } return (lo + hi) / 2; };
  const ts = Array.from({ length: n + 1 }, (_, i) => i / n);
  ts.push(tAt(SHELF - WINDOW.bevel), tAt(SHELF));
  for (let k = 0; k <= 8; k++) ts.push(tAt(WINDOW.top + WINDOW.round * k / 8));
  ts.sort((a, b) => a - b);
  const rings = ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-4);
  // (the most to the right the riser may be at a height)
  const limit = (y: number): number => (y < SHELF - WINDOW.bevel / 2 ? -Infinity : y <= WINDOW.top ? WINDOW.x
    : y >= WINDOW.top + WINDOW.round ? -Infinity : WINDOW.x - WINDOW.round * (1 - Math.sqrt(1 - ((y - WINDOW.top) / WINDOW.round) ** 2)));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const c = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3();
  rings.forEach((t) => {
    curve.getPointAt(t, c);
    const r = riserR(c.y), lim = limit(c.y);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      pos.push(Math.max(lim, c.x + Math.sin(a) * r), c.y, c.z + Math.cos(a) * r);
      uv.push((k / radial) * 2, t * 5);
    }
  });
  const R = radial + 1;
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < radial; k++) {
    const a = i * R + k, b = a + 1, d = a + R, e = d + 1;
    idx.push(a, b, d, b, e, d);
  }
  // (each end closed with a point a little past it)
  [0, 1].forEach((end) => {
    curve.getPointAt(end, c); curve.getTangentAt(end, T);
    const tip = pos.length / 3, r = riserR(c.y) * (end ? 0.8 : -0.8), ring = end ? (rings.length - 1) * R : 0;
    pos.push(c.x + T.x * r, c.y + T.y * r, c.z + T.z * r); uv.push(1, end * 5);
    for (let k = 0; k < radial; k++) { const a = ring + k; if (end) idx.push(a, a + 1, tip); else idx.push(a, tip, a + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (the seam's two copies of each point shaded alike)
  const N = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < rings.length; i++) {
    const a = i * R, b = a + radial;
    B.set(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize();
    N.setXYZ(a, B.x, B.y, B.z); N.setXYZ(b, B.x, B.y, B.z);
  }
  return g;
}
/** the brass vine inlaid down each limb's belly (the face the archer sees, through his eyes all of the bow he does): from
 *  `from` to `to` of the limb, its stem waving `wave` (m) either side `turns` times, a leaf at each turn; `n` points along it */
const VINE = { from: 0.04, to: 0.64, wave: 0.0052, turns: 6, stem: 0.0012, leaf: [0.0105, 0.0028], n: 48 };

/** how far the string is pulled (0..1 of the full draw) after `k` of the draw's time: quick at first, slowing into the
 *  anchor as the weight builds (a bow's draw force rises with the draw) */
export const pullAt = (k: number): number => 1 - (1 - clamp(k, 0, 1)) ** 2;

/** the braced limb's angle back from +y at `s` along it, and how much of an added bend reaches there (the working part bends, the recurve barely) */
const braced = (s: number): number => (s < WORK * LIMB ? LEAN + CURVE * s : LEAN + CURVE * WORK * LIMB + RECURVE * (s - WORK * LIMB));
const worked = (s: number): number => Math.min(s, WORK * LIMB) + Math.max(0, s - WORK * LIMB) * 0.15;

/** the upper limb's centre line (y, z pairs from the pocket to the tip) with `bend` added (rad/m along its working part) */
function limbLine(bend: number, out: Float64Array): Float64Array {
  let y = RISER, z = POCKET_Z;
  out[0] = y; out[1] = z;
  const ds = LIMB / SEG;
  for (let i = 0; i < SEG; i++) {
    const s = (i + 0.5) * ds, phi = braced(s) + bend * worked(s);
    y += Math.cos(phi) * ds; z -= Math.sin(phi) * ds;
    out[i * 2 + 2] = y; out[i * 2 + 3] = z;
  }
  return out;
}

/** `g` (made non-indexed) painted one colour, scaled by `shade` (of its local position) if given */
function paint(g: THREE.BufferGeometry, c: number, shade?: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g, col = new THREE.Color(c), n = out.attributes.position.count, a = new Float32Array(n * 3), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const k = shade ? shade(p.fromBufferAttribute(out.attributes.position, i)) : 1;
    a[i * 3] = col.r * k; a[i * 3 + 1] = col.g * k; a[i * 3 + 2] = col.b * k;
  }
  out.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'color') out.deleteAttribute(k);
  return out;
}
/** the arrow's colours: the shaft, the head's steel (its socket), its honed edges and its ridge, the thread, the nock, the
 *  cock feather and the other two */
const COL = { shaft: 0xb48a55, steel: 0xb9c1c8, edge: 0xe4e9ed, ridge: 0x7d868e, wrap: 0x2f4a2a, nock: 0x5a4030, cock: 0x9a2e22, hen: 0xcfc4a6 };
/** how far the head's socket and binding reach back from its point, and the feathers' and their binding's forward from the nock */
const HEAD_BACK = 0.108, REAR = 0.142;
/** a leaf-shaped broadhead along +z, its point at z 0: diamond in section, its edges honed bright and its ridge dark; then
 *  the steel socket it's set on, and the thread binding that on behind */
function headParts(): THREE.BufferGeometry[] {
  const L = 0.07, rows = 10, pos: number[] = [], col: number[] = [];
  const e = new THREE.Color(COL.edge), r = new THREE.Color(COL.ridge);
  const ring = (i: number): [number, number, number, THREE.Color][] => {
    const t = i / rows, w = 0.0135 * Math.sin(Math.PI * Math.min(1, t * 1.15) ** 0.85) + (i === 0 ? 0.0045 : 0), d = 0.0022 * (1 - t) + 0.0004, z = -L + t * L;
    return [[w, 0, z, e], [0, d, z, r], [-w, 0, z, e], [0, -d, z, r]];
  };
  for (let i = 0; i < rows; i++) {
    const A = ring(i), B = ring(i + 1);
    for (let q = 0; q < 4; q++) {
      const q1 = (q + 1) % 4;
      for (const v of [A[q], B[q], A[q1], B[q], B[q1], A[q1]]) { pos.push(v[0], v[1], v[2]); col.push(v[3].r, v[3].g, v[3].b); }
    }
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return [blade,
    paint(new THREE.CylinderGeometry(0.0058, 0.0066, 0.03, 8).rotateX(Math.PI / 2).translate(0, 0, -L - 0.012), COL.steel),
    paint(new THREE.CylinderGeometry(SHAFT + 0.0011, SHAFT + 0.0011, 0.012, 8).rotateX(Math.PI / 2).translate(0, 0, -HEAD_BACK + 0.006), COL.wrap)];
}
/** the arrow's back end along +z from its nock (z 0): a horn nock with its slot for the string, three feathers cut to a
 *  shield's shape (the cock feather red, out from the bow: +x; darker towards the shaft), and the thread binding them on */
function rearParts(): THREE.BufferGeometry[] {
  const parts = [paint(new THREE.CylinderGeometry(0.0062, 0.0056, 0.016, 8).rotateX(Math.PI / 2).translate(0, 0, 0.008), COL.nock)];
  for (const x of [-0.0031, 0.0031]) parts.push(paint(new THREE.BoxGeometry(0.0016, 0.0062, 0.0055).translate(x, 0, -0.0022), COL.nock));
  for (const z of [0.022, REAR - 0.007]) parts.push(paint(new THREE.CylinderGeometry(SHAFT + 0.0011, SHAFT + 0.0011, 0.01, 8).rotateX(Math.PI / 2).translate(0, 0, z), COL.wrap));
  // (the feather's outline along the shaft (z) and out from it (h): low at its front, full along most of it, square at its back)
  const outline = [[0.027, 0], [0.13, 0], [0.13, 0.011], [0.124, 0.0178], [0.106, 0.019], [0.082, 0.0176], [0.062, 0.0145], [0.046, 0.0095], [0.034, 0.0045]];
  const shape = new THREE.Shape(outline.map(([z, h]) => new THREE.Vector2(z, h)));
  for (let i = 0; i < 3; i++) {
    const f = new THREE.ShapeGeometry(shape), P = f.attributes.position;
    for (let k = 0; k < P.count; k++) P.setXYZ(k, 0, SHAFT + P.getY(k), P.getX(k));
    parts.push(paint(f, i ? COL.hen : COL.cock, (q) => 0.62 + 0.38 * Math.min(1, (q.y - SHAFT) / 0.016)).rotateZ(-Math.PI / 2 + i * Math.PI * 2 / 3));
  }
  return parts;
}
/** the shaft along +z, a unit long from z 0 */
const shaftPart = (): THREE.BufferGeometry => paint(new THREE.CylinderGeometry(SHAFT, SHAFT, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), COL.shaft);

/** An arrow along +z, centred on its middle: a wooden shaft, a steel broadhead on its socket, three feathers and a horn
 *  nock, each bound on with thread, in vertex colours (its material double-sided, for the feathers). */
let arrowGeo: THREE.BufferGeometry | null = null;
export function arrowGeometry(): THREE.BufferGeometry {
  if (arrowGeo) return arrowGeo;
  const h = ARROW / 2;
  arrowGeo = mergeGeometries([
    ...rearParts().map((g) => g.translate(0, 0, -h)),
    shaftPart().scale(1, 1, ARROW - REAR - HEAD_BACK + 0.02).translate(0, 0, -h + REAR - 0.01),
    ...headParts().map((g) => g.translate(0, 0, h)),
  ])!;
  arrowGeo.computeVertexNormals();
  return arrowGeo;
}

/** An arrow in pieces from its nock (z 0) forward along +z, for one drawn out of a quiver a part at a time: the nock and
 *  feathers (`rear`, 14 cm), the shaft a unit long (scaled to what's out), and the head (`head`, its point at z 0). */
export function arrowPieces(): { rear: THREE.BufferGeometry; shaft: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const rear = mergeGeometries(rearParts())!, head = mergeGeometries(headParts())!, shaft = shaftPart();
  for (const g of [rear, head, shaft]) g.computeVertexNormals();
  return { rear, shaft, head };
}

export interface BowMaterials {
  riser: THREE.Material; grip: THREE.Material; string: THREE.Material; arrow: THREE.Material;
  /** the limbs (vertex-coloured: pale sapwood on the back, heartwood on the belly), their horn tips, the brass fittings,
   *  the dark serving and bindings, and the wool silencers on the string */
  limb: THREE.Material; horn: THREE.Material; brass: THREE.Material; serving: THREE.Material; yarn: THREE.Material;
  /** the gilt vine down the limbs' bellies (less of a mirror than the brass: in the belly's shade, brass showed the dark) */
  inlay: THREE.Material;
}

/** the limbs' wood (sRGB) on the back and on the belly, and the bow wood maps' mean albedo (linear) they're tinted against */
const SAPWOOD = new THREE.Color(0xbd9160), HEARTWOOD = new THREE.Color(0x9c5a34), WOOD_MEAN = [0.53, 0.53, 0.53];
/** each geometry non-indexed with a position, normal and uv (made up if it has none), merged */
function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = list.map((g) => {
    const o = g.index ? g.toNonIndexed() : g;
    if (!o.attributes.normal) o.computeVertexNormals();
    if (!o.attributes.uv) o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
    return o;
  });
  return mergeGeometries(clean)!;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Bow {
  /** the bow's frame (see the file header): place it on the hand */
  readonly group = new THREE.Group();
  /** the string's rest from the grip's pivot (its brace height) and its length */
  readonly brace: number;
  private readonly stringLen: number;
  /** the string's nocking point as last set (the middle of what the fingers hold), and the limbs' tips (the bow's frame) */
  readonly nock = new THREE.Vector3();
  readonly tipU = new THREE.Vector3();
  readonly tipL = new THREE.Vector3();
  /** the limbs' added bend as last set (rad/m) */
  bend = 0;
  private readonly line = new Float64Array(SEG * 2 + 2);
  private readonly limbGeo: THREE.BufferGeometry;
  private readonly strings: THREE.Mesh[];
  /** the serving on each half from the held stretch, and on that stretch */
  private readonly servings: THREE.Mesh[];
  private readonly held: THREE.Mesh;
  private readonly bead: THREE.Mesh;
  /** the horn tips on the limbs, and the silencers on the string's halves */
  private readonly caps: THREE.Mesh[];
  /** the vine's geometry, shared by both limbs (each a child of its limb, the lower mirrored with it) */
  private readonly vineGeo: THREE.BufferGeometry;
  private readonly silencers: THREE.Mesh[];
  /** the nocked arrows (one, or a fan) */
  readonly arrows: THREE.Mesh[] = [];
  /** half the string the draw fingers hold straight (m: `fanHold`), its middle the nocking point, a fan's arrows nocked side
   *  by side along it; the line through the rest is that much higher up the bow (`restY`). Set before `set` */
  hold = 0;

  constructor(m: BowMaterials) {
    const g = this.group;
    g.name = 'bow';
    limbLine(0, this.line);
    this.brace = -this.line[SEG * 2 + 1];
    this.stringLen = 2 * Math.hypot(this.line[SEG * 2], 0);
    // the riser: the grip in the hand, the shelf the arrow lies on, the window cut past the middle (the arrow passes at x 0,
    // beside it; the riser bends away to the left above the grip, so there's wood left beside the window) and the pockets
    const riser = [new THREE.Vector3(0, -RISER - 0.01, POCKET_Z), new THREE.Vector3(0, -0.14, 0.022), new THREE.Vector3(0, -0.05, 0.004), new THREE.Vector3(0, 0.025, 0),
      new THREE.Vector3(0.011, 0.075, 0.007), new THREE.Vector3(0.012, 0.15, 0.018), new THREE.Vector3(0, RISER + 0.01, POCKET_Z)];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true, name = '') => { const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = shadow; mesh.name = name; g.add(mesh); return mesh; };
    add(riserGeometry(riser, 72, 16), m.riser, true, 'riser');
    // where the riser runs at a height: its centre, its radius there and its lean
    const curve = new THREE.CatmullRomCurve3(riser);
    const at = (y: number): { p: THREE.Vector3; r: number; lean: number } => {
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (curve.getPointAt(mid).y < y) lo = mid; else hi = mid; }
      const t = (lo + hi) / 2, d = curve.getTangentAt(t);
      return { p: curve.getPointAt(t), r: riserR(y), lean: Math.atan2(d.z, d.y) };
    };
    // the grip: leather wrapped in a raised spiral of thong between two brass collars, below the shelf; the shelf a leather
    // pad round the riser, its top just under the arrow, and a strip of leather on the window's face beside the arrow
    const GRIP_L = 0.1, GRIP_Y = GRIP.y;
    const sh = at(SHELF - 0.002), pad = sh.r + 0.0008;
    add(merged([
      scaleUV(new THREE.CylinderGeometry(0.0222, 0.0222, GRIP_L, 16), 2, 2).translate(0, GRIP_Y, GRIP.z),
      twist(GRIP_L * 0.94, 0.0226, 0.0021, 7).translate(0, GRIP_Y + GRIP_L * 0.47, GRIP.z),
      new THREE.CylinderGeometry(pad, pad, 0.0036, 18).translate(sh.p.x, SHELF - 0.0002 - 0.0018, sh.p.z),
      new THREE.BoxGeometry(0.0008, 0.017, 0.022).translate(WINDOW.x - 0.0004, SHELF + 0.0085, at(SHELF + 0.0085).p.z),
    ]), m.grip, true, 'grip');
    // brass: collars at the grip's ends, rings out towards the limbs, and a leaf inlaid on the riser's face to the archer
    // (-z, which is all he sees of it through his own eyes); dark sinew bound round the riser inside each ring
    const brass: THREE.BufferGeometry[] = [], sinew: THREE.BufferGeometry[] = [];
    for (const y of [GRIP_Y - GRIP_L / 2 - 0.003, GRIP_Y + GRIP_L / 2 + 0.003]) brass.push(new THREE.CylinderGeometry(0.0236, 0.0236, 0.006, 18).translate(0, y, GRIP.z));
    for (const y of [-0.19, 0.19]) {
      const c = at(y), c2 = at(y - Math.sign(y) * 0.016);
      brass.push(new THREE.CylinderGeometry(c.r + 0.0016, c.r + 0.0016, 0.007, 18).rotateX(c.lean).translate(c.p.x, c.p.y, c.p.z));
      sinew.push(twist(0.024, c2.r + 0.0006, 0.0014, 9).rotateX(c2.lean).translate(c2.p.x, c2.p.y + 0.012, c2.p.z));
    }
    {
      // (above the window)
      const c = at(0.145), leaf = new THREE.Shape();
      leaf.moveTo(0, -0.019); leaf.quadraticCurveTo(0.0085, -0.002, 0, 0.021); leaf.quadraticCurveTo(-0.0085, -0.002, 0, -0.019);
      const lg = new THREE.ExtrudeGeometry(leaf, { depth: 0.0009, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 10 });
      // (standing out of the riser's face, laid round it, with a raised midrib down it)
      lg.scale(0.8, 0.8, -1);
      const rib = new THREE.BoxGeometry(0.001, 0.027, 0.0011).translate(0, 0.0008, -0.0012);
      for (const piece of [lg, rib]) {
        const P = piece.attributes.position;
        // (each point moved onto the riser's round face below it, a fraction of a millimetre proud of it)
        for (let k = 0; k < P.count; k++) { const x = P.getX(k); P.setZ(k, P.getZ(k) - Math.sqrt(Math.max(0, c.r * c.r - x * x)) + 0.0002); }
        brass.push(piece.rotateX(c.lean).translate(c.p.x, c.p.y, c.p.z));
      }
    }
    add(merged(brass), m.brass, false, 'brass');
    add(merged(sinew), m.serving, false, 'sinew');
    // the limbs: one shape, the lower its mirror (three flips the faces of a mirrored mesh)
    const n = (SEG + 2) * RING, pos = new Float32Array(n * 3), idx: number[] = [];
    for (let i = 0; i <= SEG; i++) for (let k = 0; k < RING; k++) {
      const a = i * RING + k, b = i * RING + (k + 1) % RING;
      idx.push(a, a + RING, b, b, a + RING, b + RING);
    }
    this.limbGeo = new THREE.BufferGeometry();
    this.limbGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    // (the grain along the limb; its back pale sapwood and its belly heartwood, as a stave is cut from the trunk: with no uvs
    // the maps showed one texel, and the weathered wood's brown under a dark tint was black)
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3), lin = new THREE.Color();
    for (let i = 0; i <= SEG + 1; i++) for (let k = 0; k < RING; k++) {
      const o = i * RING + k, sa = Math.sin((k / RING) * Math.PI * 2);
      uv[o * 2] = k / RING; uv[o * 2 + 1] = Math.min(i, SEG) / SEG * 3;
      lin.copy(HEARTWOOD).lerp(SAPWOOD, THREE.MathUtils.smoothstep(sa, -0.55, 0.05)).convertSRGBToLinear();
      col[o * 3] = lin.r / WOOD_MEAN[0]; col[o * 3 + 1] = lin.g / WOOD_MEAN[1]; col[o * 3 + 2] = lin.b / WOOD_MEAN[2];
    }
    this.limbGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.limbGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.limbGeo.setIndex(idx);
    // the horn tips: a cap over each limb's end with a groove the string's loop sits in, flat as the limb is
    const cap = new THREE.LatheGeometry([[0.0109, -0.026], [0.0113, -0.005], [0.0101, 0], [0.0083, 0.0035], [0.0097, 0.0085], [0.009, 0.019], [0.0066, 0.029], [0.0026, 0.0355], [0.0001, 0.0365]].map(([x, y]) => new THREE.Vector2(x, y)), 14).scale(1, 1, 0.6);
    const limbs = [add(this.limbGeo, m.limb, true, 'limb'), add(this.limbGeo, m.limb, true, 'limb')];
    limbs[1].scale.y = -1;
    this.caps = limbs.map((l) => { const c = new THREE.Mesh(cap, m.horn); c.castShadow = false; c.name = 'horn'; l.add(c); return c; });
    // the vine: the stem a ribbon of quads along the limb, then a leaf (a diamond) at each turn
    const leaves = VINE.turns * 2, nv = (VINE.n + 1) * 2 + leaves * 4, vIdx: number[] = [];
    for (let i = 0; i < VINE.n; i++) { const a = i * 2; vIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    for (let k = 0; k < leaves; k++) { const a = (VINE.n + 1) * 2 + k * 4; vIdx.push(a, a + 2, a + 1, a, a + 3, a + 2); }
    this.vineGeo = new THREE.BufferGeometry();
    this.vineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.vineGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.vineGeo.setIndex(vIdx);
    for (const l of limbs) { const v = new THREE.Mesh(this.vineGeo, m.inlay); v.castShadow = false; v.name = 'vine'; l.add(v); }
    this.strings = [0, 1].map(() => add(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 5, 1).translate(0, 0.5, 0), m.string, true, 'string'));
    for (const s of this.strings) s.castShadow = false;
    // the serving round the string where it's nocked, dark, from the stretch the fingers hold (`hold`) up and down each half,
    // with a brass bead above the nock; and a tuft of wool on each half
    const serve = new THREE.CylinderGeometry(0.0031, 0.0031, SERVE, 8).translate(0, SERVE / 2, 0);
    this.servings = [0, 1].map(() => add(serve, m.serving, false, 'serving'));
    this.held = add(new THREE.CylinderGeometry(0.0031, 0.0031, 1, 8, 1, true).translate(0, 0.5, 0), m.serving, false, 'serving');
    this.bead = add(new THREE.SphereGeometry(0.0042, 10, 8), m.brass, false, 'bead');
    const tuft = merged([0, 1, 2, 3].map((i) => new THREE.IcosahedronGeometry(0.0085 - i * 0.0009, 1).scale(1, 1.5, 1).translate(Math.sin(i * 2.1) * 0.004, (i - 1.5) * 0.007, Math.cos(i * 2.1) * 0.004)));
    this.silencers = [0, 1].map(() => add(tuft, m.yarn, false, 'silencer'));
    for (let i = 0; i < 5; i++) { const a = add(arrowGeometry(), m.arrow, true, 'arrow'); a.castShadow = false; a.visible = false; this.arrows.push(a); }
    this.set(0);
  }

  /** the limbs' tips with `bend` added */
  private tips(bend: number): void {
    limbLine(bend, this.line);
    this.tipU.set(0, this.line[SEG * 2], this.line[SEG * 2 + 1]);
    this.tipL.set(0, -this.tipU.y, this.tipU.z);
  }

  /**
   * Draw the string `pull` back past brace (m): the limbs bend just as far as keeps the string its length. A loosed
   * bow (`pull` 0) rings with `ring`, an added bend (rad/m, negative: forward past rest), the string straight.
   */
  set(pull: number, ring = 0): void {
    if (pull > 1e-4) {
      // (the string's two halves, tip to nock, against its length: the bend that matches by bisection)
      this.nock.set(0, REST_Y + this.hold, -this.brace - pull);
      const h = this.hold, n = this.nock;
      let lo = 0, hi = 4;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        this.tips(mid);
        const len = Math.hypot(this.tipU.y - n.y - h, this.tipU.z - n.z) + Math.hypot(this.tipL.y - n.y + h, this.tipL.z - n.z) + 2 * h;
        if (len > this.stringLen) lo = mid; else hi = mid;
      }
      this.bend = (lo + hi) / 2;
    } else this.bend = ring;
    this.tips(this.bend);
    // a loose string runs straight, tip to tip
    const ny = REST_Y + this.hold;
    if (pull <= 1e-4) this.nock.set(0, ny, this.tipU.z + (this.tipL.z - this.tipU.z) * (this.tipU.y - ny) / (this.tipU.y - this.tipL.y));
    // the limb's cross-section: wide and flat, tapering to the tip, closed at its end
    const pos = this.limbGeo.attributes.position as THREE.BufferAttribute, P = pos.array as Float32Array, L = this.line;
    for (let i = 0; i <= SEG + 1; i++) {
      const c = Math.min(i, SEG), s = c / SEG, y = L[c * 2], z = L[c * 2 + 1];
      const j0 = Math.max(0, c - 1), j1 = Math.min(SEG, c + 1), ty = L[j1 * 2] - L[j0 * 2], tz = L[j1 * 2 + 1] - L[j0 * 2 + 1], tl = Math.hypot(ty, tz);
      // (the normal in the limb's plane: square to the tangent, towards its back)
      const ny = -tz / tl, nz = ty / tl, w = i > SEG ? 0 : 0.022 - 0.013 * s, th = i > SEG ? 0 : 0.0085 - 0.0035 * s;
      for (let k = 0; k < RING; k++) {
        const a = (k / RING) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), cx = Math.sign(ca) * Math.abs(ca) ** 0.5, cy = Math.sign(sa) * Math.abs(sa) ** 0.7;
        const o = (i * RING + k) * 3;
        P[o] = cx * w; P[o + 1] = y + ny * cy * th; P[o + 2] = z + nz * cy * th;
      }
    }
    pos.needsUpdate = true;
    this.limbGeo.computeVertexNormals();
    this.limbGeo.computeBoundingSphere();
    // the string's two halves, tip to the held stretch's ends, and that stretch, served
    [this.tipU, this.tipL].forEach((tip, i) => {
      const s = this.strings[i], end = _b.copy(this.nock).addScaledVector(_up, i ? -this.hold : this.hold), d = _a.copy(tip).sub(end);
      s.position.copy(end); s.scale.set(1, d.length(), 1); s.quaternion.setFromUnitVectors(_up, d.normalize());
      this.servings[i].position.copy(end); this.servings[i].quaternion.copy(s.quaternion);
      this.servings[i].scale.y = Math.max(0.05, 1 - this.hold / SERVE);
      if (!i) this.bead.position.copy(end).addScaledVector(d, 0.009);
    });
    this.held.visible = this.hold > 1e-4;
    this.held.position.copy(this.nock).addScaledVector(_up, -this.hold); this.held.scale.set(1, Math.max(1e-4, 2 * this.hold), 1);
    // the horn caps on the limbs' ends, along them
    this.layVine();
    const e = SEG * 2, ty = L[e] - L[e - 2], tz = L[e + 1] - L[e - 1];
    for (const c of this.caps) { c.position.set(0, L[e], L[e + 1]); c.quaternion.setFromUnitVectors(_up, _a.set(0, ty, tz).normalize()); }
    // the silencers a sixth of the way down each half from its tip
    [this.tipU, this.tipL].forEach((tip, i) => { const q = this.silencers[i]; q.position.lerpVectors(tip, this.nock, 0.16); q.quaternion.copy(this.strings[i].quaternion); });
  }

  /** the vine laid on the limb as it's bent now: each point on the belly's middle at its height along the limb (the
   *  cross-section is flat there), a hair proud of it, facing out of the belly */
  private layVine(): void {
    const L = this.line, P = this.vineGeo.attributes.position as THREE.BufferAttribute, N = this.vineGeo.attributes.normal as THREE.BufferAttribute;
    // (the limb's centre line, its tangent and its belly's normal at `f` of its length)
    const along = (f: number, o: { y: number; z: number; ty: number; tz: number; ny: number; nz: number; th: number }) => {
      const c = Math.min(SEG - 1e-6, f * SEG), i = Math.floor(c), t = c - i;
      o.y = L[i * 2] + (L[i * 2 + 2] - L[i * 2]) * t; o.z = L[i * 2 + 1] + (L[i * 2 + 3] - L[i * 2 + 1]) * t;
      const ty = L[i * 2 + 2] - L[i * 2], tz = L[i * 2 + 3] - L[i * 2 + 1], tl = Math.hypot(ty, tz);
      o.ty = ty / tl; o.tz = tz / tl; o.ny = tz / tl; o.nz = -ty / tl;
      o.th = 0.0085 - 0.0035 * f + 0.00035;
      return o;
    };
    const q = { y: 0, z: 0, ty: 0, tz: 0, ny: 0, nz: 0, th: 0 }, put = (k: number, x: number, d: number, lift: number) => {
      P.setXYZ(k, x, q.y + q.ty * d + q.ny * (q.th + lift), q.z + q.tz * d + q.nz * (q.th + lift)); N.setXYZ(k, 0, q.ny, q.nz);
    };
    for (let i = 0; i <= VINE.n; i++) {
      const u = i / VINE.n, x = VINE.wave * Math.sin(u * VINE.turns * Math.PI * 2);
      along(VINE.from + (VINE.to - VINE.from) * u, q);
      put(i * 2, x - VINE.stem, 0, 0); put(i * 2 + 1, x + VINE.stem, 0, 0);
    }
    // (a leaf at each turn of the stem, out from it and forward along the limb, a little proud of the stem; (dx, dd) its
    // way across and along the limb)
    for (let k = 0; k < VINE.turns * 2; k++) {
      const u = (k + 0.5) / (VINE.turns * 2), side = k % 2 ? -1 : 1, x = VINE.wave * side, a = (VINE.n + 1) * 2 + k * 4;
      along(VINE.from + (VINE.to - VINE.from) * u, q);
      const [l, w] = VINE.leaf, dx = side * 0.55, dd = 0.84;
      put(a, x, 0, 0.0001); put(a + 1, x + dx * l * 0.5 + dd * w, dd * l * 0.5 - dx * w, 0.0001);
      put(a + 2, x + dx * l, dd * l, 0.0001); put(a + 3, x + dx * l * 0.5 - dd * w, dd * l * 0.5 + dx * w, 0.0001);
    }
    P.needsUpdate = true; N.needsUpdate = true;
    this.vineGeo.computeBoundingSphere();
  }

  /** where the string is `y` up the bow, on the stretch the fingers hold or on a half */
  private stringAt(y: number, o: THREE.Vector3): THREE.Vector3 {
    const n = this.nock, h = this.hold, up = y > n.y + h, tip = up ? this.tipU : this.tipL, ey = n.y + (up ? h : -h);
    if (Math.abs(y - n.y) <= h) return o.set(0, y, n.z);
    return o.set(0, y, n.z + (tip.z - n.z) * (y - ey) / (tip.y - ey));
  }

  /** `n` arrows on the string, lying in the window from the rest up, side by side, each nocked level with where it lies,
   *  so they're parallel (on the stretch the fingers hold, `fanHold(n)`, or above it up the string's half while it's less:
   *  nocked about the nocking point as it eased out, the lowest went into the grip). 0 takes them off. */
  nockArrows(n: number): void {
    this.arrows.forEach((a, i) => {
      a.visible = i < n;
      if (i >= n) return;
      const off = n > 1 ? i * FAN_PITCH : 0, nock = this.stringAt(REST_Y + off, _b);
      _a.set(0, REST_Y + off, 0).sub(nock).normalize();
      a.quaternion.setFromUnitVectors(FWD, _a);
      a.position.copy(nock).addScaledVector(_a, ARROW / 2 - 0.008);
    });
  }
}
const FWD = new THREE.Vector3(0, 0, 1);
