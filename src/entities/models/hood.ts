// A hood as cloth: a sheet of particles round from one side of the face over the head to the other and down to the
// capelet's hem, laid as it's worn (`shape`): that is its rest, and its lengths are as laid. Each particle is pulled
// towards its rest each step (`hold`): the hood over the head rides it wholly, the cloth below lies on the neck, the
// collar and the shoulders as they move under it, its rest carried by the head, the body under it or a share of each
// (`body`: the capelet on the shoulders goes with the chest). Position-based dynamics as the bell sleeves' (`sleeve.ts`):
// verlet, distance constraints, the body as elliptical capsules on its joints. (Shaped once on the head, a hood turned
// with it through the shoulders, and laid close it read as a helmet; cut flat and settled by its weight, it drifted from
// where it was laid in ways no tuning converged on, a bell over the shoulders and a cone over the head.)
import * as THREE from 'three';

/** `?cloth=0` holds the hood at its cut shape, as the sleeves are */
const CLOTH = typeof location === 'undefined' || !/[?&]cloth=0/.test(location.search);
const STEP = 1 / 60, MAX_STEPS = 3, ITER = 4;
const DAMP = 0.95, GRAVITY = 9.8;
/** the share of the head's own motion the free cloth is carried along with (as the sleeves': less trailing like a flag) */
const CARRY = 0.7;
/** what's held at least this firmly is carried wholly with what carries its rest (carried as the free cloth is, the
 *  hood's dome trailed the head 7 cm as he ran) */
const HELD = 0.25;
/** what's held at least this firmly is damped critically, its spring settling without ringing (damped as the free cloth,
 *  the hood held at 0.25-0.3 rang every 0.2 s at idle: `lab coat --rates`) */
const DAMPED = 0.1;
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4(), _c = new THREE.Vector3();

/** a body part the cloth lies outside of: a vertical capsule on `joint` from `y0` down to `y1` in its space, elliptical
 *  with radii `rx` and `rz`, its ends `ry` high (their radii's mean by default; an ellipsoid: `y0 = y1`) */
export interface HoodCapsule { joint: THREE.Object3D; y0: number; y1: number; rx: number; rz: number; ry?: number; x?: number; z?: number }
/** a body part of its own shape: `out` puts a point (`joint`'s space) out of it, `clear` past its surface, if it's in */
export interface HoodShape { joint: THREE.Object3D; out: (p: THREE.Vector3, clear: number) => boolean }
export type HoodBody = HoodCapsule | HoodShape;

export interface HoodOptions {
  /** the head: the hood's cut is in its space, and its meshes its children */
  joint: THREE.Object3D;
  /** where the cloth at (u, v) is laid as it's worn, in the head's space as the rig stands at rest (u across from one
   *  side of the face round the back to the other, v down from the top seam to the hem) */
  shape: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;
  /** the body the cloth below the head lies on, and the share of the particle at (u, v)'s rest it carries (the rest of
   *  it the head's): its rest in the body's space is where `shape` lays it as the rig stands at rest */
  body?: { joint: THREE.Object3D; share: (u: number, v: number) => number };
  /** the light reaching the lining at (u, v), 1 where it's open to the world and less deep inside (its vertex colours:
   *  the lining's material takes them) */
  shade?: (u: number, v: number) => number;
  /** where the hood ends and its capelet begins (v): the lab reads how the cloth below it lies on the body */
  capelet?: number;
  /** columns across and rows down */
  nu: number; nv: number;
  /** how hard a particle at (u, v) is held to its rest each step: 1 rides it wholly, a few hundredths hang free */
  hold: (u: number, v: number) => number;
  outer: THREE.Material;
  lining: THREE.Material;
  /** how far in the lining lies from the outside (m), along the outside's smooth normal, which points out of the sheet.
   *  (Straight towards the head, on the capelet across the shoulders it ran along the cloth and came through; along the
   *  normal turned towards the head's middle, just below the nape it turned out, and showed through the gathers) */
  thick: number;
  bodies: HoodBody[];
  /** how far clear of `bodies` the free cloth is laid, wherever `shape` laid it into them (m) */
  clear: number;
  /** a piping round its open edge and its hem: down the face's edge on one side from `from` (a share of the rows down,
   *  where the face opens), along the hem, and up the other; and with `seam`, down its middle seam too, from the face's
   *  edge over the top and down the back to the hem */
  piping?: { material: THREE.Material; radius: number; from: number; seam?: boolean };
  /** where it's drawn: its columns at u across and its rows at v down (0 to 1, in order: finer than its particles, and
   *  finer still where its creases are, `spaced`), and its creases there: how far out along its normal the cloth at
   *  (u, v) lies (m; in, below none) */
  drawn: { across: number[]; down: number[] };
  crease?: (u: number, v: number) => number;
}

