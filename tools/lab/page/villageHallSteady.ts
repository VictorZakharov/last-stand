// `lab village`'s hall of heroes' walls steady as the view moves: the hero in the hall at midnight over the shoulder,
// turned to its long wall, the frame drawn and drawn again with the camera moved half a millimetre aside; what of it
// jumps by more than a few levels is edges alone (from play, "this wall in hall of heroes is z-fighting / flickering",
// "actually all walls do": its inner walls stand on the lamp list's shelter's edge, and read on them each pixel's side
// flipped, the walls between the torches' light and the street lamps'). `canary` reads each surface's side on it again,
// as it was, and the walls must flicker again.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { readShelterOnSurface } from '../../../src/core/lamps';
import { HALL, TERRACE } from '../../../src/data/village';
import { hallSills } from '../../../src/world/village';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the size of the canary's sheet of floor (m), how far apart the hall's floor is read (m), how far over it a ray
 *  starts (m), and how near two surfaces lie to count as in one plane, where they flicker (m) */
const SHEET = 12;
const FLOOR_STEP = 1.5;
const OVER_FLOOR = 3;
const SAME_PLANE = 0.001;

/** how far in from the door he stands (m), the frames he's given, how far the camera moves aside between the frames
 *  (m), how far a channel jumps to count, and the most of the frame that may jump (5% did) */
const IN_FROM = 7;
const SETTLE = 40;
const NUDGE = 0.0005;
const JUMP = 8 / 255;
const MOST_JUMPED = 0.015;

/** The share of the pixels whose light jumped by more than `JUMP` between `a` and `b`. */
function jumpedShare(a: Canvas, b: Canvas): number {
  let jumped = 0;
  for (let at = 0; at < a.pixels.length; at += 4) {
    const red = Math.abs(a.pixels[at] - b.pixels[at]);
    const green = Math.abs(a.pixels[at + 1] - b.pixels[at + 1]);
    const blue = Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
    if (Math.max(red, green, blue) > JUMP) jumped++;
  }
  return jumped / (a.pixels.length / 4);
}

/** The frame drawn, and drawn again with the camera moved `NUDGE` aside; the share of it that jumped. */
function jumpedAsTheViewMoves(lab: Lab): number {
  const before = drawFrame(lab);
  G.camera.position.x += NUDGE;
  G.camera.updateMatrixWorld();
  try {
    return jumpedShare(before, drawFrame(lab));
  } finally {
    G.camera.position.x -= NUDGE;
    G.camera.updateMatrixWorld();
  }
}

/** A sheet in the hall's floor's own plane, of another colour and turned so its pixels can't agree with the floor's: a
 *  surface left in that plane, as the terrace's paving was. */
function coplanarSheet(): THREE.Mesh {
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEET, SHEET).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
  );
  sheet.position.set(TERRACE.x, TERRACE.high + 0.005, HALL.door - SHEET / 2);
  G.scene.add(sheet);
  return sheet;
}

/** Every mesh drawn in the scene but what moves on its bones or stands in many places, whose faces a ray can't read. */
function stillMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    const manyPlaces = (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh;
    if (mesh.isMesh && !manyPlaces) meshes.push(mesh);
  });
  return meshes;
}

