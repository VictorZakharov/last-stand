// The curves the game draws along: in space a Catmull-Rom spline through points, a line, Bézier curves of two and
// three control points; flat the same lines and Béziers (an outline's pieces) and an ellipse's arc.
import { Vec2, Vec3 } from '../math/index.ts';
import { Curve } from './curve.ts';

/** A quadratic Bézier's value at `t` of `p0, p1, p2`. */
function quadratic(t: number, p0: number, p1: number, p2: number): number {
  const k = 1 - t;
  return k * k * p0 + 2 * k * t * p1 + t * t * p2;
}

/** A cubic Bézier's value at `t` of `p0` to `p3`. */
function cubic(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const k = 1 - t;
  return k * k * k * p0 + 3 * k * k * t * p1 + 3 * k * t * t * p2 + t * t * t * p3;
}

/** The kinds of Catmull-Rom spline: by the distances between points to the power 0.25, 0.5, or evenly. */
export type CatmullRomKind = 'centripetal' | 'chordal' | 'catmullrom';

/** One axis of a Catmull-Rom segment: the cubic from p1 to p2, its tangents set by p0 and p3. */
class Cubic {
  private c0 = 0;
  private c1 = 0;
  private c2 = 0;
  private c3 = 0;

  /** Even, the tangents `tension` times the gaps. */
  even(x0: number, x1: number, x2: number, x3: number, tension: number): void {
    this.init(x1, x2, tension * (x2 - x0), tension * (x3 - x1));
  }

  /** Uneven, by the three spans' lengths `dt0` to `dt2`. */
  uneven(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number): void {
    const t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
    const t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
    this.init(x1, x2, t1 * dt1, t2 * dt1);
  }

  /** Its value at `t` of the segment. */
  at(t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return this.c0 + this.c1 * t + this.c2 * t2 + this.c3 * t3;
  }

  private init(x0: number, x1: number, t0: number, t1: number): void {
    this.c0 = x0;
    this.c1 = t0;
    this.c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1;
    this.c3 = 2 * x0 - 2 * x1 + t0 + t1;
  }
}

const _px = new Cubic();
const _py = new Cubic();
const _pz = new Cubic();
const _before = new Vec3();
const _after = new Vec3();

/**
 * A Catmull-Rom spline through `points` (three's `CatmullRomCurve3`), round to its first if `closed`. Follows
 * three's (three.js, MIT, 0.187.0), its uneven form after the one without cusps of Yuksel et al.
 */
export class CatmullRom3 extends Curve<Vec3> {
  /** the points it goes through */
  points: Vec3[];
  /** whether it goes round from the last back to the first */
  closed: boolean;
  /** how its tangents are spaced */
  curveType: CatmullRomKind;
  /** the even kind's tangents' scale */
  tension: number;

  /** A spline through `points`. */
  constructor(points: Vec3[] = [], closed = false, curveType: CatmullRomKind = 'centripetal', tension = 0.5) {
    super();
    this.points = points;
    this.closed = closed;
    this.curveType = curveType;
    this.tension = tension;
  }

