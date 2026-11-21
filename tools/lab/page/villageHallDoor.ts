// `lab village --only hallDoorSight`: wall and column visibility near the Hall of Heroes door (issue #760).
// Checks four invariants from top-down view:
// 1. Standing outside in front of the hall (Chronicle, Save slots at close rotated zoom, West/East jambs, Door center,
//    Stash) keeps `hallFront`, `hallBeam`, and non-occluding portico columns 100% solid (zero bleed-through behind
//    the solid wall wings, and left portico columns stay 100% solid over the plinth).
// 2. Standing near either jamb, the doorway sight wedge stays true to the jambs instead of pulling toward the door
//    center and unfogging interior columns behind the solid masonry wings.
// 3. Inside the hall looking out the front, `hallFront` thins and unseen interior columns behind its solid wings draw
//    behind `hallFront` rather than painting opaque over the front wall.
// `--canary` enables all four legacy holds and must catch every fault class.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMERA } from '../../../src/data/balance';
import { HALL, TERRACE } from '../../../src/data/village';
import { setZoom } from '../../../src/core/renderer';
import { holdFrontOutsideThins, holdPorticoConeOutside, villageReport } from '../../../src/game/village';
import { hideHallColumns, holdRoomColumnsOverWalls, thinningLetGo, wholeShare } from '../../../src/core/seeThrough';
import { holdDoorWedgeCentered, seenShareAt } from '../../../src/core/sight';
import { drawFrame } from './light';
import { fromAboveAtNoon, LOOKING_IN, standFacing } from './villageHallOpens';
import type { LightsChecked } from './villageLights';

/** stands outside in front of the hall where `hallFront`, `hallBeam`, and portico columns stay solid */
const STAND_OUTSIDE: readonly { name: string; x: number; z: number; facing: number }[] = [
  { name: 'chronicle stand', x: -3.6, z: -12.75, facing: LOOKING_IN },
  { name: 'save slots (rotated)', x: -2.75, z: -13.9, facing: LOOKING_IN + 0.45 },
  { name: 'west jamb', x: -2.21, z: -14.02, facing: LOOKING_IN },
  { name: 'door center', x: -1.5, z: -14.1, facing: LOOKING_IN },
  { name: 'east jamb', x: -0.57, z: -13.89, facing: LOOKING_IN },
  { name: 'stash stand', x: 0.6, z: -12.75, facing: LOOKING_IN },
];

/** zooms checked at the stands outside the door (default lobby zoom and close zoom) */
const ZOOMS = [CAMERA.lobbyZoom, 0.25];
const ZOOM_FRAMES = 90;

/** stands just before each jamb and which side's wings sit behind the solid masonry */
const JAMB_STANDS: readonly {
  name: string;
  x: number;
  z: number;
  wingSide: -1 | 1;
  unseenColumns: readonly number[];
}[] = [
  { name: 'west jamb', x: -2.21, z: -14.02, wingSide: -1, unseenColumns: [0] },
  { name: 'east jamb', x: -0.57, z: -13.89, wingSide: 1, unseenColumns: [0, 1] },
];

const SHAFT_UPS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
const PORTICO_X = [3.3, 5.6];
const PORTICO_LEFT_X = [-4.8, -7.1];
const PORTICO_UP = [2.0, 2.5, 3.0];
const PORTICO_Z = -13.4;
const CLEAR_OF_PORTICO = 0.75;
const LEAST_DOOR_SEEN = 0.9;
const MOST_WING_SEEN = 0.15;
const LEAST_FRONT_THIN = 0.5;
const LEAST_SHAFTS = 4;
const LEAST_WALL_OVER_SHAFT = 0.015;
const MOST_BLEED = 0.005;
const MOST_PORTICO_DIFF = 0.005;

