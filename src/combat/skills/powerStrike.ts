// Power Strike: a second and a half of gathering strength around the weapon, then a crushing overhead blow.
import * as THREE from 'three';
import { shockwave, groundFlash, crackDecal, decal } from '../../fx/effects';
import { particles, col, debris, smokePuff } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { slashArc } from './slash';
import { sweep } from './cleave';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock' | 'color'>;

/** casts whose charge-up already started (to play its sound once) */
const charged = new WeakSet<object>();

const skill: InstantSkill = {
  anim: 'chop',
  charging(player, rawDef, k, dt) {
    const def = rawDef as Def;
    const c = player.casting;
    if (c && !charged.has(c)) { charged.add(c); sfx.charge(c.fireAt); }
    // keep turning towards the aim while charging
    c?.target.copy(player.aim);
    // motes stream into the weapon, faster and hotter as the charge builds
    const tip = player.castPoint;
    const n = Math.random() < dt * (30 + k * 90) ? 1 + Math.floor(k * 2) : 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.9, 1.6), y = rand(-0.6, 0.8);
      const life = rand(0.25, 0.45);
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      particles.glow.spawn({
        x: tip.x + ox, y: tip.y + y, z: tip.z + oz, vx: -ox / life, vy: -y / life, vz: -oz / life,
        life, size: rand(0.06, 0.12) * (1 + k), sizeEnd: 0.02, color: col(k > 0.8 ? 0xffffff : def.color, 2 + k * 2), colorEnd: col(0xff7020, 1),
      });
    }
    if (k > 0.85 && Math.random() < dt * 20) {
      const p = player.pos;
      smokePuff({ x: p.x, y: 0, z: p.z }, { count: 1, color: 0x2a241c, alpha: 0.35, size: 0.5, sizeEnd: 1.4, life: 0.6, speed: 1.2, rise: 0.2 });
    }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    const p = player.pos;
    // the way the body (and so the blow) faces
    const facing = player.facing;
    const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    // the chop comes down in a vertical plane: from above the head to the ground in front
    slashArc({
      x: p.x, z: p.z, y: 1.55, facing, radius: (player.model.reach ?? 2) + 0.2, arc: 2.0, roll: Math.PI / 2, pitch: -0.3, dir: -1,
      color: def.color, sweep: (player.casting?.dur ?? 1.5) * 0.07, fade: 0.3,
    });
    const c = new THREE.Vector3(p.x + dir.x * 2.2, 0, p.z + dir.z * 2.2);
    shockwave(c, { color: def.color, intensity: 2.5, from: 0.3, to: 3.2, life: 0.45 });
    shockwave(c, { color: 0xffffff, intensity: 1.2, from: 0.2, to: 2, life: 0.3 });
    groundFlash(c, { color: def.color, intensity: 1.6, radius: 2.4, life: 0.35 });
    crackDecal(c, { size: 3.6, color: 0xffa050, intensity: 1.8, life: 3 });
    decal(c, { type: 'scorch', size: 2.6, life: 7 });
    debris(c, { count: 30, speed: 8 });
    smokePuff(c, { count: 12, color: 0x2a241c, size: 1.2, sizeEnd: 3.4, speed: 3 });
    flash({ color: def.color, intensity: 26, distance: 10, life: 0.4, pos: { x: c.x, y: 1.2, z: c.z } });
    addShake(0.75);
    sfx.slam(); sfx.clang();
    sweep(player, def, facing, { knock: def.knock });
  },
};

export default skill;
