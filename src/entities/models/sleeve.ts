// A hanging sleeve as cloth: a tube of particles whose top ring rides its joint. The rest of it is pulled
// towards where the animation would hold it, so it keeps its flared shape, but has weight and inertia: it
// lags a swinging arm, sags below a raised forearm, swings on and settles. Position-based dynamics on the
// main thread (a few hundred particles per sleeve, about a tenth of a millisecond a frame), collided with
// the forearm so it never sinks into the arm it hangs from. The cape's solver is a rectangular sheet pinned
// along two anchors, so it can't be this tube; this is the same idea (verlet, distance constraints, capsule
// colliders) at the size of a sleeve.
import * as THREE from 'three';

/** `?cloth=0` holds every sleeve at its animated shape (the old rigid bell), for A/B comparison */
const CLOTH = typeof location === 'undefined' || !/[?&]cloth=0/.test(location.search);
const NC = 28, NR = 7, N = NC * NR;
const STEP = 1 / 60, MAX_STEPS = 3, ITER = 3;
/** how hard each row is pulled to its animated place (per step: barely, or the cloth turns to rubber; it hangs by gravity from its top ring and only keeps its
 *  cut through its constraints), and how far it may stray from it, in the joint's metres */
const HOLD = [1, 0.02, 0.01, 0.006, 0.004, 0.003, 0.002];
const STRAY = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
/** how far up the forearm each row may slide from where the animation holds it (world m at scale 1) */
const SLIP = [0, 0.015, 0.03, 0.04, 0.05, 0.055, 0.06];
const DAMP = 0.94, GRAVITY = 9.8;
/** the share of the animation's own motion (the body running, the arm swinging) the free cloth is carried along with, so it trails less like a flag: a shift of
 *  position and previous position together, so it adds no speed and no spring */
const CARRY = 0.6;
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

export interface BellOptions {
  /** the sleeve's joint: its top ring is pinned to it (the sleeve's meshes become its children) */
  joint: THREE.Object3D;
  /** the forearm's ends, which the cloth stays outside: the joint's own origin to `hand` */
  hand: THREE.Object3D;
  /** the sleeve at rest in the joint's space: a tube of NR rings of NC + 1 vertices (the seam repeated), top first */
  shape: THREE.BufferGeometry;
  outer: THREE.Material;
  lining: THREE.Material;
  rim: THREE.Material;
  /** radius the cloth keeps from the forearm's axis */
  armRadius: number;
  /** the body the cloth must not sink into: vertical capsules on a joint (from `y0` to `y1` in its space), elliptical with radii `rx`, `rz` */
  bodies?: { joint: THREE.Object3D; y0: number; y1: number; rx: number; rz: number }[];
  /** skirts the cloth hangs outside of, as they lie (draped over the legs, after their update): `mesh` the skirt's, `gap` how far out */
  skirts?: { mesh: THREE.Object3D; skirt: { pushOut(p: THREE.Vector3, gap: number): boolean }; gap: number }[];
  rimRadius: number;
}

export class BellCloth {
  readonly meshes: THREE.Mesh[] = [];
  private readonly pos = new Float32Array(N * 3);
  private readonly prev = new Float32Array(N * 3);
  private readonly tgt = new Float32Array(N * 3);
  private readonly lastTgt = new Float32Array(N * 3);
  private readonly rest: Float32Array;
  private readonly outer: THREE.BufferGeometry;
  private readonly inner: THREE.BufferGeometry;
  private readonly rim: THREE.BufferGeometry;
  private readonly pairs: [number, number][] = [];
  private readonly len: Float32Array;
  /** how far each particle may be from its column's top ring: the cloth's length down to it, which fast running would otherwise stretch */
  private readonly tether = new Float32Array(N);
  /** how far each particle may be from the forearm's axis: the radius it was cut to, so the sleeve stays a tube round the arm and never lets it out */
  private readonly envelope = new Float32Array(N);
  private readonly bodyInv: THREE.Matrix4[] = [];
  private readonly stiff: Float32Array;
  private readonly local = new Float32Array(N * 3);
  private readonly flip: number;
  private acc = 0;
  private needsReset = true;
  private readonly last = new THREE.Vector3();

