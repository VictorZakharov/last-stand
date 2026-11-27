// A creature's body drawn as one under the engine: its kind's pieces merged per material once, in the kind's bind
// pose (`crowd.ts`'s merge: a rigid piece skinned whole to the joint it hangs on, a skinned piece kept on its bones),
// and each body drawn as a skinned mesh a material on its own joints. The crowd's draw is a shader of three's, which
// the engine never runs, so under the engine every body was drawn piece by piece: 31 to 50 meshes a foe, each walked,
// written as a record and its material asked after every frame (from play, a party at wave 36 of the Crypt at 12
// frames a second on a laptop, 2,668 draws; `lab perf --wave 36`: of a frame's 1,532 records 1,288 were the foes'
// pieces). Now a foe is a record a material, some 9, and the engine batches a kind's alike records into one draw.
// What a foe's look changes through is the crowd's rule (its kit's uniforms and its materials' `emissiveIntensity`:
// each body draws with its own materials, so both reach it); a mesh hidden or a material swapped on one foe shows on
// none. Its pieces stay where they hang, on a layer no camera draws (`CROWD_LAYER`), for what reads them (an arrow
// lodged in one, the aim's hulls, the outline). `--tune bodyAsOne.on=0` draws each piece on its own again.
import {
  AttachedBindMode, Attribute, Bone, DetachedBindMode, Geometry, Mat3, Mat4, Material, Mesh, Node, Skeleton,
  SkinnedMesh,
} from '../../engine/api/index.ts';
import { G } from '../../state';
import { CROWD_LAYER } from '../../core/layers';
import { tunable } from '../../core/tuning';
import { mulberry } from '../../util';
import type { Model } from '../../types';
import { baseOf, castsOf, piecesOf, placeAll, turnAll, type CrowdBody } from './crowd';

/** whether a creature's body is drawn as one under the engine (1) or piece by piece (0), as its body joins; and
 *  whether its pieces, unseen, are left unplaced from frame to frame (1), placed where they're read
 *  (`placeUnplaced`), or placed every frame as before (0) */
export const BODY_AS_ONE = tunable('bodyAsOne', { on: 1, unplaced: 1 });

/** One kind's merge: its joints' inverse bind matrices, of a body's pieces the one hung on each rigid joint and
 *  the one whose material and casting each slot takes, how many pieces a body has, each slot's geometry. */
interface Kind {
  inverses: Mat4[];
  jointFrom: number[];
  slotFrom: number[];
  pieces: number;
  geometries: Geometry[];
  /** of a body's pieces, those each slot merged, in the order it laid them */
  members: number[][];
  /** how far from its root a body of the kind reaches at its root's scale of 1, in its bind pose */
  reach: number;
}

/** A body drawn as one: its meshes, a slot each, and the skeleton they share. */
interface Drawn {
  meshes: SkinnedMesh[];
  skeleton: Skeleton;
  /** its pieces left unplaced from frame to frame, none if they're placed */
  unplaced: Mesh[];
  /** how far from its root it reaches, at its root's scale of 1 (its kind's, a limb flung out and its shadow) */
  reach: number;
}

/** A body drawn as one as the engine's nodes take it (`engine/bodies.ts`): its meshes, its joints (the skeleton's
 *  bones, in its order) and how far from its root it reaches. */
export interface AsOne {
  readonly meshes: readonly SkinnedMesh[];
  skeleton: Skeleton;
  reach: number;
}

/** A piece in its slot: the mesh, and the joint it hangs on (-1: skinned on the skeleton's bones). */
interface Part {
  mesh: Mesh;
  joint: number;
  /** its place among the body's pieces */
  k: number;
}

const kinds = new Map<string, Kind>();
const drawn = new Map<CrowdBody, Drawn>();
/** what the bodies' meshes hang under: the scene, never a body's own root, whose readers (the aim's hulls, an
 *  arrow's lodging) walk its meshes */
let holder: Node | null = null;
const IDENTITY = new Mat4();
/** how far past the camera's view a body is still drawn, m (the engine culls it by its reach and this): for its
 *  shadow, which falls into the view from off it */
const SHADOW_MARGIN = 8;
/** a body's reach past its bind pose's, for a limb flung out in a blow or a fall */
const REACH_SLACK = 1.5;
const scratchPlace = new Mat4();
const scratchNormalMatrix = new Mat3();

