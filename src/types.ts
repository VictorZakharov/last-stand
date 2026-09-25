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
  | 'castSpeed' | 'cdr' | 'crit' | 'critDmg' | 'moveSpeed' | 'leech' | 'armor' | 'resist' | 'block' | 'blockAmount';

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
  /** % chance to block a hit (shields), and the damage a block absorbs */
  block: number;
  blockAmount: number;
}

// ---------------------------------------------------------------------------
// Classes & skills

export type SkillKey = 'mouse0' | 'mouse2' | '1' | '2' | '3' | '4' | 'q';
/** pose a model plays while the skill casts; a class's model interprets each name in its own way */
export type CastAnim = 'cast' | 'slam' | 'buff' | 'channel' | 'swing' | 'charge' | 'chop' | 'spin' | 'block' | 'stagger' | 'flurry' | null;

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
  /** area damage at `radius`, as a share of a direct hit (eased in between) */
  edge?: number;
  chill?: number;
  length?: number;
  width?: number;
  moveMult?: number;
  freeze?: number;
  duration?: number;
  pull?: number;
  absorbPct?: number;
  healPct?: number;
  /** melee arc in radians */
  arc?: number;
  knock?: number;
  /** energy restored per enemy hit */
  gain?: number;
  /** when the cast lands, as a fraction of the cast time (default 0.55) */
  fireAt?: number;
  /** Raise Shield: blocks absorb this many times the block amount */
  block?: number;
  /** only works with a shield, a two-handed weapon or a weapon in each hand; otherwise the key uses the fallback for the gear held */
  needs?: 'shield' | 'twoHanded' | 'dual';
  fallback?: { shield?: string; twoHanded?: string; dual?: string; oneHanded?: string };
}

export interface ClassDef {
  id: string;
  name: string;
  tagline: string;
  model: string;
  /** CSS colour of the class name in the lobby */
  accent: string;
  /** title of the lobby's skill loadout panel */
  book: string;
  /** the light that follows the cast point, and the motes drifting off the off-hand (if any) */
  aura: { light: number; intensity: number; motes?: [color: number, end: number] };
  base: BaseStats;
  skills: SkillDef[];
  starterGear: { slot: Slot; rarity: RarityId; ilvl: number }[];
  /** item base names per slot (default: data/items SLOT_INFO) */
  bases?: Partial<Record<Slot, string[]>>;
  /** stats that never roll on this class's items (no skill of the class uses them) */
  excludeStats?: StatKey[];
  /** implicit stats per slot, replacing the defaults (data/items SLOT_INFO) */
  implicits?: Partial<Record<Slot, [StatKey, number][]>>;
  /** weapon bases held in both hands: they leave no room for an off-hand */
  twoHanded?: string[];
  /** a one-handed weapon can go in the off-hand too */
  dualWield?: boolean;
}

/** What the character holds, derived from the equipped items (drives model and skills). */
export interface Gear { weapon: string | null; twoHanded: boolean; shield: boolean; /** a weapon held in the off-hand */ offWeapon: string | null }

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

/** One class's saved progress: every class keeps its own gear, stash and records. */
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
  /** glow scales the bolt's brightness (default 1) and core its visible size as a fraction of radius (default
   *  0.7); pale colours bloom far more than deep ones, and a boss fires a dozen at once */
  /** `look: 'spore'`: a swirling spore orb trailing spores and smoke (`trail` is the smoke's colour) instead of a glowing bolt */
  projectile?: { speed: number; radius: number; color: number; trail?: number; glow?: number; core?: number; look?: 'spore' };
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
  /** 1 at the moment a shield blocks a hit, fading out over a quarter second */
  blockHit?: number;
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
  /** show the equipped weapon / shield */
  setGear?(gear: Gear): void;
  /** direction of the current melee swing: +1 sweeps right to left, -1 left to right */
  readonly swing?: number;
  /** distance from the body to the weapon's tip */
  readonly reach?: number;
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
