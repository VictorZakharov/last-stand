// Enemy behaviors. Each AI sets e.desired (velocity), e.targetFacing via
// e.faceTo(), and starts timed actions whose events apply the effects.
// An enemy goes for its target (e.target, the nearest player in the fight). What its attacks look
// like goes through `fx`, which co-op guests replay: their copies of the enemies don't think.
import * as THREE from 'three';
import { G } from '../state';
import { DAMAGE_COLORS } from '../data/balance';
import { hurtPlayer } from '../combat/damage';
import { spawnProjectile, type Projectile } from '../combat/projectiles';
import { sporeOrb, sporeOrbTick } from '../fx/sporeOrb';
import { riftBolt, riftBoltTick, riftBoltLaunch, riftBoltImpact, riftBoltFizzle } from '../fx/riftBolts';
import { telegraph, shockwave, decal, groundFlash } from '../fx/effects';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { rand } from '../util';
import { navTarget, lineClear, steerClear, MARGIN } from '../world/navigation';
// Circular (spawner -> enemy -> enemyAI -> spawner) but only used at runtime, which is safe.
import { spawnEnemy } from './spawner';
import type { Enemy } from './enemy';
import type { Player } from './player';
import type { DamageType, EnemyAIKind } from '../types';
import type { EnemyId } from '../data/enemies';

const _dir = new THREE.Vector3();
const _way = { x: 0, z: 0 };

/** Move along (dx, dz), bent round any obstacle ahead within `reach` (by default ~1s of walking). */
function seek(e: Enemy, dx: number, dz: number, dist: number, speedMul = 1, reach = e.speed * speedMul): void {
  if (dist < 1e-3) return;
  steerClear(e.pos.x, e.pos.z, e.radius, dx / dist, dz / dist, Math.max(reach, e.radius + 1), _way);
  e.desired.set(_way.x * e.speed * speedMul, 0, _way.z * e.speed * speedMul);
}

/** Head for the target, around whatever stands between. */
function chase(e: Enemy, speedMul = 1): void {
  const p = e.target!;
  navTarget(e.pos.x, e.pos.z, e.radius, p.pos.x, p.pos.z, p.slot, _way);
  // the line to the waypoint is already clear: look no further than it
  const dx = _way.x - e.pos.x, dz = _way.z - e.pos.z, d = Math.hypot(dx, dz);
  seek(e, dx, dz, d, speedMul, Math.min(d, e.speed * speedMul));
}

/** Would a bolt from this enemy reach the target, or hit an obstacle first? */
function canShoot(e: Enemy): boolean {
  const p = e.target!.pos, r = (e.def.projectile?.radius ?? 0.3) * 0.5;
  return lineClear(e.pos.x, e.pos.z, p.x, p.z, r);
}

// --- what attacks look like -----------------------------------------------------------
/** Where co-op sends each attack effect to the guests (set by net/sync on the host). */
let fxSink: ((name: FxName, args: number[]) => void) | null = null;
export function setFxSink(fn: typeof fxSink): void { fxSink = fn; }

/**
 * The visible side of enemy attacks, by name with plain numeric arguments, so a co-op guest can
 * replay each one as the host plays it. Only the game simulating the fight deals the damage in them.
 */
