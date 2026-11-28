// Crowds: every creature of a kind drawn alike. Under three's renderers a kind's pieces were merged per material into
// one geometry skinned on its joints, each body an instance of it, its joints and looks a row of a float texture a
// shader of three's read (#222). Under the engine, which never ran that shader, each body is drawn as one
// (`bodyAsOne.ts`: a skinned mesh a material on its own joints, which the engine batches by kind), and three's crowd
// is gone with three. What's kept here is what both share: a kind's pieces, the kit material each draws with, how a
// piece casts. The bodies keep their own meshes on a layer the camera doesn't draw (`CROWD_LAYER`, set by
// `bodyAsOne.ts`), for what reads them: an arrow lodges in them, the outline draws them.
import { Attribute, LitMaterial, Mat3, Mat4, Material, Mesh, Node, Vec3 } from '../../engine/api/index.ts';
import type { Model } from '../../types';
import { drawAsOne, drawnAsOne, leaveAsOne } from './bodyAsOne';
import { sameKitMaterial } from './kitTwin';

/** A body drawn in its kind's crowd. */
export interface CrowdBody {
  readonly model: Model;
  /** whether it casts a shadow (a dissolving body doesn't: its shadow wouldn't dissolve with it) */
  readonly castsShadow: boolean;
}

const scratchScale = new Vec3();

/** The kit material `material` is, or is a copy of (a skinned piece's: models/shapes.ts), or null. */
export function baseOf(model: Model, material: Material): LitMaterial | null {
  const materials = model.kit.mats as LitMaterial[];
  if (materials.includes(material as LitMaterial)) return material as LitMaterial;
  return materials.find((each) => sameKitMaterial(each, material)) ?? null;
}

/** The pieces of `model` its kind shares (`Sculpt`'s), in a solid material of its kit: what the crowd draws. */
export function piecesOf(model: Model): Mesh[] {
  const out: Mesh[] = [];
  model.root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.geometry.userData.shared || Array.isArray(m.material)) return;
    if (m.material.transparent || !baseOf(model, m.material)) return;
    out.push(m);
  });
  return out;
}

/** An object's largest scale in the world, as core/quality.ts judges a piece's shadow by. */
export function maxScale(o: Node): number {
  o.getWorldScale(scratchScale);
  return Math.max(scratchScale.x, scratchScale.y, scratchScale.z);
}

/** Whether a piece casts a shadow by the model's own choice (core/quality.ts keeps it in `userData.casts`). */
export const castsOf = (m: Mesh): boolean => (m.userData.casts as boolean | undefined) ?? m.castShadow;

/**
 * Every point of `from` placed by `m` into `to` from vertex `at`, as `Vector3.applyMatrix4` places each, read off the
 * array: read and written a vector at a time, the crowd's merge took 0.36 s of a boot's warm-up.
 */
export function placeAll(from: Attribute, m: Mat4,
  to: Float32Array, at: number): void {
  const e = m.elements;
  for (let i = 0, o = at * 3; i < from.count; i++, o += 3) {
    const x = from.getX(i), y = from.getY(i), z = from.getZ(i);
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    to[o] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    to[o + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    to[o + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  }
}

/** Every normal of `from` turned by `m` into `to` from vertex `at` and made a unit long, as `Vector3`'s would be. */
export function turnAll(from: Attribute, m: Mat3,
  to: Float32Array, at: number): void {
  const e = m.elements;
  for (let i = 0, o = at * 3; i < from.count; i++, o += 3) {
    const x = from.getX(i), y = from.getY(i), z = from.getZ(i);
    const nx = e[0] * x + e[3] * y + e[6] * z, ny = e[1] * x + e[4] * y + e[7] * z, nz = e[2] * x + e[5] * y + e[8] * z;
    const scale = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    to[o] = nx * scale;
    to[o + 1] = ny * scale;
    to[o + 2] = nz * scale;
  }
}


/**
 * `body` drawn as one with its kind from now on (`bodyAsOne.ts`), its own meshes put on `CROWD_LAYER`: false when it
 * isn't a creature whose kind shares its geometry (a hero), which is drawn on its own.
 */
export const joinCrowd = (body: CrowdBody): boolean => drawAsOne(body);

/** The meshes `model`'s kind's crowd is drawn with, for a warm-up to compile (game/warmup.ts): none, as each body
 *  is drawn as one by meshes of its own (`bodyAsOne.ts`). */
export const crowdSlots = (_model: Model): Node[] => [];

/** Whether `body` is drawn with its kind (the lab's `coop` asks of every foe). */
export const inCrowd = (body: CrowdBody): boolean => drawnAsOne(body);

/** `body` out of its crowd (disposed). */
export const leaveCrowd = (body: CrowdBody): void => leaveAsOne(body);