  constructor(private readonly o: BellOptions) {
    const src = o.shape.attributes.position;
    this.rest = new Float32Array(N * 3);
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      const i = r * NC + c, s = r * (NC + 1) + c;
      this.rest[i * 3] = src.getX(s); this.rest[i * 3 + 1] = src.getY(s); this.rest[i * 3 + 2] = src.getZ(s);
    }
    const id = (r: number, c: number): number => r * NC + ((c + NC) % NC);
    const w: number[] = [], link = (x: number, y: number, k: number): void => { this.pairs.push([x, y]); w.push(k); };
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      link(id(r, c), id(r, c + 1), 1);                                        // round the ring
      if (r + 1 < NR) {
        link(id(r, c), id(r + 1, c), 1);                                      // down
        link(id(r, c), id(r + 1, c + 1), 0.6); link(id(r, c + 1), id(r + 1, c), 0.6);   // shear
      }
      if (r + 2 < NR) link(id(r, c), id(r + 2, c), 0.25);                     // bend: soft, or the tube stands out like a pipe
    }
    // hoops: each ring keeps its round section (across and quarter-way round), gently, so the bell hangs open rather than flat
    for (let r = 1; r < NR; r++) for (let c = 0; c < NC / 2; c++) { link(id(r, c), id(r, c + NC / 2), 0.15); link(id(r, c), id(r, c + NC / 4), 0.15); }
    this.stiff = Float32Array.from(w);
    this.len = new Float32Array(this.pairs.length);
    this.outer = o.shape.clone();
    this.inner = o.shape.clone();
    const uv = this.inner.attributes.uv;   // (the lining's texture was always sampled at three times the outside's)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i));
    for (const g of [this.outer, this.inner]) (g.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.rim = rimGeometry(NC * 2, 6);
    // which way the grid's cross product points, so the normals face out as the sleeve's own did
    this.flip = 1;
    this.flip = this.normalAt(this.rest, 3, 0, 1) .dot(_p.set(this.rest[(3 * NC) * 3], 0, this.rest[(3 * NC) * 3 + 2])) >= 0 ? 1 : -1;
    const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow: boolean): void => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      mesh.frustumCulled = false;   // it moves off its bind bounds
      o.joint.add(mesh);
      this.meshes.push(mesh);
    };
    add(this.outer, o.outer, true);
    add(this.inner, o.lining, false);
    add(this.rim, o.rim, false);
  }

  /** the surface normal at a particle of `p` (ring c of row r), by differences over its neighbours, pointing out */
  private normalAt(p: Float32Array, r: number, c: number, sign = this.flip): THREE.Vector3 {
    const r0 = Math.max(0, r - 1), r1 = Math.min(NR - 1, r + 1), c0 = (c + NC - 1) % NC, c1 = (c + 1) % NC;
    _a.set(p[(r * NC + c1) * 3] - p[(r * NC + c0) * 3], p[(r * NC + c1) * 3 + 1] - p[(r * NC + c0) * 3 + 1], p[(r * NC + c1) * 3 + 2] - p[(r * NC + c0) * 3 + 2]);
    _b.set(p[(r1 * NC + c) * 3] - p[(r0 * NC + c) * 3], p[(r1 * NC + c) * 3 + 1] - p[(r0 * NC + c) * 3 + 1], p[(r1 * NC + c) * 3 + 2] - p[(r0 * NC + c) * 3 + 2]);
    return _n.crossVectors(_b, _a).normalize().multiplyScalar(sign);
  }

  reset(): void { this.needsReset = true; }

  /** Step the cloth (after the skeleton is posed, its world matrices current) and write it into the meshes. */
  update(dt: number): void {
    const { joint, hand } = this.o;
    joint.updateWorldMatrix(true, false);
    hand.updateWorldMatrix(true, false);
    const M = joint.matrixWorld, e = M.elements;
    const sc = Math.cbrt(Math.abs(M.determinant()));
    // where the animation holds every particle, and how far apart neighbours are there
    for (let i = 0; i < N; i++) {
      _p.set(this.rest[i * 3], this.rest[i * 3 + 1], this.rest[i * 3 + 2]).applyMatrix4(M);
      this.tgt[i * 3] = _p.x; this.tgt[i * 3 + 1] = _p.y; this.tgt[i * 3 + 2] = _p.z;
    }
    for (let k = 0; k < this.pairs.length; k++) {
      const [a, b] = this.pairs[k];
      const dx = this.tgt[a * 3] - this.tgt[b * 3], dy = this.tgt[a * 3 + 1] - this.tgt[b * 3 + 1], dz = this.tgt[a * 3 + 2] - this.tgt[b * 3 + 2];
      this.len[k] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    for (let c = 0; c < NC; c++) {
      let run = 0;
      for (let r = 1; r < NR; r++) {
        const a = ((r - 1) * NC + c) * 3, b = (r * NC + c) * 3, dx = this.tgt[a] - this.tgt[b], dy = this.tgt[a + 1] - this.tgt[b + 1], dz = this.tgt[a + 2] - this.tgt[b + 2];
        run += Math.sqrt(dx * dx + dy * dy + dz * dz);
        this.tether[r * NC + c] = run * 1.04;
      }
    }
    _p.set(e[12], e[13], e[14]);
    const jumped = this.last.distanceToSquared(_p) > 2.25;   // a teleport: settle where it landed
    this.last.copy(_p);
    if (!CLOTH || this.needsReset || jumped || !Number.isFinite(this.pos[0])) {
      this.pos.set(this.tgt); this.prev.set(this.tgt); this.needsReset = false; this.acc = 0;
    } else {
      for (let i = NC * 3; i < N * 3; i++) { const d = (this.tgt[i] - this.lastTgt[i]) * CARRY; this.pos[i] += d; this.prev[i] += d; }
      this.acc += Math.min(dt, 0.05);
      let n = 0;
      while (this.acc >= STEP && n++ < MAX_STEPS) { this.acc -= STEP; this.step(sc); }
      if (n >= MAX_STEPS) this.acc = 0;
    }
    this.lastTgt.set(this.tgt);
    this.write();
  }

  private step(sc: number): void {
    const { pos, prev, tgt } = this, h2 = STEP * STEP;
    for (let r = 1; r < NR; r++) for (let c = 0; c < NC; c++) {
      const i = (r * NC + c) * 3;
      for (let k = 0; k < 3; k++) {
        const x = pos[i + k], v = (x - prev[i + k]) * DAMP;
        prev[i + k] = x;
        pos[i + k] = x + v + (k === 1 ? -GRAVITY * h2 : 0) + (tgt[i + k] - x) * HOLD[r];
      }
    }
    for (let i = 0; i < NC * 3; i++) { pos[i] = tgt[i]; prev[i] = tgt[i]; }   // the top ring rides the joint
    // the forearm: from the joint's origin to a little past the hand
    const jw = this.o.joint.matrixWorld.elements;
    _a.set(jw[12], jw[13], jw[14]);
    this.o.hand.getWorldPosition(_b);
    _q.copy(_b).sub(_a);
    _q.normalize();
    _b.addScaledVector(_q, 0.05 * sc);
    _q.copy(_b).sub(_a);
    const cl2 = _q.lengthSq(), rad = this.o.armRadius * sc;
    for (let i = NC; i < N; i++) {
      const k = i * 3, ux = tgt[k] - _a.x, uy = tgt[k + 1] - _a.y, uz = tgt[k + 2] - _a.z, t = (ux * _q.x + uy * _q.y + uz * _q.z) / (cl2 || 1);
      const px = ux - _q.x * t, py = uy - _q.y * t, pz = uz - _q.z * t;
      this.envelope[i] = Math.sqrt(px * px + py * py + pz * pz) * 1.06 + 0.006 * sc;
    }
    const bodies = this.o.bodies ?? [];
    for (let b = 0; b < bodies.length; b++) (this.bodyInv[b] ??= new THREE.Matrix4()).copy(bodies[b].joint.matrixWorld).invert();
    for (let it = 0; it < ITER; it++) {
      for (let k = 0; k < this.pairs.length; k++) {
        const [a, b] = this.pairs[k], ia = a * 3, ib = b * 3;
        const wa = a < NC ? 0 : 1, wb = b < NC ? 0 : 1, w = wa + wb;
        if (!w) continue;
        const dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = (d - this.len[k]) / d / w * this.stiff[k];
        pos[ia] += dx * f * wa; pos[ia + 1] += dy * f * wa; pos[ia + 2] += dz * f * wa;
        pos[ib] -= dx * f * wb; pos[ib + 1] -= dy * f * wb; pos[ib + 2] -= dz * f * wb;
      }
      for (let r = 1; r < NR; r++) for (let c = 0; c < NC; c++) {
        const i = (r * NC + c) * 3;
        // never further from the top ring than the cloth is long
        const dx0 = pos[i] - tgt[c * 3], dy0 = pos[i + 1] - tgt[c * 3 + 1], dz0 = pos[i + 2] - tgt[c * 3 + 2], d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0), tl = this.tether[r * NC + c];
        if (d0 > tl) { const k = tl / d0; pos[i] = tgt[c * 3] + dx0 * k; pos[i + 1] = tgt[c * 3 + 1] + dy0 * k; pos[i + 2] = tgt[c * 3 + 2] + dz0 * k; }
        // out of the forearm
        _p.set(pos[i], pos[i + 1], pos[i + 2]);
        const t = Math.max(0, Math.min(1, ((_p.x - _a.x) * _q.x + (_p.y - _a.y) * _q.y + (_p.z - _a.z) * _q.z) / (cl2 || 1)));
        _n.copy(_a).addScaledVector(_q, t);
        const dx = _p.x - _n.x, dy = _p.y - _n.y, dz = _p.z - _n.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < rad && d > 1e-6) { const s = rad / d; pos[i] = _n.x + dx * s; pos[i + 1] = _n.y + dy * s; pos[i + 2] = _n.z + dz * s; }
        // and not out of the tube it was cut to round the arm (gravity may pull it onto the arm, not off it)
        {
          const ux = pos[i] - _a.x, uy = pos[i + 1] - _a.y, uz = pos[i + 2] - _a.z, t2 = (ux * _q.x + uy * _q.y + uz * _q.z) / (cl2 || 1);
          const px = ux - _q.x * t2, py = uy - _q.y * t2, pz = uz - _q.z * t2, pd = Math.sqrt(px * px + py * py + pz * pz), mx = this.envelope[r * NC + c];
          if (pd > mx) { const k = mx / pd; pos[i] = _a.x + _q.x * t2 + px * k; pos[i + 1] = _a.y + _q.y * t2 + py * k; pos[i + 2] = _a.z + _q.z * t2 + pz * k; }
        }
        // and never far from its place, whatever the arm did
        const ex = pos[i] - tgt[i], ey = pos[i + 1] - tgt[i + 1], ez = pos[i + 2] - tgt[i + 2], ed = Math.sqrt(ex * ex + ey * ey + ez * ez), lim = STRAY[r] * sc;
        let cx = ex, cy = ey, cz = ez;
        if (ed > lim) { const s = lim / ed; cx *= s; cy *= s; cz *= s; pos[i] = tgt[i] + cx; pos[i + 1] = tgt[i + 1] + cy; pos[i + 2] = tgt[i + 2] + cz; }
        // and it rides up the forearm by no more than a hand's breadth (a turn or a lean swings the arm faster than the cloth follows, which would bare the hand)
        {
          const il = 1 / Math.sqrt(cl2 || 1), up = (cx * _q.x + cy * _q.y + cz * _q.z) * il, slip = SLIP[r] * sc;
          if (up < -slip) { const k = (-slip - up) * il; pos[i] += _q.x * k; pos[i + 1] += _q.y * k; pos[i + 2] += _q.z * k; }
        }
      }
      if (it === ITER - 1) { this.collideBody(bodies); this.collideSkirts(); }
    }
  }

  /** push the free cloth out of the body's capsules (elliptical, in their joints' spaces) */
  private collideBody(bodies: NonNullable<BellOptions['bodies']>): void {
    const pos = this.pos;
    for (let b = 0; b < bodies.length; b++) {
      const B = bodies[b], inv = this.bodyInv[b], M = B.joint.matrixWorld, rm = (B.rx + B.rz) * 0.5;
      for (let i = NC; i < N; i++) {
        _p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(inv);
        const cy = Math.max(B.y1, Math.min(B.y0, _p.y)), dy = _p.y - cy;
        // (y0 above y1) inside the capsule's height it is the ellipse alone; past its ends a rounded cap
        const ex = _p.x / B.rx, ez = _p.z / B.rz, ey = dy / rm, e = Math.sqrt(ex * ex + ez * ez + ey * ey);
        if (e >= 1 || e < 1e-6) continue;
        const k = 1 / e;
        _p.set(_p.x * k, cy + dy * k, _p.z * k).applyMatrix4(M);
        pos[i * 3] = _p.x; pos[i * 3 + 1] = _p.y; pos[i * 3 + 2] = _p.z;
      }
    }
  }

  /** and out of the skirts beside it */
  private collideSkirts(): void {
    const pos = this.pos;
    for (const { mesh, skirt, gap } of this.o.skirts ?? []) {
      if (!mesh.visible) continue;
      _inv.copy(mesh.matrixWorld).invert();
      for (let i = NC; i < N; i++) {
        _p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(_inv);
        if (!skirt.pushOut(_p, gap)) continue;
        _p.applyMatrix4(mesh.matrixWorld);
        pos[i * 3] = _p.x; pos[i * 3 + 1] = _p.y; pos[i * 3 + 2] = _p.z;
      }
    }
  }

  /** the middle of the hem as it hangs (world) */
  hem(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    for (let c = 0, i = (NR - 1) * NC * 3; c < NC; c++, i += 3) out.set(out.x + this.pos[i], out.y + this.pos[i + 1], out.z + this.pos[i + 2]);
    return out.multiplyScalar(1 / NC);
  }

  /** the particles into the meshes, in the joint's space */
  private write(): void {
    _inv.copy(this.o.joint.matrixWorld).invert();
    const local = this.local;
    for (let i = 0; i < N; i++) {
      _p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(_inv);
      local[i * 3] = _p.x; local[i * 3 + 1] = _p.y; local[i * 3 + 2] = _p.z;
    }
    const po = this.outer.attributes.position as THREE.BufferAttribute, no = this.outer.attributes.normal as THREE.BufferAttribute;
    const pi = this.inner.attributes.position as THREE.BufferAttribute, ni = this.inner.attributes.normal as THREE.BufferAttribute;
    for (let r = 0; r < NR; r++) {
      // the ring's centre, for the lining's slightly narrower ring
      let cx = 0, cy = 0, cz = 0;
      for (let c = 0; c < NC; c++) { cx += local[(r * NC + c) * 3]; cy += local[(r * NC + c) * 3 + 1]; cz += local[(r * NC + c) * 3 + 2]; }
      cx /= NC; cy /= NC; cz /= NC;
      for (let c = 0; c <= NC; c++) {
        const cc = c % NC, i = (r * NC + cc) * 3, v = r * (NC + 1) + c;
        const nn = this.normalAt(local, r, cc);
        po.setXYZ(v, local[i], local[i + 1], local[i + 2]); no.setXYZ(v, nn.x, nn.y, nn.z);
        pi.setXYZ(v, cx + (local[i] - cx) * 0.97, cy + (local[i + 1] - cy) * 0.97, cz + (local[i + 2] - cz) * 0.97); ni.setXYZ(v, nn.x, nn.y, nn.z);
      }
    }
    po.needsUpdate = no.needsUpdate = pi.needsUpdate = ni.needsUpdate = true;
    writeRim(this.rim, local, (NR - 1) * NC, NC, this.o.rimRadius);
  }

  dispose(): void { this.outer.dispose(); this.inner.dispose(); this.rim.dispose(); }
}