/** The group the bodies' meshes hang under, added to the scene the first time it's asked for. */
function holderOf(): Node {
  if (!holder) {
    holder = madeAside(() => new Node());
    holder.name = 'bodies as one';
    holder.matrixAutoUpdate = false;
    G.scene.add(holder);
  }
  return holder;
}

/** the random numbers the bodies' own three.js objects draw their ids from */
const ownRandom = mulberry(0xb0d1e5);

/**
 * What `make` returns, made with `Math.random` drawing from a stream of the bodies' own: each three.js object draws
 * random numbers for its id, and a body joining mid-fight took them from the game's, so every roll after it (a foe's
 * attack, its aim) came out otherwise, and two pictures of the same fight drawn as one and piece by piece differed.
 */
function madeAside<T>(make: () => T): T {
  const random = Math.random;
  Math.random = ownRandom;
  try {
    return make();
  } finally {
    Math.random = random;
  }
}

/** The kind of `model` (its pieces `pieces`) merged: its joints, and each slot's geometry. Null where its skinned
 *  pieces don't share one skeleton. */
function kindOf(model: Model, pieces: Mesh[]): Kind | null {
  model.root.updateMatrixWorld(true);
  const rootInv = model.root.matrixWorld.clone().invert();
  const skinned = pieces.filter((piece) => (piece as SkinnedMesh).isSkinnedMesh) as SkinnedMesh[];
  const skeleton = skinned[0]?.skeleton;
  if (skinned.some((piece) => piece.skeleton !== skeleton)) return null;
  const inverses = skeleton ? skeleton.boneInverses.map((inverse) => inverse.clone()) : [];
  const jointFrom: number[] = [];
  const slotFrom: number[] = [];
  const parts: Part[][] = [];
  const jointOf = new Map<Node, number>();
  // (a slot a material and whether its pieces cast: a piece under 7 cm casts none, and merged with those that do,
  // the foes' shadows were drawn from half again the triangles)
  const slotOf = new Map<string, number>();
  pieces.forEach((mesh, k) => {
    const base = baseOf(model, mesh.material as Material)!;
    const key = `${base.uuid}|${castsOf(mesh)}`;
    let slot = slotOf.get(key);
    if (slot === undefined) {
      slot = slotFrom.push(k) - 1;
      slotOf.set(key, slot);
      parts.push([]);
    }
    let joint = -1;
    if (!(mesh as SkinnedMesh).isSkinnedMesh) {
      const parent = mesh.parent!;
      joint = jointOf.get(parent) ?? -1;
      if (joint < 0) {
        joint = inverses.length;
        jointOf.set(parent, joint);
        jointFrom.push(k);
        inverses.push(new Mat4().multiplyMatrices(rootInv, parent.matrixWorld).invert());
      }
    }
    parts[slot].push({ mesh, joint, k });
  });
  const geometries = parts.map((list, slot) => {
    const base = baseOf(model, pieces[slotFrom[slot]].material as Material)!;
    return merged(list, rootInv, base.vertexColors);
  });
  const reach = Math.max(...geometries.map((geometry) => {
    const bounds = geometry.boundingSphere!;
    return bounds.center.length() + bounds.radius;
  }));
  const members = parts.map((list) => list.map((part) => part.k));
  return { inverses, jointFrom, slotFrom, pieces: pieces.length, geometries, members, reach };
}

/**
 * A slot's pieces merged into one skinned geometry in the kind's bind pose, its vertices in the root's space: a rigid
 * piece put where it hangs at rest and skinned whole to its joint, a skinned piece kept on its bones. Four joints a
 * vertex, as the engine takes them. Shared by every body of the kind, never disposed (`userData.shared`).
 */
