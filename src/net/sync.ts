// The fight in co-op: the host's game simulates it and reports it; the guests show it.
// Every frame the host sends what happened (spawns, deaths, attack effects, loot, the run's turns)
// and, at the send rate, a snapshot of where everything stands (enemies, the downed, the run), each
// stamped with the host's clock. A guest plays them out on the host's timeline (net/timeline): its
// enemies are copies read between the snapshots, and each event is applied when its time comes, so
// a blow lands as its swing shows and is judged against where the guest stands on its own screen.
// Its own character stays its own to move and cast, and what its skills hit, it deals there and
// then on its copies and reports to the host, which deals it on its foes (the guest's kill).
import * as THREE from 'three';
import { G } from '../state';
import { setSpawnSink, spawnEnemy } from '../entities/spawner';
import { setFxSink, FX, type FxName } from '../entities/enemyAI';
import { setDealtSink, DAMAGE_TYPES, type DealtHit } from '../combat/damage';
import { setPropSink, setPropLife } from '../world/destructible';
import { runHooks, vote, playerOut, showCleared, startNextWave, gainLoot, localOut, endRun, bankedAway, type RunPhase } from '../game/run';
import { on, emit } from '../events';
import { sfx } from '../core/audio';

import { newItemId } from '../loot/items';
import { role } from './role';
import { Playout, Smoother, Track, type Pose } from './timeline';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { EnemyId } from '../data/enemies';
import type { Item } from '../types';

type WorldEvent =
  | { k: 'spawn'; id: number; ty: EnemyId; h: 0 | 1; n: string; x: number; z: number; f: number; ml: number; w: number }
  | { k: 'die'; id: number }
  | { k: 'fx'; n: FxName; a: number[] }
  | { k: 'prop'; i: number; l: number }
  | { k: 'clear' }
  | { k: 'next'; w: number }
  | { k: 'loot'; s: number; item: Item }
  | { k: 'out'; s: number; o: 'banked' | 'dead' }
  | { k: 'down'; s: number }
  | { k: 'raise'; s: number }
  | { k: 'over' };

/** run: [wave, phase, timer, waveTime, score, multiplier, kills, remaining]; votes: slots that chose
 *  Continue; players: [slot, bleed, revive]; enemies: [id, x, z, facing, life, action, t, dur, flags];
 *  acks: [slot, the number of its last hit dealt here] */
interface Snapshot { r: number[]; v: number[]; p: number[][]; e: (number | string)[][]; a: number[][] }

/** A report of the fight: the host's clock as it was sent (ms), what happened, where everything stands. */
export interface WorldMessage { t: number; x?: WorldEvent[]; s?: Snapshot }

/** A guest's hit on a foe, for the host: [its number, foe, amount, crit, type, knock, from x, from z, chill, freeze] */
export type HitReport = number[];

const PHASES: RunPhase[] = ['countdown', 'fighting', 'cleared', 'over'];
const r2 = (v: number): number => Math.round(v * 100) / 100;
const bySlot = (s: number): Player | undefined => G.players.find((p) => p.slot === s);

let events: WorldEvent[] = [];
/** only the host reports, and only the fight */
const push = (ev: WorldEvent): void => { if (role.current === 'host' && G.mode === 'run') events.push(ev); };
/** host: each guest's hits dealt here so far, by slot (the number of the last), told back in the snapshots */
const dealtUpTo = new Map<number, number>();

/** guest: the host's reports waiting for their time */
const world = new Playout<WorldMessage>();
/** guest: each foe's reported positions on the host's clock, by id (a foe's may come before its spawn plays), and
 *  its copy's shown place eased onto its track's */
const tracks = new Map<number, Track>();
const smoothers = new Map<number, Smoother>();
/** guest: its hits sent to the host and not yet in a snapshot played here (each foe's life shows them meanwhile) */
let pending: { seq: number; id: number; amount: number }[] = [];
let hitSeq = 0;
let outgoing: HitReport[] = [];
const _pose: Pose = { x: 0, z: 0, vx: 0, vz: 0, f: 0 };

