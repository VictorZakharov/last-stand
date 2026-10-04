// Contract for skill behaviors. Class data (SkillDef) references an impl by name.
import type * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { ActionState, CastAnim, SkillDef } from '../../types';

interface SkillBase {
  anim: CastAnim;
  /** Meshes using the skill's own materials, compiled at load so the first cast doesn't hitch. */
  warm?(): THREE.Object3D[];
}

/** Fires once when the cast completes. */
export interface InstantSkill extends SkillBase {
  channel?: false;
  /** `power`: how far a drawn shot (`SkillDef.draw`) was drawn when it was loosed (0..1, 1 for any other cast) */
  cast(player: Player, def: SkillDef, target: THREE.Vector3, power: number): void;
  /** every frame of the cast before it lands; k: 0..1 of the cast time (a drawn shot: how far it is drawn) */
  charging?(player: Player, def: SkillDef, k: number, dt: number): void;
  /** a shot's angle above level (rad) at `power` for `target`, which the pose aims the arrow along */
  pitch?(player: Player, def: SkillDef, power: number, target: THREE.Vector3): number;
  /** whether there is anything to cast it at (a mark needs a foe): if not, the press does nothing and costs nothing */
  canCast?(player: Player, def: SkillDef, target: THREE.Vector3): boolean;
}

/** Runs every frame while its key is held. `start` returns per-channel state. */
export interface ChannelSkill<S = unknown> extends SkillBase {
  channel: true;
  start(player: Player, def: SkillDef): S;
  tick(player: Player, def: SkillDef, dt: number, state: S): void;
  stop(player: Player, def: SkillDef, state: S): void;
  /** fills in the pose's action each frame (a bow's channel: its draw, its loose and where it aims, as a shot's) */
  pose?(player: Player, def: SkillDef, state: S, action: ActionState): void;
}

export type SkillImpl = InstantSkill | ChannelSkill<any>;

/** A SkillDef whose listed tuning fields are required (skills narrow their def with this). */
export type Needs<K extends keyof SkillDef> = SkillDef & Required<Pick<SkillDef, K>>;
