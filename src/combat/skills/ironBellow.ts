// Iron Bellow: a war cry that hurls back nearby foes and raises three spectral shields that circle
// the warrior as a damage-absorbing ward; each blow they soak flares them, and they shatter at the end.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { addEffect, shockwave, groundFlash, crackDecal } from '../../fx/effects';
import { particles, col, burst, smokePuff } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { schedule } from '../../core/timers';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'damage' | 'radius' | 'knock' | 'absorbPct' | 'duration'>;
const GOLD = 0xffc85a;
const SHIELDS = 3;

// a spectral kite shield: a glowing face and a bright rim, facing +Z
const face = new THREE.CircleGeometry(0.3, 24).scale(0.85, 1.1, 1);
const rim = new THREE.TorusGeometry(0.3, 0.025, 6, 28).scale(0.85, 1.1, 1);
const boss = new THREE.SphereGeometry(0.06, 10, 8);

function shieldMaterials() {
  const m = (c: number, k: number, o: number) => new THREE.MeshBasicMaterial({
    color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  return { face: m(GOLD, 0.3, 0.3), rim: m(0xffe2a0, 0.7, 1) };
}

function buildShield(mats: ReturnType<typeof shieldMaterials>): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(face, mats.face), new THREE.Mesh(rim, mats.rim), new THREE.Mesh(boss, mats.rim));
  g.traverse((o) => { o.frustumCulled = false; });
  return g;
}

const skill: InstantSkill = {
  anim: 'buff',
  warm: () => [buildShield(shieldMaterials())],
  cast(player, rawDef) {
    const def = rawDef as Def;
    const c = player.pos.clone();
    // the roar: three rings rolling out, a dust ring and a cracked floor
    for (let i = 0; i < 3; i++) {
      schedule(i * 0.09, () => shockwave(c, { color: i ? GOLD : 0xffffff, intensity: 2.2 - i * 0.5, from: 0.4, to: def.radius * (1 - i * 0.18), life: 0.5 }));
    }
    groundFlash(c, { color: GOLD, intensity: 1, radius: def.radius * 0.8, life: 0.35 });
    crackDecal(c, { size: 3, color: GOLD, intensity: 1.2, life: 1.6 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      smokePuff({ x: c.x + Math.cos(a) * 1.2, y: 0, z: c.z + Math.sin(a) * 1.2 }, { count: 1, color: 0x2a241c, alpha: 0.45, size: 0.8, sizeEnd: 2.2, life: 0.9, speed: 0.4 });
    }
    flash({ color: GOLD, intensity: 12, distance: 10, life: 0.4, pos: { x: c.x, y: 2, z: c.z } });
    addShake(0.3);
    sfx.roar();
    for (const e of G.enemies) {
      if (e.alive && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < def.radius + e.radius) {
        hitEnemy(e, def.damage, { tags: ['physical'], type: 'physical', knock: def.knock, from: c });
      }
    }

    // the ward, shown as shields circling the warrior
    player.ward?.onEnd?.();
    const mats = shieldMaterials();
    const shields = Array.from({ length: SHIELDS }, () => buildShield(mats));
    const root = new THREE.Group();
    root.add(...shields);
    G.scene.add(root);
    let ended = false, hitFlash = 0, t = 0;
    const amount = player.stats.maxLife * def.absorbPct;
    const ward = {
      amount, t: def.duration,
      onHit: () => { hitFlash = 1; sfx.clang(); },
      onEnd: () => { ended = true; },
    };
    player.ward = ward;
    addEffect({
      update(dt) {
        t += dt;
        const p = player.pos;
        root.position.set(p.x, player.obj.position.y + 1.1, p.z);
        // they rise out of the ground, orbit, and dim as the ward is used up
        const grow = Math.min(1, t / 0.25);
        const left = Math.max(0.25, ward.amount / amount);
        hitFlash = Math.max(0, hitFlash - dt * 4);
        shields.forEach((s, i) => {
          const a = t * 2.4 + (i / SHIELDS) * Math.PI * 2;
          s.position.set(Math.sin(a) * 0.95, Math.sin(t * 3 + i) * 0.08 - (1 - grow) * 1.1, Math.cos(a) * 0.95);
          s.rotation.y = a;   // face outwards
          s.scale.setScalar(grow * (1 + hitFlash * 0.25));
        });
        mats.face.opacity = (0.18 + hitFlash * 0.4) * left;
        mats.rim.opacity = (0.55 + hitFlash * 0.45) * left;
        if (Math.random() < dt * 20) {
          const s = shields[Math.floor(Math.random() * SHIELDS)];
          const w = s.getWorldPosition(new THREE.Vector3());
          particles.glow.spawn({ x: w.x, y: w.y, z: w.z, vy: rand(0.3, 1), life: rand(0.3, 0.6), size: rand(0.04, 0.1), sizeEnd: 0, color: col(GOLD, 2.4), colorEnd: col(0x802000, 0.3) });
        }
        if (ended || !player.alive) {
          for (const s of shields) burst(s.getWorldPosition(new THREE.Vector3()), { count: 14, color: GOLD, speed: 4, life: 0.45, size: 0.18, gravity: 3 });
          return false;
        }
        return true;
      },
      dispose() { G.scene.remove(root); mats.face.dispose(); mats.rim.dispose(); },
    });
  },
};

export default skill;
