// Bow projectiles and woodland control; damage follows the usual co-op authority checks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../state';
import { spawnProjectile } from '../projectiles';
import { hitEnemy } from '../damage';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { addEffect, shockwave, decal } from '../../fx/effects';
import { burst } from '../../fx/particles';
import { nearGlow } from '../../core/materials';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import type { Enemy } from '../../entities/enemy';
import type { InstantSkill, Needs } from './types';

const LEAF = 0xb4cc7b;
// A shaft, broadhead and crossed fletching, pointing along +Z. Shared for every shot.
const pieces = [
  new THREE.CylinderGeometry(0.012, 0.012, 0.65, 6).rotateX(Math.PI / 2),
  new THREE.ConeGeometry(0.045, 0.12, 4).rotateX(Math.PI / 2).translate(0, 0, 0.38),
  new THREE.BoxGeometry(0.085, 0.008, 0.13).translate(0, 0, -0.25),
  new THREE.BoxGeometry(0.008, 0.085, 0.13).translate(0, 0, -0.25),
];
const arrowGeo = mergeGeometries(pieces)!;
for (const g of pieces) g.dispose();
const arrowMat = new THREE.MeshStandardMaterial({ color: 0xd3bf8d, roughness: 0.8, metalness: 0.15 });
const arrowMesh = () => new THREE.Mesh(arrowGeo, arrowMat);
const thornGeo = new THREE.ConeGeometry(0.09, 0.8, 5).translate(0, 0.4, 0);
const thornMat = new THREE.MeshStandardMaterial({ color: 0x5b6a31, roughness: 1 });

export const bowShot: InstantSkill = {
  anim: 'point', warm: () => [arrowMesh()],
  cast(player, rawDef, target) {
    const def = rawDef as Needs<'damage' | 'missiles' | 'spread' | 'speed' | 'range'>;
    const origin = player.castPoint;
    const heading = Math.atan2(target.x - origin.x, target.z - origin.z);
    for (let i = 0; i < def.missiles; i++) {
      const angle = heading + (i - (def.missiles - 1) / 2) * def.spread;
      const mesh = arrowMesh(); mesh.rotation.y = angle;
      spawnProjectile({
        pos: origin, dir: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
        speed: def.speed, radius: 0.24, life: def.range / def.speed, mesh, color: 0xd3bf8d, swept: true,
        onHit(enemy, proj) {
          hitEnemy(enemy as Enemy, def.damage, { by: player, tags: def.tags, type: 'physical', knock: def.knock,
            from: { x: proj.pos.x - proj.vel.x, z: proj.pos.z - proj.vel.z } });
          burst(proj.pos, { count: 6, color: 0xd3bf8d, speed: 2, life: 0.2, size: 0.07 });
          sfx.boltHit();
        },
      });
    }
    sfx.bow();
  },
};

export const briarSnare: InstantSkill = {
  anim: 'cast', warm: () => [new THREE.Mesh(thornGeo, thornMat)],
  cast(player, rawDef, target) {
    const def = rawDef as Needs<'damage' | 'radius' | 'range' | 'freeze'>;
    const c = target.clone().sub(player.pos); c.y = 0;
    if (c.length() > def.range) c.setLength(def.range);
    c.add(player.pos);
    shockwave(c, { color: LEAF, intensity: 1.5, from: 0.2, to: def.radius, life: 0.5 });
    decal(c, { size: def.radius, life: def.freeze, opacity: 0.35 });
    const thorns = new THREE.Group();
    thorns.position.set(c.x, groundHeight(c.x, c.z), c.z);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2, r = def.radius * (i % 2 ? 0.55 : 0.95);
      const m = new THREE.Mesh(thornGeo, thornMat);
      m.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); m.rotation.set(Math.cos(a) * 0.35, a, -Math.sin(a) * 0.35);
      thorns.add(m);
    }
    G.scene.add(thorns);
    let t = 0;
    addEffect({ update(dt) { t += dt; thorns.scale.y = Math.max(0, Math.min(1, t / 0.2, (def.freeze - t) / 0.35)); return t < def.freeze; }, dispose() { G.scene.remove(thorns); } });
    for (const e of G.enemies) {
      if (!e.alive || Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > def.radius + e.radius) continue;
      hitEnemy(e, def.damage, { by: player, tags: def.tags, type: 'physical', freeze: def.freeze, from: c });
      burst(e.pos, { count: 12, color: LEAF, speed: 2, life: 0.6, size: 0.1, gravity: -1 });
    }
    hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.burst);
    sfx.snare();
  },
};

export const thornRepulse: InstantSkill = {
  anim: 'slam',
  cast(player, rawDef) {
    const def = rawDef as Needs<'damage' | 'radius' | 'knock' | 'chill'>;
    const c = player.pos.clone();
    shockwave(c, { color: 0xd9b878, intensity: 1.6, from: 0.5, to: def.radius, life: 0.45 });
    for (const e of G.enemies) {
      if (e.alive && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < def.radius + e.radius)
        hitEnemy(e, def.damage, { by: player, tags: def.tags, type: 'physical', knock: def.knock, chill: def.chill, from: c });
    }
    hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.burst);
    sfx.snare();
  },
};

const wardGeo = new THREE.TorusGeometry(1, 0.025, 5, 48);
const wardMat = () => nearGlow(new THREE.MeshBasicMaterial({ color: LEAF, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
export const woodlandWard: InstantSkill = {
  anim: 'buff', warm: () => [new THREE.Mesh(wardGeo, wardMat())],
  cast(player, rawDef) {
    const def = rawDef as Needs<'absorbPct' | 'duration'>;
    player.ward?.onEnd?.();
    const mat = wardMat(), root = new THREE.Group();
    const rings = [0, 1, 2].map(() => new THREE.Mesh(wardGeo, mat)); root.add(...rings);
    G.scene.add(root);
    let ended = false, t = 0;
    player.ward = { amount: player.stats.maxLife * def.absorbPct, t: def.duration, onEnd: () => { ended = true; } };
    addEffect({
      update(dt) {
        t += dt;
        root.position.set(player.pos.x, groundHeight(player.pos.x, player.pos.z) + 0.1, player.pos.z);
        rings.forEach((ring, i) => {
          ring.rotation.set(Math.PI / 2 + Math.sin(t * 1.2 + i) * 0.18, i * 1.1, t * 0.5);
          ring.position.y = i * 0.32;
          ring.scale.setScalar((player.eyes ? 2.2 : 1) + i * 0.1);
        });
        mat.opacity = ended ? Math.max(0, mat.opacity - dt * 3) : Math.min(0.65, t * 3);
        return player.alive && (!ended || mat.opacity > 0);
      },
      dispose() { G.scene.remove(root); mat.dispose(); },
    });
    sfx.aegis();
  },
};
