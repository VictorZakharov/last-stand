// A held skill's preview on the floor against what the cast does (tools/lab `held`). Starfall's ring is where its
// crystals surely strike: every foe inside it is struck on every cast (shown round all its crystals may strike, the
// ring took in foes no crystal struck). And every mark a preview lays on the floor (src/fx/floorPatch.ts), held across
// the dais's step, lies on each level it covers and down the step's face: no point of it under the floor (a mark laid
// by the ground's height at each of its points sloped from one level to the other across the step, its parts under
// the dais's top cut jagged notches along its edge) and none standing off it.
import * as THREE from 'three';
import type { Fixture, Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { SkillKey } from '../../../src/types';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { GROUND_EDGES, groundHeight } from '../../../src/world/ground';
import { isFloorPatch } from '../../../src/fx/floorPatch';
import { holdingKey } from './heldCooldown';

/** A round of `held`'s checks: its lines, its problems and its pictures. */
export interface Shown {
  lines: string[];
  problems: string[];
  moments: Pictured[];
}

/** A held skill of the hero's: its key, its `impl` and its name. */
export interface HeldSkill {
  key: SkillKey;
  impl: string;
  name: string;
}

/** The run set up afresh in `view` with a training dummy risen at the spot the skill is aimed at. */
export type SetUpWithDummy = (view: ViewMode) => Promise<Enemy>;

/** the frames the key is held before the preview is read, and the most frames a dummy may take to rise */
const HOLD_FRAMES = 12;
const RISE_FRAMES = 300;
/** the frames waited after a release for the crystals to land (the last falls 0.66 s after the cast) */
const STRIKE_FRAMES = 90;
/** Starfall's casts, each over the same foes */
const CASTS = 10;
/** where the foes stand round Starfall's aim, as shares of its ring's radius as drawn: inside it (its middle is the
 *  dummy the run is set up with), and outside it, where the scattered crystals may strike or not */
const INSIDE = [0.5, 0.8, 0.97];
const OUTSIDE = [1.2, 1.6];
/** the foes' bearings round the aim from the way the hero aims (deg), kept off the way back to him */
const BEARINGS = [-100, -60, -20, 20, 60, 100];

/** Starfall's ring as drawn, its radius (m): its mesh's scale across. */
function ringRadius(): number {
  const ring = G.scene.getObjectByName('starfall-preview');
  if (!ring?.visible) throw new Error('lab: held: Starfall\'s ring isn\'t shown while its key is held');
  return ring.scale.x;
}

/** A foe standing round the aim, how far out (a share of the ring's radius, and m), and the hits it has taken. */
interface Standing {
  share: number;
  distance: number;
  hits: () => number;
  struck: number;
}

/** Counts the hits `foe` takes from here on (a training dummy takes every hit and never dies). */
function countHits(foe: Enemy): () => number {
  let hits = 0;
  const take = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    hits++;
    return take(amount, info);
  };
  return () => hits;
}

/** The point `distance` m from `aim` at `bearing` deg from the way `hero` aims (from him to `aim`). */
function roundAim(aim: THREE.Vector3, from: THREE.Vector3, distance: number, bearing: number): THREE.Vector3 {
  const ahead = aim.clone().sub(from).setY(0).normalize();
  const turned = ahead.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(bearing));
  return aim.clone().addScaledVector(turned, distance).setY(0);
}

/** One cast of Starfall over `aim` as the player casts it: held, let go, and the crystals' fall waited out. */
async function castOnce(lab: Lab, skill: HeldSkill, aim: THREE.Vector3): Promise<void> {
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  await lab.step(HOLD_FRAMES, () => holdingKey(skill.key, aim));
  await lab.step(STRIKE_FRAMES, () => ({ aim }));
}

/** The foes as a line: each one's distance and the casts it was struck in. */
function describeStruck(standing: Standing[], radius: number): string {
  const each = standing.map((foe) => `${foe.distance.toFixed(2)} m ${foe.struck}/${CASTS}`);
  return `ring ${radius.toFixed(2)} m round the aim; struck in ${CASTS} casts, by distance: ${each.join(', ')}`;
}

/**
 * Starfall held over the dummy and cast `CASTS` times with foes round its aim inside and outside its ring as drawn:
 * every foe inside must be struck on every cast. With `planted` the ring is read as drawn round all its crystals may
 * strike (`scatter` + `radius`, as it was): a foe inside it missed must be found, or that's the problem.
 */
