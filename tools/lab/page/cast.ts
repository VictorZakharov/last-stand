// A skill cast as the player casts it, its effect seen frame by frame (tools/lab `cast`): the hero standing in a
// biome and one of the game's views with the biome's foes coming at him, the skill's key pressed (held for a held
// skill, drawn to full for a drawn shot, held through for a channel) over an aim ahead, and every frame from the press
// until the effect is over drawn as the game draws it and read back from the canvas (page/screenCells.ts). Each
// frame's light is held to the budget taken from the owner's screenshots, the flashes in it are counted as WCAG
// counts them (page/flashes.ts), and the shaders compiled after loading are counted: none may be.
import * as THREE from 'three';
import type { Frame, Lab, Pictured, Report } from './lab';
import type { SkillDef, SkillKey } from '../../../src/types';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { BIOMES, type BiomeId } from '../../../src/data/biomes';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { standIn } from './light';
import { cellName, frameCells, type FrameCells } from './screenCells';
import { worstFlashing, type FlashCount } from './flashes';

export interface CastOptions {
  /** the skill: its key (`3`), its behaviour (`maelstrom`) or its name */
  skill: string;
  biome: BiomeId;
  view: ViewMode;
  /** the way the hero faces, degrees (0 is +z) */
  facing: number;
  /** how many of the biome's foes come at the hero */
  foes: number;
  /** s from the press: the moments pictured */
  times: number[];
  pictures: boolean;
  /** plant the fault the checks must catch: a strobe, the exposure raised on every other tenth of a second */
  canary: boolean;
  /** the way the hero holds his weapons (as rolled when not given) */
  gear?: WeaponStyle;
}

/** how far ahead of the hero the aim is (m) */
const AIM_AHEAD = 8;
/** where the foes rise: this far ahead (m), spread over this arc across the aim (rad) */
const FOES_AHEAD = 13;
const FOES_ARC = 1.1;
/** the wave whose pool the foes are drawn from, and how many of its commonest kinds: the brutes' size and their slams'
 *  rings on the floor hid the effect */
const FOES_WAVE = 3;
const FOE_KINDS = 2;
/** a held skill's key held this long before it's let go, and a channel's (s) */
const AIM_HOLD = 0.4;
const CHANNEL_HOLD = 3;
/** the effect looked at past the skill's own time: its cast, its duration and its fading (s) */
const AFTER = 1;
const LEAST_SECONDS = 2;
const MOST_SECONDS = 10;
/** the budget for a frame's light (page/screenCells.ts), from the owner's screenshots of effects that read well: how
 *  far an effect may raise the frame's mean over the scene's own, and its brightest cell's mean (as stored, 0 to 255)
 *  and the share of it that's bright, at most. (The screenshots' mean of 75 was over crypt scenes of 20 to 25: the
 *  forest's daylight is 55 to 77 with nothing cast, where 75 left an effect no room at all.) */
const MEAN_RISE_MOST = 50;
const CELL_MOST = 150;
const BRIGHT_MOST = 0.05;
/** flashes in any one second of a cell that are a hazard */
const FLASHES_MOST = 3;
/** with --canary: the strobe's frames on and off, and how much it raises the exposure */
const STROBE_SPAN = 6;
const STROBE_GAIN = 6;

/** A skill of the hero's on its key. */
export interface BoundSkill {
  key: SkillKey;
  def: SkillDef;
}

/** The hero's skill that `wanted` names: its key, its behaviour or its name (any case). */
export function skillNamed(wanted: string): BoundSkill {
  const name = wanted.toLowerCase();
  const bound: BoundSkill[] = [];
  for (const key of SKILL_KEYS) {
    const def = G.player.skillAt(key)?.def;
    if (def) bound.push({ key, def });
  }
  const names = (skill: BoundSkill) => [skill.key, skill.def.impl, skill.def.name].map((each) => each.toLowerCase());
  const named = (skill: BoundSkill) => names(skill).includes(name);
  const found = bound.find(named);
  if (found) return found;
  const known = bound.map((skill) => `${skill.def.impl} (${skill.key})`).join(', ');
  throw new Error(`lab: cast: the ${G.player.cls.id} has no skill ${wanted}: ${known}`);
}

