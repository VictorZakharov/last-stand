// A mesh's shape (three's `BufferGeometry`): named attributes, an optional index, the groups a mesh's materials
// draw, a draw range and its bounds. `version` moves when an attribute or the index is replaced (an attribute's
// own `version` says its numbers changed), `rangeVersion` when what's drawn of it does (the draw range, the
// groups, an instanced geometry's count): what the stage reads to tell the engine again.
import type { Quat } from '../math/index.ts';
import { Box3, Mat3, Mat4, Maths, Sphere, Vec3 } from '../math/index.ts';
import { Attribute, indexOf } from './attribute.ts';
import { normals, unitNormals } from './normals.ts';
import { unindexed } from './ops.ts';
import { noteChanged } from '../changes.ts';

/** A stretch of the index (or of the vertices, unindexed) drawn with one of a mesh's materials. */
export interface Group {
  /** the first index (or vertex) */
  start: number;
  /** how many */
  count: number;
  /** which of the mesh's materials draws it */
  materialIndex: number;
}

/** What of the geometry is drawn: `count` indices (or vertices) from `start`; `Infinity` is all of them. */
export interface DrawRange {
  /** the first index (or vertex) drawn */
  start: number;
  /** how many: `Infinity` is to the end */
  count: number;
}

/** Something that has an `x`, a `y` and maybe a `z`: a `Vec2` or a `Vec3`. */
export interface PointLike {
  /** across */
  x: number;
  /** up (or along, flat) */
  y: number;
  /** out, if it has one */
  z?: number;
}

let nextId = 0;
const scratchMatrix = new Mat4();
const scratchBox = new Box3();
const scratchNormalMatrix = new Mat3();
const scratchOffset = new Vec3();
const scratchPoint = new Vec3();

/** A mesh's shape: named attributes, an optional index, groups, a draw range and bounds made on asking. */
export class Geometry {
  /** what the stage and the game test a geometry by */
  readonly isGeometry = true;
  /** unique among geometries, from 0 up */
  readonly id = nextId++;
  /** a name of its own */
  name = '';
  /** what made it, by three's name for its generator (`LatheGeometry`), where a generator says: `Geometry` else */
  type = 'Geometry';
  /** what its generator was given, where it says (a lathe's `points` and `segments`) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: Record<string, any> = {};
  /** the attributes by name (`position`, `normal`, `uv`, `color`, `skinIndex`, `skinWeight`...) */
  readonly attributes: Record<string, Attribute> = {};
  /** morph targets by attribute name (the game makes none: kept for the tests that ask) */
  readonly morphAttributes: Record<string, Attribute[]> = {};
  /** the vertices of each triangle in turn, or none: every three vertices a triangle */
  index: Attribute | null = null;
  /** the stretches each of a mesh's materials draws (none: the first material draws it all) */
  groups: Group[] = [];
  /** what of it is drawn */
  readonly drawRange: DrawRange = { start: 0, count: Infinity };
  /** the box round its positions, once `computeBoundingBox` has made it */
  boundingBox: Box3 | null = null;
  /** the sphere round its positions, once `computeBoundingSphere` has made it */
  boundingSphere: Sphere | null = null;
  /** the game's own notes on it, anything its own code reads back (shared by `clone`, as three's) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: Record<string, any> = {};
  /** moves when an attribute or the index is replaced */
  version = 0;
  /** moves when what's drawn of it changes: the draw range, the groups */
  rangeVersion = 0;
  private ownUuid: string | null = null;
  private disposers: (() => void)[] = [];

  /** a UUID of its own, made when first asked for */
  get uuid(): string {
    this.ownUuid ??= Maths.generateUUID();
    return this.ownUuid;
  }

  /** The index, or null. */
  getIndex(): Attribute | null {
    return this.index;
  }

  /** Sets the index: an attribute, or an array (16-bit unless a value needs 32), or null for none. */
  setIndex(index: Attribute | ArrayLike<number> | null): this {
    this.index = index === null || index instanceof Attribute ? index : indexOf(index);
    this.version++;
    noteChanged(this);
    return this;
  }

