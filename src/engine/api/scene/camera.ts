// The eyes the world is drawn through: a node whose −z looks out, with a projection made from its lens (a perspective
// camera's field of view, an ortho camera's box). Their projections are made for WebGPU's clip depth, 0 to 1, as the
// engine reads them (`../../globals.ts`'s `projectionOf` takes them as they are). The view (`matrixWorldInverse`) is
// made when it's read, from the world matrix made the same way.
import { Mat4, Quat, Vec3, WebGPUCoordinateSystem, type CoordinateSystem } from '../math/index.ts';
import { Node } from './node.ts';

const _place = new Vec3();
const _size = new Vec3();
const _unit = new Vec3(1, 1, 1);
const _turn = new Mat4();
const _quatScratch = new Quat();

/** A part of a larger view a camera draws (three's `view`): the hero selection's hall drawn to one side. */
export interface ViewOffset {
  /** whether it's used */
  enabled: boolean;
  /** the whole view's size */
  fullWidth: number;
  fullHeight: number;
  /** where the part starts in it */
  offsetX: number;
  offsetY: number;
  /** the part's size */
  width: number;
  height: number;
}

/** A camera: a node looking down its −z, with a projection. */
export class Camera extends Node {
  /** what every camera says it is */
  readonly isCamera = true;
  /** the view's clip space from the camera's own: made by `updateProjectionMatrix` */
  readonly projectionMatrix = new Mat4();
  /** `projectionMatrix` undone */
  readonly projectionMatrixInverse = new Mat4();
  /** the clip depth its projections are made for: WebGPU's, 0 to 1 (the engine's) */
  readonly coordinateSystem: CoordinateSystem = WebGPUCoordinateSystem;
  private readonly _view = new Mat4();
  /** the world matrix `_view` was made from */
  private readonly _viewOf = new Mat4();
  private viewMade = false;

  constructor() {
    super();
    this.type = 'Camera';
  }

  /** never: the engine's depth runs near to far */
  get reversedDepth(): boolean { return false; }

  /**
   * The world as the camera sees it: its world matrix inverted, its size left out (as three leaves it out, glTF's
   * way). Made again when read after its world matrix changed.
   */
  get matrixWorldInverse(): Mat4 {
    const world = this.matrixWorld;
    if (this.viewMade && sameElements(this._viewOf.elements, world.elements)) return this._view;
    this._viewOf.copy(world);
    this.viewMade = true;
    world.decompose(_place, _quatScratch, _size);
    const unscaled = _size.x === 1 && _size.y === 1 && _size.z === 1;
    if (unscaled) this._view.copy(world).invert();
    else this._view.copy(_turn.compose(_place, _quatScratch, _unit)).invert();
    return this._view;
  }

  /** The way it looks in the world (its −z), into `target`. */
  override getWorldDirection(target: Vec3): Vec3 {
    return super.getWorldDirection(target).negate();
  }

  /** It looks by its −z: `lookAt` turns that to the target. */
  protected override facesByMinusZ(): boolean { return true; }

