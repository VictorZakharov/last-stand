// A geometry's normals made from its faces (three's `computeVertexNormals`), and made unit length
// (`normalizeNormals`): smooth where faces share a vertex through the index, flat where they don't.
import { Vec3 } from '../math/index.ts';
import { Attribute } from './attribute.ts';
import type { Geometry } from './geometry.ts';

const _a = new Vec3();
const _b = new Vec3();
const _c = new Vec3();
const _cb = new Vec3();
const _ab = new Vec3();
const _n = new Vec3();

/** The face (a, b, c)'s normal, scaled by twice its area, into `_cb`. */
function faceNormal(position: Attribute, a: number, b: number, c: number): Vec3 {
  _a.set(position.getX(a), position.getY(a), position.getZ(a));
  _b.set(position.getX(b), position.getY(b), position.getZ(b));
  _c.set(position.getX(c), position.getY(c), position.getZ(c));
  _cb.subVectors(_c, _b);
  _ab.subVectors(_a, _b);
  return _cb.cross(_ab);
}

/**
 * Adds `n` to the normals of vertices a, b and c, all three read before any is written (as three does: a face with
 * a vertex twice adds to it once).
 */
function addToFace(normal: Attribute, a: number, b: number, c: number, n: Vec3): void {
  const ax = normal.getX(a) + n.x, ay = normal.getY(a) + n.y, az = normal.getZ(a) + n.z;
  const bx = normal.getX(b) + n.x, by = normal.getY(b) + n.y, bz = normal.getZ(b) + n.z;
  const cx = normal.getX(c) + n.x, cy = normal.getY(c) + n.y, cz = normal.getZ(c) + n.z;
  normal.setXYZ(a, ax, ay, az);
  normal.setXYZ(b, bx, by, bz);
  normal.setXYZ(c, cx, cy, cz);
}

/** A normal attribute as long as `position`, zeroed: the geometry's own when it fits, else a new one. */
function zeroedNormals(geometry: Geometry, position: Attribute): Attribute {
  const old = geometry.getAttribute('normal');
  if (old && old.count === position.count) {
    for (let i = 0; i < old.count; i++) old.setXYZ(i, 0, 0, 0);
    return old;
  }
  const normal = new Attribute(new Float32Array(position.count * 3), 3);
  geometry.setAttribute('normal', normal);
  return normal;
}

/**
 * Each vertex's normal the sum of its faces' (each weighted by its area), made unit length; unindexed, each face's
 * own. Follows three's `BufferGeometry.computeVertexNormals` (three.js, MIT, 0.187.0) to the vertex.
 */
export function normals(geometry: Geometry): void {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const normal = zeroedNormals(geometry, position);
  const index = geometry.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const n = faceNormal(position, a, b, c);
      addToFace(normal, a, b, c, n);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      const n = faceNormal(position, i, i + 1, i + 2);
      normal.setXYZ(i, n.x, n.y, n.z);
      normal.setXYZ(i + 1, n.x, n.y, n.z);
      normal.setXYZ(i + 2, n.x, n.y, n.z);
    }
  }
  unitNormals(geometry);
  normal.needsUpdate = true;
}

/** Makes every normal of `geometry` unit length (a zero one stays zero). */
export function unitNormals(geometry: Geometry): void {
  const normal = geometry.getAttribute('normal');
  if (!normal) return;
  for (let i = 0; i < normal.count; i++) {
    _n.set(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize();
    normal.setXYZ(i, _n.x, _n.y, _n.z);
  }
}
