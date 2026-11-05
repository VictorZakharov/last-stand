// `lab village`'s fog of war as he walks (from play, "fog of war should ease in/out, not jerk", "we need to stabilize
// fog of war, sometimes it's jerking left and right as I'm walking in straight line", "fire should not animate when
// in fog of war", "and tree leaves should be grey too ?"). `fogHoldsSteady`: he walks straight past a cottage's
// corner, and over a grid of the ground round him each frame reads how seen each place is: none may leap in a frame,
// or go back and forth. `canary` shows the rays as they're cast, as they were. `firesStillInFog`: a fire he can't see
// plays no frame of its flames, one he can does (`canary` holds the fog off). `leavesInFog`: stood by the hall's
// walls at noon, all but the door's cone unseen, little of the frame is left green (`canary` holds the fog off).
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { CAMPFIRE, COTTAGES, HALL, TERRACE, type Cottage } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { CAMERA } from '../../../src/data/balance';
import { faceCamera, setZoom, viewMode } from '../../../src/core/renderer';
import {
  holdEavesAsWithin, holdFarWallByRays, holdRoofByRays, holdSightOff, holdSightSharp, seenShareAt,
} from '../../../src/core/sight';
import { holdRoofDepth, holdRoofGhost } from '../../../src/core/seeThrough';
import type { SightWall } from '../../../src/core/sight';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle, walked and read; how far off the cottage's corner he walks past it (m) */
const SETTLE = 60;
const WALKED = 150;
const PAST_CORNER = 3;
/** the grid read round him: how far out each way and every how far (m) */
const GRID_OUT = 24;
const GRID_STEP = 1;
/** the most a place's share of being seen may change in a frame, and how far a change must go to count as a way back */
const MOST_IN_A_FRAME = 0.34;
const WAY_BACK = 0.15;
/** the most times a place may turn back as he walks straight (as they were, cast and shown at once: 42) */
const MOST_TURNS = 3;
/** how near a wall's line a place isn't read (m): under the eaves, and on the line of the wall he's crossing the shadow
 *  of a ray along it reaches anything */
const OFF_WALLS = 1;