  /** The point at `t`. */
  getPoint(t: number, target = new Vec3()): Vec3 {
    const points = this.points;
    const l = points.length;
    const p = (l - (this.closed ? 0 : 1)) * t;
    let whole = Math.floor(p);
    let weight = p - whole;
    if (this.closed) {
      whole += whole > 0 ? 0 : (Math.floor(Math.abs(whole) / l) + 1) * l;
    } else if (weight === 0 && whole === l - 1) {
      whole = l - 2;
      weight = 1;
    }
    const p0 = this.closed || whole > 0
      ? points[(whole - 1) % l]
      : _before.subVectors(points[0], points[1]).add(points[0]);
    const p1 = points[whole % l];
    const p2 = points[(whole + 1) % l];
    const p3 = this.closed || whole + 2 < l
      ? points[(whole + 2) % l]
      : _after.subVectors(points[l - 1], points[l - 2]).add(points[l - 1]);
    if (this.curveType === 'catmullrom') {
      _px.even(p0.x, p1.x, p2.x, p3.x, this.tension);
      _py.even(p0.y, p1.y, p2.y, p3.y, this.tension);
      _pz.even(p0.z, p1.z, p2.z, p3.z, this.tension);
    } else {
      const pow = this.curveType === 'chordal' ? 0.5 : 0.25;
      let dt0 = Math.pow(p0.distanceToSquared(p1), pow);
      let dt1 = Math.pow(p1.distanceToSquared(p2), pow);
      let dt2 = Math.pow(p2.distanceToSquared(p3), pow);
      if (dt1 < 1e-4) dt1 = 1;
      if (dt0 < 1e-4) dt0 = dt1;
      if (dt2 < 1e-4) dt2 = dt1;
      _px.uneven(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2);
      _py.uneven(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2);
      _pz.uneven(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2);
    }
    return target.set(_px.at(weight), _py.at(weight), _pz.at(weight));
  }

  protected blank(): Vec3 {
    return new Vec3();
  }
}

/** A straight line from `v1` to `v2` in space (three's `LineCurve3`): its t is its length's share. */
export class Line3Curve extends Curve<Vec3> {
  /** where it starts */
  v1: Vec3;
  /** where it ends */
  v2: Vec3;

  /** A line from `v1` to `v2`. */
  constructor(v1 = new Vec3(), v2 = new Vec3()) {
    super();
    this.v1 = v1;
    this.v2 = v2;
  }

  /** The point at `t`. */
  getPoint(t: number, target = new Vec3()): Vec3 {
    if (t === 1) return target.copy(this.v2);
    return target.copy(this.v2).sub(this.v1).multiplyScalar(t).add(this.v1);
  }

  /** The point a share `u` along (the same as at t = u). */
  override getPointAt(u: number, target?: Vec3): Vec3 {
    return this.getPoint(u, target);
  }

  /** Its way, the same everywhere. */
  override getTangent(_t: number, target = new Vec3()): Vec3 {
    return target.subVectors(this.v2, this.v1).normalize();
  }

  /** Its way, the same everywhere. */
  override getTangentAt(u: number, target?: Vec3): Vec3 {
    return this.getTangent(u, target);
  }

  override resolution(): number {
    return 1;
  }

  protected blank(): Vec3 {
    return new Vec3();
  }
}

/** A quadratic Bézier curve in space from `v0` to `v2`, drawn to `v1` (three's `QuadraticBezierCurve3`). */
export class Bezier2Curve3 extends Curve<Vec3> {
  /** where it starts */
  v0: Vec3;
  /** what it's drawn towards */
  v1: Vec3;
  /** where it ends */
  v2: Vec3;

  /** A curve from `v0` to `v2` drawn to `v1`. */
  constructor(v0 = new Vec3(), v1 = new Vec3(), v2 = new Vec3()) {
    super();
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
  }

  /** The point at `t`. */
  getPoint(t: number, target = new Vec3()): Vec3 {
    const { v0, v1, v2 } = this;
    return target.set(quadratic(t, v0.x, v1.x, v2.x), quadratic(t, v0.y, v1.y, v2.y), quadratic(t, v0.z, v1.z, v2.z));
  }

  protected blank(): Vec3 {
    return new Vec3();
  }
}

/** A cubic Bézier curve in space from `v0` to `v3`, drawn to `v1` and `v2` (three's `CubicBezierCurve3`). */
export class Bezier3Curve3 extends Curve<Vec3> {
  /** where it starts */
  v0: Vec3;
  /** what it leaves towards */
  v1: Vec3;
  /** what it comes in from */
  v2: Vec3;
  /** where it ends */
  v3: Vec3;

