// The arena's wall as it is drawn: the crypt's stone sides, buttresses and gates, the Thornwood's thicket, boulders and
// root arches, and what stands beyond it (the trees' trunks, the crypt's tombs). Bodies walk up to its surfaces
// (`keepIn`: kept to a ring at 26.6 m, the hero stopped 1.2 to 3.2 m short of them), and what flies meets them where
// they're drawn (`cast`): an arrow over the wall flies on into the trees or the ground, where with no height to the
// wall it ended in the air over it (#290). Its parts are kept as the builder made them, each with the sphere round
// it (an instanced mesh's culling moves its instances), sorted by the slices of the ring they cross. What bounds the
// floor is read once, with rays out from the middle at a body's heights: the nearest surface along each slice, a
// line round the ring a body's circle is kept off.
import * as THREE from 'three';
import { TAU } from '../util';
import { faceAt, pastWall } from './edge';
import { WALL_R } from './props';
import { entersHull, hullOf } from './hull';
import type { BiomeId } from '../data/biomes';

/** the ring's slices (a quarter of a degree, 12 cm apart at the wall: at half a degree, the hero stood 8 cm into a
 *  buttress's corner) */
const BINS = 1440;
/** the times over a body is kept off the stretches it comes to, each frame */
const KEEP_PASSES = 4;
/** the heights what bounds the floor is read at (m): a knee, a hip, a head (a banner's hem hangs at 1.5 m) */
const HEIGHTS = [0.4, 1.0, 1.7];
/** where the wall leaves a gap (between the thicket's bushes), how far past its face a body may go (m) */
const PAST_FACE = 0.6;
/** a gate's portal, across its opening (m out from the middle: the gate stands 0.8 m out, its membrane 0.1 m in) */
const GATE_PLANE = WALL_R + 0.7;

/** What a part of the wall is to what moves: a surface both walk up to and fly into, what stands beyond the wall
 *  (flown into: the trees' trunks), or foliage (walked into, flown through: the thicket's leaves). */
export type WallUse = 'wall' | 'beyond' | 'foliage';

/** What a flight met: where, the face's normal there (turned to the flight), the share of the step it went before it
 *  met it, and whether it's stone (an arrow glances off) or not (it goes in). */
export interface WallHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  t: number;
  stone: boolean;
}

export const wallHit = (): WallHit => ({ point: new THREE.Vector3(), normal: new THREE.Vector3(), t: 0, stone: false });

/** A part of the wall: its geometry where it stands, the sphere round it there, what it's made of and what it is;
 *  met by its convex hull's planes (`hull`, in its own frame: `inverse` takes the world there), else its triangles. */
interface Part {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  sphere: THREE.Sphere;
  stone: boolean;
  use: WallUse;
  hull?: Float32Array;
  inverse?: THREE.Matrix4;
  /** the last cast that looked at it (each part once a cast) */
  seen: number;
}

/** A surface a ray met: how far along it, where, its face's normal there (in the world), and the part it's on. */
interface Met {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  part: Part;
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const ray = new THREE.Raycaster();
const hits: THREE.Intersection[] = [];
/** the nearest surface a cast has met so far (`nearest`) */
const met: Met = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), part: null! };
const _from = new THREE.Vector3(), _along = new THREE.Vector3(), _normal = new THREE.Matrix3();

/** the parts a ray enters the spheres of, and how far along it (`nearest`) */
const near: { part: Part; enters: number }[] = [];
/** a mesh each part is cast against as (its geometry and matrix put on it) */
const proxy = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));

const binOf = (angle: number): number => {
  const k = Math.floor((((angle % TAU) + TAU) % TAU) / TAU * BINS);
  return Math.min(BINS - 1, k);
};
const angleOf = (bin: number): number => ((bin + 0.5) / BINS) * TAU;

/** Whether a material draws a surface: opaque (cut out only for foliage, its leaf cards), seen from outside. */
function drawsSurface(material: THREE.Material | THREE.Material[], use: WallUse): boolean {
  const m = Array.isArray(material) ? material[0] : material;
  if (m.transparent || m.side === THREE.BackSide || m.blending !== THREE.NormalBlending) return false;
  return use === 'foliage' || m.alphaTest === 0;
}