export const FX = {
  strike(x: number, z: number) {
    burst(new THREE.Vector3(x, 1.1, z), { count: 10, color: 0xff3020, speed: 4, life: 0.35, size: 0.2 });
  },
  slam(x: number, z: number, radius: number, color: number, boss: number) {
    const pos = new THREE.Vector3(x, 0, z);
    shockwave(pos, { color, intensity: 2.5, from: 0.5, to: radius * 1.15, life: 0.5 });
    shockwave(pos, { color: 0xffffff, intensity: 1, from: 0.2, to: radius * 0.8, life: 0.3 });
    groundFlash(pos, { color, intensity: 2, radius: radius * 1.1, life: 0.4 });
    debris(pos, { count: 22, speed: radius * 2 });
    smokePuff(pos, { count: 10, color: 0x1a1612, size: 1.4, sizeEnd: 3.5, speed: radius });
    decal(pos, { type: 'scorch', size: radius * 1.1, life: 8 });
    flash({ color, intensity: 40, distance: radius * 4, life: 0.35, pos: { x, y: 1.5, z } });
    addShake(boss ? 0.8 : 0.45);
    sfx.slam();
  },
  /** a bolt from enemy `id` (its damage rides along for the game that deals it) */
  bolt(id: number, ox: number, oz: number, angle: number, damage: number) {
    const e = G.enemies.find((x) => x.id === id);
    const pj = e?.def.projectile;
    if (!e || !pj) return;
    _dir.set(Math.sin(angle), 0, Math.cos(angle));
    // the trail's many overlapping particles add up, so it dims with the square of glow
    const glow = pj.glow ?? 1, size = pj.radius * (pj.core ?? 0.7), type: DamageType = e.def.damageType;
    const onHit = (target: Enemy | Player, proj: Projectile) => {
      hurtPlayer(target as Player, damage, type, proj.pos);
      burst(proj.pos, { count: 16, color: pj.color, speed: 4, life: 0.4, size: 0.3 });
      if (pj.look === 'spore') smokePuff(proj.pos, { count: 6, color: pj.trail, alpha: 0.4, size: 0.6, sizeEnd: 1.8, life: 0.9, rise: 0.4 });
    };
    const pos = new THREE.Vector3(ox, 1.1, oz);
    if (pj.look === 'void' || pj.look === 'magma') {
      const look = pj.look, acc = { t: 0, a: 0 }, smoke = pj.trail ?? 0x100818;
      riftBoltLaunch(look, pos, pj.color, size);
      spawnProjectile({
        pos, dir: _dir, speed: pj.speed, radius: pj.radius, life: 3, hostile: true, color: pj.color, mesh: riftBolt(look, pj.color, size),
        tick: (p, dt) => riftBoltTick(look, p.mesh, p.pos, p.vel, pj.color, smoke, dt, acc),
        onHit: (target, proj) => { hurtPlayer(target as Player, damage, type, proj.pos); riftBoltImpact(look, proj.pos, pj.color, smoke, size); },
        onExpire: (proj) => riftBoltFizzle(look, proj.pos, pj.color, smoke, size),
      });
      return;
    }
    if (pj.look === 'spore') {
      const acc = { t: 0 }, smoke = pj.trail ?? 0x2c4a1c;
      spawnProjectile({
        pos, dir: _dir, speed: pj.speed, radius: pj.radius, life: 3, hostile: true, color: pj.color, mesh: sporeOrb(pj.color, size),
        tick: (p, dt) => sporeOrbTick(p.mesh, p.pos, pj.color, smoke, dt, acc), onHit,
      });
      return;
    }
    spawnProjectile({
      pos, dir: _dir, speed: pj.speed, radius: pj.radius, life: 3, hostile: true,
      color: pj.color, size, intensity: 3.5 * glow, glow: 2,
      trail: { color: pj.color, colorEnd: pj.trail ?? 0x200030, intensity: 1.3 * glow * glow, size: size * 2.3, rate: 60, life: 0.4 },
      onHit,
    });
  },
  /** the red ring where a slam will land; it goes if the enemy dies before it lands */
  tele(id: number, x: number, z: number, radius: number, dur: number, color: number) {
    const tg = telegraph({ x, z }, radius, dur, color);
    G.enemies.find((e) => e.id === id)?.onDeath.push(() => tg.cancel());
  },
  summon(x: number, z: number, color: number) {
    shockwave({ x, z }, { color, intensity: 3, from: 1, to: 8, life: 0.8 });
    addShake(0.4);
  },
  cast() { sfx.witchCast(); },
};
export type FxName = keyof typeof FX;

/** Play an attack effect here and on every co-op guest. */
function fx<K extends FxName>(name: K, ...args: Parameters<(typeof FX)[K]>): void {
  (FX[name] as (...a: number[]) => void)(...(args as number[]));
  fxSink?.(name, args as number[]);
}

// --- attacks ------------------------------------------------------------------------
function meleeStrike(e: Enemy): void {
  const { dist } = e.toPlayer();
  const p = e.target!;
  if (p.active && dist < e.def.range + p.radius + 0.3 && e.inFront(p.pos.x, p.pos.z, 1.3)) {
    hurtPlayer(p, e.damage, e.def.damageType, e.pos);
    fx('strike', p.pos.x, p.pos.z);
  }
}

function slamAt(e: Enemy, x: number, z: number, radius: number, color = e.def.accent ?? DAMAGE_COLORS[e.def.damageType]): void {
  fx('slam', x, z, radius, color, e.boss ? 1 : 0);
  // everyone standing in it is hit
  const pos = new THREE.Vector3(x, 0, z);
  for (const p of G.players) if (p.active && Math.hypot(p.pos.x - x, p.pos.z - z) < radius + p.radius) hurtPlayer(p, e.damage, e.def.damageType, pos);
}

function fireBolt(e: Enemy, angleOffset = 0, lead = true): void {
  if (!e.def.projectile) return;
  const p = e.target!;
  const origin = new THREE.Vector3();
  if (e.model.tip) e.model.tip.getWorldPosition(origin);
  else origin.set(e.pos.x, e.height * 0.6, e.pos.z);
  const tx = p.pos.x + (lead ? p.vel.x * 0.35 : 0), tz = p.pos.z + (lead ? p.vel.z * 0.35 : 0);
  fx('bolt', e.id, origin.x, origin.z, Math.atan2(tx - origin.x, tz - origin.z) + angleOffset, e.damage);
}

/** A slam's telegraph, taken down with the action if the enemy dies first. */
function slamRing(e: Enemy, x: number, z: number, radius: number, dur: number, color: number): void {
  fx('tele', e.id, x, z, radius, dur, color);
}

