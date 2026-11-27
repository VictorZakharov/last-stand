// What's on the game's screen where (tools/lab: `held`'s rounds over a boss, page/heldBoss.ts): the foe drawn at a
// point of it, met by the eye's ray on its meshes as they're drawn (the skinned ones too, which the game's aim meets
// part by part, src/entities/models/hulls.ts), grids of points over foes, where the aim is on it in each view, and
// the way the camera looks.
import {
  boundsOf, Box2, Camera, Hit, Material, Maths, Mesh, Node, NormalBlending, Raycaster, SkinnedMesh, Vec2, Vec3
} from './sceneApi.ts';
import type { Enemy } from '../../../src/entities/enemy';
import { viewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';

/** the points of a grid across a foe's box on the screen, a side */
const GRID = 10;

/** The eye's ray through the screen, meeting what is drawn on every layer (a creature's own meshes are on its
 *  crowd's, models/crowd.ts). */
const sight = new Raycaster();
sight.layers.enableAll();

/** A point on the screen over a foe: where it is on the screen, the foe drawn there, and where the eye meets it. */
export interface Over {
  ndc: Vec2;
  foe: Enemy;
  point: Vec3;
  /** whether it's met on a skinned mesh (the game's aim meets those part by part, models/hulls.ts) */
  skinned: boolean;
}

/** Whether `object` is drawn solid: shown, and opaque (not a glow, an aura or a see-through effect). */
export function drawnSolid(object: Node): boolean {
  for (let up: Node | null = object; up; up = up.parent) {
    if (!up.visible) return false;
  }
  const mesh = object as Mesh;
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material;
  return material.blending === NormalBlending && !(material.transparent && material.opacity < 0.9);
}

/**
 * The foe of `foes` drawn at `ndc` on the screen, and where the eye meets it: the nearest solid surface of their
 * meshes, the skinned ones with the rigid (the game's aim meets the skinned part by part, models/hulls.ts). None
 * if a breakable prop is drawn in front of it (the game's aim meets those too).
 */
export function foeDrawnAt(ndc: Vec2, foes: Enemy[], camera: Camera = G.camera): Over | null {
  sight.setFromCamera(ndc, camera);
  let over: Over | null = null;
  let nearest = Infinity;
  for (const foe of foes) {
    for (const hit of sight.intersectObject(foe.obj, true)) {
      if (hit.distance >= nearest || !drawnSolid(hit.object)) continue;
      nearest = hit.distance;
      over = { ndc: ndc.clone(), foe, point: hit.point.clone(), skinned: !!(hit.object as SkinnedMesh).isSkinnedMesh };
    }
  }
  return propNearer(nearest) ? null : over;
}

/**
 * The foe of `foes` first met on the line from `from` to `to` (and `past` on), as drawn, and where: a shot's line
 * from where it leaves to its aim. None if it meets none.
 */
export function foeMetAlong(from: Vec3, to: Vec3, past: number, foes: Enemy[]): Over | null {
  const way = to.clone().sub(from);
  sight.set(from, way.clone().normalize());
  sight.far = way.length() + past;
  let over: Over | null = null;
  let nearest = Infinity;
  for (const foe of foes) {
    for (const hit of sight.intersectObject(foe.obj, true)) {
      if (hit.distance >= nearest || !drawnSolid(hit.object)) continue;
      nearest = hit.distance;
      over = { ndc: new Vec2(), foe, point: hit.point.clone(), skinned: !!(hit.object as SkinnedMesh).isSkinnedMesh };
    }
  }
  sight.far = Infinity;
  return over;
}

/** how far round a point its foe must be drawn too for it to be inside the foe on the screen (pixels) */
const EDGE = 6;

/**
 * Whether `over` is inside its foe on the screen, not at its edge: the foe drawn `EDGE` pixels from it every way (by
 * `camera`). At an edge, an aim a pixel off or a body swaying a centimetre between frames goes past it, as it should.
 */
export function insideFoe(over: Over, foes: Enemy[], camera: Camera = G.camera): boolean {
  const x = EDGE * 2 / innerWidth;
  const y = EDGE * 2 / innerHeight;
  const round = [[x, 0], [-x, 0], [0, y], [0, -y]];
  return round.every(([dx, dy]) => {
    const near = new Vec2(over.ndc.x + dx, over.ndc.y + dy);
    return foeDrawnAt(near, foes, camera)?.foe === over.foe;
  });
}

/** Whether the eye's ray (`sight`) meets a breakable prop nearer than `distance`. */
function propNearer(distance: number): boolean {
  const hits: Hit[] = [];
  for (const obstacle of G.arena.obstacles) obstacle.prop?.raycast(sight, hits);
  return hits.some((hit) => hit.distance < distance);
}

/** The corners of the box round `foe`'s model, as it stands (its skinned meshes' as they were bound). */
function boxCorners(foe: Enemy): Vec3[] {
  const box = boundsOf(foe.obj);
  const corners: Vec3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const z of [box.min.z, box.max.z]) {
      for (const y of [box.min.y, box.max.y]) corners.push(new Vec3(x, y, z));
    }
  }
  return corners;
}

/** Where `foe` is on the screen: the box round its model's, in normalized device coordinates (within the screen). */
function screenBox(foe: Enemy): Box2 {
  const box = new Box2();
  for (const corner of boxCorners(foe)) {
    const ndc = corner.project(G.camera);
    box.expandByPoint(new Vec2(ndc.x, ndc.y));
  }
  return box.intersect(new Box2(new Vec2(-1, -1), new Vec2(1, 1)));
}

/**
 * The points over `foes` on the screen: a grid across each one's box there (the small foes' as fine as the boss's),
 * each point with the foe of them drawn at it, which may be another in front (none drawn: left out).
 */
export function pointsOver(foes: Enemy[]): Over[] {
  return foes.flatMap((foe) => gridOver(screenBox(foe), foes));
}

/** The points of a grid across `box` on the screen, each with the foe of `foes` drawn at it (none: left out). */
function gridOver(box: Box2, foes: Enemy[]): Over[] {
  const points: Over[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      const x = Maths.lerp(box.min.x, box.max.x, (column + 0.5) / GRID);
      const y = Maths.lerp(box.min.y, box.max.y, (row + 0.5) / GRID);
      const over = foeDrawnAt(new Vec2(x, y), foes);
      if (over) points.push(over);
    }
  }
  return points;
}

/** Where the aim is on the screen, aimed at `point` (normalized device coordinates): the mouse over it top-down, the
 *  crosshair in the middle in the close views. */
export function aimOnScreen(point: Vec3): Vec2 {
  if (viewMode() !== 'top') return new Vec2(0, 0);
  const ndc = point.clone().project(G.camera);
  return new Vec2(ndc.x, ndc.y);
}

/** How far the eye's ray through the aim passes from `point` (m). */
export function aimMiss(point: Vec3): number {
  sight.setFromCamera(aimOnScreen(point), G.camera);
  return sight.ray.distanceToPoint(point);
}

/** The way the camera looks, along the floor (+z if it looks straight down). */
export function cameraAhead(): Vec3 {
  const ahead = G.camera.getWorldDirection(new Vec3()).setY(0);
  return ahead.lengthSq() < 1e-4 ? ahead.set(0, 0, 1) : ahead.normalize();
}