/** the piping's sides round */
const SIDES = 6;
/** how short a grid's step across may be (m, squared) before its row counts as folded back on itself there */
const FOLDED = 1e-12;

export class HoodCloth {
  readonly meshes: THREE.Mesh[] = [];
  private readonly n: number;
  private readonly W: number;
  private readonly rest: Float32Array;
  /** each particle's rest in the body's space, and the share of its target the body carries */
  private readonly restBody: Float32Array;
  private readonly share: Float32Array;
  private readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly tgt: Float32Array;
  private readonly lastTgt: Float32Array;
  private readonly local: Float32Array;
  private readonly hold: Float32Array;
  /** each particle's velocity kept a step: the free cloth's lightly damped, what's held critically */
  private readonly keep: Float32Array;
  private readonly pairs: number[] = [];
  private readonly stiff: number[] = [];
  /** each constraint's length as laid (the head's space), and as the head's scale makes it now */
  private restLen = new Float32Array(0);
  private len = new Float32Array(0);
  /** each particle's anchor (the lowest particle of its column riding the head) and how far from it it may be: the cloth's
   *  length down to it, and a little (with soft constraints alone it stretched down the back and the chest) */
  private readonly anchor: Int32Array;
  private readonly tether: Float32Array;
  private readonly outer: THREE.BufferGeometry;
  private readonly inner: THREE.BufferGeometry;
  /** the drawn surface's columns and rows (`drawn`) and where each falls among the particles, its points (the head's
   *  space: its outside's positions) and normals (its outside's, and its lining's), the creases laid on them, and the
   *  rows interpolated across on the way */
  private readonly FU: number;
  private readonly FV: number;
  private readonly cols: Spline;
  private readonly rows: Spline;
  private readonly fine: Float32Array;
  private readonly smooth: Float32Array;
  private readonly creases: Float32Array;
  private readonly across: Float32Array;
  /** the piping's path, point by point on the drawn surface, and its tube; and the seam's */
  private readonly path: number[] = [];
  private readonly pipe?: THREE.BufferGeometry;
  private readonly seamPath: number[] = [];
  private readonly seamPipe?: THREE.BufferGeometry;
  private readonly bodyInv: THREE.Matrix4[] = [];
  private acc = 0;
  private needsReset = true;
  private readonly last = new THREE.Vector3();

