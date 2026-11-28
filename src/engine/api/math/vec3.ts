// A point or a direction in 3D, in place and chainable as three's `Vector3`. `x`, `y` and `z` are accessors over
// fields of its own, telling its `owner` of each write where it has one (a node's place and size, `scene/watched.ts`):
// every vector is one shape, so the maths' every call site sees one (a watched subclass made two, and the IK, the
// cloth and the foes' AI ran polymorphic: `lab perf --wave 36 --throttle 4 --profile=solveArm`).
import { clamp } from './maths.ts';
import { Quat } from './quat.ts';
import type { Euler } from './euler.ts';
import type { Mat3 } from './mat3.ts';
import type { Mat4 } from './mat4.ts';
import type { Spherical } from './spherical.ts';
import type { AttributeLike, NumberArray, ProjectingCamera, Vec3Tuple, Watcher } from './types.ts';

/** three's `Vector3`, its components accessors over its own fields (one shape for every vector). */
export class Vec3 {
  /** told of every write (a node's place or size); none for a plain vector */
  owner: Watcher | undefined;
  private _x: number;
  private _y: number;
  private _z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.owner = undefined;
    this._x = x;
    this._y = y;
    this._z = z;
  }

  /** the first component */
  get x(): number { return this._x; }
  set x(value: number) {
    this._x = value;
    this.owner?.touched();
  }
  /** the second component */
  get y(): number { return this._y; }
  set y(value: number) {
    this._y = value;
    this.owner?.touched();
  }
  /** the third component */
  get z(): number { return this._z; }
  set z(value: number) {
    this._z = value;
    this.owner?.touched();
  }

  /** true: what the game tests for three's `isVector3` */
  get isVec3(): true {
    return true;
  }

  /** sets all three, its owner told once */
  set(x: number, y: number, z: number): this {
    this._x = x;
    this._y = y;
    this._z = z;
    this.owner?.touched();
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

  /** takes `vector`'s numbers */
  copy(vector: Vec3): this {
    return this.set(vector.x, vector.y, vector.z);
  }

  /** adds `vector` */
  add(vector: Vec3): this {
    return this.set(this.x + vector.x, this.y + vector.y, this.z + vector.z);
  }

  /** adds `scalar` to each */
  addScalar(scalar: number): this {
    return this.set(this.x + scalar, this.y + scalar, this.z + scalar);
  }

  /** becomes `a + b` */
  addVectors(left: Vec3, right: Vec3): this {
    return this.set(left.x + right.x, left.y + right.y, left.z + right.z);
  }

  /** adds `vector` times `scale` */
  addScaledVector(vector: Vec3, scale: number): this {
    return this.set(this.x + vector.x * scale, this.y + vector.y * scale, this.z + vector.z * scale);
  }

  /** takes `vector` away */
  sub(vector: Vec3): this {
    return this.set(this.x - vector.x, this.y - vector.y, this.z - vector.z);
  }

  /** becomes `a - b` */
  subVectors(left: Vec3, right: Vec3): this {
    return this.set(left.x - right.x, left.y - right.y, left.z - right.z);
  }

  /** multiplies each by `vector`'s */
  multiply(vector: Vec3): this {
    return this.set(this.x * vector.x, this.y * vector.y, this.z * vector.z);
  }

  /** multiplies each by `scalar` */
  multiplyScalar(scalar: number): this {
    return this.set(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  /** divides each by `scalar` */
  divideScalar(scalar: number): this {
    return this.multiplyScalar(1 / scalar);
  }

  /** each the lesser of its own and `vector`'s */
  min(vector: Vec3): this {
    return this.set(Math.min(this.x, vector.x), Math.min(this.y, vector.y), Math.min(this.z, vector.z));
  }

  /** each the greater of its own and `vector`'s */
  max(vector: Vec3): this {
    return this.set(Math.max(this.x, vector.x), Math.max(this.y, vector.y), Math.max(this.z, vector.z));
  }

  /** each kept between `low`'s and `high`'s */
  clamp(low: Vec3, high: Vec3): this {
    return this.max(low).min(high);
  }

  /** each rounded down */
  floor(): this {
    return this.set(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
  }

  /** each the other way */
  negate(): this {
    return this.set(-this.x, -this.y, -this.z);
  }

  /** the dot product with `vector` */
  dot(vector: Vec3): number {
    return this.x * vector.x + this.y * vector.y + this.z * vector.z;
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

  /** moved `alpha` of the way to `vector` */
  lerp(vector: Vec3, alpha: number): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    return this.set(x + (vector.x - x) * alpha, y + (vector.y - y) * alpha, z + (vector.z - z) * alpha);
  }

  /** becomes the point `alpha` of the way from `left` to `right` */
  lerpVectors(left: Vec3, right: Vec3, alpha: number): this {
    const x = left.x + (right.x - left.x) * alpha;
    const y = left.y + (right.y - left.y) * alpha;
    return this.set(x, y, left.z + (right.z - left.z) * alpha);
  }

  /** becomes its cross product with `vector` (`this × v`) */
  cross(vector: Vec3): this {
    return this.crossVectors(this, vector);
  }

  /** becomes `a × b` (either may be this vector) */
  crossVectors(left: Vec3, right: Vec3): this {
    const ax = left.x;
    const ay = left.y;
    const az = left.z;
    const bx = right.x;
    const by = right.y;
    const bz = right.z;
    return this.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }

  /** becomes its part along `vector` */
  projectOnVector(vector: Vec3): this {
    const lengthSq = vector.lengthSq();
    if (lengthSq === 0) return this.set(0, 0, 0);
    const scale = vector.dot(this) / lengthSq;
    return this.copy(vector).multiplyScalar(scale);
  }

  /** becomes its part in the plane whose normal is `planeNormal` (one long) */
  projectOnPlane(planeNormal: Vec3): this {
    scratch.copy(this).projectOnVector(planeNormal);
    return this.sub(scratch);
  }

  /** the angle to `vector`, in radians (a right angle when either is 0) */
  angleTo(vector: Vec3): number {
    const lengths = Math.sqrt(this.lengthSq() * vector.lengthSq());
    if (lengths === 0) return Math.PI / 2;
    return Math.acos(clamp(this.dot(vector) / lengths, -1, 1));
  }

  /** the distance to `vector` */
  distanceTo(vector: Vec3): number {
    return Math.sqrt(this.distanceToSquared(vector));
  }

  /** the distance to `vector`, squared */
  distanceToSquared(vector: Vec3): number {
    const dx = this.x - vector.x;
    const dy = this.y - vector.y;
    const dz = this.z - vector.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /** turned by `quaternion` (one long); follows three.js 0.187.0's `Vector3.applyQuaternion` (`t = 2 q × v`) */
  applyQuaternion(quaternion: Quat): this {
    const vx = this.x;
    const vy = this.y;
    const vz = this.z;
    const qx = quaternion.x;
    const qy = quaternion.y;
    const qz = quaternion.z;
    const qw = quaternion.w;
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

  /** multiplied by `matrix` */
  applyMatrix3(matrix: Mat3): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const elements = matrix.elements;
    const px = elements[0] * x + elements[3] * y + elements[6] * z;
    const py = elements[1] * x + elements[4] * y + elements[7] * z;
    return this.set(px, py, elements[2] * x + elements[5] * y + elements[8] * z);
  }

  /** multiplied by the normal matrix `matrix`, then made one long */
  applyNormalMatrix(matrix: Mat3): this {
    return this.applyMatrix3(matrix).normalize();
  }

  /** placed by `matrix`, as a point (divided by its w: a projection's too) */
  applyMatrix4(matrix: Mat4): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const elements = matrix.elements;
    const w = 1 / (elements[3] * x + elements[7] * y + elements[11] * z + elements[15]);
    const px = (elements[0] * x + elements[4] * y + elements[8] * z + elements[12]) * w;
    const py = (elements[1] * x + elements[5] * y + elements[9] * z + elements[13]) * w;
    const pz = (elements[2] * x + elements[6] * y + elements[10] * z + elements[14]) * w;
    return this.set(px, py, pz);
  }

  /** turned by `matrix`'s upper 3 by 3 as a direction, then made one long */
  transformDirection(matrix: Mat4): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const elements = matrix.elements;
    const px = elements[0] * x + elements[4] * y + elements[8] * z;
    const py = elements[1] * x + elements[5] * y + elements[9] * z;
    this.set(px, py, elements[2] * x + elements[6] * y + elements[10] * z);
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

  /** becomes `matrix`'s translation */
  setFromMatrixPosition(matrix: Mat4): this {
    const elements = matrix.elements;
    return this.set(elements[12], elements[13], elements[14]);
  }

  /** becomes the scale along each of `matrix`'s axes */
  setFromMatrixScale(matrix: Mat4): this {
    const sx = this.setFromMatrixColumn(matrix, 0).length();
    const sy = this.setFromMatrixColumn(matrix, 1).length();
    const sz = this.setFromMatrixColumn(matrix, 2).length();
    return this.set(sx, sy, sz);
  }

  /** becomes `matrix`'s column `index` (0 to 3) */
  setFromMatrixColumn(matrix: Mat4, index: number): this {
    return this.fromArray(matrix.elements, index * 4);
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

  /** whether `vector` has the same numbers */
  equals(vector: Vec3): boolean {
    return vector.x === this.x && vector.y === this.y && vector.z === this.z;
  }

  /** takes three numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2]);
  }

  /** the three numbers as a new array */
  toArray(): Vec3Tuple;
  /** writes the three numbers into `array` at `offset` */
  toArray<Out extends NumberArray>(array: Out, offset?: number): Out;
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
