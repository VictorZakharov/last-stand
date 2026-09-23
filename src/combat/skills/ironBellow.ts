// Iron Bellow: a war cry that hurls back nearby foes and grants a damage-absorbing ward.
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { addEffect, shockwave, groundFlash } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'damage' | 'radius' | 'knock' | 'absorbPct' | 'duration'>;
const GOLD = 0xffc85a;

const skill: InstantSkill = {
  anim: 'buff',
  cast(player, rawDef) {
    const def = rawDef as Def;
    const c = player.pos.clone();
    shockwave(c, { color: GOLD, intensity: 2.5, from: 0.4, to: def.radius, life: 0.45 });
    shockwave(c, { color: 0xffffff, intensity: 1.2, from: 0.3, to: def.radius * 0.6, life: 0.3 });
    groundFlash(c, { color: GOLD, intensity: 1, radius: def.radius * 0.8, life: 0.35 });
    flash({ color: GOLD, intensity: 12, distance: 10, life: 0.4, pos: { x: c.x, y: 2, z: c.z } });
    addShake(0.3);
    sfx.roar();
    for (const e of G.enemies) {
      if (e.alive && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < def.radius + e.radius) {
        hitEnemy(e, def.damage, { tags: ['physical'], type: 'physical', knock: def.knock, from: c });
      }
    }

    player.ward?.onEnd?.();
    let ended = false;
    const spark = (n: number, speed: number) => {
      const p = player.pos;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = rand(0.45, 0.7);
        particles.glow.spawn({
          x: p.x + Math.cos(a) * r, y: rand(0.1, 1.4), z: p.z + Math.sin(a) * r, vx: Math.cos(a) * speed, vy: rand(0.8, 1.8), vz: Math.sin(a) * speed,
          life: rand(0.4, 0.8), size: rand(0.05, 0.14), sizeEnd: 0, color: col(GOLD, 2.4), colorEnd: col(0x802000, 0.3), drag: 2,
        });
      }
    };
    player.ward = {
      amount: player.stats.maxLife * def.absorbPct,
      t: def.duration,
      onHit: () => spark(8, 3),
      onEnd: () => { ended = true; },
    };
    // golden motes rise around the warrior while the ward holds
    addEffect({
      update(dt) {
        if (ended || !player.alive) return false;
        if (Math.random() < dt * 30) spark(1, 0);
        return true;
      },
    });
  },
};

export default skill;
