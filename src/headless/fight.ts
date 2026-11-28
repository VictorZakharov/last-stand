// The fight with nothing drawn, as a server would run it (the dedicated server's first step): a battleground built as
// the game builds it, the heroes as partners' copies (`heroCopy.ts`), foes spawned and stepped as the host's game steps them, in Node.
// Built by `vite build --ssr` (server/fight/vite.config.ts), its drawing-side modules swapped for headless ones
// (`src/headless/swap/`). The fight's state is the game's own (`G` and its modules'), one fight to a thread: a server
// runs a room in a worker of its own.
import './page';
import * as THREE from 'three';
import { G } from '../state';
import { spawnEnemy } from '../entities/spawner';
import { updateEnemies } from '../entities/enemy';
import { updateProjectiles } from '../combat/projectiles';
import { updateBurns } from '../combat/burn';
import { separateEnemies } from '../world/collision';
import { updateEffects } from '../fx/effects';
import { updateTimers } from '../core/timers';
import { initRun, startRun, updateRun, vote, type RunUI } from '../game/run';
import { buildCrypt } from '../world/crypt';
import { buildForest } from '../world/forest';
import type { BiomeId } from '../data/biomes';
import type { EnemyId } from '../data/enemies';
import type { Arena } from '../world/arena';
import { HeroCopy } from './heroCopy';
import type { Profile } from '../types';
import type { Biome, BiomeBuilder } from '../world/props';
import { WALL_R } from '../world/props';

const BUILDERS: Record<BiomeId, BiomeBuilder> = { crypt: buildCrypt, forest: buildForest };

/** A camera nothing is in view of (far under the ground, looking down): no foe is posed for an eye. */
function unseeing(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1);
  camera.position.set(0, -1e4, 0);
  camera.lookAt(0, -2e4, 0);
  camera.updateMatrixWorld();
  return camera;
}

/** What the fight reads of the arena, for one battleground built alone (no village, no rooms, no hall). */
function fightArena(id: BiomeId, built: Biome): Arena {
  const arena: Partial<Arena> = {
    biome: id,
    place: id,
    room: null,
    hallShown: false,
    radius: WALL_R,
    obstacles: built.obstacles,
    wall: built.wall,
    portals: built.portals,
    // (how calm the battleground looks, and the canopy a boss closes: looks alone)
    setCalm: () => undefined,
    setShade: () => undefined,
  };
  return arena as Arena;
}

/** A profile no hero's: what the run counts into its player's records, kept by no one here (each hero's game keeps
 *  its own). */
function unowned(): Profile {
  const records = { bestWave: 0, bestBanked: {}, bestReached: {}, runs: 0, banked: 0, bestScore: 0, kills: 0, time: 0 };
  const profile: Partial<Profile> = { records, stash: [], equipped: {} };
  return profile as Profile;
}

/** Battleground `id` built as the game builds it, its run-shaped props rolled from `seed`, as the fight's arena, and
 *  a hero's copy for each of `heroes` (x, z); the ms its build took. */
export function openFight(id: BiomeId, seed: number, heroes: [number, number][]): number {
  const start = performance.now();
  G.scene = new THREE.Scene();
  G.camera = unseeing();
  const built = BUILDERS[id](new THREE.Group());
  built.wall.seal();
  built.roll?.(seed);
  G.arena = fightArena(id, built);
  G.players = heroes.map(([x, z], slot) => new HeroCopy(slot, x, z).asPlayer());
  // (the server has no hero of its own: a blow judged on a hero's own game is no one's here)
  G.player = Object.assign(new HeroCopy(-1, 0, 1e4), { active: false, alive: false, inRun: false }).asPlayer();
  G.profile = unowned();
  return performance.now() - start;
}

/** `count` foes of `type` spawned in a ring `radius` m round the middle, at wave `wave`'s strength. */
export function spawnFoes(type: EnemyId, count: number, radius = 12, wave = 44): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    spawnEnemy(type, new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius), { wave });
  }
}

/** What a run shows its player, shown to no one: the server's run is its guests' to show (`net/sync.ts`). */
const UNSHOWN: RunUI = {
  banner: () => undefined,
  showDecision: () => undefined,
  hideDecision: () => undefined,
  resetDecision: () => undefined,
  showSummary: () => undefined,
};
let runReady = false;

/** A run begun at `wave` on the fight opened, as the host's Start begins one: its countdown, then its waves. */
export function beginWaves(wave: number): void {
  if (!runReady) initRun(UNSHOWN);
  runReady = true;
  G.mode = 'run';
  startRun(wave);
}

/** Hero `slot`'s blow on every foe within `reach` m of him, `share` of each one's most life, dealt as the host deals
 *  a guest's hit (`onGuestHits` in net/sync.ts: the foe's own `takeDamage`, by him); how many it struck. */
export function strikeAround(slot: number, reach: number, share: number): number {
  const hero = G.players.find((p) => p.slot === slot);
  if (!hero) return 0;
  let struck = 0;
  for (const enemy of G.enemies) {
    if (!enemy.alive || enemy.invulnerable) continue;
    if (Math.hypot(enemy.pos.x - hero.pos.x, enemy.pos.z - hero.pos.z) > reach + enemy.radius) continue;
    enemy.takeDamage(enemy.maxLife * share, { type: 'physical', crit: false, by: hero });
    struck++;
  }
  return struck;
}

/** Every hero's Continue at the choice after a wave, as each guest's game sends it (`vote` in game/run.ts). */
export function continueAll(): void {
  if (G.run?.phase !== 'cleared') return;
  for (const hero of G.players) vote(hero);
}

/** One step of the fight, `dt` s, as the host's game steps it (`update` in main.ts, its fight's stages); the ms it
 *  took. */
export function stepFight(dt: number): number {
  const start = performance.now();
  G.time += dt;
  G.dt = dt;
  updateProjectiles(dt);
  updateBurns(dt);
  if (G.mode === 'run') updateRun(dt);
  updateEnemies(dt);
  separateEnemies(false);
  updateEffects(dt);
  updateTimers(dt);
  return performance.now() - start;
}

/** The fight's state, for a harness to read. */
export const fightState = (): typeof G => G;
