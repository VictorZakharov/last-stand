// Geometry for the heroes' gear: solid plates bent to any surface (with rolled edges), straps that
// wrap round the body, fur tufts, studs, medallions, gloved fingers, and a skirt of cloth or mail that
// swings with the legs. Static pieces go through `Sculpt` (entities/models/shapes.ts) to merge per joint.
import {
  Attribute, CatmullRom3, DynamicDrawUsage, floats, Geometry, Material, mergeGeometries, Node, Quat, Vec2, Vec3,
} from '../../engine/api/index.ts';
import * as shapes from '../../engine/api/shapes/index.ts';
import { freshLocal, freshPass, freshWorld } from './freshWorld';
import { taperTube, twist } from './shapes';
import { part, joint } from './rig';
import { built } from './steps';
import { clamp, lerp } from '../../util';
import { rustCalls } from '../../engine/rustCalls';
import { tunable } from '../../core/tuning';

/** The heroes' geometric detail, 1 = full (the quality preset's `heroDetail`): heroes built from now on
 *  use fewer hair locks and fur tufts and coarser curves below 1. */
export { setHeroDetail, heroDetail, atHeroDetail, finest } from './detail';
import { lod, finest } from './detail';
export { lod };
/** `n` at every level down to Low's detail, and fewer below it (`lod(n, n)`): the gear's belts, plates, rims and studs,
 *  which kept their full count at every level */
const below = (n: number): number => lod(n, n);
/** the rounds a skirt's drape puts its cloth out of the limbs and holds it to its lengths before its last pass off them
 *  (a quality's `drapeRounds`: the drape was a third of the hero's update, from play an S25 Edge's frame) */
let drapeRounds = 4;
export function setDrapeRounds(rounds: number): void { drapeRounds = rounds; }

/** A skirt at rest (#590): while the body under it has hardly moved since its cloth was last laid, it's laid again
 *  only every `every` s, not every frame. A standing hero's cloth moves by his idle sway alone, under a millimetre a
 *  thirtieth of a second, and laying it was 45% of his update, 0.5 ms a frame at 144 a second. Anything that moves
 *  him lays it at once: `walk` (the share of his speed), `swing` (a thigh's swing since, radians), `moved` (the
 *  furthest any limb's end has gone since, m). `?clothRest=0` lays it every frame, for A/B. */
export const CLOTH_REST = {
  on: typeof location === 'undefined' || !/[?&]clothRest=0/.test(location.search),
  every: 1 / 30,
  walk: 0.02,
  swing: 0.004,
  moved: 0.003,
  /** how many updates left the cloth as it lay, and how many laid it, since the page loaded (`lab coat` reads them) */
  rested: 0,
  laid: 0,
};

/** texture tile (m): uvs count metres / TILE, so every piece has the same texel density */
export const TILE = 0.3;
const _a = new Vec3(), _b = new Vec3(), _c = new Vec3();

const clean = (g: Geometry): Geometry => {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  return n;
};
/** merge pieces into one non-indexed geometry (position, normal, uv) */
export function merge(parts: Geometry[]): Geometry {
  const list = parts.map(clean);
  const g = mergeGeometries(list)!;
  for (const x of list) x.dispose();
  return g;
}

// (the tubes face out at the source now: they were turned round here, #289)
export { taperTube, twist };