export async function starfallStrikes(
  lab: Lab, skill: HeldSkill, setUp: SetUpWithDummy, planted: boolean,
): Promise<Shown> {
  const middle = await setUp('top');
  const aim = middle.pos.clone();
  const def = G.player.skillAt(skill.key)!.def;
  await lab.step(HOLD_FRAMES, () => holdingKey(skill.key, aim));
  const radius = planted ? (def.scatter ?? 0) + (def.radius ?? 0) : ringRadius();
  await lab.step(STRIKE_FRAMES, () => ({ aim }));
  const shares = [...INSIDE, ...OUTSIDE];
  const foes = [middle];
  for (const [i, share] of shares.entries()) {
    foes.push(lab.spawnFoe('dummy', roundAim(aim, G.player.pos, share * radius, BEARINGS[i % BEARINGS.length])));
  }
  await lab.until(() => foes.every((foe) => !foe.spawning), RISE_FRAMES, 'the dummies never rose');
  const standing: Standing[] = foes.map((foe, i) => ({
    share: i ? shares[i - 1] : 0,
    distance: Math.hypot(foe.pos.x - aim.x, foe.pos.z - aim.z),
    hits: countHits(foe),
    struck: 0,
  }));
  for (let cast = 0; cast < CASTS; cast++) {
    const before = standing.map((foe) => foe.hits());
    await castOnce(lab, skill, aim);
    for (const [i, foe] of standing.entries()) {
      if (foe.hits() > before[i]) foe.struck++;
    }
  }
  const missed = standing.filter((foe) => foe.share < 1 && foe.struck < CASTS);
  const faults = missed.map((foe) => `a foe inside the ring, ${foe.distance.toFixed(2)} m from its middle, `
    + `struck in only ${foe.struck} of ${CASTS} casts`);
  if (planted) {
    const caught = faults.length > 0;
    const line = `  canary, the ring read as round all its crystals may strike: ${caught ? 'caught' : 'missed'}`;
    const problems = caught ? [] : [`${skill.name}: the canary's ring too large for its strikes went unseen`];
    return { lines: [line], problems, moments: [] };
  }
  const lines = [`  strikes: ${describeStruck(standing, radius)}`];
  return { lines, problems: faults.map((fault) => `${skill.name}: ${fault}`), moments: [] };
}

/** the spot aimed at for the round across the step: halfway across the dais's step, so a preview crosses both its
 *  edges; and the hero, off the dais and clear of props, facing it */
const STEP_SPOT = new THREE.Vector3((GROUND_EDGES[0] + GROUND_EDGES[1]) / 2, 0, 0.5);
const STEP_HERO: Fixture = { at: [GROUND_EDGES[1] + 3.5, 0.5], facing: -Math.PI / 2 };
/** the frames after the release the marks are read again (Quarry Mark's ring round the foe it marked) */
const AFTER_FRAMES = 20;
/** how far a mark's point may lie under the floor under it, and stand over the highest floor near it (m: a mark is
 *  laid 5 to 7 cm over the floor, and reaches as far past an edge, where the floor under it is the level below) */
const UNDER_MOST = 0.005;
const ABOVE_MOST = 0.1;
const NEAR = 0.1;
/** where a triangle is read: its middle, and its corners a fifth of the way in towards it */
const CORNER_IN = 0.2;

/** How the marks on the floor lay in a frame: the marks and triangles read, the levels their flat triangles lie on
 *  (cm over the floor's lowest) and their triangles standing up (down a step's face), the points under the floor and
 *  standing off it, and the worst of each (m). */
interface Lying {
  marks: string[];
  triangles: number;
  levels: Set<number>;
  faces: number;
  under: number;
  standing: number;
  worstUnder: number;
  worstAbove: number;
}

/** The highest floor within `NEAR` of (x, z) along either axis. */
function highestNear(x: number, z: number): number {
  const heights = [[0, 0], [NEAR, 0], [-NEAR, 0], [0, NEAR], [0, -NEAR]].map(([dx, dz]) => groundHeight(x + dx, z + dz));
  return Math.max(...heights);
}

/** The points a triangle (its world corners) is read at. */
function readPoints(corners: THREE.Vector3[]): THREE.Vector3[] {
  const middle = corners[0].clone().add(corners[1]).add(corners[2]).divideScalar(3);
  return [middle, ...corners.map((corner) => corner.clone().lerp(middle, CORNER_IN))];
}

/** Every mark laid on the floor that's drawn this frame, each triangle read against the floor under it. */
function marksLying(): Lying {
  const lying: Lying = {
    marks: [], triangles: 0, levels: new Set(), faces: 0, under: 0, standing: 0, worstUnder: 0, worstAbove: 0,
  };
  G.scene.updateMatrixWorld();
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isFloorPatch(mesh.geometry)) return;
    lying.marks.push(mesh.name || 'unnamed');
    const position = mesh.geometry.attributes.position;
    const count = Math.min(position.count, mesh.geometry.drawRange.count);
    for (let first = 0; first + 2 < count; first += 3) {
      const corners = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, first + k));
      for (const corner of corners) corner.applyMatrix4(mesh.matrixWorld);
      lying.triangles++;
      noteLevel(lying, corners);
      for (const point of readPoints(corners)) noteLying(lying, point);
    }
  });
  return lying;
}

