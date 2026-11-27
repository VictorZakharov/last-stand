// A curve: a point for each t from 0 to 1 (`getPoint`), the same curve by its length (`getPointAt`, t mapped from
// a share of its arc length), its tangents, and the frames a tube is swept by. Three's `Curve`, generic over the
// point it gives (a `Vec2` flat, a `Vec3` in space).
import { Mat4, Maths, Vec3 } from '../math/index.ts';

/** What a curve's points can do: a `Vec2` or a `Vec3`. */
export interface CurvePoint<T> {
  /** how far to `v` */
  distanceTo(v: T): number;
  /** takes `v`'s numbers */
  copy(v: T): this;
  /** takes `v` away */
  sub(v: T): this;
  /** made unit length */
  normalize(): this;
  /** the same numbers as `v` */
  equals(v: T): boolean;
}

/** The frames a tube is swept by, one a segment's end: the curve's way, and two ways square to it and each other. */
export interface FrenetFrames {
  /** the way the curve goes */
  tangents: Vec3[];
  /** a way square to it */
  normals: Vec3[];
  /** the way square to both */
  binormals: Vec3[];
}

const scratchMatrix = new Mat4();

/** A curve from t = 0 to t = 1, its points `T`s. */
export abstract class Curve<T extends CurvePoint<T>> {
  /** how many steps its length is measured over */
  arcLengthDivisions = 200;
  /** set when its points changed: its length is measured again */
  needsUpdate = false;
  private lengths: number[] | null = null;

  /** The point at `t` (0 to 1), into `target` if given. */
  abstract getPoint(along: number, target?: T): T;

  /** A new point of its kind, at the origin. */
  protected abstract blank(): T;

  /** How many points `getPoints` asks of it for an outline's `divisions` (`Path`): a line one, most `divisions`. */
  resolution(divisions: number): number {
    return divisions;
  }

  /** The point a share `u` of its length along. */
  getPointAt(u: number, target?: T): T {
    return this.getPoint(this.getUtoTmapping(u), target);
  }

  /** `divisions + 1` points evenly in t. */
  getPoints(divisions = 5): T[] {
    const points: T[] = [];
    for (let step = 0; step <= divisions; step++) points.push(this.getPoint(step / divisions));
    return points;
  }

  /** `divisions + 1` points evenly along its length. */
  getSpacedPoints(divisions = 5): T[] {
    const points: T[] = [];
    for (let step = 0; step <= divisions; step++) points.push(this.getPointAt(step / divisions));
    return points;
  }

  /** Its length, measured over `arcLengthDivisions` straight steps. */
  getLength(): number {
    const lengths = this.getLengths();
    return lengths[lengths.length - 1];
  }

  /** The length to each of `divisions + 1` points evenly in t (kept while nothing changed). */
  getLengths(divisions = this.arcLengthDivisions): number[] {
    const kept = this.lengths;
    if (kept && kept.length === divisions + 1 && !this.needsUpdate) return kept;
    this.needsUpdate = false;
    const lengths = [0];
    let last = this.getPoint(0);
    let sum = 0;
    for (let step = 1; step <= divisions; step++) {
      const current = this.getPoint(step / divisions);
      sum += current.distanceTo(last);
      lengths.push(sum);
      last = current;
    }
    this.lengths = lengths;
    return lengths;
  }

  /** Measures its length again (its points changed). */
  updateArcLengths(): void {
    this.needsUpdate = true;
    this.getLengths();
  }

  /**
   * The t a share `u` of its length along (or `distance` along, if given), between the measured steps by a
   * straight line. Follows three's `Curve.getUtoTmapping` (three.js, MIT, 0.187.0): the same search.
   */
  getUtoTmapping(u: number, distance: number | null = null): number {
    const lengths = this.getLengths();
    const last = lengths.length - 1;
    const target = distance ? distance : u * lengths[last];
    let low = 0;
    let high = last;
    while (low <= high) {
      const i = Math.floor(low + (high - low) / 2);
      const comparison = lengths[i] - target;
      if (comparison < 0) {
        low = i + 1;
      } else if (comparison > 0) {
        high = i - 1;
      } else {
        high = i;
        break;
      }
    }
    if (lengths[high] === target) return high / last;
    const before = lengths[high];
    const share = (target - before) / (lengths[high + 1] - before);
    return (high + share) / last;
  }

  /** Its unit way at `t`, by two points 0.0001 to either side. */
  getTangent(along: number, target?: T): T {
    const pt1 = this.getPoint(Math.max(0, along - 0.0001));
    const pt2 = this.getPoint(Math.min(1, along + 0.0001));
    return (target ?? this.blank()).copy(pt2).sub(pt1).normalize();
  }

  /** Its unit way a share `u` of its length along. */
  getTangentAt(u: number, target?: T): T {
    return this.getTangent(this.getUtoTmapping(u), target);
  }

  /**
   * The frames at `segments + 1` points evenly along its length: each tangent, and a normal carried from the
   * first by the least turn (closed, its twist spread over the way round so it meets itself). Follows three's
   * `Curve.computeFrenetFrames` (three.js, MIT, 0.187.0).
   */
  computeFrenetFrames(this: Curve<Vec3>, segments: number, closed = false): FrenetFrames {
    const tangents: Vec3[] = [];
    for (let i = 0; i <= segments; i++) tangents.push(this.getTangentAt(i / segments, new Vec3()));
    const normals = [new Vec3()];
    const binormals = [new Vec3()];
    const first = tangents[0];
    const normal = leastAxis(first);
    const vec = new Vec3().crossVectors(first, normal).normalize();
    normals[0].crossVectors(first, vec);
    binormals[0].crossVectors(first, normals[0]);
    for (let i = 1; i <= segments; i++) {
      normals.push(normals[i - 1].clone());
      binormals.push(binormals[i - 1].clone());
      vec.crossVectors(tangents[i - 1], tangents[i]);
      if (vec.length() > Number.EPSILON) {
        vec.normalize();
        const theta = Math.acos(Maths.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normals[i].applyMatrix4(scratchMatrix.makeRotationAxis(vec, theta));
      }
      binormals[i].crossVectors(tangents[i], normals[i]);
    }
    if (closed) {
      let theta = Math.acos(Maths.clamp(normals[0].dot(normals[segments]), -1, 1)) / segments;
      if (first.dot(vec.crossVectors(normals[0], normals[segments])) > 0) theta = -theta;
      for (let i = 1; i <= segments; i++) {
        normals[i].applyMatrix4(scratchMatrix.makeRotationAxis(tangents[i], theta * i));
        binormals[i].crossVectors(tangents[i], normals[i]);
      }
    }
    return { tangents, normals, binormals };
  }
}

/** The axis `tangent` leans along least (z before y before x where they tie). */
function leastAxis(tangent: Vec3): Vec3 {
  const normal = new Vec3();
  let min = Number.MAX_VALUE;
  const tx = Math.abs(tangent.x);
  const ty = Math.abs(tangent.y);
  const tz = Math.abs(tangent.z);
  if (tx <= min) {
    min = tx;
    normal.set(1, 0, 0);
  }
  if (ty <= min) {
    min = ty;
    normal.set(0, 1, 0);
  }
  if (tz <= min) normal.set(0, 0, 1);
  return normal;
}
