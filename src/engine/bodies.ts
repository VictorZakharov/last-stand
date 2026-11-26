// The foes drawn as one, kept by the engine as nodes (Bulwark's nodes.rs, VictorZakharov/last-stand#973): a body's
// joints and every object over them up to the scene are nodes the engine places, its meshes records drawn on its
// root's node, skinned by the engine from its joints and culled by its sphere there. A frame writes each node's
// place, turn, size and whether it's shown, ten numbers and a byte, and reads the matrices back for what the game
// reads of them (an arrow's ray, the aim, a head's joint): no matrix is made here, no bone and no record written.
// Made here, a wave 36's 34 foes were half the page's work a frame: the bridge's placing, its skeletons' bones and
// its records (`lab perf --wave 36 --profile`). The bridge's placing passes a node's object by (`onNode`), and
// places what hangs under it that isn't one (a lodged arrow) from the matrix read back.
import * as THREE from 'three';
import type { Core } from './core';
import { RECORD } from './core';
import { tunable } from '../core/tuning';
import { eachAsOne, holderAsOne, type AsOne } from '../entities/models/bodyAsOne';
import type { CrowdBody } from '../entities/models/crowd';
import type { AnyMaterial, Materials } from './materials';

/** whether the foes drawn as one are kept as the engine's nodes (1) or written a record and a bone a frame (0) */
export const BODY_NODES = tunable('bodyNodes', { on: 1 });

/** no node: the engine's `nodes::NONE` */
const NONE = 0xffffffff;
/** a node's numbers: its place, its turn, its size */
const LOCAL = 10;
const IDENTITY = new Float32Array(new THREE.Matrix4().elements);
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** An object of the scene as a node: its id, and how many bodies hang under it (shared ancestors are held once). */
interface Held {
  id: number;
  users: number;
  /** the node of the object it hung under as last written (`NONE`: the scene) */
  parent: number;
}

/** A slot mesh's records drawn on its body's root: their ids, and what they were written under. */
interface Slot {
  mesh: THREE.SkinnedMesh;
  drawn: number[];
  materialId: number;
  casts: boolean;
}

/** A body taken: the objects it holds as nodes, its skin, its root's node and its slots. */
interface Taken {
  objects: THREE.Object3D[];
  skin: number;
  rootNode: number;
  slots: Slot[];
  reach: number;
}

/** Whether `object` is placed by the engine's nodes, its matrix read back each frame: the bridge's placing passes
 *  it by. */
export const onNode = (object: THREE.Object3D): boolean => object.userData.node !== undefined;

/** The records `mesh` is drawn by, as the bridge writes them a frame (`Bridge.recordsOf`). */
export type RecordsOf = (mesh: THREE.Mesh) => Float32Array;

export class Bodies {
  private held = new Map<THREE.Object3D, Held>();
  /** every node's object by its id, for its numbers written and its matrix read back */
  private objects: (THREE.Object3D | null)[] = [];
  private taken = new Map<CrowdBody, Taken>();
  private locals = new Float32Array(0);
  private shown = new Uint8Array(0);
  private worlds = new Float32Array(0);
  /** the bodies seen drawn as one this frame */
  private seen = new Set<CrowdBody>();

  constructor(private core: Core, private wasm: { memory: WebAssembly.Memory }, private materials: Materials) {}

  /** How many bodies the engine holds as nodes. */
  get count(): number { return this.taken.size; }

  /**
   * The frame's bodies handed to the engine: those drawn as one since taken, those left let go, each slot's records
   * written again where its material's id or its casting changed, every node's numbers written, and the engine's
   * matrices read back onto the objects. Before the bridge's placing, which passes the nodes by.
   */
  place(recordsOf: RecordsOf): void {
    const holder = holderAsOne();
    if (!BODY_NODES.on) {
      this.letAllGo();
      if (holder) holder.visible = true;
      return;
    }
    // (the walk draws none of the bodies' meshes: the engine does)
    if (holder) holder.visible = false;
    this.seen.clear();
    eachAsOne((body, one) => {
      this.seen.add(body);
      const taken = this.taken.get(body) ?? this.take(body, one, recordsOf);
      this.keepSlots(taken, recordsOf);
    });
    for (const body of this.taken.keys()) {
      if (!this.seen.has(body)) this.leave(body);
    }
    if (!this.taken.size) return;
    this.views();
    this.writeNumbers();
    this.core.engine.place_nodes();
    this.views();
    this.readBack();
  }

  /** `body` held as nodes: its joints and what's over them, its skin, its meshes' records. */
  private take(body: CrowdBody, one: AsOne, recordsOf: RecordsOf): Taken {
    const engine = this.core.engine;
    const objects: THREE.Object3D[] = [];
    const nodeOf = (object: THREE.Object3D): number => this.hold(object, objects);
    const joints = one.skeleton.bones.map((bone) => nodeOf(bone));
    const rootNode = nodeOf(body.model.root);
    const inverses = new Float32Array(one.skeleton.boneInverses.length * 16);
    one.skeleton.boneInverses.forEach((inverse, at) => inverses.set(inverse.elements, at * 16));
    const skin = engine.add_skin(Uint32Array.from(joints), inverses);
    const taken: Taken = { objects, skin, rootNode, slots: [], reach: one.reach };
    for (const mesh of one.meshes) taken.slots.push({ mesh, drawn: [], materialId: -1, casts: mesh.castShadow });
    this.taken.set(body, taken);
    this.core.freshViews();
    return taken;
  }

