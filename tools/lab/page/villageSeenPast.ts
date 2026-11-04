// `lab village --only wallsPastHimWhole,portalOverAll`: what blends from above and what stands past him.
// `wallsPastHimWhole` (from play: "not supposed to make walls transparent like this, because I'm front of the wall",
// "these pillars in hero hall are oddly cut", "we need to see this in top down view as well"): from above, stood before
// each wall and on the hall's floor, places on what stands past him are read drawn as the game thins and with nothing
// thinned; they must agree. `canary` has what thins reach past him. `portalOverAll` (from play: "some kinda glitch at
// the portal, only under some angles"): round the crypt's portal, how much of its inner sheet the frame shows unchanged
// with the sheet hidden: what draws over it. `canary` sorts what thins by blending among the glows, as it was.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, HALL, portalPlace, TERRACE } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import {
  holdBlendedAmongGlows,
  holdBuiltOpenAlways,
  holdThinningReach,
  thinningLetGo,
} from '../../../src/core/seeThrough';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle */
const SETTLE = 90;
/** how much a place's light may differ from what's drawn with nothing thinned, a share of it (its first 3% of full
 *  light forgiven, as a share of nothing means nothing), and the most places that may */
const MOST_DIFFERENT = 0.2;
const LIGHT_FORGIVEN = 0.03;
const MOST_PLACES_WRONG = 0;
/** how much of the sheet may show unchanged with it hidden (corners and what stands before it are out of the part
 *  read) */
const MOST_OVER_THE_SHEET = 0.06;
/** the part of the sheet read: its middle's half width and half height, as shares of its own */
const SHEET_READ = { across: 0.32, up: 0.34 };
/** how far apart the pixels read over it are, and how much a pixel must change to count as the sheet shown (of full
 *  light) */
const SHEET_STRIDE = 3;
const SHEET_CHANGE = 0.025;

/** A stand of his and what stands past him there. */
interface Stand { name: string; x: number; z: number; facing: number; past: THREE.Vector3[] }

