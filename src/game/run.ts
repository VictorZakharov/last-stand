// Run controller: waves, scoring, loot rolls and the per-wave
// "bank your loot or push on" decision. Dying forfeits the unbanked bag.
import * as THREE from 'three';
import { G } from '../state';
import { RUN } from '../data/balance';
import { WAVES, LOOT } from '../data/waves';
import { ENEMIES } from '../data/enemies';
import { BIOMES } from '../data/biomes';
import { spawnEnemy } from '../entities/spawner';
import { clearEnemies } from '../entities/enemy';
import { clearProjectiles } from '../combat/projectiles';
import { clearEffects } from '../fx/effects';
import { clearLights } from '../fx/lights';
import { particles } from '../fx/particles';
import { dropItem, vacuumDrops, clearDrops } from '../loot/drops';
import { rollDrop } from '../loot/items';
import { bankItems, saveProfile } from '../loot/profile';
import { clearFloaters } from '../ui/floaters';
import { sfx } from '../core/audio';
import { schedule, clearTimers } from '../core/timers';
import { on, emit } from '../events';
import { pick, rand, weighted } from '../util';
import type { EnemyId } from '../data/enemies';
import type { Enemy } from '../entities/enemy';
import type { Item } from '../types';

interface SpawnUnit { type: EnemyId; hero: boolean }

export type RunPhase = 'countdown' | 'fighting' | 'cleared' | 'dead' | 'banked';

export interface RunState {
  wave: number;
  phase: RunPhase;
  /** countdown seconds left (phase 'countdown') */
  timer: number;
  waveTime: number;
  /** unbanked spoils */
  bag: Item[];
  score: number;
  multiplier: number;
  multKills: number;
  multTimer: number;
  kills: number;
  queue: SpawnUnit[][];
  nextGroupT: number;
  pending: number;
  remaining: number;
}

export interface RunSummary { outcome: 'dead' | 'banked'; wave: number; score: number; kills: number; bag: Item[]; lost?: Item[]; replaced?: Item[] }

/** UI callbacks the run controller drives. */
export interface RunUI {
  banner(title: string, sub?: string): void;
  showDecision(): void;
  hideDecision(): void;
  showSummary(s: RunSummary): void;
}

let ui: RunUI;

export function initRun(uiHooks: RunUI): void {
  ui = uiHooks;
  on('enemyKilled', onEnemyKilled);
  on('playerDied', onPlayerDied);
}

function cleanupWorld(): void {
  clearEnemies();
  clearProjectiles();
  clearEffects();
  clearLights();
  clearDrops();
  clearFloaters();
  particles.clear();
  clearTimers();
}

/** Start a run at `wave` (the lobby allows any wave up to the best one beaten in the biome). */
export function startRun(wave = 1): void {
  cleanupWorld();
  G.player.recomputeStats(G.profile.equipped);
  G.player.reset();
  G.run = {
    wave, phase: 'countdown', timer: RUN.countdown, waveTime: 0,
    bag: [], score: 0, multiplier: 1, multKills: 0, multTimer: 0, kills: 0,
    queue: [], nextGroupT: 0, pending: 0, remaining: 0,
  };
  G.profile.records.runs++;
  saveProfile(G.profile);
  G.arena.setCalm(0);
  const biome = BIOMES[G.arena.biome];
  ui.banner(`Wave ${wave}`, wave % WAVES.bossEvery === 0 ? biome.bossBanner : `${biome.title} · Survive the onslaught`);
}

export function abandonRun(): void {
  if (!G.run) return;
  G.run = null;
  G.player.stopChannel();
  cleanupWorld();
}

function buildWave(w: number): SpawnUnit[][] {
  const biome = BIOMES[G.arena.biome];
  const pool = biome.pool(w);
  let budget = WAVES.budget(w);
  const units: SpawnUnit[] = [];
  if (w % WAVES.bossEvery === 0) { units.push({ type: biome.boss, hero: false }); budget *= 0.55; }
  while (budget > 0) {
    const type = weighted(pool);
    budget -= ENEMIES[type].cost;
    // heavies (slammers) become heroes more often
    units.push({ type, hero: Math.random() < WAVES.heroChance(w) * (ENEMIES[type].ai === 'slam' ? 0.5 : 0.25) });
  }
  // split into groups
  const groups = WAVES.groups(w);
  const out: SpawnUnit[][] = Array.from({ length: groups }, () => []);
  units.forEach((u, i) => out[ENEMIES[u.type].boss ? 0 : i % groups].push(u));
  return out.filter((g) => g.length);
}

function startWave(): void {
  const r = G.run!;
  r.phase = 'fighting';
  r.waveTime = 0;
  r.queue = buildWave(r.wave);
  r.nextGroupT = 0;
  sfx.waveStart();
  emit('waveStarted', r.wave);
}

