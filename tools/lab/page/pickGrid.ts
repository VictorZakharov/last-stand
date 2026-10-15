// What each cell of a grid over the frame shows of some meshes (tools/lab's frame measure, page/inFrame.ts): those
// meshes alone drawn once through a camera into a target the grid's size, each group of them in a flat colour of its
// own, and read back. A cell is a pixel, drawn at its middle, as the eye's ray through its middle would meet it. (A
// ray a cell, three's own test posed every vertex of a skinned mesh by its bones for each ray: with the hands across
// the view at a strike, a frame took 43 s.)
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { dualQuaternionSkinned, isDualQuaternionSkinned } from '../../../src/entities/models/dualQuaternion';

/** the layer the picked meshes are drawn on alone (three's last: nothing of the game's is on it) */
const PICK_LAYER = 31;
/** a group's colour, its red channel stored (0-255): the first group's, and the step to each next; and how far a
 *  stored value may be from one and still be it */
const FIRST_RED = 60;
const RED_STEP = 60;
const RED_SLACK = 20;
/** the most groups told apart */
const MOST_GROUPS = 3;

/** A flat material of `red` (stored), skinned as `like` is. */
function flatLike(like: THREE.Material, red: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(red / 255, 0, 0, THREE.LinearSRGBColorSpace),
    side: like.side,
    fog: false,
    toneMapped: false,
  });
  return isDualQuaternionSkinned(like) ? dualQuaternionSkinned(material) : material;
}

/** What a picked mesh was drawn as, to put back. */
interface Worn {
  mesh: THREE.Mesh;
  material: THREE.Mesh['material'];
  onLayer: boolean;
}

/**
 * Each cell of an `across` by `down` grid over what `camera` sees (row by row from the top left): the index in
 * `groups` of the group whose mesh is nearest there, or -1 where none is. Drawn with the meshes' world matrices and
 * bones as they are, while the lab lets the game draw (it holds draws back but for its pictures: held, the pick
 * found nothing).
 */
export function pickGrid(lab: Lab, camera: THREE.Camera, groups: THREE.Mesh[][], across: number, down: number):
  Int8Array {
  if (groups.length > MOST_GROUPS) throw new Error(`lab: pickGrid: at most ${MOST_GROUPS} groups`);
  const worn: Worn[] = [];
  const made: THREE.Material[] = [];
  groups.forEach((meshes, index) => {
    const red = FIRST_RED + index * RED_STEP;
    for (const mesh of meshes) {
      worn.push({ mesh, material: mesh.material, onLayer: mesh.layers.isEnabled(PICK_LAYER) });
      const flat = flatLike(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, red);
      made.push(flat);
      mesh.material = flat;
      mesh.layers.enable(PICK_LAYER);
    }
  });
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    return readGroups(drawPicked(camera, across, down), groups.length, across, down);
  } finally {
    lab.drawing = drawing;
    for (const { mesh, material, onLayer } of worn) {
      mesh.material = material;
      if (!onLayer) mesh.layers.disable(PICK_LAYER);
    }
    for (const material of made) material.dispose();
  }
}

/** The scene drawn through `camera` on the pick layer alone into a target `across` by `down`, its pixels read back
 *  (bottom row first). */
function drawPicked(camera: THREE.Camera, across: number, down: number): Uint8Array {
  const renderer = G.renderer;
  const scene = G.scene;
  const target = new THREE.WebGLRenderTarget(across, down);
  const layers = camera.layers.mask;
  const background = scene.background;
  const shadows = renderer.shadowMap.autoUpdate;
  const before = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const pixels = new Uint8Array(across * down * 4);
  try {
    camera.layers.set(PICK_LAYER);
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, across, down, pixels);
  } finally {
    camera.layers.mask = layers;
    scene.background = background;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setRenderTarget(before);
    renderer.setClearColor(clear, clearAlpha);
    target.dispose();
  }
  return pixels;
}

/** Each cell's group from the pixels drawn (bottom row first), row by row from the top left. */
function readGroups(pixels: Uint8Array, groups: number, across: number, down: number): Int8Array {
  const cells = new Int8Array(across * down).fill(-1);
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      const red = pixels[((down - 1 - row) * across + column) * 4];
      const index = Math.round((red - FIRST_RED) / RED_STEP);
      const near = Math.abs(red - (FIRST_RED + index * RED_STEP)) <= RED_SLACK;
      if (index >= 0 && index < groups && near) cells[row * across + column] = index;
    }
  }
  return cells;
}
