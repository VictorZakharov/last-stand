// A geometry's normals made from its faces (three's `computeVertexNormals`), and made unit length
// (`normalizeNormals`): smooth where faces share a vertex through the index, flat where they don't.
import { Vec3 } from '../math/index.ts';
import { Attribute } from './attribute.ts';
import type { Geometry } from './geometry.ts';

const scratchFirst = new Vec3();
const scratchSecond = new Vec3();
const scratchThird = new Vec3();
const scratchSecondToThird = new Vec3();
const scratchSecondToFirst = new Vec3();
const scratchNormal = new Vec3();

/** The face (first, second, third)'s normal, scaled by twice its area, into `scratchSecondToThird`. */
function faceNormal(position: Attribute, first: number, second: number, third: number): Vec3 {
  scratchFirst.set(position.getX(first), position.getY(first), position.getZ(first));
  scratchSecond.set(position.getX(second), position.getY(second), position.getZ(second));
  scratchThird.set(position.getX(third), position.getY(third), position.getZ(third));
  scratchSecondToThird.subVectors(scratchThird, scratchSecond);
  scratchSecondToFirst.subVectors(scratchFirst, scratchSecond);
  return scratchSecondToThird.cross(scratchSecondToFirst);
}

/**
 * Adds `n` to the normals of vertices a, b and c, all three read before any is written (as three does: a face with
 * a vertex twice adds to it once).
 */
function addToFace(normal: Attribute, first: number, second: number, third: number, crossed: Vec3): void {
  const ax = normal.getX(first) + crossed.x;
  const ay = normal.getY(first) + crossed.y;
  const az = normal.getZ(first) + crossed.z;
  const bx = normal.getX(second) + crossed.x;
  const by = normal.getY(second) + crossed.y;
  const bz = normal.getZ(second) + crossed.z;
  const cx = normal.getX(third) + crossed.x;
  const cy = normal.getY(third) + crossed.y;
  const cz = normal.getZ(third) + crossed.z;
  normal.setXYZ(first, ax, ay, az);
  normal.setXYZ(second, bx, by, bz);
  normal.setXYZ(third, cx, cy, cz);
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
      const first = index.getX(i);
      const second = index.getX(i + 1);
      const third = index.getX(i + 2);
      const crossed = faceNormal(position, first, second, third);
      addToFace(normal, first, second, third, crossed);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      const crossed = faceNormal(position, i, i + 1, i + 2);
      normal.setXYZ(i, crossed.x, crossed.y, crossed.z);
      normal.setXYZ(i + 1, crossed.x, crossed.y, crossed.z);
      normal.setXYZ(i + 2, crossed.x, crossed.y, crossed.z);
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
    scratchNormal.set(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize();
    normal.setXYZ(i, scratchNormal.x, scratchNormal.y, scratchNormal.z);
  }
}