  constructor(private readonly o: HoodOptions) {
    const { nu, nv } = o, W = nu + 1;
    this.W = W; this.n = W * (nv + 1);
    const n = this.n;
    this.rest = new Float32Array(n * 3); this.pos = new Float32Array(n * 3); this.prev = new Float32Array(n * 3);
    this.restBody = new Float32Array(n * 3); this.share = new Float32Array(n);
    this.tgt = new Float32Array(n * 3); this.lastTgt = new Float32Array(n * 3); this.local = new Float32Array(n * 3);
    this.hold = new Float32Array(n); this.keep = new Float32Array(n);
    for (let r = 0; r <= nv; r++) for (let c = 0; c <= nu; c++) {
      const i = r * W + c, w = o.hold(c / nu, r / nv);
      o.shape(c / nu, r / nv, _p);
      this.rest.set([_p.x, _p.y, _p.z], i * 3);
      this.hold[i] = w;
      // (critically: a spring held by `w` a step, its velocity kept by (1 - sqrt(w))^2, settles without ringing)
      this.keep[i] = w >= DAMPED ? Math.min(DAMP, (1 - Math.sqrt(w)) ** 2) : DAMP;
      this.share[i] = o.body ? o.body.share(c / nu, r / nv) : 0;
    }
    this.layClear();
    this.link(nu, nv);
    this.anchor = new Int32Array(this.n).fill(-1);
    this.tether = new Float32Array(this.n);
    for (let c = 0; c <= nu; c++) {
      let top = -1, run = 0;
      for (let r = 0; r <= nv; r++) {
        const i = r * W + c;
        if (this.hold[i] >= 1) { top = i; run = 0; continue; }
        if (top < 0) continue;
        run += this.laidLength(i - W, i);
        this.anchor[i] = top; this.tether[i] = run * 1.03;
      }
    }
    const { across, down } = o.drawn, FU = across.length, FV = down.length;
    this.FU = FU; this.FV = FV;
    this.cols = splineOf(across, nu); this.rows = splineOf(down, nv);
    this.across = new Float32Array(FU * (nv + 1) * 3);
    this.creases = new Float32Array(FU * FV);
    for (let r = 0; r < FV; r++) for (let c = 0; c < FU; c++) this.creases[r * FU + c] = o.crease?.(across[c], down[r]) ?? 0;
    this.outer = this.grid(1);
    this.outer.name = 'hood';   // (what the lab's `coat` and `hood` follow)
    this.outer.userData.grid = { across: FU, down: FV, rows: down, capelet: o.capelet === undefined ? undefined : nearest(down, o.capelet) };
    // (the surface written straight into its outside's arrays, and the lining's normals the same: one array written, one sent)
    this.fine = (this.outer.attributes.position as THREE.BufferAttribute).array as Float32Array;
    this.smooth = (this.outer.attributes.normal as THREE.BufferAttribute).array as Float32Array;
    this.inner = this.grid(3);
    this.inner.setAttribute('normal', this.outer.attributes.normal);
    if (o.shade) {
      const colour = new Float32Array(FU * FV * 3);
      for (let r = 0; r < FV; r++) for (let c = 0; c < FU; c++) colour.fill(o.shade(across[c], down[r]), (r * FU + c) * 3, (r * FU + c) * 3 + 3);
      this.inner.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    }
    this.add(this.outer, o.outer, true);
    this.add(this.inner, o.lining, false);
    if (o.piping) {
      // (up one side of the face from the hem, down the other, and back along the hem)
      const r0 = nearest(down, o.piping.from);
      for (let r = FV - 1; r >= r0; r--) this.path.push(r * FU);
      for (let r = r0; r < FV; r++) this.path.push(r * FU + FU - 1);
      for (let c = FU - 2; c >= 0; c--) this.path.push((FV - 1) * FU + c);
      this.pipe = tube(this.path.length);
      this.add(this.pipe, o.piping.material, false);
      if (o.piping.seam) {
        // (from the face's edge along the top seam to the back, where the halves meet, and down the middle to the hem)
        const middle = nearest(across, 0.5);
        for (let c = 0; c <= middle; c++) this.seamPath.push(c);
        for (let r = 1; r < FV; r++) this.seamPath.push(r * FU + middle);
        this.seamPipe = tube(this.seamPath.length);
        this.add(this.seamPipe, o.piping.material, false);
      }
    }
  }