/** A skill the hero knows but hasn't on a key (Thunder Crescent, while the two-handed loadout has Steel Tempest on
 *  its key) put on its own key, as the player would bind it in the lobby. */
export function bindKnown(wanted: string): void {
  const hero = G.player;
  const name = wanted.toLowerCase();
  for (const [id, known] of hero.known) {
    const names = [known.def.impl, known.def.name].map((each) => each.toLowerCase());
    if (names.includes(name) && hero.usable(known.def)) hero.bind(known.def.key, id);
  }
}

/** The frame's input holding `key` over `aim` (nothing held when `held` is false). */
export function pressing(key: SkillKey, aim: THREE.Vector3, held: boolean): Frame {
  if (!held) return { aim };
  if (key === 'mouse0') return { m0: true, aim };
  if (key === 'mouse2') return { m2: true, aim };
  return { keys: [key], aim };
}

/** How long the key is held: a channel through, a drawn shot to full and a held skill a moment; else a frame (s). */
export function holdFor(def: SkillDef): number {
  if (def.channel) return CHANNEL_HOLD;
  if (def.draw) return def.draw + AIM_HOLD;
  if (def.aimed) return AIM_HOLD;
  return 0;
}

/** How long the effect is looked at from the press (s). */
function lookFor(def: SkillDef): number {
  const own = holdFor(def) + (def.castTime ?? 0) + (def.duration ?? 0) + AFTER;
  return Math.min(MOST_SECONDS, Math.max(LEAST_SECONDS, own));
}

/** The kinds `count` foes are: the commonest of the biome's for its third wave, in turn. */
function foeKinds(biome: BiomeId, count: number): EnemyId[] {
  const pool = BIOMES[biome].pool(FOES_WAVE).slice().sort((a, b) => b[1] - a[1]).slice(0, FOE_KINDS);
  return Array.from({ length: count }, (_, i) => pool[i % pool.length][0]);
}

/** `count` of the biome's foes risen on an arc ahead of the hero, coming at him. */
async function foesAhead(lab: Lab, biome: BiomeId, count: number): Promise<Enemy[]> {
  const hero = G.player;
  const foes = foeKinds(biome, count).map((kind, i) => {
    const across = count > 1 ? (i / (count - 1) - 0.5) * FOES_ARC : 0;
    const way = hero.facing + across;
    const at = hero.pos.clone().add(new THREE.Vector3(Math.sin(way), 0, Math.cos(way)).multiplyScalar(FOES_AHEAD));
    return lab.spawnFoe(kind, at);
  });
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), 300, 'the foes never rose');
  return foes;
}

const seconds = (at: number): string => `${at.toFixed(2)} s`;
const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;
const whole = (value: number): string => value.toFixed(0);
const brightestCell = (frame: FrameCells): number => Math.max(...frame.cellMeans);

/** One of the budget's measures of a frame's light: its name, a frame's on it and that as words, and its most. */
interface Measure {
  name: string;
  /** the most an effect's frame may be, after a scene that was `before` */
  most: (before: FrameCells) => number;
  /** whether the scene itself may be past it: no measure is judged on a scene already past its most */
  absolute: boolean;
  of: (frame: FrameCells) => number;
  shown: (value: number) => string;
  /** where in the frame it was, as words (the cell's place), for one that's of a part of it */
  where?: (frame: FrameCells) => string;
}

const MEASURES: Measure[] = [
  {
    name: 'the frame\'s mean',
    most: (before) => before.mean + MEAN_RISE_MOST,
    absolute: false,
    of: (frame) => frame.mean,
    shown: whole,
  },
  {
    name: 'its brightest sixteenth',
    most: () => CELL_MOST,
    absolute: true,
    of: brightestCell,
    shown: whole,
    where: (frame) => cellName(frame.cellMeans.indexOf(brightestCell(frame))),
  },
  {
    name: 'its bright share',
    most: () => BRIGHT_MOST,
    absolute: true,
    of: (frame) => frame.brightShare,
    shown: percent,
  },
];

/** The frame of `frames` that's worst on `measure`, its value and when it was (s from the press). */
interface WorstFrame {
  frame: FrameCells;
  value: number;
  at: number;
}

