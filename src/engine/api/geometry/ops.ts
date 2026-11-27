// What's done to whole geometries: several merged into one (three's `mergeGeometries`), vertices alike welded into
// one (`mergeVertices`), an indexed geometry laid out a vertex a corner (`toNonIndexed`).
import { Attribute, InstancedAttribute, sameKind } from './attribute.ts';
import type { TypedArray } from './attribute.ts';
import { Geometry } from './geometry.ts';

/** The same names, in any order. */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name) => b.includes(name));
}

/** `attributes` end to end in one, of the first one's kind; they must agree in kind, size and normalization. */
function joined(name: string, attributes: readonly Attribute[]): Attribute {
  const first = attributes[0];
  let length = 0;
  for (const attribute of attributes) {
    const alike = attribute.array.constructor === first.array.constructor
      && attribute.itemSize === first.itemSize
      && attribute.normalized === first.normalized;
    if (!alike) throw new Error(`merge: the attribute '${name}' differs in kind, size or normalization`);
    length += attribute.count * attribute.itemSize;
  }
  const array = sameKind(first.array, length);
  let offset = 0;
  for (const attribute of attributes) {
    array.set(attribute.array, offset);
    offset += attribute.count * attribute.itemSize;
  }
  return new Attribute(array, first.itemSize, first.normalized);
}

/**
 * One geometry of all of `geometries`, their vertices end to end and their indices moved past those before; with
 * `useGroups`, a group a geometry (its materialIndex its place in the list). All must be indexed or none, with the
 * same attributes. Follows three's `BufferGeometryUtils.mergeGeometries` (three.js, MIT, 0.187.0); where three
 * logs and returns null, this throws.
 */
export function merge(geometries: readonly Geometry[], useGroups = false): Geometry {
  const first = geometries[0];
  const indexed = first.index !== null;
  const names = Object.keys(first.attributes);
  const merged = new Geometry();
  let offset = 0;
  geometries.forEach((geometry, i) => {
    if (indexed !== (geometry.index !== null)) throw new Error(`merge: geometry ${i} differs in having an index`);
    if (!sameNames(names, Object.keys(geometry.attributes))) {
      throw new Error(`merge: geometry ${i} has other attributes than the first`);
    }
    if (!useGroups) return;
    const count = geometry.index ? geometry.index.count : geometry.getAttribute('position')?.count;
    if (count === undefined) throw new Error(`merge: geometry ${i} has neither an index nor positions`);
    merged.addGroup(offset, count, i);
    offset += count;
  });
  if (indexed) {
    const values: number[] = [];
    let base = 0;
    for (const geometry of geometries) {
      const index = geometry.index as Attribute;
      for (let j = 0; j < index.count; j++) values.push(index.getX(j) + base);
      base += geometry.attributes.position.count;
    }
    merged.setIndex(values);
  }
  for (const name of names) merged.setAttribute(name, joined(name, geometries.map((g) => g.attributes[name])));
  return merged;
}

/** `attribute` read at `sources`' vertices in turn: a new one of the same kind, size, usage and step. */
function remapped(attribute: Attribute, sources: readonly number[]): Attribute {
  const size = attribute.itemSize;
  const array = sameKind(attribute.array, sources.length * size);
  for (let i = 0; i < sources.length; i++) {
    for (let j = 0; j < size; j++) array[i * size + j] = attribute.array[sources[i] * size + j];
  }
  const made = attribute instanceof InstancedAttribute
    ? new InstancedAttribute(array, size, attribute.normalized, attribute.meshPerAttribute)
    : new Attribute(array, size, attribute.normalized);
  made.setUsage(attribute.usage);
  made.name = attribute.name;
  return made;
}

/** The getters of an item's numbers in turn. */
const READS = ['getX', 'getY', 'getZ', 'getW'] as const;

/**
 * `geometry` with the vertices alike in every attribute (to within `tolerance`) made one, and indexed: each kept
 * where it's first met, the rest pointing at it. Follows three's `BufferGeometryUtils.mergeVertices` (three.js,
 * MIT, 0.187.0): the same rounding of each number into a key, so the same vertices are welded.
 */
export function weld(geometry: Geometry, tolerance = 1e-4): Geometry {
  const step = Math.max(tolerance, Number.EPSILON);
  const multiplier = Math.pow(10, Math.log10(1 / step));
  const additive = step * 0.5 * multiplier;
  const index = geometry.getIndex();
  const position = geometry.attributes.position;
  const corners = index ? index.count : position.count;
  const attributes = Object.values(geometry.attributes);
  const firstOf = new Map<string, number>();
  const sources: number[] = [];
  const welded: number[] = [];
  for (let i = 0; i < corners; i++) {
    const vertex = index ? index.getX(i) : i;
    let key = '';
    for (const attribute of attributes) {
      for (let k = 0; k < attribute.itemSize; k++) {
        key += `${Math.trunc(attribute[READS[k]](vertex) * multiplier + additive)},`;
      }
    }
    const known = firstOf.get(key);
    if (known !== undefined) {
      welded.push(known);
      continue;
    }
    firstOf.set(key, sources.length);
    welded.push(sources.length);
    sources.push(vertex);
  }
  const result = geometry.clone();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    result.setAttribute(name, remapped(attribute, sources));
  }
  return result.setIndex(welded);
}

/** `attribute` read at each of `indices` in turn: a plain attribute of the same kind and normalization. */
function laidOut(attribute: Attribute, indices: TypedArray): Attribute {
  const size = attribute.itemSize;
  const array = sameKind(attribute.array, indices.length * size);
  let at = 0;
  for (const vertex of indices) {
    for (let j = 0; j < size; j++) array[at++] = attribute.array[vertex * size + j];
  }
  return new Attribute(array, size, attribute.normalized);
}

/**
 * `geometry` laid out a vertex a corner, no index: each triangle's vertices its own (its groups kept). Unindexed
 * already, it's given back as it is. Follows three's `BufferGeometry.toNonIndexed` (three.js, MIT, 0.187.0).
 */
export function unindexed(geometry: Geometry): Geometry {
  if (geometry.index === null) return geometry;
  const indices = geometry.index.array;
  const result = new Geometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    result.setAttribute(name, laidOut(attribute, indices));
  }
  for (const group of geometry.groups) result.addGroup(group.start, group.count, group.materialIndex);
  return result;
}

