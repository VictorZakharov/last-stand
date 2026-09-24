// The fight in co-op: the host's game simulates it and reports it; the guests show it.
// Every frame the host sends what happened (spawns, deaths, attack effects, hits on players,
// loot, the run's turns) and, at the send rate, a snapshot of where everything stands (enemies,
// players' health, the run). A guest's enemies are copies that glide to the host's positions and
// play the host's actions; its own character stays its own to move and cast.
import * as THREE from 'three';
import { G } from '../state';
import { setSpawnSink, spawnEnemy } from '../entities/spawner';
import { setFxSink, FX, type FxName } from '../entities/enemyAI';
import { setNumberSink, damageNumber } from '../combat/damage';
import { setHitSink, type HitResult } from '../entities/player';
import { runHooks, vote, playerOut, showCleared, startNextWave, gainLoot, localOut, endRun, bankedAway, type RunPhase } from '../game/run';
import { on, emit } from '../events';
import { sfx } from '../core/audio';

import { newItemId } from '../loot/items';
import { role } from './role';
import type { Player } from '../entities/player';
import type { EnemyId } from '../data/enemies';
import type { DamageType, Item } from '../types';

type WorldEvent =
  | { k: 'spawn'; id: number; ty: EnemyId; h: 0 | 1; n: string; x: number; z: number; ml: number; w: number }
  | { k: 'die'; id: number }
  | { k: 'fx'; n: FxName; a: number[] }
  | { k: 'num'; s: number; id: number; v: number; c: 0 | 1; ty: DamageType }
  | { k: 'hit'; s: number; r: HitResult }
  | { k: 'clear' }
  | { k: 'next'; w: number }
  | { k: 'loot'; s: number; item: Item }
  | { k: 'out'; s: number; o: 'banked' | 'dead' }
  | { k: 'down'; s: number }
  | { k: 'raise'; s: number }
  | { k: 'over' };

/** run: [wave, phase, timer, waveTime, score, multiplier, kills, remaining]; votes: slots that chose
 *  Continue; players: [slot, life, bleed, revive]; enemies: [id, x, z, facing, life, action, t, dur, flags] */
interface Snapshot { r: number[]; v: number[]; p: number[][]; e: (number | string)[][] }

const PHASES: RunPhase[] = ['countdown', 'fighting', 'cleared', 'over'];
const r2 = (v: number): number => Math.round(v * 100) / 100;
const bySlot = (s: number): Player | undefined => G.players.find((p) => p.slot === s);

let events: WorldEvent[] = [];
/** only the host reports, and only the fight */
const push = (ev: WorldEvent): void => { if (role.current === 'host' && G.mode === 'run') events.push(ev); };

/** Hook the fight's reporting in (it only sends anything on a co-op host in a run). */
export function initSync(): void {
  setSpawnSink((e) => push({ k: 'spawn', id: e.id, ty: e.type, h: e.hero ? 1 : 0, n: e.name, x: r2(e.pos.x), z: r2(e.pos.z), ml: Math.round(e.maxLife), w: G.run?.wave ?? 1 }));
  setFxSink((n, a) => push({ k: 'fx', n, a: a.map(r2) }));
  setNumberSink((by, e, v, c, ty) => push({ k: 'num', s: by.slot, id: e.id, v: Math.round(v), c: c ? 1 : 0, ty }));
  setHitSink((p, r) => push({ k: 'hit', s: p.slot, r: { taken: r2(r.taken), blocked: r2(r.blocked), broke: r.broke, absorbed: r2(r.absorbed) } }));
  on('enemyKilled', (e) => push({ k: 'die', id: e.id }));
  runHooks.cleared = () => push({ k: 'clear' });
  runHooks.nextWave = () => push({ k: 'next', w: G.run!.wave });
  runHooks.loot = (p, item) => push({ k: 'loot', s: p.slot, item });
  runHooks.out = (p, o) => push({ k: 'out', s: p.slot, o });
  runHooks.down = (p) => push({ k: 'down', s: p.slot });
  runHooks.raised = (p) => push({ k: 'raise', s: p.slot });
  runHooks.over = () => push({ k: 'over' });
}

export function hostSync(): void { events = []; }
export function stopSync(): void { events = []; }

/** Host, every frame: the events since the last frame, and the snapshot when one is due. */
export function sendWorld(send: (m: { x?: WorldEvent[]; s?: Snapshot }) => void, snapshot: boolean): void {
  if (!events.length && !snapshot) return;
  const m: { x?: WorldEvent[]; s?: Snapshot } = {};
  if (events.length) { m.x = events; events = []; }
  if (snapshot && G.run) m.s = snap();
  send(m);
}