/** The worst of `frames` on `measure`, the frames `frameTime` s apart. */
function worstOn(measure: Measure, frames: FrameCells[], frameTime: number): WorstFrame {
  let worst: WorstFrame = { frame: frames[0], value: measure.of(frames[0]), at: 0 };
  frames.forEach((frame, f) => {
    const value = measure.of(frame);
    if (value > worst.value) worst = { frame, value, at: f * frameTime };
  });
  return worst;
}

/** Each measure's worst of `frames` as words. */
function worstLine(frames: FrameCells[], frameTime: number): string {
  const parts = MEASURES.map((measure) => {
    const worst = worstOn(measure, frames, frameTime);
    return `${measure.name} ${measure.shown(worst.value)} at ${seconds(worst.at)}`;
  });
  return `  its worst: ${parts.join(', ')}`;
}

/** What the frames came to against the budget: the problems, and notes on what wasn't judged. */
interface Judged {
  problems: string[];
  notes: string[];
}

/**
 * What the effect took past the budget: a problem for each measure the scene before it was within, and a note for
 * each of the absolute ones it was already past, which isn't judged.
 */
function budgetJudged(frames: FrameCells[], frameTime: number, before: FrameCells): Judged {
  const problems: string[] = [];
  const notes: string[] = [];
  for (const measure of MEASURES) {
    const scene = measure.of(before);
    const most = measure.most(before);
    if (measure.absolute && scene > most) {
      notes.push(`  (the scene alone is past the budget on ${measure.name}, ${measure.shown(scene)}: not judged)`);
      continue;
    }
    const worst = worstOn(measure, frames, frameTime);
    if (worst.value <= most) continue;
    const where = measure.where ? `, ${measure.where(worst.frame)}` : '';
    problems.push(`${measure.name} at ${measure.shown(worst.value)} at ${seconds(worst.at)}${where} `
      + `(at most ${measure.shown(most)})`);
  }
  return { problems, notes };
}

/** A frame's light as a line: its mean, its brightest sixteenth and its bright share. */
function lightLine(frame: FrameCells): string {
  const cell = Math.max(...frame.cellMeans);
  return `mean ${frame.mean.toFixed(0)}, brightest sixteenth ${cell.toFixed(0)}, bright ${percent(frame.brightShare)}`;
}

/** With a canary, the exposure for frame `frame` of the effect: raised on every other `STROBE_SPAN` frames. */
function strobed(frame: number, exposure: number): number {
  return Math.floor(frame / STROBE_SPAN) % 2 ? exposure * STROBE_GAIN : exposure;
}

/** `lab cast`, one biome and view: the skill cast, its frames measured; a problem for each check failed. */
export async function cast(lab: Lab, options: CastOptions): Promise<Report> {
  // (the props an earlier cast broke stand again: broken, they stay so until a run starts, and the next scenario in
  // the biome saw another scene)
  G.arena.restoreProps();
  await standIn(lab, { biome: options.biome, view: options.view, facing: options.facing, gear: options.gear });
  const hero = G.player;
  bindKnown(options.skill);
  const { key, def } = skillNamed(options.skill);
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const aim = hero.pos.clone().add(new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing))
    .multiplyScalar(AIM_AHEAD));
  if (options.foes) await foesAhead(lab, options.biome, options.foes);

  const frameTime = window.__labClock.frame / 1000;
  const holdFrames = Math.max(1, Math.round(holdFor(def) / frameTime));
  const lookFrames = Math.round(lookFor(def) / frameTime);
  const pictureFrames = new Map(options.times.map((time) => [Math.round(time / frameTime), time]));
  const compiledBefore = programsCompiledInGame();
  const lateBefore = lateCompiles.length;
  const exposure = G.renderer.toneMappingExposure;
  const drawing = lab.drawing;
  const frames: FrameCells[] = [];
  const moments: Pictured[] = [];
  let cast = false;
  lab.drawing = true;
  try {
    await lab.step(1, () => ({ aim }));
    const before = frameCells();
    for (let frame = 0; frame < lookFrames; frame++) {
      if (options.canary) G.renderer.toneMappingExposure = strobed(frame, exposure);
      await lab.step(1, () => pressing(key, aim, frame < holdFrames));
      frames.push(frameCells());
      cast ||= hero.cooldowns.has(def.impl) || Boolean(hero.casting) || Boolean(hero.channel);
      const time = pictureFrames.get(frame);
      if (options.pictures && time !== undefined) {
        const label = `${options.biome} ${options.view}, ${def.name}, ${seconds(time)} after the press`;
        moments.push(await lab.screen(label));
      }
    }
    return judged(def, options, { before, frames, frameTime, cast, moments, compiledBefore, lateBefore });
  } finally {
    G.renderer.toneMappingExposure = exposure;
    lab.drawing = drawing;
  }
}