/** Pixel offset of `point` in `width x height`, or null outside the frame. */
function pixelOf(point: THREE.Vector3, width: number, height: number): number | null {
  const projected = point.clone().project(G.camera);
  const col = Math.floor(((projected.x + 1) / 2) * width);
  const row = Math.floor(((projected.y + 1) / 2) * height);
  if (col < 0 || col >= width || row < 0 || row >= height) return null;
  return (row * width + col) * 4;
}

/** Whether the camera ray to `point` passes through `hallFront`'s solid wing masonry (clear of doorway & portico). */
function crossesSolidFrontWing(point: THREE.Vector3, wingSide: -1 | 1): boolean {
  const eye = G.camera.position;
  if (eye.z <= HALL.door || point.z >= HALL.door) return false;
  const along = (HALL.door - eye.z) / (point.z - eye.z);
  const hitX = eye.x + (point.x - eye.x) * along;
  const hitY = eye.y + (point.y - eye.y) * along;
  const offMiddle = hitX - TERRACE.x;
  if (offMiddle * wingSide <= HALL.doorHalf + 0.4) return false;
  if (Math.abs(offMiddle) >= HALL.half - 0.3) return false;
  if (hitY <= TERRACE.high + 0.5 || hitY >= TERRACE.high + HALL.wallHigh - 0.2) return false;
  const toPortico = (PORTICO_Z - eye.z) / (point.z - eye.z);
  if (toPortico > 0 && toPortico < 1) {
    const px = eye.x + (point.x - eye.x) * toPortico - TERRACE.x;
    if (PORTICO_X.some((col) => Math.abs(Math.abs(px) - col) < CLEAR_OF_PORTICO)) return false;
  }
  return true;
}

/** Mean RGB channel difference between frames `a` and `b` over `offsets`. */
function meanPointDiff(a: ArrayLike<number>, b: ArrayLike<number>, offsets: readonly number[]): number {
  if (!offsets.length) return 0;
  let sum = 0;
  for (const px of offsets) {
    let d = 0;
    for (let ch = 0; ch < 3; ch++) d += Math.abs(a[px + ch] - b[px + ch]);
    sum += d / 3;
  }
  return sum / offsets.length;
}

/** Screen offsets of interior column shaft points lying behind `hallFront`'s solid wing(s). */
function wingShaftOffsets(width: number, height: number, wings: readonly (-1 | 1)[]): number[] {
  const offsets: number[] = [];
  for (const wingSide of wings) {
    const colX = TERRACE.x + wingSide * HALL.columnX;
    for (let i = 0; i < 3; i++) {
      for (const up of SHAFT_UPS) {
        const point = new THREE.Vector3(colX, TERRACE.high + up, HALL.columnZ[i]);
        if (!crossesSolidFrontWing(point, wingSide)) continue;
        const px = pixelOf(point, width, height);
        if (px !== null) offsets.push(px);
      }
    }
  }
  return offsets;
}

/** Mean RGB difference across interior column shaft points behind solid `hallFront` when columns are hidden. */
function bleedBehindSolidFrontDiff(lab: Lab, wings: readonly (-1 | 1)[]): { diff: number; count: number } {
  const asDrawn = drawFrame(lab);
  const drawn = asDrawn.pixels.slice();
  const offsets = wingShaftOffsets(asDrawn.width, asDrawn.height, wings);
  hideHallColumns(true);
  const withoutCols = drawFrame(lab).pixels;
  hideHallColumns(false);
  return { diff: meanPointDiff(drawn, withoutCols, offsets), count: offsets.length };
}

/** Mean RGB difference across visible left portico column shafts against `thinningLetGo()`. */
function porticoSolidDiff(lab: Lab): { diff: number; count: number } {
  const asDrawn = drawFrame(lab);
  const drawn = asDrawn.pixels.slice();
  const offsets: number[] = [];
  for (const x of PORTICO_LEFT_X) {
    for (const y of PORTICO_UP) {
      const px = pixelOf(new THREE.Vector3(x, y, PORTICO_Z), asDrawn.width, asDrawn.height);
      if (px !== null) offsets.push(px);
    }
  }
  const restore = thinningLetGo();
  const solid = drawFrame(lab).pixels;
  restore();
  return { diff: meanPointDiff(drawn, solid, offsets), count: offsets.length };
}

