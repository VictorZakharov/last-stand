// tools/lab `glance`: the hero's casual look round as he stands idle (models/glance.ts), read from what's drawn: the
// head's turn from the chest frame by frame, and the eyeballs' turn in their sockets. From the owner: "when idle,
// characters should look left/right casually". He stands in a run's countdown, in the lobby and in the hall of heroes,
// walks and attacks from the middle of a glance, and stands through the eyes. Each glance must turn the head within a
// neck's range, unhurried, with no jerk a frame, the eyes leading it; the glances must come at random times, never
// as a loop; none may come as he moves, attacks or is seen through the eyes, nor in the hall before his showcase.
// The canary kicks the head 3 degrees aside for a frame (a jerk), and lets him glance as he walks.
import * as THREE from 'three';
import * as hall from '../../../src/game/hall';
import type { Lab, Pictured, Report } from './lab';
import { openHall, toLobby } from './hallMoves';
import { timeCalls } from './timing';
import {
  GLANCE_FROM, fastest, gapsBetween, glancesIn, joinAcross, largestJerk, looped, spread, startsApart,
  type Glanced,
} from './glances';

/** What `lab glance` takes. */
export interface GlanceOptions {
  /** how long he stands in the countdown (s) */
  seconds?: number;
  canary?: boolean;
}

const RATE = 60;
const DEG = 180 / Math.PI;
/** how long he stands in the countdown by default, and in the lobby (s) */
const STAND = 40;
const LOBBY = 14;
/** a neck's turn either way (anatomy.ts `ROM`, degrees) */
const NECK_RANGE = 80;
/** the fastest a casual glance turns the head (degrees a second): a person's quick look round peaks near 200 */
const FASTEST = 200;
/** the least glances in the countdown's stand, and the least time between one's end and the next's start (s) */
const LEAST_GLANCES = 3;
const LEAST_GAP = 1.5;
/** the head's turn's move a frame changing by more than this from the frame before is a jerk (degrees, at 60 Hz) */
const JERK_FROM = 0.6;
/** an eye turned past this in its socket (degrees) is glancing: nothing else turns the eyes */
const EYE_FROM = 2;
/** after he sets off or attacks, how long the head has to come back (s), and how near ahead it must be by then (the
 *  eyes lead it back, turned the other way a moment) */
const BACK_IN = 0.8;
const BACK_TO = 5;
/** how long he walks and attacks for (s) */
const WALK = 5;
const ATTACK = 3;
/** frames waited for a glance to be under way before he walks or attacks */
const WAIT_FOR = 60 * 12;
/** the canary's frame in the countdown's stand, and its kick (degrees) */
const CANARY_FRAME = 600;
const CANARY_KICK = 3;
/** in the hall: frames waited for his showcase to end, and the time after it a glance must come by (s) */
const SHOWCASE_FRAMES = 60 * 12;
const HALL_AFTER = 10;

/** One frame as drawn: the head's turn from the chest and the chest's from the body (degrees, + his left), and the
 *  eyes' in their sockets. */
interface Read {
  neck: number;
  chest: number;
  eyes: number;
}

const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _forward = new THREE.Vector3();

/** The turn about the upright (degrees, + to +x) of `inner`'s forward seen from `outer`'s frame. */
function turnFrom(inner: THREE.Object3D, outer: THREE.Object3D): number {
  outer.getWorldQuaternion(_q).invert();
  inner.getWorldQuaternion(_r);
  _forward.set(0, 0, 1).applyQuaternion(_q.multiply(_r));
  return Math.atan2(_forward.x, _forward.z) * DEG;
}

/** The hero's eyeballs (models/head.ts names them). */
function eyesOf(lab: Lab): THREE.Object3D[] {
  const eyes: THREE.Object3D[] = [];
  lab.joints.head.traverse((object) => {
    if (object.name === 'eye') eyes.push(object);
  });
  return eyes;
}

/** This frame's turns as drawn. */
function readNow(lab: Lab, eyes: THREE.Object3D[]): Read {
  const j = lab.joints;
  lab.model.root.updateMatrixWorld(true);
  const eye = eyes.length ? turnFrom(eyes[0], eyes[0].parent!) : 0;
  return { neck: turnFrom(j.head, j.chest), chest: turnFrom(j.chest, lab.model.root), eyes: eye };
}

