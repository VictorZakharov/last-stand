// Earcut's rings (`earcut.ts`): a polygon's points as nodes linked round, and the tests on them (a turn's sign,
// segments crossing, a point in a triangle, a diagonal inside). After Mapbox's earcut 3.0.2 (ISC).

/** A point of a ring: its index in the input, where it is, its neighbours round the ring and along the z-order. */
export class EarNode {
  /** its point's index in the input */
  readonly i: number;
  /** across */
  readonly x: number;
  /** up */
  readonly y: number;
  /** the point before it round the ring */
  prev: EarNode = this;
  /** the point after it */
  next: EarNode = this;
  /** its place along the z-order curve */
  z = 0;
  /** the point before it in z-order */
  prevZ: EarNode | null = null;
  /** the point after it in z-order */
  nextZ: EarNode | null = null;
  /** a hole of one point, never filtered out */
  steiner = false;

  /** The point `i` at (x, y), alone. */
  constructor(i: number, x: number, y: number) {
    this.i = i;
    this.x = x;
    this.y = y;
  }
}

/** Puts a new node for point `i` after `last` (alone if there's none) and gives it back. */
export function insertNode(i: number, x: number, y: number, last: EarNode | null): EarNode {
  const p = new EarNode(i, x, y);
  if (!last) return p;
  p.next = last.next;
  p.prev = last;
  last.next.prev = p;
  last.next = p;
  return p;
}

/** Takes `p` out of its ring and its z-order. */
export function removeNode(p: EarNode): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

/** Twice the signed area of the triangle (p, q, r): below 0 a left turn as earcut winds them. */
export function area(p: EarNode, q: EarNode, r: EarNode): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

/** Whether two nodes are at the same point. */
export function equals(p1: EarNode, p2: EarNode): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

/** Whether (px, py) is in the triangle (a, b, c), edges in. */
export function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
  px: number, py: number): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py)
    && (ax - px) * (by - py) >= (bx - px) * (ay - py)
    && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

/** -1, 0 or 1. */
function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Whether q lies in the box of the segment p to r (q in line with them). */
function onSegment(p: EarNode, q: EarNode, r: EarNode): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y)
    && q.y >= Math.min(p.y, r.y);
}

/** Whether the segments p1 to q1 and p2 to q2 cross or touch. */
export function intersects(p1: EarNode, q1: EarNode, p2: EarNode, q2: EarNode): boolean {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  return o4 === 0 && onSegment(p2, q1, q2);
}

/** Whether a diagonal from a to b starts inside the ring at a. */
export function locallyInside(a: EarNode, b: EarNode): boolean {
  if (area(a.prev, a, a.next) < 0) return area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0;
  return area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

/** Whether the middle of a to b is inside the ring (by the crossings of a line from it). */
export function middleInside(a: EarNode, b: EarNode): boolean {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    const crosses = (p.y > py) !== (p.next.y > py) && p.next.y !== p.y;
    if (crosses && px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}

/** Splits the ring along a to b into two, each with copies of a and b; gives back b's copy. */
export function splitPolygon(a: EarNode, b: EarNode): EarNode {
  const a2 = new EarNode(a.i, a.x, a.y);
  const b2 = new EarNode(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}

/** A point's place along the z-order curve: its coordinates in 15 bits each, interleaved. */
export function zOrder(px: number, py: number, minX: number, minY: number, invSize: number): number {
  let x = ((px - minX) * invSize) | 0;
  let y = ((py - minY) * invSize) | 0;
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  y = (y | (y << 8)) & 0x00ff00ff;
  y = (y | (y << 4)) & 0x0f0f0f0f;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;
  return x | (y << 1);
}
