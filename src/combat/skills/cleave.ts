// Rending Cleave: a wide melee sweep in front of the caster that restores energy per hit.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { particles, col } from '../../fx/particles';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { slashArc, slashMaterial, angleBetween } from './slash';
import type { InstantSkill, Needs } from './types';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock' | 'color'>;

/** Sparks where the blade bites. */
export function sparks(x: number, y: number, z: number, color: THREE.ColorRepresentation, n = 10): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(3, 8);
    particles.glow.spawn({
      x, y, z, vx: Math.cos(a) * s, vy: rand(1, 5), vz: Math.sin(a) * s,
      life: rand(0.2, 0.45), size: rand(0.05, 0.12), sizeEnd: 0, color: col(color, 3), colorEnd: col(0xff5010, 0.4), gravity: 14, drag: 2,
    });
  }
}

/** The trail of the swing the model is playing, through the weapon's tip: the tip crosses the arc from
 *  the cast's landing (0.55) to 0.85 of the cast time (see models/warrior.ts), at its current height. */
export function swingArc(player: Player, arc: number): { radius: number; y: number; arc: number; dir: number; sweep: number } {
  const tip = player.castPoint, p = player.pos;
  return {
    radius: Math.max(1.2, Math.hypot(tip.x - p.x, tip.z - p.z) + 0.15), y: tip.y - 0.05,
    arc, dir: player.model.swing ?? 1, sweep: (player.casting?.dur ?? 0.42) * 0.3,
  };
}

/** Hit every enemy within `range` and half of `arc` of `facing` around the player. */
export function sweep(player: Player, def: Needs<'damage' | 'range' | 'arc'>, facing: number, opts: { knock?: number; type?: 'physical' | 'fire' | 'lightning' } = {}): number {
  let hits = 0;
  const p = player.pos;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > def.range + e.radius) continue;
    if (d > e.radius + 0.6 && angleBetween(Math.atan2(dx, dz), facing) > def.arc / 2) continue;
    hitEnemy(e, def.damage, { tags: def.tags, type: opts.type ?? 'physical', knock: opts.knock, from: p });
    sparks(e.pos.x, e.height * 0.55, e.pos.z, 0xffd9a0, 8);
    hits++;
  }
  return hits;
}

const skill: InstantSkill = {
  anim: 'swing',
  warm: () => [new THREE.Mesh(new THREE.RingGeometry(0.3, 1, 8), slashMaterial(0xffffff))],
  cast(player, rawDef) {
    const def = rawDef as Def;
    // the way the body (and so the swing) faces, which turned to the target during the cast
    const facing = player.facing;
    slashArc({ x: player.pos.x, z: player.pos.z, facing, ...swingArc(player, def.arc), color: def.color });
    sfx.swing();
    const hits = sweep(player, def, facing, { knock: def.knock });
    if (hits) {
      sfx.clang();
      addShake(0.08);
      if (!player.sandbox) player.energy = Math.min(player.stats.maxEnergy, player.energy + (def.gain ?? 0) * hits);
    }
  },
};

export default skill;