/** The glance object the hero's look holds, if this tree has one (for its timing alone). */
function glanceOf(lab: Lab): object | null {
  const look = (lab.player as unknown as { look?: { glance?: object | null } }).look;
  return look?.glance ?? null;
}

/** Runs `lab glance`. */
export async function glance(lab: Lab, options: GlanceOptions): Promise<Report> {
  const reports = [
    await countdown(lab, options),
    await walking(lab, false),
  ];
  if (options.canary) reports.push(await walking(lab, true));
  reports.push(await attacking(lab), await throughTheEyes(lab));
  reports.push(await lobbyAndHall(lab));
  return {
    text: reports.map((each) => each.text).join('\n'),
    problems: reports.flatMap((each) => each.problems),
    moments: reports.flatMap((each) => each.moments ?? []),
  };
}

/** He stands in a run's countdown: his glances, their turns, speeds, jerks and spacing, the eyes leading them, a strip
 *  of pictures of the first, and what a frame's glance costs. */
async function countdown(lab: Lab, options: GlanceOptions): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0, fresh: true });
  await lab.step(2);
  const eyes = eyesOf(lab);
  const owner = glanceOf(lab);
  const timing = owner ? timeCalls(Object.getPrototypeOf(owner), 'update') : null;
  const frames = Math.round((options.seconds ?? STAND) * RATE);
  const reads: Read[] = [];
  const strip = new Strip(lab);
  await lab.step(frames, undefined, (frame) => {
    const kicked = !!options.canary && frame === CANARY_FRAME;
    if (kicked) lab.joints.head.rotation.y += CANARY_KICK / DEG;
    const read = readNow(lab, eyes);
    if (kicked) lab.joints.head.rotation.y -= CANARY_KICK / DEG;
    reads.push(read);
    strip.see(read, frame);
  });
  const cost = timing?.stop();
  const report = judgeStand(lab.player.cls.id, reads, !!options.canary, eyes.length > 0);
  if (cost) {
    // (the clock ticks in 0.1 ms: a call's cost is the mean over them all)
    const mean = ((cost.total / Math.max(1, cost.calls)) * 1000).toFixed(2);
    const over = `${mean} µs on average over ${cost.calls} calls`;
    report.text += `\n  a frame's glance (Glance.update, the browser's clock): ${over}`;
  }
  report.moments = strip.moments;
  report.text += `
  ${strip.state()}`;
  return report;
}

/** The countdown's stand judged: its glances, and with the canary, its kicked frame. */
function judgeStand(id: string, reads: Read[], canary: boolean, hasEyes: boolean): Report {
  const neck = reads.map((read) => read.neck);
  const glances = joinAcross(glancesIn(neck), RATE);
  const apart = startsApart(glances, RATE);
  const gaps = gapsBetween(glances, RATE);
  const text = [`the ${id} standing in the countdown ${(reads.length / RATE).toFixed(0)} s: ${glances.length} glances`];
  const problems: string[] = [];
  for (const each of glances) text.push(`  ${describe(each, reads)}`);
  if (apart.length) {
    const listed = apart.map((value) => value.toFixed(1)).join(', ');
    text.push(`  starts apart (s): ${listed}; spread ${spread(apart).toFixed(2)} s`);
  }
  if (glances.length < LEAST_GLANCES) problems.push(`glance: ${glances.length} glances in the countdown's stand`);
  if (looped(apart)) problems.push('glance: the glances come as a loop, evenly apart');
  const close = gaps.filter((gap) => gap < LEAST_GAP);
  if (close.length) problems.push(`glance: ${close.length} glances came within ${LEAST_GAP} s of the one before`);
  const most = Math.max(0, ...neck.map(Math.abs));
  const { speed, index } = fastest(canary ? unkicked(neck) : neck, RATE);
  const when = `at ${(index / RATE).toFixed(2)} s`;
  text.push(`  the most the head turned from the chest ${most.toFixed(1)}°, fastest ${speed.toFixed(0)}°/s (${when})`);
  if (most > NECK_RANGE) problems.push(`glance: the head turned ${most.toFixed(1)}° from the chest, past a neck's`);
  if (speed > FASTEST) problems.push(`glance: the head turned ${speed.toFixed(0)}°/s ${when}, past a casual glance's`);
  const chest = Math.max(0, ...reads.map((read) => Math.abs(read.chest)));
  text.push(`  the chest's turn from the body at most ${chest.toFixed(1)}°`);
  if (hasEyes) judgeEyes(glances, reads, text, problems);
  else text.push('  no eyeballs named in this tree');
  judgeJerks(neck, canary, text, problems);
  return { text: text.join('\n'), problems };
}

