// Molten Rift: the ground splits open in a line of erupting fire along the aim.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { crackDecal, groundFlash, decal, shockwave } from '../../fx/effects';
import { particles, col, debris } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { schedule } from '../../core/timers';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'length' | 'width'>;
const FIRE = 0xff6a20;
/** distance between eruptions along the rift */
const STEP = 1.3;

const skill: InstantSkill = {
  anim: 'slam',
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const dir = new THREE.Vector3(target.x - player.pos.x, 0, target.z - player.pos.z);
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    dir.normalize();
    const start = player.pos.clone().addScaledVector(dir, 1.2);
    const hit = new Set<Enemy>();
    const n = Math.round(def.length / STEP);
    const edge = G.arena.radius - 0.5;
    addShake(0.35);
    sfx.slam();
    shockwave(start, { color: FIRE, intensity: 2, from: 0.3, to: 2.2, life: 0.35 });
    for (let i = 0; i < n; i++) {
      const c = start.clone().addScaledVector(dir, i * STEP);
      c.x += -dir.z * rand(-0.25, 0.25); c.z += dir.x * rand(-0.25, 0.25);
      if (Math.hypot(c.x, c.z) > edge) break;
      schedule(i * 0.045, () => {
        crackDecal(c, { size: def.width * 1.3, color: FIRE, intensity: 1.9, life: 2.4 });
        decal(c, { type: 'scorch', size: def.width * 1.4, life: 5, opacity: 0.8 });
        groundFlash(c, { color: FIRE, intensity: 1.6, radius: def.width * 1.1, life: 0.35 });
        debris(c, { count: 4, color: 0x2a1a12, speed: 5 });
        if (i % 3 === 0) { flash({ color: FIRE, intensity: 22, distance: 6, life: 0.4, pos: { x: c.x, y: 1, z: c.z } }); sfx.flame(); }
        for (let k = 0; k < 14; k++) {
          particles.glow.spawn({
            x: c.x + rand(-0.4, 0.4), y: 0.1, z: c.z + rand(-0.4, 0.4), vx: rand(-1, 1), vy: rand(3, 8), vz: rand(-1, 1),
            life: rand(0.35, 0.8), size: rand(0.15, 0.4), sizeEnd: 0.04, color: col(k % 3 ? FIRE : 0xffd080, 3), colorEnd: col(0x601000, 0.3), gravity: 4, drag: 1.5,
          });
        }
        for (const e of G.enemies) {
          if (!e.alive || hit.has(e) || Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > def.width + e.radius) continue;
          hit.add(e);
          // knocked onward along the rift
          hitEnemy(e, def.damage, { tags: def.tags, type: 'fire', knock: 1.5, from: new THREE.Vector3(e.pos.x, 0, e.pos.z).addScaledVector(dir, -1) });
        }
      });
    }
  },
};

export default skill;
