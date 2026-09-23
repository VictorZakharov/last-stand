// Healing Draught.
import { particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { sfx } from '../../core/audio';
import type { InstantSkill, Needs } from './types';
import type { SkillDef } from '../../types';
import { rand } from '../../util';

const skill: InstantSkill = {
  anim: null,
  cast(player, rawDef) {
    const def = rawDef as Needs<'healPct'>;
    player.heal(player.stats.maxLife * def.healPct);
    sfx.potion();
    flash({ color: 0xff5050, intensity: 15, distance: 6, life: 0.6, follow: player.obj });
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.3, 0.8);
      particles.glow.spawn({
        x: player.pos.x + Math.cos(a) * r, y: rand(0.1, 1.5), z: player.pos.z + Math.sin(a) * r,
        vx: -Math.sin(a) * 1.5, vy: rand(1.5, 3), vz: Math.cos(a) * 1.5,
        life: rand(0.5, 1), size: rand(0.1, 0.25), sizeEnd: 0, color: col(i % 4 ? 0xff4040 : 0xffd080, 2.5), colorEnd: col(0x600010, 0.5), drag: 1.5,
      });
    }
  },
};

export default skill;
