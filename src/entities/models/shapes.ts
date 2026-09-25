// Geometry for the creatures: tapered tubes along a curve (horns, claws, ribs, tentacles), lathed
// profiles, organic noise displacement, ragged cloth, and `Sculpt`, which merges the static pieces
// of each joint per material into one mesh, so a detailed creature stays a few draw calls. A creature
// is built once per kind: later ones replay the merged geometry (see Sculpt), so spawning stays cheap.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from '../../util';

/** while a Sculpt replays cached geometry, the builders return this stand-in instead of doing work */
const NONE = new THREE.BufferGeometry();
let replaying = false;
/** true while a creature's geometry comes from the cache: skip building any geometry by hand */
export const skipping = (): boolean => replaying;

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();

/**
 * A tube along `pts` (a Catmull-Rom curve through them) whose radius follows `radius(t)`, t 0..1 from
 * the first point, closed with a point at the far end. Horns, claws, ribs, tails, fingers.
 */
export function taperTube(pts: THREE.Vector3[], radius: (t: number) => number, segs = 12, radial = 7): THREE.BufferGeometry {
  if (replaying) return NONE;
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = Math.max(1e-4, radius(t));
    curve.getPointAt(t, _v);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      _n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(_v.x + _n.x * r, _v.y + _n.y * r, _v.z + _n.z * r);
      uv.push(k / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // cap the far end with a point
  curve.getPointAt(1, _v); curve.getTangentAt(1, _t);
  const tip = pos.length / 3;
  pos.push(_v.x + _t.x * radius(1) * 0.8, _v.y + _t.y * radius(1) * 0.8, _v.z + _t.z * radius(1) * 0.8); uv.push(0.5, 1);
  for (let k = 0; k < radial; k++) { const a = segs * (radial + 1) + k; idx.push(a, tip, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A horn: out along `dir`, curling by `curl` radians about `axis`, with growth rings. */
export function horn(len: number, base: number, curl: number, axis = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3(0, 1, 0), rings = 0): THREE.BufferGeometry {
  if (replaying) return NONE;
  const pts: THREE.Vector3[] = [], p = new THREE.Vector3(), d = dir.clone().normalize(), step = len / 6;
  for (let i = 0; i <= 6; i++) { pts.push(p.clone()); p.addScaledVector(d, step); d.applyAxisAngle(axis, curl / 6); }
  return taperTube(pts, (t) => base * (1 - t * 0.92) * (rings ? 1 + 0.1 * Math.max(0, Math.sin(t * rings * Math.PI * 2)) * (1 - t) : 1), rings ? 16 : 10, 7);
}

/** A lathed solid from a profile of [radius, y] pairs (bottom to top). */
export const lathe = (profile: [number, number][], segs = 16): THREE.BufferGeometry => replaying ? NONE :
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segs);

/** Push every vertex along its normal by smooth 3D noise: turns primitives into flesh, rock or bark. */
export function organic(src: THREE.BufferGeometry, amp: number, freq: number, seed = 1): THREE.BufferGeometry {
  if (replaying) return NONE;
  const n = noise3(seed);
  // faceted geometry (polyhedra) has a vertex per face: weld it first, or the faces would drift apart
  let g = src;
  if (!g.index) {
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g); src.dispose();
    // a cylindrical projection stands in for the per-face uvs
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / Math.PI + 1; uv[i * 2 + 1] = p.getY(i); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, nr = g.attributes.normal;
  // vertices on a seam share a position: key the offset by position so seams stay closed
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(nr, i);
    const d = (n(_v.x * freq, _v.y * freq, _v.z * freq) - 0.5) * 2 * amp;
    p.setXYZ(i, _v.x + _n.x * d, _v.y + _n.y * d, _v.z + _n.z * d);
  }
  g.computeVertexNormals();
  return g;
}

/** Bend a geometry: x offset grows with y (lean), for drooping cloth or curved blades. */
export function bend<G extends THREE.BufferGeometry>(g: G, k: number, axis: 'x' | 'z' = 'z'): G {
  if (replaying) return g;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); axis === 'z' ? p.setZ(i, p.getZ(i) + k * y * y) : p.setX(i, p.getX(i) + k * y * y); }
  g.computeVertexNormals();
  return g;
}

/** A hanging ragged strip of cloth, top edge at y = 0: uneven torn hem, a little crumple. */
export function rag(w: number, h: number, seed = 1, tears = 3): THREE.BufferGeometry {
  if (replaying) return NONE;
  const r = mulberry(seed), g = new THREE.PlaneGeometry(w, h, 4, 6).translate(0, -h / 2, 0), p = g.attributes.position;
  const cuts = Array.from({ length: 5 }, () => r());
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = (x / w + 0.5), k = -y / h;
    // the bottom rows are pulled up into a torn edge
    if (k > 0.99) p.setY(i, y + h * 0.35 * cuts[Math.round(u * 4)] * Math.min(1, tears / 3));
    p.setZ(i, Math.sin(u * 9 + seed) * 0.012 + (r() - 0.5) * 0.01 * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Smooth 3D value noise in [0, 1]. */
export function noise3(seed: number): (x: number, y: number, z: number) => number {
  const r = mulberry(seed), perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x: number, y: number, z: number) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = s(x - X), v = s(y - Y), w = s(z - Z);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(l(l(h(X, Y, Z), h(X + 1, Y, Z), u), l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v),
      l(l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
  };
}

/** Mirror a non-indexed geometry across x = 0, keeping its triangles facing out. */
export function mirrorX<G extends THREE.BufferGeometry>(g: G): G {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); if (n) n.setX(i, -n.getX(i)); }
  for (let i = 0; i + 2 < p.count; i += 3) for (const a of [p, n, uv]) {
    if (!a) continue;
    for (let c = 0; c < a.itemSize; c++) { const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t); }
  }
  return g;
}

