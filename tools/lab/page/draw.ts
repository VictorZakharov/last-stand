// Every drawn shot of the hero's class (tools/lab `draw`; `SkillDef.draw`, src/combat/skills/ranger.ts `drawGlint`)
// drawn to full and held there as the player holds it, its key down over an aim ahead, in one of the game's views.
// Every frame its motes on the arrowhead are read (src/fx/glintMotes.ts): they must draw in onto it as it's drawn, and
// held at full it must keep glinting until it's loosed (a burst as it came to full and nothing after read as the
// charge gone). With no shot drawn, nothing may glint there. Held at full, the glint is judged as the player sees it
// in the view (page/addedLight.ts: the frame drawn with it and without it, round the arrowhead): seen, and not bright.
// As glow particles they fade out within 3.5 m of the camera, and through the eyes nothing of them showed; a star of
// light on the arrowhead was seen in every view, and was too bright.
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Pictured, Report } from './lab';
import { screenArea } from './lab';
import type { SkillKey } from '../../../src/types';
import type { Player } from '../../../src/entities/player';
import { G } from '../../../src/state';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { ARROW } from '../../../src/entities/models/bow';
import { addedRound, type Added } from './addedLight';
import { glintMotes, glintShown } from '../../../src/fx/glintMotes';
import { lateCompiles } from '../../../src/core/shaders';

export interface DrawOptions {
  /** the set-up, its view among it */
  fixture: Fixture;
  /** each shot pictured held at full draw, at its most glaring moment */
  pictures: boolean;
  /** plant the faults the checks must catch: the glint shown as the bow is drawn, and taken away once it's full */
  canary: boolean;
}

/** how far ahead of the hero the aim is (m) */
const AIM_AHEAD = 12;
/** the frames looked at before the key is pressed (nothing drawn), and held at full draw */
const IDLE_FRAMES = 30;
const FULL_FRAMES = 120;
/** the most frames a shot may take to come to full draw (its arrow taken from the quiver first) */
const DRAW_FRAMES = 240;
/** a drawn shot counts as drawn to full from here (of its draw's time: the game's own) */
const FULL = 0.98;
/** how strongly the motes must show for the arrowhead to count as glinting (0 to 1) */
const SHOWN = 0.05;
/** the share of the frames at full draw that must glint, and the longest it may go without (frames) */
const FULL_SHARE = 0.9;
const LONGEST_GAP = 20;
/** how far drawn the canary's glint shows (of the draw) */
const CANARY_FROM = 0.5;
/** the least share of the frame's pixels the glint must light held at full draw, in every view (as glow particles it
 *  lit 0 to 0.1 in 10,000 from above and none through the eyes: hardly seen; its motes light 0.5 to 0.8 at their
 *  least), and the largest patch it may glare on, a share of the frame's pixels (a star of light on the arrowhead
 *  glared in one blob of 0.64 to 3.6 in 10,000 and was too bright, and motes bright enough to bloom merged into blobs
 *  of 0.9 to 1.6; the motes' specks are 0.41 at most) */
const SEEN_LEAST = 0.4e-4;
const BLOB_MOST = 0.55e-4;
/** the frames into the hold at full draw at which the glint is judged as the player sees it, every few over a cycle of
 *  its motes and more (they move: at one frame, as many as three times more of them showed for one shot as for
 *  another, and judged at four frames, their worst moments went unseen) */
const SEEN_EVERY = 4;
const SEEN_FRAMES = Array.from({ length: 28 }, (_, moment) => 12 + moment * SEEN_EVERY);
/** the motes' name in the scene (src/fx/glintMotes.ts) */
const MOTES = 'glintMotes';
/** css px round the arrowhead a close picture of it takes in */
const CLOSE = 140;

/** A drawn shot of the hero's: its key and its name. */
interface DrawnShot {
  key: SkillKey;
  name: string;
}

/** The hero's drawn shots, in his bar's order. */
function drawnShots(): DrawnShot[] {
  const shots: DrawnShot[] = [];
  for (const key of SKILL_KEYS) {
    const def = G.player.skillAt(key)?.def;
    if (def?.draw && !def.channel) shots.push({ key, name: def.name });
  }
  return shots;
}

/** The frame's input holding the skill key `key` over `aim`: a mouse button's, or a key's. */
function holding(key: SkillKey, aim: THREE.Vector3): Frame {
  if (key === 'mouse0') return { m0: true, aim };
  if (key === 'mouse2') return { m2: true, aim };
  return { keys: [key], aim };
}

/** Where `hero`'s arrowhead is: the model's own, or half an arrow ahead of where the shot leaves (an older tree). */
function arrowHeadOf(hero: Player, out = new THREE.Vector3()): THREE.Vector3 {
  const head = hero.model.arrowHead;
  if (head) return head.getWorldPosition(out);
  const facing = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  return out.copy(hero.castPoint).addScaledVector(facing, ARROW * 0.45);
}

const head = new THREE.Vector3();

