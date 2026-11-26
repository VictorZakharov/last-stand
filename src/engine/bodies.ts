// The foes drawn as one on the engine's nodes (Bulwark's nodes.rs, VictorZakharov/last-stand#973): a body's meshes
// are records drawn on its root's node, skinned by the engine from its joints' nodes (the mirror's, `mirror.ts`:
// its foe handed over whole) and culled by its sphere there. Written a record and its bones a frame, a wave 36's 34
// foes were half the page's work a frame with their placing (`lab perf --wave 36 --profile`).
import * as THREE from 'three';
import type { Core } from './core';
import { RECORD } from './core';
import { tunable } from '../core/tuning';
import { eachAsOne, holderAsOne, type AsOne } from '../entities/models/bodyAsOne';
import type { CrowdBody } from '../entities/models/crowd';
import type { AnyMaterial, Materials } from './materials';
import type { Mirror } from './mirror';
import type { RecordsOf } from './mirrorMeshes';

/** whether the scene's moving parts are the engine's nodes (1) or written a record and a bone a frame (0) */
export const BODY_NODES = tunable('bodyNodes', { on: 1 });

const IDENTITY = new Float32Array(new THREE.Matrix4().elements);

/** A slot mesh's records drawn on its body's root: their ids, and what they were written under. */
interface Slot {
  mesh: THREE.SkinnedMesh;
  drawn: number[];
  materialId: number;
  casts: boolean;
}

/** A body taken: the objects it holds as nodes (its joints, then its root), its skin, its root's node and its
 *  slots. */
interface Taken {
  held: THREE.Object3D[];
  skin: number;
  rootNode: number;
  slots: Slot[];
  reach: number;
}

export class Bodies {
  private taken = new Map<CrowdBody, Taken>();
  /** the bodies seen drawn as one this frame */
  private seen = new Set<CrowdBody>();

  constructor(private core: Core, private materials: Materials, private mirror: Mirror) {}

  /** How many bodies the engine holds as nodes. */
  get count(): number { return this.taken.size; }

  /** The frame's bodies drawn as one handed to the engine: those since taken, those left let go, each slot's records
   *  written again where its material's id or its casting changed. Before the nodes are placed. */
  sync(recordsOf: RecordsOf): void {
    const holder = holderAsOne();
    if (!BODY_NODES.on) {
      this.forget();
      if (holder) holder.visible = true;
      return;
    }
    // (the walk draws none of the bodies' meshes: the engine does)
    if (holder) holder.visible = false;
    this.seen.clear();
    eachAsOne((body, one) => {
      this.seen.add(body);
      const taken = this.taken.get(body) ?? this.take(body, one);
      this.keepSlots(taken, recordsOf);
    });
    for (const body of this.taken.keys()) {
      if (!this.seen.has(body)) this.leave(body);
    }
  }

  /** `body` drawn on nodes: its joints' and its root's, its skin, its meshes' records. */
  private take(body: CrowdBody, one: AsOne): Taken {
    const held = [...one.skeleton.bones, body.model.root];
    const joints = one.skeleton.bones.map((bone) => this.mirror.hold(bone));
    const rootNode = this.mirror.hold(body.model.root);
    const inverses = new Float32Array(one.skeleton.boneInverses.length * 16);
    one.skeleton.boneInverses.forEach((inverse, at) => inverses.set(inverse.elements, at * 16));
    const skin = this.core.engine.add_skin(Uint32Array.from(joints), inverses);
    const taken: Taken = { held, skin, rootNode, slots: [], reach: one.reach };
    for (const mesh of one.meshes) taken.slots.push({ mesh, drawn: [], materialId: -1, casts: mesh.castShadow });
    this.taken.set(body, taken);
    this.core.freshViews();
    return taken;
  }

  /** A slot's records drawn again where what they were written under moved: its material's id, its casting. */
  private keepSlots(taken: Taken, recordsOf: RecordsOf): void {
    const engine = this.core.engine;
    for (const slot of taken.slots) {
      const material = slot.mesh.material as AnyMaterial;
      const materialId = material.visible ? this.materials.materialId(material) : 0;
      const casts = slot.mesh.castShadow;
      if (materialId === slot.materialId && casts === slot.casts) continue;
      for (const id of slot.drawn) engine.drop_node_drawn(id);
      slot.drawn.length = 0;
      slot.materialId = materialId;
      slot.casts = casts;
      if (!materialId) continue;
      const { records } = recordsOf(slot.mesh);
      for (let at = 0; at < records.length; at += RECORD) {
        const record = records.subarray(at, at + RECORD);
        slot.drawn.push(engine.draw_on_node(taken.rootNode, record, IDENTITY, false, taken.skin, taken.reach));
      }
      this.core.freshViews();
    }
  }

  /** `body` let go: its records, its skin, and its holds on its nodes. */
  private leave(body: CrowdBody): void {
    const taken = this.taken.get(body)!;
    const engine = this.core.engine;
    this.taken.delete(body);
    for (const slot of taken.slots) for (const id of slot.drawn) engine.drop_node_drawn(id);
    engine.drop_skin(taken.skin);
    for (const object of taken.held) this.mirror.release(object);
  }

  /** Every body let go, to be taken again by the next frame (what was handed over is forgotten, or nodes are off). */
  forget(): void {
    for (const body of [...this.taken.keys()]) this.leave(body);
  }

  /** Each mesh drawn on the nodes with records in the engine, its body shown (a harness's: what was handed over). */
  eachDrawn(visit: (mesh: THREE.Mesh) => void): void {
    for (const taken of this.taken.values()) {
      if (!this.mirror.seen(taken.held[taken.held.length - 1])) continue;
      for (const slot of taken.slots) if (slot.drawn.length) visit(slot.mesh);
    }
  }

  /** What the last frame drew of the nodes: their records, their bones' floats, how many were out of view, and how
   *  many nodes the engine holds. */
  drawn(): { records: number; boneFloats: number; culled: number; nodes: number } {
    const [records, boneFloats, culled, nodes] = this.core.engine.nodes_drawn();
    return { records, boneFloats, culled, nodes };
  }
}
