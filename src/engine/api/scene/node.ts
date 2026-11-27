// A thing in the world: its place, turn and size under its parent, its children, whether it's shown. Under a world
// the stage shows (`../stage.ts`) it is the engine's node too, and tells the stage only what changed (`link.ts`):
// a write to its place, turn or size, a child added or taken away. Its matrix in the world is made when it's read
// (`matrixWorld`), from its parent's made the same way: nothing is made for what nobody reads, and the engine makes
// its own for drawing.
import { Euler, Mat4, Quat, Vec3 } from '../math/index.ts';
import { Layers, type LayersOwner } from './layers.ts';
import { NONE, type StageLink } from './link.ts';
import { WatchedEuler, WatchedQuat, WatchedVec3, type Mover } from './watched.ts';

/** the next node's number (three's `Object3D.id`) */
let nextNumber = 1;
const _q = new Quat();
const _parentTurn = new Quat();
const _e = new Euler();
const _m = new Mat4();
const _v = new Vec3();
const _target = new Vec3();
const _place = new Vec3();
const _size = new Vec3();

/** A listener of a node's events (`dispatchEvent`). */
export type NodeListener = (event: { type: string; target: Node; [key: string]: unknown }) => void;

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
  readonly position: WatchedVec3;
  /** its turn under its parent, kept in step with `rotation` */
  readonly quaternion: WatchedQuat;
  /** its turn as angles, kept in step with `quaternion` */
  readonly rotation: WatchedEuler;
  /** its size under its parent */
  readonly scale: WatchedVec3;
  /** its matrix under its parent: made from its place, turn and size while `matrixAutoUpdate`, else the game's */
  readonly matrix = new Mat4();
  /** which views draw it */
  readonly layers = new Layers();
  /** the stage it's shown on, while it's under a shown world */
  link: StageLink | null = null;
  /** its node in the engine (`NONE` while it isn't under a shown world) */
  engineId = NONE;

  private _visible = true;
  private _castShadow = false;
  private _receiveShadow = false;
  private _frustumCulled = true;
  private _renderOrder = 0;
  private _matrixAutoUpdate = true;
  /** whether its world matrix is made from its parent's (false: the game writes it) */
  matrixWorldAutoUpdate = true;
  private _world = new Mat4();
  /** its own moves, counted, and the count its world matrix was made at */
  private moves = 0;
  private builtAt = -1;
  /** its parent's world as its own was made from it: which parent, and that parent's count of makes */
  private builtUnder: Node | null = null;
  private builtUnderMakes = -1;
  /** how many times its world matrix was made (what its children compare) */
  private makes = 0;
  /** which of its two turns was written last and the other not made again since */
  private quaternionStale = false;
  private rotationStale = false;
  private listeners: Map<string, NodeListener[]> | null = null;

  constructor() {
    const self = this;
    const placed: Mover = {
      touched(): void { self.moved(); },
      fresh(): void {},
    };
    const turned: Mover = {
      touched(): void {
        self.rotationStale = true;
        self.moved();
      },
      fresh(): void { self.freshQuaternion(); },
    };
    const angled: Mover = {
      touched(): void {
        self.quaternionStale = true;
        self.moved();
      },
      fresh(): void { self.freshRotation(); },
    };
    this.position = new WatchedVec3(placed);
    this.quaternion = new WatchedQuat(turned);
    this.rotation = new WatchedEuler(angled);
    this.scale = new WatchedVec3(placed, 1, 1, 1);
    this.layers.owner = this;
  }

  /** The quaternion made again from the angles, where those were written since. */
  private freshQuaternion(): void {
    if (!this.quaternionStale) return;
    this.quaternionStale = false;
    const r = this.rotation;
    _e.set(r.x, r.y, r.z, r.order);
    _q.setFromEuler(_e);
    this.quaternion.store(_q.x, _q.y, _q.z, _q.w);
  }

  /** The angles made again from the quaternion, where it was written since. */
  private freshRotation(): void {
    if (!this.rotationStale) return;
    this.rotationStale = false;
    const q = this.quaternion;
    _q.set(q.x, q.y, q.z, q.w);
    _e.setFromQuaternion(_q, this.rotation.order);
    this.rotation.store(_e.x, _e.y, _e.z);
  }

  /** Its place, turn, size or matrix changed: its world matrix is made again when next read, and the stage told. */
  moved(): void {
    this.moves++;
    this.link?.moved(this);
  }

  /** shown, with all under it; hidden, nothing under it is drawn */
  get visible(): boolean { return this._visible; }
  set visible(value: boolean) {
    if (value === this._visible) return;
    this._visible = value;
    this.link?.shown(this);
  }

  /** whether it casts shadows */
  get castShadow(): boolean { return this._castShadow; }
  set castShadow(value: boolean) {
    if (value === this._castShadow) return;
    this._castShadow = value;
    this.link?.redraw(this);
  }

  /** whether shadows fall on it */
  get receiveShadow(): boolean { return this._receiveShadow; }
  set receiveShadow(value: boolean) {
    if (value === this._receiveShadow) return;
    this._receiveShadow = value;
    this.link?.redraw(this);
  }

  /** whether it's left out where it's off the view (false: always drawn) */
  get frustumCulled(): boolean { return this._frustumCulled; }
  set frustumCulled(value: boolean) {
    if (value === this._frustumCulled) return;
    this._frustumCulled = value;
    this.link?.redraw(this);
  }

  /** where it's drawn among what blends: lower first */
  get renderOrder(): number { return this._renderOrder; }
  set renderOrder(value: number) {
    if (value === this._renderOrder) return;
    this._renderOrder = value;
    this.link?.redraw(this);
  }

  /** its layers changed: its draws written again */
  layersChanged(): void { this.link?.redraw(this); }

  /** whether its matrix is made from its place, turn and size (false: the game writes `matrix` and says so) */
  get matrixAutoUpdate(): boolean { return this._matrixAutoUpdate; }
  set matrixAutoUpdate(value: boolean) {
    if (value === this._matrixAutoUpdate) return;
    this._matrixAutoUpdate = value;
    this.moved();
  }

  /** Its matrix in the world, made now if it or anything over it moved since it was last made. */
  get matrixWorld(): Mat4 {
    this.makeWorld();
    return this._world;
  }

  /** Its world matrix made, its parent's first, where either changed since it was last made. */
  private makeWorld(): void {
    const parent = this.parent;
    let parentMakes = -1;
    if (parent) {
      parent.makeWorld();
      parentMakes = parent.makes;
    }
    if (!this.matrixWorldAutoUpdate) return;
    const same = this.builtAt === this.moves && this.builtUnder === parent && this.builtUnderMakes === parentMakes;
    if (same) return;
    if (this._matrixAutoUpdate) this.matrix.compose(this.position, this.quaternion, this.scale);
    if (parent) this._world.multiplyMatrices(parent._world, this.matrix);
    else this._world.copy(this.matrix);
    this.builtAt = this.moves;
    this.builtUnder = parent;
    this.builtUnderMakes = parentMakes;
    this.makes++;
  }

  /** Its matrix written by the game was changed (three's `matrixWorldNeedsUpdate = true`). */
  set matrixWorldNeedsUpdate(value: boolean) { if (value) this.moved(); }
  /** never: its world matrix is made when read */
  get matrixWorldNeedsUpdate(): boolean { return false; }

  /** Its matrix made from its place, turn and size now; one the game writes is taken as changed. */
  updateMatrix(): void {
    if (this._matrixAutoUpdate) this.matrix.compose(this.position, this.quaternion, this.scale);
    else this.moved();
  }

  /** Kept for the game's calls: matrices are made when read. A matrix the game writes, here and under it, is taken
   *  as changed. */
  updateMatrixWorld(_force?: boolean): void {
    this.traverse((node) => { if (!node._matrixAutoUpdate) node.moved(); });
  }

  /** Kept for the game's calls (three's `updateWorldMatrix`): its own matrix taken as changed if the game writes it. */
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
    _m.copy(this.matrixWorld).invert();
    if (node.parent) _m.multiply(node.parent.matrixWorld);
    // (its own matrix under its old parent, which `_m` already holds: its world would count that parent twice)
    if (node.matrixAutoUpdate) node.matrix.compose(node.position, node.quaternion, node.scale);
    node.matrix.premultiply(_m);
    node.matrix.decompose(_place, _q, _size);
    this.add(node);
    node.position.copy(_place);
    node.quaternion.copy(_q);
    node.scale.copy(_size);
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
    if (this.name === name) return this;
    for (const child of this.children) {
      const found = child.getObjectByName(name);
      if (found) return found;
    }
    return undefined;
  }

  /** Its place in the world, into `target`. */
  getWorldPosition(target: Vec3): Vec3 {
    return target.setFromMatrixPosition(this.matrixWorld);
  }

  /** Its turn in the world, into `target`. */
  getWorldQuaternion(target: Quat): Quat {
    this.matrixWorld.decompose(_place, target, _size);
    return target;
  }

  /** Its size in the world, into `target`. */
  getWorldScale(target: Vec3): Vec3 {
    this.matrixWorld.decompose(_place, _q, target);
    return target;
  }

  /** The way its +z faces in the world, into `target` (a camera's is its −z: `Camera` says so). */
  getWorldDirection(target: Vec3): Vec3 {
    const e = this.matrixWorld.elements;
    return target.set(e[8], e[9], e[10]).normalize();
  }

  /** `vector` under it made the world's; the vector. */
  localToWorld(vector: Vec3): Vec3 { return vector.applyMatrix4(this.matrixWorld); }

  /** `vector` in the world made its own; the vector. */
  worldToLocal(vector: Vec3): Vec3 { return vector.applyMatrix4(_m.copy(this.matrixWorld).invert()); }

  /** Turned so its +z faces `x` (a point in the world, or its coordinates); a camera or a light faces it by its −z. */
  lookAt(x: Vec3 | number, y = 0, z = 0): void {
    if (typeof x === 'number') _target.set(x, y, z);
    else _target.copy(x);
    this.getWorldPosition(_place);
    if (this.facesByMinusZ()) _m.lookAt(_place, _target, this.up);
    else _m.lookAt(_target, _place, this.up);
    _q.setFromRotationMatrix(_m);
    if (this.parent) {
      this.parent.getWorldQuaternion(_parentTurn);
      _q.premultiply(_parentTurn.invert());
    }
    this.quaternion.copy(_q);
  }

  /** which way is up for `lookAt` */
  readonly up = new Vec3(0, 1, 0);

  /** Whether it faces the way it looks by its −z (a camera, a light). */
  protected facesByMinusZ(): boolean { return false; }

  /** Turned about its own x by `angle`; itself. */
  rotateX(angle: number): this { return this.rotateOn(_v.set(1, 0, 0), angle); }
  /** Turned about its own y by `angle`; itself. */
  rotateY(angle: number): this { return this.rotateOn(_v.set(0, 1, 0), angle); }
  /** Turned about its own z by `angle`; itself. */
  rotateZ(angle: number): this { return this.rotateOn(_v.set(0, 0, 1), angle); }

  /** Turned about `axis` (its own, a unit vector) by `angle`; itself. */
  private rotateOn(axis: Vec3, angle: number): this {
    _q.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(_q);
    return this;
  }

  /** `listener` told of `type` (`added`, `removed`, `childadded`, `childremoved`, or the game's own). */
  addEventListener(type: string, listener: NodeListener): void {
    if (!this.listeners) this.listeners = new Map();
    const list = this.listeners.get(type);
    if (list) {
      if (!list.includes(listener)) list.push(listener);
    } else {
      this.listeners.set(type, [listener]);
    }
  }

  /** `listener` no longer told of `type`. */
  removeEventListener(type: string, listener: NodeListener): void {
    const list = this.listeners?.get(type);
    if (!list) return;
    const at = list.indexOf(listener);
    if (at >= 0) list.splice(at, 1);
  }

  /** `event` told to its listeners of its type. */
  dispatchEvent(event: { type: string; [key: string]: unknown }): void {
    const list = this.listeners?.get(event.type);
    if (!list) return;
    const told = { ...event, target: this };
    for (const listener of list.slice()) listener(told);
  }

  /** `source`'s own state copied onto it (its children too where `recursive`); itself. */
  copy(source: Node, recursive = true): this {
    this.name = source.name;
    this.up.copy(source.up);
    this.position.copy(source.position);
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);
    this.matrix.copy(source.matrix);
    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
    this.layers.mask = source.layers.mask;
    this.visible = source.visible;
    this.castShadow = source.castShadow;
    this.receiveShadow = source.receiveShadow;
    this.frustumCulled = source.frustumCulled;
    this.renderOrder = source.renderOrder;
    // (as three copies it: what JSON keeps, functions and references dropped)
    this.userData = JSON.parse(JSON.stringify(source.userData));
    if (recursive) for (const child of source.children) this.add(child.clone());
    return this;
  }

  /** A copy of it (and of what's under it where `recursive`), its geometry and materials shared. */
  clone(recursive = true): Node {
    const made = new (this.constructor as new () => Node)();
    return made.copy(this, recursive);
  }
}
