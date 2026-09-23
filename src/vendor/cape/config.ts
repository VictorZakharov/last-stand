// Adapted from cape-physics/src/config.ts for Last Stand.
// CAPE values are unchanged. CAVE extents are effectively infinite (the arena
// has no cave walls) and PLAYER speeds match the Mage.
export const PHYSICS_STEP = 1 / 120;
export const MAX_FRAME_DELTA = 1 / 20;
export const MAX_PHYSICS_STEPS = 6;
export const CAMERA_NEAR_OPACITY = 0.12;

export const CAVE = {
  startZ: 1e4,
  endZ: -1e4,
  segments: 96,
  radialSegments: 36,
} as const;

export const PLAYER = {
  radius: 0.45,
  height: 2.0,
  footOffset: 0.14,
  walkSpeed: 3.4,
  runSpeed: 6.4,
  jumpSpeed: 5.2,
  gravity: 14.5,
  acceleration: 15,
  deceleration: 19,
  turnResponse: 9,
  walkTurnRate: 2.4,
  runTurnRate: 4.8,
} as const;

export const CAPE = {
  columns: 13,
  rows: 18,
  width: 0.98,
  length: 1.68,
  widthRange: { min: 0.72, max: 1.3, step: 0.01 },
  lengthRange: { min: 1.2, max: 2.05, step: 0.01 },
  solverIterations: 10,
  attachment: {
    halfWidth: 0.105,
    height: 1.525,
    depth: 0.092,
    necklineRise: 0.015,
    necklineDepth: 0.02,
  },
} as const;

export const RIPPLE_CAPACITY = 16;