/** How far out a gate's portal is along `angle` (m): a plane across its opening. */
const portalAt = (angle: number): number => {
  const gate = Math.round(angle / (TAU / 4)) * (TAU / 4);
  return GATE_PLANE / Math.cos(angle - gate);
};

export class Wall {
  private parts: Part[] = [];
  private bins: Part[][] = Array.from({ length: BINS }, () => []);
  /** each slice's point (x, z) on what bounds the floor, at its middle angle */
  private edge = new Float32Array(BINS * 2);
  /** how far out each slice's point is (m) */
  private reach = new Float32Array(BINS);
  /** the nearest any part comes to the middle (m): a step nearer than that meets nothing */
  private inner = Infinity;
  /** the nearest what bounds the floor comes to the middle (m) */
  private least = Infinity;
  private casts = 0;

  constructor(private readonly biome: BiomeId) {}

  /** `geometry` placed by `matrix` (in the arena's frame) as a part of the wall (met by `hull`'s planes if given). */
  addGeometry(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, stone: boolean, use: WallUse = 'wall',
    hull?: Float32Array): void {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!.clone().applyMatrix4(matrix);
    const inverse = hull && matrix.clone().invert();
    this.parts.push({ geometry, matrix: matrix.clone(), sphere, stone, use, hull, inverse, seen: -1 });
  }

