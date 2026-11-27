// A kit material and its copies known as one: a skinned piece's own copy (models/shapes.ts `Sculpt.build`), a worn
// item's (core/materials.ts `kitCopy`), a hand's (models/hands.ts). Each kit material's hood's shade
// (`kitLooks.shade`) is made once for it and shared by every copy (`sameLooks`, `ownAura`), so it says which
// original a copy was made from. (Under three the shader patch they shared, `onBeforeCompile`, said so.)
import type { Material } from '../../engine/api/index.ts';
import type { KitLooks } from '../../core/materials';

/** The kit material's own mark `material` carries, its original's or its own (none: not a kit's). */
export const kitMarkOf = (material: Material): object | undefined =>
  (material as { kitLooks?: KitLooks }).kitLooks?.shade;

/** Whether `a` and `b` are one kit material or copies of one. */
export function sameKitMaterial(a: Material, b: Material): boolean {
  if (a === b) return true;
  const mark = kitMarkOf(a);
  return mark !== undefined && mark === kitMarkOf(b);
}
