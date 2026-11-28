// A thing in the world: its place, turn and size under its parent, its children, whether it's shown. Under a world
// the stage shows (`../stage.ts`) it is the engine's node too; the stage finds what moved by comparing its numbers
// with those it last wrote, and is told the rest (`link.ts`): a child added or taken away, a frozen matrix written,
// shown or hidden. Its matrix in the world is made when it's read (`matrixWorld`), and made again only where the
// numbers it was made from changed, or its parent's world: nothing is made for what nobody reads, and the engine
// makes its own for drawing. Its place, turn and size are plain vectors, as three's: one shape with every other.
import { Euler, Mat4, Quat, Vec3 } from '../math/index.ts';
import { Layers, type LayersOwner } from './layers.ts';
import { NONE, type StageLink } from './link.ts';
import { Listeners, type NodeListener } from './listeners.ts';
import { firstUnder } from './nodeSearch.ts';
import {
  movedAlong, placedUnder, turnedAbout, turnFacing, worldFacingOf, worldSizeOf, worldTurnOf,
} from './nodeSpace.ts';
import { copyNode } from './nodeCopy.ts';
import { watchedEuler, type Mover } from './watched.ts';

/** the next node's number (three's `Object3D.id`) */
let nextNumber = 1;
const scratchQuat = new Quat();
const scratchEuler = new Euler();
const scratchMatrix = new Mat4();
const scratchPoint = new Vec3();
const scratchPlace = new Vec3();
const scratchSize = new Vec3();
const UNIT_X = new Vec3(1, 0, 0);
const UNIT_Y = new Vec3(0, 1, 0);
const UNIT_Z = new Vec3(0, 0, 1);

export type { NodeListener };

/** what of a node changes its draws (written again as one changes) */
interface DrawFlags {
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  renderOrder: number;
}

/** A thing in the world. */
export class Node implements LayersOwner {
  /** what every node says it is */
  readonly isNode = true;
  /** a number of its own, counted from one */
  readonly id = nextNumber++;
  /** its kind's name */
  type = 'Node';
  name = '';
  /** what the game hangs on it: anything (the game's own notes, read back by its own code) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: Record<string, any> = {};
  parent: Node | null = null;
  readonly children: Node[] = [];
  /** its place under its parent */
  readonly position = new Vec3();
  /** its turn under its parent, kept in step with `rotation` */
  readonly quaternion = new Quat();
  /** its turn as angles, kept in step with `quaternion` */
  readonly rotation: Euler;
  /** its size under its parent */
  readonly scale = new Vec3(1, 1, 1);
  /** its matrix under its parent: made from its place, turn and size while `matrixAutoUpdate`, else the game's */
  readonly matrix = new Mat4();
  /** which views draw it */
  readonly layers = new Layers();
  /** the stage it's shown on, while it's under a shown world */
  link: StageLink | null = null;
  /** its node in the engine (`NONE` while it isn't under a shown world) */
  engineId = NONE;

