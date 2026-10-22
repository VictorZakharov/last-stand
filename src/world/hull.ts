// A shape's convex hull as the planes of its faces, which a ray is met against fast (world/wall.ts): the Thornwood's
// bushes, their leaves and its rocks, a few hundred instances of three geometries of thousands of triangles each.
// Cast against every triangle by three's raycaster, the forest's wall took 0.7 s at boot; against each instance's
// hull by three, 0.2 s, most of it the raycaster's own cost a call.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

/** A hull: its faces' planes, (nx, ny, nz, d) each, its inside where n·p + d ≤ 0; and its geometry (for its sphere). */
export interface Hull {
  planes: Float32Array;
  geometry: THREE.BufferGeometry;
}

/** faces this alike (their normals and offsets) are one plane */
const SAME_PLANE = 1e-4;

const hulls = new WeakMap<THREE.BufferGeometry, Hull>();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** `geometry`'s convex hull, made once a geometry. */
export function hullOf(geometry: THREE.BufferGeometry): Hull {
  const made = hulls.get(geometry);
  if (made) return made;
  const position = geometry.attributes.position;
  const points = Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i));
  const shape = new ConvexGeometry(points);
  shape.computeBoundingSphere();
  const hull = { planes: planesOf(shape), geometry: shape };
  hulls.set(geometry, hull);
  return hull;
}

/** The planes of a convex geometry's faces (its triangles, unindexed and wound outward), each once. */
function planesOf(shape: THREE.BufferGeometry): Float32Array {
  const position = shape.attributes.position;
  const planes: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    _a.fromBufferAttribute(position, i);
    _b.fromBufferAttribute(position, i + 1).sub(_a);
    _c.fromBufferAttribute(position, i + 2).sub(_a);
    const normal = _b.cross(_c);
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    const d = -normal.dot(_a);
    if (!hasPlane(planes, normal, d)) planes.push(normal.x, normal.y, normal.z, d);
  }
  return new Float32Array(planes);
}

const hasPlane = (planes: number[], n: THREE.Vector3, d: number): boolean => {
  for (let i = 0; i < planes.length; i += 4) {
    const alike = Math.abs(planes[i] - n.x) + Math.abs(planes[i + 1] - n.y) + Math.abs(planes[i + 2] - n.z);
    if (alike < SAME_PLANE && Math.abs(planes[i + 3] - d) < SAME_PLANE) return true;
  }
  return false;
};

/**
 * Where the line from `from` along `along` (in the hull's frame: a step's start and its whole length) enters the hull,
 * as a share of `along` from 0 to 1, the face it enters through into `normal` (zero if it starts inside); -1 if it
 * doesn't.
 */
export function entersHull(planes: Float32Array, from: THREE.Vector3, along: THREE.Vector3,
  normal: THREE.Vector3): number {
  let enters = 0, leaves = 1, face = -1;
  for (let i = 0; i < planes.length; i += 4) {
    const nx = planes[i], ny = planes[i + 1], nz = planes[i + 2];
    const off = nx * from.x + ny * from.y + nz * from.z + planes[i + 3];
    const toward = nx * along.x + ny * along.y + nz * along.z;
    if (Math.abs(toward) < 1e-12) {
      if (off > 0) return -1;
      continue;
    }
    const t = -off / toward;
    if (toward < 0) {
      if (t > enters) {
        enters = t;
        face = i;
      }
    } else if (t < leaves) leaves = t;
    if (enters > leaves) return -1;
  }
  if (face < 0) normal.set(0, 0, 0);
  else normal.set(planes[face], planes[face + 1], planes[face + 2]);
  return enters;
}