/** `neck` with the canary's kicked frame put back between its neighbours (cut out, the join read as a jerk). */
function unkicked(neck: number[]): number[] {
  const between = (neck[CANARY_FRAME - 1] + neck[CANARY_FRAME + 1]) / 2;
  return neck.map((turn, i) => (i === CANARY_FRAME ? between : turn));
}

/** A glance in words: when, how far, how long. */
function describe(each: Glanced, reads: Read[]): string {
  const held = ((each.end - each.start) / RATE).toFixed(1);
  const eyes = Math.max(...reads.slice(each.start, each.end + 1).map((read) => Math.abs(read.eyes)));
  const at = (each.start / RATE).toFixed(1);
  return `at ${at} s: ${each.peak.toFixed(1)}° to his ${each.peak > 0 ? 'left' : 'right'}, past ${GLANCE_FROM}° for `
    + `${held} s, the eyes at most ${eyes.toFixed(1)}° in their sockets`;
}

/** The eyes lead each glance: turned past `EYE_FROM` its way before the head is past `GLANCE_FROM`. */
function judgeEyes(glances: Glanced[], reads: Read[], text: string[], problems: string[]): void {
  let led = 0;
  for (const each of glances) {
    let first = each.start;
    while (first > 0 && Math.sign(reads[first - 1].eyes) === each.side && Math.abs(reads[first - 1].eyes) > EYE_FROM) {
      first--;
    }
    if (first < each.start) led++;
  }
  text.push(`  the eyes led ${led} of the ${glances.length} glances`);
  if (led < glances.length) problems.push(`glance: the eyes led only ${led} of ${glances.length} glances`);
}

/** The head's jerks: none past `JERK_FROM` (with the canary, its kicked frame must be one, and is left out). */
function judgeJerks(neck: number[], canary: boolean, text: string[], problems: string[]): void {
  if (canary) {
    const kicked = largestJerk(neck.slice(CANARY_FRAME - 2, CANARY_FRAME + 3)).jerk;
    const caught = kicked > JERK_FROM;
    text.push(`  canary, the head kicked ${CANARY_KICK}° for a frame: ${caught ? 'caught' : 'MISSED'}`);
    if (!caught) problems.push('glance: the canary (the head kicked for a frame) was missed');
    neck = unkicked(neck);
  }
  const worst = largestJerk(neck);
  const at = `at ${(worst.index / RATE).toFixed(2)} s`;
  text.push(`  the head's largest jerk ${worst.jerk.toFixed(2)}° ${at} (a jerk past ${JERK_FROM}°)`);
  if (worst.jerk > JERK_FROM) problems.push(`glance: the head jerked ${worst.jerk.toFixed(2)}° on a frame`);
}

/** Frames until he's in the middle of a glance (the head past `GLANCE_FROM` + 5 degrees), false if none came. */
async function untilGlancing(lab: Lab, eyes: THREE.Object3D[]): Promise<boolean> {
  for (let frame = 0; frame < WAIT_FOR; frame++) {
    await lab.step(1);
    if (Math.abs(readNow(lab, eyes).neck) > GLANCE_FROM + 5) return true;
  }
  return false;
}

/** How a stretch of frames from the middle of a glance went: how near ahead the head was `BACK_IN` s in, its
 *  frames glancing after that (the eyes turned, or the head past the bar), and its largest jerk on its way back (a
 *  quarter of a second past `BACK_IN`: later on, the walk's own steps turn the trunk under the head, a jerk of 3 to 5
 *  degrees by where in a stride, as on main). */
