// What the frame's watches of the materials and geometries in use know of each (`useWatch.ts`, #973): a material's
// parts are its textures, and it's polled where its look's numbers follow the game's uniforms or its see-through
// kind's flags the house rule; a geometry's parts are its attributes and its index, and none is polled.
import { Attribute, Geometry, type Texture } from './api/index.ts';
import { lookOf } from './custom';
import type { AnyMaterial } from './materials';
import { UseWatch } from './useWatch';

/** Whether `material` is looked at every frame: a look of its own, the kit's, or a see-through kind. */
function polledEachFrame(material: AnyMaterial): boolean {
  if (lookOf(material) || (material as { kitLooks?: unknown }).kitLooks) return true;
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
