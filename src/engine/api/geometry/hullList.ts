// The quickhull's list of points (`hull.ts`): a doubly linked list whose stretches are each a face's outside points,
// so a face's points are taken out or moved together. As three's `ConvexHull`'s `VertexList` (three.js, MIT).
import type { Vec3 } from '../math/index.ts';

/** A point of the hull, linked in the list, and the face it's outside of (`F`, the hull's face). */
export interface HullVertex<F> {
  /** where it is */
  readonly point: Vec3;
  /** the point before it in the list */
  prev: HullVertex<F> | null;
  /** the point after it in the list */
  next: HullVertex<F> | null;
  /** the face it's outside of, while it's kept by one */
  face: F | null;
}

/** A doubly linked list of hull points. */
export class VertexList<F> {
  /** the first point */
  head: HullVertex<F> | null = null;
  /** the last point */
  tail: HullVertex<F> | null = null;

  /** Empties it (the points keep their own links). */
  clear(): void {
    this.head = null;
    this.tail = null;
  }

  /** Puts `vertex` just before `target`. */
  insertBefore(target: HullVertex<F>, vertex: HullVertex<F>): void {
    vertex.prev = target.prev;
    vertex.next = target;
    if (vertex.prev === null) this.head = vertex;
    else vertex.prev.next = vertex;
    target.prev = vertex;
  }

  /** Puts `vertex` at the end. */
  append(vertex: HullVertex<F>): void {
    if (this.tail === null) this.head = vertex;
    else this.tail.next = vertex;
    vertex.prev = this.tail;
    vertex.next = null;
    this.tail = vertex;
  }

  /** Puts the chain starting at `vertex` (to its last link) at the end. */
  appendChain(vertex: HullVertex<F>): void {
    if (this.tail === null) this.head = vertex;
    else this.tail.next = vertex;
    vertex.prev = this.tail;
    let last = vertex;
    while (last.next !== null) last = last.next;
    this.tail = last;
  }

  /** Takes `vertex` out. */
  remove(vertex: HullVertex<F>): void {
    if (vertex.prev === null) this.head = vertex.next;
    else vertex.prev.next = vertex.next;
    if (vertex.next === null) this.tail = vertex.prev;
    else vertex.next.prev = vertex.prev;
  }

  /** Takes out the stretch from `from` to `to`. */
  removeSubList(from: HullVertex<F>, to: HullVertex<F>): void {
    if (from.prev === null) this.head = to.next;
    else from.prev.next = to.next;
    if (to.next === null) this.tail = from.prev;
    else to.next.prev = from.prev;
  }
}