  /** `object` held as a node (and everything over it up to the scene), counted as `objects`'s once: its id. */
  private hold(object: THREE.Object3D, objects: THREE.Object3D[]): number {
    const known = this.held.get(object);
    if (known) {
      if (!objects.includes(object)) {
        known.users++;
        objects.push(object);
      }
      return known.id;
    }
    const parent = object.parent && !(object.parent as THREE.Scene).isScene ? this.hold(object.parent, objects) : NONE;
    const id = this.core.engine.add_node(parent);
    this.held.set(object, { id, users: 1, parent });
    objects.push(object);
    this.objects[id] = object;
    object.userData.node = id;
    return id;
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
      const records = recordsOf(slot.mesh);
      for (let at = 0; at < records.length; at += RECORD) {
        const record = records.subarray(at, at + RECORD);
        slot.drawn.push(engine.draw_on_node(taken.rootNode, record, IDENTITY, false, taken.skin, taken.reach));
      }
      this.core.freshViews();
    }
  }

  /** `body` let go: its records, its skin, and the nodes no other body holds. */
  private leave(body: CrowdBody): void {
    const taken = this.taken.get(body)!;
    const engine = this.core.engine;
    this.taken.delete(body);
    for (const slot of taken.slots) for (const id of slot.drawn) engine.drop_node_drawn(id);
    engine.drop_skin(taken.skin);
    for (const object of taken.objects) {
      const held = this.held.get(object);
      if (!held || --held.users > 0) continue;
      this.held.delete(object);
      engine.drop_node(held.id);
      this.objects[held.id] = null;
      delete object.userData.node;
      object.matrixWorldNeedsUpdate = true;
    }
  }

  /** Every body let go, to be taken again by the next frame: what was handed over is forgotten (`Bridge.forget`). */
  forget(): void {
    this.letAllGo();
  }

  /** Every body let go (the nodes switched off). */
  private letAllGo(): void {
    for (const body of [...this.taken.keys()]) this.leave(body);
  }

  /** The engine's arrays viewed again where adding nodes or growing its memory moved them. */
  private views(): void {
    const engine = this.core.engine, memory = this.wasm.memory.buffer, count = this.objects.length;
    const localsAt = engine.node_locals(), shownAt = engine.node_shown(), worldsAt = engine.node_worlds();
    if (this.locals.buffer !== memory || this.locals.byteOffset !== localsAt || this.locals.length < count * LOCAL) {
      this.locals = new Float32Array(memory, localsAt, count * LOCAL);
    }
    if (this.shown.buffer !== memory || this.shown.byteOffset !== shownAt || this.shown.length < count) {
      this.shown = new Uint8Array(memory, shownAt, count);
    }
    if (this.worlds.buffer !== memory || this.worlds.byteOffset !== worldsAt || this.worlds.length < count * 16) {
      this.worlds = new Float32Array(memory, worldsAt, count * 16);
    }
  }

  /** Each node's place, turn, size and whether it's shown, as its object has them now. */
  private writeNumbers(): void {
    const locals = this.locals, shown = this.shown;
    for (let id = 0; id < this.objects.length; id++) {
      const object = this.objects[id];
      if (!object) continue;
      let p = object.position, q = object.quaternion, s = object.scale;
      // (an object placed by its matrix alone: its numbers are the matrix's)
      if (!object.matrixAutoUpdate) {
        object.matrix.decompose(_p, _q, _s);
        p = _p;
        q = _q;
        s = _s;
      }
      const at = id * LOCAL;
      locals[at] = p.x;
      locals[at + 1] = p.y;
      locals[at + 2] = p.z;
      locals[at + 3] = q.x;
      locals[at + 4] = q.y;
      locals[at + 5] = q.z;
      locals[at + 6] = q.w;
      locals[at + 7] = s.x;
      locals[at + 8] = s.y;
      locals[at + 9] = s.z;
      shown[id] = object.visible ? 1 : 0;
      this.keepParent(object, id);
    }
  }

  /** `object`'s node moved under its object's parent where the game moved it (a parent that's no node, nor the
   *  scene, is left as it was: hidden from its body's draw till it's taken again). */
  private keepParent(object: THREE.Object3D, id: number): void {
    const held = this.held.get(object)!;
    const parent = object.parent;
    const now = !parent || (parent as THREE.Scene).isScene ? NONE : (parent.userData.node as number | undefined);
    if (now === undefined) {
      this.shown[id] = 0;
      return;
    }
    if (now === held.parent) return;
    held.parent = now;
    this.core.engine.set_node_parent(id, now);
  }

  /** The engine's matrices onto the objects, for what reads them this frame and what hangs under them. */
  private readBack(): void {
    const worlds = this.worlds;
    for (let id = 0; id < this.objects.length; id++) {
      const object = this.objects[id];
      if (!object) continue;
      const elements = object.matrixWorld.elements;
      for (let i = 0, at = id * 16; i < 16; i++, at++) elements[i] = worlds[at];
      object.matrixWorldNeedsUpdate = false;
    }
  }

  /** Each mesh drawn on the nodes with records in the engine, its body shown (a harness's: what was handed over). */
  eachDrawn(visit: (mesh: THREE.Mesh) => void): void {
    for (const taken of this.taken.values()) {
      if (!this.seenNode(taken.rootNode)) continue;
      for (const slot of taken.slots) if (slot.drawn.length) visit(slot.mesh);
    }
  }

  /** Whether a node's object and all over it are shown, as last written. */
  private seenNode(id: number): boolean {
    for (let at: THREE.Object3D | null = this.objects[id]; at && !(at as THREE.Scene).isScene; at = at.parent) {
      if (!at.visible) return false;
    }
    return true;
  }

  /** What the last frame drew of the nodes: their records, their bones' floats, how many were out of view, and how
   *  many nodes the engine holds. */
  drawn(): { records: number; boneFloats: number; culled: number; nodes: number } {
    const [records, boneFloats, culled, nodes] = this.core.engine.nodes_drawn();
    return { records, boneFloats, culled, nodes };
  }
}
