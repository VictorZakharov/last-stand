// A hood as cloth: a sheet of particles round from one side of the face over the head to the other and down to the
// capelet's hem, its lengths those of its cut laid flat (`length`, `hoodPattern.ts`), whose top seam rides the head
// while the rest hangs by its weight onto the head, the neck, the collar and the shoulders as they move under it. Laid
// on the head roughly (`shape`), it's settled there once by its weight alone (`settle`), and that shape is its rest:
// each particle is pulled towards it a little (`hold`), so it keeps its drape but lies on the shoulders when the head
// turns. Position-based dynamics as the bell sleeves' (`sleeve.ts`): verlet, distance constraints, the body as
// elliptical capsules on its joints. (Shaped once on the head, a hood turned with it through the shoulders, and laid
// close it read as a helmet.)
import * as THREE from 'three';

/** `?cloth=0` holds the hood at its cut shape, as the sleeves are */
const CLOTH = typeof location === 'undefined' || !/[?&]cloth=0/.test(location.search);
const STEP = 1 / 60, MAX_STEPS = 3, ITER = 4;
const DAMP = 0.95, GRAVITY = 9.8;
/** the share of the head's own motion the free cloth is carried along with (as the sleeves': less trailing like a flag) */
const CARRY = 0.7;
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _inv = new THREE.Matrix4();

/** a body part the cloth lies outside of: a vertical capsule on `joint` from `y0` down to `y1` in its space, elliptical
 *  with radii `rx` and `rz` (a sphere: `y0 = y1`) */
export interface HoodBody { joint: THREE.Object3D; y0: number; y1: number; rx: number; rz: number; x?: number; z?: number }

export interface HoodOptions {
  /** the head: the hood's cut is in its space, and its meshes its children */
  joint: THREE.Object3D;
  /** where the cloth at (u, v) is laid on the head before it settles (u across from one side of the face round the back
   *  to the other, v down from the top seam to the hem) */
  shape: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;
  /** the cloth's length between particles `a` and `b` as cut (`draftHood`'s): without it, as laid by `shape` */
  length?: (a: number, b: number) => number;
  /** the rows where the face's two edges are fastened together (m apart), as a clasp at the throat */
  clasp?: { rows: number[]; gap: number };
  /** settled on the body this many steps by its weight alone when first seen (but what's held firmly), that shape its
   *  rest from then on (kept by `key` for every hood built after it) */
  settle?: { steps: number; key: string };
  /** columns across and rows down */
  nu: number; nv: number;
  /** how hard a particle at (u, v) is held to its cut place each step: 1 rides the head, a few thousandths hang free */
  hold: (u: number, v: number) => number;
  outer: THREE.Material;
  lining: THREE.Material;
  /** how far in the lining lies from the outside (m), along its normal turned towards `inside` (in the joint's space:
   *  the head's middle). (Along the normal alone, where the cloth folded over it came out in front, grey patches at the
   *  nape; straight towards the head, on the capelet across the shoulders it ran along the cloth and came through) */
  thick: number;
  inside: THREE.Vector3;
  bodies: HoodBody[];
  /** a piping round its open edge and its hem: down the face's edge on one side from `from` (a share of the rows down,
   *  where the face opens), along the hem, and up the other */
  piping?: { material: THREE.Material; radius: number; from: number };
  /** how many times finer it's drawn than simulated, each way, and its creases there: how far out along its normal the
   *  cloth at (u, v) lies (m; in, below none) */
  detail: number;
  crease?: (u: number, v: number) => number;
}

/** the piping's sides round */
const SIDES = 6;
/** each cut's settled rest (by its key and its grid) */
const SETTLED = new Map<string, Float32Array>();
/** the constraints' passes each step while it settles (it falls from a rough fit: the cloth's four kept it stretched) */
const SETTLE_ITER = 10;
/** what's held at least this firmly is pinned where it was laid while it settles (held less, the constraints' passes
 *  drew it away: the hood slid back off the shoulders) */