/**
 * A limb hanging down from its joint: length `len`, radius r0 at the joint to r1 at the far end,
 * a muscle `bulge` (fraction of the radius) centred at `at`, rounded ends. Lathed about -Y.
 */
export function limb(len: number, r0: number, r1: number, bulge = 0, at = 0.35, segs = 12): THREE.BufferGeometry {
  if (replaying) return NONE;
  const prof: [number, number][] = [];
  const r = (t: number) => (r0 + (r1 - r0) * t) * (1 + bulge * Math.exp(-(((t - at) / 0.28) ** 2)));
  for (let i = 4; i >= 1; i--) { const a = (i / 4) * Math.PI / 2; prof.push([Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.8]); }
  for (let i = 10; i >= 0; i--) { const t = i / 10; prof.push([r(t), -len * t]); }
  for (let i = 1; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; prof.push([Math.cos(a) * r0, Math.sin(a) * r0 * 0.8]); }
  return lathe(prof, segs);
}

/** Remove the rig's stand-in primitives (a creature sculpts its own body on the joints). */
export function stripRig(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

/** merged geometry per creature kind, shared by every creature of that kind (never disposed) */
const CACHE = new Map<string, THREE.BufferGeometry[]>();
/** pieces smaller than this (bounding radius, m) cast no shadow: chain links, claws, charms */
const SHADOW_MIN = 0.07;

/**
 * Collects static pieces and merges them per (joint, material) into one mesh each on `build()`.
 * Pieces that move on their own need their own joint; everything on one joint moves together anyway.
 * With a `kind`, the first build is cached; later builds of that kind run the same code, but the
 * geometry builders return at once and `build()` hands out the cached meshes in the same order.
 * The build must be deterministic (seeded randomness only) for that to hold.
 */
export class Sculpt {
  private groups = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  private noShadow = new Set<THREE.Material>();
  private cached: THREE.BufferGeometry[] | undefined;

  constructor(private kind?: string) {
    this.cached = kind ? CACHE.get(kind) : undefined;
    replaying = !!this.cached;
  }

  /** add `geo` under `parent` at a position, Euler rotation (XYZ) and scale (number = uniform) */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D,
    pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): this {
    if (this.cached) { this.push(parent, mat, NONE); return this; }
    const sc = typeof scale === 'number' ? _s.setScalar(scale) : _s.set(...scale);
    _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), sc);
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_m);
    if (geo.index) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    this.push(parent, mat, g);
    return this;
  }

  private push(parent: THREE.Object3D, mat: THREE.Material, g: THREE.BufferGeometry): void {
    let m = this.groups.get(parent);
    if (!m) this.groups.set(parent, (m = new Map()));
    let list = m.get(mat);
    if (!list) m.set(mat, (list = []));
    list.push(g);
  }

  /** the piece on the left joint and its mirror image (x → -x) on the right one */
  pair(geo: THREE.BufferGeometry, mat: THREE.Material, parentL: THREE.Object3D, parentR: THREE.Object3D | null,
    pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): this {
    this.add(geo, mat, parentL, pos, rot, scale);
    const list = this.groups.get(parentL)!.get(mat)!;
    this.push(parentR ?? parentL, mat, this.cached ? NONE : mirrorX(list[list.length - 1].clone()));
    return this;
  }

  /** pieces in this material cast no shadow (glows) */
  glow(mat: THREE.Material): this { this.noShadow.add(mat); return this; }

  build(): THREE.Mesh[] {
    replaying = false;
    const out: THREE.Mesh[] = [], made: THREE.BufferGeometry[] = [];
    let i = 0;
    for (const [parent, m] of this.groups) for (const [mat, list] of m) {
      let g = this.cached?.[i++];
      if (!g) {
        g = list.length === 1 ? list[0] : mergeGeometries(list)!;
        if (list.length > 1) for (const x of list) x.dispose();
        g.computeBoundingSphere();
        if (this.kind) g.userData.shared = true;
      }
      made.push(g);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !this.noShadow.has(mat) && g.boundingSphere!.radius > SHADOW_MIN;
      mesh.receiveShadow = true;
      parent.add(mesh);
      out.push(mesh);
    }
    if (this.kind && !this.cached) CACHE.set(this.kind, made);
    this.groups.clear();
    return out;
  }
}
