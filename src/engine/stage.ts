// The world handed to the engine as it changes (VictorZakharov/last-stand#973, `api/AGENTS.md`): every node under the
// shown world is the engine's node from the moment it comes under it (`entered`), and the frame writes only the
// nodes that moved since the last (their ten numbers and whether they're shown), has the engine place them all,
// and writes again only the draws whose inputs changed (`draws.ts`). Nothing walks the world each frame: the walk
// of three's scene, its matrices and a record a mesh were the cost this replaces (1 ms of a desktop's frame, 3 to
// 5 of a phone's, growing with every mesh).
import type { InitOutput } from './pkg/bulwark';
import type { Core } from './core';
import { Light, Mesh, Node, Points, Sprite, Line, World, NONE, type StageLink } from './api/index.ts';
import { Mat4, Quat, Vec3 } from './api/index.ts';
import type { Draws } from './draws';

/** a node's numbers: its place, its turn, its size */
const LOCAL = 10;
const scratchPlace = new Vec3();
const scratchTurn = new Quat();
const scratchSize = new Vec3();
const scratchMatrix = new Mat4();

/** What the stage holds of the shown world, counted (a harness's). */
export interface StageCount {
  nodes: number;
  lights: number;
  sprites: number;
  /** nodes written last frame */
  written: number;
}

export class Stage implements StageLink {
  /** the world shown, if any */
  private world: World | null = null;
  /** each engine node's game node, by its id */
  private nodes: (Node | null)[] = [];
  private held = 0;
  /** the nodes moved or shown or hidden since the last frame, each once (`queued`) */
  private moves: Node[] = [];
  private queued = new Uint8Array(1024);
  /** the parents written last into the engine, by node id */
  private parents = new Uint32Array(1024);
  /** the lights, the particles and the lines under the world: few, read by the frame */
  readonly lights = new Set<Light>();
  readonly sprites = new Set<Points | Sprite | Line>();
  private locals = new Float32Array(0);
  private shownBytes = new Uint8Array(0);
  private written = 0;

  constructor(private core: Core, private wasm: InitOutput, private draws: Draws) {}

  /** What the stage holds now. */
  get count(): StageCount {
    return { nodes: this.held, lights: this.lights.size, sprites: this.sprites.size, written: this.written };
  }

  /** The world shown now. */
  get shownWorld(): World | null { return this.world; }

  /** `world` shown from now on: everything under it the engine's, the world shown before let go. */
  show(world: World | null): void {
    if (world === this.world) return;
    if (this.world) for (const child of [...this.world.children]) this.leave(child);
    if (this.world) this.world.link = null;
    this.world = world;
    if (!world) return;
    world.link = this;
    for (const child of world.children) this.enter(child, NONE);
  }

  /** The game node of engine node `id`. */
  nodeOf(id: number): Node | null { return this.nodes[id] ?? null; }

  // The link: what nodes tell the stage.

  moved(node: Node): void {
    const id = node.engineId;
    if (id === NONE || this.queued[id]) return;
    this.queued[id] = 1;
    this.moves.push(node);
  }

  shown(node: Node): void { this.moved(node); }

  entered(node: Node): void {
    const parent = node.parent;
    this.enter(node, parent && parent !== this.world ? parent.engineId : NONE);
  }

  left(node: Node): void { this.leave(node); }

  reparented(node: Node): void {
    const id = node.engineId;
    if (id === NONE) return;
    const parent = node.parent && node.parent !== this.world ? node.parent.engineId : NONE;
    if (this.parents[id] === parent) return;
    this.parents[id] = parent;
    this.core.engine.set_node_parent(id, parent);
    this.moved(node);
  }

  redraw(node: Node): void {
    if (node.engineId !== NONE) this.draws.redraw(node);
  }

  // Coming and going.

