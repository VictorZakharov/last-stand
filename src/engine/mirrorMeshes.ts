// The meshes of what's handed over to the engine's nodes (`mirror.ts`), drawn on their nodes: a mesh's records are
// written once and kept by the engine, its matrix the node's each frame and its bones the engine's from its joints,
// and written again only where what they were written under changed (its materials' ids, its geometry's, whether
// it casts, its range, a see-through's kind, the frame's grade). What's made each frame (a light, a set of instances,
// a look run before its draw or listing its own rows, the particles, a mesh off the camera's layers: his arms
// through his eyes) is left to the bridge's walk as before (`rest`), placed by its node.
import * as THREE from 'three';
import { RECORD, type Core } from './core';
import { lookOf } from './custom';
import { TUNE } from './globals';
import type { Geometries } from './geometry';
import type { AnyMaterial, Materials } from './materials';
import type { SeeKinds } from './seeKinds';
import type { Mirror, MirrorWatcher } from './mirror';
import { NONE } from './mirror';

const IDENTITY = new Float32Array(new THREE.Matrix4().elements);

/** The records a mesh is drawn by as the bridge writes them (`Bridge.recordsOf`), and how many of them are
 *  see-through drawn solid and how many cast from fewer triangles (counted in the frame's stats as it's drawn). */
export interface Recorded {
  records: Float32Array;
  solid: number;
  casters: number;
}
export type RecordsOf = (mesh: THREE.Mesh) => Recorded;

/** A mesh drawn on its node: its records' ids in the engine, its skin, and what they were written under. */
interface Entry {
  mesh: THREE.Mesh;
  node: number;
  drawn: number[];
  skin: number;
  /** what its records were written under, as a list compared each frame */
  under: number[];
  /** how many of its records are see-through drawn solid, and how many cast from fewer triangles */
  solid: number;
  casters: number;
}

/** Whether `mesh` is drawn by no view at all: on no layer the camera or his arms' view draws, nor casting unseen (a
 *  foe's pieces drawn as one, on the crowd's layer). */
function drawnByNone(mesh: THREE.Mesh, camera: THREE.Camera, arms: THREE.Camera | null): boolean {
  if (mesh.layers.test(camera.layers) || (arms && mesh.layers.test(arms.layers))) return false;
  return !(mesh.userData.castsUnseen && mesh.castShadow);
}

