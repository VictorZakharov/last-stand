// What the frame's watches of the materials and geometries in use know of each (`useWatch.ts`, #973): a material's
// parts are its textures, and it's polled where its look's numbers follow the game's uniforms or its see-through
// kind's flags the house rule; a geometry's parts are its attributes and its index, and none is polled.
import { Attribute, Geometry, type Texture } from './api/index.ts';
import { lookOf } from './custom';
import type { AnyMaterial } from './materials';
import { UseWatch } from './useWatch';
import type { KitLooks } from '../core/materials';

/**
 * Whether a kit's `material` has numbers of its own that move as the game runs: a fur's sway (its clock, its lag)
 * or a worn item's glow (its clock). The kit's flash, dissolve, frost and char are its thing's (`ownNumbers.ts`),
 * and what else a kit's material shows (its glow's colour, its hood's shade, its hair's colour) is told as it's set
 * (`noteChanged`: `ItemGlows.set`, `shade` and `setHair` in models/head.ts). Every foe's material was asked every
 * frame whether these had moved: a third of a slowed CPU's render at wave 36.
 */
function kitMoves(material: AnyMaterial, looks: KitLooks): boolean {
  const fur = material.userData.fur as { lag?: { value?: { isVector3?: boolean } } } | undefined;
  if (fur?.lag?.value?.isVector3) return true;
  const aura = looks.aura.value;
  return aura.r + aura.g + aura.b > 0;
}

/** Whether `material` is looked at every frame: a look of its own whose numbers follow the game's, or a see-through
 *  kind's. */
function polledEachFrame(material: AnyMaterial): boolean {
  const looks = (material as { kitLooks?: KitLooks }).kitLooks;
  if (looks) return kitMoves(material, looks) || !!material.seeThrough;
  if (lookOf(material)) return true;
  return !!material.seeThrough;
}

/** The maps `material` draws with (`describe` in materials.ts reads these). */
function texturesOf(material: AnyMaterial): Texture[] {
  const maps = [
    material.map, material.alphaMap, material.normalMap, material.bumpMap,
    material.roughnessMap, material.metalnessMap, material.emissiveMap,
  ];
  return maps.filter((map): map is Texture => !!map);
}

/** A geometry's attributes and its index (`geometryStamp` in draws.ts reads their versions). */
function attributesOf(geometry: Geometry): Attribute[] {
  const parts: Attribute[] = Object.values(geometry.attributes);
  if (geometry.index) parts.push(geometry.index);
  return parts;
}

/** A watch of the materials in use. */
export const watchMaterials = (): UseWatch<AnyMaterial, Texture> =>
  new UseWatch({ polled: polledEachFrame, partsOf: texturesOf });

/** A watch of the geometries in use. */
export const watchGeometries = (): UseWatch<Geometry, Attribute> =>
  new UseWatch({ polled: () => false, partsOf: attributesOf });
