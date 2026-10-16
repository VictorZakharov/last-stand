// `lab compiles`: whether the boot's warm-up compiled what a fight draws (tools/lab). The game compiles every program
// at boot (`game/warmup.ts`, `core/shaders.ts`), and one compiled mid-fight is a hitch of 10 to 30 ms, longer on a
// phone. In each biome the hero stands in the view asked for, and a prop of every kind the biome has (stone, wood,
// glowcap, embers) is broken in turn, its rubble, debris and smoke drawn as they fly and settle. Every program compiled
// meanwhile is a problem, said as the game's performance report says it (`lateCompiles`: what drew it and how its
// program differs from the nearest one compiled before). (#243's phone compiled a rubble program mid-fight: the empty
// pools were hidden after the first of the boot's warm-ups, so the lobby's warm-up in each biome, whose light makes
// programs of its own, drew none of them.) `--canary` draws a material of a kind nothing else is before the hero,
// which must come out as compiled.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { ViewMode } from '../../../src/core/renderer';
import type { Prop } from '../../../src/world/destructible';
import { G } from '../../../src/state';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { breakProp, hurtProp } from '../../../src/world/destructible';
import type { Enemy } from '../../../src/entities/enemy';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { holdFor, pressing, type BoundSkill } from './cast';
import { standIn } from './light';
import { setOffWave } from './spawnWaves';
import { lookOf, placeOf } from './draws';

export interface CompilesOptions {
  biomes: BiomeId[];
  view: ViewMode;
  canary: boolean;
}

/** the frames drawn after a prop is worn down (its gauge over it), and after it breaks (the rubble flying, landing
 *  and lying) */
const HURT_FRAMES = 20;
const BREAK_FRAMES = 40;
/** the frames the canary's material is drawn for */
const CANARY_FRAMES = 2;
/** the first wave's random numbers, and the most of it fought (s) */
const WAVE_SEED = 1;
const WAVE_MOST = 40;

/** Each draw's pass, as the lines say it. */
function passOf(scene: THREE.Object3D | null): string {
  if (scene === null) return 'the shadow map';
  return scene === G.scene ? 'the scene' : 'a pass after it';
}

/**
 * Watches the renderer's draws from now on for the first draw of each program not compiled before (the game's
 * report can't say what drew a shadow's program: three keeps its shadow materials to itself); returns what stops it,
 * which gives the draws found: what drew each, with its own material, and in which pass.
 */
function watchFirstDraws(): () => string[] {
  const gl = G.renderer;
  const own = gl.renderBufferDirect.bind(gl);
  const known = new Set<unknown>(gl.info.programs ?? []);
  const firsts: string[] = [];
  gl.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    own(camera, scene, geometry, material, object, group);
    const program = (gl.properties.get(material) as { currentProgram?: unknown }).currentProgram;
    if (!program || known.has(program)) return;
    known.add(program);
    const drawn = (object as THREE.Mesh).material;
    const its = Array.isArray(drawn) ? drawn[0] : drawn;
    const ownLook = its && its !== material ? `, its own ${lookOf(its)}` : '';
    firsts.push(`first drawn by ${object.type} in ${placeOf(object)} (${lookOf(material)}${ownLook}) in `
      + `${passOf(scene)}`);
  };
  return () => {
    gl.renderBufferDirect = own;
    return firsts;
  };
}

/** The programs compiled from now on: how many, each as the game's report says it, and the draws that first used
 *  them. */
function compilesFromNow(): () => { count: number; lines: string[] } {
  const compiled = programsCompiledInGame();
  const described = lateCompiles.length;
  const stopWatching = watchFirstDraws();
  return () => {
    const firsts = stopWatching();
    return { count: programsCompiledInGame() - compiled, lines: [...lateCompiles.slice(described), ...firsts] };
  };
}

/** The biome's props of each kind it has, the nearest to the hero first. */
function nearestOfEachKind(): Prop[] {
  const at = G.player.pos;
  const away = (prop: Prop) => Math.min(...prop.parts.map((part) => Math.hypot(part.x - at.x, part.z - at.z)));
  const byKind = new Map<string, Prop>();
  for (const prop of [...G.arena.props].sort((a, b) => away(a) - away(b))) {
    if (!prop.broken && !byKind.has(prop.kind)) byKind.set(prop.kind, prop);
  }
  return [...byKind.values()];
}

