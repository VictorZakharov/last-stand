// The weapon as the eyes frame it (tools/lab `sheet`, through the eyes): where it comes into the frame, where its tip
// is, how it leans on the screen, how wide it's drawn, and how much of the frame the weapon and the arm holding it
// cover, read off the frame as it's drawn (the eye's rays through the screen). A rest is matched to a reference's
// screenshots by these numbers, not by eye: handed over as matching Vermintide 2's, a rest leaning in, twice as wide
// and with its head out of the frame failed half of what its screenshots show.
import * as THREE from 'three';
import type { Lab } from './lab';
import { drawnSolid } from './onScreen';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';

/** the grid of the eye's rays the cover is counted on, across and down */
const GRID_ACROSS = 96;
const GRID_DOWN = 54;
/** the points along the weapon from its grip to its tip, projected to find its part in the frame */
const ALONG = 64;
/** where along its part in the frame the weapon's width is read (shares of it from where it comes in): the middle
 *  reading is its width, so a guard or a head across one doesn't count (read at one place, a sword's crossguard was
 *  its width) */
const WIDTH_AT = [0.3, 0.5, 0.7];
/** the step the width is felt out in (a share of the frame's width), and the widest it's followed */
const WIDTH_STEP = 0.002;
const WIDTH_MOST = 0.3;
/** how near an edge (a share of the frame) the weapon's way in is said to come in over it */
const EDGE = 0.02;

/** A place on the screen: across (0 its left edge, 1 its right) and down (0 its top, 1 its bottom). */
interface Place {
  x: number;
  y: number;
}

/** The weapon as framed. */
export interface Framed {
  /** where its part in the frame starts (from the grip's end), and over which edge it comes in (none: its grip is in) */
  from: Place;
  edge: 'bottom' | 'right' | 'left' | 'top' | null;
  /** its tip, and whether that's in the frame */
  tip: Place;
  tipIn: boolean;
  /** its lean on the screen from upright (degrees), out towards its own side's edge or in towards the middle */
  lean: number;
  out: boolean;
  /** how wide it's drawn along its part in the frame (a share of the frame's width) */
  wide: number;
  /** the shares of the frame the weapon covers, and the arm and fist holding it */
  weaponCover: number;
  armCover: number;
}

const sight = new THREE.Raycaster();

/** The camera the hero's arms are drawn with: their own (renderer.ts `drawArms`), or the world's (an older tree's
 *  has no other). What it shows of them is where they're seen: through the world's, a weapon drawn through a
 *  narrower view of its own was measured where it isn't. */
export function armsLens(): THREE.PerspectiveCamera {
  return renderer.armsCamera?.() ?? (G.camera as THREE.PerspectiveCamera);
}

/** Where a point of the world is on the screen, and whether it's ahead of the camera. */
function placeOf(world: THREE.Vector3): Place & { ahead: boolean } {
  const lens = armsLens();
  const ahead = lens.worldToLocal(world.clone()).z < 0;
  const ndc = world.clone().project(lens);
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, ahead };
}

const inFrame = (place: Place & { ahead: boolean }) =>
  place.ahead && place.x >= 0 && place.x <= 1 && place.y >= 0 && place.y <= 1;

/** The meshes drawn in the camera's view under `root`, not under any of `besides`. */
function drawnUnder(root: THREE.Object3D, besides: THREE.Object3D[] = []): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const walk = (object: THREE.Object3D): void => {
    if (besides.includes(object)) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.layers.test(armsLens().layers) && drawnSolid(mesh)) meshes.push(mesh);
    for (const child of object.children) walk(child);
  };
  walk(root);
  return meshes;
}

/** The first of `meshes` the eye's ray through `place` meets, if any. */
function metAt(place: Place, meshes: THREE.Mesh[]): THREE.Intersection | undefined {
  const lens = armsLens();
  sight.layers.mask = lens.layers.mask;
  sight.setFromCamera(new THREE.Vector2(place.x * 2 - 1, 1 - place.y * 2), lens);
  return sight.intersectObjects(meshes, false)[0];
}

/** The edge of the frame `place` lies on, if it's within `EDGE` of one. */
function edgeOf(place: Place): Framed['edge'] {
  if (place.y >= 1 - EDGE) return 'bottom';
  if (place.x >= 1 - EDGE) return 'right';
  if (place.x <= EDGE) return 'left';
  if (place.y <= EDGE) return 'top';
  return null;
}

