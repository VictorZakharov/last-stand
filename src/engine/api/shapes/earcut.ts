// Ear clipping of a polygon with holes into triangles, after Mapbox's earcut 3.0.2 (ISC, the version three 0.187
// vendors): the outline and its holes as rings of nodes, each hole bridged into the outline, then ears cut off one
// by one, past 80 points found through a z-order curve. The same steps as earcut's, so the same triangles.
import { EarNode, area, equals, insertNode, intersects, locallyInside, middleInside } from './earcutNodes.ts';
import { pointInTriangle, removeNode, splitPolygon, zOrder } from './earcutNodes.ts';
import { eliminateHoles } from './earcutHoles.ts';

/** Twice the signed area of the ring of points `start` to `end` in `data` (x, y pairs). */
export function signedArea(data: readonly number[], start: number, end: number): number {
  let sum = 0;
  for (let i = start, j = end - 2; i < end; i += 2) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}

/** A ring of nodes over the points `start` to `end` of `data`, wound as `clockwise` says. */
export function linkedList(data: readonly number[], start: number, end: number, clockwise: boolean): EarNode | null {
  let last: EarNode | null = null;
  if (clockwise === signedArea(data, start, end) > 0) {
    for (let i = start; i < end; i += 2) last = insertNode(i / 2, data[i], data[i + 1], last);
  } else {
    for (let i = end - 2; i >= start; i -= 2) last = insertNode(i / 2, data[i], data[i + 1], last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}

/** The ring from `start` with repeated points and straight runs taken out (up to `end`). */
export function filterPoints(start: EarNode, end: EarNode = start): EarNode {
  let node = start;
  let stop = end;
  let again: boolean;
  do {
    again = false;
    if (!node.steiner && (equals(node, node.next) || area(node.prev, node, node.next) === 0)) {
      removeNode(node);
      node = stop = node.prev;
      if (node === node.next) break;
      again = true;
    } else {
      node = node.next;
    }
  } while (again || node !== stop);
  return stop;
}

/** The z-order frame: where its corner is and how it's scaled; none under 80 points. */
interface Hash {
  minX: number;
  minY: number;
  invSize: number;
}

/** Whether the triangle (ear.prev, ear, ear.next) is an ear: convex, no other point of the ring in it. */
function isEar(ear: EarNode): boolean {
  const nodeA = ear.prev;
  const nodeC = ear.next;
  if (area(nodeA, ear, nodeC) >= 0) return false;
  const x0 = Math.min(nodeA.x, ear.x, nodeC.x);
  const y0 = Math.min(nodeA.y, ear.y, nodeC.y);
  const x1 = Math.max(nodeA.x, ear.x, nodeC.x);
  const y1 = Math.max(nodeA.y, ear.y, nodeC.y);
  for (let node = nodeC.next; node !== nodeA; node = node.next) {
    const inBox = node.x >= x0 && node.x <= x1 && node.y >= y0 && node.y <= y1;
    if (inBox && inEarExceptFirst(nodeA, ear, nodeC, node) && area(node.prev, node, node.next) >= 0) return false;
  }
  return true;
}

/** Whether `node` is in the triangle (nodeA, nodeB, nodeC), not at its first corner. */
function inEarExceptFirst(nodeA: EarNode, nodeB: EarNode, nodeC: EarNode, node: EarNode): boolean {
  if (nodeA.x === node.x && nodeA.y === node.y) return false;
  return pointInTriangle(nodeA.x, nodeA.y, nodeB.x, nodeB.y, nodeC.x, nodeC.y, node.x, node.y);
}

/** `isEar`, the ring's other points looked for along the z-order curve from both sides. */
function isEarHashed(ear: EarNode, hash: Hash): boolean {
  const nodeA = ear.prev;
  const nodeC = ear.next;
  if (area(nodeA, ear, nodeC) >= 0) return false;
  const x0 = Math.min(nodeA.x, ear.x, nodeC.x);
  const y0 = Math.min(nodeA.y, ear.y, nodeC.y);
  const x1 = Math.max(nodeA.x, ear.x, nodeC.x);
  const y1 = Math.max(nodeA.y, ear.y, nodeC.y);
  const minZ = zOrder(x0, y0, hash.minX, hash.minY, hash.invSize);
  const maxZ = zOrder(x1, y1, hash.minX, hash.minY, hash.invSize);
  const blocks = (node: EarNode): boolean => node.x >= x0 && node.x <= x1 && node.y >= y0 && node.y <= y1
    && node !== nodeA && node !== nodeC
    && inEarExceptFirst(nodeA, ear, nodeC, node) && area(node.prev, node, node.next) >= 0;
  let node = ear.prevZ;
  let ahead = ear.nextZ;
  while (node && node.z >= minZ && ahead && ahead.z <= maxZ) {
    if (blocks(node)) return false;
    node = node.prevZ;
    if (blocks(ahead)) return false;
    ahead = ahead.nextZ;
  }
  while (node && node.z >= minZ) {
    if (blocks(node)) return false;
    node = node.prevZ;
  }
  while (ahead && ahead.z <= maxZ) {
    if (blocks(ahead)) return false;
    ahead = ahead.nextZ;
  }
  return true;
}

/** Cuts off the triangles where a ring crosses itself close by. */
function cureLocalIntersections(begin: EarNode, triangles: number[]): EarNode {
  let start = begin;
  let node = start;
  do {
    const nodeA = node.prev;
    const nodeB = node.next.next;
    const crossing = !equals(nodeA, nodeB) && intersects(nodeA, node, node.next, nodeB);
    if (crossing && locallyInside(nodeA, nodeB) && locallyInside(nodeB, nodeA)) {
      triangles.push(nodeA.i, node.i, nodeB.i);
      removeNode(node);
      removeNode(node.next);
      node = start = nodeB;
    }
    node = node.next;
  } while (node !== start);
  return filterPoints(node);
}

/** Whether a diagonal from nodeA to nodeB lies inside the ring and crosses none of its edges. */
function isValidDiagonal(nodeA: EarNode, nodeB: EarNode): boolean {
  const ends = nodeA.next.i !== nodeB.i && nodeA.prev.i !== nodeB.i && !intersectsPolygon(nodeA, nodeB);
  const seen = locallyInside(nodeA, nodeB) && locallyInside(nodeB, nodeA) && middleInside(nodeA, nodeB)
    && Boolean(area(nodeA.prev, nodeA, nodeB.prev) || area(nodeA, nodeB.prev, nodeB));
  const zeroLength = equals(nodeA, nodeB) && area(nodeA.prev, nodeA, nodeA.next) > 0
    && area(nodeB.prev, nodeB, nodeB.next) > 0;
  return ends && (seen || zeroLength);
}

/** Whether nodeA to nodeB crosses an edge of the ring. */
function intersectsPolygon(nodeA: EarNode, nodeB: EarNode): boolean {
  let node = nodeA;
  do {
    const touches = node.i === nodeA.i || node.next.i === nodeA.i || node.i === nodeB.i || node.next.i === nodeB.i;
    if (!touches && intersects(node, node.next, nodeA, nodeB)) return true;
    node = node.next;
  } while (node !== nodeA);
  return false;
}

/** Splits the ring in two along a valid diagonal and cuts each. */
function splitEarcut(start: EarNode, triangles: number[], hash: Hash | null): void {
  let nodeA = start;
  do {
    for (let nodeB = nodeA.next.next; nodeB !== nodeA.prev; nodeB = nodeB.next) {
      if (nodeA.i === nodeB.i || !isValidDiagonal(nodeA, nodeB)) continue;
      let nodeC = splitPolygon(nodeA, nodeB);
      nodeA = filterPoints(nodeA, nodeA.next);
      nodeC = filterPoints(nodeC, nodeC.next);
      earcutLinked(nodeA, triangles, hash, 0);
      earcutLinked(nodeC, triangles, hash, 0);
      return;
    }
    nodeA = nodeA.next;
  } while (nodeA !== start);
}

/** Sets each node's z-order and links the ring in that order. */
function indexCurve(start: EarNode, hash: Hash): void {
  let node = start;
  do {
    if (node.z === 0) node.z = zOrder(node.x, node.y, hash.minX, hash.minY, hash.invSize);
    node.prevZ = node.prev;
    node.nextZ = node.next;
    node = node.next;
  } while (node !== start);
  if (node.prevZ) node.prevZ.nextZ = null;
  node.prevZ = null;
  sortLinked(node);
}

/** Sorts the z-linked list by z, merging runs of doubling length (Simon Tatham's). */
function sortLinked(head: EarNode): void {
  let list: EarNode | null = head;
  let inSize = 1;
  let merges: number;
  do {
    let node: EarNode | null = list;
    let tail: EarNode | null = null;
    list = null;
    merges = 0;
    while (node) {
      merges++;
      let other: EarNode | null = node;
      let pSize = 0;
      for (let i = 0; i < inSize && other; i++) {
        pSize++;
        other = other.nextZ;
      }
      let qSize = inSize;
      while (pSize > 0 || (qSize > 0 && other)) {
        let taken: EarNode;
        if (pSize !== 0 && (qSize === 0 || !other || (node as EarNode).z <= other.z)) {
          taken = node as EarNode;
          node = taken.nextZ;
          pSize--;
        } else {
          taken = other as EarNode;
          other = taken.nextZ;
          qSize--;
        }
        if (tail) tail.nextZ = taken;
        else list = taken;
        taken.prevZ = tail;
        tail = taken;
      }
      node = other;
    }
    if (tail) tail.nextZ = null;
    inSize *= 2;
  } while (merges > 1);
}

/** Cuts ears off the ring from `begin` until a triangle is left; stuck, tries harder in three passes. */
function earcutLinked(begin: EarNode | null, triangles: number[], hash: Hash | null, pass: number): void {
  if (!begin) return;
  let ear = begin;
  if (!pass && hash) indexCurve(ear, hash);
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev = ear.prev;
    const next = ear.next;
    if (hash ? isEarHashed(ear, hash) : isEar(ear)) {
      triangles.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear !== stop) continue;
    if (!pass) earcutLinked(filterPoints(ear), triangles, hash, 1);
    else if (pass === 1) earcutLinked(cureLocalIntersections(filterPoints(ear), triangles), triangles, hash, 2);
    else if (pass === 2) splitEarcut(ear, triangles, hash);
    break;
  }
}

/**
 * The triangles of the polygon `data` (x, y pairs) whose holes start at the points `holeIndices` name: three
 * indices of points a triangle. Follows Mapbox's earcut 3.0.2 (ISC), as three's `Earcut.triangulate` does.
 */
export function earcut(data: readonly number[], holeIndices: readonly number[] = []): number[] {
  const hasHoles = holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices[0] * 2 : data.length;
  let outer = linkedList(data, 0, outerLen, true);
  const triangles: number[] = [];
  if (!outer || outer.next === outer.prev) return triangles;
  if (hasHoles) outer = eliminateHoles(data, holeIndices, outer);
  let hash: Hash | null = null;
  if (data.length > 160) {
    let minX = data[0];
    let minY = data[1];
    let maxX = minX;
    let maxY = minY;
    for (let i = 2; i < outerLen; i += 2) {
      minX = Math.min(minX, data[i]);
      minY = Math.min(minY, data[i + 1]);
      maxX = Math.max(maxX, data[i]);
      maxY = Math.max(maxY, data[i + 1]);
    }
    const size = Math.max(maxX - minX, maxY - minY);
    hash = { minX, minY, invSize: size !== 0 ? 32767 / size : 0 };
  }
  earcutLinked(outer, triangles, hash && hash.invSize ? hash : null, 0);
  return triangles;
}