  /** The attribute named `name` (typed as there, as three's is: undefined where it has none, so ask
   *  `hasAttribute` first where that can be). */
  getAttribute(name: string): Attribute {
    return this.attributes[name];
  }

  /** Sets the attribute named `name`. */
  setAttribute(name: string, attribute: Attribute): this {
    this.attributes[name] = attribute;
    this.version++;
    noteChanged(this);
    return this;
  }

  /** Takes out the attribute named `name`. */
  deleteAttribute(name: string): this {
    delete this.attributes[name];
    this.version++;
    noteChanged(this);
    return this;
  }

  /** Whether it has an attribute named `name`. */
  hasAttribute(name: string): boolean {
    return this.attributes[name] !== undefined;
  }

  /** Adds a stretch drawn by the mesh's `materialIndex`th material. */
  addGroup(start: number, count: number, materialIndex = 0): void {
    this.groups.push({ start, count, materialIndex });
    this.rangeVersion++;
  }

  /** Takes out every group. */
  clearGroups(): void {
    this.groups = [];
    this.rangeVersion++;
  }

  /** Draws `count` indices (or vertices) from `start` alone. */
  setDrawRange(start: number, count: number): void {
    this.drawRange.start = start;
    this.drawRange.count = count;
    this.rangeVersion++;
  }

  /** Moves its positions by `m`, its normals and tangents turned with them; bounds made again if it had them. */
  applyMatrix4(matrix: Mat4): this {
    const position = this.getAttribute('position');
    if (position) {
      position.applyMatrix4(matrix);
      position.needsUpdate = true;
    }
    const normal = this.getAttribute('normal');
    if (normal) {
      normal.applyNormalMatrix(scratchNormalMatrix.getNormalMatrix(matrix));
      normal.needsUpdate = true;
    }
    const tangent = this.getAttribute('tangent');
    if (tangent) {
      tangent.transformDirection(matrix);
      tangent.needsUpdate = true;
    }
    if (this.boundingBox) this.computeBoundingBox();
    if (this.boundingSphere) this.computeBoundingSphere();
    return this;
  }

  /** Turns it by `q`. */
  applyQuaternion(quaternion: Quat): this {
    return this.applyMatrix4(scratchMatrix.makeRotationFromQuaternion(quaternion));
  }

  /** Turns it by `angle` about x. */
  rotateX(angle: number): this {
    return this.applyMatrix4(scratchMatrix.makeRotationX(angle));
  }

  /** Turns it by `angle` about y. */
  rotateY(angle: number): this {
    return this.applyMatrix4(scratchMatrix.makeRotationY(angle));
  }

  /** Turns it by `angle` about z. */
  rotateZ(angle: number): this {
    return this.applyMatrix4(scratchMatrix.makeRotationZ(angle));
  }

  /** Moves it by (x, y, z). */
  translate(x: number, y: number, z: number): this {
    return this.applyMatrix4(scratchMatrix.makeTranslation(x, y, z));
  }

  /** Scales it by (x, y, z). */
  scale(x: number, y: number, z: number): this {
    return this.applyMatrix4(scratchMatrix.makeScale(x, y, z));
  }

  /** Moves it so its box's middle is at the origin. */
  center(): this {
    this.computeBoundingBox();
    if (!this.boundingBox) return this;
    this.boundingBox.getCenter(scratchOffset).negate();
    return this.translate(scratchOffset.x, scratchOffset.y, scratchOffset.z);
  }

  /** Its positions from `points` (a missing `z` is 0): written into its own if it has them, else made. */
  setFromPoints(points: readonly PointLike[]): this {
    const position = this.getAttribute('position');
    if (!position) {
      const values = new Float32Array(points.length * 3);
      points.forEach((point, i) => values.set([point.x, point.y, point.z ?? 0], i * 3));
      return this.setAttribute('position', new Attribute(values, 3));
    }
    const count = Math.min(points.length, position.count);
    for (let i = 0; i < count; i++) position.setXYZ(i, points[i].x, points[i].y, points[i].z ?? 0);
    position.needsUpdate = true;
    return this;
  }