function merged(list: Part[], rootInv: Mat4, colours: boolean): Geometry {
  const flat = list.map(({ mesh }) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry));
  const count = flat.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
  const colourSize = colours ? flat[0].attributes.color.itemSize : 0;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const colour = new Float32Array(count * colourSize);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  let at = 0;
  list.forEach(({ mesh, joint }, n) => {
    const geometry = flat[n];
    const skin = joint < 0 ? mesh as SkinnedMesh : null;
    const place = skin ? scratchPlace.copy(skin.bindMatrix) : scratchPlace.multiplyMatrices(rootInv, mesh.matrixWorld);
    scratchNormalMatrix.getNormalMatrix(place);
    placeAll(geometry.attributes.position, place, position, at);
    turnAll(geometry.attributes.normal, scratchNormalMatrix, normal, at);
    const uvs = geometry.attributes.uv;
    for (let i = 0; i < geometry.attributes.position.count; i++, at++) {
      if (uvs) {
        uv[at * 2] = uvs.getX(i);
        uv[at * 2 + 1] = uvs.getY(i);
      }
      for (let c = 0; c < colourSize; c++) colour[at * colourSize + c] = geometry.attributes.color.getComponent(i, c);
      for (let j = 0; j < 4; j++) {
        skinIndex[at * 4 + j] = skin ? geometry.attributes.skinIndex.getComponent(i, j) : j === 0 ? joint : 0;
        skinWeight[at * 4 + j] = skin ? geometry.attributes.skinWeight.getComponent(i, j) : j === 0 ? 1 : 0;
      }
    }
    if (geometry !== mesh.geometry) geometry.dispose();
  });
  const out = new Geometry();
  out.setAttribute('position', new Attribute(position, 3));
  out.setAttribute('normal', new Attribute(normal, 3));
  out.setAttribute('uv', new Attribute(uv, 2));
  if (colourSize) out.setAttribute('color', new Attribute(colour, colourSize));
  out.setAttribute('skinIndex', new Attribute(skinIndex, 4));
  out.setAttribute('skinWeight', new Attribute(skinWeight, 4));
  out.computeBoundingSphere();
  out.userData.shared = true;
  return out;
}

/** `body`'s slot `slot` as a skinned mesh on `skeleton`, in its own material, shown and casting as its body is. */
function slotMesh(kind: Kind, slot: number, body: CrowdBody, pieces: Mesh[], skeleton: Skeleton,
  ): SkinnedMesh {
  const model = body.model;
  const piece = pieces[kind.slotFrom[slot]];
  const mesh = new SkinnedMesh(kind.geometries[slot], baseOf(model, piece.material as Material)!);
  mesh.name = `${model.root.userData.crowdKind as string} as one`;
  // (whose body it draws, for what counts a body's meshes: `tools/lab/page/bodyRecords.ts`)
  mesh.userData.bodyOf = model.root;
  // (its vertices are skinned into the world by its joints: its own matrix stays the scene's)
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  // (bound detached and its matrix never remade: attached, three inverted its identity every frame, 306 a frame
  // at wave 36)
  mesh.bindMode = DetachedBindMode;
  mesh.bind(skeleton, IDENTITY);
  mesh.updateMatrixWorld = () => undefined;
  mesh.frustumCulled = false;
  // (met by no ray: its pieces, where they hang, are what a ray meets, an arrow or a foot finding the floor)
  mesh.raycast = () => undefined;
  mesh.receiveShadow = true;
  mesh.layers.mask = piece.layers.mask;
  // (casting as its pieces do now: the quality's level sets theirs, `core/quality.ts`, and at Very low no foe casts)
  Object.defineProperty(mesh, 'castShadow', { get: () => piece.castShadow && body.castsShadow, set: () => undefined });
  // (drawn on its body's root's node, shown as it is and culled there by the body's reach: `engine/draws.ts`)
  mesh.userData.drawnOn = model.root;
  mesh.userData.reach = kind.reach + REACH_SLACK + SHADOW_MARGIN;
  return mesh;
}

/**
 * `body` drawn as one from now on (its pieces put on `CROWD_LAYER`): false where it isn't a creature whose kind shares
 * its geometry, or its pieces aren't its kind's, which is then drawn piece by piece.
 */
