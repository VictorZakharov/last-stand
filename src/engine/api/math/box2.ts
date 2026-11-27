// A box on a plane, its sides along the axes (three's `Box2`): a picture's region, a part's place on the screen.
import { Vec2 } from './vec2.ts';

/** A box on a plane by its least and its greatest corners; empty with the least past the greatest. */
export class Box2 {
  /** its least corner */
  readonly min: Vec2;
  /** its greatest corner */
  readonly max: Vec2;

  constructor(min = new Vec2(Infinity, Infinity), max = new Vec2(-Infinity, -Infinity)) {
    this.min = min;
    this.max = max;
  }

  /** what every 2D box says it is */
  get isBox2(): true { return true; }

  /** its corners `min` and `max` */
  set(min: Vec2, max: Vec2): this {
    this.min.copy(min);
    this.max.copy(max);
    return this;
  }

  /** the least box round `points` */
  setFromPoints(points: readonly Vec2[]): this {
    this.makeEmpty();
    for (const point of points) this.expandByPoint(point);
    return this;
  }

  /** A box of its own the same. */
  clone(): Box2 {
    return new Box2().copy(this);
  }

  /** made the same as `box` */
  copy(box: Box2): this {
    return this.set(box.min, box.max);
  }

  /** made empty: holding nothing, as anything grows it */
  makeEmpty(): this {
    this.min.set(Infinity, Infinity);
    this.max.set(-Infinity, -Infinity);
    return this;
  }

  /** whether it holds nothing */
  isEmpty(): boolean {
    return this.max.x < this.min.x || this.max.y < this.min.y;
  }

  /** its middle, into `target` (the origin where it's empty) */
  getCenter(target: Vec2): Vec2 {
    if (this.isEmpty()) return target.set(0, 0);
    return target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }

  /** how wide and high it is, into `target` (none where it's empty) */
  getSize(target: Vec2): Vec2 {
    if (this.isEmpty()) return target.set(0, 0);
    return target.subVectors(this.max, this.min);
  }

  /** grown to hold `point` */
  expandByPoint(point: Vec2): this {
    this.min.set(Math.min(this.min.x, point.x), Math.min(this.min.y, point.y));
    this.max.set(Math.max(this.max.x, point.x), Math.max(this.max.y, point.y));
    return this;
  }

  /** grown by `scalar` on every side */
  expandByScalar(scalar: number): this {
    this.min.set(this.min.x - scalar, this.min.y - scalar);
    this.max.set(this.max.x + scalar, this.max.y + scalar);
    return this;
  }

  /** whether `point` is in it or on its sides */
  containsPoint(point: Vec2): boolean {
    return point.x >= this.min.x && point.x <= this.max.x && point.y >= this.min.y && point.y <= this.max.y;
  }

  /** whether it and `box` share any of the plane */
  intersectsBox(box: Box2): boolean {
    return box.max.x >= this.min.x && box.min.x <= this.max.x && box.max.y >= this.min.y && box.min.y <= this.max.y;
  }

  /** made what it and `box` share (empty where they share nothing) */
  intersect(box: Box2): this {
    this.min.set(Math.max(this.min.x, box.min.x), Math.max(this.min.y, box.min.y));
    this.max.set(Math.min(this.max.x, box.max.x), Math.min(this.max.y, box.max.y));
    if (this.isEmpty()) this.makeEmpty();
    return this;
  }

  /** grown to hold `box` too */
  union(box: Box2): this {
    this.min.set(Math.min(this.min.x, box.min.x), Math.min(this.min.y, box.min.y));
    this.max.set(Math.max(this.max.x, box.max.x), Math.max(this.max.y, box.max.y));
    return this;
  }
}