  private _visible = true;
  private readonly drawFlags: DrawFlags = {
    castShadow: false, receiveShadow: false, frustumCulled: true, renderOrder: 0,
  };
  private _matrixAutoUpdate = true;
  private _matrixWorldAutoUpdate = true;
  /**
   * How many nodes here and under it are frozen (`matrixAutoUpdate` false: the game writes their matrices): what
   * `updateMatrixWorld` looks for. A rig has none, and the walk it made down every joint to make each world matrix,
   * which a read makes anyway, was the update's slowest walk at wave 36 (`lab perf --wave 36 --throttle 4
   * --profile=update`: `traverse` 0.46 s).
   */
  private frozenUnder = 0;
  private _world = new Mat4();
  /**
   * The numbers its matrix was last composed from (place, turn, size; NaN before the first), and a count of each
   * change of its matrix and of its world matrix: its world is made again only where its own count or its parent's
   * world's moved since. Told of each write instead (watched vectors, a subclass of `Vec3` and `Quat`), every maths
   * call site the game has met two shapes and ran polymorphic: the hero's IK and the foes' animation were half again
   * three's time (`lab perf --wave 36 --throttle 4 --ab --profile=update`).
   */
  private readonly composedFrom = new Float64Array(10).fill(NaN);
  private localCount = 0;
  private worldCount = 0;
  /** the parent, its world's count and its own matrix's count its world was last made from */
  private madeUnder: Node | null | undefined = undefined;
  private madeUnderCount = -1;
  private madeLocalCount = -1;
  /** a frozen matrix written since it was last read (`moved`) */
  private frozenMoved = true;
  /** the quaternion its angles were last made from or made into (`freshRotation`) */
  private readonly turnSeen = new Float64Array([0, 0, 0, 1]);
  /** whether it's keeping its angles and quaternion in step now (the angles' own reads and writes pass then) */
  private syncing = false;
  private listeners: Listeners | null = null;

  constructor() {
    const self = this;
    const angled: Mover = {
      touched(): void { self.anglesWritten(); },
      fresh(): void { self.freshRotation(); },
    };
    this.rotation = watchedEuler(angled);
    this.layers.owner = this;
  }

  /** Its angles written: its quaternion made from them now (three's way). */
  private anglesWritten(): void {
    if (this.syncing) return;
    this.syncing = true;
    const angles = this.rotation;
    scratchEuler.set(angles.x, angles.y, angles.z, angles.order);
    this.quaternion.setFromEuler(scratchEuler);
    this.seeTurn();
    this.syncing = false;
  }

  /** The quaternion its angles stand for now kept (`turnSeen`). */
  private seeTurn(): void {
    const turn = this.quaternion;
    const seen = this.turnSeen;
    seen[0] = turn.x;
    seen[1] = turn.y;
    seen[2] = turn.z;
    seen[3] = turn.w;
  }

  /** Its angles made again from its quaternion where that changed since they were (its angles about to be read). */
  private freshRotation(): void {
    if (this.syncing) return;
    const turn = this.quaternion;
    const seen = this.turnSeen;
    if (turn.x === seen[0] && turn.y === seen[1] && turn.z === seen[2] && turn.w === seen[3]) return;
    this.syncing = true;
    scratchQuat.set(turn.x, turn.y, turn.z, turn.w);
    scratchEuler.setFromQuaternion(scratchQuat, this.rotation.order);
    this.rotation.store(scratchEuler.x, scratchEuler.y, scratchEuler.z);
    this.seeTurn();
    this.syncing = false;
  }

  /** Its matrix written by the game, its parent changed, or shown or hidden: the stage told (a place, turn or size
   *  written is found by comparing, `madeWorld`, `../stage.ts`). */
  moved(): void {
    this.frozenMoved = true;
    if (!this._matrixWorldAutoUpdate) this.worldCount++;
    this.link?.moved(this);
  }

  /** shown, with all under it; hidden, nothing under it is drawn */
  get visible(): boolean { return this._visible; }
  set visible(value: boolean) {
    if (value === this._visible) return;
    this._visible = value;
    this.link?.shown(this);
  }

  /** One of what changes its draws set to `value`, its draws written again if it changed. */
  private setDrawFlag<Key extends keyof DrawFlags>(key: Key, value: DrawFlags[Key]): void {
    if (value === this.drawFlags[key]) return;
    this.drawFlags[key] = value;
    this.link?.redraw(this);
  }

  /** whether it casts shadows */
  get castShadow(): boolean { return this.drawFlags.castShadow; }
  set castShadow(value: boolean) { this.setDrawFlag('castShadow', value); }
  /** whether shadows fall on it */
  get receiveShadow(): boolean { return this.drawFlags.receiveShadow; }
  set receiveShadow(value: boolean) { this.setDrawFlag('receiveShadow', value); }
  /** whether it's left out where it's off the view (false: always drawn) */
  get frustumCulled(): boolean { return this.drawFlags.frustumCulled; }
  set frustumCulled(value: boolean) { this.setDrawFlag('frustumCulled', value); }
  /** where it's drawn among what blends: lower first */
  get renderOrder(): number { return this.drawFlags.renderOrder; }
  set renderOrder(value: number) { this.setDrawFlag('renderOrder', value); }

