// Nockshot's quick arrows (tools/lab `quickdraw`; from the owner: "I think we need to shorten the draw, to allow quick
// arrows"). A Hollow Husk is held 9 m before the ranger, and his left click is played as the player plays it for 8 s
// each way: tapped (pressed and let go every other frame, so each shot is loosed at its least draw and the next queued
// behind it) and drawn to full (held until the bow is drawn full, let go for a frame, held again). Every shot the game
// looses is caught as it's loosed (`Player.fire`: its draw), and every hit as it lands on the foe. His own critical
// hits are put to nothing, and the arrows aimed low on the body, clear of the head (always a critical hit), so a hit is
// the shot's own damage. The targets are the owner's choice: the first tapped arrow loosed within 0.26 s of the press,
// a full draw within 0.82 s, a quick arrow at least 0.45 of a full one and tapping at least 0.75 of full draws'
// damage a second; and every shot loosed must strike (or it measured nothing).
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import type { Enemy } from '../../../src/entities/enemy';
import type { SkillDef } from '../../../src/types';
import { G } from '../../../src/state';
import { bindKnown, skillNamed } from './cast';

export interface QuickDrawOptions {
  /** the views played (over the shoulder by default) */
  views: ViewMode[];
  /** list each shot (its frame and draw) and each hit (its frame and damage) */
  trace?: boolean;
  /** plant the faults the checks must catch: the least draw back to half the draw and the damage the pull's square */
  canary: boolean;
}

/** how far before him the foe stands (m) */
const AHEAD = 9;
/** where he stands (x, z) and the way he faces (rad): off the dais, clear of props */
const SPOT: [number, number] = [-11, -12];
const FACING = Math.PI / 2;
/** how high on the foe the arrows are aimed, of its height: its legs and hips, clear of the head */
const AIM_SHARE = 0.35;
/** how long each way is played, and how long its last arrows are followed after (s: the button let go, the shot
 *  drawn or queued then is loosed at its least draw, and its arrow lands after) */
const PLAYED = 8;
const AFTER = 2;
/** frames the aim is held on the foe before the first press: the close views' crosshair turned onto it (pressed at
 *  once, the first tapped arrow left before it was on the foe and missed) */
const SETTLE = 30;
/** frames the foe has to rise */
const RISE_FRAMES = 120;
/** a foe's life: past every arrow */
const LIVING = 1e6;
/** the owner's choice of quick arrows (#1004): the first tapped arrow loosed within this of the press, a full draw
 *  within this (s), a quick arrow at least this share of a full one, and tapping this share of full draws' damage a
 *  second */
const TARGET = { firstTap: 0.26, fullDraw: 0.82, arrowShare: 0.45, rateShare: 0.75 };
/** the canary's plants, each in a pass of its own (together, the later least draw drew the quick arrow far enough
 *  that the square's share passed): the least draw as it was before, and the damage the pull's square */
const LATE: Plant = { minDraw: 0.5 };
const SQUARE: Plant = { drawCurve: 2 };

/** A fault planted on Nockshot's def. */
type Plant = Pick<SkillDef, 'minDraw' | 'drawCurve'>;

const frameTime = (): number => window.__labClock.frame / 1000;

/** How a way is played: tapped, or drawn to full each shot. */
type Way = 'tapped' | 'full';

/** A shot the game loosed: its frame from the way's first press, and how far it was drawn. */
interface Loosed {
  frame: number;
  power: number;
}

/** What a way measured. */
interface Played {
  shots: Loosed[];
  /** the damage of each arrow that struck the foe */
  hits: number[];
  /** the frame of each hit, from the way's first press */
  hitFrames: number[];
}

/** A Hollow Husk risen at `spot`, standing as the training dummy does, every hit on it caught. */
async function standFoe(lab: Lab, spot: THREE.Vector3, hit: (amount: number) => void): Promise<Enemy> {
  const foe = lab.spawnFoe('husk', spot);
  Object.assign(foe, { def: { ...foe.def, ai: 'idle', evade: undefined } });
  const takeDamage = foe.takeDamage.bind(foe);
  foe.takeDamage = (amount, info) => {
    hit(amount);
    return takeDamage(amount, info);
  };
  await lab.until(() => foe.spawning <= 0, RISE_FRAMES, 'the husk never rose');
  return foe;
}

/** The foe kept on its spot and living, and his own critical hits put to nothing. */
function keep(foe: Enemy, spot: THREE.Vector3): void {
  foe.pos.set(spot.x, foe.pos.y, spot.z);
  foe.life = LIVING;
  foe.cd = 99;
  G.player.stats.crit = 0;
}

/** Where the arrows are aimed: low on the foe's body. */
function aimOn(foe: Enemy): THREE.Vector3 {
  return foe.pos.clone().setY(foe.obj.position.y + foe.height * AIM_SHARE);
}

