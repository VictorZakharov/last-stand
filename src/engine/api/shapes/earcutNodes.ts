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
  const point = new EarNode(i, x, y);
  if (!last) return point;
  point.next = last.next;
  point.prev = last;
  last.next.prev = point;
  last.next = point;
  return point;
}

/** Takes `point` out of its ring and its z-order. */
export function removeNode(point: EarNode): void {
  point.next.prev = point.prev;
  point.prev.next = point.next;
  if (point.prevZ) point.prevZ.nextZ = point.nextZ;
  if (point.nextZ) point.nextZ.prevZ = point.prevZ;
}

/** Twice the signed area of the triangle (point, middle, last): below 0 a left turn as earcut winds them. */
export function area(point: EarNode, middle: EarNode, last: EarNode): number {
  return (middle.y - point.y) * (last.x - middle.x) - (middle.x - point.x) * (last.y - middle.y);
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
function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** Whether `middle` lies in the box of the segment `point` to `last` (all three in line). */
function onSegment(point: EarNode, middle: EarNode, last: EarNode): boolean {
  return middle.x <= Math.max(point.x, last.x) && middle.x >= Math.min(point.x, last.x)
    && middle.y <= Math.max(point.y, last.y)
    && middle.y >= Math.min(point.y, last.y);
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

/** Whether a diagonal from nodeA to nodeB starts inside the ring at nodeA. */
export function locallyInside(nodeA: EarNode, nodeB: EarNode): boolean {
  if (area(nodeA.prev, nodeA, nodeA.next) < 0) {
    return area(nodeA, nodeB, nodeA.next) >= 0 && area(nodeA, nodeA.prev, nodeB) >= 0;
  }
  return area(nodeA, nodeB, nodeA.prev) < 0 || area(nodeA, nodeA.next, nodeB) < 0;
}

/** Whether the middle of nodeA to nodeB is inside the ring (by the crossings of a line from it). */
export function middleInside(nodeA: EarNode, nodeB: EarNode): boolean {
  let point = nodeA;
  let inside = false;
  const px = (nodeA.x + nodeB.x) / 2;
  const py = (nodeA.y + nodeB.y) / 2;
  do {
    const crosses = (point.y > py) !== (point.next.y > py) && point.next.y !== point.y;
    const left = crosses && px < (point.next.x - point.x) * (py - point.y) / (point.next.y - point.y) + point.x;
    if (left) inside = !inside;
    point = point.next;
  } while (point !== nodeA);
  return inside;
}

/** Splits the ring along nodeA to nodeB into two, each with copies of both; gives back nodeB's copy. */
export function splitPolygon(nodeA: EarNode, nodeB: EarNode): EarNode {
  const a2 = new EarNode(nodeA.i, nodeA.x, nodeA.y);
  const b2 = new EarNode(nodeB.i, nodeB.x, nodeB.y);
  const an = nodeA.next;
  const bp = nodeB.prev;
  nodeA.next = nodeB;
  nodeB.prev = nodeA;
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
