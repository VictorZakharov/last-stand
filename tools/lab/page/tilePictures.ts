// `lab tiles --pictures`: each surface pictured as the player meets it (page/tiles.ts): from the arena's middle, at its
// nearest point there that faces the camera and is in view (of every place it's drawn at, from `LOWEST` to `HIGHEST`
// up: where a hero walks past it), from `DISTANCE` m, in the biome's own light, so a map's tile shows at the size the
// surface gives it (a tile of 0.4 m some five times across the frame). What's cut out or seen through is left out of
// the picture: round the clearing ferns, leaf cards and a gate's membrane stood in front of every surface. (Looked at
// along its normal, a gate's roots, splaying along the wall, were pictured from inside the thicket's bushes.)
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import * as renderer from '../../../src/core/renderer';

/** the heights a surface is pictured between (m) */
const LOWEST = 0.2;
const HIGHEST = 2.2;
/** how far the camera stands out from the point it pictures (m) */
const DISTANCE = 2;
/** the nearest a camera stands to what it pictures (m), and how far short of anything in the way */
const NEAREST = 0.5;
const SHORT_OF = 0.15;
/** the points of a surface tried for one in view, the nearest the arena's middle first, each this far (m) from those
 *  before it */
const CANDIDATES = 200;
const SPACING = 0.3;
/** how squarely a point's surface must face its camera, standing level towards the arena's middle, to be pictured
 *  from it (the cosine between its normal and the way to the camera: 60° off at most; a boulder's top, which passed
 *  as facing up, was seen edge on, a smear of streaks) */
const FACING_CAMERA = 0.5;
/** a layer no camera of the game draws */
const UNSEEN_LAYER = 31;

/** A point of a surface and the way it's looked at from: towards the arena's middle, as the hero faces (rad, 0 along
 *  +z). */
interface Facing {
  at: THREE.Vector3;
  facing: number;
}

/** The world matrices `mesh` is drawn at: its own, or each of its first `most` instances' within it. */
export function placesOf(mesh: THREE.Mesh, most = Infinity): THREE.Matrix4[] {
  const instanced = mesh as THREE.InstancedMesh;
  if (!instanced.isInstancedMesh) return [mesh.matrixWorld.clone()];
  return Array.from({ length: Math.min(instanced.count, most) }, (_, i) => {
    const place = new THREE.Matrix4();
    instanced.getMatrixAt(i, place);
    return place.premultiply(mesh.matrixWorld);
  });
}

/** Whether a surface whose normal is `normal` at `at` faces its camera, level from it towards the arena's middle, by
 *  `FACING_CAMERA` at least. */
function facesCamera(normal: THREE.Vector3, at: THREE.Vector3): boolean {
  const towardsMiddle = -(normal.x * at.x + normal.z * at.z) / Math.hypot(at.x, at.z);
  return towardsMiddle >= FACING_CAMERA * normal.length();
}

/** The points of `meshes` from `LOWEST` to `HIGHEST` up that face their cameras, the nearest the middle first, each
 *  `SPACING` m from those before it, `CANDIDATES` of them at most, each looked at from the middle. */
function nearestPoints(meshes: THREE.Mesh[]): Facing[] {
  const found: Array<Facing & { distance: number }> = [];
  const at = new THREE.Vector3(), normal = new THREE.Vector3(), normals = new THREE.Matrix3();
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position, normalOf = mesh.geometry.attributes.normal;
    for (const place of placesOf(mesh)) {
      normals.getNormalMatrix(place);
      for (let i = 0; i < position.count; i++) {
        at.fromBufferAttribute(position, i).applyMatrix4(place);
        if (at.y < LOWEST || at.y > HIGHEST) continue;
        if (normalOf) normal.fromBufferAttribute(normalOf, i).applyMatrix3(normals);
        else normal.set(0, 0, 0);
        if (!facesCamera(normal, at)) continue;
        found.push({ at: at.clone(), facing: Math.atan2(-at.x, -at.z), distance: Math.hypot(at.x, at.z) });
      }
    }
  }
  found.sort((a, b) => a.distance - b.distance);
  const kept: Facing[] = [];
  for (const point of found) {
    if (kept.length === CANDIDATES) break;
    if (kept.every((k) => k.at.distanceTo(point.at) >= SPACING)) kept.push(point);
  }
  return kept;
}

/** The camera's place for `point`: `distance` m out along the way it faces. */
const cameraFor = (point: Facing, distance: number): THREE.Vector3 =>
  point.at.clone().add(new THREE.Vector3(Math.sin(point.facing), 0, Math.cos(point.facing)).multiplyScalar(distance));

/** Whether `point` is in view from its camera `DISTANCE` m out: the first thing of `group` a ray from the camera
 *  meets is one of `meshes`, at the point (a gate's roots run under its boulder, where a camera saw the rock), and the
 *  camera stands in the open (`inTheOpen`). */