  /** the free cloth laid clear of the body as the rig stands at rest, and its rest in the body's space there */
  private layClear(): void {
    const { joint, body, bodies, clear } = this.o, R = this.rest;
    joint.updateWorldMatrix(true, false);
    for (const B of bodies) B.joint.updateWorldMatrix(true, false);
    _inv.copy(joint.matrixWorld).invert();
    for (let i = 0; i < this.n; i++) {
      if (this.hold[i] >= 1) continue;
      _p.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]).applyMatrix4(joint.matrixWorld);
      for (const B of bodies) {
        _m.copy(B.joint.matrixWorld).invert();
        outOf(B, _p, _m, clear);
      }
      _p.applyMatrix4(_inv);
      R[i * 3] = _p.x; R[i * 3 + 1] = _p.y; R[i * 3 + 2] = _p.z;
    }
    if (!body) return;
    body.joint.updateWorldMatrix(true, false);
    _m.copy(body.joint.matrixWorld).invert().multiply(joint.matrixWorld);
    for (let i = 0; i < this.n; i++) {
      _p.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]).applyMatrix4(_m);
      this.restBody[i * 3] = _p.x; this.restBody[i * 3 + 1] = _p.y; this.restBody[i * 3 + 2] = _p.z;
    }
  }

  /** the constraints: across and down, the diagonals (shear) and every other one (a soft bend: stiff, it stood as a shell) */
  private link(nu: number, nv: number): void {
    const W = this.W, id = (r: number, c: number) => r * W + c;
    const join = (a: number, b: number, k: number) => { this.pairs.push(a, b); this.stiff.push(k); };
    for (let r = 0; r <= nv; r++) for (let c = 0; c <= nu; c++) {
      if (c < nu) join(id(r, c), id(r, c + 1), 1);
      if (r < nv) join(id(r, c), id(r + 1, c), 1);
      if (r < nv && c < nu) { join(id(r, c), id(r + 1, c + 1), 0.5); join(id(r, c + 1), id(r + 1, c), 0.5); }
      if (c + 2 <= nu) join(id(r, c), id(r, c + 2), 0.15);
      if (r + 2 <= nv) join(id(r, c), id(r + 2, c), 0.15);
    }
    const P = this.pairs;
    this.restLen = new Float32Array(this.stiff.length);
    for (let k = 0; k < this.restLen.length; k++) this.restLen[k] = this.laidLength(P[k * 2], P[k * 2 + 1]);
    this.len = new Float32Array(this.stiff.length);
  }

  /** the cloth's length between particles `a` and `b` as laid */
  private laidLength(a: number, b: number): number {
    const R = this.rest, ia = a * 3, ib = b * 3;
    return Math.hypot(R[ia] - R[ib], R[ia + 1] - R[ib + 1], R[ia + 2] - R[ib + 2]);
  }

  /** the drawn surface's mesh (`uvScale` across, for the lining's finer weave) */
  private grid(uvScale: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), FU = this.FU, FV = this.FV, count = FU * FV, idx: number[] = [], uv = new Float32Array(count * 2);
    const { across, down } = this.o.drawn;
    for (let r = 0; r < FV; r++) for (let c = 0; c < FU; c++) uv.set([across[c] * 4 * uvScale, down[r] * 2], (r * FU + c) * 2);
    for (let r = 0; r + 1 < FV; r++) for (let c = 0; c + 1 < FU; c++) { const a = r * FU + c; idx.push(a, a + FU, a + 1, a + 1, a + FU, a + FU + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  private add(g: THREE.BufferGeometry, m: THREE.Material, shadow: boolean): void {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    mesh.userData.hoodPart = true;
    mesh.frustumCulled = false;   // it moves off its bind bounds
    this.o.joint.add(mesh);
    this.meshes.push(mesh);
  }

  reset(): void { this.needsReset = true; }

  /** Step the cloth (after the skeleton is posed, its world matrices current) and write it into the meshes. */
  update(dt: number): void {
    const { joint } = this.o, n = this.n, T = this.tgt;
    joint.updateWorldMatrix(true, false);
    const e = joint.matrixWorld.elements;
    this.place();
    _p.set(e[12], e[13], e[14]);
    const jumped = this.last.distanceToSquared(_p) > 2.25;   // a teleport: settle where it landed
    this.last.copy(_p);
    if (!CLOTH || this.needsReset || jumped || !Number.isFinite(this.pos[0])) {
      this.pos.set(T); this.prev.set(T); this.needsReset = false; this.acc = 0;
      // (settled once on the body before it's first seen: cut on the head, the mantle stood off the shoulders)
      if (CLOTH) for (let s = 0; s < 30; s++) this.step(true);
    } else {
      // (what's held firmly, wholly: carried as the capelet is, the hood's dome trailed the head 7 cm as he ran)
      for (let i = 0; i < n * 3; i++) {
        const carry = CARRY + (1 - CARRY) * Math.min(1, this.hold[(i / 3) | 0] / HELD);
        const d = (T[i] - this.lastTgt[i]) * carry;
        this.pos[i] += d; this.prev[i] += d;
      }
      this.acc += Math.min(dt, 0.05);
      let k = 0;
      while (this.acc >= STEP && k++ < MAX_STEPS) { this.acc -= STEP; this.step(false); }
      if (k >= MAX_STEPS) this.acc = 0;
    }
    this.lastTgt.set(T);
    this.write();
  }

  /** the targets (the rest where the head and the body are now, each its share) and the lengths in the head's scale
   *  (measured again between the targets each frame, they were a third of the cost) */
  private place(): void {
    const M = this.o.joint.matrixWorld, e = M.elements, R = this.rest, T = this.tgt;
    for (let i = 0; i < this.n * 3; i += 3) {
      const x = R[i], y = R[i + 1], z = R[i + 2];
      T[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      T[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      T[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    if (this.o.body) {
      const b = this.o.body.joint.matrixWorld.elements, RB = this.restBody;
      for (let i = 0; i < this.n; i++) {
        const s = this.share[i];
        if (s <= 0) continue;
        const j = i * 3, x = RB[j], y = RB[j + 1], z = RB[j + 2];
        T[j] += (b[0] * x + b[4] * y + b[8] * z + b[12] - T[j]) * s;
        T[j + 1] += (b[1] * x + b[5] * y + b[9] * z + b[13] - T[j + 1]) * s;
        T[j + 2] += (b[2] * x + b[6] * y + b[10] * z + b[14] - T[j + 2]) * s;
      }
    }
    const sc = Math.cbrt(Math.abs(M.determinant()));
    for (let k = 0; k < this.len.length; k++) this.len[k] = this.restLen[k] * sc;
  }

  private step(settling: boolean, iterations = ITER): void {
    const { pos, prev, tgt, hold, keep } = this, n = this.n, h2 = STEP * STEP;
    for (let i = 0; i < n; i++) {
      const w = hold[i], kept = keep[i];
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k, x = pos[j], v = settling ? 0 : (x - prev[j]) * kept;
        prev[j] = x;
        pos[j] = x + v + (k === 1 ? -GRAVITY * h2 : 0) + (tgt[j] - x) * w;
      }
    }
    const bodies = this.o.bodies;
    for (let b = 0; b < bodies.length; b++) (this.bodyInv[b] ??= new THREE.Matrix4()).copy(bodies[b].joint.matrixWorld).invert();
    const P = this.pairs;
    for (let it = 0; it < iterations; it++) {
      for (let k = 0; k < this.len.length; k++) {
        const a = P[k * 2], b = P[k * 2 + 1], wa = 1 - hold[a], wb = 1 - hold[b], w = wa + wb;
        if (w < 1e-6) continue;
        const ia = a * 3, ib = b * 3, dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = (d - this.len[k]) / d / w * this.stiff[k];
        pos[ia] += dx * f * wa; pos[ia + 1] += dy * f * wa; pos[ia + 2] += dz * f * wa;
        pos[ib] -= dx * f * wb; pos[ib + 1] -= dy * f * wb; pos[ib + 2] -= dz * f * wb;
      }
      this.tie();
      // (the body last, as the sleeves': each iteration it was most of the cloth's cost)
      if (it === iterations - 1) this.collide(bodies);
    }
    // (what rides the head, wholly)
    for (let i = 0; i < n; i++) if (hold[i] >= 1) for (let k = 0; k < 3; k++) { pos[i * 3 + k] = tgt[i * 3 + k]; prev[i * 3 + k] = tgt[i * 3 + k]; }
  }

  /** each particle within its tether of its anchor (in the head's scale: the tethers are the cut's lengths) */
  private tie(): void {
    const pos = this.pos, sc = Math.cbrt(Math.abs(this.o.joint.matrixWorld.determinant()));
    for (let i = 0; i < this.n; i++) {
      const a = this.anchor[i];
      if (a < 0) continue;
      const ia = a * 3, ib = i * 3, dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz), lim = this.tether[i] * sc;
      if (d <= lim) continue;
      const k = lim / d;
      pos[ib] = pos[ia] + dx * k; pos[ib + 1] = pos[ia + 1] + dy * k; pos[ib + 2] = pos[ia + 2] + dz * k;
    }
  }

  /** the free cloth out of the bodies, each tried on the cloth within its reach alone (tried on all of it, most of it
   *  nowhere near, they were half the cloth's step) */
  private collide(bodies: HoodBody[]): void {
    const pos = this.pos, n = this.n;
    for (let b = 0; b < bodies.length; b++) {
      const B = bodies[b], inv = this.bodyInv[b], reach = reachOf(B, _c);
      for (let i = 0; i < n; i++) {
        if (this.hold[i] >= 1) continue;
        const j = i * 3, dx = pos[j] - _c.x, dy = pos[j + 1] - _c.y, dz = pos[j + 2] - _c.z;
        if (reach > 0 && dx * dx + dy * dy + dz * dz > reach) continue;
        _p.set(pos[j], pos[j + 1], pos[j + 2]);
        if (!outOf(B, _p, inv, 0)) continue;
        pos[j] = _p.x; pos[j + 1] = _p.y; pos[j + 2] = _p.z;
      }
    }
  }

  /** the particles into the meshes, in the head's space: a surface `detail` times finer through them, creased along its
   *  normals; the outside, and the lining `thick` in along them */
  private write(): void {
    _inv.copy(this.o.joint.matrixWorld).invert();
    const L = this.local, n = this.n, W = this.W, nv = this.o.nv, FU = this.FU, FV = this.FV;
    for (let i = 0; i < n; i++) {
      _p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(_inv);
      L[i * 3] = _p.x; L[i * 3 + 1] = _p.y; L[i * 3 + 2] = _p.z;
    }
    // (across each particle row, then down each column of those: Catmull-Rom, through every particle)
    const A = this.across, F = this.fine, { at: ca, t: ct } = this.cols, { at: ra, t: rt } = this.rows;
    for (let r = 0; r <= nv; r++) for (let c = 0; c < FU; c++) {
      const q = c * 4, t = ct[c], i0 = (r * W + ca[q]) * 3, i1 = (r * W + ca[q + 1]) * 3, i2 = (r * W + ca[q + 2]) * 3, i3 = (r * W + ca[q + 3]) * 3;
      for (let k = 0; k < 3; k++) A[(r * FU + c) * 3 + k] = catmull(L[i0 + k], L[i1 + k], L[i2 + k], L[i3 + k], t);
    }
    for (let r = 0; r < FV; r++) {
      const q = r * 4, t = rt[r], r0 = ra[q] * FU, r1 = ra[q + 1] * FU, r2 = ra[q + 2] * FU, r3 = ra[q + 3] * FU;
      // (down from the top seam each column runs on from the other half's, across the seam, as the cloth is sewn: begun
      // on the seam itself, each half left it straight for its next row, a ridge, and the face's arch came to a point)
      const over = ra[q] === ra[q + 1];
      for (let c = 0; c < FU; c++) {
        const before = over ? FU + FU - 1 - c : r0 + c;
        for (let k = 0; k < 3; k++) {
          F[(r * FU + c) * 3 + k] = catmull(A[before * 3 + k], A[(r1 + c) * 3 + k], A[(r2 + c) * 3 + k], A[(r3 + c) * 3 + k], t);
        }
      }
    }
    // (the creases out along the smooth surface's normals, the lining `thick` in along them, then the normals again over
    // the creased surface: in along the creased ones, in the gathers' tight valleys a wall's lining crossed the facing
    // wall's outside and showed through it)
    const S = this.smooth, pi = this.inner.attributes.position as THREE.BufferAttribute, I = pi.array as Float32Array;
    const t = this.o.thick;
    normals(F, FU, FV, S);
    for (let i = 0; i < FU * FV; i++) {
      const j = i * 3, c = this.creases[i];
      F[j] += S[j] * c; F[j + 1] += S[j + 1] * c; F[j + 2] += S[j + 2] * c;
      I[j] = F[j] - S[j] * t; I[j + 1] = F[j + 1] - S[j + 1] * t; I[j + 2] = F[j + 2] - S[j + 2] * t;
    }
    normals(F, FU, FV, S);
    this.outer.attributes.position.needsUpdate = this.outer.attributes.normal.needsUpdate = pi.needsUpdate = true;
    if (this.pipe) this.writePipe(this.pipe, this.path);
    if (this.seamPipe) this.writePipe(this.seamPipe, this.seamPath);
  }

  /** a piping's tube `g` along its `path` on the drawn surface, its sides turned by the surface's normal there */
  private writePipe(g: THREE.BufferGeometry, path: number[]): void {
    const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
    const L = this.fine, N = this.smooth, n = path.length, rad = this.o.piping!.radius;
    for (let k = 0; k < n; k++) {
      const i = path[k], prev = path[Math.max(0, k - 1)], next = path[Math.min(n - 1, k + 1)];
      _a.set(L[next * 3] - L[prev * 3], L[next * 3 + 1] - L[prev * 3 + 1], L[next * 3 + 2] - L[prev * 3 + 2]).normalize();
      _n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      _b.crossVectors(_a, _n).normalize();
      _n.crossVectors(_b, _a);
      for (let s = 0; s <= SIDES; s++) {
        const t = (s / SIDES) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t);
        const nx = _n.x * cs + _b.x * sn, ny = _n.y * cs + _b.y * sn, nz = _n.z * cs + _b.z * sn, v = k * (SIDES + 1) + s;
        pos.setXYZ(v, L[i * 3] + nx * rad, L[i * 3 + 1] + ny * rad, L[i * 3 + 2] + nz * rad);
        nor.setXYZ(v, nx, ny, nz);
      }
    }
    pos.needsUpdate = nor.needsUpdate = true;
  }

  dispose(): void { this.outer.dispose(); this.inner.dispose(); this.pipe?.dispose(); this.seamPipe?.dispose(); }
}

/** `count + 1` points evenly along a centripetal Catmull-Rom through `pts`, its ends shaped by the points beyond them
 *  (`pre` before the first, `post` after the last: a mirror's, for a row that runs on into its mirror at a seam) */
export function evenly(pts: THREE.Vector3[], pre: THREE.Vector3, post: THREE.Vector3, count: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3([pre, ...pts, post], false, 'centripetal'), m = pts.length + 1;
  const dense: THREE.Vector3[] = [], run = [0];
  // (between the first and the last of `pts` alone: `pre` and `post` only shape its ends)
  for (let k = 0; k <= EVEN_SAMPLES; k++) dense.push(curve.getPoint((1 + (k / EVEN_SAMPLES) * (m - 2)) / m));
  for (let k = 1; k < dense.length; k++) run.push(run[k - 1] + dense[k].distanceTo(dense[k - 1]));
  const out: THREE.Vector3[] = [];
  for (let i = 0, k = 0; i <= count; i++) {
    const want = (i / count) * run[run.length - 1];
    while (k < run.length - 2 && run[k + 1] < want) k++;
    out.push(dense[k].clone().lerp(dense[k + 1], (want - run[k]) / Math.max(1e-9, run[k + 1] - run[k])));
  }
  return out;
}
/** how finely `evenly` follows its curve before spacing its points along it */
const EVEN_SAMPLES = 256;

/** where body `B` is (world space, into `at`) and how far round it it reaches, squared: 0 for one of its own shape (tried
 *  everywhere) */
function reachOf(B: HoodBody, at: THREE.Vector3): number {
  if ('out' in B) return 0;
  const M = B.joint.matrixWorld, r = (B.y0 - B.y1) / 2 + Math.max(B.rx, B.rz, B.ry ?? 0);
  at.set(B.x ?? 0, (B.y0 + B.y1) / 2, B.z ?? 0).applyMatrix4(M);
  const s = Math.cbrt(Math.abs(M.determinant())) * r;
  return s * s;
}

/** `p` (world space) put out of body `B` (`inv`: its joint's world matrix inverted) by `clear` past its surface, along
 *  the way out from its axis; whether it was in */
function outOf(B: HoodBody, p: THREE.Vector3, inv: THREE.Matrix4, clear: number): boolean {
  _a.copy(p).applyMatrix4(inv);
  if ('out' in B) {
    if (!B.out(_a, clear)) return false;
    p.copy(_a).applyMatrix4(B.joint.matrixWorld);
    return true;
  }
  const rx = B.rx + clear, rz = B.rz + clear, ry = (B.ry ?? (B.rx + B.rz) * 0.5) + clear, ox = B.x ?? 0, oz = B.z ?? 0;
  const cy = Math.max(B.y1, Math.min(B.y0, _a.y)), dy = _a.y - cy, lx = _a.x - ox, lz = _a.z - oz;
  const ex = lx / rx, ez = lz / rz, ey = dy / ry, e = Math.sqrt(ex * ex + ez * ez + ey * ey);
  if (e >= 1 || e < 1e-6) return false;
  const k = 1 / e;
  p.set(ox + lx * k, cy + dy * k, oz + lz * k).applyMatrix4(B.joint.matrixWorld);
  return true;
}

/** a tube of `n` points along a path with `SIDES` sides (placeholder positions, filled by `writePipe`), its faces out
 *  (wound the other way, the far wall was drawn, lit from behind: the piping read thin and grey) */
function tube(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), idx: number[] = [], W = SIDES + 1;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * W * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * W * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * W * 2), 2));
  for (let k = 0; k + 1 < n; k++) for (let s = 0; s < SIDES; s++) {
    const a = k * W + s, b = a + W;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  g.setIndex(idx);
  return g;
}

