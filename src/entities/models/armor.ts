// Geometry for the heroes' gear: solid plates bent to any surface (with rolled edges), straps that
// wrap round the body, fur tufts, studs, medallions, gloved fingers, and a skirt of cloth or mail that
// swings with the legs. Static pieces go through `Sculpt` (entities/models/shapes.ts) to merge per joint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperTube as rawTube, twist as rawTwist } from './shapes';
import { part, joint } from './rig';
import { clamp } from '../../util';

let detail = 1;
/** The heroes' geometric detail, 1 = full (the quality preset's `heroDetail`): heroes built from now on
 *  use fewer hair locks and fur tufts and coarser curves below 1. */
export function setHeroDetail(k: number): void { detail = k; }
export const heroDetail = (): number => detail;
/** `n` scaled by the detail level, at least `min` */
export const lod = (n: number, min = 1): number => Math.max(min, Math.round(n * detail));

/** texture tile (m): uvs count metres / TILE, so every piece has the same texel density */
const TILE = 0.3;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

const clean = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  return n;
};
/** merge pieces into one non-indexed geometry (position, normal, uv) */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map(clean);
  const g = mergeGeometries(list)!;
  for (const x of list) x.dispose();
  return g;
}

/** turn an indexed geometry's triangles round (and its normals with them) */
function flip<G extends THREE.BufferGeometry>(g: G): G {
  const ix = g.index!;
  for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); }
  g.computeVertexNormals();
  return g;
}
/** `shapes.taperTube`, facing out (its triangles wind inwards, which the creatures' double-sided or dark
 *  materials hide, but a lit hero part would show inside out) */
export const taperTube = (pts: THREE.Vector3[], radius: (t: number) => number, segs = 12, radial = 7): THREE.BufferGeometry => flip(rawTube(pts, radius, segs, radial));
/** `shapes.twist`, facing out */
export const twist = (len: number, rad: number, thick: number, turns: number, phase = 0): THREE.BufferGeometry => flip(rawTwist(len, rad, thick, turns, phase));

/** scale a geometry's uvs */
export function scaleUV<G extends THREE.BufferGeometry>(g: G, su: number, sv: number): G {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** A surface point for u, v in 0..1 (u across, v up). */
export type SurfaceFn = (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;

function grid(fn: SurfaceFn, nu: number, nv: number): THREE.Vector3[][] {
  const P: THREE.Vector3[][] = [];
  for (let j = 0; j <= nv; j++) { const row: THREE.Vector3[] = []; for (let i = 0; i <= nu; i++) row.push(fn(i / nu, j / nv, new THREE.Vector3())); P.push(row); }
  return P;
}

/**
 * A plate following `fn`, `thick` deep (a solid with its edges closed), smooth-shaded. Its uvs run in
 * metres / TILE along u and v, unless `uv` gives them per grid point.
 */
export function plate(fn: SurfaceFn, nu: number, nv: number, thick: number, uv?: (u: number, v: number) => [number, number] | null, inside = new THREE.Vector3()): THREE.BufferGeometry {
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
  const outer = new THREE.BufferGeometry();
  outer.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  outer.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
  r.setAttribute('uv', new THREE.Float32BufferAttribute(rimUV, 2));
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
export function edgeTube(fn: SurfaceFn, edge: 'u0' | 'u1' | 'v0' | 'v1', r: number, n = 16, inset = 0): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push(edge[0] === 'u' ? fn(edge === 'u0' ? inset : 1 - inset, t, new THREE.Vector3()) : fn(t, edge === 'v0' ? inset : 1 - inset, new THREE.Vector3()));
  }
  return scaleUV(taperTube(pts, () => r, n * 2, 6), 1, 4);
}

/** outward from the vertical axis through the origin: straps round a torso or a limb */
export const RADIAL = (p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => out.set(p.x, 0, p.z).normalize();

/**
 * A flat strap `w` wide and `t` thick along a curve through `pts`, lying flat against the body (its face
 * turned to `outward(p)`); `closed` makes it a loop (a belt).
 */
export function strap(pts: THREE.Vector3[], w: number, t: number, closed = false, outward = RADIAL, n = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  const segs = n || Math.max(4, Math.ceil(curve.getLength() / 0.02));
  const pos: number[] = [], uv: number[] = [];
  const S: THREE.Vector3[][] = [], L = curve.getLength() / TILE;
  const T = new THREE.Vector3(), O = new THREE.Vector3(), X = new THREE.Vector3(), p = new THREE.Vector3();
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** a loop of strap round an ellipse (rx by rz) at height y: a belt, a band round a limb */
export function belt(rx: number, rz: number, y: number, w: number, t: number, tilt = 0, n = 24): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * rx, y + Math.cos(a) * tilt, Math.cos(a) * rz)); }
  return strap(pts, w, t, true, RADIAL, n * 3);
}

/** A buckle: a flat rectangular frame with a pin, facing +Z. */
export function buckle(w: number, h: number, t = 0.006): THREE.BufferGeometry {
  const bar = t * 1.2, parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    parts.push(new THREE.BoxGeometry(w, bar, t).translate(0, s * (h - bar) / 2, 0));
    parts.push(new THREE.BoxGeometry(bar, h, t).translate(s * (w - bar) / 2, 0, 0));
  }
  parts.push(new THREE.BoxGeometry(w * 0.55, bar * 0.6, t).translate(0, 0, t * 0.6));
  return merge(parts);
}

