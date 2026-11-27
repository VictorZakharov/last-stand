// Earcut's holes (`earcut.ts`): each joined to the outline by a bridge from its leftmost point to a point of the
// outline it can see, leftmost holes first, so the whole is one ring. After Mapbox's earcut 3.0.2 (ISC).
import { EarNode, area, equals, locallyInside, pointInTriangle, splitPolygon } from './earcutNodes.ts';
import { filterPoints, linkedList } from './earcut.ts';

/** The ring's leftmost node (lowest of those). */
function leftmost(start: EarNode): EarNode {
  let p = start;
  let most = start;
  do {
    if (p.x < most.x || (p.x === most.x && p.y < most.y)) most = p;
    p = p.next;
  } while (p !== start);
  return most;
}

/** Orders holes by their leftmost point: x, then y, then the slope to the next point. */
function compareXYSlope(a: EarNode, b: EarNode): number {
  let result = a.x - b.x;
  if (result !== 0) return result;
  result = a.y - b.y;
  if (result !== 0) return result;
  const aSlope = (a.next.y - a.y) / (a.next.x - a.x);
  const bSlope = (b.next.y - b.y) / (b.next.x - b.x);
  return aSlope - bSlope;
}

/** Whether m's corner holds p's (both turning in). */
function sectorContainsSector(m: EarNode, p: EarNode): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

/** The outline's point a bridge from `hole` (its leftmost point) goes to: the nearest it sees to its left. */
function findHoleBridge(hole: EarNode, outer: EarNode): EarNode | null {
  let p = outer;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m: EarNode | null = null;
  if (equals(hole, p)) return p;
  do {
    if (equals(hole, p.next)) return p.next;
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outer);
  if (!m) return null;
  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    const ahead = hx >= p.x && p.x >= mx && hx !== p.x;
    if (ahead && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      const better = tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p))));
      if (locallyInside(p, hole) && better) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}

/** Joins `hole` into the outline by a bridge; gives back the outline's ring. */
function eliminateHole(hole: EarNode, outer: EarNode): EarNode {
  const bridge = findHoleBridge(hole, outer);
  if (!bridge) return outer;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
}

/** Joins every hole (starting at the points `holeIndices` name in `data`) into the outline `outer`. */
export function eliminateHoles(data: readonly number[], holeIndices: readonly number[], outer: EarNode): EarNode {
  const queue: EarNode[] = [];
  for (let i = 0; i < holeIndices.length; i++) {
    const start = holeIndices[i] * 2;
    const end = i < holeIndices.length - 1 ? holeIndices[i + 1] * 2 : data.length;
    const list = linkedList(data, start, end, false);
    if (!list) continue;
    if (list === list.next) list.steiner = true;
    queue.push(leftmost(list));
  }
  queue.sort(compareXYSlope);
  let ring = outer;
  for (const hole of queue) ring = eliminateHole(hole, ring);
  return ring;
}