/** where each drawn place falls among the particles: the four round it (`at`, four a place) and how far between the
 *  middle two (`t`) */
interface Spline { at: Int32Array; t: Float32Array }

/** where each of the drawn places `at` (0 to 1) falls among the particles 0 to `last` */
function splineOf(at: number[], last: number): Spline {
  const four = new Int32Array(at.length * 4), t = new Float32Array(at.length);
  at.forEach((a, k) => {
    const f = a * last, i = Math.min(last - 1, Math.floor(f));
    four.set([Math.max(0, i - 1), i, i + 1, Math.min(last, i + 2)], k * 4);
    t[k] = f - i;
  });
  return { at: four, t };
}

/** the index of the place in `at` nearest `v` */
const nearest = (at: number[], v: number) => at.reduce((best, a, k) => (Math.abs(a - v) < Math.abs(at[best] - v) ? k : best), 0);

/** `count + 1` places from 0 to 1 spaced by `density` (as many between two as its integral between them): where a
 *  surface is drawn, finer where it's higher */
export function spaced(count: number, density: (t: number) => number): number[] {
  const run = [0];
  for (let k = 1; k <= SPACED_SAMPLES; k++) run.push(run[k - 1] + density((k - 0.5) / SPACED_SAMPLES));
  const out: number[] = [];
  for (let i = 0, k = 0; i <= count; i++) {
    const want = (i / count) * run[SPACED_SAMPLES];
    while (k < SPACED_SAMPLES - 1 && run[k + 1] < want) k++;
    out.push((k + (want - run[k]) / Math.max(1e-12, run[k + 1] - run[k])) / SPACED_SAMPLES);
  }
  return out;
}
/** how finely `spaced` sums its density */
const SPACED_SAMPLES = 2048;

