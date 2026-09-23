// Glacial Nova: freezing burst around the caster.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { shockwave, groundFlash, decal, iceSpikes } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import type { InstantSkill, Needs } from './types';
import type { SkillDef } from '../../types';
import { rand } from '../../util';

const ICE = 0x8fd8ff;

const skill: InstantSkill = {
  anim: 'slam',
  cast(player, rawDef) {
    const def = rawDef as Needs<'damage' | 'radius' | 'freeze'>;
    const c = player.pos.clone();
    shockwave(c, { color: ICE, intensity: 3, from: 0.5, to: def.radius, life: 0.45 });
    shockwave(c, { color: 0xffffff, intensity: 2, from: 0.3, to: def.radius * 0.7, life: 0.3 });
    groundFlash(c, { color: ICE, intensity: 2.5, radius: def.radius, life: 0.5 });
    iceSpikes(c, def.radius * 0.95, 42);
    decal(c, { type: 'frost', size: def.radius * 1.05, life: 6, opacity: 0.8 });
    flash({ color: ICE, intensity: 60, distance: 16, life: 0.5, pos: { x: c.x, y: 2, z: c.z } });
    addShake(0.3);
    sfx.nova();
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(4, 16);
      particles.glow.spawn({
        x: c.x, y: rand(0.2, 1.4), z: c.z, vx: Math.cos(a) * s, vy: rand(-0.5, 2), vz: Math.sin(a) * s,
        life: rand(0.4, 0.9), size: rand(0.12, 0.35), sizeEnd: 0.02, color: col(i % 3 ? ICE : 0xffffff, 2.5), colorEnd: col(0x2060ff, 0.4), drag: 3.5,
      });
    }
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < def.radius + e.radius) {
        hitEnemy(e, def.damage, { tags: def.tags, type: 'cold', freeze: def.freeze, knock: 2, from: c });
      }
    }
  },
};

export default skill;
