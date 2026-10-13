// A held skill's preview held through its cooldown (tools/lab `held` and `blink`; a held skill's preview turns red
// while letting go would cast nothing, src/combat/skills/readiness.ts), as a player holds it: the key pressed with
// seconds of the cooldown left, let go while the preview says it isn't ready (nothing may be cast), pressed again and
// held until it shows ready, and let go (it must cast). Every frame the preview is read as it is drawn (red or its
// own look, by the caller's reader) and the second its countdown shows against the seconds of the cooldown left.
// Then held short of energy: not ready, and no countdown, as there's no cooldown.
import type { Frame, Lab, Pictured } from './lab';
import type { SkillKey } from '../../../src/types';
import type { Player } from '../../../src/entities/player';
import type * as THREE from 'three';
import { G } from '../../../src/state';
import { readinessOf } from '../../../src/combat/skills/readiness';

/** the cooldown left as the key is first pressed (s): three seconds counting down, 3, 2, 1 */
const COOLDOWN_LEFT = 2.5;
/** the frames held, then let go, while it's still on cooldown */
const EARLY_FRAMES = 12;
/** the most frames the preview may take to show ready once it is */
const TURN_FRAMES = 15;
/** the frames it's held short of energy */
const SHORT_FRAMES = 12;
/** the frames of the hold through the cooldown at which it's pictured (on cooldown, red, counting down) */
const PICTURE_FRAME = 40;
/** the most frames a cast is waited for to end */
const CAST_FRAMES = 120;

/** What the preview shows in a frame: whether it shows at all, whether it says it isn't ready, and its countdown's
 *  second. */
export interface PreviewLook {
  shown: boolean;
  red: boolean;
  countdown: number | null;
}

/** How the preview took a skill held through its cooldown, and held short of energy. */
export interface CooldownHeld {
  /** the frames on cooldown it was red, and those it showed ready */
  redFrames: number;
  greenFrames: number;
  /** the seconds its countdown showed, in the order they came, and the frames it showed another than the seconds left
   *  rounded up (none counts as another) */
  seconds: number[];
  offFrames: number;
  /** let go while red, it cast */
  earlyCast: boolean;
  /** the frames from its being ready until the preview showed it (-1: never), and those with a countdown meanwhile */
  turnFrames: number;
  countedReady: number;
  /** let go once it showed ready, it cast */
  cast: boolean;
  /** held short of energy, no cooldown: red, a countdown shown, and let go, it cast */
  shortRed: boolean;
  shortCounted: boolean;
  shortCast: boolean;
}

/** Reads the preview as it is drawn this frame: whether it shows and whether it's red (its countdown is read here). */
export type PreviewReader = () => { shown: boolean; red: boolean };

/** How the hold is run: pictured on its cooldown, and with `canary` read as ready with no countdown (a broken
 *  preview's look), which its checks must catch. */
export interface HoldOptions {
  pictures: boolean;
  canary: boolean;
  /** what the picture is labelled */
  label: string;
}

/** The preview of the skill `impl` as it's drawn this frame: as `read` sees it, its countdown as its readiness shows
 *  it (with `canary`: shown ready, with no countdown, as a broken preview would). */
function previewLook(impl: string, read: PreviewReader, canary: boolean): PreviewLook {
  const drawn = read();
  if (!drawn.shown) return { shown: false, red: false, countdown: null };
  if (canary) return { shown: true, red: false, countdown: null };
  return { shown: true, red: drawn.red, countdown: readinessOf(impl)?.second || null };
}

/** The frame's input holding the skill key `key` over `aim`: a mouse button's, or a key's. */
export function holdingKey(key: SkillKey, aim: THREE.Vector3): Frame {
  if (key === 'mouse0') return { m0: true, aim };
  if (key === 'mouse2') return { m2: true, aim };
  return { keys: [key], aim };
}

/** Whether `hero` has just set off the skill `impl`: its cast under way, or his blink. */
const castStarted = (hero: Player, impl: string): boolean => hero.casting?.skill.def.impl === impl || !!hero.dash;

/** Notes a frame on cooldown: its look, and its countdown against the seconds left. */
function noteOnCooldown(held: CooldownHeld, look: PreviewLook, left: number): void {
  if (look.red) held.redFrames++;
  else held.greenFrames++;
  if (look.countdown !== Math.ceil(left)) held.offFrames++;
  const last = held.seconds[held.seconds.length - 1];
  if (look.countdown !== null && look.countdown !== last) held.seconds.push(look.countdown);
}

/**
 * The held skill on `key` held over `aim` through its cooldown and short of energy, as the player would, its preview
 * read every frame by `read`.
 */
