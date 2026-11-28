// A ray cast into the world: where it meets the triangles of the meshes it's tested against, nearest first. The
// pointer's ray from the camera (`setFromCamera`), an arrow's flight, a seat's look down: each node tested gives its
// own hits through its `raycast` (a mesh's triangles, `raycast.ts`; the game's own for a prop or a wall).
import { Ray, Vec3, type Vec2 } from '../math/index.ts';
import type { Camera } from './camera.ts';
import { Layers } from './layers.ts';
import type { Node } from './node.ts';

/** The triangle a hit met: its corners' vertices, its normal in the mesh's own space, the group's material. */
export interface HitFace {
  /** its three vertices' numbers in the geometry */
  a: number;
  b: number;
  c: number;
  /** the way it faces, in the mesh's own space, made from its corners' winding */
  normal: Vec3;
  /** which of the mesh's materials it's drawn by (0 for a mesh of one) */
  materialIndex: number;
}

/** Where a ray met something (three's `Intersection`). */
export interface Hit<N extends Node = Node> {
  /** how far along the ray, from its origin, in the world */
  distance: number;
  /** where, in the world */
  point: Vec3;
  /** what it met */
  object: N;
  /** the triangle it met, where it met one */
  face?: HitFace | null;
  /** that triangle's number in the geometry (its first index over three) */
  faceIndex?: number | null;
  /** which instance it met, for an instanced mesh */
  instanceId?: number;
  /** the geometry's uv there, where it has one */
  uv?: Vec2;
  /** where it met its triangle, as weights of the face's three corners (`a`, `b`, `c`), where it met one */
  barycoord?: Vec3;
  /** the geometry's normal there, in the mesh's own space, turned toward the ray */
  normal?: Vec3;
}

/** Something a ray can be tested against: what returns false keeps the ray from what's under it. */
interface Castable {
  raycast(raycaster: Raycaster, hits: Hit[]): void | boolean;
}

/** A ray and the span along it hits count within, tested against nodes. */
export class Raycaster {
  /** the ray, its direction a unit vector */
  readonly ray: Ray;
  /** the nearest and furthest a hit counts */
  near: number;
  far: number;
  /** the layers it tests: a node is tested where it shares one */
  readonly layers = new Layers();
  /** the camera it was last set from, if any */
  camera: Camera | null = null;

  /** A ray from `origin` along `direction` (a unit vector), counting hits from `near` to `far`. */
  constructor(origin?: Vec3, direction?: Vec3, near = 0, far = Infinity) {
    this.ray = new Ray(origin, direction);
    this.near = near;
    this.far = far;
  }

  /** The ray set to start at `origin` along `direction` (a unit vector). */
  set(origin: Vec3, direction: Vec3): void {
    this.ray.set(origin, direction);
  }

  /**
   * The ray from `camera` through `coords` on its screen (-1 to 1 each way, up positive): from a perspective
   * camera's place through that point, or from an ortho camera's plane straight along its view. As three 0.187's
   * `Raycaster.setFromCamera`.
   */
  setFromCamera(coords: Vec2, camera: Camera): void {
    const ray = this.ray;
    if ('isPerspectiveCamera' in camera) {
      ray.origin.setFromMatrixPosition(camera.matrixWorld);
      ray.direction.set(coords.x, coords.y, 0.5).unproject(camera).sub(ray.origin).normalize();
    } else if ('isOrthographicCamera' in camera) {
      // (the origin on the camera's own plane: view depth 0 is clip depth `elements[14]` in an ortho projection)
      const planeDepth = camera.projectionMatrix.elements[14];
      ray.origin.set(coords.x, coords.y, planeDepth).unproject(camera);
      ray.direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
    } else {
      throw new Error(`Raycaster.setFromCamera: not a perspective or ortho camera (${camera.type})`);
    }
    this.camera = camera;
  }

  /** Where the ray meets `node` (and what's under it where `recursive`), added to `hits`, nearest first. */
  intersectObject<N extends Node = Node>(node: Node, recursive = true, hits: Hit<N>[] = []): Hit<N>[] {
    castInto(node, this, hits as Hit[], recursive);
    hits.sort(nearerFirst);
    return hits;
  }

  /** Where the ray meets `nodes` (and what's under them where `recursive`), added to `hits`, nearest first. */
  intersectObjects<N extends Node = Node>(nodes: readonly Node[], recursive = true, hits: Hit<N>[] = []): Hit<N>[] {
    for (const node of nodes) castInto(node, this, hits as Hit[], recursive);
    hits.sort(nearerFirst);
    return hits;
  }
}

/** The nearer hit first. */
function nearerFirst(a: Hit, b: Hit): number {
  return a.distance - b.distance;
}

/**
 * `node` tested where it shares a layer with the ray and has a `raycast`, then its children where `recursive`,
 * unless its `raycast` returned false. As three 0.187's (its visibility not asked).
 */
function castInto(node: Node, raycaster: Raycaster, hits: Hit[], recursive: boolean): void {
  let onward = true;
  if (node.layers.test(raycaster.layers)) {
    const castable = node as Node & Partial<Castable>;
    if (typeof castable.raycast === 'function' && castable.raycast(raycaster, hits) === false) onward = false;
  }
  if (!onward || !recursive) return;
  for (const child of node.children) castInto(child, raycaster, hits, true);
}
