// The convex hull of a set of points (three's `ConvexGeometry` over its `ConvexHull`): quickhull, faces as
// triangles joined by half-edges, each outside point kept by the face it sees farthest past, the hull grown by the
// point farthest out until none is left outside. The same steps as three's, so the same faces in the same order.
import { Line3, Plane, Triangle, Vec3 } from '../math/index.ts';
import { Attribute } from './attribute.ts';
import { Geometry } from './geometry.ts';
import { VertexList } from './hullList.ts';
import type { HullVertex } from './hullList.ts';

const _line = new Line3();
const _plane = new Plane();
const _closest = new Vec3();
const _triangle = new Triangle();

/** One side of a face's edge, from the vertex before it to its own. */
class HalfEdge {
  vertex: HullVertex<Face>;
  face: Face;
  prev: HalfEdge = this;
  next: HalfEdge = this;
  twin: HalfEdge | null = null;

  constructor(vertex: HullVertex<Face>, face: Face) {
    this.vertex = vertex;
    this.face = face;
  }

  head(): HullVertex<Face> {
    return this.vertex;
  }

  tail(): HullVertex<Face> {
    return this.prev.vertex;
  }

  setTwin(edge: HalfEdge): void {
    this.twin = edge;
    edge.twin = this;
  }

  twinOf(): HalfEdge {
    if (!this.twin) throw new Error('hull: an edge with no twin');
    return this.twin;
  }
}

/** A triangle of the hull, its plane facing out, and the first of the outside points it keeps. */
class Face {
  readonly normal = new Vec3();
  readonly midpoint = new Vec3();
  constant = 0;
  outside: HullVertex<Face> | null = null;
  deleted = false;
  edge!: HalfEdge;

  static create(a: HullVertex<Face>, b: HullVertex<Face>, c: HullVertex<Face>): Face {
    const face = new Face();
    const e0 = new HalfEdge(a, face);
    const e1 = new HalfEdge(b, face);
    const e2 = new HalfEdge(c, face);
    e0.next = e1;
    e1.next = e2;
    e2.next = e0;
    e0.prev = e2;
    e1.prev = e0;
    e2.prev = e1;
    face.edge = e0;
    _triangle.set(e0.tail().point, e0.head().point, e1.head().point);
    _triangle.getNormal(face.normal);
    _triangle.getMidpoint(face.midpoint);
    face.constant = face.normal.dot(face.midpoint);
    return face;
  }

  /** The edge `i` steps on from its first (back, below 0). */
  getEdge(i: number): HalfEdge {
    let edge = this.edge;
    for (; i > 0; i--) edge = edge.next;
    for (; i < 0; i++) edge = edge.prev;
    return edge;
  }

  distanceToPoint(point: Vec3): number {
    return this.normal.dot(point) - this.constant;
  }
}

type Vertex = HullVertex<Face>;

/** The hull being grown: its faces, the outside points kept by them, the points let go a step. */
class Quickhull {
  tolerance = -1;
  faces: Face[] = [];
  newFaces: Face[] = [];
  readonly assigned = new VertexList<Face>();
  readonly unassigned = new VertexList<Face>();
  readonly vertices: Vertex[];

  constructor(points: readonly Vec3[]) {
    this.vertices = points.map((point) => ({ point, prev: null, next: null, face: null }));
  }

  compute(): Face[] {
    this.initialHull();
    for (let eye = this.nextVertex(); eye; eye = this.nextVertex()) this.addVertex(eye);
    return this.faces.filter((face) => !face.deleted);
  }

  private keep(vertex: Vertex, face: Face): void {
    vertex.face = face;
    if (face.outside === null) this.assigned.append(vertex);
    else this.assigned.insertBefore(face.outside, vertex);
    face.outside = vertex;
  }

  private letGo(vertex: Vertex, face: Face): void {
    if (vertex === face.outside) face.outside = vertex.next !== null && vertex.next.face === face ? vertex.next : null;
    this.assigned.remove(vertex);
  }