/** Hook the fight's reporting in (it only sends anything on a co-op host in a run, or a guest's hits). */
export function initSync(): void {
  setSpawnSink((e) => push({ k: 'spawn', id: e.id, ty: e.type, h: e.hero ? 1 : 0, n: e.name, x: r2(e.pos.x), z: r2(e.pos.z), f: r2(e.facing), ml: Math.round(e.maxLife), w: G.run?.wave ?? 1 }));
  setFxSink((n, a) => push({ k: 'fx', n, a: a.map(r2) }));
  setPropSink((i, l) => push({ k: 'prop', i, l }));
  setDealtSink(onDealt);
  on('enemyKilled', (e) => push({ k: 'die', id: e.id }));
  runHooks.cleared = () => push({ k: 'clear' });
  runHooks.nextWave = () => push({ k: 'next', w: G.run!.wave });
  runHooks.loot = (p, item) => push({ k: 'loot', s: p.slot, item });
  runHooks.out = (p, o) => push({ k: 'out', s: p.slot, o });
  runHooks.down = (p) => push({ k: 'down', s: p.slot });
  runHooks.raised = (p) => push({ k: 'raise', s: p.slot });
  runHooks.over = () => push({ k: 'over' });
}

export function hostSync(): void { forget(); }
export function stopSync(): void { forget(); }

function forget(): void {
  events = [];
  dealtUpTo.clear();
  world.clear();
  tracks.clear();
  smoothers.clear();
  pending = [];
  outgoing = [];
}

/** Host, every frame: the events since the last frame, and the snapshot when one is due. */
export function sendWorld(send: (m: WorldMessage) => void, snapshot: boolean): void {
  if (!events.length && !snapshot) return;
  const m: WorldMessage = { t: Math.round(performance.now() * 10) / 10 };
  if (events.length) { m.x = events; events = []; }
  if (snapshot && G.run) m.s = snap();
  send(m);
}

function snap(): Snapshot {
  const r = G.run!;
  return {
    r: [r.wave, PHASES.indexOf(r.phase), r2(r.timer), r2(r.waveTime), Math.round(r.score), r.multiplier, r.kills, r.remaining],
    v: [...r.votes],
    p: G.players.filter((p) => !p.away).map((p) => [p.slot, r2(p.bleed), r2(p.revive)]),
    e: G.enemies.filter((e) => e.deadT < 0).map((e) => [
      e.id, r2(e.pos.x), r2(e.pos.z), r2(e.facing), Math.round(e.life),
      e.action?.name ?? '', r2(e.action?.t ?? 0), r2(e.action?.dur ?? 0), (e.frozen > 0 ? 1 : 0) | (e.chill > 0 ? 2 : 0),
    ]),
    a: [...dealtUpTo],
  };
}

/** Host: a guest's hits on the foes, as its own game dealt them on its copies: dealt here too, its kill and loot. */
export function onGuestHits(p: Player, hits: HitReport[]): void {
  if (role.current !== 'host' || G.mode !== 'run') return;
  for (const [seq, id, amount, crit, type, knock, fx, fz, chill, freeze] of hits) {
    dealtUpTo.set(p.slot, Math.max(dealtUpTo.get(p.slot) ?? 0, seq));
    const e = G.enemies.find((q) => q.id === id);
    if (!e || !e.alive || e.invulnerable) continue;
    e.takeDamage(amount, {
      type: DAMAGE_TYPES[type], crit: crit === 1, by: p, chill: chill || undefined, freeze: freeze || undefined,
      ...(knock ? { knock, from: { x: fx, z: fz } } : {}),
    });
  }
}

// --- guest ------------------------------------------------------------------------------------
/** Guest: the local player's hit on a foe, shown on its copy already (combat/damage), goes to the host. */
function onDealt(e: Enemy, hit: DealtHit): void {
  if (role.current !== 'guest' || G.mode !== 'run') return;
  hitSeq++;
  pending.push({ seq: hitSeq, id: e.id, amount: hit.amount });
  const from = hit.from ?? { x: 0, z: 0 };
  outgoing.push([
    hitSeq, e.id, r2(hit.amount), hit.crit ? 1 : 0, DAMAGE_TYPES.indexOf(hit.type),
    r2(hit.knock ?? 0), r2(from.x), r2(from.z), r2(hit.chill ?? 0), r2(hit.freeze ?? 0),
  ]);
}

/** Guest: its hits since it last sent them, for the host (null: none). */
export function takeHits(): HitReport[] | null {
  if (!outgoing.length) return null;
  const hits = outgoing;
  outgoing = [];
  return hits;
}

function trackOf(id: number): Track {
  let track = tracks.get(id);
  if (!track) tracks.set(id, (track = new Track()));
  return track;
}

