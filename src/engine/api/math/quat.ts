// A turn, as three's `Quaternion`: in place and chainable, and telling `_onChange`'s callback after every write
// a method makes, so a node's `rotation` follows its `quaternion`. `x`, `y`, `z` and `w` are declared in an
// interface and written through `this` alone, so `scene/`'s `WatchedQuat` can make them accessors.
import { clamp } from './maths.ts';
import type { Euler } from './euler.ts';
import type { Mat4 } from './mat4.ts';
import type { Vec3 } from './vec3.ts';
import type { NumberArray, Vec4Tuple } from './types.ts';

/** what `Quat` holds; an interface, not class fields, so a subclass may give them accessors (TS2611 otherwise) */
export interface Quat {
  /** the axis's x times the half angle's sine */
  x: number;
  /** the axis's y times the half angle's sine */
  y: number;
  /** the axis's z times the half angle's sine */
  z: number;
  /** the half angle's cosine */
  w: number;
}

/** a callback that does nothing: a quaternion's own until `_onChange` sets one */
function unwatched(): void {}

/**
 * three's `Quaternion`. Its components are not class fields (a field would hide a subclass's accessors); each
 * method reads them all before it writes any, and calls `_onChangeCallback` once its writes are done.
 */
export class Quat {
  /** called after a method writes this quaternion (a node's rotation kept in step); not on a field's write */
  _onChangeCallback: () => void = unwatched;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /** sets what's called after a method writes this quaternion */
  _onChange(callback: () => void): this {
    this._onChangeCallback = callback;
    return this;
  }

  /** writes all four without telling: the methods' one way in */
  private put(x: number, y: number, z: number, w: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
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

  /** takes `q`'s numbers */
  copy(q: Quat): this {
    return this.set(q.x, q.y, q.z, q.w);
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
   * The turn of `m`'s upper 3 by 3 (a rotation, unscaled). Follows three.js 0.187.0's
   * `Quaternion.setFromRotationMatrix` (Shoemake's: from the trace, or the largest diagonal entry).
   */
  setFromRotationMatrix(m: Mat4): this {
    const e = m.elements;
    const m11 = e[0];
    const m12 = e[4];
    const m13 = e[8];
    const m21 = e[1];
    const m22 = e[5];
    const m23 = e[9];
    const m31 = e[2];
    const m32 = e[6];
    const m33 = e[10];
    const trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      return this.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s);
    }
    if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      return this.set(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
    }
    if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      return this.set((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s);
    }
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    return this.set((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
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

  /** the angle between this turn and `q`, in radians */
  angleTo(q: Quat): number {
    return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
  }

  /** turned towards `q` by at most `step` radians */
  rotateTowards(q: Quat, step: number): this {
    const angle = this.angleTo(q);
    if (angle === 0) return this;
    return this.slerp(q, Math.min(1, step / angle));
  }

  /** the turn undone (its conjugate: a unit quaternion's inverse) */
  invert(): this {
    return this.set(-this.x, -this.y, -this.z, this.w);
  }

  /** the dot product with `q` */
  dot(q: Quat): number {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
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

  /** becomes `this * q`: `q`'s turn first, then this one */
  multiply(q: Quat): this {
    return this.multiplyQuaternions(this, q);
  }

  /** becomes `q * this`: this turn first, then `q`'s */
  premultiply(q: Quat): this {
    return this.multiplyQuaternions(q, this);
  }

  /** becomes `a * b` (either may be this quaternion) */
  multiplyQuaternions(a: Quat, b: Quat): this {
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const aw = a.w;
    const bx = b.x;
    const by = b.y;
    const bz = b.z;
    const bw = b.w;
    const x = ax * bw + aw * bx + ay * bz - az * by;
    const y = ay * bw + aw * by + az * bx - ax * bz;
    const z = az * bw + aw * bz + ax * by - ay * bx;
    const w = aw * bw - ax * bx - ay * by - az * bz;
    return this.set(x, y, z, w);
  }

  /**
   * Turned `t` of the way to `q` along the shorter arc. Follows three.js 0.187.0's `Quaternion.slerp`: within
   * a dot of 0.9995 it blends straight and normalizes.
   */
  slerp(q: Quat, t: number): this {
    let x = q.x;
    let y = q.y;
    let z = q.z;
    let w = q.w;
    let dot = this.dot(q);
    if (dot < 0) {
      x = -x;
      y = -y;
      z = -z;
      w = -w;
      dot = -dot;
    }
    let keep = 1 - t;
    let take = t;
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

  /** becomes the turn `t` of the way from `a` to `b` */
  slerpQuaternions(a: Quat, b: Quat, t: number): this {
    return this.copy(a).slerp(b, t);
  }

  /** whether `q` has the same numbers */
  equals(q: Quat): boolean {
    return q.x === this.x && q.y === this.y && q.z === this.z && q.w === this.w;
  }

  /** takes four numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2], array[offset + 3]);
  }

  /** the four numbers as a new array */
  toArray(): Vec4Tuple;
  /** writes the four numbers into `array` at `offset` */
  toArray<T extends NumberArray>(array: T, offset?: number): T;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    array[offset + 3] = this.w;
    return array;
  }
}
