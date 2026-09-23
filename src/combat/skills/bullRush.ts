// Bull Rush: a charge along the aim that tramples and hurls aside what it meets. A wedge of force
// leads the charge, dust and sparks stream behind, and the stop lands as a ground-shaking impact.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { addEffect, shockwave, groundFlash, crackDecal, decal } from '../../fx/effects';
import { particles, col, smokePuff, debris } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { sparks } from './cleave';
import { slashMesh } from './slash';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'range' | 'speed' | 'knock'>;
const EMBER = 0xffb46a, DUST = 0x2a241c;
const WEDGE = 1.7;

function arrive(c: THREE.Vector3, dir: THREE.Vector3): void {
  shockwave(c, { color: EMBER, intensity: 2, from: 0.3, to: 3, life: 0.4 });
  shockwave(c, { color: 0xffffff, intensity: 0.9, from: 0.2, to: 1.8, life: 0.25 });
  groundFlash(c, { color: EMBER, intensity: 1, radius: 2, life: 0.3 });
  const ahead = { x: c.x + dir.x * 0.8, z: c.z + dir.z * 0.8 };
  crackDecal(ahead, { size: 2.2, color: EMBER, intensity: 1.2, life: 1.8 });
  debris({ x: ahead.x, y: 0, z: ahead.z }, { count: 16, speed: 6 });
  smokePuff(c, { count: 8, color: DUST, size: 1, sizeEnd: 2.6, speed: 2.5 });
  flash({ color: EMBER, intensity: 14, distance: 7, life: 0.3, pos: { x: c.x, y: 1, z: c.z } });
  addShake(0.35);
  sfx.slam();
}

const skill: InstantSkill = {
  anim: null,
  warm: () => [slashMesh(WEDGE, 0.55, 0xffffff, true).mesh],
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const dir = new THREE.Vector3(target.x - player.pos.x, 0, target.z - player.pos.z);
    // aiming at your own feet still charges the full distance, the way you face
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    dir.normalize();
    const hit = new Set<Enemy>();
    let dust = 0, scrape = 0;
    sfx.rush();
    smokePuff(player.pos, { count: 8, color: DUST, size: 0.8, sizeEnd: 2.2, speed: 2.5 });
    shockwave(player.pos, { color: EMBER, intensity: 1.2, from: 0.3, to: 1.6, life: 0.3 });

    // the wedge of force in front of the charge
    const wedge = slashMesh(WEDGE, 0.55, EMBER, true);
    wedge.mesh.scale.setScalar(1.25);
    G.scene.add(wedge.mesh);

    player.startDash(dir, def.speed, def.range / def.speed, { step: () => {
      const p = player.pos, d = player.dash;
      // dust kicked up and a scorched skid behind; streaks of air rush past
      if ((dust -= G.dt) <= 0) { dust = 0.035; smokePuff(p, { count: 1, color: DUST, alpha: 0.45, size: 0.6, sizeEnd: 1.9, life: 0.8, speed: 0.5 }); }
      if ((scrape -= G.dt) <= 0) { scrape = 0.09; decal(p, { type: 'scorch', size: 0.9, life: 2.5, opacity: 0.5 }); }
      for (let i = 0; i < 4; i++) {
        const side = rand(-0.6, 0.6), up = rand(0.3, 1.8);
        particles.glow.spawn({
          x: p.x - dir.z * side + dir.x * 0.8, y: up, z: p.z + dir.x * side + dir.z * 0.8, vx: -dir.x * rand(10, 16), vz: -dir.z * rand(10, 16),
          life: rand(0.08, 0.16), size: rand(0.03, 0.06), sizeEnd: 0, color: col(0xffe0b0, 1.6), colorEnd: col(0x803010, 0.2),
        });
      }
      for (const e of G.enemies) {
        if (!e.alive || hit.has(e) || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > 1.1 + e.radius) continue;
        hit.add(e);
        hitEnemy(e, def.damage, { tags: def.tags, type: 'physical', knock: def.knock, from: p });
        sparks(e.pos.x, e.height * 0.5, e.pos.z, 0xffc080, 16);
        shockwave(e.pos, { color: EMBER, intensity: 1.5, from: 0.2, to: 1.4, life: 0.25 });
        debris(e.pos, { count: 6, speed: 5 });
        addShake(0.2);
        sfx.clang();
      }
      if (d && d.t >= d.dur) arrive(p.clone(), dir);
    } });
    const myDash = player.dash;
    let t = 0;
    addEffect({
      update(dt) {
        t += dt;
        const on = player.dash === myDash && myDash !== null;
        const p = player.pos;
        wedge.mesh.position.set(p.x + dir.x * 0.3, player.obj.position.y + 0.9, p.z + dir.z * 0.3);
        wedge.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        wedge.mat.uniforms.uFade.value = (on ? Math.min(1, t / 0.06) : 0) * (0.6 + Math.random() * 0.2);
        return on;
      },
      dispose() { G.scene.remove(wedge.mesh); wedge.dispose(); },
    });
  },
};

export default skill;