  private takeAll(face: Face): Vertex | null {
    const start = face.outside;
    if (start === null) return null;
    let end = start;
    while (end.next !== null && end.next.face === face) end = end.next;
    this.assigned.removeSubList(start, end);
    start.prev = null;
    end.next = null;
    face.outside = null;
    return start;
  }

  private deleteFaceVertices(face: Face): void {
    const taken = this.takeAll(face);
    if (taken) this.unassigned.appendChain(taken);
  }

  private resolveUnassigned(): void {
    for (let vertex = this.unassigned.head; vertex !== null;) {
      const next: Vertex | null = vertex.next;
      let most = this.tolerance;
      let best: Face | null = null;
      for (const face of this.newFaces) {
        if (face.deleted) continue;
        const distance = face.distanceToPoint(vertex.point);
        if (distance > most) {
          most = distance;
          best = face;
        }
        if (most > 1000 * this.tolerance) break;
      }
      if (best) this.keep(vertex, best);
      vertex = next;
    }
  }

  /** The points least and most along each axis, and the tolerance their size asks for. */
  private extremes(): { min: Vertex[]; max: Vertex[] } {
    const first = this.vertices[0];
    const min = [first, first, first];
    const max = [first, first, first];
    const low = [first.point.x, first.point.y, first.point.z];
    const high = [...low];
    for (const vertex of this.vertices) {
      const at = [vertex.point.x, vertex.point.y, vertex.point.z];
      for (let j = 0; j < 3; j++) {
        if (at[j] < low[j]) {
          low[j] = at[j];
          min[j] = vertex;
        }
      }
      for (let j = 0; j < 3; j++) {
        if (at[j] > high[j]) {
          high[j] = at[j];
          max[j] = vertex;
        }
      }
    }
    const spread = [0, 1, 2].map((j) => Math.max(Math.abs(low[j]), Math.abs(high[j])));
    this.tolerance = 3 * Number.EPSILON * (spread[0] + spread[1] + spread[2]);
    return { min, max };
  }

  private initialHull(): void {
    const { min, max } = this.extremes();
    const along = (v: Vertex, j: number): number => [v.point.x, v.point.y, v.point.z][j];
    let most = 0;
    let axis = 0;
    for (let j = 0; j < 3; j++) {
      const distance = along(max[j], j) - along(min[j], j);
      if (distance > most) {
        most = distance;
        axis = j;
      }
    }
    const v0 = min[axis];
    const v1 = max[axis];
    let v2 = v0;
    most = 0;
    _line.set(v0.point, v1.point);
    for (const vertex of this.vertices) {
      if (vertex === v0 || vertex === v1) continue;
      const distance = _line.closestPointToPoint(vertex.point, true, _closest).distanceToSquared(vertex.point);
      if (distance > most) {
        most = distance;
        v2 = vertex;
      }
    }
    let v3 = v0;
    most = -1;
    _plane.setFromCoplanarPoints(v0.point, v1.point, v2.point);
    for (const vertex of this.vertices) {
      if (vertex === v0 || vertex === v1 || vertex === v2) continue;
      const distance = Math.abs(_plane.distanceToPoint(vertex.point));
      if (distance > most) {
        most = distance;
        v3 = vertex;
      }
    }
    const faces = this.tetrahedron(v0, v1, v2, v3);
    this.faces.push(...faces);
    for (const vertex of this.vertices) {
      if (vertex === v0 || vertex === v1 || vertex === v2 || vertex === v3) continue;
      let far = this.tolerance;
      let best: Face | null = null;
      for (const face of faces) {
        const distance = face.distanceToPoint(vertex.point);
        if (distance > far) {
          far = distance;
          best = face;
        }
      }
      if (best) this.keep(vertex, best);
    }
  }