  /** Makes `boundingBox` round its positions (empty without any). */
  computeBoundingBox(): void {
    this.boundingBox ??= new Box3();
    const position = this.getAttribute('position');
    if (position) this.boundingBox.setFromBufferAttribute(position);
    else this.boundingBox.makeEmpty();
  }

  /** Makes `boundingSphere`: centred on its box's middle, as large as its farthest position from it. */
  computeBoundingSphere(): void {
    this.boundingSphere ??= new Sphere();
    const position = this.getAttribute('position');
    if (!position) return;
    const center = this.boundingSphere.center;
    scratchBox.setFromBufferAttribute(position).getCenter(center);
    let most = 0;
    for (let i = 0; i < position.count; i++) {
      scratchPoint.set(position.getX(i), position.getY(i), position.getZ(i));
      most = Math.max(most, center.distanceToSquared(scratchPoint));
    }
    this.boundingSphere.radius = Math.sqrt(most);
  }

  /** Makes its normals from its faces (`normals`): smooth through the index, flat without one. */
  computeVertexNormals(): void {
    normals(this);
  }

  /** It laid out a vertex a corner, no index (`unindexed`); itself if it has no index. */
  toNonIndexed(): Geometry {
    return unindexed(this);
  }

  /** Makes every normal unit length. */
  normalizeNormals(): void {
    unitNormals(this);
  }

  /** A copy of its own kind with attributes of its own (its `userData` shared, as three's). */
  clone(): this {
    const kind = this.constructor as new () => this;
    return new kind().copy(this);
  }

  /** Makes this a copy of `source`: attributes, index, groups, bounds, draw range; its `userData` shared. */
  copy(source: Geometry): this {
    for (const name of Object.keys(this.attributes)) delete this.attributes[name];
    for (const name of Object.keys(this.morphAttributes)) delete this.morphAttributes[name];
    this.name = source.name;
    this.type = source.type;
    this.parameters = { ...source.parameters };
    this.index = source.index ? source.index.clone() : null;
    for (const [name, attribute] of Object.entries(source.attributes)) this.attributes[name] = attribute.clone();
    for (const [name, list] of Object.entries(source.morphAttributes)) {
      this.morphAttributes[name] = list.map((attribute) => attribute.clone());
    }
    this.groups = source.groups.map((group) => ({ ...group }));
    this.boundingBox = source.boundingBox ? source.boundingBox.clone() : null;
    this.boundingSphere = source.boundingSphere ? source.boundingSphere.clone() : null;
    this.drawRange.start = source.drawRange.start;
    this.drawRange.count = source.drawRange.count;
    this.userData = source.userData;
    this.version++;
    noteChanged(this);
    this.rangeVersion++;
    return this;
  }

  /** Calls `callback` when it's disposed (the stage lets the engine's copy go); the function returned stops it. */
  onDispose(callback: () => void): () => void {
    this.disposers.push(callback);
    return () => {
      this.disposers = this.disposers.filter((each) => each !== callback);
    };
  }

  /** Says it's done with: every `onDispose` callback is called. */
  dispose(): void {
    for (const callback of [...this.disposers]) callback();
  }
}

/** A geometry drawn `instanceCount` times in one draw, its instanced attributes stepped through (three's
 *  `InstancedBufferGeometry`). */
export class InstancedGeometry extends Geometry {
  /** what the stage and the game test an instanced geometry by (three's `isInstancedBufferGeometry`) */
  readonly isInstancedGeometry = true;
  private count = Infinity;

  /** how many instances are drawn (`Infinity`: as many as its instanced attributes hold) */
  get instanceCount(): number {
    return this.count;
  }

  set instanceCount(count: number) {
    if (count === this.count) return;
    this.count = count;
    this.rangeVersion++;
  }

  /** Makes this a copy of `source`, its instance count too. */
  override copy(source: Geometry): this {
    super.copy(source);
    if (source instanceof InstancedGeometry) this.instanceCount = source.instanceCount;
    return this;
  }
}
