// A foe getting out of a hero's attack it sees coming (`EnemyDef.evade`): ducked into the ground, a shot flying over
// what's left of it, or blinked to a spot nearby, clear of the attack. Rolled once an attack, by the game that judges
// the attack's hits (its hero's own, net/role `dealsDamage`), and only for an attack from a hero in front of it: a
// partner shooting it from behind isn't seen. The host's foe evades there and every guest is told (the `evade` fx);
// a guest's copy evades on its own game at once, as its screen shows the shot, and the host is told with its hits.
import * as THREE from 'three';
import { G } from '../state';
import { dealsDamage } from '../net/role';
import { tellHost } from '../combat/damage';
import { fx } from './enemyAI';
import { inObstacle } from '../world/collision';
import { lineClear } from '../world/navigation';
import { burst, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { sfx } from '../core/audio';
import { rand } from '../util';
import type { Enemy } from './enemy';
import type { Player } from './player';
import type { ThreatKind, XZ } from '../types';

/**
 * An attack coming at a foe, where it is now: a line from (`x`, `z`) on along `way` (its length 1), `half` wide either
 * side (a shot, a wave, a charge, a beam), or with no `way`, a circle of `half` round (`x`, `z`), an area coming down.
 */
export interface Threat { kind: ThreatKind; x: number; z: number; way?: XZ; half: number }

/** How an evade goes, as the `evade` fx and a guest's hit report carry it. */
export const EVADE_HOW = { duck: 1, blink: 2 } as const;

/** a ducking foe goes down over this (s) and comes back up over this */
export const DUCK = { down: 0.12, up: 0.3 };
/** a blinked foe forms again where it went over this (s), its dissolve running back from whole gone */
export const BLINK_FORM = 0.28;
/** a guest's copy that blinked stays gone until the host's reports have it this near where it went (m), or this long */
const COPY_GONE = { near: 0.4, longest: 0.6 };
/** a spot it blinks to keeps this clear of the attack (m, past its own circle) and of every hero */
const CLEAR = { attack: 0.6, hero: 2.2, wall: 1.2 };
/** spots tried for a blink, round it at random */
const TRIES = 20;
/** a shot is seen coming once it's this long off (s): time to duck under it */
export const SEEN_AHEAD = 0.25;

const _from = new THREE.Vector3();

/**
 * Whether `e` gets out of `threat`, an attack of `by`'s coming at it: it does it at once (ducked, or blinked away clear
 * of it), and then the attack is to pass it by (a duck is passed over only by what flies above what's left of it: the
 * drawn body's tests see to it). Call it once an attack a foe (the skill keeps who it judged), as the attack reaches
 * it.
 */
export function evades(e: Enemy, by: Player, threat: Threat): boolean {
  const ev = e.def.evade;
  if (!ev || !ev.from.includes(threat.kind) || !dealsDamage(by) || !canEvade(e)) return false;
  if (!e.inFront(by.pos.x, by.pos.z, ev.sees) || Math.random() >= ev.chance) return false;
  if (ev.how === 'duck') {
    play(e, EVADE_HOW.duck, e.pos.x, e.pos.z);
    return true;
  }
  const to = blinkSpot(e, threat, ev.reach ?? [3, 5]);
  if (!to) return false;
  play(e, EVADE_HOW.blink, to.x, to.z);
  return true;
}

/** Up and about, seeing what comes: not rising, dazed, frozen, carried or thrown, nor already out of the way. */
function canEvade(e: Enemy): boolean {
  return e.alive && !e.invulnerable && e.spawning <= 0 && e.dazed <= 0 && e.frozen <= 0 && !e.carried && !e.tossed
    && e.ducked <= 0 && e.gone <= 0;
}

/** The evade played: the host's foe's on every game (the fx), a guest's copy's here at once and told to the host. */
function play(e: Enemy, how: number, x: number, z: number): void {
  if (!e.net) { fx('evade', e.id, how, x, z); return; }
  e.evade(how, x, z, true);
  tellHost(e, { amount: 0, crit: false, type: 'physical', evade: { how, x, z } });
}

/** Whether (x, z) lies in the attack's way (within `pad` of it): ahead of a line's front or in an area's circle. */
export function inThreat(t: Threat, x: number, z: number, pad: number): boolean {
  const dx = x - t.x, dz = z - t.z;
  if (!t.way) return Math.hypot(dx, dz) < t.half + pad;
  const ahead = dx * t.way.x + dz * t.way.z, across = Math.abs(dx * t.way.z - dz * t.way.x);
  return ahead > -pad && across < t.half + pad;
}

/** A spot `reach` off it that it can walk to in a line, clear of the props, the wall, the heroes and the attack. */
export function blinkSpot(e: Enemy, t: Threat, reach: readonly [number, number]): XZ | null {
  const r = e.radius, edge = G.arena.radius - r - CLEAR.wall;
  for (let i = 0; i < TRIES; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(reach[0], reach[1]);
    const to = { x: e.pos.x + Math.sin(a) * d, z: e.pos.z + Math.cos(a) * d };
    if (Math.hypot(to.x, to.z) > edge || inObstacle(to, r) || !lineClear(e.pos.x, e.pos.z, to.x, to.z, r)) continue;
    if (inThreat(t, to.x, to.z, r + CLEAR.attack)) continue;
    if (G.players.some((p) => p.active && Math.hypot(p.pos.x - to.x, p.pos.z - to.z) < CLEAR.hero + r)) continue;
    return to;
  }
  return null;
}

/** How far down a ducking foe is (0 up, 1 down), `left` of its `down` seconds to go: down fast, up again at the end. */
export function duckDepth(left: number, down: number): number {
  if (left <= 0) return 0;
  const k = Math.min(1, (down - left) / DUCK.down, left / DUCK.up);
  return k * k * (3 - 2 * k);
}

/** A foe ducking: spores puffed out round it as it goes down into the ground, its cap left over it. */
export function duckLooks(e: Enemy): void {
  const c = e.def.projectile?.color ?? 0x9cff3a, trail = e.def.projectile?.trail ?? 0x2c4a1c;
  smokePuff(e.pos, { count: 7, color: trail, alpha: 0.45, size: 0.5, sizeEnd: 1.8, life: 0.8, speed: 1.4, rise: 0.3 });
  burst(_from.set(e.pos.x, 0.5, e.pos.z), { count: 12, color: c, speed: 2.5, up: 1, life: 0.5, size: 0.14 });
  sfx.thud();
}

/** A foe blinking away from (x, z): torn out of the air where it stood. */
export function vanishLooks(e: Enemy, x: number, z: number): void {
  const c = e.def.projectile?.color ?? 0xc050ff, smoke = e.def.projectile?.trail ?? 0x1a0428, h = e.height * 0.55;
  smokePuff({ x, y: 0, z }, { count: 8, color: smoke, alpha: 0.6, size: 0.7, sizeEnd: 2, life: 0.7, speed: 1.2,
    rise: 0.8 });
  burst(_from.set(x, h, z), { count: 18, color: c, speed: 4, life: 0.35, size: 0.22 });
  flash({ color: c, intensity: 10, distance: 5, life: 0.2, pos: { x, y: h, z } });
  sfx.blink();
}

/** A blinked foe forming again where it went (its body's dissolve running back, `Enemy.forming`). */
export function formLooks(e: Enemy): void {
  const c = e.def.projectile?.color ?? 0xc050ff;
  burst(_from.set(e.pos.x, e.height * 0.55, e.pos.z), { count: 10, color: c, speed: 2, life: 0.3, size: 0.18 });
}

/** A guest's copy that blinked stays gone until the host's reports have it near where it went, or for long enough. */
export function copyBack(e: Enemy, to: XZ, goneFor: number): boolean {
  return Math.hypot(e.pos.x - to.x, e.pos.z - to.z) < COPY_GONE.near || goneFor >= COPY_GONE.longest;
}
