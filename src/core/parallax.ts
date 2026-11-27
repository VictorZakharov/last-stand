// The floors' relief (parallax occlusion): the floor's height, kept in its roughness map's red channel (core/pbr.ts),
// read along the view ray, so the grout between the crypt's cobbles and the soil round the forest's pebbles and leaves
// lie sunk below their tops and shift against them as the view moves. Only the hollows sink: the tops stay at the
// floor's own level, where everything on the floor stands (feet, arrows, marks). The steps a ray takes are a uniform the
// quality preset sets (none on Low), so switching presets compiles nothing. The walk is the engine's looks'
// (engine/looks/relief.ts), told the floor's relief and the steps.
import type { LitMaterial } from '../engine/api/index.ts';

/** How a floor's relief lies. */
export interface FloorRelief {
  /** m: how far its lowest point lies under its tops */
  depth: number;
  /** its maps' tiles a metre over the floor (their repeat over the floor's span), u along x and v along -z */
  perMetre: number;
  /** m from the camera: the relief fades out up to here (too fine to see that far, and the steps cost the same) */
  fade: number;
}

/** the most steps down the view ray (looking straight down it takes half) */
const steps = { value: 16 };

/** The quality preset's steps (0: no relief). */
export function setReliefSteps(n: number): void {
  steps.value = n;
}

/** The steps a ray takes now (the Rust engine's looks are told them: engine/looks/relief.ts). */
export const reliefStepsNow = (): number => steps.value;

/**
 * A floor's relief, as three's WebGPU build took it (its maps read where the view ray meets the relief, set as the
 * material's build context): the engine's floor looks read the relief they're given instead (engine/looks/relief.ts).
 * Kept for its callers (world/crypt.ts, world/forest.ts): it sets nothing.
 */
export function reliefContext(_material: LitMaterial, _relief: FloorRelief): void {}