/** Whether `hero`'s arrowhead glints this frame: its motes showing. */
const glinting = (hero: Player): boolean => glintShown(hero) > SHOWN;

/** How far `hero`'s shot is drawn (0 to 1; -1 with none drawn), as the game counts it. */
function drawnShare(hero: Player): number {
  const cast = hero.casting;
  if (!cast?.drawT) return -1;
  return Math.min(1, Math.max(0, cast.t - (cast.nockT ?? 0)) / cast.drawT);
}

/** The glint's motes in the scene. */
function motes(): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  G.scene.traverse((object) => {
    if (object.name === MOTES) found.push(object);
  });
  return found;
}

/** The glint hidden from the frame; returns the showing of it again. */
function hideGlint(): () => void {
  const shown = motes().filter((mesh) => mesh.visible);
  for (const mesh of shown) mesh.visible = false;
  return () => {
    for (const mesh of shown) mesh.visible = true;
  };
}

/** One shot's frames: idle, drawn short of full and held at full, each frame's glint counted, and what it showed. */
interface Drawn {
  idleGlinting: number;
  drawingFrames: number;
  drawingGlinting: number;
  fullFrames: number;
  fullGlinting: number;
  longestGap: number;
  /** what the glint added to the frame round the arrowhead held at full, at its least seen and its brightest over the
   *  moments it was judged */
  seen: Added | null;
}

/** The glint held at full draw pictured: the screen as the player sees it, and close round the arrowhead. */
async function pictureHeld(lab: Lab, shot: DrawnShot, view: string, seen: Added): Promise<Pictured[]> {
  const label = `${shot.name}, ${view}: held at full draw`;
  const pictures = [await lab.screen(label)];
  if (seen.onScreen) pictures.push(await lab.screen(`${label}, its arrowhead`, [], screenArea([head], CLOSE)));
  return pictures;
}

/**
 * `shot` drawn to full over an aim ahead and held there `FULL_FRAMES`, then loosed, the glint round the arrowhead
 * counted every frame and what it adds to the frame measured every few frames of the hold, pictured at its most
 * glaring (with `canary`, shown as it's drawn and taken away once the draw is full).
 */
async function drawToFull(
  lab: Lab, shot: DrawnShot, options: DrawOptions,
): Promise<{ drawn: Drawn; moments: Pictured[] }> {
  await lab.setup({ ...options.fixture, nocked: true });
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const aim = hero.pos.clone().addScaledVector(ahead, AIM_AHEAD);
  const drawn: Drawn = {
    idleGlinting: 0, drawingFrames: 0, drawingGlinting: 0, fullFrames: 0, fullGlinting: 0, longestGap: 0, seen: null,
  };
  await lab.step(IDLE_FRAMES, () => ({ aim }), () => {
    if (glinting(hero)) drawn.idleGlinting++;
  });
  let gap = 0;
  const moments: Pictured[] = [];
  for (let frame = 0; drawn.fullFrames < FULL_FRAMES; frame++) {
    if (frame > DRAW_FRAMES + FULL_FRAMES) throw new Error(`lab: draw: ${shot.name} never came to full draw`);
    await lab.step(1, () => holding(shot.key, aim));
    const share = drawnShare(hero);
    if (share < FULL) {
      drawn.drawingFrames++;
      if (glinting(hero)) drawn.drawingGlinting++;
      if (options.canary && share >= CANARY_FROM) glintMotes(hero);
      continue;
    }
    if (options.canary) {
      for (const mesh of motes()) mesh.visible = false;
    }
    drawn.fullFrames++;
    gap = glinting(hero) ? 0 : gap + 1;
    if (!gap) drawn.fullGlinting++;
    drawn.longestGap = Math.max(drawn.longestGap, gap);
    if (!SEEN_FRAMES.includes(drawn.fullFrames)) continue;
    const seen = addedRound(lab, arrowHeadOf(hero, head), hideGlint);
    // (pictured again at each moment glaring more than all before it, so its worst is what's seen)
    if (options.pictures && (!drawn.seen || seen.blob > drawn.seen.blob)) {
      moments.splice(0, moments.length, ...await pictureHeld(lab, shot, String(options.fixture.view), seen));
    }
    drawn.seen = drawn.seen ? worstOf(drawn.seen, seen) : seen;
  }
  await lab.step(1, () => ({ aim }));
  await lab.until(() => !hero.casting, DRAW_FRAMES, `${shot.name}'s shot never ended`);
  return { drawn, moments };
}

/** Two moments' glint as one: the least it was seen at either and its brightest at either. */
function worstOf(one: Added, other: Added): Added {
  const leastSeen = other.share < one.share ? other : one;
  return {
    ...leastSeen,
    onScreen: one.onScreen && other.onScreen,
    glare: Math.max(one.glare, other.glare),
    blob: Math.max(one.blob, other.blob),
    strongest: Math.max(one.strongest, other.strongest),
  };
}

