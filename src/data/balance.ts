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
export const BLOCK = { recovery: 0.7, arc: 1.4, guardBreak: 1.5 };
