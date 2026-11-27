// A geometry's attribute: a typed array read as items of `itemSize` numbers (three's `BufferAttribute`), and the
// instanced one a draw steps through once an instance (`InstancedAttribute`). Its `version` moves when it's told it
// changed (`needsUpdate = true`): what the stage reads to send it again, the whole or the ranges it was told.
import type { Mat3, Mat4 } from '../math/index.ts';
import { Vec3 } from '../math/index.ts';

/** every typed array an attribute may hold */
export type TypedArray =
  | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array
  | Int32Array | Uint32Array | Float32Array | Float64Array;

/** a stretch of an attribute's array told changed: `start` and `count` in numbers, not items */
export interface UpdateRange {
  /** the first number changed */
  start: number;
  /** how many numbers from it */
  count: number;
}

/** three's `StaticDrawUsage`: written once, drawn many times (`material/constants.ts` names the others) */
export const STATIC_DRAW_USAGE = 35044;

const scratchVector = new Vec3();

/** A typed array of the same kind as `like`, `length` long (zeroed). */
export function sameKind<A extends TypedArray>(like: A, length: number): A {
  const kind = like.constructor as new (length: number) => A;
  return new kind(length);
}

/** A copy of `source`, of its own kind. */
export function copyOf<A extends TypedArray>(source: A): A {
  const copy = sameKind(source, source.length);
  copy.set(source);
  return copy;
}

/** What a stored integer is divided by to read it as a normalized number (three's `getNormalizationScale`). */
function normalizationScale(array: TypedArray): number {
  if (array instanceof Uint32Array) return 4294967295;
  if (array instanceof Uint16Array) return 65535;
  if (array instanceof Uint8Array || array instanceof Uint8ClampedArray) return 255;
  if (array instanceof Int32Array) return 2147483647;
  if (array instanceof Int16Array) return 32767;
  if (array instanceof Int8Array) return 127;
  return 1;
}

/** A geometry's attribute: `array` read as `count` items of `itemSize` numbers each. */
export class Attribute<A extends TypedArray = TypedArray> {
  /** a name of its own (three's), kept through `copy` and the ops */
  name = '';
  /** the numbers, item after item */
  array: A;
  /** numbers an item */
  itemSize: number;
  /** items */
  count: number;
  /** integers read as numbers from 0 to 1 (or -1 to 1, signed): each divided by its type's largest */
  normalized: boolean;
  /** how often it's rewritten (`material/constants.ts`'s usages, three's numbers) */
  usage = STATIC_DRAW_USAGE;
  /** the stretches told changed since the stage last sent it; none means the whole */
  updateRanges: UpdateRange[] = [];
  /** moves each time it's told it changed */
  version = 0;
  private scale: number;

  /** `array` as items of `itemSize` (a plain array is made a `Float32Array`, three's `Float32BufferAttribute`). */
  constructor(array: A | number[], itemSize: number, normalized = false) {
    this.array = (Array.isArray(array) ? new Float32Array(array) : array) as A;
    this.itemSize = itemSize;
    this.count = this.array.length / itemSize;
    this.normalized = normalized;
    this.scale = normalizationScale(this.array);
  }

  /** Told it changed: `true` moves `version`, so the stage sends it again. */
  set needsUpdate(value: boolean) {
    if (value) this.version++;
  }

  /** Says how often it's rewritten. */
  setUsage(usage: number): this {
    this.usage = usage;
    return this;
  }

  /** Tells the stage only this stretch changed (numbers, not items); several add up. */
  addUpdateRange(start: number, count: number): void {
    this.updateRanges.push({ start, count });
  }

  /** Forgets the stretches told so far. */
  clearUpdateRanges(): void {
    this.updateRanges.length = 0;
  }

  /** The `component`th number of item `index`, read as normalized if it is. */
  getComponent(index: number, component: number): number {
    return this.read(this.array[index * this.itemSize + component]);
  }

  /** Writes the `component`th number of item `index`. */
  setComponent(index: number, component: number, value: number): this {
    this.array[index * this.itemSize + component] = this.stored(value);
    return this;
  }

  /** Item `index`'s first number. */
  getX(index: number): number {
    return this.getComponent(index, 0);
  }

  /** Item `index`'s second number. */
  getY(index: number): number {
    return this.getComponent(index, 1);
  }

  /** Item `index`'s third number. */
  getZ(index: number): number {
    return this.getComponent(index, 2);
  }

  /** Item `index`'s fourth number. */
  getW(index: number): number {
    return this.getComponent(index, 3);
  }

  /** Writes item `index`'s first number. */
  setX(index: number, x: number): this {
    return this.setComponent(index, 0, x);
  }

  /** Writes item `index`'s second number. */
  setY(index: number, y: number): this {
    return this.setComponent(index, 1, y);
  }

  /** Writes item `index`'s third number. */
  setZ(index: number, z: number): this {
    return this.setComponent(index, 2, z);
  }

  /** Writes item `index`'s fourth number. */
  setW(index: number, fourth: number): this {
    return this.setComponent(index, 3, fourth);
  }

