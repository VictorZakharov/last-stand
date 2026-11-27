// An infinite plane, as three's `Plane`: the points p where `normal · p + constant` is 0, a positive distance on
// the side the normal points to.
import { Mat3 } from './mat3.ts';
import { Vec3 } from './vec3.ts';
import type { Mat4 } from './mat4.ts';
import type { Sphere } from './sphere.ts';

/** three's `Plane` */
export class Plane {
  /** the way it faces (one long once normalized) */
  normal: Vec3;
  /** the signed distance from the origin, against the normal */
  constant: number;

  /** the plane facing `normal`, `constant` from the origin; +x through the origin unless given */
  constructor(normal = new Vec3(1, 0, 0), constant = 0) {
    this.normal = normal;
    this.constant = constant;
  }

  /** takes a normal's numbers and a constant */
  set(normal: Vec3, constant: number): this {
    this.normal.copy(normal);
    this.constant = constant;
    return this;
  }

  /** sets the normal's three numbers and the constant */
  setComponents(x: number, y: number, z: number, w: number): this {
    this.normal.set(x, y, z);
    this.constant = w;
    return this;
  }

  /** the plane facing `normal` (one long) through `point` */
  setFromNormalAndCoplanarPoint(normal: Vec3, point: Vec3): this {
    this.normal.copy(normal);
    this.constant = -point.dot(this.normal);
    return this;
  }

  /** the plane through three points, facing the way `a`, `b`, `c` wind anticlockwise */
  setFromCoplanarPoints(a: Vec3, b: Vec3, c: Vec3): this {
    const normal = edgeA.subVectors(c, b).cross(edgeB.subVectors(a, b)).normalize();
    return this.setFromNormalAndCoplanarPoint(normal, a);
  }

  /** a new plane with this normal and constant */
  clone(): Plane {
    return new Plane(this.normal.clone(), this.constant);
  }

  /** takes `plane`'s normal and constant */
  copy(plane: Plane): this {
    return this.set(plane.normal, plane.constant);
  }

  /** its normal made one long, the constant with it */
  normalize(): this {
    const inverse = 1 / this.normal.length();
    this.normal.multiplyScalar(inverse);
    this.constant *= inverse;
    return this;
  }

  /** turned to face the other way */
  negate(): this {
    this.constant *= -1;
    this.normal.negate();
    return this;
  }

  /** the signed distance of `point` from it */
  distanceToPoint(point: Vec3): number {
    return this.normal.dot(point) + this.constant;
  }

  /** the signed distance of `sphere`'s surface from it */
  distanceToSphere(sphere: Sphere): number {
    return this.distanceToPoint(sphere.center) - sphere.radius;
  }

  /** `point` brought onto it straight along its normal, into `target` */
  projectPoint(point: Vec3, target: Vec3): Vec3 {
    return target.copy(point).addScaledVector(this.normal, -this.distanceToPoint(point));
  }

  /** the point of it nearest the origin, into `target` */
  coplanarPoint(target: Vec3): Vec3 {
    return target.copy(this.normal).multiplyScalar(-this.constant);
  }

  /** placed by `matrix`; its normal turned by `normalMatrix` when given, else by the one made of `matrix` */
  applyMatrix4(matrix: Mat4, normalMatrix?: Mat3): this {
    const turnNormal = normalMatrix ?? normals.getNormalMatrix(matrix);
    const reference = this.coplanarPoint(edgeA).applyMatrix4(matrix);
    const normal = this.normal.applyMatrix3(turnNormal).normalize();
    this.constant = -reference.dot(normal);
    return this;
  }

  /** moved by `offset` */
  translate(offset: Vec3): this {
    this.constant -= offset.dot(this.normal);
    return this;
  }

  /** whether `plane` has the same normal and constant */
  equals(plane: Plane): boolean {
    return plane.normal.equals(this.normal) && plane.constant === this.constant;
  }
}

/** two edges `setFromCoplanarPoints` crosses; the first, a point the other methods measure with */
const edgeA = new Vec3();
const edgeB = new Vec3();
/** the normal matrix `applyMatrix4` makes when none is given */
const normals = new Mat3();
