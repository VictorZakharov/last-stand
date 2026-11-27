// What each mesh under the shown world draws, kept by the engine on its node (`stage.ts`): a record a material (a
// group of its geometry each), its matrix the node's, its bones the engine's from its skeleton's nodes. Written
// once, and again only where what it was written under changed: the stage tells of a mesh's own changes (its
// geometry, material, casting, layers), and the frame looks at the materials and geometries in use, not the meshes
// (hundreds against thousands): one whose engine id, version or see-through flags moved has its meshes written
// again. What has to be made each frame (a look run before its draw, or listing its own rows) is written into the
// frame's records each frame, as the walk wrote every mesh.
import {
  AttachedBindMode, Camera, Geometry, InstancedGeometry, InstancedMesh, Mat4, Mesh, NONE, Node, Skeleton, SkinnedMesh,
} from './api/index.ts';
import { RECORD, type Core } from './core';
import { lookOf } from './custom';
import { TUNE, type Grade } from './globals';
import type { Geometries } from './geometry';
import type { AnyMaterial, Materials } from './materials';
import { SEE_FLAGS, type SeeKinds } from './seeKinds';
import { casterGeometry } from '../entities/models/farDetail';

/** a record's flags (plan.rs) */
const CASTS_SHADOW = 1, NEVER_CULLED = 2, SHADOW_ONLY = 4, ARMS = 8, SOLID = 16, LOW_RES = 32;
/** where a record says how many instances its mesh draws by itself (`RAW_INSTANCES` in plan.rs) */
const RAW_INSTANCES = 7;
/** how a record casts: as its mesh says, not at all (another record casts for it), or in the shadow alone */
type Cast = 'own' | 'none' | 'only';
/** how a view draws a mesh: the world's camera, his arms' through his eyes, for its shadow alone, or none */
type Role = 'seen' | 'arms' | 'unseen' | 'none';

const IDENTITY = new Float32Array(new Mat4().elements);
const scratchMatrix = new Mat4();

/** What the frame's views draw by: the world's camera, his arms' (through his eyes), the grade. */
export interface View {
  camera: Camera;
  arms: Camera | null;
  grade: Grade;
}

/** A mesh drawn on its node. */
interface Entry {
  mesh: Mesh;
  /** its records in the engine */
  drawn: number[];
  skin: number;
  /** what they were written under, compared as it's told something changed */
  under: number[];
  /** how many are see-through drawn solid, and how many cast from fewer triangles */
  solid: number;
  casters: number;
  /** written into each frame's records, not kept */
  eachFrame: boolean;
  /** the materials and geometry it's listed under, as last written */
  materials: AnyMaterial[];
  geometry: Geometry | null;
}

/** A material or geometry in use: what it was last seen as, and the meshes drawn by it. */
interface Use { stamp: number; meshes: Set<Mesh> }

export class Draws {
  private entries = new Map<Mesh, Entry>();
  private pending = new Set<Mesh>();
  private eachFrame = new Set<Entry>();
  private materialUse = new Map<AnyMaterial, Use>();
  private geometryUse = new Map<Geometry, Use>();
  private instanced = new Map<InstancedMesh, number>();
  /** the frame's key every record reads (the casting switches, the views' layers): all written again as it moves */
  private frameKey = '';
  private under: number[] = [];
  private scratch = new Float32Array(RECORD * 8);
  private scratchCount = 0;
  /** the skins by skeleton and bind, made once */
  private skins = new Map<Skeleton, Map<string, number>>();
  private view: View | null = null;
  /** the stage's node of a bone, for a skin: given by the stage */
  nodeOf: (node: Node) => number = (node) => node.engineId;
  /** the kept records' totals of see-through drawn solid and of casting from fewer triangles */
  solid = 0;
  casters = 0;
  /** whether the records being made are kept on their node, and so counted in the totals (`write`) */
  private counting = false;

  constructor(private core: Core, private materials: Materials, private geometries: Geometries,
    private seeKinds: SeeKinds) {}

  /** How many meshes are drawn on nodes, and how many of them each frame. */
  get count(): { meshes: number; eachFrame: number } {
    return { meshes: this.entries.size, eachFrame: this.eachFrame.size };
  }

