// The blink's preview held through its cooldown (tools/lab `blink`; Veilstep's preview in
// src/combat/skills/blink.ts), as a player holds it: the key pressed with seconds of the cooldown left, let go while
// the preview is red (nothing may be cast), pressed again and held until it turns green, and let go (it must cast).
// Every frame the preview is read as it is drawn: red or green (its ring's colour), and the second its countdown shows
// against the seconds of the cooldown left. Then held short of energy: red, and no countdown, as there's no cooldown.
import type { Lab, Pictured } from './lab';
import type { SkillKey } from '../../../src/types';
import type * as THREE from 'three';
import { G } from '../../../src/state';

/** the cooldown left as the key is first pressed (s): three seconds counting down, 3, 2, 1 */
const COOLDOWN_LEFT = 2.5;
/** the frames held, then let go, while it's still on cooldown */
const EARLY_FRAMES = 12;
/** the most frames the preview may take to turn green once it's ready */
const TURN_FRAMES = 15;
/** the frames it's held short of energy */
const SHORT_FRAMES = 12;
/** the frames of the hold through the cooldown at which it's pictured (on cooldown, red, counting down) */
const PICTURE_FRAME = 40;
/** the most frames a blink is waited for to end */
const BLINK_FRAMES = 60;

/** What the preview shows in a frame: whether it shows at all, whether it's red, and its countdown's second. */
interface PreviewLook {
  shown: boolean;
  red: boolean;
  countdown: number | null;
}

/** How the preview took a blink held through its cooldown, and held short of energy. */
export interface CooldownHeld {
  /** the frames on cooldown it was red, and those it was green */
  redFrames: number;
  greenFrames: number;
  /** the seconds its countdown showed, in the order they came, and the frames it showed another than the seconds left
   *  rounded up (none counts as another) */
  seconds: number[];
  offFrames: number;
  /** let go while red, it cast */
  earlyCast: boolean;
  /** the frames from its being ready until the preview was green (-1: never), and those with a countdown meanwhile */
  turnFrames: number;
  countedReady: number;
  /** let go once green, it cast */
  cast: boolean;
  /** held short of energy, no cooldown: red, a countdown shown, and let go, it cast */
  shortRed: boolean;
  shortCounted: boolean;
  shortCast: boolean;
}

/** The preview as it's drawn this frame (with `canary`: shown green, with no countdown, as a broken preview would). */
function previewLook(canary: boolean): PreviewLook {
  const ring = G.scene.getObjectByName('blink-preview') as THREE.Mesh | undefined;
  if (!ring?.visible) return { shown: false, red: false, countdown: null };
  const colour = (ring.material as THREE.MeshBasicMaterial).color;
  const countdown = (ring.userData.countdown as number | null | undefined) ?? null;
  if (canary) return { shown: true, red: false, countdown: null };
  return { shown: true, red: colour.r > colour.g, countdown };
}

/** Notes a frame on cooldown: its colour, and its countdown against the seconds left. */
function noteOnCooldown(held: CooldownHeld, look: PreviewLook, left: number): void {
  if (look.red) held.redFrames++;
  else held.greenFrames++;
  if (look.countdown !== Math.ceil(left)) held.offFrames++;
  const last = held.seconds[held.seconds.length - 1];
  if (look.countdown !== null && look.countdown !== last) held.seconds.push(look.countdown);
}

/**
 * The blink on `key` held over `aim` through its cooldown and short of energy, as the player would, its preview read
 * every frame. With `pictures`, the preview on cooldown pictured; with `canary`, it's read as green with no countdown.
 */