  /** `node` and what's under it made the engine's, under engine node `parent`. */
  private enter(node: Node, parent: number): void {
    if (node.engineId !== NONE) return;
    const id = this.core.engine.add_node(parent);
    this.core.freshViews();
    this.room(id + 1);
    this.nodes[id] = node;
    this.parents[id] = parent;
    this.held++;
    node.engineId = id;
    node.link = this;
    this.queued[id] = 0;
    this.moved(node);
    if (node instanceof Light) this.lights.add(node);
    else if (node instanceof Points || node instanceof Sprite || node instanceof Line) this.sprites.add(node);
    else if (node instanceof Mesh) this.draws.add(node);
    for (const child of node.children) this.enter(child, id);
  }

  /** `node` and what's under it let go by the engine. */
  private leave(node: Node): void {
    for (const child of node.children) this.leave(child);
    const id = node.engineId;
    if (id === NONE) return;
    if (node instanceof Light) this.lights.delete(node);
    else if (node instanceof Points || node instanceof Sprite || node instanceof Line) this.sprites.delete(node);
    else if (node instanceof Mesh) this.draws.remove(node);
    this.core.engine.drop_node(id);
    this.nodes[id] = null;
    this.held--;
    this.queued[id] = 0;
    node.engineId = NONE;
    node.link = null;
  }

  /** Room in the stage's own arrays for `count` node ids. */
  private room(count: number): void {
    if (count <= this.queued.length) return;
    let size = this.queued.length;
    while (size < count) size *= 2;
    const queued = new Uint8Array(size);
    queued.set(this.queued);
    this.queued = queued;
    const parents = new Uint32Array(size);
    parents.set(this.parents);
    this.parents = parents;
  }

  // The frame.

  /** The nodes that moved written into the engine, and every node placed by it. */
  place(): void {
    this.views();
    const locals = this.locals, shownBytes = this.shownBytes, moves = this.moves;
    for (let i = 0; i < moves.length; i++) {
      const node = moves[i];
      const id = node.engineId;
      if (id === NONE) continue;
      this.queued[id] = 0;
      writeLocals(node, locals, id * LOCAL);
      shownBytes[id] = node.visible ? 1 : 0;
    }
    this.written = moves.length;
    moves.length = 0;
    this.core.engine.place_nodes();
    this.core.freshViews();
  }

  /** The engine's arrays viewed again where adding nodes or growing its memory moved them. */
  private views(): void {
    const engine = this.core.engine, memory = this.wasm.memory.buffer, count = this.nodes.length;
    const localsAt = engine.node_locals(), shownAt = engine.node_shown();
    const locals = this.locals;
    if (locals.buffer !== memory || locals.byteOffset !== localsAt || locals.length < count * LOCAL) {
      this.locals = new Float32Array(memory, localsAt, count * LOCAL);
    }
    const shownBytes = this.shownBytes;
    if (shownBytes.buffer !== memory || shownBytes.byteOffset !== shownAt || shownBytes.length < count) {
      this.shownBytes = new Uint8Array(memory, shownAt, count);
    }
  }

  /** Whether `node` and all over it up to the world are shown. */
  seen(node: Node): boolean {
    for (let at: Node | null = node; at && at !== this.world; at = at.parent) if (!at.visible) return false;
    return true;
  }
}

/** `node`'s place, turn and size written into `locals` at `at`: its matrix's, where the game writes its matrix. */
function writeLocals(node: Node, locals: Float32Array, at: number): void {
  let place: Vec3 = node.position;
  let turn: Quat = node.quaternion;
  let size: Vec3 = node.scale;
  if (!node.matrixAutoUpdate) {
    scratchMatrix.copy(node.matrix).decompose(scratchPlace, scratchTurn, scratchSize);
    place = scratchPlace;
    turn = scratchTurn;
    size = scratchSize;
  }
  locals[at] = place.x;
  locals[at + 1] = place.y;
  locals[at + 2] = place.z;
  locals[at + 3] = turn.x;
  locals[at + 4] = turn.y;
  locals[at + 5] = turn.z;
  locals[at + 6] = turn.w;
  locals[at + 7] = size.x;
  locals[at + 8] = size.y;
  locals[at + 9] = size.z;
}