/** A stud: a small dome facing +Z. */
export const stud = (r: number): THREE.BufferGeometry => new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);

/** A medallion facing +Z: a raised rim round a slightly domed face, `t` thick. */
export function disc(r: number, t: number, segs = 32): THREE.BufferGeometry {
  const prof: [number, number][] = [[0.001, -t * 0.5], [r, -t * 0.5], [r, t * 0.35], [r * 0.93, t * 0.5], [r * 0.86, t * 0.3], [r * 0.6, t * 0.45], [0.001, t * 0.6]];
  return new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), segs).rotateX(Math.PI / 2);
}

/** A cut gem facing +Z: a low crown over a pointed pavilion. */
export const gem = (r: number): THREE.BufferGeometry =>
  new THREE.LatheGeometry([[0.001, -r * 0.8], [r, 0], [r * 0.6, r * 0.45], [0.001, r * 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 8).rotateX(Math.PI / 2);

/**
 * Fur: `n` tufts, each rooted where `at(i)` puts it and growing along its direction, drooping under
 * their own weight; `len` and `rad` are the tufts' size, varied by `rng`.
 */
export function furTufts(rng: () => number, n: number, at: (i: number, out: { p: THREE.Vector3; d: THREE.Vector3 }) => void, len: number, rad: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], o = { p: new THREE.Vector3(), d: new THREE.Vector3() };
  // fewer, fuller tufts at lower detail
  const m = lod(n, 4), k = Math.sqrt(n / m);
  for (let i = 0; i < m; i++) {
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

export interface Finger { base: THREE.Group; mid: THREE.Group }
export interface Hand { f: Finger[]; thumb: Finger; s: number }

/**
 * Four fingers and a thumb on a rig hand joint, two knuckles each: the palm faces -z, so a finger curls
 * with +x, and the thumb sits on the inner side (`s` +1 the left hand, -1 the right). `mat` covers the
 * first knuckle, `tipMat` the second (bare fingertips out of a fingerless glove); `k` scales the hand.
 */
export function fingers(hand: THREE.Group, s: number, mat: THREE.Material, tipMat = mat, k = 1): Hand {
  const seg = (parent: THREE.Group, len: number, r: number, m: THREE.Material) => {
    part(new THREE.CapsuleGeometry(r, len - 2 * r, 3, 6), m, parent, 0, -len / 2, 0).castShadow = false;
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
  /** a band this share of the length deep round the hem, drawn with the mesh's second material (a trim) */
  trim?: number;
}

/**
 * A skirt hanging from the hips: one continuous surface whose columns swing out from the waist as the
 * legs push them, flare with speed and lag a little behind (a spring per column). Call `update` after
 * posing the legs; draw `geo` with the outer material, and again with a back-face lining if wanted.
 */
export class Skirt {
  readonly geo = new THREE.BufferGeometry();
  private rest: Float32Array;
  private ang: Float32Array;
  private theta: Float32Array;
  private vel: Float32Array;
  private cols: number;

  constructor(private o: SkirtOpts) {
    const radial = o.radial ?? 40, body = o.rows ?? 10, depth = o.depth ?? 0.85, trim = o.trim ?? 0;
    const rows = body + (trim ? 1 : 0);
    this.cols = radial + 1;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    this.ang = new Float32Array(this.cols);
    for (let j = 0; j <= rows; j++) {
      const k = j <= body ? (j / body) * (1 - trim) : 1;
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * Math.PI * 2;
        this.ang[i] = a;
        const len = o.len * (1 + (o.hem?.(a) ?? 0));
        const r = (o.r0 + (o.r1 - o.r0) * Math.pow(k, 0.8)) * (1 + (o.foldAmp ?? 0.05) * k * Math.sin(a * (o.folds ?? 9)));
        pos.push(Math.sin(a) * r, -len * k, Math.cos(a) * r * depth);
        uv.push((i / radial) * (Math.PI * 2 * o.r1) / TILE, (1 - k) * len / TILE);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < radial; i++) {
      const a = j * this.cols + i, b = a + this.cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this.rest = new Float32Array(pos);
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    if (trim) { const n = body * radial * 6; this.geo.addGroup(0, n, 0); this.geo.addGroup(n, idx.length - n, 1); }
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.boundingSphere!.radius *= 1.6;
    this.theta = new Float32Array(this.cols);
    this.vel = new Float32Array(this.cols);
  }

  /** `fL`, `fR`: how far forward each thigh swings (radians); `move` 0..1; `t`, `dt` in seconds */
  update(fL: number, fR: number, move: number, t: number, dt: number): void {
    const o = this.o, depth = o.depth ?? 0.85, push = o.push ?? 0.8, flare = o.flare ?? 1;
    const p = this.geo.attributes.position as THREE.BufferAttribute, R = this.rest;
    const h = Math.min(dt, 0.05);
    for (let i = 0; i < this.cols; i++) {
      const a = this.ang[i], sx = Math.sin(a), cz = Math.cos(a);
      const wl = clamp(0.5 + sx * 0.9, 0, 1);
      const legPush = (fL * wl + fR * (1 - wl)) * cz;
      const target = Math.max(-0.1, legPush * push) + (0.04 + move * 0.08 + Math.sin(t * 3 + a * 3) * 0.015) * flare + (cz > 0 ? 0 : move * 0.25 * -cz) * flare;
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
        p.setXYZ(j, sx * nr, ny, cz * nr * depth);
      }
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