function inView(point: Facing, meshes: THREE.Mesh[], group: THREE.Object3D): boolean {
  const camera = cameraFor(point, DISTANCE);
  const way = point.at.clone().sub(camera).normalize();
  const hit = new THREE.Raycaster(camera, way, 0, DISTANCE + SHORT_OF).intersectObject(group, true)[0];
  const own = hit !== undefined && meshes.some((m) => m.geometry === (hit.object as THREE.Mesh).geometry);
  return own && hit.distance > DISTANCE - SPACING && inTheOpen(point, camera, group);
}

/** Whether nothing of `group` stands round `camera`: a ray from `point` out to it meets nothing on the way. (A ray
 *  from inside a mesh meets none of its faces, all turned away: a boulder's camera stood inside a standing stone's
 *  plinth, and saw the stone's underside edge on, a smear of streaks.) */
function inTheOpen(point: Facing, camera: THREE.Vector3, group: THREE.Object3D): boolean {
  const way = camera.clone().sub(point.at).normalize();
  const from = point.at.clone().addScaledVector(way, SHORT_OF);
  return new THREE.Raycaster(from, way, 0, DISTANCE - SHORT_OF).intersectObject(group, true).length === 0;
}

/** Whether a material is cut out or seen through: a leaf card's, a fern's, the grass's, a gate's membrane. */
function cutOut(material: THREE.Material | THREE.Material[]): boolean {
  return (Array.isArray(material) ? material : [material]).some((m) => m.alphaTest > 0 || m.transparent);
}

/** `group`'s cut-out and see-through meshes, which stand in front of the surfaces round the clearing (ferns, leaves,
 *  grass), put on a layer no camera draws; it puts them back. (By their layers, not hidden: culling shows them again
 *  as it draws.) */
function withoutCutOuts(group: THREE.Object3D): () => void {
  const moved: Array<[THREE.Object3D, number]> = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !cutOut(mesh.material)) return;
    moved.push([mesh, mesh.layers.mask]);
    mesh.layers.set(UNSEEN_LAYER);
  });
  return () => {
    for (const [mesh, mask] of moved) mesh.layers.mask = mask;
  };
}

/** How far out from `point` a camera stands along the way it faces: `DISTANCE`, or short of what of `group` is in the
 *  way (the gate's roots splay under its boulder, and a camera 2 m out stood inside it). A ray tests layers as a
 *  camera does, so the cut-outs moved aside are passed through. */
function clearDistance(point: Facing, group: THREE.Object3D): number {
  const way = new THREE.Vector3(Math.sin(point.facing), 0, Math.cos(point.facing));
  const ray = new THREE.Raycaster(point.at.clone().addScaledVector(way, 0.05), way, 0, DISTANCE);
  const hit = ray.intersectObject(group, true)[0];
  return hit ? Math.max(NEAREST, hit.distance - SHORT_OF) : DISTANCE;
}

/** Every instance of `group`'s culled meshes packed for rays to meet: culling packs those in view of the camera a frame
 *  is drawn with, and every one of a mesh not frustum-culled, so a frame is drawn with none frustum-culled (a ray met
 *  only the rocks the last frame drew, and the picture's frame drew another in front of the roots). It puts them back,
 *  for the picture's frame to cull as the game does. */
function everyInstancePacked(lab: Lab, group: THREE.Object3D): () => void {
  const culled: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (!(o as THREE.InstancedMesh).isInstancedMesh || !o.frustumCulled) return;
    culled.push(o);
    o.frustumCulled = false;
  });
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    renderer.render();
  } finally {
    lab.drawing = drawing;
  }
  return () => {
    for (const o of culled) o.frustumCulled = true;
  };
}

/** The first of `points` in view (`inView`), every instance of `group` packed for the rays to meet. */
function firstInView(lab: Lab, points: Facing[], meshes: THREE.Mesh[], group: THREE.Object3D): Facing | undefined {
  const cullAgain = everyInstancePacked(lab, group);
  try {
    return points.find((point) => inView(point, meshes, group));
  } finally {
    cullAgain();
  }
}

/** `meshes` pictured at their point nearest the arena's middle, under `label`, with `notes`, with nothing of `group`
 *  that's cut out in front of them; none where no point of them stands at a hero's height. */
export function surfacePicture(
  lab: Lab,
  label: string,
  meshes: THREE.Mesh[],
  group: THREE.Object3D,
  notes: string[],
): Pictured | undefined {
  const points = nearestPoints(meshes);
  if (!points.length) return undefined;
  const facing = lab.player.facing;
  const putBack = withoutCutOuts(group);
  try {
    const seen = firstInView(lab, points, meshes, group);
    const point = seen ?? points[0];
    lab.player.facing = point.facing;
    const distance = seen ? DISTANCE : clearDistance(point, group);
    const where = seen ? [] : ['(no point of it in view from 2 m: its nearest, from as far as is clear)'];
    return lab.picture(label, ['front'], [...notes, ...where], { at: point.at, distance });
  } finally {
    lab.player.facing = facing;
    putBack();
  }
}
