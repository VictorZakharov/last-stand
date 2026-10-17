// What is drawn at a point of the screen (tools/lab `cast --what`): every mesh shown that the ray through it of a
// camera drawing the frame meets, on the layers that camera draws: through the eyes, the arms' own camera's first (it
// draws them over the world's frame), then the world's; nearest first, each with its place in the scene and its
// material. (Cast on every layer from the world's camera, through the eyes it listed the hero's own hair at the
// camera, on a layer none draws, and missed the arms, drawn through a narrower view.) For a blink (page/blinks.ts),
// at its frame: what popped there for a frame (a broken prop's rubble piece, drawn full size at the world's middle
// before it was placed). The world's camera's ray meets the foes too: a crowd draws them, instanced, and their own
// meshes, on a layer no camera draws, are where they are drawn (the camera rushed into a foe's glowing body and the
// ray met only the walls past it).
import * as THREE from 'three';
import { G } from '../../../src/state';
import { CROWD_LAYER } from '../../../src/core/layers';
import { armsLens } from './inFrame';

/** the most meshes listed */
const LISTED = 6;

const sight = new THREE.Raycaster();

/** A mesh met, and whether the arms' own camera drew it. */
interface Met {
  hit: THREE.Intersection;
  arms: boolean;
}

/** What `camera`'s ray at `at` (the screen's -1 to 1 across and up) meets on the layers it draws, shown (the
 *  world's, a crowd's bodies too). */
function metThrough(camera: THREE.Camera, at: THREE.Vector2, arms: boolean): Met[] {
  camera.updateMatrixWorld();
  sight.layers.mask = camera.layers.mask;
  if (!arms) sight.layers.enable(CROWD_LAYER);
  sight.setFromCamera(at, camera);
  const drawn = (hit: THREE.Intersection) => (hit.object as THREE.Mesh).isMesh && shownAll(hit.object);
  return sight.intersectObject(G.scene, true).filter(drawn).map((hit) => ({ hit, arms }));
}

/** The meshes the rays meet at `across` and `down` (shares of the screen, from its top left), as lines. */
export function whatIsAt(across: number, down: number): string[] {
  const at = new THREE.Vector2(across * 2 - 1, 1 - down * 2);
  const lens = armsLens();
  const ownArms = lens !== G.camera;
  const met = [...(ownArms ? metThrough(lens, at, true) : []), ...metThrough(G.camera, at, false)];
  if (!met.length) return ['    nothing met there'];
  return met.slice(0, LISTED).map((each) => `    ${describeHit(each)}`);
}

/** A mesh met as words: how far from the eye, the mesh, and the camera or crowd that drew it if not the world's. */
function describeHit({ hit, arms }: Met): string {
  const crowd = hit.object.layers.isEnabled(CROWD_LAYER) ? ', drawn in its crowd' : '';
  const by = arms ? ', the arms\' camera' : crowd;
  return `${hit.distance.toFixed(2)} m: ${describeMesh(hit.object as THREE.Mesh)}${by}`;
}

/** A mesh as words: its place in the scene, its geometry and its material. */
function describeMesh(mesh: THREE.Mesh): string {
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
  const colour = (material as THREE.MeshStandardMaterial).color?.getHexString();
  const look = `${material.type}${colour ? ` #${colour}` : ''}${material.transparent ? ', see-through' : ''}`;
  return `${pathOf(mesh)} (${mesh.geometry.type}, ${look})`;
}

/** Whether `object` and every parent of it are shown. */
function shownAll(object: THREE.Object3D): boolean {
  for (let up: THREE.Object3D | null = object; up; up = up.parent) {
    if (!up.visible) return false;
  }
  return true;
}

/** `object`'s place in the scene: its named parents and its own name, from the scene down (its type if unnamed). */
function pathOf(object: THREE.Object3D): string {
  const names: string[] = [];
  for (let up: THREE.Object3D | null = object; up && up !== G.scene; up = up.parent) {
    if (up.name) names.unshift(up.name);
  }
  return names.length ? names.join(' / ') : `an unnamed ${object.type}`;
}
