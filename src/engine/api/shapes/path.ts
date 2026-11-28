// Flat outlines drawn as a pen would (three's `Path` and `Shape`): `moveTo`, `lineTo`, Bézier curves and arcs,
// each a curve of its own end to end; an outline has holes. Read as points (`getPoints`, `extractPoints`) for the
// flat and extruded shapes, and the ellipse's arc they're drawn with.
import { Vec2 } from '../math/index.ts';
import { Curve } from './curve.ts';
import { Bezier2Curve2, Bezier3Curve2, Line2Curve } from './curves.ts';

/**
 * An ellipse's arc round (aX, aY) from one angle to another (three's `EllipseCurve`), turned by `aRotation`.
 * Follows three's (three.js, MIT, 0.187.0): the same reading of the angles' span, clockwise or not.
 */
export class Ellipse extends Curve<Vec2> {
  /** its middle's x */
  aX: number;
  /** its middle's y */
  aY: number;
  /** its radius along x */
  xRadius: number;
  /** its radius along y */
  yRadius: number;
  /** where the arc starts, radians from +x */
  aStartAngle: number;
  /** where it ends */
  aEndAngle: number;
  /** whether it goes clockwise from start to end */
  aClockwise: boolean;
  /** its turn about its middle */
  aRotation: number;

  /** An arc round (aX, aY). */
  constructor(aX = 0, aY = 0, xRadius = 1, yRadius = 1, aStartAngle = 0, aEndAngle = Math.PI * 2,
    aClockwise = false, aRotation = 0) {
    super();
    this.aX = aX;
    this.aY = aY;
    this.xRadius = xRadius;
    this.yRadius = yRadius;
    this.aStartAngle = aStartAngle;
    this.aEndAngle = aEndAngle;
    this.aClockwise = aClockwise;
    this.aRotation = aRotation;
  }

  /** The point at `t`. */
  getPoint(along: number, target = new Vec2()): Vec2 {
    const twoPi = Math.PI * 2;
    let delta = this.aEndAngle - this.aStartAngle;
    const samePoints = Math.abs(delta) < Number.EPSILON;
    while (delta < 0) delta += twoPi;
    while (delta > twoPi) delta -= twoPi;
    if (delta < Number.EPSILON) delta = samePoints ? 0 : twoPi;
    if (this.aClockwise && !samePoints) delta = delta === twoPi ? -twoPi : delta - twoPi;
    const angle = this.aStartAngle + along * delta;
    let x = this.aX + this.xRadius * Math.cos(angle);
    let y = this.aY + this.yRadius * Math.sin(angle);
    if (this.aRotation !== 0) {
      const cos = Math.cos(this.aRotation);
      const sin = Math.sin(this.aRotation);
      const tx = x - this.aX;
      const ty = y - this.aY;
      x = tx * cos - ty * sin + this.aX;
      y = tx * sin + ty * cos + this.aY;
    }
    return target.set(x, y);
  }

  /** Twice an outline's divisions: an arc is drawn finer than a curve. */
  override resolution(divisions: number): number {
    return divisions * 2;
  }

  protected blank(): Vec2 {
    return new Vec2();
  }
}

/**
 * A flat path of curves end to end (three's `Path` over its `CurvePath`), drawn as a pen: each piece starts where
 * the last ended. Read by its length (`getPoint`) or piece by piece (`getPoints`).
 */
export class Path extends Curve<Vec2> {
  /** its pieces in turn */
  curves: Curve<Vec2>[] = [];
  /** whether its points end with its first again */
  autoClose = false;
  /** where the pen is */
  readonly currentPoint = new Vec2();
  private pieceLengths: number[] | null = null;

  /** A path through `points` by straight lines, if given. */
  constructor(points?: readonly Vec2[]) {
    super();
    if (points) this.setFromPoints(points);
  }

  /** Adds a piece. */
  add(curve: Curve<Vec2>): void {
    this.curves.push(curve);
  }

  /** Lines from the first of `points` through the rest. */
  setFromPoints(points: readonly Vec2[]): this {
    this.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.lineTo(points[i].x, points[i].y);
    return this;
  }

  /** Lifts the pen to (x, y). */
  moveTo(x: number, y: number): this {
    this.currentPoint.set(x, y);
    return this;
  }

  /** A line to (x, y). */
  lineTo(x: number, y: number): this {
    this.curves.push(new Line2Curve(this.currentPoint.clone(), new Vec2(x, y)));
    this.currentPoint.set(x, y);
    return this;
  }

  /** A quadratic Bézier curve to (aX, aY), drawn to (aCPx, aCPy). */
  quadraticCurveTo(aCPx: number, aCPy: number, aX: number, aY: number): this {
    this.curves.push(new Bezier2Curve2(this.currentPoint.clone(), new Vec2(aCPx, aCPy), new Vec2(aX, aY)));
    this.currentPoint.set(aX, aY);
    return this;
  }

