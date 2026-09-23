// Bull Rush: a shield charge along the aim that tramples and hurls aside what it meets.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { shockwave } from '../../fx/effects';
import { smokePuff, debris } from '../../fx/particles';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { sparks } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'range' | 'speed' | 'knock'>;

const skill: InstantSkill = {
  anim: null,
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const dir = new THREE.Vector3(target.x - player.pos.x, 0, target.z - player.pos.z);
    // aiming at your own feet still charges the full distance, the way you face
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    dir.normalize();
    const hit = new Set<Enemy>();
    let dust = 0;
    sfx.rush();
    smokePuff(player.pos, { count: 6, color: 0x2a241c, size: 0.8, sizeEnd: 2, speed: 2 });
    player.startDash(dir, def.speed, def.range / def.speed, { step: () => {
      const p = player.pos;
      if ((dust -= G.dt) <= 0) { dust = 0.04; smokePuff(p, { count: 1, color: 0x2a241c, alpha: 0.4, size: 0.6, sizeEnd: 1.8, life: 0.8, speed: 0.5 }); }
      for (const e of G.enemies) {
        if (!e.alive || hit.has(e) || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > 1.1 + e.radius) continue;
        hit.add(e);
        hitEnemy(e, def.damage, { tags: def.tags, type: 'physical', knock: def.knock, from: p });
        sparks(e.pos.x, e.height * 0.5, e.pos.z, 0xffc080, 12);
        debris(e.pos, { count: 5, speed: 5 });
        addShake(0.18);
        sfx.clang();
      }
      const d = player.dash;
      if (d && d.t >= d.dur) shockwave(p, { color: 0xffb46a, intensity: 1.5, from: 0.3, to: 2.4, life: 0.35 });
    } });
  },
};

export default skill;