/** The frame's input: the left button held or not, aimed at `point` (the close views' crosshair on it too). */
function input(held: boolean, point: THREE.Vector3, view: ViewMode): Frame {
  const aimed: Frame = view === 'top' ? { aim: point } : { aim: point, sight: point };
  return held ? { ...aimed, m0: true } : aimed;
}

/** Whether the button is held on this frame of a way: tapped every other frame, or held but for the frame after the
 *  bow came to full draw. */
function heldOn(way: Way, frame: number, letGo: { at: number }): boolean {
  if (way === 'tapped') return frame % 2 === 0;
  if (G.player.drawnFull) letGo.at = frame;
  return letGo.at !== frame;
}

/** One way played for `PLAYED` s at the foe, then its last arrows followed down (with the canary's plants). */
async function playWay(lab: Lab, view: ViewMode, way: Way, plant: Plant | null): Promise<Played> {
  const fixture: Fixture = { at: SPOT, facing: FACING, view, nocked: true };
  await lab.setup(fixture);
  bindKnown('nockShot');
  const skill = skillNamed('nockShot');
  // (planted on the hero as this set-up built him: the next builds him afresh)
  const undo = plant ? plantFault(plant) : null;
  try {
    return await shoot(lab, view, way, skill.def);
  } finally {
    undo?.();
  }
}

/** The way played with the hero as set up, Nockshot bound. */
async function shoot(lab: Lab, view: ViewMode, way: Way, def: SkillDef): Promise<Played> {
  const played: Played = { shots: [], hits: [], hitFrames: [] };
  const hero = G.player;
  const ahead = new THREE.Vector3(Math.sin(FACING), 0, Math.cos(FACING));
  const spot = hero.pos.clone().setY(0).addScaledVector(ahead, AHEAD);
  let frame = 0;
  const foe = await standFoe(lab, spot, (amount) => {
    played.hits.push(amount);
    played.hitFrames.push(frame);
  });
  const fire = hero.fire.bind(hero);
  hero.fire = (known, target, power = 1) => {
    if (known.def.impl === def.impl) played.shots.push({ frame, power });
    fire(known, target, power);
  };
  const letGo = { at: -1 };
  const playedFrames = Math.round(PLAYED / frameTime());
  const afterFrames = Math.round(AFTER / frameTime());
  const each = (): void => keep(foe, spot);
  await lab.step(SETTLE, () => input(false, aimOn(foe), view), each);
  for (frame = 0; frame < playedFrames; frame++) {
    const held = heldOn(way, frame, letGo);
    await lab.step(1, () => input(held, aimOn(foe), view), each);
  }
  for (; frame < playedFrames + afterFrames; frame++) await lab.step(1, () => input(false, aimOn(foe), view), each);
  return played;
}

/** The mean of `values` (0 with none). */
const mean = (values: number[]): number => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

/** A way's figures: its first shot's time from the press, its arrows' mean damage, its damage a second (s, hp) and
 *  its shots' mean draw, each but the first of the press's time read off the shots as they kept coming, all but the
 *  last: the button let go, that one is loosed at its least draw whatever the way. */
interface Figures {
  first: number;
  arrow: number;
  rate: number;
  power: number;
}

/** A way's figures from what it played. */
function figuresOf(played: Played): Figures {
  const { shots, hits } = played;
  const first = shots.length ? shots[0].frame * frameTime() : Infinity;
  const arrow = mean(hits.slice(0, -1));
  return { first, arrow, rate: steadyRate(played), power: mean(shots.slice(0, -1).map((shot) => shot.power)) };
}

/** The damage a second as the shots kept coming: every arrow's but the last over the time from the first loose to
 *  the last (each arrow strikes in the order it left; 0 with fewer than two shots, or a miss among them). */
function steadyRate(played: Played): number {
  const { shots, hits } = played;
  if (shots.length < 2 || hits.length !== shots.length) return 0;
  const seconds = (shots[shots.length - 1].frame - shots[0].frame) * frameTime();
  return hits.slice(0, -1).reduce((sum, hit) => sum + hit, 0) / seconds;
}

/** A way's line. */
function lineOf(view: ViewMode, way: Way, played: Played, figures: Figures): string {
  const drawn = figures.power.toFixed(2);
  return `${view}, ${way}: ${played.shots.length} shots loosed (drawn ${drawn} on average but the last), `
    + `the first ${figures.first.toFixed(2)} s after the press; ${played.hits.length} struck, `
    + `${figures.arrow.toFixed(0)} an arrow, ${figures.rate.toFixed(0)} a second`;
}

