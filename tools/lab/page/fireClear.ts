// tools/lab fire's clearing: what of the biome's instanced meshes reaches over a fire, as the frame just drawn has
// them (a culled mesh's instances in view packed to its front, `world/culling.ts`): each instance's points in the
// world inside the fire's column, from its bed up. A fern grown beside a bonfire spread its fronds over the flames
// and hid them from the top-down view.
import * as THREE from 'three';

/** A fire's column: its middle across, its bed's height, and how far out and up from it it reaches (m). */
export interface Column {
  x: number;
  z: number;
  base: number;
  radius: number;
  height: number;
}

/** What of one mesh reaches into a column: its name, and its instances and their points inside. */
export interface Reaching {
  name: string;
  instances: number;
  points: number;
}

/** What `mesh` is called: its name, or its geometry's and material's kinds. */
function nameOf(mesh: THREE.InstancedMesh): string {
  if (mesh.name) return mesh.name;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return `${mesh.geometry.type} in ${material.type}`;
}

/** Whether `point` (the world) lies inside `column`. */
function inside(point: THREE.Vector3, column: Column): boolean {
  if (point.y < column.base || point.y > column.base + column.height) return false;
  return Math.hypot(point.x - column.x, point.z - column.z) < column.radius;
}

/** Whether `sphere` (the world) may reach into `column`. */
function nearColumn(sphere: THREE.Sphere, column: Column): boolean {
  const across = Math.hypot(sphere.center.x - column.x, sphere.center.z - column.z);
  if (across > column.radius + sphere.radius) return false;
  return sphere.center.y + sphere.radius >= column.base
    && sphere.center.y - sphere.radius <= column.base + column.height;
}

/** The points of instance `index` of `mesh` inside `column`. */
function pointsInside(mesh: THREE.InstancedMesh, index: number, column: Column): number {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  matrix.premultiply(mesh.matrixWorld);
  const bound = mesh.geometry.boundingSphere!.clone().applyMatrix4(matrix);
  if (!nearColumn(bound, column)) return 0;
  const positions = mesh.geometry.getAttribute('position');
  const point = new THREE.Vector3();
  let count = 0;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
    if (inside(point, column)) count++;
  }
  return count;
}

/** What the instanced meshes under `root` that `camera` draws reach into `column` with, mesh by mesh (those
 *  reaching nothing left out), as the last frame drawn placed their instances. */
export function reachingInto(root: THREE.Object3D, camera: THREE.Camera, column: Column): Reaching[] {
  const reaching: Reaching[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !camera.layers.test(mesh.layers)) return;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    let instances = 0;
    let points = 0;
    for (let index = 0; index < mesh.count; index++) {
      const inside = pointsInside(mesh, index, column);
      if (!inside) continue;
      instances++;
      points += inside;
    }
    if (instances) reaching.push({ name: nameOf(mesh), instances, points });
  });
  return reaching;
}

/** the name of the plant the canary grows */
export const CANARY_PLANT = 'the canary\'s plant';

/** The plant the canary grows in the middle of `column`, a frond's height over its bed: a flat leaf a metre across,
 *  one instance of a mesh of its own under `root`; returns what takes it out again. */
export function plantIn(root: THREE.Object3D, column: Column): () => void {
  const leaf = new THREE.PlaneGeometry(1, 1, 4, 4).rotateX(-Math.PI / 2);
  const plant = new THREE.InstancedMesh(leaf, new THREE.MeshBasicMaterial(), 1);
  plant.name = CANARY_PLANT;
  plant.setMatrixAt(0, new THREE.Matrix4().makeTranslation(column.x, column.base + 0.3, column.z));
  root.add(plant);
  plant.updateMatrixWorld(true);
  return () => {
    root.remove(plant);
    leaf.dispose();
    (plant.material as THREE.Material).dispose();
  };
}
