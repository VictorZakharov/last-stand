// Three angles turned in an order, as three's `Euler`: in place and chainable, and telling `_onChange`'s callback
// after every write a method makes, so a node's `quaternion` follows its `rotation`. `x`, `y`, `z` and `order` are
// accessors over fields of its own (as three's), telling its `owner` where it has one (a node's angles,
// `scene/watched.ts`): every Euler one shape. Vectors and quaternions are plain fields: accessors on every one made the
// hero's arm search twice as slow (`lab perf --wave 36 --throttle 4 --profile=solveArm`), angles are rarely maths.
import { clamp } from './maths.ts';
import { Mat4 } from './mat4.ts';
import type { Quat } from './quat.ts';
import type { Watcher } from './types.ts';

/** the order an `Euler`'s turns are made in: `'XYZ'` turns about x first, then y, then z */
export type EulerOrder = 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY';

/** a callback that does nothing: an Euler's own until `_onChange` sets one */
function unwatched(): void {}

/** within this of a right angle, a matrix's middle turn is taken as one (gimbal lock) */
const LOCKED = 0.9999999;

/**
 * three's `Euler`, its angles and order accessors over its own fields. Each method reads what it needs before it
 * writes, and calls `_onChangeCallback` once its writes are done.
 */
export class Euler {
  /** called after a method writes these angles; not on a field's write */
  _onChangeCallback: () => void = unwatched;
  /** told of every write and asked before every read (a node's turn as angles); none for plain angles */
  owner: Watcher | undefined;
  private _ex: number;
  private _ey: number;
  private _ez: number;
  private _order: EulerOrder;

  constructor(x = 0, y = 0, z = 0, order: EulerOrder = 'XYZ') {
    this.owner = undefined;
    this._ex = x;
    this._ey = y;
    this._ez = z;
    this._order = order;
  }

  /** the turn about x, in radians */
  get x(): number {
    this.owner?.fresh();
    return this._ex;
  }
  set x(value: number) {
    this.owner?.fresh();
    this._ex = value;
    this.owner?.touched();
  }
  /** the turn about y, in radians */
  get y(): number {
    this.owner?.fresh();
    return this._ey;
  }
  set y(value: number) {
    this.owner?.fresh();
    this._ey = value;
    this.owner?.touched();
  }
  /** the turn about z, in radians */
  get z(): number {
    this.owner?.fresh();
    return this._ez;
  }
  set z(value: number) {
    this.owner?.fresh();
    this._ez = value;
    this.owner?.touched();
  }
  /** the order the three turns are made in */
  get order(): EulerOrder {
    return this._order;
  }
  set order(value: EulerOrder) {
    this.owner?.fresh();
    this._order = value;
    this.owner?.touched();
  }

  /** Its angles stored as they are, telling nobody: a node keeping them in step with its quaternion. */
  store(x: number, y: number, z: number): void {
    this._ex = x;
    this._ey = y;
    this._ez = z;
  }

  /** sets what's called after a method writes these angles */
  _onChange(callback: () => void): this {
    this._onChangeCallback = callback;
    return this;
  }

  /** writes all four without telling: the methods' one way in */
  protected put(x: number, y: number, z: number, order: EulerOrder): void {
    this.owner?.fresh();
    this._ex = x;
    this._ey = y;
    this._ez = z;
    this._order = order;
    this.owner?.touched();
  }

  /** sets the three angles, and the order when one is given */
  set(x: number, y: number, z: number, order: EulerOrder = this.order): this {
    this.put(x, y, z, order);
    this._onChangeCallback();
    return this;
  }

  /** a new plain `Euler` with these angles and order */
  clone(): Euler {
    return new Euler(this.x, this.y, this.z, this.order);
  }

  /** takes `euler`'s angles and order */
  copy(euler: Euler): this {
    return this.set(euler.x, euler.y, euler.z, euler.order);
  }

  /**
   * The angles of `matrix`'s upper 3 by 3 (a rotation, unscaled) in `order`. Follows three.js 0.187.0's
   * `Euler.setFromRotationMatrix` (its middle turn by asin, the other two by atan2, one of them 0 when locked).
   * `update` false leaves the callback uncalled.
   */
  setFromRotationMatrix(matrix: Mat4, order: EulerOrder = this.order, update = true): this {
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
    if (order === 'XYZ') {
      const free = Math.abs(m13) < LOCKED;
      const y = Math.asin(clamp(m13, -1, 1));
      if (free) this.put(Math.atan2(-m23, m33), y, Math.atan2(-m12, m11), order);
      else this.put(Math.atan2(m32, m22), y, 0, order);
    } else if (order === 'YXZ') {
      const free = Math.abs(m23) < LOCKED;
      const x = Math.asin(-clamp(m23, -1, 1));
      if (free) this.put(x, Math.atan2(m13, m33), Math.atan2(m21, m22), order);
      else this.put(x, Math.atan2(-m31, m11), 0, order);
    } else if (order === 'ZXY') {
      const free = Math.abs(m32) < LOCKED;
      const x = Math.asin(clamp(m32, -1, 1));
      if (free) this.put(x, Math.atan2(-m31, m33), Math.atan2(-m12, m22), order);
      else this.put(x, 0, Math.atan2(m21, m11), order);
    } else if (order === 'ZYX') {
      const free = Math.abs(m31) < LOCKED;
      const y = Math.asin(-clamp(m31, -1, 1));
      if (free) this.put(Math.atan2(m32, m33), y, Math.atan2(m21, m11), order);
      else this.put(0, y, Math.atan2(-m12, m22), order);
    } else if (order === 'YZX') {
      const free = Math.abs(m21) < LOCKED;
      const z = Math.asin(clamp(m21, -1, 1));
      if (free) this.put(Math.atan2(-m23, m22), Math.atan2(-m31, m11), z, order);
      else this.put(0, Math.atan2(m13, m33), z, order);
    } else {
      const free = Math.abs(m12) < LOCKED;
      const z = Math.asin(-clamp(m12, -1, 1));
      if (free) this.put(Math.atan2(m32, m22), Math.atan2(m13, m11), z, order);
      else this.put(Math.atan2(-m23, m33), 0, z, order);
    }
    if (update) this._onChangeCallback();
    return this;
  }

  /** the angles of `quaternion`'s turn in `order`; `update` false leaves the callback uncalled */
  setFromQuaternion(quaternion: Quat, order: EulerOrder = this.order, update = true): this {
    rotation.makeRotationFromQuaternion(quaternion);
    return this.setFromRotationMatrix(rotation, order, update);
  }

  /** whether `euler` has the same angles and order */
  equals(euler: Euler): boolean {
    return euler.x === this.x && euler.y === this.y && euler.z === this.z && euler.order === this.order;
  }
}

/** a matrix for `setFromQuaternion` */
const rotation = new Mat4();
