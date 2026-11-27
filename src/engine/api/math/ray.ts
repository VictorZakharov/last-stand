// A half line, as three's `Ray`: an `origin` and a `direction` (one long), and where it meets spheres, boxes, planes
// and triangles. The raycaster's tests are these.
import { Vec3 } from './vec3.ts';
import type { Box3 } from './box3.ts';
import type { Mat4 } from './mat4.ts';
import type { Plane } from './plane.ts';
import type { Sphere } from './sphere.ts';

/** three's `Ray` */
export class Ray {
  /** where it starts */
  origin: Vec3;
  /** the way it goes (one long) */
  direction: Vec3;

  /** the ray from `origin` along `direction`; from the origin along -z unless given */
  constructor(origin = new Vec3(), direction = new Vec3(0, 0, -1)) {
    this.origin = origin;
    this.direction = direction;
  }

  /** takes an origin's and a direction's numbers */
  set(origin: Vec3, direction: Vec3): this {
    this.origin.copy(origin);
    this.direction.copy(direction);
    return this;
  }

  /** a new ray with this origin and direction */
  clone(): Ray {
    return new Ray(this.origin.clone(), this.direction.clone());
  }

  /** takes `ray`'s origin and direction */
  copy(ray: Ray): this {
    return this.set(ray.origin, ray.direction);
  }

  /** the point `distance` along it, into `target` */
  at(distance: number, target: Vec3): Vec3 {
    return target.copy(this.origin).addScaledVector(this.direction, distance);
  }

  /** turned to point at `point` */
  lookAt(point: Vec3): this {
    this.direction.copy(point).sub(this.origin).normalize();
    return this;
  }

  /** its origin moved `distance` along it */
  recast(distance: number): this {
    this.origin.copy(this.at(distance, onRay));
    return this;
  }

  /** the point of it nearest `point`, into `target` (its origin when `point` is behind it) */
  closestPointToPoint(point: Vec3, target: Vec3): Vec3 {
    target.subVectors(point, this.origin);
    const along = target.dot(this.direction);
    if (along < 0) return target.copy(this.origin);
    return target.copy(this.origin).addScaledVector(this.direction, along);
  }

  /** how far `point` is from it */
  distanceToPoint(point: Vec3): number {
    return Math.sqrt(this.distanceSqToPoint(point));
  }

  /** how far `point` is from it, squared */
  distanceSqToPoint(point: Vec3): number {
    const along = onRay.subVectors(point, this.origin).dot(this.direction);
    if (along < 0) return this.origin.distanceToSquared(point);
    onRay.copy(this.origin).addScaledVector(this.direction, along);
    return onRay.distanceToSquared(point);
  }

  /** where it first meets `sphere`'s surface (its way out when it starts inside), into `target`; null if never */
  intersectSphere(sphere: Sphere, target: Vec3): Vec3 | null {
    onRay.subVectors(sphere.center, this.origin);
    const along = onRay.dot(this.direction);
    const offSq = onRay.dot(onRay) - along * along;
    const radiusSq = sphere.radius * sphere.radius;
    if (offSq > radiusSq) return null;
    const half = Math.sqrt(radiusSq - offSq);
    const enter = along - half;
    const leave = along + half;
    if (leave < 0) return null;
    if (enter < 0) return this.at(leave, target);
    return this.at(enter, target);
  }

  /** whether it meets `sphere` (as three's, an empty sphere's radius of -1 is read squared) */
  intersectsSphere(sphere: Sphere): boolean {
    return this.distanceSqToPoint(sphere.center) <= sphere.radius * sphere.radius;
  }

  /** how far along it `plane` is: 0 when it lies in the plane, null when parallel off it or behind */
  distanceToPlane(plane: Plane): number | null {
    const facing = plane.normal.dot(this.direction);
    if (facing === 0) return plane.distanceToPoint(this.origin) === 0 ? 0 : null;
    const distance = -(this.origin.dot(plane.normal) + plane.constant) / facing;
    return distance >= 0 ? distance : null;
  }