/** The hero placed at (x, z) facing `facing`, the camera behind him, let settle. */
async function standAt(lab: Lab, x: number, z: number, facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** The places read past him at each stand: walls he's before, the hall's far columns and its back wall. */
function stands(): Stand[] {
  const x = TERRACE.x;
  const floor = TERRACE.high;
  const north = Math.PI;
  const backWall = HALL.plinths.map((across) => new THREE.Vector3(x + across, floor + 3.6, HALL.wall + 0.02));
  const backColumns = [-1, 1].flatMap((side) => [
    new THREE.Vector3(x + side * HALL.columnX, floor + 1.4, HALL.columnZ[3]),
    new THREE.Vector3(x + side * HALL.columnX, floor + 2.4, HALL.columnZ[3]),
  ]);
  const frontWall = [-3, -2.2, 2.6, 4].flatMap((across) => [1.6, 3, 4.6].map((up) =>
    new THREE.Vector3(x + across, floor + up, HALL.door + 0.02)));
  const cottage = COTTAGES[0];
  const halfD = (COTTAGE.d / 2) * cottage.size;
  const cos = Math.cos(cottage.facing);
  const sin = Math.sin(cottage.facing);
  const inFront = (along: number, out: number): [number, number] =>
    [cottage.x + along * cos + out * sin, cottage.z - along * sin + out * cos];
  const [cottageX, cottageZ] = inFront(0, halfD + 1.2);
  const onTheWall = (along: number, up: number): THREE.Vector3 => {
    const [wx, wz] = inFront(along, halfD + 0.02);
    return new THREE.Vector3(wx, groundHeight(wx, wz) + up, wz);
  };
  const cottageWall = [-1.6, 1.6].map((along) => onTheWall(along, 1.5));
  const halfW = (COTTAGE.w / 2) * cottage.size;
  const [cornerX, cornerZ] = inFront(-halfW - 0.7, halfD + 0.7);
  const alongWall = [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].flatMap((share) =>
    [0.9, 1.5, 2.1].map((up) => onTheWall(share * halfW, up)));
  return [
    {
      name: 'on the hall\'s floor before the dais',
      x,
      z: HALL.daisZ + 3,
      facing: north,
      past: [...backWall, ...backColumns],
    },
    { name: 'on the portico before the front wall', x: x + 3, z: HALL.door + 1.4, facing: north, past: frontWall },
    {
      name: 'before a cottage\'s front',
      x: cottageX,
      z: cottageZ,
      facing: cottage.facing + Math.PI,
      past: cottageWall,
    },
    // (from play, "it shows green where it should not": beside the wall, hiding nothing of him, it stays whole)
    { name: 'at a cottage\'s corner', x: cornerX, z: cornerZ, facing: cottage.facing + Math.PI + 0.7, past: alongWall },
  ];
}

/** The pixel `point` falls on, or null off the frame. */
function pixelOf(point: THREE.Vector3, width: number, height: number): number | null {
  const place = point.clone().project(G.camera);
  const column = Math.floor(((place.x + 1) / 2) * width);
  const row = Math.floor(((place.y + 1) / 2) * height);
  if (column < 0 || column >= width || row < 0 || row >= height) return null;
  return (row * width + column) * 4;
}

/** How many of a stand's places differ thinned as the game thins from nothing thinned, and how many were in the
 *  frame. */
function readStand(lab: Lab, stand: Stand): { wrong: number; read: number; worst: number; places: string } {
  const canvas = drawFrame(lab);
  const thinned = canvas.pixels.slice();
  const giveBack = thinningLetGo();
  const whole = drawFrame(lab).pixels;
  giveBack();
  let wrong = 0;
  let read = 0;
  let worst = 0;
  const places: string[] = [];
  for (const point of stand.past) {
    const pixel = pixelOf(point, canvas.width, canvas.height);
    if (pixel === null) continue;
    read++;
    let differs = 0;
    let light = 0;
    for (let part = 0; part < 3; part++) {
      differs += Math.abs(thinned[pixel + part] - whole[pixel + part]);
      light += whole[pixel + part];
    }
    const share = Math.max(0, differs / 3 - LIGHT_FORGIVEN) / Math.max(light / 3, LIGHT_FORGIVEN);
    worst = Math.max(worst, share);
    if (share > MOST_DIFFERENT) wrong++;
    places.push(`${point.x.toFixed(1)},${point.y.toFixed(1)},${point.z.toFixed(1)} ${(share * 100).toFixed(0)}%`);
  }
  return { wrong, read, worst, places: places.join('; ') };
}

/** From above, what stands past him is drawn whole. */
export async function wallsPastHimWhole(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdThinningReach(canary);
  holdBuiltOpenAlways(canary);
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let wrongAll = 0;
  try {
    await viewBy(lab, 'top');
    for (const stand of stands()) {
      await standAt(lab, stand.x, stand.z, stand.facing);
      const { wrong, read, worst, places } = readStand(lab, stand);
      wrongAll += wrong;
      const worstShare = (worst * 100).toFixed(0);
      lines.push(`${stand.name}: ${wrong} of ${read} places past him thinned, the worst by ${worstShare}%`);
      lines.push(`  ${places}`);
      if (read === 0) problems.push(`${stand.name}: no place past him in the frame`);
      if (wrong > MOST_PLACES_WRONG) problems.push(`${stand.name}: ${wrong} places past him thinned`);
      if (!canary) moments.push(await lab.screen(stand.name, []));
    }
  } finally {
    holdThinningReach(false);
    holdBuiltOpenAlways(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: wrongAll > MOST_PLACES_WRONG, moments: [] };
  return { lines, problems, caught: null, moments };
}

/** The crypt portal's sheet, as it stands in the village. */
function cryptSheet(): THREE.Mesh {
  const place = portalPlace('crypt');
  let nearest: THREE.Mesh | null = null;
  let nearestOff = Infinity;
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    const uniforms = (mesh.material as { uniforms?: Record<string, unknown> } | undefined)?.uniforms;
    if (!mesh.isMesh || !uniforms?.uArch || !uniforms.uPower) return;
    const at = mesh.getWorldPosition(new THREE.Vector3());
    const off = Math.hypot(at.x - place.x, at.z - place.z);
    if (off < nearestOff) {
      nearest = mesh;
      nearestOff = off;
    }
  });
  if (!nearest || nearestOff > 2) throw new Error('lab: village: the crypt\'s portal sheet wasn\'t found');
  return nearest;
}

