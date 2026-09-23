// Enemy behaviors. Each AI sets e.desired (velocity), e.targetFacing via
// e.faceTo(), and starts timed actions whose events apply the effects.
import * as THREE from 'three';
import { G } from '../state';
import { DAMAGE_COLORS } from '../data/balance';
import { hurtPlayer } from '../combat/damage';
import { spawnProjectile } from '../combat/projectiles';
import { telegraph, shockwave, decal, groundFlash } from '../fx/effects';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { rand } from '../util';
// Circular (spawner -> enemy -> enemyAI -> spawner) but only used at runtime, which is safe.
import { spawnEnemy } from './spawner';
import type { Enemy } from './enemy';
import type { EnemyAIKind } from '../types';
import type { EnemyId } from '../data/enemies';

const _dir = new THREE.Vector3();

function seek(e: Enemy, dx: number, dz: number, dist: number, speedMul = 1): void {
  if (dist < 1e-3) return;
  e.desired.set((dx / dist) * e.speed * speedMul, 0, (dz / dist) * e.speed * speedMul);
}

function meleeStrike(e: Enemy): void {
  const { dist } = e.toPlayer();
  const p = G.player.pos;
  if (dist < e.def.range + G.player.radius + 0.3 && e.inFront(p.x, p.z, 1.3)) {
    hurtPlayer(e.damage, e.def.damageType, e.pos);
    burst(new THREE.Vector3(p.x, 1.1, p.z), { count: 10, color: 0xff3020, speed: 4, life: 0.35, size: 0.2 });
  }
}

function slamAt(e: Enemy, x: number, z: number, radius: number, color: number = DAMAGE_COLORS.fire): void {
  const pos = new THREE.Vector3(x, 0, z);
  shockwave(pos, { color, intensity: 2.5, from: 0.5, to: radius * 1.15, life: 0.5 });
  shockwave(pos, { color: 0xffffff, intensity: 1, from: 0.2, to: radius * 0.8, life: 0.3 });
  groundFlash(pos, { color, intensity: 2, radius: radius * 1.1, life: 0.4 });
  debris(pos, { count: 22, speed: radius * 2 });
  smokePuff(pos, { count: 10, color: 0x1a1612, size: 1.4, sizeEnd: 3.5, speed: radius });
  decal(pos, { type: 'scorch', size: radius * 1.1, life: 8 });
  flash({ color, intensity: 40, distance: radius * 4, life: 0.35, pos: { x, y: 1.5, z } });
  addShake(e.boss ? 0.8 : 0.45);
  sfx.slam();
  const p = G.player.pos;
  if (Math.hypot(p.x - x, p.z - z) < radius + G.player.radius) hurtPlayer(e.damage, e.def.damageType, pos);
}

function fireBolt(e: Enemy, angleOffset = 0, lead = true): void {
  const pj = e.def.projectile;
  if (!pj) return;
  const p = G.player;
  const origin = new THREE.Vector3();
  if (e.model.tip) e.model.tip.getWorldPosition(origin);
  else origin.set(e.pos.x, e.height * 0.6, e.pos.z);
  const tx = p.pos.x + (lead ? p.vel.x * 0.35 : 0), tz = p.pos.z + (lead ? p.vel.z * 0.35 : 0);
  const a = Math.atan2(tx - origin.x, tz - origin.z) + angleOffset;
  _dir.set(Math.sin(a), 0, Math.cos(a));
  origin.y = 1.1;
  spawnProjectile({
    pos: origin, dir: _dir, speed: pj.speed, radius: pj.radius, life: 3, hostile: true,
    color: pj.color, size: pj.radius * 0.7, intensity: 5,
    trail: { color: pj.color, colorEnd: 0x200030, size: pj.radius * 1.6, rate: 60, life: 0.4 },
    onHit: (_target, proj) => {
      hurtPlayer(e.damage, e.def.damageType, proj.pos);
      burst(proj.pos, { count: 16, color: pj.color, speed: 4, life: 0.4, size: 0.3 });
    },
  });
}

