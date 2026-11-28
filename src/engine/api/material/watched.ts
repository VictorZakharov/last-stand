// A material's colours and vectors, whose every write that changes a value tells the material it changed (its
// `version` moves, so the stage sends it again): a Color and a Vec2 whose fields are accessors over a store of their
// own. The maths' classes write their fields through `this.r = ...` in every method, so `setHex`, `copy`, `lerp`,
// `multiplyScalar` and the rest are each seen here. The base constructor's own writes come before the owner is set,
// and tell nobody.
import { Color, Vec2 } from '../math/index.ts';

/** What a watched value tells of a write that changed it. */
export interface Owner {
  /** one of its values was written with a value it didn't hold */
  touched(): void;
}

/** A material's colour (`color`, `emissive`, `sheenColor`): linear RGB, as the maths' `Color`. */
export class WatchedColor extends Color {
  declare private _r: number;
  declare private _g: number;
  declare private _b: number;
  declare owner: Owner | undefined;

  /** A colour telling `owner` of every change, at linear `r, g, b`. */
  constructor(owner: Owner, r: number, g: number, b: number) {
    super();
    this.hold(r, g, b);
    this.owner = owner;
  }

  /** Its three numbers stored as they are, telling nobody (a material's defaults). */
  hold(r: number, g: number, b: number): void {
    this._r = r;
    this._g = g;
    this._b = b;
  }

  /** its red */
  override get r(): number { return this._r; }
  override set r(value: number) {
    if (value === this._r) return;
    this._r = value;
    this.owner?.touched();
  }
  /** its green */
  override get g(): number { return this._g; }
  override set g(value: number) {
    if (value === this._g) return;
    this._g = value;
    this.owner?.touched();
  }
  /** its blue */
  override get b(): number { return this._b; }
  override set b(value: number) {
    if (value === this._b) return;
    this._b = value;
    this.owner?.touched();
  }
}

/** A material's two numbers (`normalScale`), or a texture's placement, as the maths' `Vec2`. */
export class WatchedVec2 extends Vec2 {
  declare private _x: number;
  declare private _y: number;
  declare owner: Owner | undefined;

  /** A vector telling `owner` of every change, at `x, y`. */
  constructor(owner: Owner, x: number, y: number) {
    super();
    this.hold(x, y);
    this.owner = owner;
  }

  /** Its two numbers stored as they are, telling nobody. */
  hold(x: number, y: number): void {
    this._x = x;
    this._y = y;
  }

  /** its x */
  override get x(): number { return this._x; }
  override set x(value: number) {
    if (value === this._x) return;
    this._x = value;
    this.owner?.touched();
  }
  /** its y */
  override get y(): number { return this._y; }
  override set y(value: number) {
    if (value === this._y) return;
    this._y = value;
    this.owner?.touched();
  }
}

/** What a colour field takes: a `Color` (copied), or a number or a CSS string, both sRGB as the maths' `Color` reads
 *  them. */
export type ColorValue = Color | number | string;

/** `colour` set to `value`, as a parameters object or an assignment gives it. */
export function setColour(colour: Color, value: ColorValue): void {
  if (typeof value === 'number') colour.setHex(value);
  else if (typeof value === 'string') colour.setStyle(value);
  else colour.copy(value);
}