  /** `mesh` drawn from the next frame. */
  add(mesh: Mesh): void {
    const entry: Entry = {
      mesh, drawn: [], skin: NONE, under: [], solid: 0, casters: 0, eachFrame: false, materials: [], geometry: null,
    };
    this.entries.set(mesh, entry);
    this.pending.add(mesh);
  }

  /** `mesh` no longer drawn. */
  remove(mesh: Mesh): void {
    const entry = this.entries.get(mesh);
    if (!entry) return;
    this.dropRecords(entry);
    this.unlist(entry);
    this.eachFrame.delete(entry);
    this.entries.delete(mesh);
    this.pending.delete(mesh);
    const instanced = mesh as InstancedMesh;
    if (instanced.isInstancedMesh) this.instanced.delete(instanced);
  }

  /** What `node` draws to be written again at the next frame. */
  redraw(node: Node): void {
    if (this.entries.has(node as Mesh)) this.pending.add(node as Mesh);
  }

  /** Every mesh's records written again (what was handed over is forgotten). */
  forget(): void {
    for (const entry of this.entries.values()) {
      this.dropRecords(entry);
      this.pending.add(entry.mesh);
    }
    for (const binds of this.skins.values()) for (const id of binds.values()) this.core.engine.drop_skin(id);
    this.skins.clear();
    for (const use of this.materialUse.values()) use.stamp = NaN;
    for (const use of this.geometryUse.values()) use.stamp = NaN;
  }

  /** The frame's views, before anything of it is written. */
  begin(view: View): void {
    this.view = view;
  }

  /** `mesh`'s records written into this frame's alone, as the walk wrote every mesh (a lamp's casters, an outline). */
  recordNow(mesh: Mesh): void {
    this.recordInto(mesh, true);
  }

  /** `mesh`'s records as they'd be kept on its node, copied out (a body drawn as one keeps them on its root's). */
  recordsOf(mesh: Mesh): Float32Array {
    this.scratchCount = 0;
    this.recordInto(mesh, false);
    return this.scratch.slice(0, this.scratchCount * RECORD);
  }

  /**
   * The frame's draws: what changed written again, what's made each frame written into the frame's records. After
   * the stage has placed its nodes, and `begin`.
   */
  frame(seen: (node: Node) => boolean): void {
    const view = this.view!;
    const key = frameKeyOf(view);
    if (key !== this.frameKey) {
      this.frameKey = key;
      // (written again whatever their own inputs: what they're written under is theirs alone, `underOf`)
      for (const [mesh, entry] of this.entries) {
        entry.under = [];
        this.pending.add(mesh);
      }
    }
    for (const [material, use] of this.materialUse) {
      const stamp = this.materialStamp(material);
      if (stamp === use.stamp) continue;
      use.stamp = stamp;
      for (const mesh of use.meshes) this.pending.add(mesh);
    }
    for (const [geometry, use] of this.geometryUse) {
      const stamp = geometryStamp(geometry);
      if (stamp === use.stamp) continue;
      use.stamp = stamp;
      for (const mesh of use.meshes) this.pending.add(mesh);
    }
    for (const [mesh, set] of this.instanced) {
      const now = this.geometries.setId(mesh);
      if (now === set) continue;
      this.instanced.set(mesh, now);
      this.pending.add(mesh);
    }
    // (taken out first: a mesh whose node isn't the engine's yet queues itself again for the next frame)
    const writing = [...this.pending];
    this.pending.clear();
    for (const mesh of writing) {
      const entry = this.entries.get(mesh);
      if (entry) this.write(entry);
    }
    for (const entry of this.eachFrame) if (seen(entry.mesh)) this.recordInto(entry.mesh, true);
  }