  /** A curve from `v0` to `v3` drawn to `v1` and `v2`. */
  constructor(v0 = new Vec3(), v1 = new Vec3(), v2 = new Vec3(), v3 = new Vec3()) {
    super();
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
    this.v3 = v3;
  }

  /** The point at `t`. */
  getPoint(t: number, target = new Vec3()): Vec3 {
    const { v0, v1, v2, v3 } = this;
    const x = cubic(t, v0.x, v1.x, v2.x, v3.x);
    const y = cubic(t, v0.y, v1.y, v2.y, v3.y);
    return target.set(x, y, cubic(t, v0.z, v1.z, v2.z, v3.z));
  }

  protected blank(): Vec3 {
    return new Vec3();
  }
}

/** A straight line from `v1` to `v2`, flat (three's `LineCurve`): an outline's `lineTo`. */
export class Line2Curve extends Curve<Vec2> {
  /** where it starts */
  v1: Vec2;
  /** where it ends */
  v2: Vec2;

  /** A line from `v1` to `v2`. */
  constructor(v1 = new Vec2(), v2 = new Vec2()) {
    super();
    this.v1 = v1;
    this.v2 = v2;
  }

  /** The point at `t`. */
  getPoint(t: number, target = new Vec2()): Vec2 {
    if (t === 1) return target.copy(this.v2);
    return target.copy(this.v2).sub(this.v1).multiplyScalar(t).add(this.v1);
  }

  /** The point a share `u` along (the same as at t = u). */
  override getPointAt(u: number, target?: Vec2): Vec2 {
    return this.getPoint(u, target);
  }

  /** Its way, the same everywhere. */
  override getTangent(_t: number, target = new Vec2()): Vec2 {
    return target.subVectors(this.v2, this.v1).normalize();
  }

  /** Its way, the same everywhere. */
  override getTangentAt(u: number, target?: Vec2): Vec2 {
    return this.getTangent(u, target);
  }

  override resolution(): number {
    return 1;
  }

  protected blank(): Vec2 {
    return new Vec2();
  }
}

/** A quadratic Bézier curve, flat (three's `QuadraticBezierCurve`): an outline's `quadraticCurveTo`. */
export class Bezier2Curve2 extends Curve<Vec2> {
  /** where it starts */
  v0: Vec2;
  /** what it's drawn towards */
  v1: Vec2;
  /** where it ends */
  v2: Vec2;

  /** A curve from `v0` to `v2` drawn to `v1`. */
  constructor(v0 = new Vec2(), v1 = new Vec2(), v2 = new Vec2()) {
    super();
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
  }

  /** The point at `t`. */
  getPoint(t: number, target = new Vec2()): Vec2 {
    const { v0, v1, v2 } = this;
    return target.set(quadratic(t, v0.x, v1.x, v2.x), quadratic(t, v0.y, v1.y, v2.y));
  }

  protected blank(): Vec2 {
    return new Vec2();
  }
}

/** A cubic Bézier curve, flat (three's `CubicBezierCurve`): an outline's `bezierCurveTo`. */
export class Bezier3Curve2 extends Curve<Vec2> {
  /** where it starts */
  v0: Vec2;
  /** what it leaves towards */
  v1: Vec2;
  /** what it comes in from */
  v2: Vec2;
  /** where it ends */
  v3: Vec2;

  /** A curve from `v0` to `v3` drawn to `v1` and `v2`. */
  constructor(v0 = new Vec2(), v1 = new Vec2(), v2 = new Vec2(), v3 = new Vec2()) {
    super();
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
    this.v3 = v3;
  }

  /** The point at `t`. */
  getPoint(t: number, target = new Vec2()): Vec2 {
    const { v0, v1, v2, v3 } = this;
    return target.set(cubic(t, v0.x, v1.x, v2.x, v3.x), cubic(t, v0.y, v1.y, v2.y, v3.y));
  }

  protected blank(): Vec2 {
    return new Vec2();
  }
}