function snap(): Snapshot {
  const r = G.run!;
  return {
    r: [r.wave, PHASES.indexOf(r.phase), r2(r.timer), r2(r.waveTime), Math.round(r.score), r.multiplier, r.kills, r.remaining],
    v: [...r.votes],
    p: G.players.filter((p) => !p.away).map((p) => [p.slot, r2(p.life), r2(p.bleed), r2(p.revive)]),
    e: G.enemies.filter((e) => e.deadT < 0).map((e) => [
      e.id, r2(e.pos.x), r2(e.pos.z), r2(e.facing), Math.round(e.life),
      e.action?.name ?? '', r2(e.action?.t ?? 0), r2(e.action?.dur ?? 0), (e.frozen > 0 ? 1 : 0) | (e.chill > 0 ? 2 : 0),
    ]),
  };
}

// --- guest ------------------------------------------------------------------------------------
/** Guest: the host's report of the fight. */
export function onWorld(m: { x?: WorldEvent[]; s?: Snapshot }): void {
  if (role.current !== 'guest' || G.mode !== 'run' || !G.run) return;
  if (m.x) for (const ev of m.x) apply(ev);
  if (m.s) applySnapshot(m.s);
}

function apply(ev: WorldEvent): void {
  switch (ev.k) {
    case 'spawn': {
      if (G.enemies.some((e) => e.id === ev.id)) return;
      const e = spawnEnemy(ev.ty, new THREE.Vector3(ev.x, 0, ev.z), { id: ev.id, name: ev.n, maxLife: ev.ml, hero: !!ev.h, wave: ev.w });
      e.net = { x: ev.x, z: ev.z, f: e.facing, at: performance.now() };
      return;
    }
    case 'die': { const e = G.enemies.find((x) => x.id === ev.id); if (e?.alive) e.die(); return; }
    case 'fx': (FX[ev.n] as (...a: number[]) => void)(...ev.a); return;
    case 'num': {
      const e = G.enemies.find((x) => x.id === ev.id);
      if (e && ev.s === G.player.slot) damageNumber(e, ev.v, !!ev.c, ev.ty);
      return;
    }
    case 'hit': bySlot(ev.s)?.applyHit(ev.r); return;
    case 'clear': G.run!.phase = 'cleared'; G.run!.votes.clear(); G.arena.setCalm(1); showCleared(); return;
    case 'next': G.run!.wave = ev.w; G.run!.phase = 'countdown'; startNextWave(); return;
    case 'loot': if (ev.s === G.player.slot) gainLoot({ ...ev.item, id: newItemId() }); return;
    case 'out': {
      const p = bySlot(ev.s);
      if (!p) return;
      if (p.local) { if (ev.o === 'dead' && p.alive) p.die(); localOut(ev.o); return; }
      if (p.out) return;
      if (ev.o === 'dead') { if (p.alive) p.die(); p.bleedOut(); }
      p.out = ev.o;
      if (ev.o === 'banked') bankedAway(p);
      return;
    }
    case 'down': { const p = bySlot(ev.s); if (p) { if (p.alive) p.die(); p.goDown(); } return; }
    case 'raise': bySlot(ev.s)?.raise(); return;
    case 'over': endRun(); return;
  }
}

function applySnapshot(s: Snapshot): void {
  const r = G.run!;
  const [wave, phase, timer, waveTime, score, mult, kills, remaining] = s.r;
  Object.assign(r, { wave, timer, waveTime, score, multiplier: mult, kills, remaining });
  // the wave starts when the host's countdown runs out (the other turns of the run come as events)
  if (PHASES[phase] === 'fighting' && r.phase === 'countdown') { r.phase = 'fighting'; sfx.waveStart(); emit('waveStarted', r.wave); }
  r.votes = new Set(s.v);
  for (const [slot, life, bleed, revive] of s.p) {
    const p = bySlot(slot);
    if (!p) continue;
    p.life = life; p.bleed = bleed; p.revive = revive;
  }
  const now = performance.now();
  for (const [id, x, z, f, life, act, t, dur, flags] of s.e as [number, number, number, number, number, string, number, number, number][]) {
    const e = G.enemies.find((q) => q.id === id);
    if (!e || !e.alive) continue;
    const n = e.net ?? (e.net = { x, z, f, at: now });
    // its velocity from the last two reports, for the gliding between them
    const dt = (now - n.at) / 1000;
    if (dt > 0.02) e.vel.set((x - n.x) / dt, 0, (z - n.z) / dt).clampLength(0, e.speed * 3);
    n.x = x; n.z = z; n.f = f; n.at = now;
    if (life < e.life) e.hitT = 1;
    e.life = life;
    e.frozen = flags & 1 ? 0.3 : 0;
    e.chill = flags & 2 ? 0.3 : 0;
    if (!act) e.action = null;
    else if (!e.action || e.action.name !== act || Math.abs(e.action.t - t) > 0.2) e.action = { name: act, dur, t, events: [], cleanup: null };
  }
}

// --- host ---------------------------------------------------------------------------------------
/** Host: a guest's choice in the run. */
export function onGuestControl(p: Player, m: Record<string, unknown>): void {
  if (!G.run || G.mode !== 'run') return;
  if (m.t === 'vote' && G.run.phase === 'cleared' && p.active) vote(p);
  else if (m.t === 'bank' && G.run.phase === 'cleared' && p.active) playerOut(p, 'banked');
  else if (m.t === 'abandon') playerOut(p, 'dead');
}
