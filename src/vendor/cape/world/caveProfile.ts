// Shim replacing cape-physics' cave world with the Last Stand arena.
// The solver only queries floor height, ceiling and horizontal wall bounds;
// the arena has a (tiered) floor and no walls/ceiling within reach of the cape.
import type { CaveHorizontalBounds } from './CaveShellSampler';

let groundHeightFn: (x: number, z: number) => number = () => 0;

/** Called once by the game to connect the cape solver to the arena floor. */
export function configureCapeEnvironment(opts: { groundHeight: (x: number, z: number) => number }): void {
  groundHeightFn = opts.groundHeight;
}

export const CAVE_SHELL_CONTACT_SKIN = 0.002;

export function caveGroundHeightAt(x: number, z: number): number {
  return groundHeightFn(x, z);
}

export function floorHeightAt(x: number, z: number): number {
  return groundHeightFn(x, z);
}

export function caveCeiling(_z: number): number {
  return 1e4;
}

export function caveInteriorBoundsAtHeight(
  _y: number,
  _z: number,
  _clearance: number,
  target: CaveHorizontalBounds,
): CaveHorizontalBounds {
  target.minimum = -1e4;
  target.maximum = 1e4;
  return target;
}