export function drawAsOne(body: CrowdBody): boolean {
  const model = body.model;
  const name = model.root.userData.crowdKind as string | undefined;
  if (!BODY_AS_ONE.on || !name || drawn.has(body)) return false;
  const pieces = mergedPieces(model);
  if (!pieces.length) return false;
  let kind = kinds.get(name);
  if (!kind) {
    const made = madeAside(() => kindOf(model, pieces));
    if (!made) return false;
    kind = made;
    kinds.set(name, kind);
  }
  if (pieces.length !== kind.pieces) return false;
  const skinned = pieces.find((piece) => (piece as SkinnedMesh).isSkinnedMesh) as SkinnedMesh | undefined;
  const bones = skinned?.skeleton.bones ?? [];
  const joints = [...bones, ...kind.jointFrom.map((k) => pieces[k].parent!)] as Bone[];
  const { skeleton, meshes } = madeAside(() => {
    const made = new Skeleton(joints, kind.inverses.map((inverse) => inverse.clone()));
    return { skeleton: made, meshes: kind.slotFrom.map((_, slot) => slotMesh(kind, slot, body, pieces, made)) };
  });
  for (const piece of pieces) piece.layers.set(CROWD_LAYER);
  holderOf().add(...meshes);
  const unplaced = BODY_AS_ONE.unplaced ? pieces : [];
  for (const piece of unplaced) leaveUnplaced(piece);
  drawn.set(body, { meshes, skeleton, unplaced, reach: kind.reach + REACH_SLACK + SHADOW_MARGIN });
  return true;
}

/**
 * `piece` passed over by the frame's placing (`placeShown` in `engine/bridge.ts`), its place in the world made only
 * where something reads it (`placeUnplaced`). Placed every frame, a foe's 31 to 50 pieces cost the frame as much
 * again as its body drawn as one saved (wave 36's 34 foes: the render's matrices 0.92 s of a run's 3.5 s in the
 * bridge's draw, its records 0.85). Its own flags are three's as before, so whatever asks three for fresh matrices
 * (`updateMatrixWorld(true)`) still has them: with the flags off, the lab's head aim read every foe's skull where it
 * stood as it joined, and a husk's head shot struck its body.
 */
function leaveUnplaced(piece: Mesh): void {
  piece.userData.unplaced = true;
}

/** `piece` placed by the frame again, as its body leaves being drawn as one. */
function placedAgain(piece: Mesh): void {
  delete piece.userData.unplaced;
  piece.matrixWorldNeedsUpdate = true;
}

/**
 * Every unplaced piece under `root` put where its joint holds it now (its joint as last placed): what reads a foe's
 * pieces asks for this first (an arrow's ray, the aim's, the outline). A skinned piece's bind is kept attached.
 */
export function placeUnplaced(root: Node): void {
  root.traverse((object) => {
    if (!object.userData.unplaced || !object.parent) return;
    if (object.matrixAutoUpdate) object.updateMatrix();
    object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
    const skinned = object as SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.bindMode === AttachedBindMode) {
      skinned.bindMatrixInverse.copy(skinned.matrixWorld).invert();
    }
  });
}

/** The pieces of `model` a body drawn as one merges: a pooled piece is placed by its own matrix, not its joint's,
 *  and is drawn on its own (`rootCage.ts`). */
const mergedPieces = (model: Model): Mesh[] => piecesOf(model).filter((piece) => !piece.userData.pooled);

/** The pieces each of `body`'s meshes merged, in the order it laid them (none drawn as one): a harness's. */
export function slotPieces(body: CrowdBody): Mesh[][] {
  const kind = kinds.get(body.model.root.userData.crowdKind as string);
  if (!kind || !drawn.has(body)) return [];
  const pieces = mergedPieces(body.model);
  return kind.members.map((list) => list.map((k) => pieces[k]));
}

/** Every body drawn as one now, by its key, for the engine's nodes (`engine/bodies.ts`). */
export function eachAsOne(visit: (body: CrowdBody, one: AsOne) => void): void {
  for (const [body, one] of drawn) visit(body, one);
}

/** What the bodies' meshes hang under, if any hang yet: the engine's nodes draw them, and hide it from its walk. */
export const holderAsOne = (): Node | null => holder;

/** Whether `body` is drawn as one. */
export const drawnAsOne = (body: CrowdBody): boolean => drawn.has(body);

/** The meshes `body` is drawn as, none when it's drawn piece by piece: what a harness counts as the body's. */
export const meshesAsOne = (body: CrowdBody): readonly Mesh[] => drawn.get(body)?.meshes ?? [];

/** `body` no longer drawn as one: its meshes out of the scene and its skeleton let go (the geometry is its kind's). */
export function leaveAsOne(body: CrowdBody): void {
  const one = drawn.get(body);
  if (!one) return;
  drawn.delete(body);
  for (const piece of one.unplaced) placedAgain(piece);
  for (const mesh of one.meshes) mesh.removeFromParent();
  one.skeleton.dispose();
}