/** How wide `meshes` are drawn across the screen line `way` (aspect-corrected, normalized) at `at`. */
function widthAt(at: Place, way: THREE.Vector2, meshes: THREE.Mesh[]): number {
  const aspect = armsLens().aspect;
  // (square to the weapon's line on the screen, `n` a share of the frame's width; read in shares of its height, a
  // width came out the aspect times too wide)
  const across = new THREE.Vector2(-way.y, way.x);
  const stepOf = (n: number): Place => ({ x: at.x + across.x * n, y: at.y - across.y * n * aspect });
  let wide = 0;
  for (const side of [1, -1]) {
    for (let n = side * WIDTH_STEP; Math.abs(n) <= WIDTH_MOST; n += side * WIDTH_STEP) {
      if (!metAt(stepOf(n), meshes)) break;
      wide += WIDTH_STEP;
    }
  }
  return wide;
}

/** The shares of the frame the eye's rays meet `weapon` and `arm` on first. */
function coverOf(weapon: THREE.Mesh[], arm: THREE.Mesh[]): [number, number] {
  const all = [...weapon, ...arm];
  let onWeapon = 0;
  let onArm = 0;
  for (let i = 0; i < GRID_ACROSS; i++) {
    for (let j = 0; j < GRID_DOWN; j++) {
      const hit = metAt({ x: (i + 0.5) / GRID_ACROSS, y: (j + 0.5) / GRID_DOWN }, all);
      if (!hit) continue;
      if (weapon.includes(hit.object as THREE.Mesh)) onWeapon++;
      else onArm++;
    }
  }
  const rays = GRID_ACROSS * GRID_DOWN;
  return [onWeapon / rays, onArm / rays];
}

/**
 * The right hand's weapon as the eyes frame it (`Model.tip`, a joint on its grip), with the world matrices up to date;
 * none if the model's tip isn't on a grip or no part of it is in the frame. Throws if a part of it is in the frame but
 * no ray met it there: a measure that saw nothing.
 */
export function framed(lab: Lab): Framed | null {
  const tip = lab.model.tip;
  const grip = tip?.parent;
  if (!tip || !grip || grip === lab.model.root) return null;
  const from = grip.getWorldPosition(new THREE.Vector3());
  const to = tip.getWorldPosition(new THREE.Vector3());
  const seen: Place[] = [];
  for (let n = 0; n <= ALONG; n++) {
    const place = placeOf(from.clone().lerp(to, n / ALONG));
    if (inFrame(place)) seen.push(place);
  }
  if (seen.length < 2) return null;
  const first = seen[0];
  const last = seen[seen.length - 1];
  const aspect = armsLens().aspect;
  const way = new THREE.Vector2((last.x - first.x) * aspect, first.y - last.y).normalize();
  const lean = (Math.atan2(Math.abs(way.x), way.y) * 180) / Math.PI;
  const out = Math.sign(way.x) === Math.sign(first.x - 0.5);
  const weapon = drawnUnder(grip);
  const arm = drawnUnder(lab.joints.shoulderR, [grip]);
  const spots = WIDTH_AT.map((share) => seen[Math.round((seen.length - 1) * share)]);
  if (!spots.some((spot) => metAt(spot, weapon))) {
    throw new Error('lab: the weapon is in the frame, but no ray through it met its meshes: the measure saw nothing');
  }
  const wide = spots.map((spot) => widthAt(spot, way, weapon)).sort((a, b) => a - b)[1];
  const [weaponCover, armCover] = coverOf(weapon, arm);
  const tipPlace = placeOf(to);
  return {
    from: first,
    edge: edgeOf(first),
    tip: tipPlace,
    tipIn: inFrame(tipPlace),
    lean,
    out,
    wide,
    weaponCover,
    armCover,
  };
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** `framed`'s numbers as a line of the sheet. */
export function describeFramed(seen: Framed): string {
  const comesIn = seen.edge ? `in over the ${seen.edge} edge` : 'its grip in the frame';
  const tip = seen.tipIn ? `${percent(seen.tip.x)} across, ${percent(seen.tip.y)} down` : 'out of the frame';
  return `the weapon as framed: ${comesIn} ${percent(seen.from.x)} across, ${percent(seen.from.y)} down; `
    + `its tip ${tip}; leaning ${seen.lean.toFixed(0)}° ${seen.out ? 'out' : 'in'}; `
    + `${(seen.wide * 100).toFixed(1)}% of the frame wide; covering ${percent(seen.weaponCover)} of the frame, `
    + `the arm and fist ${percent(seen.armCover)}`;
}
