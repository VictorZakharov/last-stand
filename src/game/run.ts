// Run controller: waves, scoring, loot rolls and the per-wave
// "bank your loot or push on" decision. Dying forfeits the unbanked bag.
// Co-op: the host's game runs all of this for the party and the guests follow its reports
// (net/sync). Each player keeps a bag of their own. After a wave everyone decides: Bank leaves
// the run at once, and the next wave starts once all who stay chose Continue. A player at 0
// health goes down until a teammate raises them (or they bleed out); with nobody left standing
// the run is lost for everyone still in it.
import * as THREE from 'three';
import { G } from '../state';
import { RUN, COOP } from '../data/balance';
import { WAVES, LOOT } from '../data/waves';
import { ENEMIES } from '../data/enemies';
import { BIOMES } from '../data/biomes';
import { spawnEnemy } from '../entities/spawner';
import { clearEnemies } from '../entities/enemy';
import { clearProjectiles } from '../combat/projectiles';
import { clearEffects } from '../fx/effects';
import { clearLights } from '../fx/lights';
import { particles, col } from '../fx/particles';

import { rollDrop, rarityOf, rarityIndex } from '../loot/items';
import { bankItems, saveProfile } from '../loot/profile';
import { clearFloaters, floatText } from '../ui/floaters';
import { sfx } from '../core/audio';
import { schedule, clearTimers } from '../core/timers';
import { on, emit } from '../events';
import { isCoop, isGuest } from '../net/role';
import { pick, rand, weighted } from '../util';
import type { EnemyId } from '../data/enemies';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { Item } from '../types';

interface SpawnUnit { type: EnemyId; hero: boolean }

/** The party's run: counting down to a wave, fighting it, deciding after it, or over for everyone. */
export type RunPhase = 'countdown' | 'fighting' | 'cleared' | 'over';

export interface RunState {
  wave: number;
  phase: RunPhase;
  /** countdown seconds left (phase 'countdown') */
  timer: number;
  waveTime: number;
  /** the local player's unbanked spoils */
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
  /** players in the run as the wave started (it sizes the wave), and who chose Continue after it */
  party: number;
  votes: Set<number>;
  /** the local player's summary has been shown (the lobby waits for it to be closed) */
  summarized: boolean;
  /** game time at the start, and whether the run's time and kills went into the records yet */
  started: number;
  tallied: boolean;
}

export interface RunSummary { outcome: 'dead' | 'banked'; wave: number; score: number; kills: number; bag: Item[]; lost?: Item[]; replaced?: Item[]; note?: string }

/** UI callbacks the run controller drives. */
export interface RunUI {
  banner(title: string, sub?: string): void;
  showDecision(): void;
  hideDecision(): void;
  showSummary(s: RunSummary): void;
}

/** What the host reports to co-op guests as the run goes (set by net/sync; no-ops solo). */
export const runHooks = {
  banner(_title: string, _sub: string): void {},
  cleared(): void {},
  nextWave(): void {},
  loot(_p: Player, _item: Item): void {},
  out(_p: Player, _kind: 'banked' | 'dead'): void {},
  down(_p: Player): void {},
  raised(_p: Player): void {},
  over(): void {},
};

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
  clearFloaters();
  particles.clear();
  clearTimers();
}

/** Start a run at `wave` (the lobby allows any wave up to the best one banked in the biome).
 *  A co-op guest starts its side of the host's run the same way, and then follows it. */
export function startRun(wave = 1): void {
  cleanupWorld();
  for (const p of G.players) {
    if (p.local) p.recomputeStats(G.profile.equipped);
    p.reset();
  }
  G.run = {
    wave, phase: 'countdown', timer: RUN.countdown, waveTime: 0,
    bag: [], score: 0, multiplier: 1, multKills: 0, multTimer: 0, kills: 0,
    queue: [], nextGroupT: 0, pending: 0, remaining: 0, party: 1, votes: new Set(), summarized: false,
    started: G.time, tallied: false,
  };
  G.profile.records.runs++;
  saveProfile(G.profile);
  G.arena.setCalm(0);
  const biome = BIOMES[G.arena.biome];
  ui.banner(`Wave ${wave}`, wave % WAVES.bossEvery === 0 ? biome.bossBanner : `${biome.title} · Survive the onslaught`);
}

