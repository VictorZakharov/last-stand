// Contract for skill behaviors. Class data (SkillDef) references an impl by name.
import type * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { CastAnim, SkillDef } from '../../types';

interface SkillBase {
  anim: CastAnim;
  /** Meshes using the skill's own materials, compiled at load so the first cast doesn't hitch. */
  warm?(): THREE.Object3D[];
}

/** Fires once when the cast completes. */
export interface InstantSkill extends SkillBase {
  channel?: false;
  cast(player: Player, def: SkillDef, target: THREE.Vector3): void;
}

/** Runs every frame while its key is held. `start` returns per-channel state. */
export interface ChannelSkill<S = unknown> extends SkillBase {
  channel: true;
  start(player: Player, def: SkillDef): S;
  tick(player: Player, def: SkillDef, dt: number, state: S): void;
  stop(player: Player, def: SkillDef, state: S): void;
}

export type SkillImpl = InstantSkill | ChannelSkill<any>;

/** A SkillDef whose listed tuning fields are required (skills narrow their def with this). */
export type Needs<K extends keyof SkillDef> = SkillDef & Required<Pick<SkillDef, K>>;
