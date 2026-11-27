// The forest's light and how its grass sways: foliage.ts's shafts of light as a look material drawn by its look
// alone, and the grass's sway (forest.ts's `windInGrass`), each WGSL in engine/looks/forest.ts.
import { AdditiveBlending, Color, DoubleSide, LookMaterial } from '../engine/api/index.ts';
import { rustLook } from '../engine/custom';
import { shaftsLook } from '../engine/looks/forest';

/** How the grass sways (`windInGrass`'s numbers): its rate, and how far a tuft's top moves. */
export interface Sway { rate: number; reach: number }

/** The shafts of light (`lightShafts` in foliage.ts): brightest along their axis as seen from the camera, faded in
 *  below the canopy and out at the ground, slow motes of dust drifting through, added. `time` is a `{ value }`. */
export function shaftsMaterial(time: { value: number }, color: Color): LookMaterial {
  const material = new LookMaterial({
    uniforms: { uTime: time, uColor: { value: color } },
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
  });
  return rustLook(material, shaftsLook(time, color));
}