export function abandonRun(): void {
  const r = G.run;
  if (!r) return;
  // abandoned from the pause menu: its time and kills still count
  if (!r.tallied) { tally(r); saveProfile(G.profile); }
  G.run = null;
  for (const p of G.players) p.stopChannel();
  cleanupWorld();
}

/** The run's time and kills go into the records, once, however it ends for the local player. */
function tally(r: RunState): void {
  r.tallied = true;
  const rec = G.profile.records;
  rec.kills = (rec.kills ?? 0) + r.kills;
  rec.time = Math.round((rec.time ?? 0) + G.time - r.started);
}

/** The players still in the run (standing or downed). */
const inRun = (): Player[] => G.players.filter((p) => p.inRun);

function buildWave(w: number): SpawnUnit[][] {
  const r = G.run!;
  const biome = BIOMES[G.arena.biome];
  const pool = biome.pool(w);
  // a party meets more foes
  let budget = WAVES.budget(w) * (1 + COOP.budgetPerPlayer * (r.party - 1));
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
  r.party = Math.max(1, inRun().length);
  r.queue = buildWave(r.wave);
  r.nextGroupT = 0;
  sfx.waveStart();
  emit('waveStarted', r.wave);
}

function spawnGroup(group: SpawnUnit[]): void {
  const portals = G.arena.portals;
  const used = [pick(portals), pick(portals)];
  const r = G.run!;
  const lifeMult = 1 + COOP.lifePerPlayer * (r.party - 1);
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
      if (G.run === r && r.phase === 'fighting') spawnEnemy(u.type, pos, { wave: r.wave, hero: u.hero, lifeMult });
    });
  });
}

/** The host's (or solo) run: a guest's follows the host's reports instead. */
export function updateRun(dt: number): void {
  const r = G.run;
  if (!r || isGuest()) return;
  // multiplier decays without kills
  if (r.multiplier > 1) {
    r.multTimer += dt;
    if (r.multTimer > RUN.multiplierDecay) { r.multiplier--; r.multTimer = 0; r.multKills = 0; }
  }
  if (r.phase !== 'over') updateDowned(dt);

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
  } else if (r.phase === 'cleared') {
    // on to the next wave once everyone still standing chose to (a partner leaving counts too)
    const staying = G.players.filter((q) => q.active);
    if (staying.length && staying.every((q) => r.votes.has(q.slot))) nextWave();
  }
}

/** Downed players bleed out, unless a teammate stands by them holding the revive key. */
function updateDowned(dt: number): void {
  for (const p of G.players) {
    if (!p.downed || !p.inRun) continue;
    if (p.bleed <= 0) { playerOut(p, 'dead'); continue; }
    const helper = G.players.some((q) => q.active && q.reviving && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < COOP.reviveRange);
    p.revive = helper ? p.revive + dt / COOP.reviveTime : Math.max(0, p.revive - dt / COOP.reviveTime);
    if (p.revive >= 1) {
      p.raise();
      floatText(p.pos.x, 2.6, p.pos.z, 'Revived', 'info', '#ffe6a0');
      runHooks.raised(p);
    }
  }
}