interface Broken {
  back: number;
  glancing: number;
  jerk: number;
  jerkAt: number;
}

/** The frames' reads judged from the middle of a glance on. */
function brokenOff(reads: Read[]): Broken {
  const grace = Math.round(BACK_IN * RATE);
  const after = reads.slice(grace);
  const glancing = after.filter((read) => Math.abs(read.eyes) > EYE_FROM || Math.abs(read.neck) > GLANCE_FROM);
  return {
    back: Math.abs(reads[Math.min(grace, reads.length - 1)].neck),
    glancing: glancing.length,
    ...jerkOf(reads.slice(0, grace + RATE / 4)),
  };
}

/** The largest jerk of the head's turn over `reads`, and its frame. */
function jerkOf(reads: Read[]): { jerk: number; jerkAt: number } {
  const worst = largestJerk(reads.map((read) => read.neck));
  return { jerk: worst.jerk, jerkAt: worst.index };
}

/** The lines and problems of a glance broken off by `what`, its jerk judged against `own` (degrees: the largest the
 *  same move gives the head with no glance, as a set-off's step turns the trunk under it). */
function brokenReport(what: string, broken: Broken, problems: string[], own = 0): string {
  const back = `the head ${broken.back.toFixed(1)}° from ahead ${BACK_IN} s in`;
  const line = `  ${what} from the middle of a glance: ${back}, ${broken.glancing} frames glancing after, `
    + `the largest jerk ${broken.jerk.toFixed(2)}° on frame ${broken.jerkAt} (with no glance ${own.toFixed(2)}°)`;
  if (broken.back > BACK_TO) problems.push(`glance: ${what}, the head still ${broken.back.toFixed(1)}° aside`);
  if (broken.glancing) problems.push(`glance: ${what}, he glanced on ${broken.glancing} frames`);
  if (broken.jerk > own + JERK_FROM) problems.push(`glance: ${what}, the head jerked ${broken.jerk.toFixed(2)}°`);
  return line;
}

/** The largest jerk of the head as he walks off from standing with no glance, over the time a glance's way back
 *  takes (degrees). */
async function walkOwnJerk(lab: Lab): Promise<number> {
  await lab.setup({ at: [14, 17], facing: 0 });
  const eyes = eyesOf(lab);
  lab.player.glances = false;
  try {
    await lab.step(RATE);
    const reads = await lab.step(Math.round(WALK * RATE), () => ({ keys: ['w'] }), () => readNow(lab, eyes));
    return jerkOf(reads.slice(0, Math.round(BACK_IN * RATE) + RATE / 4)).jerk;
  } finally {
    lab.player.glances = true;
  }
}

/** He walks off from the middle of a glance (the canary lets him glance as he walks). */
async function walking(lab: Lab, canary: boolean): Promise<Report> {
  const own = await walkOwnJerk(lab);
  await lab.setup({ at: [14, 17], facing: 0 });
  const eyes = eyesOf(lab);
  if (!(await untilGlancing(lab, eyes))) return { text: '  walking: no glance came to walk from', problems: [] };
  const player = lab.player as unknown as { standsIdle?: () => boolean };
  const idle = player.standsIdle;
  if (canary) player.standsIdle = () => true;
  try {
    const reads = await lab.step(Math.round(WALK * RATE), () => ({ keys: ['w'] }), () => readNow(lab, eyes));
    const problems: string[] = [];
    const line = brokenReport('walking off', brokenOff(reads), problems, own);
    if (!canary) return { text: line, problems };
    const caught = problems.some((problem) => problem.includes('glanced'));
    const verdict = `  canary, glances let come as he walks: ${caught ? 'caught' : 'MISSED'}`;
    return { text: `${line}\n${verdict}`, problems: caught ? [] : ['glance: the canary (glances walking) was missed'] };
  } finally {
    if (canary) player.standsIdle = idle;
  }
}

