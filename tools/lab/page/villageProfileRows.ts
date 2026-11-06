// `lab village --only profileRows`: each of the perf overlay's Profile rows (`steps` in ui/perfProfile.ts) switched off
// and back as the Profile switches it, by midnight over the shoulder on Low, the quality a phone profiles at (from
// play: "ok but I want 60 fps", the S25's Profile on Low leaving 25 of its 33 ms in no row, so rows were added to split
// the frame). Each row: the frame with it off against the frame drawn at the same moment with it back (two moments
// apart, the grass and the water moved 65% of the frame), and the programs compiled, none. The rows that split the
// frame are held to what they say, and the lamps out: the scene not drawn changes most of the frame; the lamps out a
// twentieth of it at least; the post chain not drawn leaves the screen as it was while off; the heroes not updated
// stop him as he walks. A row off already, or not here, is listed.
// `canary` puts the heroes' update back at once, so leaving it out changes nothing, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { groundHeight } from '../../../src/world/ground';
import { steps, type Step } from '../../../src/ui/perfProfile';
import { drawFrame } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given after a switch */
const SETTLE = 10;
/** the least of the frame the scene left undrawn must change, and the most the screen may move while the post chain
 *  is left out */
const SCENE_LEAST = 0.5;
/** the least of the frame the lamps put out must change by midnight (lit again by the village each frame, the row put
 *  them out for a frame alone: 0.00%) */
const LAMPS_LEAST = 0.05;
const POST_MOST = 0.0005;
/** the least he must walk while his update runs, and the most while it's let go (m) */
const LEAST_WALKED = 0.1;
const MOST_STILL = 0.01;
/** the rows held to what they say */
const SCENE = 'scene not drawn';
const LAMPS = 'lamps out';
const POST = 'post chain not drawn';
const HEROES = 'heroes not updated';
/** where he stands and walks to */
const FROM = new THREE.Vector3(2, 0, 3);
const TO = new THREE.Vector3(-4, 0, 4);

/** A share as a percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(2)}%`;

/** The programs made so far. */
const programs = (): number => G.renderer.info.programs?.length ?? 0;

/** How far he walks over `SETTLE` frames, sent from `FROM` to `TO`. */
async function walked(lab: Lab): Promise<number> {
  G.player.place(FROM.clone().setY(groundHeight(FROM.x, FROM.z)), 0);
  G.player.walkTo = TO.clone();
  const from = G.player.obj.position.clone();
  await lab.step(SETTLE);
  const went = G.player.obj.position.distanceTo(from);
  G.player.walkTo = null;
  return went;
}

/** One row's line and problems, and whether a canary would be caught. */
interface RowRead { line: string; problems: string[]; caught: boolean }

/** A row off already, or not here. */
const notHere = (step: Step): RowRead => ({
  line: `${step.label}: off already, or not here`,
  problems: [],
  caught: false,
});

/** The heroes' row, by his walk (`canary`: his update put back as soon as it's let go). */
async function readHeroes(lab: Lab, step: Step, canary: boolean): Promise<RowRead> {
  const before = programs();
  const free = await walked(lab);
  const undo = step.off();
  if (!undo) return notHere(step);
  if (canary) undo();
  let held: number;
  try {
    held = await walked(lab);
  } finally {
    if (!canary) undo();
  }
  const made = programs() - before;
  const line = `${step.label}: he walked ${free.toFixed(2)} m with it, ${held.toFixed(2)} m with it let go,`
    + ` ${made} programs compiled`;
  if (free < LEAST_WALKED) throw new Error(`lab: village: he walked ${free.toFixed(2)} m with his update running`);
  const problems: string[] = [];
  if (held > MOST_STILL) problems.push(`profileRows: ${step.label}: he still walked ${held.toFixed(2)} m`);
  if (made) problems.push(`profileRows: ${step.label}: ${made} programs compiled`);
  return { line, problems, caught: held > MOST_STILL };
}

/** A row read by the frame: drawn off at two moments, and on at the second. */
async function readFrame(lab: Lab, step: Step): Promise<RowRead> {
  const before = programs();
  const undo = step.off();
  if (!undo) return notHere(step);
  let changed: number;
  let movedOff: number;
  try {
    await lab.step(SETTLE);
    const offFirst = drawFrame(lab);
    await lab.step(SETTLE);
    const off = drawFrame(lab);
    movedOff = changedShare(offFirst, off);
    undo();
    changed = changedShare(off, drawFrame(lab));
  } catch (error) {
    undo();
    throw error;
  }
  const made = programs() - before;
  const line = `${step.label}: off against on at one moment, ${percent(changed)} of the frame changed;`
    + ` the screen moved ${percent(movedOff)} while off; ${made} programs compiled`;
  const problems: string[] = [];
  if (made) problems.push(`profileRows: ${step.label}: ${made} programs compiled`);
  if (step.label === SCENE && changed < SCENE_LEAST) {
    problems.push(`profileRows: ${step.label}: the frame changed only ${percent(changed)}`);
  }
  if (step.label === LAMPS && changed < LAMPS_LEAST) {
    problems.push(`profileRows: ${step.label}: by midnight the frame changed only ${percent(changed)}`);
  }
  if (step.label === POST && movedOff > POST_MOST) {
    problems.push(`profileRows: ${step.label}: the screen moved ${percent(movedOff)} with it left out`);
  }
  return { line, problems, caught: false };
}

/** Every Profile row switched off and back, by midnight on Low. */
export async function profileRows(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const was = qualityLevel();
  holdHour(0);
  useQuality('low');
  await viewBy(lab, 'third');
  // (each frame drawn as the game draws it: the lab skips the draws of the frames it steps)
  const drawing = lab.drawing;
  lab.drawing = true;
  let caught = false;
  try {
    for (const step of steps()) {
      if (canary && step.label !== HEROES) continue;
      const read = step.label === HEROES ? await readHeroes(lab, step, canary) : await readFrame(lab, step);
      lines.push(read.line);
      if (!canary) problems.push(...read.problems);
      caught ||= read.caught;
    }
  } finally {
    lab.drawing = drawing;
    useQuality(was);
    holdHour(null);
    await viewBy(lab, 'top');
  }
  return { lines, problems, caught: canary ? caught : null, moments: [] };
}