export async function holdThroughCooldown(
  lab: Lab, key: SkillKey, aim: THREE.Vector3, read: PreviewReader, options: HoldOptions,
): Promise<{ held: CooldownHeld; moments: Pictured[] }> {
  const hero = G.player;
  const impl = hero.skillAt(key)!.def.impl;
  const held: CooldownHeld = {
    redFrames: 0, greenFrames: 0, seconds: [], offFrames: 0, earlyCast: false, turnFrames: -1, countedReady: 0,
    cast: false, shortRed: false, shortCounted: false, shortCast: false,
  };
  const moments: Pictured[] = [];
  const look = () => previewLook(impl, read, options.canary);
  const holding = () => holdingKey(key, aim);
  const letGo = () => ({ aim });
  const note = () => noteOnCooldown(held, look(), hero.cooldownLeft(impl));
  hero.energy = hero.stats.maxEnergy;
  hero.cooldowns.set(impl, COOLDOWN_LEFT);
  await lab.step(EARLY_FRAMES, holding, note);
  await lab.step(1, letGo);
  held.earlyCast = castStarted(hero, impl);
  let readyAt = -1;
  for (let frame = 0; held.turnFrames < 0 && (readyAt < 0 || frame - readyAt <= TURN_FRAMES); frame++) {
    await lab.step(1, holding);
    const left = hero.cooldownLeft(impl);
    const now = look();
    if (left > 0) noteOnCooldown(held, now, left);
    else {
      if (readyAt < 0) readyAt = frame;
      if (now.countdown !== null) held.countedReady++;
      if (!now.red) held.turnFrames = frame - readyAt;
    }
    if (options.pictures && frame === PICTURE_FRAME) {
      moments.push(await lab.screen(`${options.label}: held on its cooldown, counting down`));
    }
  }
  await lab.step(1, letGo);
  held.cast = castStarted(hero, impl);
  await lab.until(() => !hero.casting && !hero.dash, CAST_FRAMES, 'the cast never ended');
  hero.cooldowns.clear();
  const starved = () => {
    hero.energy = 0;
    return holding();
  };
  await lab.step(SHORT_FRAMES, starved);
  const short = look();
  held.shortRed = short.red;
  held.shortCounted = short.countdown !== null;
  await lab.step(1, () => {
    hero.energy = 0;
    return letGo();
  });
  held.shortCast = castStarted(hero, impl);
  hero.energy = hero.stats.maxEnergy;
  return { held, moments };
}

/** The seconds a countdown from `COOLDOWN_LEFT` shows, in turn: 3, 2, 1. */
function expectedSeconds(): number[] {
  const seconds: number[] = [];
  for (let second = Math.ceil(COOLDOWN_LEFT); second >= 1; second--) seconds.push(second);
  return seconds;
}

/** The hold as a line. */
export function describeHeld(held: CooldownHeld): string {
  const onCooldown = held.redFrames + held.greenFrames;
  const turned = held.turnFrames < 0
    ? 'never showed ready once it was'
    : `showed ready ${held.turnFrames} frames after it was`;
  return `  held through its cooldown (${COOLDOWN_LEFT.toFixed(2)} s left): red on ${held.redFrames} of ${onCooldown} `
    + `frames, counting ${held.seconds.join(', ') || 'nothing'} (${held.offFrames} frames off the seconds left); `
    + `let go red: ${held.earlyCast ? 'cast' : 'nothing cast'}; ${turned}, a countdown on ${held.countedReady} `
    + `frames then; let go: ${held.cast ? 'cast' : 'nothing cast'}; short of energy: `
    + `${held.shortRed ? 'red' : 'shown ready'}, ${held.shortCounted ? 'a countdown' : 'no countdown'}, let go: `
    + `${held.shortCast ? 'cast' : 'nothing cast'}`;
}

/** What's wrong with the hold: a problem for each check it failed. */
export function heldProblems(held: CooldownHeld): string[] {
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`held through its cooldown: ${problem}`);
  if (held.greenFrames) say(`shown ready on ${held.greenFrames} frames while it was cooling down`);
  if (held.offFrames) say(`the countdown was off the seconds left on ${held.offFrames} frames`);
  const expected = expectedSeconds().join(', ');
  const counted = held.seconds.join(', ');
  if (counted !== expected) say(`the countdown went ${counted || 'nowhere'}, not ${expected}`);
  if (held.earlyCast) say('let go while red, it cast');
  if (held.turnFrames < 0 || held.turnFrames > TURN_FRAMES) say('still red once it was ready');
  if (held.countedReady) say(`a countdown showed on ${held.countedReady} frames once it was ready`);
  if (!held.cast) say('let go once it showed ready, it didn\'t cast');
  if (!held.shortRed) say('short of energy, the preview wasn\'t red');
  if (held.shortCounted) say('short of energy, a countdown showed with no cooldown');
  if (held.shortCast) say('let go short of energy, it cast');
  return problems;
}

/** A canary's hold: its problems must say it showed ready while cooling down. */
export const canaryCaught = (held: CooldownHeld): boolean =>
  heldProblems(held).some((problem) => problem.includes('while it was cooling down'));

/** Whether a glow's colour is the preview's red (not a gold, a green or a white: red well over both the others). */
const reddish = (colour: THREE.Color): boolean => colour.r > 2 * colour.g && colour.r > 2 * colour.b;

/** A reader of a preview drawn as a glowing mesh named `name` (Veilstep's ring, Starfall's, Strawman's spot): shown
 *  with it, and red by its colour. */
export function meshReader(name: string): PreviewReader {
  return () => {
    const mesh = G.scene.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh?.visible) return { shown: false, red: false };
    return { shown: true, red: reddish((mesh.material as THREE.MeshBasicMaterial).color) };
  };
}