/** He attacks from the middle of a glance, the attack held down. */
async function attacking(lab: Lab): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0 });
  const eyes = eyesOf(lab);
  if (!(await untilGlancing(lab, eyes))) return { text: '  attacking: no glance came to attack from', problems: [] };
  const aim = lab.player.pos.clone().add(new THREE.Vector3(0, 0, 6));
  const reads = await lab.step(Math.round(ATTACK * RATE), () => ({ m0: true, aim }), () => readNow(lab, eyes));
  const problems: string[] = [];
  // (the attack's own pose turns the head: judged by the eyes alone, which only a glance turns)
  const grace = Math.round(BACK_IN * RATE);
  const eyesBack = Math.abs(reads[grace].eyes);
  const glancing = reads.slice(grace).filter((read) => Math.abs(read.eyes) > EYE_FROM).length;
  if (glancing) problems.push(`glance: attacking, he glanced on ${glancing} frames`);
  const eyesThen = `the eyes ${eyesBack.toFixed(1)}° in their sockets ${BACK_IN} s in`;
  const line = `  attacking from the middle of a glance: ${eyesThen}, ${glancing} frames glancing after`;
  return { text: line, problems };
}

/** He stands through the eyes, where a glance would swing the view: the head never turns aside. */
async function throughTheEyes(lab: Lab): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0, view: 'first' });
  const eyes = eyesOf(lab);
  const reads = await lab.step(Math.round(LOBBY * RATE), undefined, () => readNow(lab, eyes));
  const most = Math.max(...reads.map((read) => Math.abs(read.neck)));
  const eyed = Math.max(...reads.map((read) => Math.abs(read.eyes)));
  const turns = `the head at most ${most.toFixed(1)}° from the chest, the eyes ${eyed.toFixed(1)}°`;
  const text = `  through the eyes ${LOBBY} s: ${turns}`;
  const glanced = most > GLANCE_FROM || eyed > EYE_FROM;
  return { text, problems: glanced ? ['glance: he glanced round through the eyes'] : [] };
}

/** He stands in the lobby, then is shown in the hall of heroes: no glance before his showcase is done, one after. */
async function lobbyAndHall(lab: Lab): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0 });
  await toLobby(lab);
  const eyes = eyesOf(lab);
  const reads = await lab.step(Math.round(LOBBY * RATE), undefined, () => readNow(lab, eyes));
  const inLobby = glancesIn(reads.map((read) => read.neck)).length;
  const text = [`  in the lobby ${LOBBY} s: ${inLobby} glances`];
  const problems = inLobby ? [] : ['glance: no glance in the lobby'];
  if (!(await openHall(lab))) return { text: `${text[0]}\n  no hall of heroes in this tree`, problems };
  const hero = hall.hallHeroes()[hall.hallFocus()];
  const shown = await followShowcase(lab, hero);
  text.push(`  in the hall: ${shown.before} frames glancing before his showcase was done, the first glance after it `
    + (shown.after < 0 ? 'never came' : `${shown.after.toFixed(1)} s on`));
  if (shown.before) problems.push(`glance: in the hall he glanced on ${shown.before} frames before his showcase`);
  if (shown.after < 0) problems.push(`glance: in the hall no glance came within ${HALL_AFTER} s of his showcase`);
  return { text: text.join('\n'), problems };
}

/** The hall's hero in focus followed: his frames glancing until his showcase is done, and how long after it his first
 *  glance came (s; -1 none). */
async function followShowcase(lab: Lab, hero: hall.HallHero): Promise<{ before: number; after: number }> {
  const eyes: THREE.Object3D[] = [];
  hero.player.model.joints!.head.traverse((object) => {
    if (object.name === 'eye') eyes.push(object);
  });
  const eyeTurn = (): number => (eyes.length ? Math.abs(turnFrom(eyes[0], eyes[0].parent!)) : 0);
  let began = false;
  let before = 0;
  for (let frame = 0; frame < SHOWCASE_FRAMES && !(began && !hero.cast); frame++) {
    await lab.step(1);
    began ||= !!hero.cast;
    hero.player.model.root.updateMatrixWorld(true);
    if (eyeTurn() > EYE_FROM) before++;
  }
  for (let frame = 0; frame < HALL_AFTER * RATE; frame++) {
    await lab.step(1);
    if (eyeTurn() > EYE_FROM) return { before, after: frame / RATE };
  }
  return { before, after: -1 };
}