  /** its layers changed: its draws written again */
  layersChanged(): void { this.link?.redraw(this); }

  /** whether its matrix is made from its place, turn and size (false: the game writes `matrix` and says so) */
  get matrixAutoUpdate(): boolean { return this._matrixAutoUpdate; }
  set matrixAutoUpdate(value: boolean) {
    if (value === this._matrixAutoUpdate) return;
    // (its matrix made from where it stands as it's frozen: three's is made by the update before the switch, which
    // only made it when read here, and parts nothing had read stood frozen at the world's middle)
    if (!value) this.matrix.compose(this.position, this.quaternion, this.scale);
    this._matrixAutoUpdate = value;
    this.countFrozen(value ? -1 : 1);
    this.moved();
  }

  /** whether its world matrix is made from its parent's (false: kept as it was last made, or as the game writes it) */
  get matrixWorldAutoUpdate(): boolean { return this._matrixWorldAutoUpdate; }
  set matrixWorldAutoUpdate(value: boolean) {
    if (value === this._matrixWorldAutoUpdate) return;
    // (made now, before it's kept: kept unmade, it and all under it stood at the world's middle)
    if (!value) this.makeWorld();
    this._matrixWorldAutoUpdate = value;
    this.moved();
  }

  /** Its matrix in the world, made now if it or anything over it moved since it was last made. */
  get matrixWorld(): Mat4 {
    this.makeWorld();
    return this._world;
  }

  /** Its matrix composed again where its place, turn or size changed since it last was, or taken as changed where
   *  it's frozen and the game wrote it (`frozenMoved`). */
  private freshLocal(): void {
    if (!this._matrixAutoUpdate) {
      if (!this.frozenMoved) return;
      this.frozenMoved = false;
      this.localCount++;
      return;
    }
    const place = this.position;
    const turn = this.quaternion;
    const size = this.scale;
    const from = this.composedFrom;
    if (place.x === from[0] && place.y === from[1] && place.z === from[2] && turn.x === from[3]
      && turn.y === from[4] && turn.z === from[5] && turn.w === from[6] && size.x === from[7]
      && size.y === from[8] && size.z === from[9]) return;
    from[0] = place.x;
    from[1] = place.y;
    from[2] = place.z;
    from[3] = turn.x;
    from[4] = turn.y;
    from[5] = turn.z;
    from[6] = turn.w;
    from[7] = size.x;
    from[8] = size.y;
    from[9] = size.z;
    this.matrix.compose(place, turn, size);
    this.localCount++;
  }

  /** Its world matrix made, its parent's first, where its own matrix or its parent's world changed since. */
  private makeWorld(): void {
    const parent = this.parent;
    if (parent) parent.makeWorld();
    this.freshLocal();
    if (!this._matrixWorldAutoUpdate) return;
    const underCount = parent ? parent.worldCount : 0;
    if (parent === this.madeUnder && underCount === this.madeUnderCount && this.localCount === this.madeLocalCount) {
      return;
    }
    this.madeUnder = parent;
    this.madeUnderCount = underCount;
    this.madeLocalCount = this.localCount;
    if (parent) this._world.multiplyMatrices(parent._world, this.matrix);
    else this._world.copy(this.matrix);
    this.worldCount++;
  }

  /** Its matrix written by the game was changed (three's `matrixWorldNeedsUpdate = true`). */
  set matrixWorldNeedsUpdate(value: boolean) { if (value) this.moved(); }
  /** never: its world matrix is made when read */
  get matrixWorldNeedsUpdate(): boolean { return false; }