/** Notes the level a flat triangle lies on, or a triangle standing up. */
function noteLevel(lying: Lying, corners: THREE.Vector3[]): void {
  const heights = corners.map((corner) => corner.y);
  if (Math.max(...heights) - Math.min(...heights) < 1e-3) lying.levels.add(Math.round(heights[0] * 100));
  else lying.faces++;
}

/** Notes how `point` of a mark lies against the floor under it and near it. */
function noteLying(lying: Lying, point: THREE.Vector3): void {
  const under = groundHeight(point.x, point.z) - point.y;
  const above = point.y - highestNear(point.x, point.z);
  lying.worstUnder = Math.max(lying.worstUnder, under);
  lying.worstAbove = Math.max(lying.worstAbove, above);
  if (under > UNDER_MOST) lying.under++;
  if (above > ABOVE_MOST) lying.standing++;
}

/** The faults in how the marks lay; laid across the step (`across`), any there are must lie on more than one of its
 *  levels, or the round measured nothing. */
function lyingFaults(lying: Lying, across = false): string[] {
  const faults: string[] = [];
  if (across && lying.marks.length && lying.levels.size < 2) faults.push('its marks lay on one level alone, not across the step (the round measured nothing)');
  const cm = (m: number) => `${(m * 100).toFixed(1)} cm`;
  if (lying.under) faults.push(`${lying.under} points of its marks under the floor (the worst ${cm(lying.worstUnder)})`);
  if (lying.standing) faults.push(`${lying.standing} points standing off the floor (the worst ${cm(lying.worstAbove)})`);
  return faults;
}

/** How the marks lay as a line. */
function describeLying(when: string, lying: Lying): string {
  if (!lying.marks.length) return `  across the step, ${when}: no mark on the floor`;
  const cm = (m: number) => (m * 100).toFixed(1);
  const levels = [...lying.levels].sort((a, b) => b - a).map((level) => `${level} cm`);
  return `  across the step, ${when}: ${lying.marks.join(', ')}: ${lying.triangles} triangles, flat on `
    + `${levels.join(', ')} and ${lying.faces} down its faces; `
    + `${lying.under} points under the floor, ${lying.standing} standing off it `
    + `(the most under ${cm(lying.worstUnder)} cm, over the floor near ${cm(lying.worstAbove)} cm)`;
}

/** Every mark drawn this frame laid as it was before they were cut along the steps, each point on the floor under it
 *  `lift` m over it (the canary), and a function that lays them back. */
function layPointByPoint(lift: number): () => void {
  const restores: (() => void)[] = [];
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isFloorPatch(mesh.geometry)) return;
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const kept = (position.array as Float32Array).slice();
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      position.setY(i, groundHeight(point.x, point.z) + lift);
    }
    restores.push(() => (position.array as Float32Array).set(kept));
  });
  return () => restores.forEach((restore) => restore());
}

/**
 * `skill` held across the dais's step from off it, in the top-down view (over the shoulder the crosshair aims, not the
 * frame's aim), and let go: every mark it lays on the floor must lie on it, held and just after. With `canary`, the
 * marks held are laid point by point as they were, which must be caught.
 */
export async function acrossTheStep(
  lab: Lab, fixture: Fixture, skill: HeldSkill, pictures: boolean, canary: boolean,
): Promise<Shown> {
  await lab.setup({ ...fixture, ...STEP_HERO, view: 'top' });
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const dummy = lab.spawnFoe('dummy', STEP_SPOT.clone());
  await lab.until(() => !dummy.spawning, RISE_FRAMES, 'the dummy never rose');
  const aim = dummy.pos.clone();
  await lab.step(HOLD_FRAMES, () => holdingKey(skill.key, aim));
  const held = marksLying();
  const lines = [describeLying('held', held)];
  const problems = lyingFaults(held, true).map((fault) => `${skill.name}, held across the step: ${fault}`);
  const moments = pictures ? [await lab.screen(`${skill.name}: held across the dais's step`)] : [];
  if (canary && held.marks.length) {
    const layBack = layPointByPoint(0.05);
    const caught = lyingFaults(marksLying()).length > 0;
    layBack();
    lines.push(`  canary, its marks laid point by point on the floor under them: ${caught ? 'caught' : 'missed'}`);
    if (!caught) problems.push(`${skill.name}: the canary's marks sloped across the step went unseen`);
  }
  await lab.step(AFTER_FRAMES, () => ({ aim }));
  const after = marksLying();
  lines.push(describeLying('let go', after));
  problems.push(...lyingFaults(after, true).map((fault) => `${skill.name}, let go across the step: ${fault}`));
  return { lines, problems, moments };
}