/** The hero stood at (x, z) facing `facing`, the camera behind him, let settle. */
async function standAt(lab: Lab, x: number, z: number, facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** How far (x, z) is from the line of a wall. */
function offWall(wall: SightWall, x: number, z: number): number {
  const ex = wall.x1 - wall.x0;
  const ez = wall.z1 - wall.z0;
  const along = ((x - wall.x0) * ex + (z - wall.z0) * ez) / (ex * ex + ez * ez);
  const part = Math.max(0, Math.min(1, along));
  return Math.hypot(x - wall.x0 - ex * part, z - wall.z0 - ez * part);
}

/** Each place's way so far as he walks: its last turning value, its way (-1, 0, 1) and its turns. */
interface PlaceRead { was: number; held: number; way: number; turns: number; leap: number; shares: number[] }

/** One place's share read this frame. */
function readPlace(place: PlaceRead, share: number): void {
  place.leap = Math.max(place.leap, Math.abs(share - place.was));
  place.shares.push(share);
  place.was = share;
  const moved = share - place.held;
  if (Math.abs(moved) < WAY_BACK) return;
  const way = Math.sign(moved);
  if (place.way !== 0 && way !== place.way) place.turns++;
  place.way = way;
  place.held = share;
}

/** He walks straight past a cottage's corner: no place in the fog leaps or goes back and forth. */
export async function fogHoldsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const cottage = COTTAGES[0];
  holdHour(12);
  holdSightSharp(canary);
  try {
    await viewBy(lab, 'top');
    await standAt(lab, cottage.x - 8, cottage.z + PAST_CORNER + 3, Math.PI / 2);
    const places: PlaceRead[] = [];
    const spots: [number, number][] = [];
    const middle = G.player.pos.clone();
    const walls = G.arena.village!.sight.walls;
    for (let x = -GRID_OUT; x <= GRID_OUT; x += GRID_STEP) {
      for (let z = -GRID_OUT; z <= GRID_OUT; z += GRID_STEP) {
        const spot: [number, number] = [middle.x + x, middle.z + z];
        if (walls.some((wall) => offWall(wall, spot[0], spot[1]) < OFF_WALLS)) continue;
        spots.push(spot);
        const share = seenShareAt(spot[0], spot[1]);
        places.push({ was: share, held: share, way: 0, turns: 0, leap: 0, shares: [] });
      }
    }
    const from = G.player.pos.x;
    await lab.step(WALKED, () => ({ keys: ['w'] }), () => {
      spots.forEach((spot, i) => readPlace(places[i], seenShareAt(spot[0], spot[1])));
    });
    const walked = G.player.pos.x - from;
    const leap = Math.max(...places.map((place) => place.leap));
    const turns = Math.max(...places.map((place) => place.turns));
    const worst = places.indexOf(places.reduce((most, place) => (place.turns > most.turns ? place : most)));
    const turning = places.filter((place) => place.turns > MOST_TURNS).length;
    const line = `the fog as he walks ${walked.toFixed(1)} m past a corner: a place's most in a frame `
      + `${leap.toFixed(2)} (at most ${MOST_IN_A_FRAME}), its most turns back ${turns} (at most ${MOST_TURNS}), `
      + `at (${spots[worst][0].toFixed(0)}, ${spots[worst][1].toFixed(0)}), ${turning} places of ${places.length} `
      + `turning, he went from (${middle.x.toFixed(1)}, ${middle.z.toFixed(1)})`;
    const wrong = leap > MOST_IN_A_FRAME || turns > MOST_TURNS;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    const problems = wrong ? [line] : [];
    if (wrong) {
      const shares = places[worst].shares.map((share) => share.toFixed(2)).join(' ');
      return { lines: [line, `that place, frame by frame: ${shares}`], problems, caught: null, moments: [] };
    }
    if (Math.abs(walked) < 3) problems.push(`the fog: he walked only ${walked.toFixed(1)} m`);
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    holdSightSharp(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** A fire's flames: its uniforms, by the place it burns at. */
function flamesNear(x: number, z: number): { uFrame: { value: number } } {
  let found: { uFrame: { value: number } } | null = null;
  let nearest = 3;
  G.scene.traverse((object) => {
    const uniforms = ((object as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
    const centre = uniforms?.uCentre?.value as THREE.Vector3 | undefined;
    if (!uniforms?.uFrame || !centre) return;
    const away = Math.hypot(centre.x - x, centre.z - z);
    if (away < nearest) {
      nearest = away;
      found = uniforms as unknown as { uFrame: { value: number } };
    }
  });
  if (!found) throw new Error('lab: village: no flames at the campfire');
  return found as { uFrame: { value: number } };
}

/** The campfire's flames stand still from the back of the hall, and burn beside it. */
export async function firesStillInFog(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const flames = flamesNear(CAMPFIRE[0], CAMPFIRE[1]);
  holdHour(12);
  holdSightOff(canary);
  try {
    await viewBy(lab, 'top');
    await standAt(lab, TERRACE.x, HALL.daisZ + 2, 0);
    const before = flames.uFrame.value;
    await lab.step(30);
    const inFog = Math.abs(flames.uFrame.value - before);
    await standAt(lab, CAMPFIRE[0] + 2.4, CAMPFIRE[1], 0);
    const seenFrom = flames.uFrame.value;
    await lab.step(30);
    const seen = Math.abs(flames.uFrame.value - seenFrom);
    const line = `the campfire's flames in 30 frames: ${inFog.toFixed(2)} frames of its loop in the fog, `
      + `${seen.toFixed(2)} beside it`;
    const moved = inFog > 0.001;
    if (canary) return { lines: [line], problems: [], caught: moved, moments: [] };
    const problems: string[] = [];
    if (moved) problems.push(`${line}: it burns on in the fog`);
    if (seen < 0.1) problems.push(`${line}: it stands still in sight`);
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    holdSightOff(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** how much greener than its red and blue a pixel is to count as green, and at least how light; the most of the frame
 *  that may be green with him at the back of the hall */
const GREENER = 1.3;
const LEAST_GREEN = 0.12;
const MOST_GREEN = 0.01;

/** whether a pixel is plainly green, by its channels */
function isGreen(red: number, middle: number, blue: number): boolean {
  return middle > LEAST_GREEN && middle > red * GREENER && middle > blue * GREENER;
}

/** how far past a cottage's back wall the ground is read (m: seen through the eaves from above it lies metres past
 *  the wall, nearer than that the wall itself is what's drawn there), every how far along it, the frames the fog is
 *  given to ease off, and the least of their light the fog must take from those pixels, across the cottages' middle */
const PAST_BACK = [1.4, 1.8, 2.2, 2.6, 3];
const ALONG_BACK = 0.4;
const FOG_EASES = 40;
const LEAST_TAKEN = 0.05;

/** The light of `points` on the ground in the frame, the sum of their pixels'. */
function lightAt(lab: Lab, points: THREE.Vector3[]): number {
  const canvas = drawFrame(lab);
  let light = 0;
  let read = 0;
  for (const point of points) {
    const place = point.clone().project(G.camera);
    const column = Math.floor((place.x + 1) / 2 * canvas.width);
    const row = Math.floor((place.y + 1) / 2 * canvas.height);
    if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) continue;
    const pixel = (row * canvas.width + column) * 4;
    light += canvas.pixels[pixel] + canvas.pixels[pixel + 1] + canvas.pixels[pixel + 2];
    read++;
  }
  if (read === 0) throw new Error('lab: village: no ground past the cottage in the frame');
  return light;
}

/** The share of their light the fog takes from the ground past `c`'s back wall, him stood before its front. */
async function takenPastBack(lab: Lab, c: Cottage): Promise<number> {
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  const turned = (x: number, z: number): [number, number] => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
  const [x, z] = turned(0, halfD + 3);
  await standAt(lab, x, z, c.facing + Math.PI);
  const points: THREE.Vector3[] = [];
  for (let along = -halfW; along <= halfW; along += ALONG_BACK) {
    for (const past of PAST_BACK) {
      const [px, pz] = turned(along, -halfD - past);
      points.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.1, pz));
    }
  }
  const fogged = lightAt(lab, points);
  holdSightOff(true);
  await lab.step(FOG_EASES);
  const clear = lightAt(lab, points);
  holdSightOff(false);
  await lab.step(FOG_EASES);
  return 1 - fogged / clear;
}

/** From before each cottage, what's past its back wall lies in the fog seen through its ghost of a roof too. */
export async function fogUnderRoofs(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdRoofDepth(canary);
  try {
    await viewBy(lab, 'top');
    let least = 1;
    const all: number[] = [];
    let shot: Awaited<ReturnType<Lab['screen']>> | null = null;
    for (const cottage of COTTAGES) {
      all.push(await takenPastBack(lab, cottage));
      shot ??= canary ? null : await lab.screen('before a cottage, what shows through its roof in the fog', []);
    }
    least = [...all].sort((a, b) => a - b)[all.length >> 1];
    const line = `past a cottage's back wall, seen through its roof: across the cottages the fog takes `
      + `${(least * 100).toFixed(0)}% of its light (at least ${LEAST_TAKEN * 100}%): `
      + all.map((share) => (share * 100).toFixed(0)).join(' ');
    const wrong = least < LEAST_TAKEN;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: shot ? [shot] : [] };
  } finally {
    holdRoofDepth(false);
    holdSightOff(false);
    holdHour(null);
    // (the view turned back, for the checks after this one to read a side of the hall as they set out to)
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** the most of the ground under an eave he can't see past that may show plainly green */
const MOST_GREEN_UNDER_EAVES = 0.05;

/** how far round him the ground seen through a roof stays by the rays (m), past which it's read */
const ROOF_READ_OFF = 2;
/** the most of the ground past a cottage's back wall, seen through its roof, that may show plainly green */
const MOST_GREEN_THROUGH_ROOF = 0.05;
/** how far along its back wall the ground is read (a share of its half width, from the far side) */
const THROUGH_ROOF_ALONG = [-0.8, -0.6, -0.4, -0.2, 0, 0.2];

/** how far the roofs are thinned for what's under them to be read: at the game's, too little shows to tell the rule on
 *  from the rule off */
const READ_THROUGH_GHOST = 0.62;
/** how far past a cottage's back wall the ground is read through the ghost of that wall (m) */
const PAST_WALL_GHOST = [0.3, 0.8, 1.3, 1.8, 2.3, 2.8];
/** how high a cottage's walls stand, from what's off the ground: a ray crossing them here crosses the wall's ghost */
const WALL_GHOST_FROM = 0.7;
const WALL_GHOST_TO = 3;
/** the most green may stand over blue there on average, over the cottages: fixed -0.0179, by the rays -0.0164, as the
 *  roof's own colour is most of those pixels; the lab's frames repeat to the last bit, so a narrow margin holds */
const MOST_GREEN_OVER_BLUE = -0.017;
/** the hour and zoom it's read at, the owner's kind: by day from the lab's zoom the fog hardly shows on it */
const FAR_WALL_HOUR = 0;
const FAR_WALL_ZOOM = 0.8;
/** the frames the zoom takes to glide back */
const ZOOM_SETTLES = 120;

/** The share of the ground past `c`'s back wall, seen through its roof, that shows green, him stood at its corner
 *  there, from where he sees along all of it: `throughWall` the ground seen through that wall's ghost too. */
async function greenThroughRoof(lab: Lab, c: Cottage, throughWall = false): Promise<number> {
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  const turned = (x: number, z: number): [number, number] => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
  const [x, z] = turned(halfW + 0.35, -halfD - 0.35);
  await standAt(lab, x, z, c.facing + Math.PI);
  const points: THREE.Vector3[] = [];
  for (const along of THROUGH_ROOF_ALONG) {
    for (const past of throughWall ? PAST_WALL_GHOST : PAST_BACK) {
      const [px, pz] = turned(along * halfW, -halfD - past);
      if (Math.hypot(px - x, pz - z) > ROOF_READ_OFF) {
        points.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.1, pz));
      }
    }
  }
  const under = points.filter((point) => (throughWall ? overRoofAndWall(point) : overRoofPixel(point)));
  if (throughWall) {
    if (under.length === 0) throw new Error("lab: village: no ground seen through a wall's ghost");
    return greenOverBlueAt(lab, under);
  }
  return under.length ? greenAt(lab, under) : 0;
}

/** Whether a ray from the eye to `point` meets a roof and then a wall's ghost. */
function overRoofAndWall(point: THREE.Vector3): boolean {
  const from = G.camera.position;
  const way = point.clone().sub(from).normalize();
  const hits = new THREE.Raycaster(from, way, 0, point.distanceTo(from)).intersectObject(G.scene, true);
  const blended = hits.filter((hit) => {
    const { material } = hit.object as THREE.Mesh;
    return !Array.isArray(material) && material?.transparent === true;
  });
  const isRoof = (hit: THREE.Intersection): boolean => {
    return ((hit.object as THREE.Mesh).material as THREE.Material).blending === THREE.CustomBlending;
  };
  const overWall = blended.some((hit) => {
    return !isRoof(hit) && hit.point.y > WALL_GHOST_FROM && hit.point.y < WALL_GHOST_TO;
  });
  return blended.some(isRoof) && overWall;
}

/** The ground seen through a roof and the ghost of the wall past it lies in the fog too: that wall keeps its depth, so
 *  the rays read it, and a strip of grass stood across the roof, down to that wall's top, a review. `canary` has the
 *  rays read it, as they did. */
export async function farWallInFog(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(FAR_WALL_HOUR);
  holdFarWallByRays(canary);
  holdRoofGhost(READ_THROUGH_GHOST);
  try {
    await viewBy(lab, 'top');
    setZoom(FAR_WALL_ZOOM);
    const all: number[] = [];
    for (const cottage of COTTAGES) all.push(await greenThroughRoof(lab, cottage, true));
    const mean = all.reduce((sum, over) => sum + over, 0) / all.length;
    const shares = all.map((over) => over.toFixed(4)).join(' ');
    const line = `past a cottage's back wall, through its roof and that wall's ghost, from its corner: `
      + `green over blue ${mean.toFixed(4)} on average (at most ${MOST_GREEN_OVER_BLUE}): ${shares}`;
    const wrong = mean > MOST_GREEN_OVER_BLUE;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
  } finally {
    holdFarWallByRays(false);
    holdRoofGhost(null);
    setZoom(CAMERA.lobbyZoom);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
    // (the zoom glides, and a check after this one read the frame part way back)
    await lab.step(ZOOM_SETTLES);
  }
}

/** Whether a ray from the eye to `point` meets a roof, from above: only those are seen through one. */
function overRoofPixel(point: THREE.Vector3): boolean {
  const from = G.camera.position;
  const way = point.clone().sub(from).normalize();
  const hits = new THREE.Raycaster(from, way, 0, point.distanceTo(from)).intersectObject(G.scene, true);
  return hits.some((hit) => {
    const { material } = hit.object as THREE.Mesh;
    return !Array.isArray(material) && material?.blending === THREE.CustomBlending;
  });
}

/** The ground seen through a roof away from him lies in the fog, whatever the rays say: by the rays, the edge of what
 *  he sees past a house's corner stood across its roof as a straight cut, from play, "why we cut off a portion /
 *  triangle ?". `canary` has it read by the rays, as it was. */
export async function roofReadsAsOne(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdRoofByRays(canary);
  holdRoofGhost(READ_THROUGH_GHOST);
  try {
    await viewBy(lab, 'top');
    const all: number[] = [];
    let shot: Awaited<ReturnType<Lab['screen']>> | null = null;
    for (const cottage of COTTAGES) {
      all.push(await greenThroughRoof(lab, cottage));
      shot ??= canary ? null : await lab.screen("at a cottage's corner, its roof from the far end", []);
    }
    const worst = Math.max(...all);
    const shares = all.map((share) => (share * 100).toFixed(0)).join(' ');
    const line = `past a cottage's back wall, through its roof, from its corner: `
      + `${(worst * 100).toFixed(0)}% plainly green `
      + `(at most ${MOST_GREEN_THROUGH_ROOF * 100}%): ${shares}`;
    const wrong = worst > MOST_GREEN_THROUGH_ROOF;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: shot ? [shot] : [] };
  } finally {
    holdRoofByRays(false);
    holdRoofGhost(null);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** How far green stands over blue at `points`' pixels, on average: the fog's colour is blue, grass green. */
function greenOverBlueAt(lab: Lab, points: THREE.Vector3[]): number {
  const canvas = drawFrame(lab);
  let over = 0;
  let read = 0;
  for (const point of points) {
    const place = point.clone().project(G.camera);
    const column = Math.floor(((place.x + 1) / 2) * canvas.width);
    const row = Math.floor(((place.y + 1) / 2) * canvas.height);
    if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) continue;
    const pixel = (row * canvas.width + column) * 4;
    over += canvas.pixels[pixel + 1] - canvas.pixels[pixel + 2];
    read++;
  }
  if (read === 0) throw new Error("lab: village: no ground through a wall's ghost in the frame");
  return over / read;
}

/** The share of `points`' pixels that's plainly green. */
function greenAt(lab: Lab, points: THREE.Vector3[]): number {
  const canvas = drawFrame(lab);
  let green = 0;
  let read = 0;
  for (const point of points) {
    const place = point.clone().project(G.camera);
    const column = Math.floor(((place.x + 1) / 2) * canvas.width);
    const row = Math.floor(((place.y + 1) / 2) * canvas.height);
    if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) continue;
    const pixel = (row * canvas.width + column) * 4;
    read++;
    if (isGreen(canvas.pixels[pixel], canvas.pixels[pixel + 1], canvas.pixels[pixel + 2])) green++;
  }
  if (read === 0) throw new Error('lab: village: no ground under the eave in the frame');
  return green / read;
}

/** The share of the ground under `c`'s eave at its side that shows green, him stood before its front towards that side:
 *  the camera past the wall there, as from before its middle the wall stands over that ground. */
async function greenUnderEaves(lab: Lab, c: Cottage): Promise<number> {
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  const turned = (x: number, z: number): [number, number] => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
  const [x, z] = turned(halfW * 0.7, halfD + 0.8);
  await standAt(lab, x, z, c.facing + Math.PI);
  const points: THREE.Vector3[] = [];
  for (let across = -halfD * 0.8; across <= -halfD * 0.2; across += ALONG_BACK) {
    for (const out of [0.5, 0.75, 1]) {
      const [px, pz] = turned(halfW + out, across);
      points.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.1, pz));
    }
  }
  return greenAt(lab, points);
}

/** From before each cottage, the ground under its eaves past its walls lies in the fog as all round it does. */
export async function fogUnderEaves(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdEavesAsWithin(canary);
  try {
    await viewBy(lab, 'top');
    const all: number[] = [];
    for (const cottage of COTTAGES) all.push(await greenUnderEaves(lab, cottage));
    const worst = Math.max(...all);
    const shares = all.map((share) => (share * 100).toFixed(0)).join(' ');
    const line = `under a cottage's side eave, past its wall: ${(worst * 100).toFixed(0)}% plainly green: ${shares}`;
    const wrong = worst > MOST_GREEN_UNDER_EAVES;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    const shot = await lab.screen('before a cottage, the ground under its far eaves', []);
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [shot] };
  } finally {
    holdEavesAsWithin(false);
    holdSightOff(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** The share of `canvas` that's plainly green. */
function greenShare(canvas: { width: number; height: number; pixels: Uint8Array | Float32Array }): number {
  const scale = canvas.pixels instanceof Uint8Array ? 255 : 1;
  let green = 0;
  const count = canvas.width * canvas.height;
  for (let pixel = 0; pixel < count; pixel++) {
    const red = canvas.pixels[pixel * 4] / scale;
    const middle = canvas.pixels[pixel * 4 + 1] / scale;
    const blue = canvas.pixels[pixel * 4 + 2] / scale;
    if (isGreen(red, middle, blue)) green++;
  }
  return green / count;
}

/** where he stands before a cottage, for the ground past it (a review: a green band behind one, on WebGPU) */
const BESIDE_A_COTTAGE: [number, number] = [16.5, -3];

/** where he stands in the hall, each by a wall of it: the most outside is in the frame there */
function standsInTheHall(): [number, number][] {
  const inside = HALL.half - 1.5;
  return [
    [TERRACE.x + inside, HALL.daisZ + 4],
    [TERRACE.x - inside, HALL.daisZ + 4],
    [TERRACE.x + inside, HALL.wall + 2],
    [TERRACE.x - inside, HALL.wall + 2],
  ];
}

/** From by the hall's walls, the grass and the trees' crowns outside it are grey. */
export async function leavesInFog(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdSightOff(canary);
  try {
    await viewBy(lab, 'top');
    let share = 0;
    let shot: Awaited<ReturnType<Lab['screen']>> | null = null;
    for (const [x, z] of standsInTheHall()) {
      await standAt(lab, x, z, -Math.PI / 2);
      const here = greenShare(drawFrame(lab));
      if (here < share) continue;
      share = here;
      shot = canary ? null : await lab.screen(`in the hall at (${x}, ${z}), the greenest of its stands`, []);
    }
    const [besideX, besideZ] = BESIDE_A_COTTAGE;
    await standAt(lab, besideX, besideZ, 0);
    const beside = canary ? null : await lab.screen('before a cottage, the ground past it in the fog', []);
    const line = `from in the hall at most ${(share * 100).toFixed(2)}% of the frame is green `
      + `(at most ${MOST_GREEN * 100}%)`;
    const green = share > MOST_GREEN;
    if (canary) return { lines: [line], problems: [], caught: green, moments: [] };
    const moments = [shot, beside].filter((moment) => moment !== null);
    return { lines: [line], problems: green ? [line] : [], caught: null, moments };
  } finally {
    holdSightOff(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
