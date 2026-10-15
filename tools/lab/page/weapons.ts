// tools/lab weapons: each of the hero's weapons pictured alone in a plain, lit studio: face on (a blade's flat, an
// axe's bit to the side), edge on, from three-quarters and its head close up, with its size and how many triangles
// it's drawn with. A weapon is judged here as it's made, before it's seen in a hand: through the eyes, a maul with a
// thin haft and a small head showed nothing of what it is, and no placement of it matched Vermintide 2's. (From
// behind too: a face wound the wrong way shows there as a hole.)
import * as THREE from 'three';
import type { Lab, Fixture, Report, Pictured, Tile } from './lab';
import { G } from '../../../src/state';
import { opaqueRows } from './pixels';
import type { WeaponStyle } from '../../../src/types';

export interface WeaponsOptions {
  fixture: Fixture;
  /** the bases pictured (the class's weapons by default) */
  weapons?: string[];
  /** picture an empty studio too: the measure of what's drawn must find nothing there */
  canary?: boolean;
}

/** A way the studio's camera looks at a weapon: from where (the weapon's own frame: its length +y, a blade's width or
 *  an axe's bit +x, its flat facing +z), and what of it it frames (shares of its length from its butt) */
interface StudioView {
  name: string;
  from: [number, number, number];
  frames: [number, number];
}

const VIEWS: StudioView[] = [
  { name: 'face', from: [0, 0, 1], frames: [0, 1] },
  { name: 'edge', from: [1, 0, 0], frames: [0, 1] },
  { name: 'behind', from: [-0.5, 0.2, -1], frames: [0, 1] },
  { name: 'quarter', from: [0.8, 0.35, 1], frames: [0, 1] },
  { name: 'head', from: [0.45, 0.25, 1], frames: [0.6, 1] },
];

/** the studio's backdrop, and how far a pixel may be from it and still count as backdrop (0-255 a channel) */
const BACKDROP = new THREE.Color(0x5a5f66);
const BACKDROP_SLACK = 6;
/** a picture's shape (width over height, as the sheet's tiles), the camera's field of view (degrees) and the room
 *  left round what it frames */
const TILE_SHAPE = 340 / 560;
const STUDIO_FOV = 20;
const MARGIN = 1.12;
/** the least share of a picture a weapon must cover to count as drawn (a blade edge on covers under 1%) */
const LEAST_DRAWN = 0.001;

/** The studio: the backdrop, a sky light and two lamps, a key from above in front and a rim from behind. */
function studio(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = BACKDROP;
  scene.environment = G.scene.environment;
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3530, 1.4));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
  key.position.set(1.5, 3, 4);
  const rim = new THREE.DirectionalLight(0xc8d8ff, 1.6);
  rim.position.set(-3, 1.5, -3);
  scene.add(key, rim);
  return scene;
}

/** The weapon in the hero's right hand, a copy of it at its own frame (unturned in the fist), or none. */
function weaponCopy(lab: Lab): THREE.Object3D | null {
  const grip = lab.model.tip?.parent;
  if (!grip || grip === lab.model.root) return null;
  const shown = grip.children.find((child) => child.visible && child instanceof THREE.Group && hasMeshes(child));
  if (!shown) return null;
  const copy = shown.clone();
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.set(1, 1, 1);
  copy.updateMatrixWorld(true);
  return copy;
}

function hasMeshes(object: THREE.Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) found = true;
  });
  return found;
}

/** How many triangles and meshes `object` is drawn with. */
function countsOf(object: THREE.Object3D): { triangles: number; meshes: number } {
  let triangles = 0;
  let meshes = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const geometry = mesh.geometry;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return { triangles, meshes };
}

/** The part of `box` (the weapon's, its own frame) between shares `frames` of its length. */
function partOf(box: THREE.Box3, frames: [number, number]): THREE.Box3 {
  const length = box.max.y - box.min.y;
  const part = box.clone();
  part.min.y = box.min.y + length * frames[0];
  part.max.y = box.min.y + length * frames[1];
  return part;
}

/** The studio's camera looking at `part` from `view`'s side, near enough to frame it in a picture of `TILE_SHAPE`:
 *  its length up the picture, its width or thickness across it. */