const SETTLE_HELD = 0.25;

export class HoodCloth {
  readonly meshes: THREE.Mesh[] = [];
  private readonly n: number;
  private readonly W: number;
  private readonly rest: Float32Array;
  private readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly tgt: Float32Array;
  private readonly lastTgt: Float32Array;
  private readonly local: Float32Array;
  private hold: Float32Array;
  private readonly pairs: number[] = [];
  private readonly stiff: number[] = [];
  /** each constraint's length as cut (the head's space), and as the head's scale makes it now */
  private restLen = new Float32Array(0);
  private len = new Float32Array(0);
  /** each particle's anchor (the lowest particle of its column riding the head) and how far from it it may be: the cloth's
   *  length down to it, and a little (with soft constraints alone it stretched down the back and the chest) */
  private readonly anchor: Int32Array;
  private readonly tether: Float32Array;
  private readonly outer: THREE.BufferGeometry;
  private readonly inner: THREE.BufferGeometry;
  /** the drawn surface's columns and rows (`detail` times the particles'), its points (the head's space), its smooth
   *  normals, the creases laid on them, and the rows interpolated across on the way */
  private readonly FU: number;
  private readonly FV: number;
  private readonly fine: Float32Array;
  private readonly smooth: Float32Array;
  private readonly creases: Float32Array;
  private readonly across: Float32Array;
  /** the piping's path, point by point on the drawn surface, and its tube */
  private readonly path: number[] = [];
  private readonly pipe?: THREE.BufferGeometry;
  private readonly bodyInv: THREE.Matrix4[] = [];
  private acc = 0;
  private needsReset = true;
  private settled = false;
  private readonly last = new THREE.Vector3();