  /** A cubic Bézier curve to (aX, aY), drawn to the two control points. */
  bezierCurveTo(aCP1x: number, aCP1y: number, aCP2x: number, aCP2y: number, aX: number, aY: number): this {
    const from = this.currentPoint.clone();
    this.curves.push(new Bezier3Curve2(from, new Vec2(aCP1x, aCP1y), new Vec2(aCP2x, aCP2y), new Vec2(aX, aY)));
    this.currentPoint.set(aX, aY);
    return this;
  }

  /** A circle's arc round (aX, aY) from the pen. */
  arc(aX: number, aY: number, aRadius: number, aStartAngle: number, aEndAngle: number, aClockwise = false): this {
    const { x, y } = this.currentPoint;
    return this.absarc(aX + x, aY + y, aRadius, aStartAngle, aEndAngle, aClockwise);
  }

  /** A circle's arc round (aX, aY). */
  absarc(aX: number, aY: number, aRadius: number, aStartAngle: number, aEndAngle: number, aClockwise = false): this {
    return this.absellipse(aX, aY, aRadius, aRadius, aStartAngle, aEndAngle, aClockwise);
  }

  /** An ellipse's arc round (aX, aY) from the pen. */
  ellipse(aX: number, aY: number, xRadius: number, yRadius: number, aStartAngle: number, aEndAngle: number,
    aClockwise = false, aRotation = 0): this {
    const { x, y } = this.currentPoint;
    return this.absellipse(aX + x, aY + y, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation);
  }

  /** An ellipse's arc round (aX, aY), a line drawn to its start first if the pen is elsewhere. */
  absellipse(aX: number, aY: number, xRadius: number, yRadius: number, aStartAngle: number, aEndAngle: number,
    aClockwise = false, aRotation = 0): this {
    const curve = new Ellipse(aX, aY, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation);
    if (this.curves.length > 0) {
      const first = curve.getPoint(0);
      if (!first.equals(this.currentPoint)) this.lineTo(first.x, first.y);
    }
    this.curves.push(curve);
    this.currentPoint.copy(curve.getPoint(1));
    return this;
  }

  /** A line back to its start, if it doesn't end there. */
  closePath(): this {
    const start = this.curves[0].getPoint(0);
    const end = this.curves[this.curves.length - 1].getPoint(1);
    if (!start.equals(end)) this.curves.push(new Line2Curve(end, start));
    return this;
  }

  /** The point a share `t` of its length along (its pieces' lengths added). */
  getPoint(along: number, target?: Vec2): Vec2 {
    const distance = along * this.getLength();
    const lengths = this.getCurveLengths();
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] < distance) continue;
      const curve = this.curves[i];
      const length = curve.getLength();
      const u = length === 0 ? 0 : 1 - (lengths[i] - distance) / length;
      return curve.getPointAt(u, target);
    }
    return this.curves[this.curves.length - 1].getPointAt(1, target);
  }

  /** Its length: its pieces' added. */
  override getLength(): number {
    const lengths = this.getCurveLengths();
    return lengths[lengths.length - 1];
  }

  /** Measures its pieces again. */
  override updateArcLengths(): void {
    this.needsUpdate = true;
    this.pieceLengths = null;
    this.getCurveLengths();
  }

  /** The length to each piece's end. */
  getCurveLengths(): number[] {
    if (this.pieceLengths && this.pieceLengths.length === this.curves.length) return this.pieceLengths;
    const lengths: number[] = [];
    let sum = 0;
    for (const curve of this.curves) {
      sum += curve.getLength();
      lengths.push(sum);
    }
    this.pieceLengths = lengths;
    return lengths;
  }

  /** `divisions + 1` points evenly along its length (and its first again, closing itself). */
  override getSpacedPoints(divisions = 40): Vec2[] {
    const points: Vec2[] = [];
    for (let i = 0; i <= divisions; i++) points.push(this.getPoint(i / divisions));
    if (this.autoClose) points.push(points[0]);
    return points;
  }

  /** Each piece's points (a line its ends, an arc twice `divisions`), none twice running. */
  override getPoints(divisions = 12): Vec2[] {
    const points: Vec2[] = [];
    let last: Vec2 | undefined;
    for (const curve of this.curves) {
      for (const point of curve.getPoints(curve.resolution(divisions))) {
        if (last && last.equals(point)) continue;
        points.push(point);
        last = point;
      }
    }
    const closes = this.autoClose && points.length > 1;
    if (closes && !points[points.length - 1].equals(points[0])) points.push(points[0]);
    return points;
  }

  protected blank(): Vec2 {
    return new Vec2();
  }
}

/** An outline's points and its holes' (`Outline.extractPoints`). */
export interface OutlinePoints {
  /** the outline's own */
  shape: Vec2[];
  /** each hole's */
  holes: Vec2[][];
}

/** A flat outline with holes (three's `Shape`): what `flat` fills and `extrude` stands up. */
export class Outline extends Path {
  /** the paths cut out of it */
  holes: Path[] = [];

  /** Its points and its holes', each piece at `divisions`. */
  extractPoints(divisions: number): OutlinePoints {
    return { shape: this.getPoints(divisions), holes: this.holes.map((hole) => hole.getPoints(divisions)) };
  }
}