/** a tube of `n` points round a closed ring with `radial` sides (a placeholder, filled by `writeRim`) */
function rimGeometry(n: number, radial: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), idx: number[] = [];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * (radial + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * (radial + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * (radial + 1) * 2), 2));
  for (let i = 0; i < n; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = ((i + 1) % n) * (radial + 1) + k;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  g.setIndex(idx);
  return g;
}

const RIM_COS = Array.from({ length: 7 }, (_, k) => Math.cos((k / 6) * Math.PI * 2)), RIM_SIN = Array.from({ length: 7 }, (_, k) => Math.sin((k / 6) * Math.PI * 2));
const _c = new THREE.Vector3(), _t = new THREE.Vector3(), _o = new THREE.Vector3(), _bi = new THREE.Vector3();
/** the hem's gold tube along the sleeve's last ring (`from`: its first particle in `p`, `count` of them) */
function writeRim(g: THREE.BufferGeometry, p: Float32Array, from: number, count: number, radius: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, n = count * 2, radial = 6;
  const at = (i: number, out: THREE.Vector3): THREE.Vector3 => {
    const a = Math.floor(i / 2) % count, b = (a + 1) % count, f = (i % 2) * 0.5;
    return out.set(
      p[(from + a) * 3] * (1 - f) + p[(from + b) * 3] * f, p[(from + a) * 3 + 1] * (1 - f) + p[(from + b) * 3 + 1] * f, p[(from + a) * 3 + 2] * (1 - f) + p[(from + b) * 3 + 2] * f);
  };
  _c.set(0, 0, 0);
  for (let c = 0; c < count; c++) _c.add(_p.set(p[(from + c) * 3], p[(from + c) * 3 + 1], p[(from + c) * 3 + 2]));
  _c.multiplyScalar(1 / count);
  for (let i = 0; i < n; i++) {
    at(i, _q);
    at((i + 1) % n, _t).sub(at((i + n - 1) % n, _o)).normalize();
    _o.copy(_q).sub(_c).normalize();
    _bi.crossVectors(_t, _o).normalize();
    for (let k = 0; k <= radial; k++) {
      const cs = RIM_COS[k], sn = RIM_SIN[k], nx = _o.x * cs + _bi.x * sn, ny = _o.y * cs + _bi.y * sn, nz = _o.z * cs + _bi.z * sn;
      const v = i * (radial + 1) + k;
      pos.setXYZ(v, _q.x + nx * radius, _q.y + ny * radius, _q.z + nz * radius); nor.setXYZ(v, nx, ny, nz);
    }
  }
  pos.needsUpdate = nor.needsUpdate = true;
}