  constructor(private readonly o: HoodOptions) {
    const { nu, nv } = o, W = nu + 1;
    this.W = W; this.n = W * (nv + 1);
    const n = this.n;
    this.rest = new Float32Array(n * 3); this.pos = new Float32Array(n * 3); this.prev = new Float32Array(n * 3);
    this.tgt = new Float32Array(n * 3); this.lastTgt = new Float32Array(n * 3); this.local = new Float32Array(n * 3);
    this.hold = new Float32Array(n);
    for (let r = 0; r <= nv; r++) for (let c = 0; c <= nu; c++) {
      const i = r * W + c;
      o.shape(c / nu, r / nv, _p);
      this.rest.set([_p.x, _p.y, _p.z], i * 3);
      this.hold[i] = o.hold(c / nu, r / nv);
    }
    this.link(nu, nv);
    this.anchor = new Int32Array(this.n).fill(-1);
    this.tether = new Float32Array(this.n);
    for (let c = 0; c <= nu; c++) {
      let top = -1, run = 0;
      for (let r = 0; r <= nv; r++) {
        const i = r * W + c;
        if (this.hold[i] >= 1) { top = i; run = 0; continue; }
        if (top < 0) continue;
        run += this.cutLength(i - W, i);
        this.anchor[i] = top; this.tether[i] = run * 1.03;
      }
    }
    const D = o.detail, FU = nu * D + 1, FV = nv * D + 1;
    this.FU = FU; this.FV = FV;
    this.fine = new Float32Array(FU * FV * 3); this.smooth = new Float32Array(FU * FV * 3);
    this.across = new Float32Array(FU * (nv + 1) * 3);
    this.creases = new Float32Array(FU * FV);
    for (let r = 0; r < FV; r++) for (let c = 0; c < FU; c++) this.creases[r * FU + c] = o.crease?.(c / (FU - 1), r / (FV - 1)) ?? 0;
    this.outer = this.grid(1);
    this.outer.name = 'hood';   // (what the lab's `coat` and `hood` follow)
    this.outer.userData.grid = { across: FU, down: FV };
    this.inner = this.grid(3);
    this.add(this.outer, o.outer, true);
    this.add(this.inner, o.lining, false);
    if (o.piping) {
      // (up one side of the face from the hem, down the other, and back along the hem)
      const r0 = Math.round(o.piping.from * (FV - 1));
      for (let r = FV - 1; r >= r0; r--) this.path.push(r * FU);
      for (let r = r0; r < FV; r++) this.path.push(r * FU + FU - 1);
      for (let c = FU - 2; c >= 0; c--) this.path.push((FV - 1) * FU + c);
      this.pipe = tube(this.path.length);
      this.add(this.pipe, o.piping.material, false);
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
    const P = this.pairs, cut = this.stiff.length;
    for (const r of this.o.clasp?.rows ?? []) join(id(r, 0), id(r, nu), 1);
    this.restLen = new Float32Array(this.stiff.length);
    for (let k = 0; k < this.restLen.length; k++) this.restLen[k] = k < cut ? this.cutLength(P[k * 2], P[k * 2 + 1]) : this.o.clasp!.gap;
    this.len = new Float32Array(this.stiff.length);
  }

  /** the cloth's length between particles `a` and `b` as cut, or as laid */
  private cutLength(a: number, b: number): number {
    if (this.o.length) return this.o.length(a, b);
    const R = this.rest, ia = a * 3, ib = b * 3;
    return Math.hypot(R[ia] - R[ib], R[ia + 1] - R[ib + 1], R[ia + 2] - R[ib + 2]);
  }

  /** the drawn surface's mesh (`uvScale` across, for the lining's finer weave) */
  private grid(uvScale: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), FU = this.FU, FV = this.FV, count = FU * FV, idx: number[] = [], uv = new Float32Array(count * 2);
    for (let r = 0; r < FV; r++) for (let c = 0; c < FU; c++) uv.set([c / (FU - 1) * 4 * uvScale, r / (FV - 1) * 2], (r * FU + c) * 2);
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
    if (CLOTH && this.o.settle && !this.settled) this.settleRest();
    this.place();
    _p.set(e[12], e[13], e[14]);
    const jumped = this.last.distanceToSquared(_p) > 2.25;   // a teleport: settle where it landed
    this.last.copy(_p);
    if (!CLOTH || this.needsReset || jumped || !Number.isFinite(this.pos[0])) {
      this.pos.set(T); this.prev.set(T); this.needsReset = false; this.acc = 0;
      // (settled once on the body before it's first seen: cut on the head, the mantle stood off the shoulders)
      if (CLOTH) for (let s = 0; s < 30; s++) this.step(true);
    } else {
      for (let i = 0; i < n * 3; i++) { const d = (T[i] - this.lastTgt[i]) * CARRY; this.pos[i] += d; this.prev[i] += d; }
      this.acc += Math.min(dt, 0.05);
      let k = 0;
      while (this.acc >= STEP && k++ < MAX_STEPS) { this.acc -= STEP; this.step(false); }
      if (k >= MAX_STEPS) this.acc = 0;
    }
    this.lastTgt.set(T);
    this.write();
  }