/** In `biome`, a prop of every kind broken in turn, each one's frames drawn; its lines and problems. */
async function breakEachKind(lab: Lab, biome: BiomeId, view: ViewMode): Promise<Report> {
  G.arena.restoreProps();
  await standIn(lab, { biome, view, facing: 0 });
  const props = nearestOfEachKind();
  const since = compilesFromNow();
  for (const prop of props) {
    // (worn down first, as a fight wears it: its gauge shown over it and chips knocked off, then broken)
    hurtProp(prop.parts[0], prop.life / 2);
    await lab.step(HURT_FRAMES);
    breakProp(prop);
    await lab.step(BREAK_FRAMES);
  }
  const { count, lines } = since();
  G.arena.restoreProps();
  const kinds = props.map((prop) => prop.kind).join(', ');
  const text = [`${biome}, the ${view} view: a prop of each kind broken (${kinds}), ${count} programs compiled`,
    ...lines.map((line) => `  ${line}`)];
  const problems = count > 0 ? [`${biome}: ${count} programs compiled as its props broke`] : [];
  if (!props.length) problems.push(`${biome}: no prop to break`);
  return { text: text.join('\n'), problems };
}

/** The live foe nearest the hero, if any. */
function nearestFoe(): Enemy | undefined {
  const at = G.player.pos;
  const live = G.enemies.filter((foe) => foe.alive && foe.spawning <= 0);
  return live.sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at))[0];
}

/** The hero's skills on his bar, in its order. */
function barSkills(): BoundSkill[] {
  return SKILL_KEYS.flatMap((key) => {
    const def = G.player.skillAt(key)?.def;
    return def ? [{ key, def }] : [];
  });
}

/**
 * In `biome`, the run's first wave set off and fought as the game plays it: its foes coming by the gates, the hero
 * (kept whole) casting each skill on his bar in turn at the nearest one, his energy kept full, until the wave is
 * cleared or `WAVE_MOST` s are up. Its foes die as a fight kills them, which no other check lets happen.
 */
async function fightFirstWave(lab: Lab, biome: BiomeId, view: ViewMode): Promise<Report> {
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  G.arena.restoreProps();
  await setOffWave(lab, { view }, { index: 0, seed: WAVE_SEED, number: 1 });
  const since = compilesFromNow();
  const hero = G.player;
  const skills = barSkills();
  const frameTime = window.__labClock.frame / 1000;
  const spawned = new Set<Enemy>();
  let turn = 0;
  let held = 0;
  let frames = 0;
  for (; frames < WAVE_MOST / frameTime && G.run?.phase !== 'cleared'; frames++) {
    for (const foe of G.enemies) spawned.add(foe);
    const foe = nearestFoe();
    hero.energy = hero.stats.maxEnergy;
    const skill = skills[turn % skills.length];
    if (!foe || !skill) {
      await lab.step(1);
      continue;
    }
    if (held === 0 && hero.cooldowns.has(skill.def.impl)) {
      turn++;
      await lab.step(1, () => ({ aim: foe.pos }));
      continue;
    }
    const hold = Math.max(1, Math.round(holdFor(skill.def) / frameTime));
    await lab.step(1, () => pressing(skill.key, foe.pos, held < hold));
    held++;
    if (held > hold) {
      held = 0;
      turn++;
    }
  }
  const { count, lines } = since();
  const killed = [...spawned].filter((foe) => !foe.alive).length;
  const end = G.run?.phase === 'cleared' ? 'cleared' : `not cleared, ${WAVE_MOST} s up`;
  const text = [`${biome}, the ${view} view: the first wave fought for ${(frames * frameTime).toFixed(1)} s (${end}), `
    + `${spawned.size} foes came, ${killed} killed, ${count} programs compiled`, ...lines.map((line) => `  ${line}`)];
  const problems = count > 0 ? [`${biome}: ${count} programs compiled as its first wave was fought`] : [];
  if (!killed) problems.push(`${biome}: the first wave's foes were never killed`);
  return { text: text.join('\n'), problems };
}

/** The canary: a box of a material nothing else draws (sheen and iridescence) before the hero, a problem unless its
 *  program comes out as compiled. */
async function canaryRound(lab: Lab): Promise<Report> {
  const material = new THREE.MeshPhysicalMaterial({ sheen: 1, iridescence: 1, color: 0xff00ff });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  const way = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  box.position.copy(G.player.pos).addScaledVector(way, 2).setY(0.5);
  G.scene.add(box);
  const since = compilesFromNow();
  try {
    await lab.step(CANARY_FRAMES);
  } finally {
    G.scene.remove(box);
    box.geometry.dispose();
    material.dispose();
  }
  const { count } = since();
  const text = `the canary: a material of its own drawn, ${count} programs compiled`;
  return { text, problems: count > 0 ? [] : ['the canary\'s material of its own came out as compiling nothing'] };
}

export async function compiles(lab: Lab, options: CompilesOptions): Promise<Report> {
  const drawing = lab.drawing;
  // (drawn: a program compiles as it's first drawn)
  lab.drawing = true;
  const reports: Report[] = [];
  try {
    for (const biome of options.biomes) {
      reports.push(await breakEachKind(lab, biome, options.view));
      reports.push(await fightFirstWave(lab, biome, options.view));
    }
    if (options.canary) reports.push(await canaryRound(lab));
  } finally {
    lab.drawing = drawing;
  }
  return {
    text: reports.map((report) => report.text).join('\n'),
    problems: reports.flatMap((report) => report.problems),
  };
}
