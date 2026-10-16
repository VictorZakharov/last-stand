// tools/lab swept areas (lab trail): what a measure of a swung weapon's trail needs that's plain arithmetic. The
// quads a weapon swept between two frames are cut to the camera's near plane before they're drawn on the screen: a
// weapon swung past beside the eyes has an end behind the camera, and a projection puts that on the far side of the
// screen. And the pixels one draw lit that another didn't: the trail's, the frame drawn with it and without.

/** A point in a camera's space (x right, y up, -z ahead). */
export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Where the line from `a` to `b` crosses the plane `near` ahead of the camera. */
function crossing(a: Point, b: Point, near: number): Point {
  const k = (-near - a.z) / (b.z - a.z);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: -near };
}

/** `polygon` (in a camera's space) cut to what lies at least `near` ahead of the camera (Sutherland and Hodgman's
 *  clipping, against the one plane): none of it if it's all behind. */
export function clipNear(polygon: readonly Point[], near: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const aAhead = -a.z >= near;
    const bAhead = -b.z >= near;
    if (aAhead) out.push(a);
    if (aAhead !== bAhead) out.push(crossing(a, b, near));
  }
  return out;
}

/** the least distance between two points of a curve counted: one place twice */
const EPS = 1e-4;

/** `a` and `b` weighed by how far `t` is from `ta` to `tb` (a step of Barry and Goldman's). */
function between(a: Point, b: Point, ta: number, tb: number, t: number): Point {
  const k = (t - ta) / (tb - ta);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * The point `u` of the way from `p1` to `p2` on the centripetal Catmull-Rom curve through `p0` to `p3`: where a
 * thing moved between two frames went, its places in the frames round them bending the way. (Joined by a straight
 * line, a blade swung round the eyes 80 degrees a frame was placed half a metre inside its arc.)
 */
export function curveAt(p0: Point, p1: Point, p2: Point, p3: Point, u: number): Point {
  const t1 = Math.sqrt(Math.max(EPS, distance(p0, p1)));
  const t2 = t1 + Math.sqrt(Math.max(EPS, distance(p1, p2)));
  const t3 = t2 + Math.sqrt(Math.max(EPS, distance(p2, p3)));
  const t = t1 + (t2 - t1) * u;
  const a1 = between(p0, p1, 0, t1, t);
  const a2 = between(p1, p2, t1, t2, t);
  const a3 = between(p2, p3, t2, t3, t);
  const b1 = between(a1, a2, 0, t2, t);
  const b2 = between(a2, a3, t1, t3, t);
  return between(b1, b2, t1, t2, t);
}

/** The distance from (`x`, `y`) to the segment from (`ax`, `ay`) to (`bx`, `by`). */
export function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const along = length > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return Math.hypot(x - (ax + dx * along), y - (ay + dy * along));
}

/** The pixels a draw lit that another of the same moment didn't. */
export interface Lit {
  /** each lit pixel's place in the drawing buffer (its rows from the bottom), row by row, and how much it rose (its
   *  brightest channel, as stored: 0 to 255) */
  pixels: number[];
  rises: number[];
  /** the most any of them rose */
  most: number;
}

/**
 * The pixels of `shown` (RGBA bytes) brighter than `plain`'s by `least` or more in some channel: what was drawn in
 * the one and not the other.
 */
export function litBetween(shown: Uint8Array, plain: Uint8Array, least: number): Lit {
  const pixels: number[] = [];
  const rises: number[] = [];
  let most = 0;
  for (let at = 0; at < shown.length; at += 4) {
    const rise = Math.max(shown[at] - plain[at], shown[at + 1] - plain[at + 1], shown[at + 2] - plain[at + 2]);
    if (rise < least) continue;
    pixels.push(at / 4);
    rises.push(rise);
    most = Math.max(most, rise);
  }
  return { pixels, rises, most };
}
