// Earcut's holes (`earcut.ts`): each joined to the outline by a bridge from its leftmost point to a point of the
// outline it can see, leftmost holes first, so the whole is one ring. After Mapbox's earcut 3.0.2 (ISC).
import { EarNode, area, equals, locallyInside, pointInTriangle, splitPolygon } from './earcutNodes.ts';
import { filterPoints, linkedList } from './earcut.ts';

/** The ring's leftmost node (lowest of those). */
function leftmost(start: EarNode): EarNode {
  let node = start;
  let most = start;
  do {
    if (node.x < most.x || (node.x === most.x && node.y < most.y)) most = node;
    node = node.next;
  } while (node !== start);
  return most;
}

/** Orders holes by their leftmost point: x, then y, then the slope to the next point. */
function compareXYSlope(nodeA: EarNode, nodeB: EarNode): number {
  let result = nodeA.x - nodeB.x;
  if (result !== 0) return result;
  result = nodeA.y - nodeB.y;
  if (result !== 0) return result;
  const aSlope = (nodeA.next.y - nodeA.y) / (nodeA.next.x - nodeA.x);
  const bSlope = (nodeB.next.y - nodeB.y) / (nodeB.next.x - nodeB.x);
  return aSlope - bSlope;
}

/** Whether `bridge`'s corner holds `node`'s (both turning in). */
function sectorContainsSector(bridge: EarNode, node: EarNode): boolean {
  return area(bridge.prev, bridge, node.prev) < 0 && area(node.next, bridge, bridge.next) < 0;
}

/** The outline's point a bridge from `hole` (its leftmost point) goes to: the nearest it sees to its left. */
function findHoleBridge(hole: EarNode, outer: EarNode): EarNode | null {
  let node = outer;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let bridge: EarNode | null = null;
  if (equals(hole, node)) return node;
  do {
    if (equals(hole, node.next)) return node.next;
    if (hy <= node.y && hy >= node.next.y && node.next.y !== node.y) {
      const x = node.x + (hy - node.y) * (node.next.x - node.x) / (node.next.y - node.y);
      if (x <= hx && x > qx) {
        qx = x;
        bridge = node.x < node.next.x ? node : node.next;
        if (x === hx) return bridge;
      }
    }
    node = node.next;
  } while (node !== outer);
  if (!bridge) return null;
  const stop = bridge;
  const mx = bridge.x;
  const my = bridge.y;
  let tanMin = Infinity;
  node = bridge;
  do {
    const ahead = hx >= node.x && node.x >= mx && hx !== node.x;
    if (ahead && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, node.x, node.y)) {
      const tan = Math.abs(hy - node.y) / (hx - node.x);
      const further = node.x > bridge.x || (node.x === bridge.x && sectorContainsSector(bridge, node));
      const better = tan < tanMin || (tan === tanMin && further);
      if (locallyInside(node, hole) && better) {
        bridge = node;
        tanMin = tan;
      }
    }
    node = node.next;
  } while (node !== stop);
  return bridge;
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