export async function holdThroughCooldown(
  lab: Lab, key: SkillKey, aim: THREE.Vector3, { pictures, canary }: { pictures: boolean; canary: boolean },
): Promise<{ held: CooldownHeld; moments: Pictured[] }> {
  const hero = G.player;
  const skill = hero.skillAt(key)!.def;
  const held: CooldownHeld = {
    redFrames: 0, greenFrames: 0, seconds: [], offFrames: 0, earlyCast: false, turnFrames: -1, countedReady: 0,
    cast: false, shortRed: false, shortCounted: false, shortCast: false,
  };
  const moments: Pictured[] = [];
  const holding = () => ({ keys: [key], aim });
  const letGo = () => ({ aim });
  const note = () => noteOnCooldown(held, previewLook(canary), hero.cooldownLeft(skill.impl));
  hero.energy = hero.stats.maxEnergy;
  hero.cooldowns.set(skill.impl, COOLDOWN_LEFT);
  await lab.step(EARLY_FRAMES, holding, note);
  await lab.step(1, letGo);
  held.earlyCast = !!hero.dash;
  let readyAt = -1;
  for (let frame = 0; held.turnFrames < 0 && (readyAt < 0 || frame - readyAt <= TURN_FRAMES); frame++) {
    await lab.step(1, holding);
    const left = hero.cooldownLeft(skill.impl);
    const look = previewLook(canary);
    if (left > 0) noteOnCooldown(held, look, left);
    else {
      if (readyAt < 0) readyAt = frame;
      if (look.countdown !== null) held.countedReady++;
      if (!look.red) held.turnFrames = frame - readyAt;
    }
    if (pictures && frame === PICTURE_FRAME) {
      moments.push(await lab.screen('blink: held on its cooldown, counting down'));
    }
  }
  await lab.step(1, letGo);
  held.cast = !!hero.dash;
  await lab.until(() => !hero.dash, BLINK_FRAMES, 'the blink never ended');
  hero.cooldowns.clear();
  const starved = () => {
    hero.energy = 0;
    return holding();
  };
  await lab.step(SHORT_FRAMES, starved);
  const short = previewLook(canary);
  held.shortRed = short.red;
  held.shortCounted = short.countdown !== null;
  await lab.step(1, () => {
    hero.energy = 0;
    return letGo();
  });
  held.shortCast = !!hero.dash;
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
    ? 'never green once it was ready'
    : `green ${held.turnFrames} frames after it was ready`;
  return `  held through its cooldown (${COOLDOWN_LEFT.toFixed(2)} s left): red on ${held.redFrames} of ${onCooldown} `
    + `frames, counting ${held.seconds.join(', ') || 'nothing'} (${held.offFrames} frames off the seconds left); `
    + `let go red: ${held.earlyCast ? 'cast' : 'nothing cast'}; ${turned}, a countdown on ${held.countedReady} `
    + `frames then; let go: ${held.cast ? 'cast' : 'nothing cast'}; short of energy: `
    + `${held.shortRed ? 'red' : 'green'}, ${held.shortCounted ? 'a countdown' : 'no countdown'}, let go: `
    + `${held.shortCast ? 'cast' : 'nothing cast'}`;
}

/** What's wrong with the hold: a problem for each check it failed. */
export function heldProblems(held: CooldownHeld): string[] {
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`held through its cooldown: ${problem}`);
  if (held.greenFrames) say(`green on ${held.greenFrames} frames while it was cooling down`);
  if (held.offFrames) say(`the countdown was off the seconds left on ${held.offFrames} frames`);
  const expected = expectedSeconds().join(', ');
  const counted = held.seconds.join(', ');
  if (counted !== expected) say(`the countdown went ${counted || 'nowhere'}, not ${expected}`);
  if (held.earlyCast) say('let go while red, it cast');
  if (held.turnFrames < 0 || held.turnFrames > TURN_FRAMES) say('still red once it was ready');
  if (held.countedReady) say(`a countdown showed on ${held.countedReady} frames once it was ready`);
  if (!held.cast) say('let go once green, it didn\'t cast');
  if (!held.shortRed) say('short of energy, the preview wasn\'t red');
  if (held.shortCounted) say('short of energy, a countdown showed with no cooldown');
  if (held.shortCast) say('let go short of energy, it cast');
  return problems;
}
