// Thunder Crescent: a swing that looses a travelling, crackling arc of lightning, striking each foe it passes once.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { addEffect, lightning, groundFlash } from '../../fx/effects';
import { particles, col, burst } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { slashArc, slashMesh } from './slash';
import { swingArc } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';

type Def = Needs<'damage' | 'speed' | 'range' | 'width' | 'color'>;
const ARC = 1.9;
/** the crescent leans back from the ground so it reads from the camera */
const TILT = -0.55;

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

const skill: InstantSkill = {
  anim: 'swing',
  warm: () => [slashMesh(ARC, 0.45, 0xffffff, true).mesh],
  cast(player, rawDef) {
    const def = rawDef as Def;
    // the way the body (and so the swing) faces, which turned to the target during the cast
    const facing = player.facing;
    const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    slashArc({ x: player.pos.x, z: player.pos.z, facing, ...swingArc(player, 2.2), color: def.color });
    sfx.swing();
    sfx.zap();

    // a glowing body and a thin white-hot edge
    const R = def.width;
    const layers = [slashMesh(ARC, 0.45, def.color, true), slashMesh(ARC, 0.86, 0x9cc0ff, true)];
    const group = new THREE.Group();
    for (const l of layers) { l.mesh.rotation.x = TILT; group.add(l.mesh); }
    group.scale.setScalar(R);
    group.rotation.y = facing;
    const pos = player.pos.clone().addScaledVector(dir, 0.6);
    group.position.set(pos.x, 0.7, pos.z);
    G.scene.add(group);
    const light = flash({ color: def.color, intensity: 6, distance: 7, life: 1, hold: 99, follow: () => new THREE.Vector3(pos.x + dir.x * R, 1.2, pos.z + dir.z * R) });
    const hit = new Set<Enemy>();
    const life = def.range / def.speed;
    let t = 0, crackle = 0, trail = 0;

    /** A world point on the crescent's edge, `u` from -1 (right tip) to 1 (left tip). */
    const edgePoint = (u: number, out: THREE.Vector3) => {
      const h = u * ARC / 2;
      return layers[0].mesh.localToWorld(out.set(Math.sin(h), 0, Math.cos(h)));
    };

    addEffect({
      update(dt) {
        t += dt;
        pos.addScaledVector(dir, def.speed * dt);
        group.position.set(pos.x, 0.7, pos.z);
        group.updateMatrixWorld(true);
        const fade = Math.min(1, t / 0.08) * Math.min(1, (life - t) / 0.2);
        const flicker = 0.75 + Math.random() * 0.25;
        layers[0].mat.uniforms.uFade.value = fade * 0.16 * flicker;
        layers[1].mat.uniforms.uFade.value = fade * 0.2 * flicker;

        // arcs of lightning jump along the edge, sparks shower off it
        if ((crackle -= dt) <= 0) {
          crackle = 0.035;
          const u = rand(-1, 0.6);
          lightning(edgePoint(u, _v).clone(), edgePoint(u + rand(0.25, 0.5), _w).clone(), { color: 0x9cc0ff, intensity: 1.4, width: 0.04, life: 0.07, segments: 6, jag: 0.25, branches: 0 });
        }
        for (let i = 0; i < 2; i++) {
          edgePoint(rand(-1, 1), _v);
          particles.glow.spawn({
            x: _v.x, y: _v.y, z: _v.z, vx: dir.x * 3 + rand(-1.5, 1.5), vy: rand(-1, 2), vz: dir.z * 3 + rand(-1.5, 1.5),
            life: rand(0.15, 0.4), size: rand(0.05, 0.12), sizeEnd: 0, color: col(0xa8c8ff, 1.5), colorEnd: col(0x3050ff, 0.4), gravity: 6, drag: 2,
          });
        }
        // a scorched, glowing wake on the ground
        if ((trail -= dt) <= 0) { trail = 0.07; groundFlash({ x: pos.x + dir.x * R * 0.7, z: pos.z + dir.z * R * 0.7 }, { color: def.color, intensity: 0.35, radius: R * 0.7, life: 0.25 }); }

        const fx = pos.x + dir.x * R * 0.8, fz = pos.z + dir.z * R * 0.8;
        for (const e of G.enemies) {
          if (!e.alive || hit.has(e)) continue;
          if (Math.hypot(e.pos.x - fx, e.pos.z - fz) > R * 0.85 + e.radius) continue;
          hit.add(e);
          hitEnemy(e, def.damage, { by: player, tags: def.tags, type: 'lightning', knock: 1.5, from: pos });
          const at = new THREE.Vector3(e.pos.x, e.height * 0.6, e.pos.z);
          lightning(new THREE.Vector3(fx, 1.1, fz), at, { color: def.color, intensity: 3, life: 0.14, branches: 2 });
          burst(at, { count: 12, color: 0xcfe4ff, speed: 5, life: 0.35, size: 0.2 });
          sfx.zap();
        }
        return t < life && Math.hypot(fx, fz) < G.arena.radius + 0.5;
      },
      dispose() { G.scene.remove(group); for (const l of layers) l.dispose(); release(light); },
    });
  },
};

export default skill;
