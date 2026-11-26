// The scene's moving parts as the engine's nodes (Bulwark's nodes.rs, VictorZakharov/last-stand#973): what the game
// hands over (a hero's or a foe's root, `take`) is held as nodes from the scene down to its every object, followed
// as the game adds and takes away its children (three's `childadded` and `childremoved`), and its meshes are drawn
// on their nodes (`mirrorMeshes.ts`). A frame writes each node's place, turn, size and whether it's shown, ten
// numbers and a byte, has the engine place them all, and reads the matrices back onto the objects for what the game
// reads of them: no walk of what's handed over, no matrix made here, no record written a frame. The bridge's placing
// and its walk pass a root that's handed over by whole (`mirrored`). What a body drawn as one asks for is held here
// too (`hold`: its joints, `bodies.ts`).
import * as THREE from './three.ts';
import type { Core } from './core';

/** no node: the engine's `nodes::NONE` */
export const NONE = 0xffffffff;
/** a node's numbers: its place, its turn, its size */
const LOCAL = 10;
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** An object of the scene as a node: its id, who holds it (its root handed over, or a body's joints: counted), and
 *  the node of the object it hung under as last written (`NONE`: the scene). */
interface Held {
  id: number;
  users: number;
  parent: number;
  /** the object it was held under, whose hold it let go with its own (three clears `parent` before it says so) */
  over: THREE.Object3D | null;
}

/** Whether `object` is placed by the engine's nodes, its matrix read back each frame. */
export const onNode = (object: THREE.Object3D): boolean => object.userData.node !== undefined;

/** Whether `object` is a root handed over whole: its subtree is the engine's to place and draw. */
export const mirrored = (object: THREE.Object3D): boolean => object.userData.mirrored === true;

/** What's told of the objects handed over as they come and go: a mesh to draw on its node, or one let go. */
export interface MirrorWatcher {
  added(object: THREE.Object3D, node: number): void;
  removed(object: THREE.Object3D): void;
}

export class Mirror {
  private held = new Map<THREE.Object3D, Held>();
  /** every node's object by its id, for its numbers written and its matrix read back */
  private objects: (THREE.Object3D | null)[] = [];
  /** the roots handed over whole */
  private roots = new Set<THREE.Object3D>();
  private locals = new Float32Array(0);
  private shown = new Uint8Array(0);
  private worlds = new Float32Array(0);
  private matrices = new Float32Array(0);
  /** a handed-over object's children added and taken away, as three tells them */
  private readonly onAdded = (event: { child: THREE.Object3D | null }): void => {
    if (event.child) this.takeUnder(event.child);
  };
  private readonly onRemoved = (event: { child: THREE.Object3D | null }): void => {
    if (event.child) this.leaveUnder(event.child);
  };

  constructor(private core: Core, private wasm: { memory: WebAssembly.Memory }, private watcher: MirrorWatcher) {}

  /** How many objects are held as nodes, and how many roots are handed over whole. */
  get count(): { nodes: number; roots: number } {
    return { nodes: this.held.size, roots: this.roots.size };
  }

  /** The roots handed over whole. */
  get rootsNow(): ReadonlySet<THREE.Object3D> { return this.roots; }

  /** `root` handed over whole, from now on: it, everything under it, and what's over it up to the scene. */
  take(root: THREE.Object3D): void {
    if (this.roots.has(root)) return;
    this.roots.add(root);
    root.userData.mirrored = true;
    this.takeUnder(root);
  }

  /** `root` no longer handed over: the nodes of what's under it let go, unless something else holds them. */
  leave(root: THREE.Object3D): void {
    if (!this.roots.delete(root)) return;
    delete root.userData.mirrored;
    this.leaveUnder(root);
  }

  /** Every root handed back (what was handed over is forgotten: `Bridge.forget`). */
  leaveAll(): void {
    for (const root of [...this.roots]) this.leave(root);
  }

  /** `object` and what's under it held, each watched for its children and told to the watcher; a piece of a body drawn
   *  as one isn't (`userData.unplaced`: drawn by its body, placed where it's read, `models/bodyAsOne.ts`). As
   *  nodes, a wave 36's pieces were 1,300 of them, written and read back each frame for nothing. */
  private takeUnder(object: THREE.Object3D): void {
    object.traverse((each) => {
      if (each.userData.unplaced) return;
      const id = this.hold(each);
      each.addEventListener('childadded', this.onAdded as never);
      each.addEventListener('childremoved', this.onRemoved as never);
      this.watcher.added(each, id);
    });
  }

  /** `object` and what's under it let go. */
  private leaveUnder(object: THREE.Object3D): void {
    object.traverse((each) => {
      if (!this.held.has(each)) return;
      each.removeEventListener('childadded', this.onAdded as never);
      each.removeEventListener('childremoved', this.onRemoved as never);
      this.watcher.removed(each);
      this.release(each);
    });
  }

  /** `object` held as a node, and everything over it up to the scene: its id. */
  hold(object: THREE.Object3D): number {
    const known = this.held.get(object);
    if (known) {
      known.users++;
      return known.id;
    }
    // (its parent held for it, one hold a child)
    const over = object.parent && !(object.parent as THREE.Scene).isScene ? object.parent : null;
    const parent = over ? this.hold(over) : NONE;
    const id = this.core.engine.add_node(parent);
    this.held.set(object, { id, users: 1, parent, over });
    this.objects[id] = object;
    object.userData.node = id;
    return id;
  }

  /** One hold of `object` let go; the last lets its node go, and the hold it had on its parent. */
  release(object: THREE.Object3D): void {
    const held = this.held.get(object);
    if (!held || --held.users > 0) return;
    this.held.delete(object);
    this.core.engine.drop_node(held.id);
    this.objects[held.id] = null;
    delete object.userData.node;
    object.matrixWorldNeedsUpdate = true;
    if (held.over) this.release(held.over);
  }

  /** The node `object` is held as, if it is. */
  nodeOf(object: THREE.Object3D): number | undefined {
    return this.held.get(object)?.id;
  }

  /** The frame's nodes placed: their numbers written, the engine's matrices made and read back onto the objects. */
  place(): void {
    if (!this.held.size) return;
    this.views();
    this.writeNumbers();
    this.core.engine.place_nodes();
    this.views();
    this.readBack();
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
    const matricesAt = engine.node_matrices();
    if (this.matrices.buffer !== memory || this.matrices.byteOffset !== matricesAt || this.matrices.length < count * 16) {
      this.matrices = new Float32Array(memory, matricesAt, count * 16);
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

  /** `object`'s node moved under its object's parent where the game moved it (under something not held: hidden till
   *  it's handed over again). */
  private keepParent(object: THREE.Object3D, id: number): void {
    const held = this.held.get(object)!;
    const parent = object.parent;
    const now = !parent || (parent as THREE.Scene).isScene ? NONE : (parent.userData.node as number | undefined);
    if (now === undefined) {
      this.shown[id] = 0;
      return;
    }
    if (now === held.parent) return;
    // (moved under another held object: the hold on the old one goes to the new one)
    const over = parent && !(parent as THREE.Scene).isScene ? parent : null;
    if (over) this.hold(over);
    if (held.over) this.release(held.over);
    held.over = over;
    held.parent = now;
    this.core.engine.set_node_parent(id, now);
  }

  /** The engine's matrices onto the objects, for what reads them this frame and what hangs under them. */
  private readBack(): void {
    const worlds = this.worlds, matrices = this.matrices;
    for (let id = 0; id < this.objects.length; id++) {
      const object = this.objects[id];
      if (!object) continue;
      const world = object.matrixWorld.elements;
      for (let i = 0, at = id * 16; i < 16; i++, at++) world[i] = worlds[at];
      // (its own matrix too, as three's placing keeps it: the leg's reach and a grip read it, `ik.ts`)
      if (object.matrixAutoUpdate) {
        const local = object.matrix.elements;
        for (let i = 0, at = id * 16; i < 16; i++, at++) local[i] = matrices[at];
      }
      object.matrixWorldNeedsUpdate = false;
      // (a mesh bound where it stands, as three keeps it each frame: its bind's inverse is its matrix's)
      const skinned = object as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh && skinned.bindMode === THREE.AttachedBindMode) {
        skinned.bindMatrixInverse.copy(skinned.matrixWorld).invert();
      }
      // (a camera hung on a hero: its view's inverse, as three's own update of it keeps)
      const camera = object as THREE.Camera;
      if (camera.isCamera) camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    }
  }

  /** Whether a node's object and all over it are shown. */
  seen(object: THREE.Object3D): boolean {
    for (let at: THREE.Object3D | null = object; at && !(at as THREE.Scene).isScene; at = at.parent) {
      if (!at.visible) return false;
    }
    return true;
  }
}
