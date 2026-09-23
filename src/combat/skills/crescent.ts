// Thunder Crescent: a swing that looses a travelling arc of lightning, striking each foe it passes once.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { addEffect, lightning } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { slashArc, slashMesh } from './slash';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'speed' | 'range' | 'width' | 'color'>;
const ARC = 1.9;

const skill: InstantSkill = {
  anim: 'swing',
  warm: () => [slashMesh(ARC, 0.45, 0xffffff).mesh],
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const facing = Math.atan2(target.x - player.pos.x, target.z - player.pos.z);
    const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    slashArc({ x: player.pos.x, z: player.pos.z, y: 1.05, facing, radius: 2.4, arc: 2.2, color: def.color, sweep: 0.1, fade: 0.18 });
    sfx.swing();
    sfx.zap();

    // the crescent bows forward: its centre trails the leading edge by its radius
    const { mesh, mat, dispose } = slashMesh(ARC, 0.45, def.color, true);
    const R = def.width;
    const pos = player.pos.clone().addScaledVector(dir, 0.6);
    mesh.scale.setScalar(R);
    mesh.rotation.y = facing;
    G.scene.add(mesh);
    const light = flash({ color: def.color, intensity: 14, distance: 7, life: 1, hold: 99, follow: () => new THREE.Vector3(pos.x + dir.x * R, 1.2, pos.z + dir.z * R) });
    const hit = new Set<Enemy>();
    const life = def.range / def.speed;
    let t = 0;
    addEffect({
      update(dt) {
        t += dt;
        pos.addScaledVector(dir, def.speed * dt);
        mesh.position.set(pos.x, 1.0, pos.z);
        const fade = Math.min(1, t / 0.08) * Math.min(1, (life - t) / 0.2);
        mat.uniforms.uFade.value = fade * (0.6 + Math.random() * 0.25);
        const fx = pos.x + dir.x * R * 0.8, fz = pos.z + dir.z * R * 0.8;
        if (Math.random() < 0.7) {
          const side = rand(-1, 1) * R;
          particles.glow.spawn({
            x: fx - dir.z * side, y: rand(0.6, 1.4), z: fz + dir.x * side, vx: dir.x * 4 + rand(-1, 1), vy: rand(0, 1.5), vz: dir.z * 4 + rand(-1, 1),
            life: rand(0.15, 0.35), size: rand(0.08, 0.18), sizeEnd: 0, color: col(0xcfe4ff, 3), colorEnd: col(0x3050ff, 0.4), drag: 3,
          });
        }
        for (const e of G.enemies) {
          if (!e.alive || hit.has(e)) continue;
          if (Math.hypot(e.pos.x - fx, e.pos.z - fz) > R * 0.85 + e.radius) continue;
          hit.add(e);
          hitEnemy(e, def.damage, { tags: def.tags, type: 'lightning', knock: 1.5, from: pos });
          lightning(new THREE.Vector3(fx, 1.1, fz), new THREE.Vector3(e.pos.x, e.height * 0.6, e.pos.z), { color: def.color, life: 0.12, branches: 1 });
          sfx.zap();
        }
        const edge = G.arena.radius + 0.5;
        return t < life && Math.hypot(fx, fz) < edge;
      },
      dispose() { G.scene.remove(mesh); dispose(); release(light); },
    });
  },
};

export default skill;
