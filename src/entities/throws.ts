// What the slamming foes throw at a hero too far off to slam (`EnemyDef.throws`; the owner's words: "lava giants in
// crypt should throw lava chunks at player's location, at ballistic trajectory, if far from player --- and large tree
// enemies in forest throw a vine that sprawls on ground, ignoring obstacles in a straight line, that makes player bound
// to the ground for 1.5sec").
// - The Cinder Brute's lava chunk flies on a ballistic arc to where the hero stood as it left the hand, its landing
//   marked on the floor while it flies (he dodges it by stepping off), bursts there and leaves a pool that burns.
// - The Barkhide Hulk's vine creeps out along the floor in a line, through every prop, at about a bolt's speed: a hero
//   its tip meets is held to the ground (`Player.root`) unless he steps out of its way as it comes, and a dash or a
//   blink tears him free.
// Both are played through `fx` (enemyAI.ts), so every co-op game plays them the same from the same numbers, and each
// judges its own hero alone: hurt where `hurtPlayer` allows, rooted by its own game. A partner's copy is shown held
// as this game sees the vine reach it.
import * as THREE from 'three';
import { G } from '../state';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { hurtPlayer, type Attacker } from '../combat/damage';
import { addEffect, telegraph, lavaPool, shockwave } from '../fx/effects';
import { riftBolt, riftBoltTick, riftBoltImpact } from '../fx/riftBolts';
import { groundVine, coils, type Vine } from '../fx/vine';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { groundHeight } from '../world/ground';
import type { Enemy } from './enemy';
import type { Player } from './player';
import type { ThrowDef } from '../types';

/** the chunk's fall (m/s²): heavier than the world's, so its arc reads as a throw and not a float */
const FALL = 22;
/** the chunk's look: its lava, smoke and size (m) */
const LAVA = { color: 0xff6a2a, smoke: 0x1a1210, ring: 0xff6a20, size: 0.42 };
/** the vine's bark and sap, and how long it lies and withers once grown (s) */
const VINE = { bark: 0x46602a, sap: 0x9cff3a, lies: 0.6, withers: 0.5 };
/** how fast the coils wind up a held hero and fall from him (s), and how high they reach (m) */
const COILS = { wind: 0.25, fall: 0.3, high: 0.7 };
/** how often a pool burns a hero standing in it (s) */
const BURN_EVERY = 0.5;

/** A throw in the air or on the floor, kept for the lab (`lab throws`) until the next ones push it out. */
export interface Thrown {
  what: ThrowDef['what'];
  /** game time it was thrown */
  at: number;
  /** where it was aimed (lava: where it lands; vine: its line's end) */
  to: { x: number; z: number };
  /** lava: the ring marking its landing (its group placed there), and where it came down */
  ring?: THREE.Object3D;
  landed?: { x: number; z: number; t: number };
  /** the chunk's mesh (lava) or the vine's */
  mesh: THREE.Object3D;
  /** the players' slots it hurt or held, and when */
  struck: { slot: number; t: number }[];
}
/** the latest throws, the newest last */
export const THROWN: Thrown[] = [];
const keep = (t: Thrown): Thrown => {
  THROWN.push(t);
  if (THROWN.length > 16) THROWN.shift();
  return t;
};

const throwOf = (id: number): { foe: Enemy | null; def: ThrowDef | undefined } => {
  const foe = G.enemies.find((e) => e.id === id) ?? null;
  return { foe, def: foe?.def.throws };
};

/** Where enemy `e` lets go of a throw: its throwing hand, or over its shoulder. */
export function releaseFrom(e: Enemy, out: THREE.Vector3): THREE.Vector3 {
  const hand = e.model.joints?.handR;
  if (hand) return hand.getWorldPosition(out);
  return out.set(e.pos.x, e.height * 0.9, e.pos.z);
}

/** How long a chunk thrown `d` m flies (s). */
export const lavaFlight = (def: ThrowDef, d: number): number => (def.flight?.[0] ?? 0.9) + (def.flight?.[1] ?? 0.03) * d;

