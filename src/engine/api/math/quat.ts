// A turn, as three's `Quaternion`: in place and chainable, and telling `_onChange`'s callback after every write
// a method makes, so a node's `rotation` follows its `quaternion`. `x`, `y`, `z` and `w` are accessors over fields
// of its own, telling its `owner` where it has one (a node's turn, `scene/watched.ts`): one shape for every quaternion.
import { clamp } from './maths.ts';
import type { Euler } from './euler.ts';
import type { Mat4 } from './mat4.ts';
import type { Vec3 } from './vec3.ts';
import type { NumberArray, Vec4Tuple, Watcher } from './types.ts';

/** a callback that does nothing: a quaternion's own until `_onChange` sets one */
function unwatched(): void {}

/**
 * three's `Quaternion`, its components accessors over its own fields. Each method reads them all before it writes
 * any, and calls `_onChangeCallback` once its writes are done.
 */
export class Quat {
  /** called after a method writes this quaternion; not on a field's write */
  _onChangeCallback: () => void = unwatched;
  /** told of every write and asked before every read (a node's turn, kept in step with its angles); none for a plain
   *  quaternion */
  owner: Watcher | undefined;
  private _qx: number;
  private _qy: number;
  private _qz: number;
  private _qw: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.owner = undefined;
    this._qx = x;
    this._qy = y;
    this._qz = z;
    this._qw = w;
  }

  /** the axis's x times the half angle's sine */
  get x(): number {
    this.owner?.fresh();
    return this._qx;
  }
  set x(value: number) {
    this.owner?.fresh();
    this._qx = value;
    this.owner?.touched();
  }
  /** the axis's y times the half angle's sine */
  get y(): number {
    this.owner?.fresh();
    return this._qy;
  }
  set y(value: number) {
    this.owner?.fresh();
    this._qy = value;
    this.owner?.touched();
  }
  /** the axis's z times the half angle's sine */
  get z(): number {
    this.owner?.fresh();
    return this._qz;
  }
  set z(value: number) {
    this.owner?.fresh();
    this._qz = value;
    this.owner?.touched();
  }
  /** the half angle's cosine */
  get w(): number {
    this.owner?.fresh();
    return this._qw;
  }
  set w(value: number) {
    this.owner?.fresh();
    this._qw = value;
    this.owner?.touched();
  }

  /** Its four numbers stored as they are, telling nobody: a node keeping it in step with its angles. */
  store(x: number, y: number, z: number, w: number): void {
    this._qx = x;
    this._qy = y;
    this._qz = z;
    this._qw = w;
  }

  /** sets what's called after a method writes this quaternion */
  _onChange(callback: () => void): this {
    this._onChangeCallback = callback;
    return this;
  }

  /** writes all four without telling: the methods' one way in (a node's own writes them and tells it once) */
  protected put(x: number, y: number, z: number, w: number): void {
    this.owner?.fresh();
    this._qx = x;
    this._qy = y;
    this._qz = z;
    this._qw = w;
    this.owner?.touched();
  }

  /** sets all four */
  set(x: number, y: number, z: number, w: number): this {
    this.put(x, y, z, w);
    this._onChangeCallback();
    return this;
  }

  /** a new plain `Quat` with these numbers */
  clone(): Quat {
    return new Quat(this.x, this.y, this.z, this.w);
  }

  /** takes `other`'s numbers */
  copy(other: Quat): this {
    return this.set(other.x, other.y, other.z, other.w);
  }

  /** no turn */
  identity(): this {
    return this.set(0, 0, 0, 1);
  }

  /**
   * The turn `euler`'s three angles make in its order. Follows three.js 0.187.0's `Quaternion.setFromEuler`
   * (its products of half angles a order). `update` false leaves the callback uncalled.
   */
  setFromEuler(euler: Euler, update = true): this {
    const c1 = Math.cos(euler.x / 2);
    const c2 = Math.cos(euler.y / 2);
    const c3 = Math.cos(euler.z / 2);
    const s1 = Math.sin(euler.x / 2);
    const s2 = Math.sin(euler.y / 2);
    const s3 = Math.sin(euler.z / 2);
    const x1 = s1 * c2 * c3;
    const x2 = c1 * s2 * s3;
    const y1 = c1 * s2 * c3;
    const y2 = s1 * c2 * s3;
    const z1 = c1 * c2 * s3;
    const z2 = s1 * s2 * c3;
    const w1 = c1 * c2 * c3;
    const w2 = s1 * s2 * s3;
    const order = euler.order;
    if (order === 'XYZ') this.put(x1 + x2, y1 - y2, z1 + z2, w1 - w2);
    else if (order === 'YXZ') this.put(x1 + x2, y1 - y2, z1 - z2, w1 + w2);
    else if (order === 'ZXY') this.put(x1 - x2, y1 + y2, z1 + z2, w1 - w2);
    else if (order === 'ZYX') this.put(x1 - x2, y1 + y2, z1 - z2, w1 + w2);
    else if (order === 'YZX') this.put(x1 + x2, y1 + y2, z1 - z2, w1 - w2);
    else this.put(x1 - x2, y1 - y2, z1 + z2, w1 + w2);
    if (update) this._onChangeCallback();
    return this;
  }

  /** the turn of `angle` radians about `axis` (one long) */
  setFromAxisAngle(axis: Vec3, angle: number): this {
    const sine = Math.sin(angle / 2);
    return this.set(axis.x * sine, axis.y * sine, axis.z * sine, Math.cos(angle / 2));
  }

  /**
   * The turn of `matrix`'s upper 3 by 3 (a rotation, unscaled). Follows three.js 0.187.0's
   * `Quaternion.setFromRotationMatrix` (Shoemake's: from the trace, or the largest diagonal entry).
   */
  setFromRotationMatrix(matrix: Mat4): this {
    const elements = matrix.elements;
    const m11 = elements[0];
    const m12 = elements[4];
    const m13 = elements[8];
    const m21 = elements[1];
    const m22 = elements[5];
    const m23 = elements[9];
    const m31 = elements[2];
    const m32 = elements[6];
    const m33 = elements[10];
    const trace = m11 + m22 + m33;
    if (trace > 0) {
      const scale = 0.5 / Math.sqrt(trace + 1);
      return this.set((m32 - m23) * scale, (m13 - m31) * scale, (m21 - m12) * scale, 0.25 / scale);
    }
    if (m11 > m22 && m11 > m33) {
      const scale = 2 * Math.sqrt(1 + m11 - m22 - m33);
      return this.set(0.25 * scale, (m12 + m21) / scale, (m13 + m31) / scale, (m32 - m23) / scale);
    }
    if (m22 > m33) {
      const scale = 2 * Math.sqrt(1 + m22 - m11 - m33);
      return this.set((m12 + m21) / scale, 0.25 * scale, (m23 + m32) / scale, (m13 - m31) / scale);
    }
    const scale = 2 * Math.sqrt(1 + m33 - m11 - m22);
    return this.set((m13 + m31) / scale, (m23 + m32) / scale, 0.25 * scale, (m21 - m12) / scale);
  }

  /**
   * The turn from `from` to `to` (both one long). Follows three.js 0.187.0's `Quaternion.setFromUnitVectors`:
   * opposite ways (within 1e-8) turn half round an axis across `from`.
   */
  setFromUnitVectors(from: Vec3, to: Vec3): this {
    const r = from.x * to.x + from.y * to.y + from.z * to.z + 1;
    if (r < 1e-8) {
      if (Math.abs(from.x) > Math.abs(from.z)) this.put(-from.y, from.x, 0, 0);
      else this.put(0, -from.z, from.y, 0);
    } else {
      const x = from.y * to.z - from.z * to.y;
      const y = from.z * to.x - from.x * to.z;
      const z = from.x * to.y - from.y * to.x;
      this.put(x, y, z, r);
    }
    return this.normalize();
  }

  /** the angle between this turn and `other`, in radians */
  angleTo(other: Quat): number {
    return 2 * Math.acos(Math.abs(clamp(this.dot(other), -1, 1)));
  }

  /** turned towards `other` by at most `step` radians */
  rotateTowards(other: Quat, step: number): this {
    const angle = this.angleTo(other);
    if (angle === 0) return this;
    return this.slerp(other, Math.min(1, step / angle));
  }

  /** the turn undone (its conjugate: a unit quaternion's inverse) */
  invert(): this {
    return this.set(-this.x, -this.y, -this.z, this.w);
  }

  /** its conjugate, the same as `invert` for the unit quaternions turns are */
  conjugate(): this {
    return this.invert();
  }

  /** the dot product with `other` */
  dot(other: Quat): number {
    return this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w;
  }

  /** the length squared */
  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  /** the length */
  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  /** made one long (no turn when it's 0) */
  normalize(): this {
    const length = this.length();
    if (length === 0) return this.set(0, 0, 0, 1);
    const inverse = 1 / length;
    return this.set(this.x * inverse, this.y * inverse, this.z * inverse, this.w * inverse);
  }

  /** becomes `this * q`: `other`'s turn first, then this one */
  multiply(other: Quat): this {
    return this.multiplyQuaternions(this, other);
  }

  /** becomes `q * this`: this turn first, then `other`'s */
  premultiply(other: Quat): this {
    return this.multiplyQuaternions(other, this);
  }

  /** becomes `a * b` (either may be this quaternion) */
  multiplyQuaternions(left: Quat, right: Quat): this {
    const ax = left.x;
    const ay = left.y;
    const az = left.z;
    const aw = left.w;
    const bx = right.x;
    const by = right.y;
    const bz = right.z;
    const bw = right.w;
    const x = ax * bw + aw * bx + ay * bz - az * by;
    const y = ay * bw + aw * by + az * bx - ax * bz;
    const z = az * bw + aw * bz + ax * by - ay * bx;
    const w = aw * bw - ax * bx - ay * by - az * bz;
    return this.set(x, y, z, w);
  }

  /**
   * Turned `amount` of the way to `other` along the shorter arc. Follows three.js 0.187.0's `Quaternion.slerp`: within
   * a dot of 0.9995 it blends straight and normalizes.
   */
  slerp(other: Quat, amount: number): this {
    let x = other.x;
    let y = other.y;
    let z = other.z;
    let w = other.w;
    let dot = this.dot(other);
    if (dot < 0) {
      x = -x;
      y = -y;
      z = -z;
      w = -w;
      dot = -dot;
    }
    let keep = 1 - amount;
    let take = amount;
    if (dot < 0.9995) {
      const theta = Math.acos(dot);
      const sine = Math.sin(theta);
      keep = Math.sin(keep * theta) / sine;
      take = Math.sin(take * theta) / sine;
    }
    this.put(this.x * keep + x * take, this.y * keep + y * take, this.z * keep + z * take, this.w * keep + w * take);
    if (dot < 0.9995) {
      this._onChangeCallback();
      return this;
    }
    return this.normalize();
  }

  /** becomes the turn `amount` of the way from `left` to `right` */
  slerpQuaternions(left: Quat, right: Quat, amount: number): this {
    return this.copy(left).slerp(right, amount);
  }

  /** whether `other` has the same numbers */
  equals(other: Quat): boolean {
    return other.x === this.x && other.y === this.y && other.z === this.z && other.w === this.w;
  }

  /** takes four numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2], array[offset + 3]);
  }

  /** the four numbers as a new array */
  toArray(): Vec4Tuple;
  /** writes the four numbers into `array` at `offset` */
  toArray<Out extends NumberArray>(array: Out, offset?: number): Out;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    array[offset + 3] = this.w;
    return array;
  }
}
