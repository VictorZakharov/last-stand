// What every generator ends with: the numbers it pushed made a geometry, each a `Float32Array` (three's
// `Float32BufferAttribute`), the index 16-bit unless it needs 32.
import { Geometry, floats } from '../geometry/index.ts';

/** A generator's numbers: its index (or none) and its attributes in the order three sets them. */
export interface Built {
  /** the index, or null: unindexed */
  index: number[] | null;
  /** each attribute's name, numbers and numbers an item, in three's order */
  attributes: [name: string, values: number[], itemSize: number][];
}

/** The geometry of `built`. */
export function geometryOf(built: Built): Geometry {
  const geometry = new Geometry();
  if (built.index) geometry.setIndex(built.index);
  for (const [name, values, itemSize] of built.attributes) geometry.setAttribute(name, floats(values, itemSize));
  return geometry;
}

/** The usual three: positions, normals and uvs, indexed. */
export function meshOf(index: number[], positions: number[], normals: number[], uvs: number[]): Geometry {
  return geometryOf({ index, attributes: [['position', positions, 3], ['normal', normals, 3], ['uv', uvs, 2]] });
}
