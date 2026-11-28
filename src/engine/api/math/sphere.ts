// A sphere, as three's `Sphere`: a `center` and a `radius`, empty while the radius is under 0 (as it's made).
import { Box3 } from './box3.ts';
import { Vec3 } from './vec3.ts';
import type { Mat4 } from './mat4.ts';

/** three's `Sphere` */
export class Sphere {
  /** its middle */
  center: Vec3;
  /** its radius; under 0 it's empty */
  radius: number;

  /** a sphere of `radius` round `center`, or empty */
  constructor(center = new Vec3(), radius = -1) {
    this.center = center;
    this.radius = radius;
  }

  /** takes the middle's numbers and the radius */
  set(center: Vec3, radius: number): this {
    this.center.copy(center);
    this.radius = radius;
    return this;
  }

  /** the sphere round `points` about `center`, or about the middle of their box */
  setFromPoints(points: readonly Vec3[], center?: Vec3): this {
    if (center) this.center.copy(center);
    else pointsBox.setFromPoints(points).getCenter(this.center);
    let farthest = 0;
    for (const point of points) farthest = Math.max(farthest, this.center.distanceToSquared(point));
    this.radius = Math.sqrt(farthest);
    return this;
  }

  /** a new sphere with this middle and radius */
  clone(): Sphere {
    return new Sphere(this.center.clone(), this.radius);
  }

  /** takes `sphere`'s middle and radius */
  copy(sphere: Sphere): this {
    return this.set(sphere.center, sphere.radius);
  }

  /** whether it holds nothing (a radius of 0 is a point, not empty) */
  isEmpty(): boolean {
    return this.radius < 0;
  }

  /** made empty: its middle at 0, a radius of -1 */
  makeEmpty(): this {
    this.center.set(0, 0, 0);
    this.radius = -1;
    return this;
  }

  /** whether `point` is in it or on it */
  containsPoint(point: Vec3): boolean {
    return point.distanceToSquared(this.center) <= this.radius * this.radius;
  }

  /** how far `point` is from its surface (under 0 inside) */
  distanceToPoint(point: Vec3): number {
    return point.distanceTo(this.center) - this.radius;
  }

  /** whether `sphere` meets it */
  intersectsSphere(sphere: Sphere): boolean {
    const reach = this.radius + sphere.radius;
    return sphere.center.distanceToSquared(this.center) <= reach * reach;
  }

  /** whether `box` meets it */
  intersectsBox(box: Box3): boolean {
    return box.intersectsSphere(this);
  }

  /** the box round it, into `target` */
  getBoundingBox(target: Box3): Box3 {
    if (this.isEmpty()) return target.makeEmpty();
    target.set(this.center, this.center);
    return target.expandByScalar(this.radius);
  }

  /**
   * Grown, as little as it can, to hold `point` (an empty sphere becomes the point). Follows three.js 0.187.0's
   * `Sphere.expandByPoint`: the middle moved half the overshoot towards the point.
   */
  expandByPoint(point: Vec3): this {
    if (this.isEmpty()) {
      this.center.copy(point);
      this.radius = 0;
      return this;
    }
    toPoint.subVectors(point, this.center);
    const lengthSq = toPoint.lengthSq();
    if (lengthSq > this.radius * this.radius) {
      const length = Math.sqrt(lengthSq);
      const grow = (length - this.radius) * 0.5;
      this.center.addScaledVector(toPoint, grow / length);
      this.radius += grow;
    }
    return this;
  }

  /** grown to hold `sphere` too; follows three.js 0.187.0's `Sphere.union` (its two far points) */
  union(sphere: Sphere): this {
    if (sphere.isEmpty()) return this;
    if (this.isEmpty()) return this.copy(sphere);
    if (this.center.equals(sphere.center)) {
      this.radius = Math.max(this.radius, sphere.radius);
      return this;
    }
    reach.subVectors(sphere.center, this.center).setLength(sphere.radius);
    this.expandByPoint(far.copy(sphere.center).add(reach));
    this.expandByPoint(far.copy(sphere.center).sub(reach));
    return this;
  }

  /** placed by `matrix`, its radius by the matrix's largest scale */
  applyMatrix4(matrix: Mat4): this {
    this.center.applyMatrix4(matrix);
    this.radius *= matrix.getMaxScaleOnAxis();
    return this;
  }

  /** moved by `offset` */
  translate(offset: Vec3): this {
    this.center.add(offset);
    return this;
  }

  /** whether `sphere` has the same middle and radius */
  equals(sphere: Sphere): boolean {
    return sphere.center.equals(this.center) && sphere.radius === this.radius;
  }
}

/** the box `setFromPoints` takes the middle of */
const pointsBox = new Box3();
/** the way from the middle to a point, for `expandByPoint` */
const toPoint = new Vec3();
/** `union`'s reach along the line between middles, and the far points it makes */
const reach = new Vec3();
const far = new Vec3();