export const AI: Record<EnemyAIKind, (e: Enemy, dt: number) => void> = {
  idle() {},
  melee(e) {
    const { dx, dz, dist } = e.toPlayer();
    const p = e.target!.pos;
    e.faceTo(p.x, p.z);
    if (e.action) return;
    const d = e.def;
    if (dist < d.range + e.target!.radius && e.cd <= 0) {
      e.cd = d.cooldown;
      e.startAction('attack', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => meleeStrike(e)]]);
      return;
    }
    // slight flanking so packs surround the player instead of forming a line (on open ground)
    const b = e.brain;
    b.flank ??= rand(-0.6, 0.6);
    if (!lineClear(e.pos.x, e.pos.z, p.x, p.z, e.radius + MARGIN)) { chase(e); return; }
    const ang = Math.atan2(dx, dz) + (dist > 3 ? b.flank : 0);
    seek(e, Math.sin(ang), Math.cos(ang), 1);
  },

  ranged(e, dt) {
    const keepAway = e.def.keepAway ?? 8;
    const { dx, dz, dist } = e.toPlayer();
    const d = e.def;
    e.faceTo(e.target!.pos.x, e.target!.pos.z);
    if (e.action) return;
    const b = e.brain;
    b.strafe ??= Math.random() < 0.5 ? 1 : -1;
    b.switchT = (b.switchT ?? rand(1.5, 3)) - dt;
    if (b.switchT <= 0) { b.strafe *= -1; b.switchT = rand(1.5, 3); }
    // no shot past an obstacle: walk round it until the player is in the open, and keep at it a
    // moment after, so backing off doesn't hide the player again at once
    const shot = canShoot(e);
    b.roundT = shot ? (b.roundT ?? 0) - dt : 0.6;
    if (dist > d.range || b.roundT > 0) chase(e);
    else if (dist < keepAway) seek(e, -dx, -dz, dist, 0.9);
    else seek(e, -dz * b.strafe, dx * b.strafe, dist, 0.5);
    if (dist < d.range && shot && e.cd <= 0) {
      e.cd = d.cooldown * rand(0.8, 1.2);
      fx('cast');
      e.startAction('attack', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => fireBolt(e)]]);
    }
  },

  slam(e) {
    const slamRadius = e.def.slamRadius ?? 3;
    const { dx, dz, dist } = e.toPlayer();
    const d = e.def;
    if (e.action) return;
    e.faceTo(e.target!.pos.x, e.target!.pos.z);
    if (dist < d.range + e.target!.radius && e.cd <= 0) {
      e.cd = d.cooldown;
      // slam lands slightly in front of the brute
      const tx = e.pos.x + (dx / dist) * Math.min(dist, d.range * 0.6), tz = e.pos.z + (dz / dist) * Math.min(dist, d.range * 0.6);
      slamRing(e, tx, tz, slamRadius, d.windup, 0xff3020);
      e.startAction('slam', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => slamAt(e, tx, tz, slamRadius)]]);
      return;
    }
    chase(e);
  },

  boss(e, dt) {
    const slamRadius = e.def.slamRadius ?? 5;
    const { dist } = e.toPlayer();
    const d = e.def;
    const b = e.brain;
    b.summonT = (b.summonT ?? 6) - dt;
    if (e.action) return;
    e.faceTo(e.target!.pos.x, e.target!.pos.z);
    if (e.cd <= 0) {
      if (b.summonT <= 0 && G.enemies.filter((x) => x.alive).length < 14) {
        b.summonT = 14;
        e.cd = 2;
        e.startAction('roar', 1.4, [[0.5, () => bossSummon(e)]]);
        return;
      }
      if (dist < d.range + 1.5) {
        e.cd = d.cooldown;
        const accent = d.accent ?? 0xb070ff;
        const x = e.pos.x, z = e.pos.z;
        slamRing(e, x, z, slamRadius, d.windup, accent);
        e.startAction('slam', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => slamAt(e, x, z, slamRadius, accent)]]);
        return;
      }
      // the volley would only hit the pillar the player hides behind: go round it instead
      if (dist < 18 && canShoot(e)) {
        e.cd = d.cooldown * 1.3;
        e.startAction('cast', 1.3, [
          [0.45, () => { for (let i = -3; i <= 3; i++) fireBolt(e, i * 0.14, false); fx('cast'); }],
          [0.75, () => { for (let i = -2; i <= 2; i++) fireBolt(e, i * 0.2 + 0.07, true); }],
        ]);
        return;
      }
    }
    chase(e);
  },
};

function bossSummon(e: Enemy): void {
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(e.pos.x + Math.cos(a) * 3.5, 0, e.pos.z + Math.sin(a) * 3.5);
    spawnEnemy((e.def.summon ?? 'imp') as EnemyId, pos, { wave: G.run?.wave ?? 1, lifeMult: e.lifeMult });
  }
  fx('summon', e.pos.x, e.pos.z, e.def.accent ?? 0xb070ff);
}
