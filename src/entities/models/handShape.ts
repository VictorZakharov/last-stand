// The hand's shape, sculpted as a distance field on its own joints (models/sdf.ts) and meshed by surface nets: a palm
// narrowing to the wrist, its back domed and its middle cupped, with the thumb's mound (the thenar) and the little
// finger's along its edge, a knuckle over each finger's root and a ridge of pads under them, the webs between the
// fingers, each finger a flattened, tapering tube with a pad at its tip, and the thumb rising out of its mound. One
// surface, skinned to the joints: each vertex follows the joints whose parts it lies on, blended across each joint,
// so a finger bends as skin does. (Built of a rounded box and a tube for each segment of each digit, a hand was a
// pillow with rows of sausages on it, the segments parted at every bent joint; with a ball at each joint, the fingers
// were strings of beads.) The glove is the same surface a little further out, cut off over each finger's first
// segment and round the thumb's, and the nails are plates laid on the backs of the fingertips.
import * as THREE from 'three';
import { surfaceNets, type Field } from './surfaceNets';
import { above, beyond, distanceOf, ellipsoid, fieldOf, frameIn, IDENTITY, slab, smax, tube } from './sdf';
import type { Part, Shape } from './sdf';
import { clamp } from '../../util';

/** A digit as the sculpt reads it: its joints from its root (each segment hangs down its joint's -y, the palm's side
 *  -z), each segment's length, and its half-width at its root. */
export interface DigitShape {
  j: THREE.Object3D[];
  len: number[];
  width: number;
}

export interface HandGeometries {
  /** the skin whole, as the hand is bare */
  skin: THREE.BufferGeometry;
  /** the skin a glove leaves bare, on `skin`'s own vertices: the fingertips, the thumb's and the wrist's rim */
  tips: THREE.BufferGeometry;
  glove: THREE.BufferGeometry;
  nails: THREE.BufferGeometry;
}

/** A geometry's arrays, as a worker hands them over (models/hands.worker.ts). */
interface PackedGeometry {
  attributes: Record<string, { array: Float32Array | Uint16Array; itemSize: number }>;
  index: Uint32Array | Uint16Array;
}
export interface PackedHand {
  skin: PackedGeometry;
  glove: PackedGeometry;
  nails: PackedGeometry;
  /** the bare skin's triangles alone: its vertices are the skin's */
  tips: Uint32Array | Uint16Array;
}

/** `made` as arrays a worker can hand over, and the buffers to transfer with them. */
export function packHand(made: HandGeometries): { packed: PackedHand; buffers: ArrayBuffer[] } {
  const buffers: ArrayBuffer[] = [];
  const pack = (geometry: THREE.BufferGeometry): PackedGeometry => {
    const attributes: PackedGeometry['attributes'] = {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const array = (attribute as THREE.BufferAttribute).array as Float32Array | Uint16Array;
      attributes[name] = { array, itemSize: attribute.itemSize };
      buffers.push(array.buffer as ArrayBuffer);
    }
    const index = geometry.index!.array as Uint32Array | Uint16Array;
    buffers.push(index.buffer as ArrayBuffer);
    return { attributes, index };
  };
  const tips = made.tips.index!.array as Uint32Array | Uint16Array;
  buffers.push(tips.buffer as ArrayBuffer);
  return { packed: { skin: pack(made.skin), glove: pack(made.glove), nails: pack(made.nails), tips }, buffers };
}

/** The geometries a worker handed over. */
export function unpackHand(packed: PackedHand): HandGeometries {
  const unpack = (from: PackedGeometry) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, { array, itemSize }] of Object.entries(from.attributes)) {
      geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    }
    geometry.setIndex(new THREE.BufferAttribute(from.index, 1));
    return geometry;
  };
  const skin = unpack(packed.skin);
  const tips = onVerticesOf(skin, packed.tips);
  return { skin, tips, glove: unpack(packed.glove), nails: unpack(packed.nails) };
}

