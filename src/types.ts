// Shared domain types. Data files (src/data) are typed against these, and the
// systems consume them, so adding a class / enemy / skill is type-checked.
import type * as THREE from 'three';
import type { createKit } from './core/materials';
import type { Joints } from './entities/models/rig';
import type { BiomeId } from './data/biomes';

// ---------------------------------------------------------------------------
// Damage & stats

export type DamageType = 'arcane' | 'cold' | 'fire' | 'lightning' | 'physical' | 'vitality';

/** Stats rolled on items (keys of data/items STATS). */
export type StatKey =
  | 'damagePct' | 'arcanePct' | 'elementalPct' | 'life' | 'energy' | 'lifeRegen' | 'energyRegen'
  | 'castSpeed' | 'cdr' | 'crit' | 'critDmg' | 'moveSpeed' | 'leech' | 'armor' | 'resist';

export type StatBlock = Partial<Record<StatKey, number>>;

/** Class base stats (before items). */
export interface BaseStats {
  life: number;
  energy: number;
  lifeRegen: number;
  energyRegen: number;
  moveSpeed: number;
  crit: number;
  critDmg: number;
  armor: number;
  resist: number;
}

/** Final derived character stats (base + items). */
export interface DerivedStats {
  maxLife: number;
  maxEnergy: number;
  lifeRegen: number;
  energyRegen: number;
  moveSpeed: number;
  crit: number;
  critDmg: number;
  armor: number;
  resist: number;
  damagePct: number;
  arcanePct: number;
  elementalPct: number;
  castSpeed: number;
  cdr: number;
  leech: number;
}

// ---------------------------------------------------------------------------
// Classes & skills

export type SkillKey = 'mouse0' | 'mouse2' | '1' | '2' | '3' | '4' | 'q';
export type CastAnim = 'cast' | 'slam' | 'buff' | 'channel' | null;

/** Skill tuning data. Behavior-specific numbers are optional fields. */
export interface SkillDef {
  key: SkillKey;
  impl: string;
  name: string;
  desc: string;
  tags: string[];
  cost: number;
  cooldown: number;
  castTime: number;
  channel?: boolean;
  icon: { glyph: string; color: string };
  /** VFX colors */
  color?: number;
  trailEnd?: number;
  // behavior parameters (used by specific impls)
  damage?: number;
  missiles?: number;
  spread?: number;
  speed?: number;
  splitCount?: number;
  splitDamage?: number;
  range?: number;
  shards?: number;
  radius?: number;
  scatter?: number;
  chill?: number;
  length?: number;
  width?: number;
  moveMult?: number;
  freeze?: number;
  duration?: number;
  pull?: number;
  absorbPct?: number;
  healPct?: number;
}

export interface ClassDef {
  id: string;
  name: string;
  tagline: string;
  model: string;
  base: BaseStats;
  skills: SkillDef[];
  starterGear: { slot: Slot; rarity: RarityId; ilvl: number }[];
}

// ---------------------------------------------------------------------------
// Items

export type Slot = 'weapon' | 'offhand' | 'head' | 'chest' | 'hands' | 'amulet' | 'ring';
export type RarityId = 'common' | 'magic' | 'rare' | 'epic' | 'legendary';

export interface Item {
  id: string;
  slot: Slot;
  rarity: RarityId;
  ilvl: number;
  name: string;
  base: string;
  stats: StatBlock;
}

export interface Profile {
  classId: string;
  equipped: Partial<Record<Slot, Item>>;
  stash: Item[];
  /** bestWave: best wave cleared in any biome; bestBanked: per biome, the best wave whose spoils were banked
   *  (the lobby's starting-wave range) */
  records: { bestWave: number; bestBanked: Partial<Record<BiomeId, number>>; runs: number; banked: number; bestScore: number };
}

// ---------------------------------------------------------------------------
// Enemies

export type EnemyAIKind = 'melee' | 'ranged' | 'slam' | 'boss' | 'idle';

export interface EnemyDef {
  name: string;
  model: string;
  ai: EnemyAIKind;
  life: number;
  damage: number;
  damageType: DamageType;
  speed: number;
  radius: number;
  range: number;
  windup: number;
  recover: number;
  cooldown: number;
  cost: number;
  score: number;
  keepAway?: number;
  slamRadius?: number;
  projectile?: { speed: number; radius: number; color: number; trail?: number };
  /** boss colour: aura, slam telegraph and shockwaves, death flash */
  accent?: number;
  /** walk cycle speed per unit moved (default 2.3; small, skittering enemies use more) */
  gait?: number;
  summon?: string;
  knockbackResist?: number;
  freezeResist?: number;
  boss?: boolean;
  /** training dummy: never dies, meters the damage it takes instead */
  dummy?: boolean;
}

// ---------------------------------------------------------------------------
// Models & animation

export interface ActionState { name: string; t: number }

/** Per-frame input to a model's procedural animation. */
export interface AnimState {
  t: number;
  dt: number;
  phase: number;
  move: number;
  moveDir?: number;
  lean?: number;
  action: ActionState | null;
  hit: number;
  /** -1 = alive, otherwise 0..1 death progress */
  dead: number;
  charge?: number;
  /** world-space velocity of the character (drives cloth inertia) */
  velocity?: THREE.Vector3;
}

export type MaterialKit = ReturnType<typeof createKit>;

export interface Model {
  root: THREE.Group;
  kit: MaterialKit;
  animate(st: AnimState): void;
  height: number;
  /** cast origin (staff tip / orb) */
  tip?: THREE.Object3D;
  /** offhand focus point */
  palm?: THREE.Object3D;
  /** skeleton, for humanoid models */
  joints?: Joints;
  /** objects simulated in world space (e.g. a cape) that the owner adds to the scene */
  worldObjects?: THREE.Object3D[];
  /** re-settle simulated parts after a teleport */
  reset?(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Misc

export interface XZ { x: number; z: number }
export interface XYZ { x: number; y: number; z: number }

/** Transient effect: return false from update() to be removed. */
export interface Effect {
  update(dt: number): boolean;
  dispose?(): void;
  cancel?(): void;
}

export interface Obstacle { x: number; z: number; r: number }