export const AI: Record<EnemyAIKind, (e: Enemy, dt: number) => void> = {
  idle() {},
  melee(e) {
    const { dx, dz, dist } = e.toPlayer();
    e.faceTo(G.player.pos.x, G.player.pos.z);
    if (e.action) return;
    const d = e.def;
    if (dist < d.range + G.player.radius && e.cd <= 0) {
      e.cd = d.cooldown;
      e.startAction('attack', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => meleeStrike(e)]]);
      return;
    }
    // slight flanking so packs surround the player instead of forming a line
    const b = e.brain;
    b.flank ??= rand(-0.6, 0.6);
    const ang = Math.atan2(dx, dz) + (dist > 3 ? b.flank : 0);
    seek(e, Math.sin(ang), Math.cos(ang), 1);
  },

  ranged(e, dt) {
    const keepAway = e.def.keepAway ?? 8;
    const { dx, dz, dist } = e.toPlayer();
    const d = e.def;
    e.faceTo(G.player.pos.x, G.player.pos.z);
    if (e.action) return;
    const b = e.brain;
    b.strafe ??= Math.random() < 0.5 ? 1 : -1;
    b.switchT = (b.switchT ?? rand(1.5, 3)) - dt;
    if (b.switchT <= 0) { b.strafe *= -1; b.switchT = rand(1.5, 3); }
    if (dist > d.range) seek(e, dx, dz, dist);
    else if (dist < keepAway) seek(e, -dx, -dz, dist, 0.9);
    else e.desired.set((-dz / dist) * e.speed * 0.5 * b.strafe, 0, (dx / dist) * e.speed * 0.5 * b.strafe);
    if (dist < d.range && e.cd <= 0) {
      e.cd = d.cooldown * rand(0.8, 1.2);
      sfx.witchCast();
      e.startAction('attack', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => fireBolt(e)]]);
    }
  },

  slam(e) {
    const slamRadius = e.def.slamRadius ?? 3;
    const { dx, dz, dist } = e.toPlayer();
    const d = e.def;
    if (e.action) return;
    e.faceTo(G.player.pos.x, G.player.pos.z);
    if (dist < d.range + G.player.radius && e.cd <= 0) {
      e.cd = d.cooldown;
      // slam lands slightly in front of the brute
      const tx = e.pos.x + (dx / dist) * Math.min(dist, d.range * 0.6), tz = e.pos.z + (dz / dist) * Math.min(dist, d.range * 0.6);
      const tg = telegraph({ x: tx, z: tz }, slamRadius, d.windup);
      e.startAction('slam', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => slamAt(e, tx, tz, slamRadius)]], () => tg.cancel());
      return;
    }
    seek(e, dx, dz, dist);
  },

  boss(e, dt) {
    const slamRadius = e.def.slamRadius ?? 5;
    const { dx, dz, dist } = e.toPlayer();
    const d = e.def;
    const b = e.brain;
    b.summonT = (b.summonT ?? 6) - dt;
    if (e.action) return;
    e.faceTo(G.player.pos.x, G.player.pos.z);
    if (e.cd <= 0) {
      if (b.summonT <= 0 && G.enemies.filter((x) => x.alive).length < 14) {
        b.summonT = 14;
        e.cd = 2;
        e.startAction('roar', 1.4, [[0.5, () => bossSummon(e)]]);
        return;
      }
      if (dist < d.range + 1.5) {
        e.cd = d.cooldown;
        const tg = telegraph(e.pos, slamRadius, d.windup, 0xa040ff);
        const x = e.pos.x, z = e.pos.z;
        e.startAction('slam', d.windup + d.recover, [[d.windup / (d.windup + d.recover), () => slamAt(e, x, z, slamRadius, 0xb070ff)]], () => tg.cancel());
        return;
      }
      if (dist < 18) {
        e.cd = d.cooldown * 1.3;
        e.startAction('cast', 1.3, [
          [0.45, () => { for (let i = -3; i <= 3; i++) fireBolt(e, i * 0.14, false); sfx.witchCast(); }],
          [0.75, () => { for (let i = -2; i <= 2; i++) fireBolt(e, i * 0.2 + 0.07, true); }],
        ]);
        return;
      }
    }
    seek(e, dx, dz, dist, 1);
  },
};

function bossSummon(e: Enemy): void {
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(e.pos.x + Math.cos(a) * 3.5, 0, e.pos.z + Math.sin(a) * 3.5);
    spawnEnemy((e.def.summon ?? 'imp') as EnemyId, pos, { wave: G.run?.wave ?? 1 });
  }
  shockwave(e.pos, { color: 0xb070ff, intensity: 3, from: 1, to: 8, life: 0.8 });
  addShake(0.4);
}