/** A geometry of `index`'s triangles on `of`'s vertices. */
function onVerticesOf(of: THREE.BufferGeometry, index: Uint32Array | Uint16Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(of.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

/** the grid the surface is meshed on (m, the hand's own units: at 2.6 mm a hand was 19,000 triangles) */
const CELL = 0.0032;
/** how far a vertex's joints' say in it falls off with its distance from their parts (m), and how far a part may be
 *  and still have any */
const FALLOFF = 0.0022;
const SAY_REACH = FALLOFF * 9;
/** how far the glove stands off the skin, and its hem's extra thickness at each cut (m) */
const GLOVE_OUT = 0.0014;
const HEM = 0.0007;
/** how far the hem thins to nothing behind each cut, and how far under the glove the skin it leaves bare goes on
 *  (m): past the hem, so no gap opens between them as the joints bend */
const HEM_TAPER = 0.002;
const TUCK = 0.003;
/** how far the nails stand off the skin (m), and their grid: across and along */
const NAIL_OUT = 0.00055;
const NAIL_DEPTH = 0.0009;
const NAIL_ACROSS = 6;
const NAIL_ALONG = 7;
/** where the hand's surface ends up the wrist, inside the cuff, and the glove's (m over the wrist joint) */
const WRIST_TOP = 0.008;
const GLOVE_TOP = 0.006;
/** how far round a digit its cuff cuts the glove (a share of its half-width at its root: past its pad and the glove
 *  over it; at 1.9 the thumb's cut a hole in the glove by the index's root), and how softly (m: a rolled hem) */
const CUFF_REACH = 1.45;
const CUFF_ROLL = 0.0025;
/** how softly a digit's segments join (m: a soft join swells by a quarter of it where two surfaces meet) */
const SEGMENT_BLEND = 0.0006;
/** the thumb's root joint among the bones (the hand's own, then each finger's three) */
const THUMB_ROOT = 13;

/** The palm's parts, in the hand's own frame (`toward`: the way across to the thumb, +1 or -1 along x). */
function palmParts(fingers: DigitShape[], thumb: DigitShape, toward: number): Part[] {
  const at = (u: number, y: number, z: number) => [u * toward, y, z] as const;
  const parts: Part[] = [];
  const palm = (shape: Shape, blend: number, bones: [number, number][] = [[0, 1]]) => {
    parts.push({ shape, frame: IDENTITY, blend, bones });
  };
  // (domed across its back and rounded off at its sides: domed a third, it was a box with hard sides)
  palm(slab(-0.004, -0.094, 0.027, 0.0385, 0.0135, 0.0115, 0.5, 0.012), 0.006);
  // the wrist, into the cuff
  palm(tube(0.026, 0.028, -0.006, 0.014, 0.68), 0.012);
  for (const finger of fingers) {
    const k = finger.j[0].position;
    const w = finger.width;
    // its knuckle, the head of its bone in the palm, low and broad; and its pad on the palm's side, broad and flat,
    // joining its neighbours' under the fingers' roots (each a ball, they stood in a row of beads; fuller, in a
    // sausage across the palm)
    // (low under the skin: as tall as they were broad, they stood in a row of balls along the back's edge)
    palm(ellipsoid(k.x, k.y + 0.001, k.z + 0.0005, w * 0.86, w * 0.72, w * 0.64), 0.012);
    palm(ellipsoid(k.x, k.y - 0.0075, k.z - 0.0055, w * 1.22, 0.0082, 0.0046), 0.008);
  }
  // the little finger's mound along the palm's edge
  palm(ellipsoid(...at(-0.0285, -0.05, -0.0062), 0.0115, 0.033, 0.0102), 0.009);
  // the thumb's mound, between the palm and its root, moving half with the thumb
  const root = thumb.j[0].position;
  palm(ellipsoid(root.x * 0.62, -0.045, root.z - 0.0035, 0.0195, 0.028, 0.0135), 0.011, [[0, 0.5], [THUMB_ROOT, 0.5]]);
  // (cut off flat inside the cuff: the wrist's rounded end rose 3 cm up the forearm)
  parts.push({ shape: above(WRIST_TOP), frame: IDENTITY, blend: 0.002, cut: true, bones: [] });
  // the palm's hollow
  // (off the thumb's mound towards the little finger's: over against it, the mound read as a crater)
  parts.push({ shape: ellipsoid(...at(-0.004, -0.06, -0.0248), 0.02, 0.024, 0.0095), frame: IDENTITY,
    blend: 0.006, cut: true, bones: [] });
  return parts;
}

/** A digit's parts, each in its joint's frame: a tube for each segment, swelling a little at the joints between
 *  them, and a pad at its tip. `first` is the index of its root joint among the bones. */
function digitParts(digit: DigitShape, first: number, space: THREE.Object3D, thumb: boolean): Part[] {
  const w = digit.width;
  const [l0, l1, l2] = digit.len;
  const frames = digit.j.map((joint) => frameIn(joint, space));
  const parts: Part[] = [];
  const on = (n: number, shape: Shape, blend: number, bones: [number, number][]) => {
    parts.push({ shape, frame: frames[n], blend, bones });
  };
  // (each segment starting at the width the one before it ends: a step between them, joined softly, swelled in a ring)
  const radii = thumb ? [0.98, 0.92, 0.92, 0.84, 0.84, 0.75] : [1, 0.9, 0.9, 0.82, 0.82, 0.74];
  const depths = thumb ? [0.86, 0.84, 0.78] : [0.86, 0.84, 0.8];
  // (the thumb's root segment is its bone in the palm, rising out of its mound)
  const rootTube = (from: number) => tube(w * radii[0], w * radii[1], from, l0, depths[0]);
  on(0, rootTube(thumb ? 0.006 : 0.002), thumb ? 0.009 : 0.004, [[first, 1]]);
  // (its say in the skin from a little past the knuckle: from the joint itself, the back of the hand behind the
  // knuckle bent with the finger)
  parts[parts.length - 1].shapeOnly = true;
  parts.push({ shape: rootTube(w * 0.45), frame: frames[0], blend: 0, sayOnly: true, bones: [[first, 1]] });
  // the joints, where the skin follows both segments half and half; they shape nothing (each a ball, the fingers
  // were strings of beads), and the segments join almost hard (joined softly, their rounded ends overlapping at each
  // joint swelled there in a ring)
  on(1, ellipsoid(0, 0, 0, w * radii[1], w * 0.82, w * 0.76), 0, [[first, 0.5], [first + 1, 0.5]]);
  on(1, tube(w * radii[2], w * radii[3], 0, l1, depths[1]), SEGMENT_BLEND, [[first + 1, 1]]);
  on(2, ellipsoid(0, 0, 0, w * radii[3], w * 0.75, w * 0.68), 0, [[first + 1, 0.5], [first + 2, 0.5]]);
  // (the last segment's rounded end at the digit's tip)
  on(2, tube(w * radii[4], w * radii[5], 0, l2 - w * radii[5] * 0.85, depths[2]), SEGMENT_BLEND, [[first + 2, 1]]);
  // (blended in wide: joined in 4 mm, each stood on the fingertip's underside as a button)
  on(2, ellipsoid(0, -0.58 * l2, -0.2 * w, w * 0.72, 0.42 * l2, w * 0.54), 0.007, [[first + 2, 1]]);
  for (const joint of [parts[2], parts[4]]) joint.sayOnly = true;
  return parts;
}

/** how far out from the skin its closing in is read (m), and how much darker it is where it closes in wholly */
const SHUT_STEPS = [0.0025, 0.005, 0.008];
const SHUT_DARK = 0.7;
/** the fingertips' last segments' bones, and how much warmer (redder) the skin is over them */
const TIP_BONES = new Set([3, 6, 9, 12, 15]);
const TIP_WARM: [number, number, number] = [1.06, 0.84, 0.8];

/** The skin's colour at each vertex (`color`, multiplying its material's): darker where the skin round it closes in,
 *  read from `field` a few millimetres out along its normal (a point outside the hand nearer to another part of it than
 *  it is out), and warmer over the fingertips. */
function shadeSkin(geometry: THREE.BufferGeometry, field: Field): void {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const bones = geometry.attributes.skinIndex;
  const shares = geometry.attributes.skinWeight;
  const colour = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    let shut = 0;
    for (const step of SHUT_STEPS) {
      const x = position.getX(i) + normal.getX(i) * step;
      const y = position.getY(i) + normal.getY(i) * step;
      const z = position.getZ(i) + normal.getZ(i) * step;
      shut += clamp((step - field(x, y, z)) / step, 0, 1);
    }
    const light = 1 - SHUT_DARK * shut / SHUT_STEPS.length;
    let tip = 0;
    for (let k = 0; k < 4; k++) if (TIP_BONES.has(bones.getComponent(i, k))) tip += shares.getComponent(i, k);
    for (let c = 0; c < 3; c++) colour[i * 3 + c] = light * (1 + (TIP_WARM[c] - 1) * tip);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
}

/** the hand's bones: its own, each finger's three and the thumb's three */
const BONES = 16;
const _say = new Float64Array(BONES);

/** The joints whose parts `point` lies on, the four with most say, and each one's share. */
function weightsAt(parts: Part[], x: number, y: number, z: number, out: { bones: number[]; shares: number[] }): void {
  _say.fill(0);
  for (const part of parts) {
    if (part.shapeOnly || part.cut || beyond(part, x, y, z, SAY_REACH)) continue;
    const weight = Math.exp(-Math.max(0, distanceOf(part, x, y, z)) / FALLOFF);
    for (const [bone, share] of part.bones) _say[bone] += share * weight;
  }
  const most = [..._say.keys()].filter((bone) => _say[bone] > 0).sort((a, b) => _say[b] - _say[a]).slice(0, 4);
  const total = most.reduce((sum, bone) => sum + _say[bone], 0) || 1;
  out.bones = most;
  out.shares = most.map((bone) => _say[bone] / total);
}

/** A mesh of `field` within `box` as a geometry, its vertices skinned to the joints `parts` say. */
function skinnedNet(field: Field, box: THREE.Box3, parts: Part[]): THREE.BufferGeometry {
  const net = surfaceNets(field, box, CELL);
  const count = net.positions.length / 3;
  // (the bones' indices as floats, as models/shapes.ts's: Uint16 ones made ANGLE compile a vertex shader at the
  // first draw, on the GPU process's main thread)
  const bones = new Float32Array(count * 4);
  const shares = new Float32Array(count * 4);
  const found = { bones: [] as number[], shares: [] as number[] };
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [net.positions[i * 3], net.positions[i * 3 + 1], net.positions[i * 3 + 2]];
    weightsAt(parts, x, y, z, found);
    found.bones.forEach((bone, k) => {
      bones[i * 4 + k] = bone;
      shares[i * 4 + k] = found.shares[k];
    });
  }
  // (no texture places: its maps are read triplanar, models/triplanar.ts)
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(net.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(net.normals, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(shares, 4));
  geometry.setIndex(new THREE.BufferAttribute(net.index, 1));
  return geometry;
}

/** Where a glove's cuff ends over `digit` (a share of its first segment for a finger, of its second for the thumb):
 *  how far past it `point` is, or null when `point` isn't by that digit. */
function pastCuff(digit: DigitShape, frames: Float64Array[], thumb: boolean, x: number, y: number, z: number):
  number | null {
  const n = thumb ? 1 : 0;
  const e = frames[n];
  const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
  const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
  if (Math.hypot(lx, lz) > digit.width * CUFF_REACH || ly > digit.width) return null;
  return -ly - digit.len[n] * (thumb ? 0.5 : 0.55);
}

/** The glove: the hand's surface a little further out, cut off at each digit's cuff and at the wrist. */
function gloveField(hand: Field, digits: DigitShape[], frames: Float64Array[][]): Field {
  const glove = gloveOver(hand, digits, frames);
  glove.within = (x, y, z, radius) => gloveOver(hand.within?.(x, y, z, radius) ?? hand, digits, frames);
  return glove;
}

function gloveOver(hand: Field, digits: DigitShape[], frames: Float64Array[][]): Field {
  const cut = { past: 0, hem: 0 };
  return (x, y, z) => {
    gloveCut(digits, frames, x, y, z, cut);
    return smax(hand(x, y, z) - GLOVE_OUT - cut.hem, cut.past, CUFF_ROLL);
  };
}

/** Where the glove is cut off by a point: how far past its cuffs and its top the point is (the most of them: under
 *  the glove where below 0), and the hem's thickness there. */
function gloveCut(digits: DigitShape[], frames: Float64Array[][], x: number, y: number, z: number,
  out: { past: number; hem: number }): void {
  out.past = y - GLOVE_TOP;
  out.hem = 0;
  digits.forEach((digit, i) => {
    const past = pastCuff(digit, frames[i], i === digits.length - 1, x, y, z);
    if (past === null) return;
    out.past = Math.max(out.past, past);
    out.hem = Math.max(out.hem, HEM * clamp(1 + past / HEM_TAPER, 0, 1));
  });
}

/** `skin`'s triangles the glove leaves bare, `TUCK` under its edge, on the skin's own vertices. (The skin whole under
 *  the glove showed through it where a bent thumb pressed the two together.) */
function bareOf(skin: THREE.BufferGeometry, digits: DigitShape[], frames: Float64Array[][]): THREE.BufferGeometry {
  const position = skin.getAttribute('position');
  const cut = { past: 0, hem: 0 };
  const shown = new Uint8Array(position.count);
  for (let i = 0; i < position.count; i++) {
    gloveCut(digits, frames, position.getX(i), position.getY(i), position.getZ(i), cut);
    shown[i] = cut.past > -TUCK ? 1 : 0;
  }
  const index = skin.index!.array;
  const kept: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const corners = [index[t], index[t + 1], index[t + 2]];
    if (corners.some((corner) => shown[corner])) kept.push(...corners);
  }
  return onVerticesOf(skin, new Uint32Array(kept));
}

/** where a search for a surface steps in (m): finer than the thinnest part it may cross */
const SEARCH_STEP = 0.0004;

/** The first place `field`'s surface is met going from `from` along `down` (a unit way, the hand's frame), within
 *  `reach` (m), or null. (Bisected between the search's ends, a nail missed every fingertip: the far end lay out
 *  past the finger, on its palm's side.) */
function surfaceAlong(field: Field, from: THREE.Vector3, down: THREE.Vector3, reach: number): THREE.Vector3 | null {
  const at = (distance: number) => from.clone().addScaledVector(down, distance);
  const inside = (distance: number) => {
    const p = at(distance);
    return field(p.x, p.y, p.z) <= 0;
  };
  if (inside(0)) return null;
  let near = 0;
  while (near < reach && !inside(near + SEARCH_STEP)) near += SEARCH_STEP;
  if (near >= reach) return null;
  let far = near + SEARCH_STEP;
  for (let i = 0; i < 16; i++) {
    const mid = (near + far) / 2;
    if (inside(mid)) far = mid;
    else near = mid;
  }
  return at((near + far) / 2);
}

/** The field's normal at `point`. */
function normalAt(field: Field, point: THREE.Vector3): THREE.Vector3 {
  const h = 0.0002;
  const { x, y, z } = point;
  return new THREE.Vector3(
    field(x + h, y, z) - field(x - h, y, z),
    field(x, y + h, z) - field(x, y - h, z),
    field(x, y, z + h) - field(x, y, z - h),
  ).normalize();
}

/** A nail on the back of `digit`'s tip: a plate laid on the skin, rounded at its root, its edge a rim into the skin,
 *  moving with the tip's joint (`bone`). Its vertices, normals and triangles are added to `into`. */
function nail(field: Field, digit: DigitShape, bone: number, space: THREE.Object3D, into: NailMesh): void {
  const tip = digit.j[2];
  const toHand = new THREE.Matrix4().fromArray(frameIn(tip, space)).invert();
  const l2 = digit.len[2];
  const half = digit.width * 0.56;
  const down = new THREE.Vector3(0, 0, -1).transformDirection(toHand);
  const rows: number[][] = [];
  for (let a = 0; a <= NAIL_ALONG; a++) {
    const t = 0.36 + (0.93 - 0.36) * (a / NAIL_ALONG);
    // (rounded at its root, as a nail's moon is)
    const across = half * Math.sqrt(clamp((t - 0.36) / 0.1, 0.15, 1));
    const row: number[] = [];
    for (let c = 0; c <= NAIL_ACROSS; c++) {
      const local = new THREE.Vector3(across * (2 * c / NAIL_ACROSS - 1), -t * l2, digit.width * 2);
      const from = local.applyMatrix4(toHand);
      const on = surfaceAlong(field, from, down, digit.width * 3);
      if (!on) throw new Error('handShape: a nail found no fingertip under it');
      const normal = normalAt(field, on);
      row.push(into.add(on.addScaledVector(normal, NAIL_OUT), normal, bone));
    }
    rows.push(row);
  }
  for (let a = 0; a < NAIL_ALONG; a++) for (let c = 0; c < NAIL_ACROSS; c++) {
    into.quad(rows[a][c], rows[a + 1][c], rows[a + 1][c + 1], rows[a][c + 1]);
  }
  // its rim, from the plate's edge down into the skin
  const edge = [
    ...rows[0],
    ...rows.slice(1).map((row) => row[NAIL_ACROSS]),
    ...[...rows[NAIL_ALONG]].reverse().slice(1),
    ...rows.slice(1, -1).reverse().map((row) => row[0]),
  ];
  const sunk = edge.map((vertex) => into.sunk(vertex, NAIL_OUT + NAIL_DEPTH, bone));
  for (let i = 0; i < edge.length; i++) {
    const next = (i + 1) % edge.length;
    into.quad(edge[i], edge[next], sunk[next], sunk[i]);
  }
}

/** The nails' mesh as it's made. */
class NailMesh {
  positions: number[] = [];
  normals: number[] = [];
  bones: number[] = [];
  index: number[] = [];

  add(at: THREE.Vector3, normal: THREE.Vector3, bone: number): number {
    this.positions.push(at.x, at.y, at.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.bones.push(bone);
    return this.positions.length / 3 - 1;
  }

  /** a copy of `vertex` moved `depth` in along its normal */
  sunk(vertex: number, depth: number, bone: number): number {
    const at = new THREE.Vector3().fromArray(this.positions, vertex * 3);
    const normal = new THREE.Vector3().fromArray(this.normals, vertex * 3);
    return this.add(at.addScaledVector(normal, -depth), normal, bone);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.index.push(a, b, c, a, c, d);
  }

  geometry(): THREE.BufferGeometry {
    const count = this.positions.length / 3;
    // (the bones' indices as floats, as `skinnedNet`'s)
    const bones = new Float32Array(count * 4);
    const shares = new Float32Array(count * 4);
    this.bones.forEach((bone, i) => {
      bones[i * 4] = bone;
      shares[i * 4] = 1;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(shares, 4));
    geometry.setIndex(this.index);
    return geometry;
  }
}

/** The box the hand's field is meshed within: every joint's place, with room round it. */
function boxOf(digits: DigitShape[], space: THREE.Object3D): THREE.Box3 {
  const box = palmBox();
  for (const digit of digits) {
    box.expandByPoint(pointOn(digit, 2, -digit.len[2], space));
    for (let n = 0; n < digit.j.length; n++) box.expandByPoint(pointOn(digit, n, 0, space));
  }
  return box.expandByScalar(0.016);
}

/** The box the glove is meshed within: the palm and each digit up to its cuff (half the hand's box: meshed in the
 *  hand's, the glove took a third of the sculpt's time). */
function gloveBox(digits: DigitShape[], space: THREE.Object3D): THREE.Box3 {
  const box = palmBox();
  digits.forEach((digit, i) => {
    const n = i === digits.length - 1 ? 1 : 0;
    box.expandByPoint(pointOn(digit, n, -digit.len[n] * 0.6, space));
    for (let m = 0; m <= n; m++) box.expandByPoint(pointOn(digit, m, 0, space));
  });
  return box.expandByScalar(0.016);
}

/** the palm's box, the hand's own frame (m) */
const palmBox = () => new THREE.Box3(new THREE.Vector3(-0.05, -0.12, -0.03), new THREE.Vector3(0.05, 0.02, 0.03));

/** The point `along` its joint's y on `digit`'s joint `n` (0 its root), in the hand's frame. */
function pointOn(digit: DigitShape, n: number, along: number, space: THREE.Object3D): THREE.Vector3 {
  const toHand = new THREE.Matrix4().fromArray(frameIn(digit.j[n], space)).invert();
  return new THREE.Vector3(0, along, 0).applyMatrix4(toHand);
}

/**
 * The hand's skin, its glove and its nails, sculpted on its joints as they stand now (in the frame of `space`, the
 * hand's own): `fingers` index to little, then `thumb`; their joints are bones 1 on, in that order (0 is the hand's).
 * `toward` is the way across the hand to its thumb (+1 or -1 along x).
 */
export function sculptHand(space: THREE.Object3D, fingers: DigitShape[], thumb: DigitShape, toward: number):
  HandGeometries {
  const digits = [...fingers, thumb];
  const parts = [
    ...palmParts(fingers, thumb, toward),
    ...digits.flatMap((digit, i) => digitParts(digit, 1 + i * 3, space, i === fingers.length)),
  ];
  const hand = fieldOf(parts);
  const box = boxOf(digits, space);
  const frames = digits.map((digit) => digit.j.map((joint) => frameIn(joint, space)));
  const nails = new NailMesh();
  digits.forEach((digit, i) => nail(hand, digit, 3 + i * 3, space, nails));
  const skin = skinnedNet(hand, box, parts);
  shadeSkin(skin, hand);
  return {
    skin,
    tips: bareOf(skin, digits, frames),
    glove: skinnedNet(gloveField(hand, digits, frames), gloveBox(digits, space), parts),
    nails: nails.geometry(),
  };
}