  /** `entry`'s records written again where what they're written under changed. */
  private write(entry: Entry): void {
    const mesh = entry.mesh;
    this.list(entry);
    const instanced = mesh as InstancedMesh;
    if (instanced.isInstancedMesh && !this.instanced.has(instanced)) {
      this.instanced.set(instanced, this.geometries.setId(instanced));
    }
    if (this.madeEachFrame(mesh)) {
      if (entry.drawn.length) this.dropRecords(entry);
      this.eachFrame.add(entry);
      return;
    }
    this.eachFrame.delete(entry);
    const under = this.underOf(mesh);
    if (sameList(under, entry.under)) return;
    this.dropRecords(entry);
    entry.under = under.slice();
    this.scratchCount = 0;
    const solid = this.solid, casters = this.casters;
    this.counting = true;
    this.recordInto(mesh, false);
    this.counting = false;
    entry.solid = this.solid - solid;
    entry.casters = this.casters - casters;
    this.keepOnNode(entry);
  }

  /** The records in the scratch kept on `entry`'s node. */
  private keepOnNode(entry: Entry): void {
    const engine = this.core.engine, mesh = entry.mesh as SkinnedMesh;
    const skin = mesh.isSkinnedMesh && mesh.skeleton ? this.skinOf(mesh) : NONE;
    // (a skinned mesh's matrix: its node's after its bind's inverse, or none where it's bound where it stands)
    const attached = skin !== NONE && mesh.bindMode === AttachedBindMode;
    const offset = skin !== NONE && !attached ? new Float32Array(mesh.bindMatrixInverse.elements) : IDENTITY;
    entry.skin = skin;
    // (a body drawn as one: kept on its root's node, culled there by the body's reach, `bodyAsOne.ts`)
    const drawnOn = entry.mesh.userData.drawnOn as Node | undefined;
    if (drawnOn && drawnOn.engineId === NONE) {
      // (its root isn't the engine's yet: written again next frame)
      entry.under = [];
      this.pending.add(entry.mesh);
      return;
    }
    const node = drawnOn ? drawnOn.engineId : entry.mesh.engineId;
    const reach = drawnOn ? entry.mesh.userData.reach as number : this.reachOf(entry.mesh);
    const placed = drawnOn ? false : !attached;
    const placing = drawnOn ? IDENTITY : offset;
    for (let i = 0; i < this.scratchCount; i++) {
      const record = this.scratch.subarray(i * RECORD, (i + 1) * RECORD);
      entry.drawn.push(engine.draw_on_node(node, record, placing, placed, skin, reach));
    }
    this.core.freshViews();
  }

