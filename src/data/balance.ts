// Global tuning knobs. Class/enemy/item specifics live in their own data files.
import type { DamageType } from '../types';

export const CAMERA = {
  fov: 38,
  distance: 30,        // units from focus point
  pitch: 1.08,         // radians above the horizon at default zoom (steep, top-down ARPG view)
  closePitch: 0.62,    // pitch when fully zoomed in (more cinematic)
  follow: 7,           // follow stiffness
  minZoom: 0.22,
  lobbyZoom: 0.45,     // closer view while in the lobby
  maxZoom: 1.7,
  zoomStep: 1.12,      // multiplicative zoom per mouse-wheel notch
  orbitSpeed: 0.006,   // radians of camera yaw per pixel of middle-drag
  // the close views (V cycles top-down, third person, first person): mouse look, aim at the crosshair
  lookSpeed: 0.0025,   // radians per pixel of mouse movement
  third: { fov: 55, boom: 4.6, minBoom: 2.4, maxBoom: 8, side: 0.55, pitch: 0.28, minPitch: -0.45, maxPitch: 1.2 },
  first: { fov: 66, pitch: 0.1, minPitch: -1.2, maxPitch: 1.3 },
  switchTime: 0.45,    // seconds to glide from one view to the next
  aimRange: 24,        // how far ahead the crosshair aims when it points above the floor
};

export const ARENA = {
  radius: 26.6,        // walkable radius (wall inner face is at ~28.3)
  daisHalf: 5.2,       // half-size of the raised central dais
  daisHeight: 0.35,
};

export const LOBBY = {
  /** training dummy positions (x, z), in front of the spawn point */
  dummies: [[-2.8, -4], [0, -4.6], [2.8, -4]] as const,
};

// Damage type colors used by VFX and floating numbers.
export const DAMAGE_COLORS: Record<DamageType, number> = {
  arcane: 0x5dffa8,
  cold: 0x8fd8ff,
  fire: 0xff8a3c,
  lightning: 0x9fb2ff,
  physical: 0xffffff,
  vitality: 0xd060ff,
};
/** A hit's number by its type: arcane is the mage's plain damage, white as the others' physical is (green, his
 *  numbers read as something other than a hit); the elements keep their colours. */
export const NUMBER_COLORS: Record<DamageType, number> = { ...DAMAGE_COLORS, arcane: 0xffffff };

export const RUN = {
  countdown: 3.5,             // seconds before each wave starts
  healOnContinue: 0.25,       // fraction of max health restored when continuing
  energyOnContinue: 1.0,      // fraction of max energy restored when continuing
  bagLimit: 60,               // stash capacity
  scorePerKill: 10,
  multiplierMax: 5,
  multiplierDecay: 4.5,       // seconds without a kill before the multiplier drops a step
  killsPerMultiplier: 12,
};

/** Shield block: after a block the shield needs `recovery` seconds before it can block again.
 *  Raised, it blocks every hit within `arc` radians of the facing with no recovery, until a hit
 *  bigger than it can hold breaks the guard: the character staggers for `guardBreak` seconds, able
 *  to move but not to block, attack or cast. */
/** a drawn shot counts as drawn to full from this share of its draw's time: its arrowhead glints, the crosshair is
 *  bold, and Lancewood Shot strikes harder */
export const FULL_DRAW = 0.98;

export const BLOCK = { recovery: 0.7, arc: 1.4, guardBreak: 1.5 };

/** Co-op: party size, reviving a downed teammate, and how much more the arena throws at a party. */
export const COOP = {
  maxPlayers: 2,
  /** seconds a downed player lasts before bleeding out (the clock stops while a teammate raises them), and a
   *  teammate's hold (E) to raise them */
  bleedOut: 25,
  reviveTime: 2.3,
  /** how close the teammate must stand (m), the health they get back, and a moment untouchable */
  reviveRange: 2.4,
  reviveLife: 0.35,
  reviveGuard: 1.5,
  /** per player beyond the first: more foes in a wave, and more life on each */
  budgetPerPlayer: 0.6,
  lifePerPlayer: 0.35,
  /** state updates sent per second */
  sendRate: 20,
};

/** How a kill throws its body (combat/fling.ts): the speed any kill gives it (m/s, enough to topple it) and the most
 *  the overkill adds, at an overkill of `full` times its life, rising by its share to the power `curve` (the first
 *  share of a life adds the most); a foe's `knockbackResist` takes `stand` of it away and a boss keeps `boss` of it;
 *  how much of the drive goes up, and where on the body a blow lands (0 the feet, 1 the top), when a skill doesn't say. */
export const FLING = { base: 1.6, most: 10, full: 1.5, curve: 0.6, stand: 0.6, boss: 0.35, lift: 0.3, at: 0.6 };