/** Catmull-Rom between `b` and `c` (`a` before, `d` after) at `t` */
function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
}

/** each point's normal of a `cols` by `rows` grid `p` into `out`, by differences over its neighbours: down, then across,
 *  crossed to point out (crossed the other way they pointed in, and every light behind the hood lit it in blotches);
 *  on the first row, the top seam, up across it into the other half (one-sided, each half's lit the seam as a crease);
 *  where a row folds back on itself, its neighbours one place (the top seam where it turns down the back), across along
 *  the next row (there the normal came out naught: the seam's piping pinched to a black knot over the crown) */
function normals(p: Float32Array, cols: number, rows: number, out: Float32Array): void {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = (r * cols + Math.min(cols - 1, c + 1)) * 3, b = (r * cols + Math.max(0, c - 1)) * 3;
    const d = (Math.min(rows - 1, r + 1) * cols + c) * 3, u = (r > 0 ? (r - 1) * cols + c : cols + cols - 1 - c) * 3;
    _a.set(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
    if (_a.lengthSq() < FOLDED) {
      const next = (r + 1 < rows ? cols : -cols) * 3;
      _a.set(p[a + next] - p[b + next], p[a + next + 1] - p[b + next + 1], p[a + next + 2] - p[b + next + 2]);
    }
    const at = (r * cols + c) * 3;
    _b.set(p[d] - p[u], p[d + 1] - p[u + 1], p[d + 2] - p[u + 2]);
    // (the seam down the back is its own other half: there, down from the top seam alone)
    if (_b.lengthSq() < FOLDED) _b.set(p[d] - p[at], p[d + 1] - p[at + 1], p[d + 2] - p[at + 2]);
    _n.crossVectors(_b, _a).normalize();
    // (written one by one: set from an array made for each point, it fed the garbage collector a few thousand a frame)
    out[at] = _n.x; out[at + 1] = _n.y; out[at + 2] = _n.z;
  }
}