/** What the glint showed held at full draw, as words. */
function describeSeen(seen: Added | null): string {
  if (!seen) return 'never measured';
  if (!seen.onScreen) return 'its arrowhead off the screen';
  const where = `at ${(seen.x * 100).toFixed(0)}%, ${(seen.y * 100).toFixed(0)}% of the screen`;
  return `${seen.pixels} pixels lit (${(seen.share * 1e4).toFixed(1)} in 10,000 of the frame's), `
    + `glaring on ${(seen.glare * 1e4).toFixed(1)} (its largest patch ${(seen.blob * 1e4).toFixed(2)}), `
    + `${seen.strongest.toFixed(2)} of white at the brightest, ${where}`;
}

/** The shot's frames as lines. */
function describeDrawn(shot: DrawnShot, drawn: Drawn): string[] {
  return [
    `${shot.name} (${shot.key}): idle, glinting on ${drawn.idleGlinting} of ${IDLE_FRAMES} frames; drawn short of `
      + `full, glinting on ${drawn.drawingGlinting} of ${drawn.drawingFrames}; held at full, glinting on `
      + `${drawn.fullGlinting} of ${drawn.fullFrames}, ${drawn.longestGap} frames without at the longest`,
    `  held at full, as the player sees it (the least seen and the brightest of ${SEEN_FRAMES.length} moments): `
      + describeSeen(drawn.seen),
  ];
}

/** What's wrong with the shot's glint: a problem for each check it failed. */
function drawnProblems(shot: DrawnShot, drawn: Drawn, view: string): string[] {
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`${shot.name}, ${view}: ${problem}`);
  if (drawn.idleGlinting) say(`glinting with no shot drawn on ${drawn.idleGlinting} frames`);
  if (drawn.drawingGlinting) {
    say(`glinting before the draw was full on ${drawn.drawingGlinting} of its ${drawn.drawingFrames} frames`);
  }
  if (drawn.fullGlinting < drawn.fullFrames * FULL_SHARE) {
    say(`glinting on only ${drawn.fullGlinting} of ${drawn.fullFrames} frames held at full draw`);
  }
  if (drawn.longestGap > LONGEST_GAP) say(`${drawn.longestGap} frames without a glint held at full draw`);
  const seen = drawn.seen;
  if (seen?.onScreen && seen.share < SEEN_LEAST) {
    say(`hardly seen held at full draw: ${seen.pixels} pixels lit (${(seen.share * 1e4).toFixed(1)} in 10,000, `
      + `${(SEEN_LEAST * 1e4).toFixed(1)} at least)`);
  }
  if (seen?.onScreen && seen.blob > BLOB_MOST) {
    say(`too bright held at full draw: a patch of glare on ${(seen.blob * 1e4).toFixed(2)} in 10,000 of the frame's `
      + `pixels (${(BLOB_MOST * 1e4).toFixed(2)} at most)`);
  }
  return problems;
}

/** `lab draw`, one view: each of the hero's drawn shots drawn to full and held; a problem for each check failed (and
 *  with `canary`, for a glint taken away that went unseen). */
export async function draw(lab: Lab, options: DrawOptions): Promise<Report> {
  const shots = drawnShots();
  if (!shots.length) throw new Error(`lab: draw: the ${G.player.cls.id} has no shot drawn while held`);
  const view = String(options.fixture.view ?? 'top');
  const lines = [`${view} view`];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const compiledBefore = lateCompiles.length;
  for (const shot of shots) {
    const { drawn, moments: pictured } = await drawToFull(lab, shot, options);
    lines.push(...describeDrawn(shot, drawn));
    moments.push(...pictured);
    const found = drawnProblems(shot, drawn, view);
    if (!options.canary) {
      problems.push(...found);
      continue;
    }
    const caught = found.some((problem) => problem.includes('at full draw'));
    const seenCaught = found.some((problem) => problem.includes('hardly seen'));
    lines.push(`  canary, the glint taken away at full draw: ${caught ? 'caught' : 'missed'}, `
      + `as the player sees it ${seenCaught ? 'caught' : 'missed'}`);
    if (!caught) problems.push(`${shot.name}, ${view}: the canary's glint taken away at full draw went unseen`);
    if (!seenCaught && drawn.seen?.onScreen) {
      problems.push(`${shot.name}, ${view}: the canary's glint taken away went unseen on the screen`);
    }
    const earlyCaught = found.some((problem) => problem.includes('before the draw was full'));
    lines.push(`  canary, the glint shown as the bow is drawn: ${earlyCaught ? 'caught' : 'missed'}`);
    if (!earlyCaught) problems.push(`${shot.name}, ${view}: the canary's glint shown as it's drawn went unseen`);
  }
  const compiled = lateCompiles.slice(compiledBefore);
  lines.push(`shaders compiled meanwhile: ${compiled.length}`, ...compiled.map((program) => `  ${program}`));
  if (compiled.length) problems.push(`${view}: ${compiled.length} shaders compiled while drawing (not at load)`);
  return { text: lines.join('\n'), problems, moments };
}