  /** How far `mesh` reaches from its node's place, at its node's size: what the engine culls it by (0: never). */
  private reachOf(mesh: Mesh): number {
    if (!mesh.frustumCulled || (mesh as SkinnedMesh).isSkinnedMesh || (mesh as InstancedMesh).isInstancedMesh) {
      return 0;
    }
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere || !Number.isFinite(sphere.radius)) return 0;
    return sphere.center.length() + sphere.radius;
  }

  /** `entry`'s records let go. */
  private dropRecords(entry: Entry): void {
    const engine = this.core.engine;
    for (const id of entry.drawn) engine.drop_node_drawn(id);
    entry.drawn.length = 0;
    entry.under = [];
    this.solid -= entry.solid;
    this.casters -= entry.casters;
    entry.solid = entry.casters = 0;
  }

  /** `entry` listed under the materials and geometry it draws by now, and off those it drew by. */
  private list(entry: Entry): void {
    const mesh = entry.mesh;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as AnyMaterial[];
    if (entry.geometry !== mesh.geometry || !sameItems(entry.materials, materials)) {
      this.unlist(entry);
      entry.materials = materials.slice();
      entry.geometry = mesh.geometry;
      for (const material of entry.materials) useOf(this.materialUse, material, this.materialStamp(material)).add(mesh);
      useOf(this.geometryUse, mesh.geometry, geometryStamp(mesh.geometry)).add(mesh);
    }
  }

  /** `entry` off the materials and geometry it was listed under. */
  private unlist(entry: Entry): void {
    for (const material of entry.materials) dropUse(this.materialUse, material, entry.mesh);
    if (entry.geometry) dropUse(this.geometryUse, entry.geometry, entry.mesh);
    entry.materials = [];
    entry.geometry = null;
  }

  /** What a material's records read of it now: its engine id, its see-through flags, whether it writes colour. */
  private materialStamp(material: AnyMaterial): number {
    const id = material.visible ? this.materials.materialId(material) : 0;
    const flags = this.seeKinds.flagsOf(material);
    return id * 4096 + flags * 2 + (material.colorWrite === false ? 1 : 0);
  }

  /** Whether `mesh`'s records are made each frame: a look run before its draw, or one listing its own rows. */
  private madeEachFrame(mesh: Mesh): boolean {
    if (mesh.userData.particles || mesh.name === 'dazed stars') return false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some((material) => {
      const look = lookOf(material);
      return !!look?.before || !!look?.list;
    });
  }

  /** What `mesh`'s records are written under now. */
  private underOf(mesh: Mesh): number[] {
    const under = this.under;
    under.length = 0;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as AnyMaterial[];
    for (const material of materials) under.push(this.materialStamp(material));
    const look = Array.isArray(mesh.material) ? undefined : lookOf(mesh.material);
    const range = mesh.geometry.drawRange;
    under.push(this.geometries.geometryId(mesh.geometry, look?.position), range.start, range.count,
      mesh.castShadow ? 1 : 0, mesh.receiveShadow ? 1 : 0, mesh.frustumCulled ? 1 : 0, mesh.layers.mask,
      this.instanced.get(mesh as InstancedMesh) ?? 0, (mesh.geometry as InstancedGeometry).instanceCount ?? 0);
    return under;
  }

  /** `mesh`'s records as the frame's view draws it: into the scratch (kept on its node), or into the frame's own
   *  records (`frame`: made each frame, placed by the matrix written). */
  private recordInto(mesh: Mesh, frame: boolean): void {
    // (the particles' pools are handed over whole: `sprites.ts`)
    if (mesh.userData.particles || mesh.name === 'dazed stars') return;
    const role = this.roleOf(mesh);
    if (role === 'none') return;
    const look = Array.isArray(mesh.material) ? undefined : lookOf(mesh.material);
    if (frame && look?.before) mesh.onBeforeRender?.(mesh);
    const geometry = mesh.geometry;
    // (a geometry of instances it counts itself: each placed by its material's look, from its index)
    const counted = geometry as InstancedGeometry;
    const raw = counted.isInstancedGeometry ? counted.instanceCount : 0;
    if (counted.isInstancedGeometry && (!look || !(raw > 0) || raw === Infinity)) {
      if (!look) this.core.skip('instanced geometry');
      return;
    }
    const geometryId = this.geometries.geometryId(geometry, look?.position);
    if (!geometryId) return;
    const instanced = mesh as InstancedMesh, skinned = mesh as SkinnedMesh;
    if (instanced.isInstancedMesh && instanced.count === 0) return;
    const set = instanced.isInstancedMesh ? this.instanced.get(instanced) ?? this.geometries.setId(instanced) : 0;
    const bones = frame && look?.list ? this.geometries.listOf(look.list()) : skinned.isSkinnedMesh ? 0 : -1;
    const range = geometry.drawRange;
    const from = range.start, to = range.count === Infinity ? Infinity : range.start + range.count;
    const put = (material: AnyMaterial, first: number, count: number, geometryOf: number, rawCount: number,
      cast: Cast): void => this.record(mesh, geometryOf, material, first, count, set, bones, rawCount, cast, role,
      frame);
    if (Array.isArray(mesh.material)) {
      for (const group of geometry.groups) {
        const material = mesh.material[group.materialIndex ?? 0] as AnyMaterial | undefined;
        if (!material || !material.visible) continue;
        const first = Math.max(group.start, from), end = Math.min(group.start + group.count, to);
        if (end > first) put(material, first, end - first, geometryId, 0, 'own');
      }
      return;
    }
    const material = mesh.material as AnyMaterial;
    if (!material.visible) return;
    // (a hero's piece casts from fewer triangles, a record of its own for the shadow alone: `casterGeometry`)
    const whole = to === Infinity && from === 0 && !raw && !set && role !== 'arms' && mesh.castShadow;
    const caster = whole ? casterGeometry(mesh) : null;
    const casterId = caster ? this.geometries.geometryId(caster, look?.position) : 0;
    // (unseen, a piece that casts from fewer triangles is in the frame by those alone)
    if (!(role === 'unseen' && casterId)) {
      put(material, from, to === Infinity ? 0 : range.count, geometryId, raw, casterId ? 'none' : 'own');
    }
    if (casterId) {
      put(material, 0, 0, casterId, 0, 'only');
      if (this.counting) this.casters++;
    }
    // (his arms through his eyes cast their shadow where they are in the world, with his body's)
    if (role === 'arms' && mesh.castShadow) this.recordUnseen(mesh, material, geometryId, from, to, range.count, set,
      bones, frame);
  }

  /** `mesh`'s arms' record again, for their shadow alone. */
  private recordUnseen(mesh: Mesh, material: AnyMaterial, geometryId: number, from: number, to: number,
    count: number, set: number, bones: number, frame: boolean): void {
    this.record(mesh, geometryId, material, from, to === Infinity ? 0 : count, set, bones, 0, 'only', 'unseen', frame);
  }

  /** How the frame's views draw `mesh`. */
  private roleOf(mesh: Mesh): Role {
    const view = this.view!;
    if (mesh.layers.test(view.camera.layers)) return 'seen';
    // (on the arms' layer alone, seen through his eyes: the game draws them with a camera of their own, which the
    // engine's frame has in it. Left out, he held nothing: from play, "no warrior weapon in first person")
    if (view.arms && mesh.layers.test(view.arms.layers)) return 'arms';
    // (his body through his eyes, on the layer no camera draws: unseen, its shadow cast as he stands)
    if (mesh.userData.castsUnseen && mesh.castShadow) return 'unseen';
    return 'none';
  }

  /** One record of `mesh`: into the scratch, or the frame's records. */
  private record(mesh: Mesh, geometryId: number, material: AnyMaterial, first: number, count: number, set: number,
    bones: number, raw: number, cast: Cast, role: Role, frame: boolean): void {
    const core = this.core, grade = this.view!.grade;
    if (role === 'unseen' && cast === 'own') cast = 'only';
    const materialId = this.materials.materialId(material);
    if (!materialId) {
      core.skip(material.type);
      return;
    }
    const r = frame ? this.frameRecord() : this.scratchRecord();
    const at = frame ? core.count * RECORD : this.scratchCount * RECORD;
    r[at] = geometryId;
    r[at + 1] = materialId;
    r[at + 2] = first;
    r[at + 3] = count;
    r[at + 4] = set;
    r[at + 5] = bones;
    // (a body moved by its bones casts only where the game says; the village's still things cast whatever a
    // level's least caster: `TUNE.castAll`)
    const still = !(mesh as SkinnedMesh).isSkinnedMesh;
    const casts = cast !== 'none' && (mesh.castShadow || (TUNE.castAll && mesh.receiveShadow && still
      && radiusOf(mesh) >= (grade.casterLeast ?? 0)));
    const sees = this.seeKinds.flagsOf(material);
    let flags = (casts ? CASTS_SHADOW : 0) | (mesh.frustumCulled ? 0 : NEVER_CULLED)
      | (material.colorWrite === false || cast === 'only' || sees & SEE_FLAGS.gone ? SHADOW_ONLY : 0)
      | (sees & ~SEE_FLAGS.gone)
      // (what a game marks as costing by its pixels, `userData.lowRes`, and the fires' flames: at a share of them)
      | (TUNE.lowRes && (mesh.userData.lowRes || mesh.userData.fireFlames) ? LOW_RES : 0);
    if (flags & SOLID && this.counting) this.solid++;
    // (his arms through his eyes: by their own view, never culled by the world's, casting nothing)
    if (role === 'arms' && cast !== 'only') flags = ARMS | NEVER_CULLED;
    r[at + 6] = flags;
    r[at + RAW_INSTANCES] = raw;
    const skinned = mesh as SkinnedMesh;
    if (skinned.isSkinnedMesh && frame) {
      scratchMatrix.multiplyMatrices(mesh.matrixWorld, skinned.bindMatrixInverse).toArray(r, at + 8);
    } else {
      r.set(mesh.matrixWorld.elements, at + 8);
    }
    if (frame) core.count++;
    else this.scratchCount++;
  }

  /** The frame's records, with room for one more. */
  private frameRecord(): Float32Array {
    const core = this.core;
    if (core.count === core.capacity) core.takeViews(core.capacity * 2, core.boneCapacity);
    return core.records;
  }

  /** The scratch, with room for one more. */
  private scratchRecord(): Float32Array {
    if ((this.scratchCount + 1) * RECORD > this.scratch.length) {
      const grown = new Float32Array(this.scratch.length * 2);
      grown.set(this.scratch);
      this.scratch = grown;
    }
    return this.scratch;
  }

  /** The engine's skin for `mesh`'s skeleton and bind: its joints the bones' nodes, each bone's inverse bind with
   *  the mesh's bind after it. */
  private skinOf(mesh: SkinnedMesh): number {
    const skeleton = mesh.skeleton!;
    const key = `${skeleton.version}|${mesh.bindMatrix.elements.join(',')}`;
    let binds = this.skins.get(skeleton);
    const known = binds?.get(key);
    if (known !== undefined) return known;
    const joints = skeleton.bones.map((bone) => this.nodeOf(bone));
    const inverses = new Float32Array(skeleton.bones.length * 16);
    const folded = new Mat4();
    skeleton.boneInverses.forEach((inverse, at) => {
      inverses.set(folded.multiplyMatrices(inverse, mesh.bindMatrix).elements, at * 16);
    });
    const id = this.core.engine.add_skin(Uint32Array.from(joints), inverses);
    if (!binds) this.skins.set(skeleton, binds = new Map());
    binds.set(key, id);
    return id;
  }

  /** Each mesh drawn on the nodes, with records in the engine (a harness's: what was handed over). */
  eachDrawn(visit: (mesh: Mesh) => void): void {
    for (const entry of this.entries.values()) if (entry.drawn.length || entry.eachFrame) visit(entry.mesh);
  }
}