/** The places over the hall's floor, from its door to its dais, with a second surface in the top one's plane. */
function placesInOnePlane(): string[] {
  const down = new THREE.Vector3(0, -1, 0);
  const meshes = stillMeshes();
  const places: string[] = [];
  for (let z = HALL.door - FLOOR_STEP / 2; z > HALL.daisZ; z -= FLOOR_STEP) {
    for (let x = TERRACE.x - HALL.inHalf + FLOOR_STEP / 2; x < TERRACE.x + HALL.inHalf; x += FLOOR_STEP) {
      const from = new THREE.Vector3(x, TERRACE.high + OVER_FLOOR, z);
      const hits = new THREE.Raycaster(from, down, 0, OVER_FLOOR + 1).intersectObjects(meshes, false);
      const floor = hits.findIndex((hit) => Math.abs(hit.point.y - TERRACE.high) < 0.1);
      const next = floor < 0 ? undefined : hits[floor + 1];
      if (next && hits[floor].distance + SAME_PLANE > next.distance) places.push(`${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
  return places;
}

/** No surface lies in the plane of the hall's floor (from play, "this floor is now flickering": run on to the door, it
 *  lay in the plane of the terrace's paving under it, each with stones of its own; moving the camera a hair showed
 *  nothing, as it takes a turn of the view to flip them, so this reads the surfaces themselves). `canary` plants a sheet
 *  in that plane. */
export async function hallFloorSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, viewMode());
  const sheet = canary ? coplanarSheet() : null;
  try {
    G.scene.updateMatrixWorld(true);
    const places = placesInOnePlane();
    const line = `over the hall's floor, ${places.length} places with a second surface in its plane`
      + (places.length ? ` (${places.slice(0, 4).join(' ')})` : '');
    if (canary) return { lines: [line], problems: [], caught: places.length > 0, moments: [] };
    const problems = places.length ? [`${line}: the floor flickers`] : [];
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    if (sheet) G.scene.remove(sheet);
  }
}

/** the shares across and along a sill it's read at, off the panes in its middle; how far over it a ray starts (m); the
 *  canary's sheet's size, and how far it lies under where a sill's top is (m) */
const SILL_ACROSS = [-0.35, 0.35];
const SILL_ALONG = [-0.3, 0, 0.3];
const OVER_SILL = 0.5;
const SILL_SHEET = 0.4;
const SHEET_UNDER = 0.0002;

/** The places on the hall's windows' sills with a second surface in the top one's plane. */
function sillsInOnePlane(): string[] {
  const down = new THREE.Vector3(0, -1, 0);
  const meshes = stillMeshes();
  const places: string[] = [];
  for (const sill of hallSills()) {
    for (const across of SILL_ACROSS) {
      for (const along of SILL_ALONG) {
        const from = new THREE.Vector3(sill.x + across * sill.deep, sill.y + OVER_SILL, sill.z + along * sill.wide);
        const hits = new THREE.Raycaster(from, down, 0, OVER_SILL * 2).intersectObjects(meshes, false);
        if (!hits.length) throw new Error(`lab: village: no sill under ${from.x.toFixed(1)}, ${from.z.toFixed(1)}`);
        const next = hits[1];
        if (next && hits[0].distance + SAME_PLANE > next.distance) places.push(`${from.x.toFixed(1)},${from.z.toFixed(1)}`);
      }
    }
  }
  return places;
}

/** No surface lies in the plane of a window's sill (from play, seen from above in the hall: "bottom / sill of windows are
 *  flickering, probably z fighting": the sill's top and the wall's course under it were at one height). `canary` plants
 *  a sheet in the first sill's plane. */
export async function hallSillsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, viewMode());
  const [sill] = hallSills();
  let sheet: THREE.Mesh | null = null;
  if (canary) {
    sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(SILL_SHEET, SILL_SHEET).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff00ff }),
    );
    const top = new THREE.Raycaster(new THREE.Vector3(sill.x, sill.y + OVER_SILL, sill.z), new THREE.Vector3(0, -1, 0));
    const met = top.intersectObjects(stillMeshes(), false)[0];
    sheet.position.set(sill.x + SILL_ACROSS[1] * sill.deep, met.point.y - SHEET_UNDER, sill.z);
    G.scene.add(sheet);
  }
  try {
    G.scene.updateMatrixWorld(true);
    const places = sillsInOnePlane();
    const line = `on the hall's ${hallSills().length} window sills, ${places.length} places with a second surface in `
      + `their plane${places.length ? ` (${places.slice(0, 3).join(' ')})` : ''}`;
    if (canary) return { lines: [line], problems: [], caught: places.length > 0, moments: [] };
    return { lines: [line], problems: places.length ? [`${line}: the sills flicker`] : [], caught: null, moments: [] };
  } finally {
    if (sheet) G.scene.remove(sheet);
  }
}

/** The hall's walls at midnight as the view moves a hair. */
export async function hallWallsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(0);
  try {
    const at = new THREE.Vector3(TERRACE.x, 0, HALL.door - IN_FROM);
    at.y = groundHeight(at.x, at.z);
    await viewBy(lab, 'third');
    G.player.walkTo = null;
    // (turned to the long wall on his left, its windows and torches before him)
    G.player.place(at, Math.PI / 2);
    faceCamera(Math.PI / 2);
    await lab.step(SETTLE);
    if (canary) readShelterOnSurface(true);
    const jumped = jumpedAsTheViewMoves(lab);
    const line = `hall's walls as the view moves ${NUDGE * 1000} mm: ${(jumped * 100).toFixed(2)}% of the frame jumped `
      + `(at most ${MOST_JUMPED * 100}%)`;
    const flickered = jumped > MOST_JUMPED;
    if (canary) return { lines: [line], problems: [], caught: flickered, moments: [] };
    const problems = flickered ? [`${line}: the walls flicker`] : [];
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    if (canary) readShelterOnSurface(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