function waveCleared(): void {
  const r = G.run!;
  r.phase = 'cleared';
  r.votes.clear();
  // down as the wave ends: no one comes back for you
  for (const p of G.players) if (p.downed && p.inRun) playerOut(p, 'dead');
  // the wave's reward, counted in one by one, for everyone still standing
  const n = LOOT.waveRewards(r.wave);
  for (const p of G.players) {
    if (!p.active) continue;
    for (let i = 0; i < n; i++) schedule(0.25 + i * 0.16, () => { if (G.run === r && p.active) giveLoot(p, rollDrop(p.cls, r.wave, LOOT.waveRewardBonus(r.wave))); });
  }
  G.arena.setCalm(1);
  runHooks.cleared();
  showCleared();
  emit('waveCleared', r.wave);
}

/** The wave's end here: the records, and the choice for a player still in. */
export function showCleared(): void {
  const r = G.run!;
  const rec = G.profile.records;
  if (G.player.active) rec.bestWave = Math.max(rec.bestWave, r.wave);
  saveProfile(G.profile);
  sfx.waveClear();
  ui.banner(`Wave ${r.wave} Cleared`, G.player.active ? 'Bank your spoils, or press on' : '');
  if (G.player.active) ui.showDecision();
}

/** The local player chose Continue: the next wave starts once everyone still in has. */
export function continueRun(): void {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active || r.votes.has(G.player.slot)) return;
  vote(G.player);
}

/** A player's Continue (the host counts them all). */
export function vote(p: Player): void {
  G.run!.votes.add(p.slot);
  if (G.player.active) ui.showDecision();   // shows who is still deciding
}

function nextWave(): void {
  const r = G.run!;
  for (const p of G.players) {
    if (!p.active) continue;
    p.heal(p.stats.maxLife * RUN.healOnContinue);
  }
  r.wave++;
  r.phase = 'countdown';
  r.timer = RUN.countdown;
  runHooks.nextWave();
  startNextWave();
}

/** The next wave's countdown here (a guest's on the host's word). */
export function startNextWave(): void {
  const r = G.run!;
  const p = G.player;
  if (p.active) p.energy = Math.min(p.stats.maxEnergy, p.energy + p.stats.maxEnergy * RUN.energyOnContinue);
  r.votes.clear();
  G.arena.setCalm(0);
  ui.hideDecision();
  const boss = r.wave % WAVES.bossEvery === 0;
  ui.banner(`Wave ${r.wave}`, boss ? BIOMES[G.arena.biome].bossBanner : 'Hold the line');
}

/** The local player banks: out of the run with the spoils (the others may carry on). */
export function bankRun(): void {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active) return;
  playerOut(G.player, 'banked');
}

function onPlayerDied(p: Player): void {
  const r = G.run;
  if (!r || isGuest() || r.phase === 'over') return;
  // with a teammate still standing, a fall is a chance to be raised
  if (isCoop() && G.players.some((q) => q !== p && q.active)) {
    p.goDown();
    runHooks.down(p);
    return;
  }
  // nobody left standing: the run is lost for everyone still in it
  for (const q of G.players) if (q.inRun) playerOut(q, 'dead');
}

/**
 * A player leaves the run for good: banked with their spoils, or dead and without them. The run is
 * over once nobody is left in it; until then those out watch the rest.
 */
export function playerOut(p: Player, kind: 'banked' | 'dead'): void {
  const r = G.run;
  if (!r || p.out) return;
  if (p.downed) p.bleedOut();
  p.out = kind;
  p.stopChannel();
  if (kind === 'banked') bankedAway(p);
  if (p.local) finishLocal(kind);
  runHooks.out(p, kind);
  if (!isGuest() && !inRun().length) endRun();
}


/** A banked player steps out of the arena in a shimmer. */
export function bankedAway(p: Player): void {
  for (let i = 0; i < 30; i++) {
    particles.glow.spawn({
      x: p.pos.x + rand(-0.5, 0.5), y: rand(0, 1.8), z: p.pos.z + rand(-0.5, 0.5), vy: rand(1, 3),
      life: rand(0.5, 0.9), size: rand(0.08, 0.2), sizeEnd: 0, color: col(0xffe0a0, 2.5), colorEnd: col(0xff9a40, 0.4),
    });
  }
  p.show(false);
}