  /** the targets (the rest, where the head is now) and the cut's lengths in the head's scale (measured again between the
   *  targets each frame, they were a third of the cost) */
  private place(): void {
    const M = this.o.joint.matrixWorld, e = M.elements, R = this.rest, T = this.tgt;
    for (let i = 0; i < this.n * 3; i += 3) {
      const x = R[i], y = R[i + 1], z = R[i + 2];
      T[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      T[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      T[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const sc = Math.cbrt(Math.abs(M.determinant()));
    for (let k = 0; k < this.len.length; k++) this.len[k] = this.restLen[k] * sc;
  }

  /** settled on the body from where it was laid, by its weight alone (all but its top seam free of the rest), and that
   *  its rest from then on, kept for every hood of this cut after it */
  private settleRest(): void {
    const { settle, nu, nv, joint } = this.o, key = `${settle!.key}:${nu}x${nv}`, kept = SETTLED.get(key);
    this.settled = true;
    if (kept) { this.rest.set(kept); return; }
    this.place();
    this.pos.set(this.tgt); this.prev.set(this.tgt);
    // (what's held firmly kept so, the face's stiffened edge: let fall with the rest, it fell across the face)
    const hold = this.hold;
    this.hold = hold.map((w) => (w >= SETTLE_HELD ? 1 : 0));
    try {
      // (with its momentum, damped: without, it never finished falling, and the capelet stood stiff)
      for (let s = 0; s < settle!.steps; s++) this.step(false, SETTLE_ITER);
    } finally {
      this.hold = hold;
    }
    _inv.copy(joint.matrixWorld).invert();
    for (let i = 0; i < this.n; i++) {
      _p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(_inv);
      this.rest[i * 3] = _p.x; this.rest[i * 3 + 1] = _p.y; this.rest[i * 3 + 2] = _p.z;
    }
    SETTLED.set(key, this.rest.slice());
  }

  private step(settling: boolean, iterations = ITER): void {
    const { pos, prev, tgt, hold } = this, n = this.n, h2 = STEP * STEP;
    for (let i = 0; i < n; i++) {
      const w = hold[i];
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k, x = pos[j], v = settling ? 0 : (x - prev[j]) * DAMP;
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

  /** the free cloth out of the body's capsules (elliptical, in their joints' spaces) */
  private collide(bodies: HoodBody[]): void {
    const pos = this.pos, n = this.n;
    for (let b = 0; b < bodies.length; b++) {
      const B = bodies[b], inv = this.bodyInv[b], M = B.joint.matrixWorld, rm = (B.rx + B.rz) * 0.5, ox = B.x ?? 0, oz = B.z ?? 0;
      for (let i = 0; i < n; i++) {
        if (this.hold[i] >= 1) continue;
        _p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(inv);
        const cy = Math.max(B.y1, Math.min(B.y0, _p.y)), dy = _p.y - cy, lx = _p.x - ox, lz = _p.z - oz;
        const ex = lx / B.rx, ez = lz / B.rz, ey = dy / rm, e = Math.sqrt(ex * ex + ez * ez + ey * ey);
        if (e >= 1 || e < 1e-6) continue;
        const k = 1 / e;
        _p.set(ox + lx * k, cy + dy * k, oz + lz * k).applyMatrix4(M);
        pos[i * 3] = _p.x; pos[i * 3 + 1] = _p.y; pos[i * 3 + 2] = _p.z;
      }
    }
  }

  /** the particles into the meshes, in the head's space: a surface `detail` times finer through them, creased along its
   *  normals; the outside, and the lining `thick` in along them */
  private write(): void {
    _inv.copy(this.o.joint.matrixWorld).invert();
    const L = this.local, n = this.n, W = this.W, nv = this.o.nv, nu = this.o.nu, D = this.o.detail, FU = this.FU, FV = this.FV;
    for (let i = 0; i < n; i++) {
      _p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(_inv);
      L[i * 3] = _p.x; L[i * 3 + 1] = _p.y; L[i * 3 + 2] = _p.z;
    }
    // (across each particle row, then down each column of those: Catmull-Rom, through every particle)
    const A = this.across, F = this.fine;
    for (let r = 0; r <= nv; r++) for (let c = 0; c < FU; c++) {
      const [i0, i1, i2, i3, t] = spline(c, D, nu);
      for (let k = 0; k < 3; k++) {
        A[(r * FU + c) * 3 + k] = catmull(L[(r * W + i0) * 3 + k], L[(r * W + i1) * 3 + k], L[(r * W + i2) * 3 + k], L[(r * W + i3) * 3 + k], t);
      }
    }
    for (let r = 0; r < FV; r++) {
      const [r0, r1, r2, r3, t] = spline(r, D, nv);
      for (let c = 0; c < FU; c++) for (let k = 0; k < 3; k++) {
        F[(r * FU + c) * 3 + k] = catmull(A[(r0 * FU + c) * 3 + k], A[(r1 * FU + c) * 3 + k], A[(r2 * FU + c) * 3 + k], A[(r3 * FU + c) * 3 + k], t);
      }
    }
    // (the creases out along the smooth surface's normals, then the normals again over the creased surface)
    const S = this.smooth;
    normals(F, FU, FV, S);
    for (let i = 0; i < FU * FV; i++) for (let k = 0; k < 3; k++) F[i * 3 + k] += S[i * 3 + k] * this.creases[i];
    normals(F, FU, FV, S);
    const po = this.outer.attributes.position as THREE.BufferAttribute, no = this.outer.attributes.normal as THREE.BufferAttribute;
    const pi = this.inner.attributes.position as THREE.BufferAttribute, ni = this.inner.attributes.normal as THREE.BufferAttribute;
    const t = this.o.thick, C = this.o.inside;
    for (let i = 0; i < FU * FV; i++) {
      const j = i * 3, inward = S[j] * (C.x - F[j]) + S[j + 1] * (C.y - F[j + 1]) + S[j + 2] * (C.z - F[j + 2]), k = inward < 0 ? -t : t;
      po.setXYZ(i, F[j], F[j + 1], F[j + 2]); no.setXYZ(i, S[j], S[j + 1], S[j + 2]);
      pi.setXYZ(i, F[j] + S[j] * k, F[j + 1] + S[j + 1] * k, F[j + 2] + S[j + 2] * k); ni.setXYZ(i, S[j], S[j + 1], S[j + 2]);
    }
    po.needsUpdate = no.needsUpdate = pi.needsUpdate = ni.needsUpdate = true;
    if (this.pipe) this.writePipe();
  }

  /** the piping along its path, round the drawn surface's edge, its sides turned by the surface's normal there */
  private writePipe(): void {
    const g = this.pipe!, pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
    const L = this.fine, N = this.smooth, path = this.path, n = path.length, rad = this.o.piping!.radius;
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

  dispose(): void { this.outer.dispose(); this.inner.dispose(); this.pipe?.dispose(); }
}

/** a tube of `n` points along a path with `SIDES` sides (placeholder positions, filled by `writePipe`) */
function tube(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), idx: number[] = [], W = SIDES + 1;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * W * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * W * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * W * 2), 2));
  for (let k = 0; k + 1 < n; k++) for (let s = 0; s < SIDES; s++) {
    const a = k * W + s, b = a + W;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  g.setIndex(idx);
  return g;
}

/** where drawn point `f` (of a run `D` to a particle) falls among the particles 0 to `last`: the four round it, and how
 *  far between the middle two */
function spline(f: number, D: number, last: number): [number, number, number, number, number] {
  const i = Math.min(last - 1, Math.floor(f / D)), t = f / D - i;
  return [Math.max(0, i - 1), i, i + 1, Math.min(last, i + 2), t];
}

/** Catmull-Rom between `b` and `c` (`a` before, `d` after) at `t` */
function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
}

/** each point's normal of a `cols` by `rows` grid `p` into `out`, by differences over its neighbours: down, then across,
 *  crossed to point out (crossed the other way they pointed in, and every light behind the hood lit it in blotches) */
function normals(p: Float32Array, cols: number, rows: number, out: Float32Array): void {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = (r * cols + Math.min(cols - 1, c + 1)) * 3, b = (r * cols + Math.max(0, c - 1)) * 3;
    const d = (Math.min(rows - 1, r + 1) * cols + c) * 3, u = (Math.max(0, r - 1) * cols + c) * 3;
    _a.set(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
    _b.set(p[d] - p[u], p[d + 1] - p[u + 1], p[d + 2] - p[u + 2]);
    _n.crossVectors(_b, _a).normalize();
    // (written one by one: set from an array made for each point, it fed the garbage collector a few thousand a frame)
    const at = (r * cols + c) * 3;
    out[at] = _n.x; out[at + 1] = _n.y; out[at + 2] = _n.z;
  }
}
