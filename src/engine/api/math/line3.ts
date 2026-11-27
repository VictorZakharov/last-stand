// A segment, as three's `Line3`: from `start` to `end`.
import { clamp } from './maths.ts';
import { Vec3 } from './vec3.ts';
import type { Mat4 } from './mat4.ts';

/** three's `Line3` */
export class Line3 {
  /** where it starts */
  start: Vec3;
  /** where it ends */
  end: Vec3;

  /** the segment between the two given, or of the origin alone */
  constructor(start = new Vec3(), end = new Vec3()) {
    this.start = start;
    this.end = end;
  }

  /** takes the two ends' numbers */
  set(start: Vec3, end: Vec3): this {
    this.start.copy(start);
    this.end.copy(end);
    return this;
  }

  /** a new segment with these ends */
  clone(): Line3 {
    return new Line3(this.start.clone(), this.end.clone());
  }

  /** takes `line`'s ends */
  copy(line: Line3): this {
    return this.set(line.start, line.end);
  }

  /** its middle, into `target` */
  getCenter(target: Vec3): Vec3 {
    return target.addVectors(this.start, this.end).multiplyScalar(0.5);
  }

  /** from start to end, into `target` */
  delta(target: Vec3): Vec3 {
    return target.subVectors(this.end, this.start);
  }

  /** its length, squared */
  distanceSq(): number {
    return this.start.distanceToSquared(this.end);
  }

  /** its length */
  distance(): number {
    return this.start.distanceTo(this.end);
  }

  /** the point `t` of the way from start to end (past them outside 0 to 1), into `target` */
  at(t: number, target: Vec3): Vec3 {
    return this.delta(target).multiplyScalar(t).add(this.start);
  }

  /**
   * How far along it (0 at start, 1 at end) the point nearest `point` is, kept to the segment when `clampToLine`.
   * 0 for a segment of no length (three's is NaN there).
   */
  closestPointToPointParameter(point: Vec3, clampToLine: boolean): number {
    fromStart.subVectors(point, this.start);
    this.delta(along);
    const lengthSq = along.dot(along);
    if (lengthSq === 0) return 0;
    const t = along.dot(fromStart) / lengthSq;
    return clampToLine ? clamp(t, 0, 1) : t;
  }

  /** the point of it (or of its line, unless `clampToLine`) nearest `point`, into `target` */
  closestPointToPoint(point: Vec3, clampToLine: boolean, target: Vec3): Vec3 {
    const t = this.closestPointToPointParameter(point, clampToLine);
    return this.at(t, target);
  }

  /** both ends placed by `matrix` */
  applyMatrix4(matrix: Mat4): this {
    this.start.applyMatrix4(matrix);
    this.end.applyMatrix4(matrix);
    return this;
  }

  /** whether `line` has the same ends */
  equals(line: Line3): boolean {
    return line.start.equals(this.start) && line.end.equals(this.end);
  }
}

/** `closestPointToPointParameter`'s point from the start and the segment's way */
const fromStart = new Vec3();
const along = new Vec3();
