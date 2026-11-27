// A mesh moved by bones: its skeleton's bones are nodes, and the engine makes its bones' matrices from them each
// frame (Bulwark's nodes.rs skins). What the game reads of them itself (a cloth, an arrow's hit) is made here on
// asking (`Skeleton.update`).
import { Mat4, Vec3 } from '../math/index.ts';
import type { Geometry } from '../geometry/index.ts';
import type { Material } from '../material/index.ts';
import { Mesh } from './mesh.ts';
import { Node } from './node.ts';

/** how a skinned mesh's bind is held: where it stands now (`attached`), or where it stood when bound (`detached`) */
export type BindMode = 'attached' | 'detached';
/** bound where it stands now: its bind's inverse its world's (three's `AttachedBindMode`) */
export const AttachedBindMode: BindMode = 'attached';
/** bound where it stood when bound (three's `DetachedBindMode`) */
export const DetachedBindMode: BindMode = 'detached';

const scratchMatrix = new Mat4();
const scratchBone = new Mat4();
const scratchBind = new Vec3();
const scratchMoved = new Vec3();

/** A joint of a skeleton: a node. */
export class Bone extends Node {
  /** what every bone says it is */
  readonly isBone = true;

  constructor() {
    super();
    this.type = 'Bone';
  }
}

/** A skin's bones and where each stood as the mesh was bound to them. */
export class Skeleton {
  readonly bones: Bone[];
  /** each bone's world matrix as it stood when bound, inverted */
  readonly boneInverses: Mat4[];
  /** each bone's matrix for the skin, made by `update` (16 numbers a bone) */
  boneMatrices: Float32Array;
  /** a number the stage keys the engine's skin by (a skeleton cloned is another) */
  version = 0;

  /** A skeleton of `bones`, each with its inverse bind (made from where they stand now if none is given). */
  constructor(bones: Bone[] = [], boneInverses: Mat4[] = []) {
    this.bones = bones.slice();
    this.boneMatrices = new Float32Array(this.bones.length * 16);
    if (boneInverses.length === this.bones.length) {
      this.boneInverses = boneInverses.map((inverse) => inverse.clone());
    } else {
      this.boneInverses = [];
      this.calculateInverses();
    }
  }

  /** Each bone's inverse bind made from where it stands now. */
  calculateInverses(): void {
    this.boneInverses.length = 0;
    for (const bone of this.bones) this.boneInverses.push(bone.matrixWorld.clone().invert());
    this.version++;
  }

  /** Each bone put back where it stood when bound. */
  pose(): void {
    this.bones.forEach((bone, at) => bone.matrixWorld.copy(this.boneInverses[at]).invert());
    for (const bone of this.bones) {
      if (bone.parent instanceof Bone) {
        bone.matrix.copy(bone.parent.matrixWorld).invert().multiply(bone.matrixWorld);
      } else {
        bone.matrix.copy(bone.matrixWorld);
      }
      bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
    }
  }

  /** Each bone's matrix for the skin made into `boneMatrices`: where it stands, after its inverse bind. */
  update(): void {
    this.bones.forEach((bone, at) => {
      scratchMatrix.multiplyMatrices(bone.matrixWorld, this.boneInverses[at]);
      scratchMatrix.toArray(this.boneMatrices, at * 16);
    });
  }

  /** The first bone named `name`. */
  getBoneByName(name: string): Bone | undefined { return this.bones.find((bone) => bone.name === name); }

  /** A skeleton of the same bones and binds. */
  clone(): Skeleton { return new Skeleton(this.bones, this.boneInverses); }

  /** Nothing held to let go: kept for the game's calls. */
  dispose(): void {}
}

/** A mesh moved by a skeleton's bones. */
export class SkinnedMesh<G extends Geometry = Geometry, M extends Material | Material[] = Material | Material[]>
  extends Mesh<G, M> {
  /** what every skinned mesh says it is */
  readonly isSkinnedMesh = true;
  /** its bones, once bound (typed as bound, as three's is: read before `bind`, it's undefined) */
  skeleton!: Skeleton;
  /** how its bind is held */
  bindMode: BindMode = AttachedBindMode;
  /** its world matrix as it was bound, and that inverted */
  readonly bindMatrix = new Mat4();
  readonly bindMatrixInverse = new Mat4();

  /** A mesh of `geometry`, by `material`, bound to no skeleton yet. */
  constructor(geometry?: G, material?: M) {
    super(geometry, material);
    this.type = 'SkinnedMesh';
  }

  /** Bound to `skeleton`, by `bindMatrix` (its world matrix now if none). */
  bind(skeleton: Skeleton, bindMatrix?: Mat4): void {
    this.skeleton = skeleton;
    if (bindMatrix) {
      this.bindMatrix.copy(bindMatrix);
    } else {
      this.bindMatrix.copy(this.matrixWorld);
      skeleton.calculateInverses();
    }
    this.bindMatrixInverse.copy(this.bindMatrix).invert();
    this.link?.redraw(this);
  }

  /** Its skeleton put back as bound. */
  pose(): void { this.skeleton?.pose(); }

  /** Its bind's inverse as its mode holds it (attached: its world now, inverted). */
  bindInverseNow(): Mat4 {
    if (this.bindMode === AttachedBindMode) this.bindMatrixInverse.copy(this.matrixWorld).invert();
    return this.bindMatrixInverse;
  }

  /**
   * `target` (a point in its own space, as bound) moved as its vertex `at`'s bones move it, in its own space; the
   * point. Three 0.187's `SkinnedMesh.applyBoneTransform`: into the bind's space, each of four bones' moves weighed,
   * back out. Unmoved where it has no skeleton or no skin's attributes.
   */
  applyBoneTransform(at: number, target: Vec3): Vec3 {
    const bones = this.geometry.getAttribute('skinIndex');
    const weights = this.geometry.getAttribute('skinWeight');
    const skeleton = this.skeleton;
    if (!skeleton || !bones || !weights) return target;
    scratchBind.copy(target).applyMatrix4(this.bindMatrix);
    target.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const weight = weights.getComponent(at, k);
      if (weight === 0) continue;
      const bone = bones.getComponent(at, k);
      scratchBone.multiplyMatrices(skeleton.bones[bone].matrixWorld, skeleton.boneInverses[bone]);
      target.addScaledVector(scratchMoved.copy(scratchBind).applyMatrix4(scratchBone), weight);
    }
    return target.applyMatrix4(this.bindInverseNow());
  }

  /** `source` copied onto it, its skeleton and bind shared; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof SkinnedMesh) {
      this.bindMode = source.bindMode;
      this.bindMatrix.copy(source.bindMatrix);
      this.bindMatrixInverse.copy(source.bindMatrixInverse);
      this.skeleton = source.skeleton;
    }
    return this;
  }

  /** A copy of it, its geometry, materials and skeleton shared. */
  override clone(recursive = true): SkinnedMesh<G, M> {
    return new SkinnedMesh<G, M>(this.geometry, this.material).copy(this, recursive);
  }
}