/** The pixels over the middle of `sheet`, each a place in the frame's array. */
function sheetPixels(sheet: THREE.Mesh, width: number, height: number): number[] {
  const corners = sheet.geometry.getAttribute('position') as THREE.BufferAttribute;
  const size = new THREE.Box3().setFromBufferAttribute(corners);
  const pixels = new Set<number>();
  const across = size.max.x;
  const up = size.max.y;
  const steps = 60;
  for (let a = -steps; a <= steps; a++) {
    for (let b = -steps; b <= steps; b++) {
      const local = new THREE.Vector3((a / steps) * across * SHEET_READ.across, (b / steps) * up * SHEET_READ.up, 0);
      const pixel = pixelOf(sheet.localToWorld(local), width, height);
      if (pixel === null) continue;
      const column = (pixel / 4) % width;
      const row = Math.floor(pixel / 4 / width);
      if (column % SHEET_STRIDE === 0 && row % SHEET_STRIDE === 0) pixels.add(pixel);
    }
  }
  return [...pixels];
}

/** The share of the sheet's middle the frame shows the same with the sheet hidden: what's drawn over it. */
function overTheSheet(lab: Lab, sheet: THREE.Mesh): number {
  const canvas = drawFrame(lab);
  const shown = canvas.pixels.slice();
  sheet.visible = false;
  const hidden = drawFrame(lab).pixels;
  sheet.visible = true;
  const pixels = sheetPixels(sheet, canvas.width, canvas.height);
  if (pixels.length === 0) return 0;
  let same = 0;
  for (const pixel of pixels) {
    let changed = 0;
    for (let part = 0; part < 3; part++) changed += Math.abs(shown[pixel + part] - hidden[pixel + part]);
    if (changed / 3 < SHEET_CHANGE) same++;
  }
  return same / pixels.length;
}

/** Where he stands before the portal (m out from it, m aside), and from what view. */
const PORTAL_STANDS: readonly { out: number; aside: number; view: ViewMode }[] = [
  { out: 7, aside: 0, view: 'third' },
  { out: 10, aside: -3, view: 'third' },
  { out: 10, aside: 3, view: 'third' },
  { out: 5, aside: -2, view: 'top' },
  { out: 5, aside: 2, view: 'top' },
  { out: 9, aside: 0, view: 'top' },
];

/** Round the portal, nothing past it draws over its sheet. */
export async function portalOverAll(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdBlendedAmongGlows(canary);
  const place = portalPlace('crypt');
  const outX = Math.sin(place.facing);
  const outZ = Math.cos(place.facing);
  const lines: string[] = [];
  const moments: Pictured[] = [];
  let worst = 0;
  try {
    for (const stand of PORTAL_STANDS) {
      await viewBy(lab, stand.view);
      const x = place.x + outX * stand.out + outZ * stand.aside;
      const z = place.z + outZ * stand.out - outX * stand.aside;
      await standAt(lab, x, z, place.facing + Math.PI);
      const sheet = cryptSheet();
      G.player.obj.visible = false;
      const share = overTheSheet(lab, sheet);
      G.player.obj.visible = true;
      worst = Math.max(worst, share);
      const over = (share * 100).toFixed(1);
      lines.push(`${stand.view}, ${stand.out} m out, ${stand.aside} aside: ${over}% drawn over the sheet`);
      if (!canary && share === worst) {
        moments.length = 0;
        moments.push(await lab.screen('the crypt\'s portal, where the most stands over its sheet', []));
      }
    }
  } finally {
    holdBlendedAmongGlows(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
  const wrong = worst > MOST_OVER_THE_SHEET;
  if (canary) return { lines, problems: [], caught: wrong, moments: [] };
  const problems = wrong ? [`${(worst * 100).toFixed(1)}% over the portal's sheet`] : [];
  return { lines, problems, caught: null, moments };
}
