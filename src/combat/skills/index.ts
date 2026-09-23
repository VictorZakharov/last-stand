// Skill behavior registry. Class data files reference these by `impl` name.
//
// Instant skill:  { anim, cast(player, def, target) }
// Channel skill:  { anim, start(player, def, state), tick(player, def, dt, state), stop(player, def, state) }
// `anim` selects the caster pose ('cast' | 'slam' | 'buff' | 'channel' | null).
import splinterBolt from './splinterBolt';
import starfall from './starfall';
import voidLance from './voidLance';
import glacialNova from './glacialNova';
import maelstrom from './maelstrom';
import aegis from './aegis';
import potion from './potion';

import type { SkillImpl } from './types';

export const SKILL_IMPLS: Record<string, SkillImpl> = { splinterBolt, starfall, voidLance, glacialNova, maelstrom, aegis, potion };