  /** Its matrix made from its place, turn and size now, whether or not it's made so each time (as three's). */
  updateMatrix(): void {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.localCount++;
    this.moved();
  }

  /** Its world matrix and those under it made now (they're made when read too): a matrix the game writes, here
   *  and under it, is taken as changed first. */
  updateMatrixWorld(_force?: boolean): void {
    if (this.frozenUnder === 0) return;
    if (!this._matrixAutoUpdate) this.moved();
    const children = this.children;
    for (let i = 0; i < children.length; i++) children[i].updateMatrixWorld();
  }

  /** `change` more frozen nodes here and under it, counted on it and on every node over it (`frozenUnder`). */
  private countFrozen(change: number): void {
    if (change === 0) return;
    for (let at: Node | null = this; at; at = at.parent) at.frozenUnder += change;
  }

  /** Kept for the game's calls (three's `updateWorldMatrix`): its own matrix taken as changed if the game writes
   *  it. */
  updateWorldMatrix(_parents?: boolean, children?: boolean): void {
    if (children) this.updateMatrixWorld();
    else if (!this._matrixAutoUpdate) this.moved();
  }

  /** `nodes` added as its children, each taken from its parent first; itself, for chaining. */
  add(...nodes: Node[]): this {
    for (const node of nodes) {
      if (node === this) continue;
      const within = !!node.parent && !!this.link && node.link === this.link;
      if (node.parent) node.parent.detach(node, within);
      node.parent = this;
      this.children.push(node);
      this.countFrozen(node.frozenUnder);
      node.moved();
      if (within) this.link!.reparented(node);
      else if (this.link) this.link.entered(node);
      node.dispatchEvent({ type: 'added' });
      this.dispatchEvent({ type: 'childadded', child: node });
    }
    return this;
  }

  /** `nodes` taken away from its children; itself, for chaining. */
  remove(...nodes: Node[]): this {
    for (const node of nodes) if (node.parent === this) this.detach(node, false);
    return this;
  }

  /** `node` taken from its children, the stage told unless it stays in the same world (`within`). */
  private detach(node: Node, within: boolean): void {
    const at = this.children.indexOf(node);
    if (at < 0) return;
    this.children.splice(at, 1);
    this.countFrozen(-node.frozenUnder);
    if (!within && node.link) node.link.left(node);
    node.parent = null;
    node.moved();
    node.dispatchEvent({ type: 'removed' });
    this.dispatchEvent({ type: 'childremoved', child: node });
  }

  /** Taken away from its parent; itself. */
  removeFromParent(): this {
    this.parent?.remove(this);
    return this;
  }

  /** Every child taken away; itself. */
  clear(): this {
    while (this.children.length) this.remove(this.children[this.children.length - 1]);
    return this;
  }

  /** `node` added as a child, keeping where it stands in the world; itself. */
  attach(node: Node): this {
    placedUnder(this, node, scratchPlace, scratchQuat, scratchSize);
    this.add(node);
    node.position.copy(scratchPlace);
    node.quaternion.copy(scratchQuat);
    node.scale.copy(scratchSize);
    return this;
  }

  /** `visit` called on it and everything under it, parents first. */
  traverse(visit: (node: Node) => void): void {
    visit(this);
    const children = this.children;
    for (let i = 0; i < children.length; i++) children[i].traverse(visit);
  }

  /** `visit` called on it and everything under it that's shown, parents first. */
  traverseVisible(visit: (node: Node) => void): void {
    if (!this._visible) return;
    visit(this);
    const children = this.children;
    for (let i = 0; i < children.length; i++) children[i].traverseVisible(visit);
  }

  /** The first node named `name`, itself or under it. */
  getObjectByName(name: string): Node | undefined {
    return this.getObjectByProperty('name', name);
  }