/** Mean RGB difference across interior column shaft points hidden behind thinned `hallFront` when `hallFront` hides. */
function wallOverShaftDiff(lab: Lab, front: THREE.Object3D, wingSide: -1 | 1): { diff: number; count: number } {
  const withWall = drawFrame(lab);
  const drawn = withWall.pixels.slice();
  const offsets = wingShaftOffsets(withWall.width, withWall.height, [wingSide]);
  front.visible = false;
  const withoutWall = drawFrame(lab).pixels;
  front.visible = true;
  return { diff: meanPointDiff(drawn, withoutWall, offsets), count: offsets.length };
}

/** Wait for camera zoom transition to settle. */
async function zoomTo(lab: Lab, zoom: number): Promise<void> {
  setZoom(zoom);
  await lab.step(ZOOM_FRAMES);
}

/** Hall of Heroes front wall, portico columns, and doorway sight near Chronicle & Stash. */
export async function hallDoorSight(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAtNoon(lab, async () => {
    const front = G.arena.village?.hallCutaway[1];
    if (!front) throw new Error('lab: village: no hall front wall found');
    holdFrontOutsideThins(canary);
    holdPorticoConeOutside(canary);
    holdDoorWedgeCentered(canary);
    holdRoomColumnsOverWalls(canary);
    const lines: string[] = [];
    const problems: string[] = [];
    const moments: Pictured[] = [];
    let wallCaught = false;
    let porticoCaught = false;
    let wedgeCaught = false;
    let orderCaught = false;
    try {
      for (const zoom of ZOOMS) {
        await zoomTo(lab, zoom);
        for (const stand of STAND_OUTSIDE) {
          await standFacing(lab, stand.x, stand.z, stand.facing);
          const frontShare = wholeShare('hallFront');
          const beamShare = wholeShare('hallBeam');
          const colShare = wholeShare('hallColumn');
          const colSight = (villageReport().columns as { sight: number }).sight;
          const msg = `${stand.name} (zoom ${zoom}): hallFront ${frontShare.toFixed(2)}, hallBeam ${beamShare.toFixed(2)}, `
            + `hallColumn ${colShare.toFixed(2)}, colSight ${colSight.toFixed(2)}`;
          lines.push(msg);
          if (frontShare > 0 || beamShare > 0) {
            wallCaught = true;
            if (!canary) problems.push(`${msg}: front wall or beam thinned from outside in front`);
          }
          if (colShare > 0 || colSight > 0) {
            porticoCaught = true;
            if (!canary) problems.push(`${msg}: portico columns thinned when not hiding the hero`);
          }
          if (!canary && zoom === 0.25 && (stand === STAND_OUTSIDE[0] || stand === STAND_OUTSIDE[1] || stand === STAND_OUTSIDE[5])) {
            moments.push(await lab.screen(`${stand.name} (close zoom)`, []));
          }
          if (zoom === 0.25 && stand.name === 'save slots (rotated)') {
            const bleed = bleedBehindSolidFrontDiff(lab, [-1, 1]);
            if (bleed.count < 1) throw new Error('lab: village: no wing shaft points visible at save slots (rotated)');
            const bleedMsg = `${stand.name} (zoom 0.25): interior column bleed over ${bleed.count} wing points `
              + `${bleed.diff.toFixed(3)} (at most ${MOST_BLEED})`;
            lines.push(bleedMsg);
            if (bleed.diff > MOST_BLEED) {
              wallCaught = true;
              if (!canary) problems.push(bleedMsg);
            }
            const portico = porticoSolidDiff(lab);
            if (portico.count < 1) throw new Error('lab: village: no left portico column points visible at save slots');
            const porticoMsg = `${stand.name} (zoom 0.25): left portico diff vs solid over ${portico.count} points `
              + `${portico.diff.toFixed(3)} (at most ${MOST_PORTICO_DIFF})`;
            lines.push(porticoMsg);
            if (portico.diff > MOST_PORTICO_DIFF) {
              porticoCaught = true;
              if (!canary) problems.push(porticoMsg);
            }
          }
        }
      }
      for (const jamb of JAMB_STANDS) {
        await standFacing(lab, jamb.x, jamb.z, LOOKING_IN);
        const doorCenter = seenShareAt(TERRACE.x, HALL.columnZ[0]);
        if (doorCenter < LEAST_DOOR_SEEN) {
          throw new Error(`lab: village: ${jamb.name} did not see doorway center (${doorCenter.toFixed(2)})`);
        }
        const bleed = bleedBehindSolidFrontDiff(lab, [jamb.wingSide]);
        if (bleed.count < LEAST_SHAFTS) {
          throw new Error(`lab: village: ${jamb.name} only found ${bleed.count} shaft points behind solid wing`);
        }
        const bleedMsg = `${jamb.name} (zoom 0.25): interior column bleed over ${bleed.count} wing points `
          + `${bleed.diff.toFixed(3)} (at most ${MOST_BLEED})`;
        lines.push(bleedMsg);
        if (bleed.diff > MOST_BLEED) {
          wallCaught = true;
          if (!canary) problems.push(bleedMsg);
        }
        for (const colIdx of jamb.unseenColumns) {
          const unseen = seenShareAt(TERRACE.x + jamb.wingSide * HALL.columnX, HALL.columnZ[colIdx]);
          const msg = `${jamb.name} unseen col ${colIdx}: seen ${unseen.toFixed(2)} (at most ${MOST_WING_SEEN})`;
          lines.push(msg);
          if (unseen > MOST_WING_SEEN) {
            wedgeCaught = true;
            if (!canary) problems.push(msg);
          }
        }
        if (!canary) moments.push(await lab.screen(`${jamb.name} (close zoom)`, []));
      }
      await zoomTo(lab, CAMERA.lobbyZoom);
      await standFacing(lab, TERRACE.x, HALL.inFront - 2.0, LOOKING_IN);
      const insideFront = wholeShare('hallFront');
      if (insideFront < LEAST_FRONT_THIN) {
        throw new Error(`lab: village: inside hall did not thin hallFront (${insideFront.toFixed(2)})`);
      }
      const order = wallOverShaftDiff(lab, front, -1);
      if (order.count < LEAST_SHAFTS) {
        throw new Error(`lab: village: inside hall only found ${order.count} shaft points behind thinned wing`);
      }
      const orderMsg = `inside hall (lobby zoom): wall over ${order.count} shaft points diff ${order.diff.toFixed(3)} `
        + `(at least ${LEAST_WALL_OVER_SHAFT})`;
      lines.push(orderMsg);
      if (order.diff < LEAST_WALL_OVER_SHAFT) {
        orderCaught = true;
        if (!canary) problems.push(`${orderMsg}: interior columns drew over thinned wall`);
      }
      if (!canary) moments.push(await lab.screen('inside hall near front wall', []));
    } finally {
      front.visible = true;
      hideHallColumns(false);
      holdFrontOutsideThins(false);
      holdPorticoConeOutside(false);
      holdDoorWedgeCentered(false);
      holdRoomColumnsOverWalls(false);
      await zoomTo(lab, CAMERA.lobbyZoom);
      await standFacing(lab, 0, 4.5, 0);
    }
    if (canary) {
      return {
        lines,
        problems: [],
        caught: wallCaught && porticoCaught && wedgeCaught && orderCaught,
        moments: [],
      };
    }
    return { lines, problems, caught: null, moments };
  });
}