/** Nobody left in the run. */
export function endRun(): void {
  const r = G.run;
  if (!r || r.phase === 'over') return;
  r.phase = 'over';
  ui.hideDecision();
  runHooks.over();
}

/** The local player's run ends: the records, the bank (or the loss) and the summary. */
function finishLocal(kind: 'banked' | 'dead', note?: string): void {
  const r = G.run!;
  const rec = G.profile.records;
  ui.hideDecision();
  let extra: { lost?: Item[]; replaced?: Item[] } = {};
  if (kind === 'banked') {
    // banking unlocks this wave as a start; dying does not
    const best = rec.bestBanked;
    best[G.arena.biome] = Math.max(best[G.arena.biome] ?? 0, r.wave);
    extra = bankItems(G.profile, r.bag);
  }
  rec.bestScore = Math.max(rec.bestScore, Math.round(r.score));
  if (!r.tallied) tally(r);
  saveProfile(G.profile);
  const show = () => { r.summarized = true; ui.showSummary({ outcome: kind, wave: r.wave, score: Math.round(r.score), kills: r.kills, bag: r.bag.slice(), ...extra, note }); };

  // the fall plays out before the summary
  if (kind === 'dead') schedule(2.6, () => { if (G.run === r) show(); });
  else show();
}

/** Co-op guest: the host left mid-run. What was found is kept, as if banked. */
export function hostLeft(): void {
  const r = G.run;
  if (!r) return;
  r.phase = 'over';
  if (!G.player.out) {
    G.player.out = 'banked';
    finishLocal('banked', 'The host left the game: your spoils are safe.');
  }
}


/** Co-op guest: the host says the local player is out (bled out, or the party fell). */
export function localOut(kind: 'banked' | 'dead'): void {
  if (!G.run || G.player.out) return;
  if (G.player.downed) G.player.bleedOut();
  G.player.out = kind;
  G.player.stopChannel();
  finishLocal(kind);
}

function onEnemyKilled(e: Enemy): void {
  const r = G.run;
  if (!r || isGuest()) return;
  r.kills++;
  r.score += e.score * RUN.scorePerKill * r.multiplier;
  r.multTimer = 0;
  if (++r.multKills >= RUN.killsPerMultiplier && r.multiplier < RUN.multiplierMax) { r.multiplier++; r.multKills = 0; }
  // a boss pays everyone standing; any other kill pays whoever landed it
  if (e.boss) {
    for (const p of G.players) {
      if (!p.active) continue;
      for (let i = 0; i < LOOT.bossDrops; i++) schedule(i * 0.25, () => { if (G.run === r && p.active) giveLoot(p, rollDrop(p.cls, r.wave + 1, 0.8)); });
    }
    return;
  }
  const p = e.killer?.active ? e.killer : G.players.find((q) => q.active);
  if (!p) return;
  if (e.hero ? Math.random() < LOOT.heroDropChance : Math.random() < LOOT.killDropChance) giveLoot(p, rollDrop(p.cls, r.wave, e.hero ? 0.4 : 0));
}

/** Loot for a player: into our bag, or sent to a partner's game for theirs. */
function giveLoot(p: Player, item: Item): void {
  if (p.local) gainLoot(item);
  else runHooks.loot(p, item);
}

/**
 * Loot goes straight into the run's bag, with nothing on the floor. Only its rarity shows (a
 * "+1 Epic" over the player and the HUD's counts) until the run is banked.
 */
export function gainLoot(item: Item): void {
  const r = G.run;
  if (!r || G.player.out) return;
  r.bag.push(item);
  const info = rarityOf(item.rarity), p = G.player.pos;
  floatText(p.x, 2.7, p.z, `+1 ${info.name}`, 'info', info.color);
  sfx.loot(rarityIndex(item.rarity));
  emit('lootGained', item);
}
