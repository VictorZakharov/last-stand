// Splintering Bolt: a fan of homing arcane bolts that split on impact.
import * as THREE from 'three';
import { spawnProjectile } from '../projectiles';
import { hitEnemy } from '../damage';
import { burst } from '../../fx/particles';
import { flash } from '../../fx/lights';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'missiles' | 'spread' | 'speed' | 'splitCount' | 'splitDamage' | 'range' | 'color' | 'trailEnd'>;
import type { SkillDef } from '../../types';
import { sfx } from '../../core/audio';

function launch(origin: THREE.Vector3, angle: number, def: Def, damage: number, gen: number, ignore: Set<Enemy>, withLight: boolean): void {
  const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  spawnProjectile({
    pos: origin, dir, speed: def.speed * (gen ? 0.85 : 1), radius: gen ? 0.3 : 0.38,
    life: (def.range / def.speed) * (gen ? 0.6 : 1),
    color: def.color, size: gen ? 0.08 : 0.12, intensity: 6,
    glow: withLight ? 10 : 0, homing: gen ? 5 : 2.2, ignore,
    trail: { color: def.color, colorEnd: def.trailEnd, size: gen ? 0.22 : 0.34, rate: gen ? 50 : 90, life: 0.3 },
    onHit: (target, proj) => {
      const enemy = target as Enemy;   // friendly projectiles only hit enemies
      hitEnemy(enemy, damage, { tags: def.tags, type: 'arcane', knock: 1.2, from: proj.pos });
      burst(proj.pos, { count: gen ? 8 : 14, color: def.color, speed: 4, life: 0.35, size: 0.28 });
      sfx.boltHit();
      if (gen === 0) {
        flash({ color: def.color, intensity: 12, distance: 5, life: 0.15, pos: proj.pos });
        const heading = Math.atan2(proj.vel.x, proj.vel.z);
        const n = def.splitCount;
        for (let i = 0; i < n; i++) {
          const a = heading + (i - (n - 1) / 2) * 1.1;
          launch(proj.pos.clone(), a, def, damage * def.splitDamage, 1, new Set([enemy]), false);
        }
      }
    },
  });
}

const skill: InstantSkill = {
  anim: 'cast',
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const origin = player.castPoint;
    origin.y = Math.max(1.0, origin.y - 0.3);
    const base = Math.atan2(target.x - origin.x, target.z - origin.z);
    const n = def.missiles;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * def.spread;
      launch(origin.clone(), a, def, def.damage, 0, new Set(), i === Math.floor(n / 2));
    }
    burst(origin, { count: 10, color: def.color, speed: 2, life: 0.25, size: 0.25, gravity: 0 });
    sfx.bolt();
  },
};

export default skill;
