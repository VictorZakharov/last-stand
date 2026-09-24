// Twin Fangs: a weapon in each hand. An instant lunge at the aim and two quick crossing strikes, right
// then left, each hitting hard in a narrow arc in front.
import * as THREE from 'three';
import { schedule } from '../../core/timers';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { slashArc, slashMaterial } from './slash';
import { sweep, swingArc } from './cleave';
import type { InstantSkill, Needs } from './types';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'arc' | 'color'>;

/** the lunge: seconds, and how far short of the aim it stops (the strikes reach the rest) */
const LUNGE = 0.3, SHORT = 1.3, MAX_LUNGE = 2.2;
/** when the two blades cross the target, into the lunge (in step with the model's 'flurry') */
const STRIKES = [0.09, 0.21];

function strike(player: Player, def: Def, i: number): void {
  if (!player.alive) return;
  const facing = player.facing, p = player.pos;
  // the right blade cuts down from high on the right, the left one mirrors it: the trails cross in an X
  const s = i === 0 ? 1 : -1;
  slashArc({
    x: p.x, z: p.z, facing, ...swingArc(player, def.arc), y: 1.15, dir: s, roll: s * 0.55, pitch: -0.15,
    color: def.color, sweep: 0.07, fade: 0.2,
  });
  sfx.swing();
  if (sweep(player, def, facing, { knock: 1.2 })) { sfx.clang(); addShake(0.1 + i * 0.05); }
}

const skill: InstantSkill = {
  anim: 'flurry',
  warm: () => [new THREE.Mesh(new THREE.RingGeometry(0.3, 1, 8), slashMaterial(0xffffff))],
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const p = player.pos;
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    const dir = d > 1e-3 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    // closes in on the aim, but never runs past it
    const lunge = Math.min(MAX_LUNGE, Math.max(0, d - SHORT));
    player.startDash(dir, lunge / LUNGE, LUNGE, { anim: 'flurry' });
    STRIKES.forEach((at, i) => schedule(at, () => strike(player, def, i)));
  },
};

export default skill;