/** A way's shots and hits, a line each, for `--trace`. */
function traceOf(played: Played): string[] {
  const shots = played.shots.map((shot) => `    shot at frame ${shot.frame}, drawn ${shot.power.toFixed(2)}`);
  const hits = played.hits.map((hit, i) => `    hit at frame ${played.hitFrames[i]}: ${hit.toFixed(0)}`);
  return [...shots, ...hits];
}

/** A view's two ways judged against the owner's targets. */
function judge(view: ViewMode, tapped: Figures, full: Figures, plays: Record<Way, Played>): string[] {
  const problems: string[] = [];
  for (const way of ['tapped', 'full'] as const) {
    const { shots, hits } = plays[way];
    if (shots.length < 3) problems.push(`${view}, ${way}: only ${shots.length} shots loosed (measured nothing)`);
    if (hits.length < shots.length) problems.push(`${view}, ${way}: ${shots.length - hits.length} shots missed`);
  }
  if (tapped.first > TARGET.firstTap) {
    problems.push(`${view}: the first tapped arrow left ${tapped.first.toFixed(2)} s after the press `
      + `(the target ${TARGET.firstTap})`);
  }
  if (full.first > TARGET.fullDraw) {
    problems.push(`${view}: a full draw took ${full.first.toFixed(2)} s (the target ${TARGET.fullDraw})`);
  }
  const arrowShare = full.arrow ? tapped.arrow / full.arrow : 0;
  if (arrowShare < TARGET.arrowShare) {
    const share = arrowShare.toFixed(2);
    problems.push(`${view}: a quick arrow deals ${share} of a full one (the target ${TARGET.arrowShare})`);
  }
  const rateShare = full.rate ? tapped.rate / full.rate : 0;
  if (rateShare < TARGET.rateShare) {
    problems.push(`${view}: tapping deals ${rateShare.toFixed(2)} of full draws' damage a second `
      + `(the target ${TARGET.rateShare})`);
  }
  return problems;
}

/** Every def of the hero's Nockshot (a def may be copied per key), for the canary's plants. */
function nockDefs(): SkillDef[] {
  return [...G.player.known.values()].map((known) => known.def).filter((def) => def.impl === 'nockShot');
}

/** A canary's plant on every def of Nockshot, until the undo it returns. */
function plantFault(plant: Plant): () => void {
  const kept = nockDefs().map((def) => ({ def, minDraw: def.minDraw, drawCurve: def.drawCurve }));
  for (const { def } of kept) Object.assign(def, plant);
  return () => {
    for (const { def, minDraw, drawCurve } of kept) Object.assign(def, { minDraw, drawCurve });
  };
}

/** Every view played both ways (with `plant`, if any), its lines and problems. */
async function playViews(lab: Lab, options: QuickDrawOptions, plant: Plant | null): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const view of options.views) {
    const tappedPlay = await playWay(lab, view, 'tapped', plant);
    const plays = { tapped: tappedPlay, full: await playWay(lab, view, 'full', plant) };
    const tapped = figuresOf(plays.tapped);
    const full = figuresOf(plays.full);
    lines.push(lineOf(view, 'tapped', plays.tapped, tapped));
    if (options.trace) lines.push(...traceOf(plays.tapped));
    lines.push(lineOf(view, 'full', plays.full, full));
    if (options.trace) lines.push(...traceOf(plays.full));
    const judged = judge(view, tapped, full, plays);
    lines.push(...judged.map((problem) => `  ! ${problem}`));
    problems.push(...judged);
  }
  return { text: lines.join('\n'), problems };
}

/** `lab quickdraw`: Nockshot tapped and drawn to full at a foe in each view, against the owner's targets. */
export async function quickDraw(lab: Lab, options: QuickDrawOptions): Promise<Report> {
  if (G.player.cls.id !== 'ranger') throw new Error('lab: quickdraw needs --class ranger');
  if (!options.canary) return playViews(lab, options, null);
  const late = await playViews(lab, options, LATE);
  const square = await playViews(lab, options, SQUARE);
  const lateCaught = late.problems.some((problem) => problem.includes('first tapped arrow'));
  const squareCaught = square.problems.some((problem) => problem.includes('a quick arrow deals'));
  const said = (caught: boolean): string => (caught ? 'caught' : 'missed');
  const lines = [
    'the least draw back to half:', late.text, 'the damage the pull\'s square:', square.text,
    `canary: the least draw back to half ${said(lateCaught)}, the damage the pull's square ${said(squareCaught)}`,
  ];
  const missed = [
    ...(lateCaught ? [] : ['the canary\'s least draw of half went unseen']),
    ...(squareCaught ? [] : ['the canary\'s damage as the pull\'s square went unseen']),
  ];
  return { text: lines.join('\n'), problems: missed };
}