  /** The first node whose `key` is `value`, itself or under it. */
  getObjectByProperty(key: string, value: unknown): Node | undefined {
    return firstUnder(this, (node) => (node as unknown as Record<string, unknown>)[key] === value);
  }

  /** The node numbered `id`, itself or under it. */
  getObjectById(id: number): Node | undefined { return firstUnder(this, (node) => node.id === id); }

  /** Its place in the world, into `target`. */
  getWorldPosition(target: Vec3): Vec3 { return target.setFromMatrixPosition(this.matrixWorld); }
  /** Its turn in the world, into `target`. */
  getWorldQuaternion(target: Quat): Quat { return worldTurnOf(this, target); }
  /** Its size in the world, into `target`. */
  getWorldScale(target: Vec3): Vec3 { return worldSizeOf(this, target); }
  /** The way its +z faces in the world, into `target` (a camera's is its −z: `Camera` says so). */
  getWorldDirection(target: Vec3): Vec3 { return worldFacingOf(this, target); }
  /** `vector` under it made the world's; the vector. */
  localToWorld(vector: Vec3): Vec3 { return vector.applyMatrix4(this.matrixWorld); }
  /** `vector` in the world made its own; the vector. */
  worldToLocal(vector: Vec3): Vec3 { return vector.applyMatrix4(scratchMatrix.copy(this.matrixWorld).invert()); }

  /** Turned so its +z faces `x` (a point in the world, or its coordinates); a camera or a light faces it by its
   *  −z. */
  lookAt(x: Vec3 | number, y = 0, z = 0): void {
    const point = typeof x === 'number' ? scratchPoint.set(x, y, z) : scratchPoint.copy(x);
    this.quaternion.copy(turnFacing(this, point, this.facesByMinusZ(), scratchQuat));
  }

  /** which way is up for `lookAt` */
  readonly up = new Vec3(0, 1, 0);

  /** Whether it faces the way it looks by its −z (a camera, a light). */
  protected facesByMinusZ(): boolean { return false; }

  /** Turned about its own x by `angle`; itself. */
  rotateX(angle: number): this { return turnedAbout(this, UNIT_X, angle); }
  /** Turned about its own y by `angle`; itself. */
  rotateY(angle: number): this { return turnedAbout(this, UNIT_Y, angle); }
  /** Turned about its own z by `angle`; itself. */
  rotateZ(angle: number): this { return turnedAbout(this, UNIT_Z, angle); }
  /** Moved `distance` along its own `axis` (a unit vector, turned as it's turned); itself. */
  translateOnAxis(axis: Vec3, distance: number): this { return movedAlong(this, axis, distance); }
  /** Moved `distance` along its own x; itself. */
  translateX(distance: number): this { return movedAlong(this, UNIT_X, distance); }
  /** Moved `distance` along its own y; itself. */
  translateY(distance: number): this { return movedAlong(this, UNIT_Y, distance); }
  /** Moved `distance` along its own z; itself. */
  translateZ(distance: number): this { return movedAlong(this, UNIT_Z, distance); }

  /** `listener` told of `type` (`added`, `removed`, `childadded`, `childremoved`, or the game's own). */
  addEventListener(type: string, listener: NodeListener): void {
    this.listeners ??= new Listeners();
    this.listeners.add(type, listener);
  }

  /** `listener` no longer told of `type`. */
  removeEventListener(type: string, listener: NodeListener): void { this.listeners?.remove(type, listener); }

  /** `event` told to its listeners of its type. */
  dispatchEvent(event: { type: string; [key: string]: unknown }): void { this.listeners?.tell(event, this); }

  /** `source`'s own state copied onto it (its children too where `recursive`); itself. */
  copy(source: Node, recursive = true): this {
    copyNode(this, source, recursive);
    return this;
  }

  /** A copy of it (and of what's under it where `recursive`), its geometry and materials shared. */
  clone(recursive = true): Node {
    const made = new (this.constructor as new () => Node)();
    return made.copy(this, recursive);
  }
}
