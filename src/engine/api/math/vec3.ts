// A point or a direction in 3D, in place and chainable as three's `Vector3`. `x`, `y` and `z` are written through
// `this` alone and declared in an interface, so a watched subclass (`scene/`'s `WatchedVec3`) can make them
// accessors (see `Vec3`'s note).
import { clamp } from './maths.ts';
import { Quat } from './quat.ts';
import type { Euler } from './euler.ts';
import type { Mat3 } from './mat3.ts';
import type { Mat4 } from './mat4.ts';
import type { Spherical } from './spherical.ts';
import type { AttributeLike, NumberArray, ProjectingCamera, Vec3Tuple } from './types.ts';

/** what `Vec3` holds; an interface, not class fields, so a subclass may give them accessors (TS2611 otherwise) */
export interface Vec3 {
  /** the first component */
  x: number;
  /** the second component */
  y: number;
  /** the third component */
  z: number;
}

/**
 * three's `Vector3`. Its components are not class fields: under `useDefineForClassFields` a field would be an own
 * property of each vector, hiding a subclass's accessors, so they are assigned in the constructor alone.
 */
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** true: what the game tests for three's `isVector3` */
  get isVec3(): true {
    return true;
  }

  /** sets all three */
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /** sets all three to `scalar` */
  setScalar(scalar: number): this {
    return this.set(scalar, scalar, scalar);
  }

  /** sets `x` */
  setX(x: number): this {
    this.x = x;
    return this;
  }

  /** sets `y` */
  setY(y: number): this {
    this.y = y;
    return this;
  }

  /** sets `z` */
  setZ(z: number): this {
    this.z = z;
    return this;
  }

  /** sets the component at `index` (0 `x`, 1 `y`, 2 `z`) */
  setComponent(index: number, value: number): this {
    if (index === 0) this.x = value;
    else if (index === 1) this.y = value;
    else if (index === 2) this.z = value;
    else throw new Error('Vec3.setComponent: index out of range: ' + index);
    return this;
  }

  /** the component at `index` (0 `x`, 1 `y`, 2 `z`) */
  getComponent(index: number): number {
    if (index === 0) return this.x;
    if (index === 1) return this.y;
    if (index === 2) return this.z;
    throw new Error('Vec3.getComponent: index out of range: ' + index);
  }

  /** a new plain `Vec3` with these numbers (a watched vector's clone is plain) */
  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  /** takes `v`'s numbers */
  copy(v: Vec3): this {
    return this.set(v.x, v.y, v.z);
  }

  /** adds `v` */
  add(v: Vec3): this {
    return this.set(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  /** adds `scalar` to each */
  addScalar(scalar: number): this {
    return this.set(this.x + scalar, this.y + scalar, this.z + scalar);
  }

  /** becomes `a + b` */
  addVectors(a: Vec3, b: Vec3): this {
    return this.set(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  /** adds `v` times `scale` */
  addScaledVector(v: Vec3, scale: number): this {
    return this.set(this.x + v.x * scale, this.y + v.y * scale, this.z + v.z * scale);
  }

  /** takes `v` away */
  sub(v: Vec3): this {
    return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  /** becomes `a - b` */
  subVectors(a: Vec3, b: Vec3): this {
    return this.set(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  /** multiplies each by `v`'s */
  multiply(v: Vec3): this {
    return this.set(this.x * v.x, this.y * v.y, this.z * v.z);
  }

  /** multiplies each by `scalar` */
  multiplyScalar(scalar: number): this {
    return this.set(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  /** divides each by `scalar` */
  divideScalar(scalar: number): this {
    return this.multiplyScalar(1 / scalar);
  }

  /** each the lesser of its own and `v`'s */
  min(v: Vec3): this {
    return this.set(Math.min(this.x, v.x), Math.min(this.y, v.y), Math.min(this.z, v.z));
  }

  /** each the greater of its own and `v`'s */
  max(v: Vec3): this {
    return this.set(Math.max(this.x, v.x), Math.max(this.y, v.y), Math.max(this.z, v.z));
  }

  /** each the other way */
  negate(): this {
    return this.set(-this.x, -this.y, -this.z);
  }

  /** the dot product with `v` */
  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /** the length squared */
  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  /** the length */
  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  /** made one long, the way it points (left at 0 when it's 0) */
  normalize(): this {
    return this.divideScalar(this.length() || 1);
  }

  /** made `length` long, the way it points */
  setLength(length: number): this {
    return this.normalize().multiplyScalar(length);
  }

  /** moved `alpha` of the way to `v` */
  lerp(v: Vec3, alpha: number): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    return this.set(x + (v.x - x) * alpha, y + (v.y - y) * alpha, z + (v.z - z) * alpha);
  }

  /** becomes the point `alpha` of the way from `a` to `b` */
  lerpVectors(a: Vec3, b: Vec3, alpha: number): this {
    return this.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
  }

  /** becomes its cross product with `v` (`this × v`) */
  cross(v: Vec3): this {
    return this.crossVectors(this, v);
  }

  /** becomes `a × b` (either may be this vector) */
  crossVectors(a: Vec3, b: Vec3): this {
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const bx = b.x;
    const by = b.y;
    const bz = b.z;
    return this.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }

  /** becomes its part along `v` */
  projectOnVector(v: Vec3): this {
    const lengthSq = v.lengthSq();
    if (lengthSq === 0) return this.set(0, 0, 0);
    const scale = v.dot(this) / lengthSq;
    return this.copy(v).multiplyScalar(scale);
  }

  /** becomes its part in the plane whose normal is `planeNormal` (one long) */
  projectOnPlane(planeNormal: Vec3): this {
    scratch.copy(this).projectOnVector(planeNormal);
    return this.sub(scratch);
  }

  /** the angle to `v`, in radians (a right angle when either is 0) */
  angleTo(v: Vec3): number {
    const lengths = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (lengths === 0) return Math.PI / 2;
    return Math.acos(clamp(this.dot(v) / lengths, -1, 1));
  }

  /** the distance to `v` */
  distanceTo(v: Vec3): number {
    return Math.sqrt(this.distanceToSquared(v));
  }

  /** the distance to `v`, squared */
  distanceToSquared(v: Vec3): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /** turned by `q` (one long) */
  applyQuaternion(q: Quat): this {
    const vx = this.x;
    const vy = this.y;
    const vz = this.z;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    const x = vx + qw * tx + qy * tz - qz * ty;
    const y = vy + qw * ty + qz * tx - qx * tz;
    return this.set(x, y, vz + qw * tz + qx * ty - qy * tx);
  }

  /** turned by `euler` */
  applyEuler(euler: Euler): this {
    return this.applyQuaternion(turn.setFromEuler(euler));
  }

  /** turned by `angle` radians about `axis` (one long) */
  applyAxisAngle(axis: Vec3, angle: number): this {
    return this.applyQuaternion(turn.setFromAxisAngle(axis, angle));
  }

  /** multiplied by `m` */
  applyMatrix3(m: Mat3): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    return this.set(e[0] * x + e[3] * y + e[6] * z, e[1] * x + e[4] * y + e[7] * z, e[2] * x + e[5] * y + e[8] * z);
  }

  /** multiplied by the normal matrix `m`, then made one long */
  applyNormalMatrix(m: Mat3): this {
    return this.applyMatrix3(m).normalize();
  }

  /** placed by `m`, as a point (divided by its w: a projection's too) */
  applyMatrix4(m: Mat4): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    const px = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    const py = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    const pz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this.set(px, py, pz);
  }

  /** turned by `m`'s upper 3 by 3 as a direction, then made one long */
  transformDirection(m: Mat4): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const e = m.elements;
    this.set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z);
    return this.normalize();
  }

  /** from the world to `camera`'s clip space (x and y from -1 to 1 across the screen) */
  project(camera: ProjectingCamera): this {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }

  /** from `camera`'s clip space back to the world */
  unproject(camera: ProjectingCamera): this {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  }

  /** becomes `m`'s translation */
  setFromMatrixPosition(m: Mat4): this {
    const e = m.elements;
    return this.set(e[12], e[13], e[14]);
  }

  /** becomes the scale along each of `m`'s axes */
  setFromMatrixScale(m: Mat4): this {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    return this.set(sx, sy, sz);
  }

  /** becomes `m`'s column `index` (0 to 3) */
  setFromMatrixColumn(m: Mat4, index: number): this {
    return this.fromArray(m.elements, index * 4);
  }

  /** takes `euler`'s three angles */
  setFromEuler(euler: Euler): this {
    return this.set(euler.x, euler.y, euler.z);
  }

  /** becomes the point `spherical` says */
  setFromSpherical(spherical: Spherical): this {
    return this.setFromSphericalCoords(spherical.radius, spherical.phi, spherical.theta);
  }

  /** becomes the point `radius` out, `phi` down from +y, `theta` round from +z towards +x */
  setFromSphericalCoords(radius: number, phi: number, theta: number): this {
    const across = Math.sin(phi) * radius;
    return this.set(across * Math.sin(theta), Math.cos(phi) * radius, across * Math.cos(theta));
  }

  /** whether `v` has the same numbers */
  equals(v: Vec3): boolean {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }

  /** takes three numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2]);
  }

  /** the three numbers as a new array */
  toArray(): Vec3Tuple;
  /** writes the three numbers into `array` at `offset` */
  toArray<T extends NumberArray>(array: T, offset?: number): T;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }

  /** takes item `index` of `attribute` */
  fromBufferAttribute(attribute: AttributeLike, index: number): this {
    return this.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  }
}

/** a vector for `projectOnPlane` */
const scratch = new Vec3();
/** a quaternion for `applyEuler` and `applyAxisAngle` */
const turn = new Quat();