  /** Writes item `index`'s first two numbers. */
  setXY(index: number, x: number, y: number): this {
    const at = index * this.itemSize;
    this.array[at] = this.stored(x);
    this.array[at + 1] = this.stored(y);
    return this;
  }

  /** Writes item `index`'s first three numbers. */
  setXYZ(index: number, x: number, y: number, z: number): this {
    const at = index * this.itemSize;
    this.array[at] = this.stored(x);
    this.array[at + 1] = this.stored(y);
    this.array[at + 2] = this.stored(z);
    return this;
  }

  /** Writes item `index`'s four numbers. */
  setXYZW(index: number, x: number, y: number, z: number, fourth: number): this {
    const at = index * this.itemSize;
    this.array[at] = this.stored(x);
    this.array[at + 1] = this.stored(y);
    this.array[at + 2] = this.stored(z);
    this.array[at + 3] = this.stored(fourth);
    return this;
  }

  /** Writes `value` into the array from `offset` as it is (not normalized, as three's). */
  set(value: ArrayLike<number>, offset = 0): this {
    this.array.set(value, offset);
    return this;
  }

  /** Copies item `from` of `source` into item `index`. */
  copyAt(index: number, source: Attribute, from: number): this {
    const at = index * this.itemSize;
    const read = from * source.itemSize;
    for (let i = 0; i < this.itemSize; i++) this.array[at + i] = source.array[read + i];
    return this;
  }

  /** Every item (three numbers each) moved by `m`, as a point. */
  applyMatrix4(matrix: Mat4): this {
    for (let i = 0; i < this.count; i++) {
      this.readVector(i).applyMatrix4(matrix);
      this.setXYZ(i, scratchVector.x, scratchVector.y, scratchVector.z);
    }
    return this;
  }

  /** Every item turned by the normal matrix `m`, and made unit length. */
  applyNormalMatrix(matrix: Mat3): this {
    for (let i = 0; i < this.count; i++) {
      this.readVector(i).applyNormalMatrix(matrix);
      this.setXYZ(i, scratchVector.x, scratchVector.y, scratchVector.z);
    }
    return this;
  }

  /** Every item turned by `m` as a direction (no move), and made unit length. */
  transformDirection(matrix: Mat4): this {
    for (let i = 0; i < this.count; i++) {
      this.readVector(i).transformDirection(matrix);
      this.setXYZ(i, scratchVector.x, scratchVector.y, scratchVector.z);
    }
    return this;
  }

  /** Makes this a copy of `source`: its own array of the same kind. */
  copy(source: Attribute<A>): this {
    this.name = source.name;
    this.array = copyOf(source.array);
    this.itemSize = source.itemSize;
    this.count = source.count;
    this.normalized = source.normalized;
    this.usage = source.usage;
    this.scale = source.scale;
    return this;
  }

  /** A copy with an array of its own. */
  clone(): Attribute<A> {
    return new Attribute(copyOf(this.array), this.itemSize, this.normalized).copy(this);
  }

  private readVector(index: number): Vec3 {
    return scratchVector.set(this.getX(index), this.getY(index), this.getZ(index));
  }

  private read(value: number): number {
    if (!this.normalized || this.scale === 1) return value;
    return Math.max(value / this.scale, -1);
  }

  private stored(value: number): number {
    if (!this.normalized || this.scale === 1) return value;
    return Math.round(value * this.scale);
  }
}

/** An attribute a draw steps through once every `meshPerAttribute` instances (three's `InstancedBufferAttribute`). */
export class InstancedAttribute<A extends TypedArray = TypedArray> extends Attribute<A> {
  /** instances an item */
  meshPerAttribute: number;

  /** `array` as items of `itemSize`, one an instance (or one every `meshPerAttribute`). */
  constructor(array: A | number[], itemSize: number, normalized = false, meshPerAttribute = 1) {
    super(array, itemSize, normalized);
    this.meshPerAttribute = meshPerAttribute;
  }

  /** Makes this a copy of `source`, its step too. */
  override copy(source: Attribute<A>): this {
    super.copy(source);
    if (source instanceof InstancedAttribute) this.meshPerAttribute = source.meshPerAttribute;
    return this;
  }

  /** A copy with an array of its own. */
  override clone(): InstancedAttribute<A> {
    return new InstancedAttribute(copyOf(this.array), this.itemSize).copy(this);
  }
}

/**
 * Three's `Float32BufferAttribute`: always a new `Float32Array`, copied from `values` (an array or a typed array) or
 * zeroed, `values` long when it's a number.
 */
export function floats(values: ArrayLike<number> | number, itemSize: number,
  normalized = false): Attribute<Float32Array> {
  const array = typeof values === 'number' ? new Float32Array(values) : Float32Array.from(values);
  return new Attribute(array, itemSize, normalized);
}

/** An index from `values`: 16-bit unless a value needs 32 (three's `setIndex` of an array). */
export function indexOf(values: ArrayLike<number>): Attribute<Uint16Array | Uint32Array> {
  let wide = false;
  for (let i = values.length - 1; i >= 0 && !wide; i--) wide = values[i] >= 65535;
  const array = wide ? Uint32Array.from(values) : Uint16Array.from(values);
  return new Attribute<Uint16Array | Uint32Array>(array, 1);
}