function cameraOn(part: THREE.Box3, view: StudioView): THREE.PerspectiveCamera {
  const canvas = G.renderer.domElement;
  const camera = new THREE.PerspectiveCamera(STUDIO_FOV, canvas.width / canvas.height, 0.01, 50);
  const centre = part.getCenter(new THREE.Vector3());
  const size = part.getSize(new THREE.Vector3());
  const tall = Math.tan(THREE.MathUtils.degToRad(STUDIO_FOV / 2));
  const across = Math.max(size.x, size.z);
  // (from the nearest of it: half its depth nearer than its middle)
  const fit = Math.max(size.y / 2 / tall, across / 2 / (tall * TILE_SHAPE));
  const distance = fit * MARGIN + across / 2;
  const way = new THREE.Vector3(...view.from).normalize();
  camera.position.copy(centre).addScaledVector(way, distance);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * The middle of the canvas just drawn at the tile's shape, as a tile, and the share of it the weapon covers. Read
 * from the drawing buffer and taken as opaque: the game draws its frame with an alpha of 0 (core/hdr.ts adds it to
 * the page as light), and copied onto a 2D canvas every picture came out black.
 */
function readTile(name: string): { tile: Tile; drawn: number } {
  const gl = G.renderer.getContext();
  const height = gl.drawingBufferHeight;
  const width = Math.round(height * TILE_SHAPE);
  const left = Math.round((gl.drawingBufferWidth - width) / 2);
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(left, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.putImageData(opaqueRows(pixels, width, height), 0, 0);
  const tile = { view: name, png: canvas.toDataURL('image/png'), width, height };
  return { tile, drawn: drawnShare(context, width, height) };
}

/** The share of a picture's pixels that aren't the backdrop. */
function drawnShare(context: CanvasRenderingContext2D, width: number, height: number): number {
  const pixels = context.getImageData(0, 0, width, height).data;
  const backdrop = BACKDROP.clone().convertLinearToSRGB();
  const [r, g, b] = [backdrop.r, backdrop.g, backdrop.b].map((channel) => channel * 255);
  let drawn = 0;
  for (let k = 0; k < pixels.length; k += 4) {
    const off = Math.max(Math.abs(pixels[k] - r), Math.abs(pixels[k + 1] - g), Math.abs(pixels[k + 2] - b));
    if (off > BACKDROP_SLACK) drawn++;
  }
  return drawn / (width * height);
}

/** `copy` pictured from each of the studio's views (none of it shown with `empty`), and the least and the most of a
 *  picture drawn. */
function pictureOf(lab: Lab, copy: THREE.Object3D, empty = false): { tiles: Tile[]; least: number; most: number } {
  const scene = studio();
  if (!empty) scene.add(copy);
  const box = new THREE.Box3().setFromObject(copy);
  const renderer = G.renderer;
  const toneMapping = renderer.toneMapping;
  const drawing = lab.drawing;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // (the lab draws nothing unless it's picturing)
  lab.drawing = true;
  const tiles: Tile[] = [];
  let least = 1;
  let most = 0;
  try {
    for (const view of VIEWS) {
      renderer.setRenderTarget(null);
      renderer.render(scene, cameraOn(partOf(box, view.frames), view));
      const { tile, drawn } = readTile(view.name);
      tiles.push(tile);
      least = Math.min(least, drawn);
      most = Math.max(most, drawn);
    }
  } finally {
    renderer.toneMapping = toneMapping;
    lab.drawing = drawing;
    scene.remove(copy);
  }
  return { tiles, least, most };
}

/** A weapon's notes: its size in its own frame (m) and what it's drawn with. */
function notesOn(copy: THREE.Object3D): string[] {
  const size = new THREE.Box3().setFromObject(copy).getSize(new THREE.Vector3());
  const { triangles, meshes } = countsOf(copy);
  return [
    `${size.y.toFixed(2)} m long, ${size.x.toFixed(2)} m across its width, ${size.z.toFixed(2)} m thick`,
    `${triangles.toLocaleString('en')} triangles in ${meshes} meshes`,
  ];
}

/** The style a base is held in: a two-hander's, or one in one hand. */
function styleOf(lab: Lab, base: string): WeaponStyle {
  return lab.player.cls.twoHanded?.includes(base) ? 'twoHanded' : 'oneHanded';
}

/** Each of the bases pictured alone from the studio's views, with its notes. */
export async function weapons(lab: Lab, options: WeaponsOptions): Promise<Report> {
  const bases = options.weapons ?? lab.player.cls.bases?.weapon ?? [];
  if (!bases.length) throw new Error('lab: weapons: this class has no weapons');
  const moments: Pictured[] = [];
  const problems: string[] = [];
  const lines: string[] = [];
  for (const base of bases) {
    await lab.setup({ ...options.fixture, gear: styleOf(lab, base), weapon: base });
    const copy = weaponCopy(lab);
    if (!copy) throw new Error(`lab: weapons: no ${base} in the hero's right hand`);
    const { tiles, least } = pictureOf(lab, copy);
    if (least < LEAST_DRAWN) problems.push(`the ${base} covers ${(least * 100).toFixed(1)}% of a picture: not drawn`);
    const notes = notesOn(copy);
    moments.push({ label: base, tiles, notes });
    lines.push(`${base}: ${notes.join('; ')}`);
  }
  if (options.canary) {
    const copy = weaponCopy(lab)!;
    const { most } = pictureOf(lab, copy, true);
    const read = `the canary's empty studio read as ${(most * 100).toFixed(1)}% drawn`;
    if (most >= LEAST_DRAWN) problems.push(read);
    else lines.push(read);
  }
  return { text: lines.join('\n'), problems, moments };
}
