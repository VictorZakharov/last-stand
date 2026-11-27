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
  let p = start;
  let stop = end;
  let again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = stop = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== stop);
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
  const a = ear.prev;
  const c = ear.next;
  if (area(a, ear, c) >= 0) return false;
  const x0 = Math.min(a.x, ear.x, c.x);
  const y0 = Math.min(a.y, ear.y, c.y);
  const x1 = Math.max(a.x, ear.x, c.x);
  const y1 = Math.max(a.y, ear.y, c.y);
  for (let p = c.next; p !== a; p = p.next) {
    const inBox = p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    if (inBox && inEarExceptFirst(a, ear, c, p) && area(p.prev, p, p.next) >= 0) return false;
  }
  return true;
}

/** Whether `p` is in the triangle (a, b, c), not at its first corner. */
function inEarExceptFirst(a: EarNode, b: EarNode, c: EarNode, p: EarNode): boolean {
  return !(a.x === p.x && a.y === p.y) && pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y);
}

/** `isEar`, the ring's other points looked for along the z-order curve from both sides. */
function isEarHashed(ear: EarNode, hash: Hash): boolean {
  const a = ear.prev;
  const c = ear.next;
  if (area(a, ear, c) >= 0) return false;
  const x0 = Math.min(a.x, ear.x, c.x);
  const y0 = Math.min(a.y, ear.y, c.y);
  const x1 = Math.max(a.x, ear.x, c.x);
  const y1 = Math.max(a.y, ear.y, c.y);
  const minZ = zOrder(x0, y0, hash.minX, hash.minY, hash.invSize);
  const maxZ = zOrder(x1, y1, hash.minX, hash.minY, hash.invSize);
  const blocks = (p: EarNode): boolean => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c
    && inEarExceptFirst(a, ear, c, p) && area(p.prev, p, p.next) >= 0;
  let p = ear.prevZ;
  let n = ear.nextZ;
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (blocks(p)) return false;
    p = p.prevZ;
    if (blocks(n)) return false;
    n = n.nextZ;
  }
  while (p && p.z >= minZ) {
    if (blocks(p)) return false;
    p = p.prevZ;
  }
  while (n && n.z <= maxZ) {
    if (blocks(n)) return false;
    n = n.nextZ;
  }
  return true;
}

/** Cuts off the triangles where a ring crosses itself close by. */
function cureLocalIntersections(begin: EarNode, triangles: number[]): EarNode {
  let start = begin;
  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i, p.i, b.i);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}

/** Whether a diagonal from a to b lies inside the ring and crosses none of its edges. */
function isValidDiagonal(a: EarNode, b: EarNode): boolean {
  const ends = a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b);
  const seen = locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b)
    && Boolean(area(a.prev, a, b.prev) || area(a, b.prev, b));
  const zeroLength = equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0;
  return ends && (seen || zeroLength);
}

/** Whether a to b crosses an edge of the ring. */
function intersectsPolygon(a: EarNode, b: EarNode): boolean {
  let p = a;
  do {
    const touches = p.i === a.i || p.next.i === a.i || p.i === b.i || p.next.i === b.i;
    if (!touches && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

/** Splits the ring in two along a valid diagonal and cuts each. */
function splitEarcut(start: EarNode, triangles: number[], hash: Hash | null): void {
  let a = start;
  do {
    for (let b = a.next.next; b !== a.prev; b = b.next) {
      if (a.i === b.i || !isValidDiagonal(a, b)) continue;
      let c = splitPolygon(a, b);
      a = filterPoints(a, a.next);
      c = filterPoints(c, c.next);
      earcutLinked(a, triangles, hash, 0);
      earcutLinked(c, triangles, hash, 0);
      return;
    }
    a = a.next;
  } while (a !== start);
}

/** Sets each node's z-order and links the ring in that order. */
function indexCurve(start: EarNode, hash: Hash): void {
  let p = start;
  do {
    if (p.z === 0) p.z = zOrder(p.x, p.y, hash.minX, hash.minY, hash.invSize);
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);
  if (p.prevZ) p.prevZ.nextZ = null;
  p.prevZ = null;
  sortLinked(p);
}

/** Sorts the z-linked list by z, merging runs of doubling length (Simon Tatham's). */
function sortLinked(head: EarNode): void {
  let list: EarNode | null = head;
  let inSize = 1;
  let merges: number;
  do {
    let p: EarNode | null = list;
    let tail: EarNode | null = null;
    list = null;
    merges = 0;
    while (p) {
      merges++;
      let q: EarNode | null = p;
      let pSize = 0;
      for (let i = 0; i < inSize && q; i++) {
        pSize++;
        q = q.nextZ;
      }
      let qSize = inSize;
      while (pSize > 0 || (qSize > 0 && q)) {
        let e: EarNode;
        if (pSize !== 0 && (qSize === 0 || !q || (p as EarNode).z <= q.z)) {
          e = p as EarNode;
          p = e.nextZ;
          pSize--;
        } else {
          e = q as EarNode;
          q = e.nextZ;
          qSize--;
        }
        if (tail) tail.nextZ = e;
        else list = e;
        e.prevZ = tail;
        tail = e;
      }
      p = q;
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