/**
 * A chunk of lava from (ox, oy, oz) to land at (tx, tz) after `flight` s, thrown by foe `kind` (its `throws`) dealing
 * `damage` (`id`: the thrower, named in the battle log).
 */
export function lavaChunk(id: number, kind: EnemyId, ox: number, oy: number, oz: number, tx: number, tz: number,
  flight: number, damage: number): void {
  const def = ENEMIES[kind].throws;
  if (!def) return;
  const [splash, share] = def.splash ?? [1.8, 0.75];
  const ty = groundHeight(tx, tz);
  const vel = new THREE.Vector3((tx - ox) / flight, (ty - oy + 0.5 * FALL * flight * flight) / flight, (tz - oz) / flight);
  const pos = new THREE.Vector3(ox, oy, oz);
  const mesh = riftBolt('magma', LAVA.color, LAVA.size);
  mesh.name = 'lava chunk';
  mesh.position.copy(pos);
  G.scene.add(mesh);
  const ring = telegraph({ x: tx, z: tz }, splash, flight, LAVA.ring);
  const thrown = keep({ what: 'lava', at: G.time, to: { x: tx, z: tz }, ring: ring.group, mesh, struck: [] });
  const by: Attacker = { foe: throwOf(id).foe, attack: 'lava' };
  const acc = { t: 0, a: 0 };
  let t = 0;
  sfx.swing();
  addEffect({
    update(dt) {
      t = Math.min(flight, t + dt);
      pos.set(ox + vel.x * t, oy + vel.y * t - 0.5 * FALL * t * t, oz + vel.z * t);
      mesh.position.copy(pos);
      const v = new THREE.Vector3(vel.x, vel.y - FALL * t, vel.z);
      riftBoltTick('magma', mesh, pos, v, LAVA.color, LAVA.smoke, dt, acc);
      if (t < flight) return true;
      thrown.landed = { x: pos.x, z: pos.z, t: G.time };
      land(pos, splash, damage * share, by, thrown);
      lavaBurns(def, pos, damage, by, thrown);
      return false;
    },
    dispose() { mesh.removeFromParent(); },
  });
}

/** The chunk bursting where it came down: whoever stands in its splash is hurt, each by its own game. */
function land(pos: THREE.Vector3, splash: number, damage: number, by: Attacker, thrown: Thrown): void {
  riftBoltImpact('magma', pos, LAVA.color, LAVA.smoke, LAVA.size);
  shockwave(pos, { color: LAVA.color, intensity: 2.2, from: 0.3, to: splash * 1.1, life: 0.4 });
  debris(pos, { count: 12, speed: splash * 2 });
  flash({ color: LAVA.color, intensity: 30, distance: splash * 4, life: 0.3, pos: { x: pos.x, y: pos.y + 1, z: pos.z } });
  addShake(0.25);
  sfx.crumble();
  const p = G.player;
  if (p.active && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < splash + p.radius) {
    hurtPlayer(p, damage, 'fire', pos, by);
    thrown.struck.push({ slot: p.slot, t: G.time });
  }
}

/** The pool a chunk leaves, burning whoever stands in it every `BURN_EVERY` s. */
function lavaBurns(def: ThrowDef, at: THREE.Vector3, damage: number, by: Attacker, thrown: Thrown): void {
  const [radius, life, perSecond] = def.pool ?? [1.5, 2.5, 0.3];
  const pos = at.clone();
  pos.y = groundHeight(pos.x, pos.z);
  lavaPool(pos, radius, life, LAVA.color);
  const burn: Attacker = { foe: by.foe, attack: 'burn' };
  let t = 0, next = BURN_EVERY, embers = 0;
  addEffect({
    update(dt) {
      t += dt;
      embers += dt;
      if (embers > 0.15) {
        embers = 0;
        burst(new THREE.Vector3(pos.x + (Math.random() - 0.5) * radius, pos.y + 0.1, pos.z + (Math.random() - 0.5) * radius),
          { count: 2, color: LAVA.color, speed: 1.2, life: 0.6, size: 0.12 });
      }
      if (t >= next) {
        next += BURN_EVERY;
        const p = G.player;
        if (p.active && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < radius + p.radius * 0.5) {
          hurtPlayer(p, damage * perSecond * BURN_EVERY, 'fire', pos, burn);
          thrown.struck.push({ slot: p.slot, t: G.time });
        }
      }
      return t < life;
    },
  });
}