/** scale a geometry's uvs */
export function scaleUV<G extends Geometry>(g: G, su: number, sv: number): G {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** A surface point for u, v in 0..1 (u across, v up). */
export type SurfaceFn = (u: number, v: number, out: Vec3) => Vec3;

function grid(fn: SurfaceFn, nu: number, nv: number): Vec3[][] {
  const P: Vec3[][] = [];
  for (let j = 0; j <= nv; j++) { const row: Vec3[] = []; for (let i = 0; i <= nu; i++) row.push(fn(i / nu, j / nv, new Vec3())); P.push(row); }
  return P;
}

/**
 * A plate following `fn`, `thick` deep (a solid with its edges closed), smooth-shaded. Its uvs run in
 * metres / TILE along u and v, unless `uv` gives them per grid point.
 */
export function plate(fn: SurfaceFn, nu: number, nv: number, thick: number, uv?: (u: number, v: number) => [number, number] | null, inside = new Vec3()): Geometry {
  nu = below(nu); nv = below(nv);
  const P = grid(fn, nu, nv);
  // arc length along the middle row and column, for the uvs
  const su: number[] = [0], sv: number[] = [0], mj = Math.round(nv / 2), mi = Math.round(nu / 2);
  for (let i = 1; i <= nu; i++) su.push(su[i - 1] + P[mj][i].distanceTo(P[mj][i - 1]) / TILE);
  for (let j = 1; j <= nv; j++) sv.push(sv[j - 1] + P[j][mi].distanceTo(P[j - 1][mi]) / TILE);
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    pos.push(P[j][i].x, P[j][i].y, P[j][i].z);
    uvs.push(...(uv?.(i / nu, j / nv) ?? [su[i], sv[j]]));
  }
  const w = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * w + i; idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w); }
  const outer = new Geometry();
  outer.setAttribute('position', floats(pos, 3));
  outer.setAttribute('uv', floats(uvs, 2));
  outer.setIndex(idx);
  outer.computeVertexNormals();
  let facing = 0;
  const on = outer.attributes.normal;
  for (let i = 0; i < on.count; i++) facing += on.getX(i) * (pos[i * 3] - inside.x) + on.getY(i) * (pos[i * 3 + 1] - inside.y) + on.getZ(i) * (pos[i * 3 + 2] - inside.z);
  if (facing < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    outer.setIndex(idx);
    outer.computeVertexNormals();
  }
  if (thick <= 0) return clean(outer);
  // the back face, the front pushed in along its normals, wound the other way
  const inner = outer.clone(), ip = inner.attributes.position, n = outer.attributes.normal;
  for (let i = 0; i < ip.count; i++) ip.setXYZ(i, ip.getX(i) - n.getX(i) * thick, ip.getY(i) - n.getY(i) * thick, ip.getZ(i) - n.getZ(i) * thick);
  const ri: number[] = [];
  for (let k = 0; k < idx.length; k += 3) ri.push(idx[k], idx[k + 2], idx[k + 1]);
  inner.setIndex(ri);
  inner.computeVertexNormals();
  // the edges: a strip joining each border of the front to the back's
  const rim: number[] = [], rimUV: number[] = [];
  const edge = (ids: number[]) => {
    for (let k = 0; k + 1 < ids.length; k++) {
      const a = ids[k], b = ids[k + 1];
      const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
      const Ai = [ip.getX(a), ip.getY(a), ip.getZ(a)], Bi = [ip.getX(b), ip.getY(b), ip.getZ(b)];
      rim.push(...A, ...Ai, ...B, ...B, ...Ai, ...Bi);
      rimUV.push(0, 0, 0, 0.05, 0.3, 0, 0.3, 0, 0, 0.05, 0.3, 0.05);
    }
  };
  const bottom = [...Array(w).keys()], top = bottom.map((i) => nv * w + i).reverse();
  const right = [...Array(nv + 1).keys()].map((j) => j * w + nu), left = right.map((x) => x - nu).reverse();
  edge(bottom); edge(right); edge(top); edge(left);
  const r = new Geometry();
  r.setAttribute('position', floats(rim, 3));
  r.setAttribute('uv', floats(rimUV, 2));
  r.computeVertexNormals();
  // the rim's winding depends on which way the surface faces: turn it round if it faces inwards
  const rn = r.attributes.normal, rp = r.attributes.position;
  _a.fromBufferAttribute(rp, 0); _b.fromBufferAttribute(rp, 2);
  _c.set(P[0][Math.min(1, nu)].x - P[1][Math.min(1, nu)].x, P[0][Math.min(1, nu)].y - P[1][Math.min(1, nu)].y, P[0][Math.min(1, nu)].z - P[1][Math.min(1, nu)].z);
  if (_a.set(rn.getX(0), rn.getY(0), rn.getZ(0)).dot(_c) < 0) {
    for (let i = 0; i < rp.count; i += 3) for (const at of [rp, rn, r.attributes.uv]) for (let c = 0; c < at.itemSize; c++) {
      const t = at.getComponent(i + 1, c); at.setComponent(i + 1, c, at.getComponent(i + 2, c)); at.setComponent(i + 2, c, t);
    }
    r.computeVertexNormals();
  }
  return merge([outer, inner, r]);
}

/** A round tube along one edge of a surface (a rolled rim): 'v0' the bottom, 'v1' the top, 'u0' / 'u1' the sides. */
export function edgeTube(fn: SurfaceFn, edge: 'u0' | 'u1' | 'v0' | 'v1', r: number, n = 16, inset = 0): Geometry {
  n = below(n);
  const pts: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push(edge[0] === 'u' ? fn(edge === 'u0' ? inset : 1 - inset, t, new Vec3()) : fn(t, edge === 'v0' ? inset : 1 - inset, new Vec3()));
  }
  return scaleUV(taperTube(pts, () => r, n * 2, 6), 1, 4);
}

/** outward from the vertical axis through the origin: straps round a torso or a limb */
export const RADIAL = (p: Vec3, out: Vec3): Vec3 => out.set(p.x, 0, p.z).normalize();

/**
 * A flat strap `w` wide and `t` thick along a curve through `pts`, lying flat against the body (its face
 * turned to `outward(p)`); `closed` makes it a loop (a belt).
 */
