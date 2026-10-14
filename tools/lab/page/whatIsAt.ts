// What is drawn at a point of the screen (tools/lab `cast --what`): every mesh shown that the eye's ray through it
// meets, nearest first, on every layer, each with its place in the scene and its material. For a blink
// (page/blinks.ts), at its frame: what popped there for a frame (a broken prop's rubble piece, drawn full size at the
// world's middle before it was placed).
import * as THREE from 'three';
import { G } from '../../../src/state';

/** the most meshes listed */
const LISTED = 6;

const sight = new THREE.Raycaster();
sight.layers.enableAll();

/** The meshes the eye's ray meets at `across` and `down` (shares of the screen, from its top left), as lines. */
export function whatIsAt(across: number, down: number): string[] {
  G.camera.updateMatrixWorld();
  sight.setFromCamera(new THREE.Vector2(across * 2 - 1, 1 - down * 2), G.camera);
  const drawn = (hit: THREE.Intersection) => (hit.object as THREE.Mesh).isMesh && shownAll(hit.object);
  const hits = sight.intersectObject(G.scene, true).filter(drawn);
  if (!hits.length) return ['    nothing met there'];
  return hits.slice(0, LISTED).map((hit) => `    ${describeHit(hit)}`);
}

/** A mesh met as words: how far from the eye, and the mesh. */
function describeHit(hit: THREE.Intersection): string {
  return `${hit.distance.toFixed(2)} m: ${describeMesh(hit.object as THREE.Mesh)}`;
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