/** Whether `mesh`'s records are made each frame (the walk's), not kept on its node. */
function madeEachFrame(mesh: THREE.Mesh, camera: THREE.Camera): boolean {
  if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return true;
  if ((mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return true;
  if (mesh.userData.particles || mesh.name === 'dazed stars') return true;
  if (!mesh.layers.test(camera.layers)) return true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => {
    const look = lookOf(material);
    return !!look?.before || !!look?.list;
  });
}

export class MirrorMeshes implements MirrorWatcher {
  private entries = new Map<THREE.Mesh, Entry>();
  /** what's handed over but made each frame: the walk visits these, where they're shown */
  private others = new Set<THREE.Object3D>();
  /** the skins by skeleton and bind, made once */
  private skins = new Map<THREE.Skeleton, Map<string, number>>();
  private mirror: Mirror | null = null;
  private under: number[] = [];

  constructor(private core: Core, private materials: Materials, private geometries: Geometries,
    private seeKinds: SeeKinds) {}

  /** The mirror whose nodes these meshes are drawn on. */
  watch(mirror: Mirror): void { this.mirror = mirror; }

  /** What's handed over that the walk visits each frame (lights, what's made each frame), as its objects. */
  get rest(): ReadonlySet<THREE.Object3D> { return this.others; }

  added(object: THREE.Object3D, node: number): void {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      if ((object as THREE.Light).isLight || (object as THREE.Points).isPoints || (object as THREE.Line).isLine
        || (object as THREE.Sprite).isSprite) {
        this.others.add(object);
      }
      return;
    }
    this.entries.set(mesh, { mesh, node, drawn: [], skin: NONE, under: [], solid: 0, casters: 0 });
  }

  removed(object: THREE.Object3D): void {
    this.others.delete(object);
    const entry = this.entries.get(object as THREE.Mesh);
    if (!entry) return;
    this.dropRecords(entry);
    this.entries.delete(object as THREE.Mesh);
  }

  /**
   * Each mesh's records drawn again where what they were written under changed, a mesh made each frame left to the
   * walk; its records' counts added to the frame's. After the nodes are placed (their matrices read back), in the
   * frame, with `camera` its view.
   */
  keep(camera: THREE.Camera, arms: THREE.Camera | null, recordsOf: RecordsOf): void {
    const stats = this.core.stats;
    for (const entry of this.entries.values()) {
      const mesh = entry.mesh;
      if (drawnByNone(mesh, camera, arms)) {
        if (entry.drawn.length) this.dropRecords(entry);
        this.others.delete(mesh);
        continue;
      }
      if (madeEachFrame(mesh, camera)) {
        if (entry.drawn.length) this.dropRecords(entry);
        this.others.add(mesh);
        continue;
      }
      this.others.delete(mesh);
      const under = this.underOf(mesh);
      if (!sameList(under, entry.under)) this.writeRecords(entry, under, recordsOf);
      if (entry.drawn.length && this.mirror!.seen(mesh)) {
        stats.solid += entry.solid;
        stats.casters += entry.casters;
      }
    }
  }

  /** What `mesh`'s records are written under now: its materials' and geometry's ids (each sent again if they
   *  moved), whether it casts, its range, its see-through's kinds, the grade's switches a record reads. */
  private underOf(mesh: THREE.Mesh): number[] {
    const under = this.under;
    under.length = 0;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials as AnyMaterial[]) {
      under.push(material.visible ? this.materials.materialId(material) : 0, this.seeKinds.flagsOf(material),
        material.colorWrite === false ? 1 : 0);
    }
    const look = Array.isArray(mesh.material) ? undefined : lookOf(mesh.material);
    under.push(this.geometries.geometryId(mesh.geometry, look?.position), mesh.geometry.drawRange.start,
      mesh.geometry.drawRange.count, mesh.castShadow ? 1 : 0, mesh.receiveShadow ? 1 : 0, mesh.frustumCulled ? 1 : 0,
      TUNE.castAll ? 1 : 0, TUNE.lowRes ? 1 : 0);
    return under;
  }

  /** `entry`'s records written again under `under`: taken from the bridge and kept on its node. */
  private writeRecords(entry: Entry, under: number[], recordsOf: RecordsOf): void {
    const engine = this.core.engine;
    this.dropRecords(entry);
    entry.under = under.slice();
    const { records, solid, casters } = recordsOf(entry.mesh);
    const skinned = entry.mesh as THREE.SkinnedMesh;
    const skin = skinned.isSkinnedMesh && skinned.skeleton ? this.skinOf(skinned) : NONE;
    // (a skinned mesh's matrix: its node's after its bind's inverse, or none where it's bound where it stands)
    const attached = skin !== NONE && skinned.bindMode === THREE.AttachedBindMode;
    const offset = skin !== NONE && !attached ? new Float32Array(skinned.bindMatrixInverse.elements) : IDENTITY;
    entry.skin = skin;
    entry.solid = solid;
    entry.casters = casters;
    for (let at = 0; at < records.length; at += RECORD) {
      const record = records.subarray(at, at + RECORD);
      entry.drawn.push(engine.draw_on_node(entry.node, record, offset, !attached, skin, 0));
    }
    this.core.freshViews();
  }

  /** `entry`'s records let go. */
  private dropRecords(entry: Entry): void {
    const engine = this.core.engine;
    for (const id of entry.drawn) engine.drop_node_drawn(id);
    entry.drawn.length = 0;
    entry.under = [];
  }

  /** The engine's skin for `mesh`'s skeleton and bind: its joints the bones' nodes, each bone's inverse bind with the
   *  mesh's bind after it (as the bridge wrote its bones). */
  private skinOf(mesh: THREE.SkinnedMesh): number {
    const skeleton = mesh.skeleton;
    const key = mesh.bindMatrix.elements.join(',');
    let binds = this.skins.get(skeleton);
    const known = binds?.get(key);
    if (known !== undefined) return known;
    const mirror = this.mirror!;
    const joints = skeleton.bones.map((bone) => mirror.nodeOf(bone) ?? mirror.hold(bone));
    const inverses = new Float32Array(skeleton.bones.length * 16);
    const folded = new THREE.Matrix4();
    skeleton.boneInverses.forEach((inverse, at) => {
      inverses.set(folded.multiplyMatrices(inverse, mesh.bindMatrix).elements, at * 16);
    });
    const id = this.core.engine.add_skin(Uint32Array.from(joints), inverses);
    if (!binds) this.skins.set(skeleton, binds = new Map());
    binds.set(key, id);
    return id;
  }

  /** Each mesh drawn on the nodes, its records in the engine and it shown (a harness's: what was handed over). */
  eachDrawn(visit: (mesh: THREE.Mesh) => void): void {
    for (const entry of this.entries.values()) {
      if (entry.drawn.length && this.mirror!.seen(entry.mesh)) visit(entry.mesh);
    }
  }

  /** Every record and skin let go (what was handed over is forgotten). */
  forget(): void {
    for (const entry of this.entries.values()) this.dropRecords(entry);
    for (const binds of this.skins.values()) for (const id of binds.values()) this.core.engine.drop_skin(id);
    this.skins.clear();
  }
}

/** Whether two lists hold the same numbers. */
function sameList(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