function spawnGroup(group: SpawnUnit[]): void {
  const portals = G.arena.portals;
  const used = [pick(portals), pick(portals)];
  const r = G.run!;
  r.pending += group.length;
  group.forEach((u, i) => {
    const boss = !!ENEMIES[u.type].boss;
    const portal = boss ? portals[1] : used[i % 2];
    portal.pulse();
    const side = new THREE.Vector3(-portal.dir.z, 0, portal.dir.x);
    const pos = portal.pos.clone()
      .addScaledVector(portal.dir, rand(0.5, 3.5) + (boss ? 2 : 0))
      .addScaledVector(side, rand(-3, 3));
    schedule(i * 0.09, () => {
      r.pending--;
      if (G.run === r && r.phase === 'fighting') spawnEnemy(u.type, pos, { wave: r.wave, hero: u.hero });
    });
  });
}

export function updateRun(dt: number): void {
  const r = G.run;
  if (!r) return;
  // multiplier decays without kills
  if (r.multiplier > 1) {
    r.multTimer += dt;
    if (r.multTimer > RUN.multiplierDecay) { r.multiplier--; r.multTimer = 0; r.multKills = 0; }
  }

  if (r.phase === 'countdown') {
    r.timer -= dt;
    if (r.timer <= 0) startWave();
  } else if (r.phase === 'fighting') {
    r.waveTime += dt;
    const alive = G.enemies.filter((e) => e.alive).length;
    r.nextGroupT -= dt;
    if (r.queue.length && (r.nextGroupT <= 0 || alive === 0) && alive < WAVES.maxAlive(r.wave)) {
      spawnGroup(r.queue.shift()!);
      r.nextGroupT = WAVES.groupInterval;
    }
    r.remaining = alive + r.pending + r.queue.reduce((n, g) => n + g.length, 0);
    if (r.remaining === 0) waveCleared();
  }
}

function waveCleared(): void {
  const r = G.run!;
  r.phase = 'cleared';
  const rec = G.profile.records;
  rec.bestWave = Math.max(rec.bestWave, r.wave);
  rec.bestWaves[G.arena.biome] = Math.max(rec.bestWaves[G.arena.biome] ?? 0, r.wave);
  saveProfile(G.profile);
  // reward cache erupts from the center of the dais
  const n = LOOT.waveRewards(r.wave);
  const center = new THREE.Vector3(0, 1.2, 0);
  for (let i = 0; i < n; i++) schedule(0.25 + i * 0.16, () => { if (G.run === r) dropItem(rollDrop(r.wave, LOOT.waveRewardBonus(r.wave)), center); });
  G.arena.setCalm(1);
  sfx.waveClear();
  ui.banner(`Wave ${r.wave} Cleared`, 'Bank your spoils, or press on');
  ui.showDecision();
  emit('waveCleared', r.wave);
}

export function continueRun(): void {
  const r = G.run;
  if (!r || r.phase !== 'cleared') return;
  vacuumDrops();
  const p = G.player;
  p.heal(p.stats.maxLife * RUN.healOnContinue);
  p.energy = Math.min(p.stats.maxEnergy, p.energy + p.stats.maxEnergy * RUN.energyOnContinue);
  r.wave++;
  r.phase = 'countdown';
  r.timer = RUN.countdown;
  G.arena.setCalm(0);
  ui.hideDecision();
  const boss = r.wave % WAVES.bossEvery === 0;
  ui.banner(`Wave ${r.wave}`, boss ? BIOMES[G.arena.biome].bossBanner : 'Hold the line');
}

export function bankRun(): void {
  const r = G.run;
  if (!r || r.phase !== 'cleared') return;
  vacuumDrops();
  finishRun('banked', bankItems(G.profile, r.bag));
}

function onPlayerDied(): void {
  const r = G.run;
  if (!r || r.phase === 'dead') return;
  r.phase = 'dead';
  ui.hideDecision();
  schedule(2.6, () => { if (G.run === r) finishRun('dead'); });
}

function finishRun(outcome: 'dead' | 'banked', extra: { lost?: Item[]; replaced?: Item[] } = {}): void {
  const r = G.run!;
  const rec = G.profile.records;
  rec.bestScore = Math.max(rec.bestScore, Math.round(r.score));
  saveProfile(G.profile);
  r.phase = outcome;
  ui.hideDecision();
  ui.showSummary({ outcome, wave: r.wave, score: Math.round(r.score), kills: r.kills, bag: r.bag.slice(), ...extra });
}

function onEnemyKilled(e: Enemy): void {
  const r = G.run;
  if (!r) return;
  r.kills++;
  r.score += e.score * RUN.scorePerKill * r.multiplier;
  r.multTimer = 0;
  if (++r.multKills >= RUN.killsPerMultiplier && r.multiplier < RUN.multiplierMax) { r.multiplier++; r.multKills = 0; }
  const from = new THREE.Vector3(e.pos.x, 1, e.pos.z);
  if (e.boss) for (let i = 0; i < LOOT.bossDrops; i++) dropItem(rollDrop(r.wave + 1, 0.8), from);
  else if (e.hero ? Math.random() < LOOT.heroDropChance : Math.random() < LOOT.killDropChance) dropItem(rollDrop(r.wave, e.hero ? 0.4 : 0), from);
}