  /** where it meets `plane`, into `target`; null if it doesn't */
  intersectPlane(plane: Plane, target: Vec3): Vec3 | null {
    const distance = this.distanceToPlane(plane);
    if (distance === null) return null;
    return this.at(distance, target);
  }

  /**
   * Where it first meets `box` (its way out when it starts inside), into `target`; null if never. Follows
   * three.js 0.187.0's `Ray.intersectBox` (Williams et al.'s slabs, by each axis's inverse direction, NaN-safe).
   */
  intersectBox(box: Box3, target: Vec3): Vec3 | null {
    const origin = this.origin;
    const inverseX = 1 / this.direction.x;
    const inverseY = 1 / this.direction.y;
    const inverseZ = 1 / this.direction.z;
    let near = ((inverseX >= 0 ? box.min.x : box.max.x) - origin.x) * inverseX;
    let far = ((inverseX >= 0 ? box.max.x : box.min.x) - origin.x) * inverseX;
    const nearY = ((inverseY >= 0 ? box.min.y : box.max.y) - origin.y) * inverseY;
    const farY = ((inverseY >= 0 ? box.max.y : box.min.y) - origin.y) * inverseY;
    if (near > farY || nearY > far) return null;
    if (nearY > near || Number.isNaN(near)) near = nearY;
    if (farY < far || Number.isNaN(far)) far = farY;
    const nearZ = ((inverseZ >= 0 ? box.min.z : box.max.z) - origin.z) * inverseZ;
    const farZ = ((inverseZ >= 0 ? box.max.z : box.min.z) - origin.z) * inverseZ;
    if (near > farZ || nearZ > far) return null;
    if (nearZ > near || Number.isNaN(near)) near = nearZ;
    if (farZ < far || Number.isNaN(far)) far = farZ;
    if (far < 0) return null;
    return this.at(near >= 0 ? near : far, target);
  }

  /** whether it meets `box` */
  intersectsBox(box: Box3): boolean {
    return this.intersectBox(box, onRay) !== null;
  }

  /**
   * Where it meets the triangle `cornerA`, `cornerB`, `cornerC`, into `target`; null if it doesn't, or if
   * `backfaceCulling` and it meets the back (the side the corners wind clockwise from). Follows three.js 0.187.0's
   * `Ray.intersectTriangle` (Eberly's, by signed volumes against the triangle's normal).
   */
  intersectTriangle(cornerA: Vec3, cornerB: Vec3, cornerC: Vec3, backfaceCulling: boolean, target: Vec3): Vec3 | null {
    edge1.subVectors(cornerB, cornerA);
    edge2.subVectors(cornerC, cornerA);
    normal.crossVectors(edge1, edge2);
    let facing = this.direction.dot(normal);
    let sign: number;
    if (facing > 0) {
      if (backfaceCulling) return null;
      sign = 1;
    } else if (facing < 0) {
      sign = -1;
      facing = -facing;
    } else {
      return null;
    }
    fromA.subVectors(this.origin, cornerA);
    const alongB = sign * this.direction.dot(edge2.crossVectors(fromA, edge2));
    if (alongB < 0) return null;
    const alongC = sign * this.direction.dot(edge1.cross(fromA));
    if (alongC < 0) return null;
    if (alongB + alongC > facing) return null;
    const distance = -sign * fromA.dot(normal);
    if (distance < 0) return null;
    return this.at(distance / facing, target);
  }

  /** placed by `matrix`: its origin as a point, its direction as a direction (one long again) */
  applyMatrix4(matrix: Mat4): this {
    this.origin.applyMatrix4(matrix);
    this.direction.transformDirection(matrix);
    return this;
  }

  /** whether `ray` has the same origin and direction */
  equals(ray: Ray): boolean {
    return ray.origin.equals(this.origin) && ray.direction.equals(this.direction);
  }
}

/** a point along the ray the tests measure with */
const onRay = new Vec3();
/** `intersectTriangle`'s edges from `cornerA`, the triangle's normal, and the origin from `cornerA` */
const edge1 = new Vec3();
const edge2 = new Vec3();
const normal = new Vec3();
const fromA = new Vec3();