/**
 * A vine from (ox, oz) along `angle` (as a facing: atan2(dx, dz)) for `length` m, sent by foe `kind` (its `throws`):
 * it creeps out to its end, a hero its tip meets held to the ground, then lies a moment and withers.
 */
export function vineAt(kind: EnemyId, ox: number, oz: number, angle: number, length: number): void {
  const def = ENEMIES[kind].throws;
  if (!def) return;
  const [speed, reach, hold] = def.creep ?? [13, 0.6, 1.5];
  const dx = Math.sin(angle), dz = Math.cos(angle);
  const vine = groundVine(ox, oz, dx, dz, length, VINE.bark, VINE.sap);
  G.scene.add(vine.mesh);
  const thrown = keep({ what: 'vine', at: G.time, to: { x: ox + dx * length, z: oz + dz * length }, mesh: vine.mesh, struck: [] });
  const caught = new Set<Player>();
  let t = 0, held = 0, debrisT = 0;
  sfx.rush();
  addEffect({
    update(dt) {
      t += dt;
      const before = vine.grow;
      vine.grow = Math.min(length, t * speed);
      debrisT += dt;
      if (vine.grow < length && debrisT > 0.05) {
        debrisT = 0;
        const x = ox + dx * vine.grow, z = oz + dz * vine.grow;
        smokePuff(new THREE.Vector3(x, groundHeight(x, z), z), { count: 1, color: 0x2a2418, size: 0.4, sizeEnd: 1, speed: 0.6, life: 0.5 });
      }
      for (const p of G.players) {
        if (caught.has(p) || !p.active) continue;
        const rx = p.pos.x - ox, rz = p.pos.z - oz;
        const along = rx * dx + rz * dz, off = Math.abs(rx * dz - rz * dx);
        // the tip's sweep this frame, and a hero's reach round it
        if (along < before - reach || along > vine.grow + reach || off > reach + p.radius) continue;
        if (p.local ? !p.root(hold) : !!p.dash) continue;
        caught.add(p);
        held = Math.max(held, t + hold);
        thrown.struck.push({ slot: p.slot, t: G.time });
        coilRound(p, hold);
      }
      const grown = length / speed, ends = Math.max(grown + VINE.lies, held);
      vine.wither = Math.min(1, Math.max(0, (t - ends) / VINE.withers));
      vine.update(G.time);
      return vine.wither < 1;
    },
    dispose() { vine.dispose(); },
  });
}

/** The coils round a hero the vine caught: wound up his legs, kept at his feet, and fallen off as he's let go (his own
 *  game's hold, which a dash ends; a partner's copy's by the time it holds). */
function coilRound(p: Player, hold: number): void {
  const c: Vine = coils(COILS.high, VINE.bark, VINE.sap);
  c.mesh.name = 'vine coils';
  G.scene.add(c.mesh);
  const until = G.time + hold;
  let t = 0, off = -1;
  sfx.thud();
  addEffect({
    update(dt) {
      t += dt;
      c.mesh.position.set(p.pos.x, groundHeight(p.pos.x, p.pos.z), p.pos.z);
      c.grow = c.length * Math.min(1, t / COILS.wind);
      const holding = p.local ? p.rooted : G.time < until && !p.dash && p.active;
      if (!holding && off < 0) {
        off = t;
        burst(new THREE.Vector3(p.pos.x, c.mesh.position.y + 0.3, p.pos.z), { count: 10, color: VINE.sap, speed: 3, life: 0.4, size: 0.15 });
      }
      c.wither = off < 0 ? 0 : Math.min(1, (t - off) / COILS.fall);
      c.update(G.time);
      return c.wither < 1;
    },
    dispose() { c.dispose(); },
  });
}
