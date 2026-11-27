// One geometry drawn many times, each instance by a matrix of its own (and a tint): the engine's instance set, sent
// again as the instances' attributes' versions move.
import { Color, Mat4, Sphere, Vec3 } from '../math/index.ts';
import { InstancedAttribute, type Geometry } from '../geometry/index.ts';
import type { Material } from '../material/index.ts';
import { Mesh } from './mesh.ts';
import type { Node } from './node.ts';

const scratchMatrix = new Mat4();
const scratchPoint = new Vec3();
const scratchSphere = new Sphere();

/** A geometry drawn `count` times. */
export class InstancedMesh<G extends Geometry = Geometry, M extends Material | Material[] = Material | Material[]>
  extends Mesh<G, M> {
  /** what every instanced mesh says it is */
  readonly isInstancedMesh = true;
  /** each instance's matrix, 16 numbers apiece */
  instanceMatrix: InstancedAttribute;
  /** each instance's tint, three numbers apiece, once one is set */
  instanceColor: InstancedAttribute | null = null;
  /** how many are drawn (no more than were made) */
  count: number;
  /** what all its instances reach, made on asking */
  boundingSphere: Sphere | null = null;

  /** `geometry` by `material`, room for `count` instances, each at the identity. */
  constructor(geometry: G, material: M, count: number) {
    super(geometry, material);
    this.type = 'InstancedMesh';
    this.count = count;
    const matrices = new Float32Array(count * 16);
    for (let i = 0; i < count; i++) scratchMatrix.identity().toArray(matrices, i * 16);
    this.instanceMatrix = new InstancedAttribute(matrices, 16);
  }

  /** Instance `index`'s matrix set to `matrix` (its attribute's `needsUpdate` says when to send them). */
  setMatrixAt(index: number, matrix: Mat4): void { matrix.toArray(this.instanceMatrix.array, index * 16); }

  /** Instance `index`'s matrix, into `matrix`; the matrix (as three's, so a call can be passed on). */
  getMatrixAt(index: number, matrix: Mat4): Mat4 { return matrix.fromArray(this.instanceMatrix.array, index * 16); }

  /** Instance `index`'s tint set to `color`, a tint for each made white first if there were none. */
  setColorAt(index: number, color: Color): void {
    if (!this.instanceColor) {
      const tints = new Float32Array(this.instanceMatrix.count * 3).fill(1);
      this.instanceColor = new InstancedAttribute(tints, 3);
    }
    color.toArray(this.instanceColor.array, index * 3);
  }

  /** Instance `index`'s tint, into `color` (white where none is set). */
  getColorAt(index: number, color: Color): void {
    if (!this.instanceColor) {
      color.setRGB(1, 1, 1);
      return;
    }
    color.fromArray(this.instanceColor.array, index * 3);
  }

  /** What its first `count` instances reach, into `boundingSphere`. */
  computeBoundingSphere(): void {
    const geometry = this.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const own = geometry.boundingSphere!;
    const sphere = this.boundingSphere ?? (this.boundingSphere = new Sphere());
    sphere.makeEmpty();
    for (let i = 0; i < this.count; i++) {
      this.getMatrixAt(i, scratchMatrix);
      scratchSphere.copy(own).applyMatrix4(scratchMatrix);
      sphere.union(scratchSphere);
    }
    if (this.count === 0) sphere.set(scratchPoint.set(0, 0, 0), 0);
  }

  /** `source` copied onto it, its instances copied too; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof InstancedMesh) {
      this.instanceMatrix = source.instanceMatrix.clone();
      this.instanceColor = source.instanceColor?.clone() ?? null;
      this.count = source.count;
    }
    return this;
  }

  /** A copy of it, its geometry and materials shared, its instances copied. */
  override clone(recursive = true): InstancedMesh<G, M> {
    return new InstancedMesh<G, M>(this.geometry, this.material, this.count).copy(this, recursive);
  }

  /** Nothing of its own to let go but its instances' attributes: kept for the game's calls. */
  dispose(): void {}
}