  /** The first four faces, turned out by which side of the first three the fourth is. */
  private tetrahedron(v0: Vertex, v1: Vertex, v2: Vertex, v3: Vertex): Face[] {
    if (_plane.distanceToPoint(v3.point) < 0) {
      const faces = [Face.create(v0, v1, v2), Face.create(v3, v1, v0), Face.create(v3, v2, v1), Face.create(v3, v0, v2)];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        faces[i + 1].getEdge(2).setTwin(faces[0].getEdge(j));
        faces[i + 1].getEdge(1).setTwin(faces[j + 1].getEdge(0));
      }
      return faces;
    }
    const faces = [Face.create(v0, v2, v1), Face.create(v3, v0, v1), Face.create(v3, v1, v2), Face.create(v3, v2, v0)];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      faces[i + 1].getEdge(2).setTwin(faces[0].getEdge((3 - i) % 3));
      faces[i + 1].getEdge(0).setTwin(faces[j + 1].getEdge(1));
    }
    return faces;
  }

  /** The point farthest out past the face that keeps the first outside point. */
  private nextVertex(): Vertex | null {
    const first = this.assigned.head;
    if (first === null || first.face === null) return null;
    const eyeFace = first.face;
    let eye: Vertex | null = null;
    let most = 0;
    for (let vertex = eyeFace.outside; vertex !== null && vertex.face === eyeFace; vertex = vertex.next) {
      const distance = eyeFace.distanceToPoint(vertex.point);
      if (distance > most) {
        most = distance;
        eye = vertex;
      }
    }
    return eye;
  }

  private horizon(eye: Vec3, crossEdge: HalfEdge | null, face: Face, horizon: HalfEdge[]): void {
    this.deleteFaceVertices(face);
    face.deleted = true;
    const cross = crossEdge ?? face.getEdge(0);
    let edge = crossEdge === null ? cross : cross.next;
    do {
      const twin = edge.twinOf();
      const opposite = twin.face;
      if (!opposite.deleted) {
        if (opposite.distanceToPoint(eye) > this.tolerance) this.horizon(eye, twin, opposite, horizon);
        else horizon.push(edge);
      }
      edge = edge.next;
    } while (edge !== cross);
  }

  private addVertex(eye: Vertex): void {
    const horizon: HalfEdge[] = [];
    this.unassigned.clear();
    if (eye.face === null) throw new Error('hull: an outside point with no face');
    this.letGo(eye, eye.face);
    this.horizon(eye.point, null, eye.face, horizon);
    this.newFaces = [];
    let firstSide: HalfEdge | null = null;
    let previousSide: HalfEdge | null = null;
    for (const edge of horizon) {
      const face = Face.create(eye, edge.tail(), edge.head());
      this.faces.push(face);
      face.getEdge(-1).setTwin(edge.twinOf());
      const side = face.getEdge(0);
      if (firstSide === null) firstSide = side;
      else if (previousSide) side.next.setTwin(previousSide);
      this.newFaces.push(face);
      previousSide = side;
    }
    if (firstSide && previousSide) firstSide.next.setTwin(previousSide);
    this.resolveUnassigned();
  }
}

/**
 * The convex hull of `points` as triangles, unindexed, each face's normal on its three vertices (no uvs); under
 * four points, an empty geometry. Follows three's `ConvexHull` and `ConvexGeometry` (three.js, MIT, 0.187.0), its
 * quickhull after Lloyd's and Ratcliff's: the same faces in the same order.
 */
export function hull(points: readonly Vec3[]): Geometry {
  const faces = points.length >= 4 ? new Quickhull(points).compute() : [];
  const positions = new Float32Array(faces.length * 9);
  const normals = new Float32Array(faces.length * 9);
  let at = 0;
  for (const face of faces) {
    let edge = face.edge;
    do {
      const point = edge.head().point;
      positions.set([point.x, point.y, point.z], at);
      normals.set([face.normal.x, face.normal.y, face.normal.z], at);
      at += 3;
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const geometry = new Geometry();
  geometry.setAttribute('position', new Attribute(positions, 3));
  geometry.setAttribute('normal', new Attribute(normals, 3));
  return geometry;
}
