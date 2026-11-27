// A node's place, turn and size, whose every write tells the node it moved: a Vec3, a Quat and an Euler whose fields
// are accessors over a store of their own. The maths' classes declare their fields (`declare x: number`) and write
// them through `this.x = ...` in every method, so each write here is seen, the constructor's first one too (made
// before the owner is set: told to nobody).
//
// The turn is held twice, as a quaternion and as angles, and kept in step lazily: a write to one marks the other
// stale, and the other is made again from it when it's next read (`fresh`). Made again at every write, a quaternion
// set a field at a time would be turned into angles from a half-written quaternion, and each would write the other
// back without end.
import { Euler, Quat, Vec3 } from '../math/index.ts';

/** What a watched value tells of a write, and asks before a read. */
export interface Mover {
  /** a value of its own was written */
  touched(): void;
  /** about to be read: made again first if what it's kept in step with was written since */
  fresh(): void;
}

/** A node's position or scale. */
export class WatchedVec3 extends Vec3 {
  declare private _x: number;
  declare private _y: number;
  declare private _z: number;
  declare owner: Mover | undefined;

  /** A vector telling `owner` of every write, at `x, y, z`. */
  constructor(owner: Mover, x = 0, y = 0, z = 0) {
    super(x, y, z);
    this.owner = owner;
  }

  /** its x */
  override get x(): number { return this._x; }
  override set x(value: number) {
    this._x = value;
    this.owner?.touched();
  }
  /** its y */
  override get y(): number { return this._y; }
  override set y(value: number) {
    this._y = value;
    this.owner?.touched();
  }
  /** its z */
  override get z(): number { return this._z; }
  override set z(value: number) {
    this._z = value;
    this.owner?.touched();
  }
}

/** A node's turn as a quaternion. */
export class WatchedQuat extends Quat {
  declare private _qx: number;
  declare private _qy: number;
  declare private _qz: number;
  declare private _qw: number;
  declare owner: Mover | undefined;

  /** A quaternion telling `owner` of every write, the identity. */
  constructor(owner: Mover) {
    super();
    this.owner = owner;
  }

  /** Its four numbers stored as they are, telling nobody: the node keeping it in step with its angles. */
  store(x: number, y: number, z: number, w: number): void {
    this._qx = x;
    this._qy = y;
    this._qz = z;
    this._qw = w;
  }

  /** its x */
  override get x(): number {
    this.owner?.fresh();
    return this._qx;
  }
  override set x(value: number) {
    this.owner?.fresh();
    this._qx = value;
    this.owner?.touched();
  }
  /** its y */
  override get y(): number {
    this.owner?.fresh();
    return this._qy;
  }
  override set y(value: number) {
    this.owner?.fresh();
    this._qy = value;
    this.owner?.touched();
  }
  /** its z */
  override get z(): number {
    this.owner?.fresh();
    return this._qz;
  }
  override set z(value: number) {
    this.owner?.fresh();
    this._qz = value;
    this.owner?.touched();
  }
  /** its w */
  override get w(): number {
    this.owner?.fresh();
    return this._qw;
  }
  override set w(value: number) {
    this.owner?.fresh();
    this._qw = value;
    this.owner?.touched();
  }
}

/** A node's turn as Euler angles. */
export class WatchedEuler extends Euler {
  declare private _ex: number;
  declare private _ey: number;
  declare private _ez: number;
  declare private _order: Euler['order'];
  declare owner: Mover | undefined;

  /** Angles telling `owner` of every write, all nought. */
  constructor(owner: Mover) {
    super();
    this.owner = owner;
  }

  /** Its angles stored as they are, telling nobody: the node keeping them in step with its quaternion. */
  store(x: number, y: number, z: number): void {
    this._ex = x;
    this._ey = y;
    this._ez = z;
  }

  /** its x */
  override get x(): number {
    this.owner?.fresh();
    return this._ex;
  }
  override set x(value: number) {
    this.owner?.fresh();
    this._ex = value;
    this.owner?.touched();
  }
  /** its y */
  override get y(): number {
    this.owner?.fresh();
    return this._ey;
  }
  override set y(value: number) {
    this.owner?.fresh();
    this._ey = value;
    this.owner?.touched();
  }
  /** its z */
  override get z(): number {
    this.owner?.fresh();
    return this._ez;
  }
  override set z(value: number) {
    this.owner?.fresh();
    this._ez = value;
    this.owner?.touched();
  }
  /** the order its turns are made in */
  override get order(): Euler['order'] {
    return this._order;
  }
  override set order(value: Euler['order']) {
    this.owner?.fresh();
    this._order = value;
    this.owner?.touched();
  }
}