  /**
   * Every mesh drawing a surface in `object` as it stands now, each instance of an instanced one (before it's culled:
   * its culling moves them); `hulled`, each by its convex hull (a rock: round enough), or by the hulls of the pieces
   * it's made of, in its frame (a bush's lumps: one hull round all three spanned the hollows between them, and an
   * arrow stood in the air 0.3 m over the leaves).
   */
  add(object: THREE.Object3D, stone: boolean, use: WallUse = 'wall', hulled: boolean | THREE.BufferGeometry[] = false): void {
    object.updateWorldMatrix(true, true);
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !drawsSurface(mesh.material, use)) return;
      const instanced = mesh as THREE.InstancedMesh;
      const hulls = Array.isArray(hulled) ? hulled.map(hullOf) : hulled ? [hullOf(mesh.geometry)] : undefined;
      const place = (matrix: THREE.Matrix4) => {
        if (!hulls) this.addGeometry(mesh.geometry, matrix, stone, use);
        else for (const hull of hulls) this.addGeometry(hull.geometry, matrix, stone, use, hull.planes);
      };
      if (!instanced.isInstancedMesh) {
        place(mesh.matrixWorld);
        return;
      }
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, _m);
        place(_m.premultiply(mesh.matrixWorld));
      }
    });
  }

  /** Its parts sorted into the slices they cross, and what bounds the floor read: once, after the biome is built. */
  seal(): void {
    for (const part of this.parts) this.sort(part);
    for (let bin = 0; bin < BINS; bin++) {
      const reach = this.reachOut(bin), angle = angleOf(bin);
      this.reach[bin] = reach;
      this.edge[bin * 2] = Math.cos(angle) * reach;
      this.edge[bin * 2 + 1] = Math.sin(angle) * reach;
    }
    this.least = Math.min(...this.reach);
  }

  /** `part` into the slices its sphere crosses. */
  private sort(part: Part): void {
    const { center, radius } = part.sphere;
    const d = Math.hypot(center.x, center.z);
    if (part.use !== 'foliage') this.inner = Math.min(this.inner, d - radius);
    if (d <= radius) {
      for (const bin of this.bins) bin.push(part);
      return;
    }
    const at = Math.atan2(center.z, center.x), span = Math.asin(radius / d);
    const from = binOf(at - span), count = (binOf(at + span) - from + BINS) % BINS;
    for (let k = 0; k <= count; k++) this.bins[(from + k) % BINS].push(part);
  }

  /** How far out from the middle a body may go along a slice: to the nearest surface at a body's heights, no further
   *  than a little past the wall's face, and in a gate's opening to its portal. */
  private reachOut(bin: number): number {
    const angle = angleOf(bin), face = faceAt(this.biome, angle);
    const dir = _d.set(Math.cos(angle), 0, Math.sin(angle));
    const gate = pastWall(this.biome, dir.x * face, dir.z * face, _v).gate;
    let reach = gate ? portalAt(angle) : face + PAST_FACE;
    for (const y of HEIGHTS) {
      ray.set(_c.set(0, y, 0), dir);
      ray.near = 0;
      ray.far = reach;
      if (this.nearest(this.bins[bin], (part) => part.use !== 'beyond')) reach = met.distance;
    }
    return reach;
  }

  /** Whether `ray` meets a surface among those of `parts` that `counts`, the nearest into `met`: the parts taken in
   *  the order the ray enters their spheres, until the next is entered further on than a surface met. */
  private nearest(parts: Part[], counts: (part: Part) => boolean): boolean {
    const stamp = ++this.casts;
    near.length = 0;
    for (const part of parts) {
      if (part.seen === stamp || !counts(part)) continue;
      part.seen = stamp;
      const enters = this.entersAt(part);
      if (enters >= 0) near.push({ part, enters });
    }
    near.sort((a, b) => a.enters - b.enters);
    met.distance = Infinity;
    for (const { part, enters } of near) {
      if (enters > met.distance) break;
      if (part.hull) this.meetHull(part);
      else this.meetTriangles(part);
    }
    return met.distance < Infinity;
  }

  /** `ray` met against `part`'s hull, into `met` if it's the nearest yet. */
  private meetHull(part: Part): void {
    _from.copy(ray.ray.origin).applyMatrix4(part.inverse!);
    _along.copy(ray.ray.origin).addScaledVector(ray.ray.direction, ray.far).applyMatrix4(part.inverse!).sub(_from);
    const share = entersHull(part.hull!, _from, _along, _v);
    if (share < 0 || share * ray.far >= met.distance) return;
    met.distance = share * ray.far;
    met.point.copy(ray.ray.origin).addScaledVector(ray.ray.direction, met.distance);
    if (_v.lengthSq() > 0) met.normal.copy(_v).applyMatrix3(_normal.getNormalMatrix(part.matrix)).normalize();
    else met.normal.copy(ray.ray.direction).negate();
    met.part = part;
  }

  /** `ray` met against `part`'s triangles, into `met` if it's the nearest yet. */
  private meetTriangles(part: Part): void {
    proxy.geometry = part.geometry;
    proxy.matrixWorld.copy(part.matrix);
    hits.length = 0;
    proxy.raycast(ray, hits);
    for (const at of hits) {
      if (at.distance >= met.distance) continue;
      met.distance = at.distance;
      met.point.copy(at.point);
      if (at.face) met.normal.copy(at.face.normal).transformDirection(part.matrix);
      else met.normal.copy(ray.ray.direction).negate();
      met.part = part;
    }
  }

  /** How far along the ray it enters `part`'s sphere (0 from inside it), or -1 if it doesn't within its reach. */
  private entersAt(part: Part): number {
    const { center, radius } = part.sphere;
    const off2 = ray.ray.distanceSqToPoint(center);
    if (off2 > radius * radius) return -1;
    const along = _c.subVectors(center, ray.ray.origin).dot(ray.ray.direction);
    const enters = Math.max(0, along - Math.sqrt(radius * radius - off2));
    return enters <= ray.far ? enters : -1;
  }

  /** How far out from the middle what bounds the floor is towards (x, z) (m), between the slices' points. */
  reachAt(x: number, z: number): number {
    const k = (((Math.atan2(z, x) % TAU) + TAU) % TAU) / TAU * BINS - 0.5;
    const i = Math.floor(k), f = k - i;
    return this.reach[(i + BINS) % BINS] * (1 - f) + this.reach[(i + 1) % BINS] * f;
  }

  /** The furthest what bounds the floor reaches (m): the floor a grid over it must cover. */
  get most(): number {
    return Math.max(...this.reach);
  }

  /** A body of `radius` at `pos` kept inside what bounds the floor and off it by its radius: off each stretch of the
   *  line between the slices' points its circle comes to (a buttress's side, a bush's flank), pushed back in. */
  keepIn(pos: { x: number; z: number }, radius: number): void {
    const r = Math.hypot(pos.x, pos.z);
    if (r + radius < this.least || r < 1e-6) return;
    // (a body past the line, out through a gap a step jumped: back onto it first)
    const reach = this.reachAt(pos.x, pos.z);
    if (r > reach) {
      pos.x *= reach / r;
      pos.z *= reach / r;
    }
    const span = Math.ceil((Math.asin(Math.min(1, radius / Math.max(r, radius))) / TAU) * BINS) + 1;
    const middle = binOf(Math.atan2(pos.z, pos.x));
    // (a few times over: in a notch, kept off one side onto the other once a frame, he crept into it for seconds)
    for (let pass = 0; pass < KEEP_PASSES; pass++) {
      for (let k = -span; k < span; k++) this.offStretch(pos, radius, (middle + k + BINS) % BINS);
    }
  }

  /** A body kept off the stretch of the line from slice `bin`'s point to the next's. */
  private offStretch(pos: { x: number; z: number }, radius: number, bin: number): void {
    const next = (bin + 1) % BINS;
    const ax = this.edge[bin * 2], az = this.edge[bin * 2 + 1];
    const dx = this.edge[next * 2] - ax, dz = this.edge[next * 2 + 1] - az;
    const length2 = dx * dx + dz * dz || 1e-9;
    const along = Math.min(1, Math.max(0, ((pos.x - ax) * dx + (pos.z - az) * dz) / length2));
    const cx = ax + dx * along, cz = az + dz * along;
    // (the stretch's normal into the arena: the slices run anticlockwise, so it's to their left)
    const length = Math.sqrt(length2), nx = -dz / length, nz = dx / length;
    const inside = (pos.x - cx) * nx + (pos.z - cz) * nz;
    const ox = pos.x - cx, oz = pos.z - cz, off = Math.hypot(ox, oz);
    if (inside > 0 && off >= radius) return;
    // (round a corner, straight away from it; through a stretch, back along its normal)
    const away = inside > 0 && off > 1e-6;
    pos.x = cx + (away ? ox / off : nx) * radius;
    pos.z = cz + (away ? oz / off : nz) * radius;
  }

  /** The first surface of the wall or beyond it the step from `a` to `b` meets, into `hit`; false if none. */
  cast(a: THREE.Vector3, b: THREE.Vector3, hit: WallHit): boolean {
    if (Math.max(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z)) < this.inner) return false;
    const length = _d.subVectors(b, a).length();
    if (length < 1e-6) return false;
    ray.set(a, _d.divideScalar(length));
    ray.near = 0;
    ray.far = length;
    if (!this.nearest(this.partsAlong(a, b), (part) => part.use !== 'foliage')) return false;
    hit.point.copy(met.point);
    hit.t = met.distance / length;
    hit.stone = met.part.stone;
    hit.normal.copy(met.normal);
    if (hit.normal.dot(_d) > 0) hit.normal.negate();
    return true;
  }

  /** The parts in the slices the step from `a` to `b` crosses (all of them for a step across the middle). */
  private partsAlong(a: THREE.Vector3, b: THREE.Vector3): Part[] {
    const from = Math.atan2(a.z, a.x), to = Math.atan2(b.z, b.x);
    const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    if (Math.abs(turn) > 0.5) return this.parts;
    const first = binOf(turn > 0 ? from : to), count = Math.ceil((Math.abs(turn) / TAU) * BINS) + 1;
    const parts: Part[] = [];
    for (let k = 0; k <= count; k++) parts.push(...this.bins[(first + k) % BINS]);
    return parts;
  }
}