  /** `source`'s state copied onto it, its projection too; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof Camera) {
      this.projectionMatrix.copy(source.projectionMatrix);
      this.projectionMatrixInverse.copy(source.projectionMatrixInverse);
    }
    return this;
  }
}

/** Whether two matrices' sixteen numbers are the same. */
function sameElements(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A view offset copied, or none. */
function viewCopy(view: ViewOffset | null): ViewOffset | null {
  return view === null ? null : { ...view };
}

/** A view offset set to `fullWidth`, `fullHeight`, `x`, `y`, `width`, `height` and enabled, made if there was none. */
function setView(view: ViewOffset | null, fullWidth: number, fullHeight: number, x: number, y: number,
  width: number, height: number): ViewOffset {
  const set = view ?? { enabled: true, fullWidth: 1, fullHeight: 1, offsetX: 0, offsetY: 0, width: 1, height: 1 };
  set.enabled = true;
  set.fullWidth = fullWidth;
  set.fullHeight = fullHeight;
  set.offsetX = x;
  set.offsetY = y;
  set.width = width;
  set.height = height;
  return set;
}

/** A camera with a field of view: what's further is drawn smaller. */
export class PerspectiveCamera extends Camera {
  /** what every perspective camera says it is */
  readonly isPerspectiveCamera = true;
  /** the field of view, top to bottom (degrees) */
  fov: number;
  /** its width over its height */
  aspect: number;
  /** the nearest and furthest it draws (m) */
  near: number;
  far: number;
  /** how far it's zoomed in (the field of view divided by it) */
  zoom = 1;
  /** the part of a larger view it draws, if any */
  view: ViewOffset | null = null;

  /** A camera seeing `fov` degrees top to bottom, `aspect` wide to high, from `near` to `far`. */
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super();
    this.type = 'PerspectiveCamera';
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.updateProjectionMatrix();
  }

  /**
   * Draws the part `x`, `y`, `width`, `height` of a view `fullWidth` by `fullHeight` (its aspect set to the whole
   * view's). As three's `setViewOffset`.
   */
  setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void {
    this.aspect = fullWidth / fullHeight;
    this.view = setView(this.view, fullWidth, fullHeight, x, y, width, height);
    this.updateProjectionMatrix();
  }

  /** Draws the whole view again. */
  clearViewOffset(): void {
    if (this.view !== null) this.view.enabled = false;
    this.updateProjectionMatrix();
  }

  /**
   * Its projection made again from its lens, zoom and view offset. The frustum's sides follow three 0.187's
   * `PerspectiveCamera.updateProjectionMatrix` (the view offset cut from the near plane's box).
   */
  updateProjectionMatrix(): void {
    const near = this.near;
    let top = near * Math.tan((Math.PI / 360) * this.fov) / this.zoom;
    let height = 2 * top;
    let width = this.aspect * height;
    let left = -0.5 * width;
    const view = this.view;
    if (view !== null && view.enabled) {
      left += view.offsetX * width / view.fullWidth;
      top -= view.offsetY * height / view.fullHeight;
      width *= view.width / view.fullWidth;
      height *= view.height / view.fullHeight;
    }
    const system = this.coordinateSystem;
    this.projectionMatrix.makePerspective(left, left + width, top, top - height, near, this.far, system, false);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }

  /** `source`'s state copied onto it, its lens too; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof PerspectiveCamera) {
      this.fov = source.fov;
      this.aspect = source.aspect;
      this.near = source.near;
      this.far = source.far;
      this.zoom = source.zoom;
      this.view = viewCopy(source.view);
    }
    return this;
  }

  /** A copy of it. */
  override clone(recursive = true): PerspectiveCamera {
    return new PerspectiveCamera().copy(this, recursive);
  }
}

/** A camera drawing a box: what's further is drawn the same size (three's `OrthographicCamera`). */
export class OrthoCamera extends Camera {
  /** what every ortho camera says it is (three's `isOrthographicCamera`) */
  readonly isOrthographicCamera = true;
  /** the box's sides, in the camera's own space */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** the nearest and furthest it draws (m) */
  near: number;
  far: number;
  /** how far it's zoomed in (the box shrunk by it) */
  zoom = 1;
  /** the part of a larger view it draws, if any */
  view: ViewOffset | null = null;

  /** A camera drawing the box `left` to `right`, `bottom` to `top`, `near` to `far`. */
  constructor(left = -1, right = 1, top = 1, bottom = -1, near = 0.1, far = 2000) {
    super();
    this.type = 'OrthographicCamera';
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
    this.near = near;
    this.far = far;
    this.updateProjectionMatrix();
  }

  /** Draws the part `x`, `y`, `width`, `height` of a view `fullWidth` by `fullHeight`. */
  setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void {
    this.view = setView(this.view, fullWidth, fullHeight, x, y, width, height);
    this.updateProjectionMatrix();
  }

  /** Draws the whole view again. */
  clearViewOffset(): void {
    if (this.view !== null) this.view.enabled = false;
    this.updateProjectionMatrix();
  }

  /**
   * Its projection made again from its box, zoom and view offset. The box follows three 0.187's
   * `OrthographicCamera.updateProjectionMatrix` (zoomed about its middle, the view offset cut from the zoomed box).
   */
  updateProjectionMatrix(): void {
    const halfWide = (this.right - this.left) / (2 * this.zoom);
    const halfHigh = (this.top - this.bottom) / (2 * this.zoom);
    const middleX = (this.right + this.left) / 2;
    const middleY = (this.top + this.bottom) / 2;
    let left = middleX - halfWide;
    let right = middleX + halfWide;
    let top = middleY + halfHigh;
    let bottom = middleY - halfHigh;
    const view = this.view;
    if (view !== null && view.enabled) {
      const across = (this.right - this.left) / view.fullWidth / this.zoom;
      const up = (this.top - this.bottom) / view.fullHeight / this.zoom;
      left += across * view.offsetX;
      right = left + across * view.width;
      top -= up * view.offsetY;
      bottom = top - up * view.height;
    }
    const system = this.coordinateSystem;
    this.projectionMatrix.makeOrthographic(left, right, top, bottom, this.near, this.far, system, false);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }

  /** `source`'s state copied onto it, its box too; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof OrthoCamera) {
      this.left = source.left;
      this.right = source.right;
      this.top = source.top;
      this.bottom = source.bottom;
      this.near = source.near;
      this.far = source.far;
      this.zoom = source.zoom;
      this.view = viewCopy(source.view);
    }
    return this;
  }

  /** A copy of it. */
  override clone(recursive = true): OrthoCamera {
    return new OrthoCamera().copy(this, recursive);
  }
}