/**
 * Guest: the host's report of the fight arrived (its time heard by the session). Where the foes are goes into their
 * tracks at once (the reports after the moment shown are what's read between); the rest waits for its time.
 */
export function onWorld(m: WorldMessage): void {
  if (role.current !== 'guest' || G.mode !== 'run' || !G.run) return;
  for (const ev of m.x ?? []) {
    if (ev.k === 'spawn') trackOf(ev.id).add(m.t, { x: ev.x, z: ev.z, vx: 0, vz: 0, f: ev.f }, undefined, false);
  }
  for (const row of m.s?.e ?? []) {
    const [id, x, z, f] = row as number[];
    trackOf(id).add(m.t, { x, z, vx: 0, vz: 0, f }, undefined, false);
  }
  world.push(m.t, m);
}

/** Guest, each frame (`dt` s) before anything moves: the host's reports played up to `at` (its clock, ms), each copy
 *  put where its track has it then. */
export function playWorld(at: number, dt: number): void {
  if (role.current !== 'guest' || G.mode !== 'run' || !G.run || Number.isNaN(at)) return;
  for (const m of world.due(at)) {
    if (m.x) for (const ev of m.x) apply(ev);
    if (m.s && G.run) applySnapshot(m.s);
    if (!G.run) return;
  }
  for (const e of G.enemies) {
    const track = tracks.get(e.id);
    if (!e.net || !e.alive || !track?.at(at, _pose)) continue;
    let smoother = smoothers.get(e.id);
    if (!smoother) smoothers.set(e.id, (smoother = new Smoother()));
    smoother.follow(_pose, track, dt, e.net);
  }
}

function apply(ev: WorldEvent): void {
  switch (ev.k) {
    case 'spawn': {
      if (G.enemies.some((e) => e.id === ev.id)) return;
      const e = spawnEnemy(ev.ty, new THREE.Vector3(ev.x, 0, ev.z), { id: ev.id, name: ev.n, maxLife: ev.ml, hero: !!ev.h, wave: ev.w });
      e.facing = ev.f;
      e.net = { x: ev.x, z: ev.z, vx: 0, vz: 0, f: ev.f };
      return;
    }
    case 'die': {
      const e = G.enemies.find((x) => x.id === ev.id);
      if (e?.alive) e.die();
      tracks.delete(ev.id);
      smoothers.delete(ev.id);
      return;
    }
    case 'fx': (FX[ev.n] as (...a: number[]) => void)(...ev.a); return;
    case 'prop': { const p = G.arena.props[ev.i]; if (p) setPropLife(p, ev.l); return; }
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

/** Our hits on foe `id` the host hadn't dealt yet as of the snapshot just played. */
const pendingOn = (id: number): number => pending.reduce((sum, h) => (h.id === id ? sum + h.amount : sum), 0);

function applySnapshot(s: Snapshot): void {
  const r = G.run!;
  const [wave, phase, timer, waveTime, score, mult, kills, remaining] = s.r;
  Object.assign(r, { wave, timer, waveTime, score, multiplier: mult, kills, remaining });
  // the wave starts when the host's countdown runs out (the other turns of the run come as events)
  if (PHASES[phase] === 'fighting' && r.phase === 'countdown') { r.phase = 'fighting'; sfx.waveStart(); emit('waveStarted', r.wave); }
  r.votes = new Set(s.v);
  for (const [slot, bleed, revive] of s.p) {
    const p = bySlot(slot);
    if (!p) continue;
    p.bleed = bleed; p.revive = revive;
  }
  // (each player's life is its own game's: it comes with that player's own reports)
  const acked = s.a?.find(([slot]) => slot === G.player.slot)?.[1] ?? 0;
  pending = pending.filter((h) => h.seq > acked);
  for (const [id, , , , life, act, t, dur, flags] of s.e as [number, number, number, number, number, string, number, number, number][]) {
    const e = G.enemies.find((q) => q.id === id);
    if (!e || !e.alive) continue;
    // the host's count, less our hits on their way to it (shown on the copy as they landed)
    const shown = life - pendingOn(id);
    if (shown < e.life - 0.5) e.hitT = 1;
    e.life = shown;
    // (raised, never cleared: a freeze or chill our own hit put on shows at once and the copy's own clock ends it)
    if (flags & 1) e.frozen = Math.max(e.frozen, 0.3);
    if (flags & 2) e.chill = Math.max(e.chill, 0.3);
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
