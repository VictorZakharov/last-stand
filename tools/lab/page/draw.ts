// Every drawn shot of the hero's class (tools/lab `draw`; `SkillDef.draw`, src/combat/skills/ranger.ts `drawGlint`)
// drawn to full and held there as the player holds it, its key down over an aim ahead, in one of the game's views.
// Every frame the glow particles round the arrowhead are counted: motes must draw in onto it as it's drawn, and held
// at full it must keep glinting until it's loosed (a burst as it came to full and nothing after read as the charge
// gone). With no shot drawn, nothing may glint there. Held at full, the glint is judged as the player sees it in the
// view (page/addedLight.ts: the frame drawn with it and without it, round the arrowhead): the particles fade out
// within 3.5 m of the camera, and through the eyes, the arrowhead under a metre off, nothing of them showed.
import * as THREE from 'three';
import type { Fixture, Frame, Lab, Pictured, Report } from './lab';
import { screenArea } from './lab';
import type { SkillKey } from '../../../src/types';
import type { Player } from '../../../src/entities/player';
import { G } from '../../../src/state';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { particles } from '../../../src/fx/particles';
import { ARROW } from '../../../src/entities/models/bow';
import { addedRound, type Added } from './addedLight';
import { lateCompiles } from '../../../src/core/shaders';

export interface DrawOptions {
  /** the set-up, its view among it */
  fixture: Fixture;
  /** each shot pictured held at full draw */
  pictures: boolean;
  /** plant the fault the checks must catch: the glint (its particles and its flare) taken away once the draw is full */
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
/** how far round the arrowhead a particle counts as its glint (m) */
const NEAR = 0.6;
/** the share of the frames at full draw that must glint, the longest it may go without (frames), and the share of
 *  the draw's second half with motes drawn in */
const FULL_SHARE = 0.9;
const LONGEST_GAP = 20;
const DRAWING_SHARE = 0.5;
/** the least share of the frame's pixels the glint must light held at full draw, in every view: about a disc a
 *  fiftieth of the frame's height across (its particles alone lit 0 to 0.5 in 10,000, none through the eyes; with
 *  its flare, 6 to 17) */
const SEEN_LEAST = 2.5e-4;
/** the flare's name in the scene (src/fx/glintFlare.ts) */
const FLARE = 'glintFlare';
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

/** The glow particles round `hero`'s arrowhead. */
function glintNear(hero: Player): number {
  arrowHeadOf(hero, head);
  const pool = particles.glow;
  let near = 0;
  for (let i = 0; i < pool.count; i++) {
    const x = pool.pos[i * 3] - head.x;
    const y = pool.pos[i * 3 + 1] - head.y;
    const z = pool.pos[i * 3 + 2] - head.z;
    if (x * x + y * y + z * z < NEAR * NEAR) near++;
  }
  return near;
}

/** How far `hero`'s shot is drawn (0 to 1; -1 with none drawn), as the game counts it. */
function drawnShare(hero: Player): number {
  const cast = hero.casting;
  if (!cast?.drawT) return -1;
  return Math.min(1, Math.max(0, cast.t - (cast.nockT ?? 0)) / cast.drawT);
}

/** The glint's flares in the scene (none in a tree without them). */
function flares(): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  G.scene.traverse((object) => {
    if (object.name === FLARE) found.push(object);
  });
  return found;
}

/** The glint hidden from the frame: the glow particles and the flares; returns the showing of them again. */
function hideGlint(): () => void {
  const shown = flares().filter((flare) => flare.visible);
  particles.glow.points.visible = false;
  for (const flare of shown) flare.visible = false;
  return () => {
    particles.glow.points.visible = true;
    for (const flare of shown) flare.visible = true;
  };
}

/** One shot's frames: idle, the draw's second half and held at full, each frame's glint counted, and what it showed. */
interface Drawn {
  idleGlinting: number;
  drawingFrames: number;
  drawingGlinting: number;
  fullFrames: number;
  fullGlinting: number;
  longestGap: number;
  /** what the glint added to the frame round the arrowhead, held at full */
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
 * counted every frame and what it adds to the frame measured halfway (with `canary`, taken away once the draw is full).
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
    if (glintNear(hero)) drawn.idleGlinting++;
  });
  let gap = 0;
  const moments: Pictured[] = [];
  for (let frame = 0; drawn.fullFrames < FULL_FRAMES; frame++) {
    if (frame > DRAW_FRAMES + FULL_FRAMES) throw new Error(`lab: draw: ${shot.name} never came to full draw`);
    await lab.step(1, () => holding(shot.key, aim));
    const share = drawnShare(hero);
    if (share < FULL) {
      if (share < 0.5) continue;
      drawn.drawingFrames++;
      if (glintNear(hero)) drawn.drawingGlinting++;
      continue;
    }
    if (options.canary) {
      particles.glow.count = 0;
      for (const flare of flares()) flare.visible = false;
    }
    drawn.fullFrames++;
    gap = glintNear(hero) ? 0 : gap + 1;
    if (!gap) drawn.fullGlinting++;
    drawn.longestGap = Math.max(drawn.longestGap, gap);
    if (drawn.fullFrames !== FULL_FRAMES / 2) continue;
    drawn.seen = addedRound(lab, arrowHeadOf(hero, head), hideGlint);
    if (options.pictures) moments.push(...await pictureHeld(lab, shot, String(options.fixture.view), drawn.seen));
  }
  await lab.step(1, () => ({ aim }));
  await lab.until(() => !hero.casting, DRAW_FRAMES, `${shot.name}'s shot never ended`);
  return { drawn, moments };
}

/** What the glint showed held at full draw, as words. */
function describeSeen(seen: Added | null): string {
  if (!seen) return 'never measured';
  if (!seen.onScreen) return 'its arrowhead off the screen';
  const where = `at ${(seen.x * 100).toFixed(0)}%, ${(seen.y * 100).toFixed(0)}% of the screen`;
  return `${seen.pixels} pixels lit (${(seen.share * 1e4).toFixed(1)} in 10,000 of the frame's), `
    + `${seen.strongest.toFixed(2)} of white at the brightest, ${where}`;
}

/** The shot's frames as lines. */
function describeDrawn(shot: DrawnShot, drawn: Drawn): string[] {
  return [
    `${shot.name} (${shot.key}): idle, glinting on ${drawn.idleGlinting} of ${IDLE_FRAMES} frames; drawing `
      + `(its second half), motes on ${drawn.drawingGlinting} of ${drawn.drawingFrames}; held at full, glinting on `
      + `${drawn.fullGlinting} of ${drawn.fullFrames}, ${drawn.longestGap} frames without at the longest`,
    `  held at full, as the player sees it: ${describeSeen(drawn.seen)}`,
  ];
}

/** What's wrong with the shot's glint: a problem for each check it failed. */
function drawnProblems(shot: DrawnShot, drawn: Drawn, view: string): string[] {
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`${shot.name}, ${view}: ${problem}`);
  if (drawn.idleGlinting) say(`glinting with no shot drawn on ${drawn.idleGlinting} frames`);
  if (drawn.drawingGlinting < drawn.drawingFrames * DRAWING_SHARE) {
    say(`motes on only ${drawn.drawingGlinting} of the draw's ${drawn.drawingFrames} last frames`);
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
  }
  const compiled = lateCompiles.slice(compiledBefore);
  lines.push(`shaders compiled meanwhile: ${compiled.length}`, ...compiled.map((program) => `  ${program}`));
  if (compiled.length) problems.push(`${view}: ${compiled.length} shaders compiled while drawing (not at load)`);
  return { text: lines.join('\n'), problems, moments };
}