/** the frame's mean is listed every this long through the cast (s) */
const TIMELINE_STEP = 0.1;

/** The frames' means (as stored, 0 to 255) every `TIMELINE_STEP` s from the press. */
function meanTimeline(frames: FrameCells[], frameTime: number): string {
  const step = Math.max(1, Math.round(TIMELINE_STEP / frameTime));
  const means: string[] = [];
  for (let f = 0; f < frames.length; f += step) means.push(frames[f].mean.toFixed(0));
  return `  its mean every ${TIMELINE_STEP} s: ${means.join(' ')}`;
}

/** the worst flashing cell's light is listed every this many frames through its worst second */
const TRACE_STEP = 3;

/** The worst flashing cell's light (a share of white) through its worst second, every `TRACE_STEP` frames. */
function flashTrace(frames: FrameCells[], flashing: FlashCount, frameTime: number): string {
  const from = Math.round(flashing.at / frameTime);
  const lights: string[] = [];
  for (let f = from; f < Math.min(frames.length, from + Math.round(1 / frameTime)); f += TRACE_STEP) {
    lights.push(frames[f].cellLights[flashing.cell].toFixed(2));
  }
  return `    its light through that second, every ${TRACE_STEP} frames: ${lights.join(' ')}`;
}

/** What a cast's frames came to. */
interface Seen {
  before: FrameCells;
  frames: FrameCells[];
  frameTime: number;
  cast: boolean;
  moments: Pictured[];
  compiledBefore: number;
  lateBefore: number;
}

/** The cast's frames as lines, and a problem for each check they failed (with a canary, for one it missed). */
function judged(def: SkillDef, options: CastOptions, seen: Seen): Report {
  const name = `${options.biome} ${options.view}: ${def.name}`;
  const flashing = worstFlashing(seen.frames.map((frame) => frame.cellLights), seen.frameTime);
  const compiled = programsCompiledInGame() - seen.compiledBefore;
  const lines = [
    `${name}: ${seen.frames.length} frames from the press${seen.cast ? '' : ', nothing cast'}`,
    `  before it: ${lightLine(seen.before)}`,
    worstLine(seen.frames, seen.frameTime),
    meanTimeline(seen.frames, seen.frameTime),
    `  flashes: ${flashing.most} in a second at the most`
      + (flashing.most ? ` (${cellName(flashing.cell)}, from ${seconds(flashing.at)})` : ''),
    ...(flashing.most ? [flashTrace(seen.frames, flashing, seen.frameTime)] : []),
    `  shaders compiled after loading: ${compiled}`,
  ];
  for (const late of lateCompiles.slice(seen.lateBefore)) lines.push(`    ${late}`);
  const budget = budgetJudged(seen.frames, seen.frameTime, seen.before);
  lines.push(...budget.notes);
  const found: string[] = [];
  if (!seen.cast) found.push('nothing was cast');
  found.push(...budget.problems);
  if (flashing.most >= FLASHES_MOST) found.push(`${flashing.most} flashes in a second (${cellName(flashing.cell)})`);
  if (compiled > 0) found.push(`${compiled} shaders compiled after loading`);
  const problems = found.map((problem) => `${name}: ${problem}`);
  if (!options.canary) return { text: lines.join('\n'), problems, moments: seen.moments };
  const caught = flashing.most >= FLASHES_MOST;
  lines.push(`  canary, a strobe of the exposure: ${caught ? 'caught' : 'missed'}`);
  const missed = caught ? [] : [`${name}: the canary's strobe went unseen`];
  return { text: lines.join('\n'), problems: missed, moments: seen.moments };
}