export function strap(pts: Vec3[], w: number, t: number, closed = false, outward = RADIAL, n = 0): Geometry {
  const curve = new CatmullRom3(pts, closed);
  const segs = below(n || Math.max(4, Math.ceil(curve.getLength() / 0.02)));
  const pos: number[] = [], uv: number[] = [];
  const S: Vec3[][] = [], L = curve.getLength() / TILE;
  const T = new Vec3(), O = new Vec3(), X = new Vec3(), p = new Vec3();
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    curve.getPointAt(s, p); curve.getTangentAt(s, T);
    outward(p, O); O.addScaledVector(T, -O.dot(T)).normalize();
    X.crossVectors(T, O).normalize();
    // corners: outer left, outer right, inner right, inner left
    S.push([
      p.clone().addScaledVector(X, -w / 2).addScaledVector(O, t), p.clone().addScaledVector(X, w / 2).addScaledVector(O, t),
      p.clone().addScaledVector(X, w / 2), p.clone().addScaledVector(X, -w / 2),
    ]);
  }
  // four faces, each its own strip so the edges stay crisp
  for (let f = 0; f < 4; f++) {
    const a = f, b = (f + 1) % 4, wid = f % 2 ? t / TILE : w / TILE;
    for (let k = 0; k < segs; k++) {
      const q = [S[k][a], S[k][b], S[k + 1][a], S[k + 1][b]], v0 = (k / segs) * L, v1 = ((k + 1) / segs) * L;
      pos.push(...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[2].toArray(), ...q[1].toArray(), ...q[3].toArray());
      uv.push(0, v0, wid, v0, 0, v1, 0, v1, wid, v0, wid, v1);
    }
  }
  const g = new Geometry();
  g.setAttribute('position', floats(pos, 3));
  g.setAttribute('uv', floats(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** a loop of strap round an ellipse (rx by rz) at height y: a belt, a band round a limb */
export function belt(rx: number, rz: number, y: number, w: number, t: number, tilt = 0, n = 24): Geometry {
  // (its band's segments are fewer below Low's detail: `strap`'s)
  const pts: Vec3[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push(new Vec3(Math.sin(a) * rx, y + Math.cos(a) * tilt, Math.cos(a) * rz)); }
  return strap(pts, w, t, true, RADIAL, n * 3);
}

/** Stitches along a seam: short dashes of thread through `pts` (a smooth curve), `len` long with `gap` between, standing
 *  on the cloth; one merged geometry. None below Low's detail (a piece of no triangles, which `Sculpt` leaves out):
 *  a millimetre's thread is never seen from the game's cameras, and the seams were the most of a hero's triangles
 *  there, the ranger's 11,900 and the mage's 9,800 at Very low */
export function stitches(pts: Vec3[], len = 0.0045, gap = 0.003, r = 0.0011, closed = false): Geometry {
  if (!finest()) return nothing();
  const c = new CatmullRom3(pts, closed), L = c.getLength(), n = Math.max(1, Math.floor(L / (len + gap))), parts: Geometry[] = [];
  const up = new Vec3(0, 1, 0), q = new Quat(), t = new Vec3();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = c.getPointAt(u); c.getTangentAt(u, t);
    q.setFromUnitVectors(up, t);
    parts.push(shapes.cylinder(r, r, len, 4, 1).applyQuaternion(q).translate(p.x, p.y, p.z));
  }
  return merge(parts);
}

/** A piece of no triangles, with the attributes a piece has (`Sculpt` leaves it out). */
function nothing(): Geometry {
  const g = new Geometry();
  g.setAttribute('position', floats([], 3));
  g.setAttribute('normal', floats([], 3));
  g.setAttribute('uv', floats([], 2));
  return g;
}

/** A buckle: a flat rectangular frame with a pin, facing +Z. */
export function buckle(w: number, h: number, t = 0.006): Geometry {
  const bar = t * 1.2, parts: Geometry[] = [];
  for (const s of [1, -1]) {
    parts.push(shapes.box(w, bar, t).translate(0, s * (h - bar) / 2, 0));
    parts.push(shapes.box(bar, h, t).translate(s * (w - bar) / 2, 0, 0));
  }
  parts.push(shapes.box(w * 0.55, bar * 0.6, t).translate(0, 0, t * 0.6));
  return merge(parts);
}

/** A stud: a small dome facing +Z. */
export const stud = (r: number): Geometry => shapes.sphere(r, below(8), below(4), 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);

/** A medallion facing +Z: a raised rim round a slightly domed face, `t` thick. */
export function disc(r: number, t: number, segs = 32): Geometry {
  const prof: [number, number][] = [[0.001, -t * 0.5], [r, -t * 0.5], [r, t * 0.35], [r * 0.93, t * 0.5], [r * 0.86, t * 0.3], [r * 0.6, t * 0.45], [0.001, t * 0.6]];
  return shapes.lathe(prof.map(([a, b]) => new Vec2(a, b)), below(segs)).rotateX(Math.PI / 2);
}

/** A cut gem facing +Z: a low crown over a pointed pavilion. */
export const gem = (r: number): Geometry =>
  shapes.lathe([[0.001, -r * 0.8], [r, 0], [r * 0.6, r * 0.45], [0.001, r * 0.5]].map(([a, b]) => new Vec2(a, b)), 8).rotateX(Math.PI / 2);

/**
 * Fur: `n` tufts, each rooted where `at(i)` puts it and growing along its direction, drooping under
 * their own weight; `len` and `rad` are the tufts' size, varied by `rng`.
 */
export function furTufts(rng: () => number, n: number, at: (i: number, out: { p: Vec3; d: Vec3 }) => void, len: number, rad: number): Geometry {
  return built(furTuftsSteps(rng, n, at, len, rad));
}

/** the tufts made in a piece of `furTuftsSteps` (the warrior's collar's 280 in one: 12 to 30 ms behind the lobby) */
const FUR_STEP = 70;

/** `furTufts` a piece at a time (models/steps.ts): the same tufts from the same draws, `FUR_STEP` a piece. */
export function* furTuftsSteps(
  rng: () => number, n: number, at: (i: number, out: { p: Vec3; d: Vec3 }) => void, len: number,
  rad: number,
): Generator<void, Geometry, undefined> {
  const parts: Geometry[] = [], o = { p: new Vec3(), d: new Vec3() };
  // fewer, fuller tufts at lower detail
  const m = lod(n, 4), k = Math.sqrt(n / m);
  for (let i = 0; i < m; i++) {
    if (i > 0 && i % FUR_STEP === 0) yield;
    at(Math.floor(i * n / m), o);
    const l = len * (0.7 + rng() * 0.6), d = o.d.clone().normalize();
    d.x += (rng() - 0.5) * 0.5; d.z += (rng() - 0.5) * 0.5; d.normalize();
    const pts = [o.p.clone(), o.p.clone().addScaledVector(d, l * 0.5).add(_a.set(0, -l * 0.12, 0)), o.p.clone().addScaledVector(d, l).add(_a.set(0, -l * 0.35, 0))];
    const r = rad * (0.7 + rng() * 0.6) * k;
    parts.push(scaleUV(taperTube(pts, (t) => r * (1 - t * 0.85), 3, 4), 1, 3));
  }
  return merge(parts);
}

// --- fingers -----------------------------------------------------------------------------------

export interface Finger { base: Node; mid: Node }
export interface Hand { f: Finger[]; thumb: Finger; s: number }

/**
 * Four fingers and a thumb on a rig hand joint, two knuckles each: the palm faces -z, so a finger curls
 * with +x, and the thumb sits on the inner side (`s` +1 the left hand, -1 the right). `mat` covers the
 * first knuckle, `tipMat` the second (bare fingertips out of a fingerless glove); `k` scales the hand.
 */
export function fingers(hand: Node, s: number, mat: Material, tipMat = mat, k = 1): Hand {
  const seg = (parent: Node, len: number, r: number, m: Material) => {
    part(shapes.capsule(r, len - 2 * r, 3, 6), m, parent, 0, -len / 2, 0).castShadow = false;
  };
  const f = ([[-0.026, 0.034, 0.027], [-0.009, 0.037, 0.03], [0.008, 0.034, 0.027], [0.024, 0.028, 0.022]] as const).map(([x, l1, l2]) => {
    const base = joint(hand, s * x * k, -0.098 * k, -0.004 * k);
    seg(base, l1 * k, 0.0088 * k, mat);
    const mid = joint(base, 0, -l1 * k, 0);
    seg(mid, l2 * k, 0.0078 * k, tipMat);
    return { base, mid };
  });
  const tb = joint(hand, -s * 0.034 * k, -0.05 * k, -0.012 * k);
  seg(tb, 0.032 * k, 0.0095 * k, mat);
  const tm = joint(tb, 0, -0.032 * k, 0);
  seg(tm, 0.026 * k, 0.0085 * k, tipMat);
  return { f, thumb: { base: tb, mid: tm }, s };
}

/**
 * Pose a hand: `curl` bends every finger into the palm (0 flat, ~1.4 a fist), `spread` fans them,
 * `point` straightens the index and middle fingers (the other two stay curled), `twitch` a tremor.
 */
export function poseHand(h: Hand, curl: number, spread: number, point = 0, t = 0, twitch = 0): void {
  const s = h.s;
  h.f.forEach((f, i) => {
    const c = (i < 2 ? curl * (1 - point) : curl + point * 1.1) * (0.9 + i * 0.07) + Math.sin(t * 23 + i * 1.7) * twitch;
    f.base.rotation.set(c, 0, s * (i - 1.5) * spread * 0.35);
    f.mid.rotation.set(c * 1.15, 0, 0);
  });
  const tc = curl * 0.6 + point * 0.5;
  h.thumb.base.rotation.set(0.35 + tc * 0.5, 0, -s * (0.55 - spread * 0.4));
  h.thumb.mid.rotation.set(tc * 0.8, 0, 0);
}

// --- skirt -------------------------------------------------------------------------------------

export interface SkirtOpts {
  /** radius at the waist and at the hem, length, and depth (z) as a share of width */
  r0: number; r1: number; len: number; depth?: number;
  /** vertical folds round it and their depth (share of the radius, growing to the hem) */
  folds?: number; foldAmp?: number;
  /** extra length at angle a (0 = front, +x = the left): tails, a longer back */
  hem?: (a: number) => number;
  radial?: number; rows?: number;
  /** how much it flares with speed, and how far the legs push it */
  flare?: number; push?: number;
  /** how much further out than the limbs it lies (m): a skirt worn over another */
  layer?: number;
  /** a band this share of the length deep round the hem, drawn with the mesh's second material (a trim) */
  trim?: number;
  /** the front seam parted into a slit: from this share of the length down, eased open to `gap` across at the hem
   *  (m), its two edges hanging straight (a long coat's; cut out of the hem, a slit was a V two columns wide) */
  slit?: { from: number; gap: number };
}

/** A limb a skirt keeps clear of, in the skirt's own space: from `a` (radius `ra`) to `b` (radius `rb`), the cloth's gap
 *  included. */
export interface SkirtBody { a: Vec3; b: Vec3; ra: number; rb: number }
/** a point in a joint's own frame */
export type JointPoint = [Node, Vec3];
/** A model's limbs as a skirt's bodies (`list`): capsules between points on its joints, put into the skirt's space after the
 *  pose (`place`, the joints' world matrices up to date) */
export class SkirtLimbs {
  readonly list: SkirtBody[] = [];
  private ends: [JointPoint, JointPoint][] = [];
  /** a capsule from `a` (radius `ra`) to `b` (`rb`); the body is returned, so its radii can change */
  add(a: JointPoint, b: JointPoint, ra: number, rb = ra): SkirtBody {
    const s = { a: new Vec3(), b: new Vec3(), ra, rb };
    this.list.push(s); this.ends.push([a, b]);
    return s;
  }
  place(space: Node): void {
    // (each joint's world matrix made once, the skirt's space inverted once: `freshWorld.ts`)
    freshPass();
    const local = freshLocal(space);
    for (let k = 0; k < this.list.length; k++) {
      const [[oa, pa], [ob, pb]] = this.ends[k], s = this.list[k];
      s.a.copy(pa).applyMatrix4(freshWorld(oa)).applyMatrix4(local);
      s.b.copy(pb).applyMatrix4(freshWorld(ob)).applyMatrix4(local);
    }
  }
}

/** An arm swung out at its shoulder just enough to keep its hand off a thigh and the cloth over it (a hand brushing a moving
 *  thigh rests on the skirt, never in it): points on the arm (`pts`, each with its radius: the ends of the hand's capsules, the
 *  cuff's) against the thigh's body (in `space`, placed) grown by `cloth` (what lies between), the shoulder turned out about its
 *  z (`side`: +1 the left arm) by the deepest's depth over its distance from the shoulder, a few times over. Pressed in between
 *  the hand and the thigh, the drape had no room to hold the skirt in behind the hand. `weight` eases it out (sat, a hand
 *  rests on its thigh: swung out off it, it hung beside the knee). */
export function armOffThigh(space: Node, shoulder: Node, side: number, thigh: SkirtBody, cloth: number, pts: [JointPoint, number][], weight = 1): void {
  if (weight <= 0) return;
  _sab.subVectors(thigh.b, thigh.a);
  const L2 = Math.max(1e-9, _sab.lengthSq());
  for (let it = 0; it < 3; it++) {
    let deep = 0, at = 0;
    // (each pass after the shoulder's turn: its arm's matrices made again)
    freshPass();
    const local = freshLocal(space);
    for (const [[o, p], r] of pts) {
      _sp.copy(p).applyMatrix4(freshWorld(o)).applyMatrix4(local);
      const u = clamp(_sq.subVectors(_sp, thigh.a).dot(_sab) / L2, 0, 1);
      const d = thigh.ra + (thigh.rb - thigh.ra) * u + cloth + r - _sp.distanceTo(_sq.copy(thigh.a).addScaledVector(_sab, u));
      if (d > deep) { deep = d; at = _sp.distanceTo(_sn.setFromMatrixPosition(freshWorld(shoulder)).applyMatrix4(local)); }
    }
    if (deep <= 0.001) return;
    shoulder.rotation.z += side * weight * Math.min(0.12, deep / Math.max(0.2, at));
    shoulder.updateMatrixWorld(true);
  }
}

/**
 * A skirt hanging from the hips: one continuous surface whose columns swing out from the waist as the
 * legs push them, flare with speed and lag a little behind (a spring per column). Call `update` after
 * posing the legs; draw `geo` with the outer material, and again with a back-face lining if wanted.
 * Given the limbs (`update`'s `legs` and `hands`), the posed cloth is then draped over them: each point inside a leg moved
 * out from the skirt's middle and up until it is clear, each a hand reaches or lies just outside put in behind it (the legs
 * having the last word), every point held to its length down the cloth and round it, so it lies over a raised knee and hangs
 * on below it. (Swung by the thighs' angles alone, a knee lifted at a run came out through the front and the flare swept over
 * a hand at the side; swinging whole columns out past the knee instead stood the cloth out as a stiff cone, in points.)
 */
const smoothstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class Skirt {
  readonly geo = new Geometry();
  private rest: Float32Array;
  private ang: Float32Array;
  private theta: Float32Array;
  private vel: Float32Array;
  /** each point's sideways parting at the slit (m: `SkirtOpts.slit`) */
  private open: Float32Array;
  /** points round it in each row (the last a copy of the first, at the seam) */
  readonly cols: number;
  /** as it was last laid: the thighs' swings, each limb's ends (x, y, z a point), and the time waited since (s) */
  private laid = { fL: NaN, fR: NaN, ends: new Float32Array(0), waited: 0 };
  /** whether this frame's lay is one the rest's time came round for, the body under it still (`rests`) */
  private timed = false;
  /** A lay at rest glided to from where the cloth was shown, over the time to the next lay (`CLOTH_REST.every`): shown
   *  at once, its move came in one frame after the frames it rested, and by the ranger's right hand at 144 Hz his hem
   *  jumped 1.3 cm (4 frames still, then the lay's 1/30 s at once: `lab coat`, #388). */
  private glide?: { from: Float32Array; to: Float32Array; normalsFrom: Float32Array; normalsTo: Float32Array; done: number;
    on: boolean };

  constructor(private o: SkirtOpts) {
    const radial = o.radial ?? 40, body = o.rows ?? 10, depth = o.depth ?? 0.85, trim = o.trim ?? 0;
    const rows = body + (trim ? 1 : 0);
    this.cols = radial + 1;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], open: number[] = [];
    this.ang = new Float32Array(this.cols);
    for (let j = 0; j <= rows; j++) {
      const k = j <= body ? (j / body) * (1 - trim) : 1;
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * Math.PI * 2;
        this.ang[i] = a;
        const len = o.len * (1 + (o.hem?.(a) ?? 0));
        const r = (o.r0 + (o.r1 - o.r0) * Math.pow(k, 0.8)) * (1 + (o.foldAmp ?? 0.05) * k * Math.sin(a * (o.folds ?? 9)));
        // (the front seam's two columns, the first and the last, parted either way: kept apart from the rest place, which
        // the swing turns about the skirt's middle, and added after it)
        open.push(o.slit && (i === 0 || i === radial) ? (i === 0 ? 0.5 : -0.5) * o.slit.gap * smoothstep(o.slit.from, 1, k) : 0);
        pos.push(Math.sin(a) * r + open[open.length - 1], -len * k, Math.cos(a) * r * depth);
        uv.push((i / radial) * (Math.PI * 2 * o.r1) / TILE, (1 - k) * len / TILE);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < radial; i++) {
      const a = j * this.cols + i, b = a + this.cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this.open = new Float32Array(open);
    this.rest = new Float32Array(pos);
    for (let n = 0; n < open.length; n++) this.rest[n * 3] -= open[n];
    // (the lab's handle on it: tools/lab coat)
    this.geo.name = 'skirt';
    this.geo.setAttribute('position', floats(pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('uv', floats(uv, 2));
    this.geo.setIndex(idx);
    if (trim) { const n = body * radial * 6; this.geo.addGroup(0, n, 0); this.geo.addGroup(n, idx.length - n, 1); }
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.boundingSphere!.radius *= 1.6;
    this.theta = new Float32Array(this.cols);
    this.vel = new Float32Array(this.cols);
  }

  /** `fL`, `fR`: how far forward each thigh swings (radians); `move` 0..1; `t`, `dt` in seconds; `legs` and `hands`, the
   *  limbs it keeps clear of from inside and from outside (the skirt's own space); `settle`, how far it's eased to where
   *  it's draped instead of put there (0 to 1: sat, `satBy`); `tuck`, how far its back swings in under him (rad: sat on
   *  the floor, he sits on it) */
  update(fL: number, fR: number, move: number, t: number, dt: number, legs?: SkirtBody[], hands?: SkirtBody[], settle = 0,
    tuck = 0): void {
    const o = this.o, depth = o.depth ?? 0.85, push = o.push ?? 0.8, flare = o.flare ?? 1;
    const p = this.geo.attributes.position as Attribute, R = this.rest;
    if (this.rests(fL, fR, move, dt, legs, hands)) {
      this.glideOn(dt);
      return;
    }
    const n = this.geo.attributes.normal as Attribute;
    // (where it's shown now, glided from if this lay is the rest's: copied before it's laid afresh)
    const glides = this.timed && settle === 0;
    // (its buffers made once and kept: four arrays made a lay were 30 a second to collect)
    const glide = glides ? this.glide ??= {
      from: new Float32Array(p.array.length), to: new Float32Array(p.array.length),
      normalsFrom: new Float32Array(n.array.length), normalsTo: new Float32Array(n.array.length), done: 1, on: false,
    } : null;
    glide?.from.set(p.array as Float32Array);
    glide?.normalsFrom.set(n.array as Float32Array);
    const h = Math.min(this.laid.waited, 0.05);
    this.laid.waited = 0;
    for (let i = 0; i < this.cols; i++) {
      const a = this.ang[i], sx = Math.sin(a), cz = Math.cos(a);
      const wl = clamp(0.5 + sx * 0.9, 0, 1);
      const legPush = (fL * wl + fR * (1 - wl)) * cz;
      // (no flutter sat: its few millimetres tipped the drape between his raised knees from one side to the other
      // every 2 s, 54 cm by a fire)
      const flutter = Math.sin(t * 3 + a * 3) * 0.015 * (1 - settle);
      // (sat on the floor, its back under him: hung straight down behind him it stood round his hips as a sack wider
      // than his shoulders, its hem laid out on the floor beyond)
      // (and its sides half as far in, against his thighs: hung straight down they stood out past his shoulders)
      const under = tuck * (1 - cz) / 2;
      const target = Math.max(-0.1 - under, legPush * push - under) + (0.04 + move * 0.08 + flutter) * flare + (cz > 0 ? 0 : move * 0.25 * -cz) * flare;
      // a stiff, damped spring: cloth follows the legs a moment late and settles without wobbling
      if (h > 0) {
        this.vel[i] += ((target - this.theta[i]) * 260 - this.vel[i] * 26) * h;
        this.theta[i] += this.vel[i] * h;
      } else this.theta[i] = target;
      const th = this.theta[i], c = Math.cos(th), s = Math.sin(th);
      for (let j = i; j < R.length / 3; j += this.cols) {
        const x = R[j * 3], y = R[j * 3 + 1], z = R[j * 3 + 2] / depth;
        const r = Math.hypot(x, z), r0 = o.r0, dr = r - r0;
        const nr = r0 + dr * c - y * s, ny = y * c + dr * s;
        p.setXYZ(j, sx * nr + this.open[j], ny, cz * nr * depth);
      }
    }
    this.tucked = tuck > 0;
    if (legs?.length || hands?.length) this.drape(legs ?? [], hands ?? []);
    // (eased while sat; followed at once otherwise, so a sit begins from where it was drawn)
    this.ease(settle, h);
    p.needsUpdate = true;
    vertexNormals(this.geo);
    if (glide) {
      glide.to.set(p.array as Float32Array);
      glide.normalsTo.set(n.array as Float32Array);
      glide.done = 0;
      glide.on = true;
      this.glideOn(dt);
    } else if (this.glide) this.glide.on = false;
  }

  /** The cloth moved on along its glide by `dt` s, to where it was last laid once the rest's time is up. */
  private glideOn(dt: number): void {
    const glide = this.glide;
    if (!glide?.on) return;
    glide.done = Math.min(1, glide.done + dt / CLOTH_REST.every);
    const p = this.geo.attributes.position as Attribute;
    const n = this.geo.attributes.normal as Attribute;
    const P = p.array as Float32Array, N = n.array as Float32Array, k = glide.done;
    for (let i = 0; i < P.length; i++) {
      P[i] = glide.from[i] + (glide.to[i] - glide.from[i]) * k;
      N[i] = glide.normalsFrom[i] + (glide.normalsTo[i] - glide.normalsFrom[i]) * k;
    }
    p.needsUpdate = true;
    n.needsUpdate = true;
    if (glide.done >= 1) glide.on = false;
  }

  /** Whether the cloth is left as it was last laid this frame (`CLOTH_REST`): nothing has moved the body under it
   *  since, and it was laid within the last `every` s. Otherwise how it's laid now is kept, for the frames after. */
  private rests(fL: number, fR: number, move: number, dt: number, legs?: SkirtBody[], hands?: SkirtBody[]): boolean {
    const laid = this.laid, count = ((legs?.length ?? 0) + (hands?.length ?? 0)) * 6;
    laid.waited += dt;
    let still = CLOTH_REST.on && dt > 0 && move < CLOTH_REST.walk && laid.ends.length === count
      && Math.abs(fL - laid.fL) < CLOTH_REST.swing && Math.abs(fR - laid.fR) < CLOTH_REST.swing;
    if (laid.ends.length !== count) laid.ends = new Float32Array(count);
    const ends = laid.ends, most = CLOTH_REST.moved;
    const far = (end: Vec3, k: number): boolean =>
      Math.abs(end.x - ends[k]) > most || Math.abs(end.y - ends[k + 1]) > most || Math.abs(end.z - ends[k + 2]) > most;
    const nl = legs?.length ?? 0, nh = hands?.length ?? 0;
    for (let q = 0; still && q < nl + nh; q++) {
      const body = q < nl ? legs![q] : hands![q - nl];
      if (far(body.a, q * 6) || far(body.b, q * 6 + 3)) still = false;
    }
    // (still, it rests until its time comes round, and that lay is glided to: `glide`)
    this.timed = still;
    if (still && laid.waited < CLOTH_REST.every) {
      CLOTH_REST.rested++;
      return true;
    }
    CLOTH_REST.laid++;
    for (let q = 0; q < nl + nh; q++) {
      const body = q < nl ? legs![q] : hands![q - nl], k = q * 6;
      ends[k] = body.a.x; ends[k + 1] = body.a.y; ends[k + 2] = body.a.z;
      ends[k + 3] = body.b.x; ends[k + 4] = body.b.y; ends[k + 5] = body.b.z;
    }
    laid.fL = fL; laid.fR = fR;
    return false;
  }

  /** whether its back is tucked under him this frame (`update`'s `tuck`) */
  private tucked = false;
  /** where it was drawn last frame, eased from */
  private drawn?: Float32Array;
  /** The cloth eased from where it was drawn last frame to where it's draped now, by `settle` (0 to 1) of `SETTLE`'s
   *  ease (s) over `h`. Sat, his raised thighs across every column and his hanging feet swinging slowly, the drape put a
   *  point between his knees round one or the other as they moved a millimetre, and his robe jumped up to 17 cm a frame,
   *  a few times a second ("on log cloth is jerking"); walking it follows at once. */
  private ease(settle: number, h: number): void {
    const P = (this.geo.attributes.position as Attribute).array as Float32Array;
    const was = this.drawn ??= Float32Array.from(P);
    // (only as he comes to rest: eased all the way down, his rising thigh passed the cloth lagging behind it, 8 to 9 cm)
    const k = 1 - settle ** SETTLE_IN * Math.exp(-h / SETTLE);
    for (let n = 0; n < P.length; n++) P[n] = was[n] += (P[n] - was[n]) * k;
  }

  /** Every point kept over the floor at `y` (the mesh's own space), the cloth lying on it there: a robe sat in, its hem
   *  hung down through the floor. Down each column from where it first meets the floor, the rest lies out along it,
   *  bunched up the more the further under the floor it hung: each point only lifted onto the floor, a coat hanging
   *  straight down from a man sat on the ground piled up in a ring round his hips, a sack wider than his shoulders.
   *  Call after `update`. */
  keepAbove(y: number): void {
    const p = this.geo.attributes.position as Attribute, P = p.array as Float32Array, C = this.cols;
    const rows = P.length / 3 / C;
    const hung = (this.hung ??= new Float32Array(P.length));
    hung.set(P);
    let moved = false;
    for (let i = 0; i < C; i++) {
      // (out along its column's own way where it hung straight down: out through the point above it, a point tucked
      // under him near the middle went out one way or the other as it moved a millimetre)
      const ox = Math.sin(this.ang[i]), oz = Math.cos(this.ang[i]);
      for (let k = 1; k < rows; k++) {
        const j = (k * C + i) * 3, above = j - C * 3;
        const under = y - hung[j + 1];
        if (under <= 0) continue;
        moved = true;
        // (its length to the point above it as it hung, from that point down to the floor and on along it, bunched by
        // how far under the floor it hung: laid out whole, a coat's sides lay round him in a ring half a metre across;
        // where it first meets the floor it lies where it hung, or it jumped there as it dipped under: by its length
        // as cut, the drape's stretch made it jump 1 to 2 cm)
        const len = Math.hypot(hung[j] - hung[above], hung[j + 1] - hung[above + 1], hung[j + 2] - hung[above + 2]);
        const drop = Math.max(0, P[above + 1] - y);
        const bunch = 1 - (1 - LIES_OUT) * Math.min(1, under / len);
        const far = Math.sqrt(Math.max(0, len * len - drop * drop)) * bunch;
        // (the way it hung from the point above, and on out its column's way as far as it lies)
        let dx = hung[j] - hung[above], dz = hung[j + 2] - hung[above + 2];
        const hangs = Math.hypot(dx, dz);
        if (hangs >= far) {
          const scale = hangs > 1e-6 ? far / hangs : 0;
          dx *= scale;
          dz *= scale;
        } else {
          dx += ox * (far - hangs);
          dz += oz * (far - hangs);
        }
        P[j] = P[above] + dx;
        P[j + 1] = y;
        P[j + 2] = P[above + 2] + dz;
      }
    }
    if (!moved) return;
    p.needsUpdate = true;
    vertexNormals(this.geo);
  }

  /** the points as they hung before `keepAbove` laid them on the floor */
  private hung?: Float32Array;

  /** Point `p` (in the mesh's own space) put outside the cloth as it lies now, `gap` further out: out from the skirt's middle,
   *  where it is between the waist and the hem. Whether it moved. (A sleeve hanging beside it: kept off an ellipse the size of
   *  the hips, it hung into the cloth draped out over the thighs.) */
  pushOut(p: Vec3, gap: number): boolean {
    const P = (this.geo.attributes.position as Attribute).array as Float32Array, C = this.cols, R = P.length / 3 / C, depth = this.o.depth ?? 0.85;
    if (p.y >= P[1]) return false;
    const u = ((Math.atan2(p.x, p.z / depth) / (Math.PI * 2) + 1) % 1) * (C - 1), i0 = Math.min(C - 2, Math.floor(u)), f = u - i0;
    let r = 0;
    for (let s = 0; s < 2; s++) {
      // (down the column to the two rows either side of its height)
      const i = i0 + s;
      let k = 0;
      while (k < R - 1 && P[((k + 1) * C + i) * 3 + 1] > p.y) k++;
      if (k === R - 1) return false;
      const a = (k * C + i) * 3, b = a + C * 3, ya = P[a + 1], yb = P[b + 1], t = ya > yb ? clamp((ya - p.y) / (ya - yb), 0, 1) : 0;
      r += (s ? f : 1 - f) * lerp(Math.hypot(P[a], P[a + 2] / depth), Math.hypot(P[b], P[b + 2] / depth), t);
    }
    const rp = Math.hypot(p.x, p.z / depth), want = r + gap;
    if (rp >= want || rp < 1e-6) return false;
    p.x *= want / rp; p.z *= want / rp;
    return true;
  }

  /** the limbs as the engine's cloth takes them, eight numbers each (its axis's ends, its radius at each), the hands
   *  first: kept and filled again each drape */
  private limbFloats = new Float64Array(0);
  private limbsFor(hands: SkirtBody[], legs: SkirtBody[]): Float64Array {
    const count = hands.length + legs.length;
    if (this.limbFloats.length !== count * 8) this.limbFloats = new Float64Array(count * 8);
    const out = this.limbFloats;
    for (let q = 0; q < count; q++) {
      const limb = q < hands.length ? hands[q] : legs[q - hands.length], at = q * 8;
      out[at] = limb.a.x; out[at + 1] = limb.a.y; out[at + 2] = limb.a.z;
      out[at + 3] = limb.b.x; out[at + 4] = limb.b.y; out[at + 5] = limb.b.z;
      out[at + 6] = limb.ra; out[at + 7] = limb.rb;
    }
    return out;
  }

  /** each point's length to the one above it and to the next round, as cut */
  private lens?: { down: Float32Array; round: Float32Array };
  /** The posed cloth over the limbs, draped by the engine (Bulwark's cloth.rs, the script's own steps as they were,
   *  `lab sit` alike line for line): a few rounds of putting each point the limbs reach out of them and holding the
   *  points to their lengths (a little give: cloth stretches) down the cloth from the waist and round it, ending off
   *  the limbs. Before the engine's module has loaded it hangs as laid. */
  private drape(legs: SkirtBody[], hands: SkirtBody[]): void {
    const calls = rustCalls();
    if (!calls) return;
    const P = (this.geo.attributes.position as Attribute).array as Float32Array, C = this.cols, n = P.length / 3, R = this.rest;
    if (!this.lens) {
      const down = new Float32Array(n), round = new Float32Array(n), d = (a: number, b: number) => Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
      for (let j = C; j < n; j++) down[j] = d(j, j - C);
      for (let j = 0; j < n; j++) if (j % C < C - 1) round[j] = d(j, j + 1);
      this.lens = { down, round };
    }
    const { down, round } = this.lens;
    calls.drape_cloth(P, down, round, this.limbsFor(hands, legs), hands.length, C, this.o.layer ?? 0, !!this.o.slit,
      this.tucked, this.ang, Math.min(DRAPE.passes, drapeRounds));
  }
}

/** A geometry's vertex normals as three's `computeVertexNormals` makes them, to the bit (each triangle's area-weighted
 *  normal added to its corners', then each normalized), but over the flat arrays: three's goes through vectors read and
 *  written a vertex at a time, 0.1 ms a frame for the ranger's coat. Indexed geometry; anything else goes to three's. */
export function vertexNormals(geo: Geometry): void {
  const position = geo.attributes.position as Attribute, index = geo.index;
  let normal = geo.attributes.normal as Attribute | undefined;
  if (!index || !normal || normal.count !== position.count || normal.normalized || !(normal.array instanceof Float32Array) || position.normalized) { geo.computeVertexNormals(); return; }
  const P = position.array, N = normal.array, I = index.array;
  N.fill(0);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const bx = P[b], by = P[b + 1], bz = P[b + 2];
    const cbx = P[c] - bx, cby = P[c + 1] - by, cbz = P[c + 2] - bz, abx = P[a] - bx, aby = P[a + 1] - by, abz = P[a + 2] - bz;
    const nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx;
    // (each corner's sum read before any is written, as three's does: a triangle with a corner twice adds once)
    const ax0 = N[a] + nx, ay0 = N[a + 1] + ny, az0 = N[a + 2] + nz, bx0 = N[b] + nx, by0 = N[b + 1] + ny, bz0 = N[b + 2] + nz;
    const cx0 = N[c] + nx, cy0 = N[c + 1] + ny, cz0 = N[c + 2] + nz;
    N[a] = ax0; N[a + 1] = ay0; N[a + 2] = az0; N[b] = bx0; N[b + 1] = by0; N[b + 2] = bz0; N[c] = cx0; N[c + 1] = cy0; N[c + 2] = cz0;
  }
  for (let i = 0; i < N.length; i += 3) {
    const x = N[i], y = N[i + 1], z = N[i + 2], s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    N[i] = x * s; N[i + 1] = y * s; N[i + 2] = z * s;
  }
  normal.needsUpdate = true;
}

const _sp = new Vec3(), _sq = new Vec3(), _sab = new Vec3(), _sn = new Vec3();
/** the drape's passes a frame (and one more ending off the limbs): each puts the cloth out of the limbs and holds its
 *  lengths, the last the lines between points too; most of a hero's update a frame (four, the mage's 0.94 ms) */
const DRAPE = tunable('drape', { passes: 3 });
/** the share of its length a skirt's cloth on the floor lies out over, bunched (`Skirt.keepAbove`) */
const LIES_OUT = 0.35;
/** how long a sat hero's skirt takes to ease to where it's draped (s): `Skirt.ease` */
const SETTLE = 0.4;
/** how late in the sit that ease comes in (a power of the way down) */
const SETTLE_IN = 8;