/** whether the eyes look the way the head is turned (or ahead in their sockets) */
const sameWay = (read: Read): boolean => Math.abs(read.eyes) < 1 || Math.sign(read.eyes) === Math.sign(read.neck);

/** the strip's first glance starts from the head this near ahead (degrees), and it's back once the head has been
 *  within `BACK_STILL` of where it set off from (the warrior's idle holds it 4.6 degrees aside) and the eyes of ahead
 *  for `BACK_FRAMES` */
const NEUTRAL = 6;
const BACK_STILL = 3;
const BACK_FRAMES = 30;

/** A strip of pictures of the first glance from the head ahead: as the eyes set off, the eyes at their furthest (the
 *  head barely moved), the head at its furthest, and back ahead. */
class Strip {
  readonly moments: Pictured[] = [];
  private stage = 0;
  private restarts = 0;
  /** the eyes' turn as the strip pictured them leading */
  private eyesMost = 0;
  private last: Read = { neck: 0, chest: 0, eyes: 0 };
  private still = 0;
  /** the way the glance pictured goes (+1 his left), and the head's turn as it set off */
  private side = 0;
  private from = 0;
  constructor(private readonly lab: Lab) {}

  see(read: Read, frame: number): void {
    const eyes = Math.abs(read.eyes), neck = Math.abs(read.neck);
    const head = `the head ${read.neck.toFixed(1)}° from the chest`;
    const chest = `the chest ${read.chest.toFixed(1)}° from the body`;
    const notes = [`frame ${frame}: ${head}, the eyes ${read.eyes.toFixed(1)}°, ${chest}`];
    const setOff = eyes > 0.5 && Math.abs(this.last.eyes) <= 0.5 && neck < NEUTRAL;
    this.still = Math.abs(read.neck - this.from) < BACK_STILL && eyes < BACK_STILL ? this.still + 1 : 0;
    // (a glance carried across to the other side before the head is there: the next one is pictured instead; after
    // it, the eyes lead the head back home, turned the other way a moment)
    const across = this.stage > 0 && this.stage < 3 && eyes > EYE_FROM && Math.sign(read.eyes) !== this.side;
    if (across) this.restart();
    if (this.stage === 0 && setOff) {
      this.side = Math.sign(read.eyes);
      this.from = read.neck;
      this.take('standing, the eyes setting off', notes);
    }
    else if (this.stage === 1 && eyes <= Math.abs(this.last.eyes)) {
      this.eyesMost = eyes;
      this.take('the eyes lead', notes);
    }
    // (the head well round and the eyes come back half way in their sockets as it catches up, still its way: its
    // furthest is the first frame of the way back, the eyes already turned for home)
    else if (this.stage === 2 && neck > GLANCE_FROM * 2 && eyes < this.eyesMost / 2 && sameWay(read)) {
      this.take('the head follows', notes);
    } else if (this.stage === 3 && this.still === BACK_FRAMES) this.take('back ahead', notes);
    this.last = read;
  }

  /** How far the strip got, in words. */
  state(): string {
    const names = this.moments.map((moment) => moment.label).join(', ') || 'none';
    const why = this.why.length ? ` (each as it was: ${this.why.join('; ')})` : '';
    return `the strip: ${this.moments.length} of 4 moments (${names}), begun again ${this.restarts} times${why}`;
  }

  /** where each glance the strip gave up on was, as it was given up */
  private why: string[] = [];
  private restart(): void {
    this.why.push(`stage ${this.stage} neck ${this.last.neck.toFixed(1)} eyes ${this.last.eyes.toFixed(1)}`);
    this.restarts++;
    this.moments.length = 0;
    this.stage = 0;
  }

  private take(label: string, notes: string[]): void {
    this.moments.push(this.lab.picture(label, ['front', 'lobby'], notes, { focus: 'head' }));
    this.stage++;
  }
}
