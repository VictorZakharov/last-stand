// An axis-aligned box, as three's `Box3`: `min` and `max` corners, empty while `min` is past `max` (as it's made).
// A node's box (three's `setFromObject`, `expandByObject`) is the scene's: it walks nodes, which the maths
// knows nothing of.
import { Vec3 } from './vec3.ts';
import type { Mat4 } from './mat4.ts';
import type { Sphere } from './sphere.ts';
import type { AttributeLike } from './types.ts';

/** three's `Box3` */
export class Box3 {
  /** the least corner */
  min: Vec3;
  /** the greatest corner */
  max: Vec3;

  /** a box between the corners given, or empty */
  constructor(min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity)) {
    this.min = min;
    this.max = max;
  }

  /** takes the two corners' numbers */
  set(min: Vec3, max: Vec3): this {
    this.min.copy(min);
    this.max.copy(max);
    return this;
  }

  /** the box round `points` */
  setFromPoints(points: readonly Vec3[]): this {
    this.makeEmpty();
    for (const point of points) this.expandByPoint(point);
    return this;
  }

  /** the box round every item of `attribute` */
  setFromBufferAttribute(attribute: AttributeLike): this {
    this.makeEmpty();
    for (let i = 0; i < attribute.count; i++) this.expandByPoint(corner.fromBufferAttribute(attribute, i));
    return this;
  }

  /** a new box with these corners */
  clone(): Box3 {
    return new Box3(this.min.clone(), this.max.clone());
  }

  /** takes `box`'s corners */
  copy(box: Box3): this {
    return this.set(box.min, box.max);
  }

  /** made empty: `min` at +∞, `max` at -∞ */
  makeEmpty(): this {
    this.min.setScalar(Infinity);
    this.max.setScalar(-Infinity);
    return this;
  }

  /** whether it holds nothing (a box of one point is not empty) */
  isEmpty(): boolean {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }

  /** its middle, into `target` (0 when empty) */
  getCenter(target: Vec3): Vec3 {
    if (this.isEmpty()) return target.set(0, 0, 0);
    return target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }

  /** its size along each axis, into `target` (0 when empty) */
  getSize(target: Vec3): Vec3 {
    if (this.isEmpty()) return target.set(0, 0, 0);
    return target.subVectors(this.max, this.min);
  }

  /** grown to hold `point` */
  expandByPoint(point: Vec3): this {
    this.min.min(point);
    this.max.max(point);
    return this;
  }

  /** grown by `vector` on each axis's both sides */
  expandByVector(vector: Vec3): this {
    this.min.sub(vector);
    this.max.add(vector);
    return this;
  }

  /** grown by `scalar` on every side */
  expandByScalar(scalar: number): this {
    this.min.addScalar(-scalar);
    this.max.addScalar(scalar);
    return this;
  }

  /** whether `point` is in it or on its sides */
  containsPoint(point: Vec3): boolean {
    const inX = point.x >= this.min.x && point.x <= this.max.x;
    const inY = point.y >= this.min.y && point.y <= this.max.y;
    return inX && inY && point.z >= this.min.z && point.z <= this.max.z;
  }

  /** whether `box` is all in it */
  containsBox(box: Box3): boolean {
    const inX = this.min.x <= box.min.x && box.max.x <= this.max.x;
    const inY = this.min.y <= box.min.y && box.max.y <= this.max.y;
    return inX && inY && this.min.z <= box.min.z && box.max.z <= this.max.z;
  }

  /** whether `box` meets it (touching counts) */
  intersectsBox(box: Box3): boolean {
    const apartX = box.max.x < this.min.x || box.min.x > this.max.x;
    const apartY = box.max.y < this.min.y || box.min.y > this.max.y;
    return !(apartX || apartY || box.max.z < this.min.z || box.min.z > this.max.z);
  }

  /** whether `sphere` meets it */
  intersectsSphere(sphere: Sphere): boolean {
    this.clampPoint(sphere.center, corner);
    return corner.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  /** the point of it nearest `point`, into `target` */
  clampPoint(point: Vec3, target: Vec3): Vec3 {
    return target.copy(point).max(this.min).min(this.max);
  }

  /** how far `point` is from it (0 inside) */
  distanceToPoint(point: Vec3): number {
    return this.clampPoint(point, corner).distanceTo(point);
  }

  /** the sphere round it, into `target` (empty when it is) */
  getBoundingSphere(target: Sphere): Sphere {
    if (this.isEmpty()) return target.makeEmpty();
    this.getCenter(target.center);
    target.radius = this.getSize(corner).length() * 0.5;
    return target;
  }

  /** grown to hold `box` too */
  union(box: Box3): this {
    this.min.min(box.min);
    this.max.max(box.max);
    return this;
  }

  /** the box round its eight corners placed by `matrix` (left empty when empty) */
  applyMatrix4(matrix: Mat4): this {
    if (this.isEmpty()) return this;
    const low = this.min;
    const high = this.max;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? high.x : low.x;
      const y = i & 2 ? high.y : low.y;
      const z = i & 4 ? high.z : low.z;
      corners[i].set(x, y, z).applyMatrix4(matrix);
    }
    return this.setFromPoints(corners);
  }

  /** moved by `offset` */
  translate(offset: Vec3): this {
    this.min.add(offset);
    this.max.add(offset);
    return this;
  }

  /** whether `box` has the same corners */
  equals(box: Box3): boolean {
    return box.min.equals(this.min) && box.max.equals(this.max);
  }
}

/** a point the tests measure with */
const corner = new Vec3();
/** the eight corners `applyMatrix4` places */
const corners = Array.from({ length: 8 }, () => new Vec3());