/** The frame's switches every record reads, as one key. */
function frameKeyOf(view: View): string {
  const arms = view.arms ? view.arms.layers.mask : -1;
  return `${TUNE.castAll}|${TUNE.lowRes}|${view.grade.casterLeast ?? 0}|${view.camera.layers.mask}|${arms}`;
}

/** What a geometry's records read of it: its own version and its attributes' and index's. */
function geometryStamp(geometry: Geometry): number {
  let stamp = geometry.version * 65536;
  for (const name in geometry.attributes) stamp += geometry.attributes[name].version;
  return stamp + (geometry.index?.version ?? 0) * 256;
}

/** each still mesh's radius in the world (m), found once: it doesn't move */
const radii = new WeakMap<Mesh, number>();

/** How far a still mesh reaches from its middle (m): a level keeps what's smaller than its least caster from casting
 *  the sun's shadow (`minCasterRadius`), and the still things taken for casters (`TUNE.castAll`) whatever their
 *  size. */
function radiusOf(mesh: Mesh): number {
  let radius = radii.get(mesh);
  if (radius === undefined) {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    radius = (mesh.geometry.boundingSphere?.radius ?? Infinity) * mesh.matrixWorld.getMaxScaleOnAxis();
    radii.set(mesh, radius);
  }
  return radius;
}

/** The meshes listed under `key` (listed first, at `stamp`, if it wasn't). */
function useOf<K>(uses: Map<K, Use>, key: K, stamp: number): Set<Mesh> {
  let use = uses.get(key);
  if (!use) uses.set(key, use = { stamp, meshes: new Set() });
  return use.meshes;
}

/** `mesh` off `key`'s list, and the list gone once empty. */
function dropUse<K>(uses: Map<K, Use>, key: K, mesh: Mesh): void {
  const use = uses.get(key);
  if (!use) return;
  use.meshes.delete(mesh);
  if (!use.meshes.size) uses.delete(key);
}

/** Whether two lists hold the same numbers. */
function sameList(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Whether two lists hold the same things in the same order. */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
