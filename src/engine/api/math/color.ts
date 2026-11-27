// A colour in linear RGB (three's working space), in place and chainable as three's `Color`. What comes in as hex
// or CSS is sRGB and is stored linear, what goes out as hex or CSS is sRGB again, as three 0.187's colour
// management does by default. `r`, `g` and `b` are written through `this` alone and declared in an interface, so a
// watched subclass (`scene/`'s `WatchedColor`) can make them accessors.
import { CSS_COLORS } from './cssColors.ts';
import { clamp, euclideanModulo, lerp } from './maths.ts';
import type { NumberArray } from './types.ts';

/** a colour as the game names one: a `Color`, a hex number (`0xff8800`) or CSS (`'#ff8800'`, `'tan'`, `'rgb(...)'`) */
export type ColorRepresentation = Color | string | number;

/** a colour space as three names one (`material/constants.ts` has them as three's constants) */
export type ColorSpaceName = string;

/** three's `SRGBColorSpace`: what hex and CSS are in */
const SRGB: ColorSpaceName = 'srgb';
/** three's `LinearSRGBColorSpace`: the working space, what `r`, `g` and `b` hold */
const LINEAR: ColorSpaceName = 'srgb-linear';

/** a colour's hue, saturation and lightness, each 0 to 1 */
export interface HSL {
  /** the hue, round the wheel from red */
  h: number;
  /** the saturation */
  s: number;
  /** the lightness */
  l: number;
}

/** an sRGB component made linear (three's `SRGBToLinear`, its constants) */
export function srgbToLinear(c: number): number {
  if (c < 0.04045) return c * 0.0773993808;
  return Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

/** a linear component made sRGB (three's `LinearToSRGB`, its constants) */
export function linearToSrgb(c: number): number {
  if (c < 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(c, 0.41666) - 0.055;
}

/** what is made of a component going from a space into the working one (sRGB's curve undone, or nothing) */
function intoWorking(space: ColorSpaceName): (c: number) => number {
  return space === SRGB ? srgbToLinear : unchanged;
}

/** what is made of a component going from the working space out to another */
function outOfWorking(space: ColorSpaceName): (c: number) => number {
  return space === SRGB ? linearToSrgb : unchanged;
}

/** a component left as it is (linear, or no colour space) */
function unchanged(c: number): number {
  return c;
}

/** a component of a hue's RGB, from HSL's two bounds `p` and `q` */
function hueToRgb(p: number, q: number, t: number): number {
  const hue = euclideanModulo(t, 1);
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * 6 * (2 / 3 - hue);
  return p;
}

/** what is in `rgb(...)`: three numbers to 255 or three percents, and an alpha that is let go */
const RGB_NUMBERS = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/;
const PERCENT = String.raw`(\d+(?:\.\d+)?|\.\d+)\%`;
const ALPHA = String.raw`(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?`;
const RGB_PERCENTS = new RegExp(String.raw`^\s*${PERCENT}\s*,\s*${PERCENT}\s*,\s*${PERCENT}\s*${ALPHA}$`);
/** what is in `hsl(...)`: degrees, then two percents */
const DEGREES = String.raw`([+-]?(?:\d+(?:\.\d+)?|\.\d+))`;
const HSL_PARTS = new RegExp(String.raw`^\s*${DEGREES}\s*,\s*${PERCENT}\s*,\s*${PERCENT}\s*${ALPHA}$`);

/** what is in `r`, `g`, `b`; an interface, not class fields, so a subclass may give them accessors (TS2611) */
export interface Color {
  /** red, linear */
  r: number;
  /** green, linear */
  g: number;
  /** blue, linear */
  b: number;
}

/** three's `Color`; its components are assigned in the constructor, not declared as fields (see `Vec3`) */
export class Color {
  /** white, or `set(r)` with one argument, or the linear components with three */
  constructor(r?: ColorRepresentation, g?: number, b?: number) {
    this.r = 1;
    this.g = 1;
    this.b = 1;
    if (r === undefined) return;
    if (g === undefined && b === undefined) this.set(r);
    else if (typeof r === 'number') this.setRGB(r, g ?? 0, b ?? 0);
  }

  /** true: what the game tests for three's `isColor` */
  get isColor(): true {
    return true;
  }

  /** takes a colour (`Color`, hex, CSS), or three linear components */
  set(r: ColorRepresentation, g?: number, b?: number): this {
    if (g !== undefined && b !== undefined && typeof r === 'number') return this.setRGB(r, g, b);
    if (r instanceof Color) return this.copy(r);
    if (typeof r === 'number') return this.setHex(r);
    return this.setStyle(r);
  }

  /** all three components `scalar` */
  setScalar(scalar: number): this {
    return this.setRGB(scalar, scalar, scalar);
  }

  /** from a hex number in `colorSpace` (sRGB unless said) */
  setHex(hex: number, colorSpace: ColorSpaceName = SRGB): this {
    const whole = Math.floor(hex);
    const red = ((whole >> 16) & 255) / 255;
    const green = ((whole >> 8) & 255) / 255;
    const blue = (whole & 255) / 255;
    return this.setRGB(red, green, blue, colorSpace);
  }

  /** from components in `colorSpace` (linear unless said) */
  setRGB(r: number, g: number, b: number, colorSpace: ColorSpaceName = LINEAR): this {
    const into = intoWorking(colorSpace);
    this.r = into(r);
    this.g = into(g);
    this.b = into(b);
    return this;
  }

  /** from hue, saturation and lightness (0 to 1) in `colorSpace` (linear unless said, as three's) */
  setHSL(h: number, s: number, l: number, colorSpace: ColorSpaceName = LINEAR): this {
    const hue = euclideanModulo(h, 1);
    const saturation = clamp(s, 0, 1);
    const lightness = clamp(l, 0, 1);
    if (saturation === 0) return this.setRGB(lightness, lightness, lightness, colorSpace);
    const high = lightness <= 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const low = 2 * lightness - high;
    const red = hueToRgb(low, high, hue + 1 / 3);
    const green = hueToRgb(low, high, hue);
    const blue = hueToRgb(low, high, hue - 1 / 3);
    return this.setRGB(red, green, blue, colorSpace);
  }

  /**
   * From CSS in `colorSpace` (sRGB unless said): `#rgb`, `#rrggbb`, `rgb(...)`, `rgba(...)`, `hsl(...)`,
   * `hsla(...)` (an alpha let go) or a colour name. Follows three.js 0.187.0's `Color.setStyle` (its patterns);
   * anything else leaves the colour as it was, as three's does, with a warning.
   */
  setStyle(style: string, colorSpace: ColorSpaceName = SRGB): this {
    const call = /^(\w+)\(([^)]*)\)/.exec(style);
    if (call) return this.setCall(style, call[1], call[2], colorSpace);
    const hex = /^#([A-Fa-f\d]+)$/.exec(style);
    if (hex && hex[1].length === 3) {
      const digit = (i: number): number => parseInt(hex[1].charAt(i), 16) / 15;
      return this.setRGB(digit(0), digit(1), digit(2), colorSpace);
    }
    if (hex && hex[1].length === 6) return this.setHex(parseInt(hex[1], 16), colorSpace);
    const named = CSS_COLORS[style.toLowerCase()];
    if (named !== undefined) return this.setHex(named, colorSpace);
    console.warn('Color: unknown colour ' + style);
    return this;
  }

  /** from CSS's `rgb(...)` or `hsl(...)` */
  private setCall(style: string, name: string, inside: string, colorSpace: ColorSpaceName): this {
    const numbers = name === 'rgb' || name === 'rgba' ? RGB_NUMBERS.exec(inside) : null;
    if (numbers) {
      const part = (i: number): number => Math.min(255, parseInt(numbers[i], 10)) / 255;
      return this.setRGB(part(1), part(2), part(3), colorSpace);
    }
    const percents = name === 'rgb' || name === 'rgba' ? RGB_PERCENTS.exec(inside) : null;
    if (percents) {
      const part = (i: number): number => Math.min(100, parseFloat(percents[i])) / 100;
      return this.setRGB(part(1), part(2), part(3), colorSpace);
    }
    const hsl = name === 'hsl' || name === 'hsla' ? HSL_PARTS.exec(inside) : null;
    if (hsl) {
      const hue = parseFloat(hsl[1]) / 360;
      return this.setHSL(hue, parseFloat(hsl[2]) / 100, parseFloat(hsl[3]) / 100, colorSpace);
    }
    console.warn('Color: unknown colour ' + style);
    return this;
  }

  /** a new plain `Color` with these components */
  clone(): Color {
    return new Color(this.r, this.g, this.b);
  }

  /** takes `color`'s components */
  copy(color: Color): this {
    return this.setRGB(color.r, color.g, color.b);
  }

  /** takes `color`'s components, read as sRGB, made linear */
  copySRGBToLinear(color: Color): this {
    return this.setRGB(srgbToLinear(color.r), srgbToLinear(color.g), srgbToLinear(color.b));
  }

  /** takes `color`'s components, read as linear, made sRGB */
  copyLinearToSRGB(color: Color): this {
    return this.setRGB(linearToSrgb(color.r), linearToSrgb(color.g), linearToSrgb(color.b));
  }

  /** its own components, read as sRGB, made linear */
  convertSRGBToLinear(): this {
    return this.copySRGBToLinear(this);
  }

  /** its own components, read as linear, made sRGB */
  convertLinearToSRGB(): this {
    return this.copyLinearToSRGB(this);
  }

  /** as a hex number in `colorSpace` (sRGB unless said), each component clamped and rounded */
  getHex(colorSpace: ColorSpaceName = SRGB): number {
    const out = outOfWorking(colorSpace);
    const byte = (c: number): number => Math.round(clamp(out(c) * 255, 0, 255));
    return byte(this.r) * 65536 + byte(this.g) * 256 + byte(this.b);
  }

  /** as six hex digits in `colorSpace` (sRGB unless said), no `#` */
  getHexString(colorSpace: ColorSpaceName = SRGB): string {
    return this.getHex(colorSpace).toString(16).padStart(6, '0');
  }

  /** its hue, saturation and lightness in `colorSpace` (linear unless said), written into `target` */
  getHSL(target: HSL, colorSpace: ColorSpaceName = LINEAR): HSL {
    const out = outOfWorking(colorSpace);
    const red = out(this.r);
    const green = out(this.g);
    const blue = out(this.b);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (min + max) / 2;
    if (min === max) {
      target.h = 0;
      target.s = 0;
      target.l = lightness;
      return target;
    }
    const delta = max - min;
    target.s = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
    if (max === red) target.h = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
    else if (max === green) target.h = ((blue - red) / delta + 2) / 6;
    else target.h = ((red - green) / delta + 4) / 6;
    target.l = lightness;
    return target;
  }

  /** as CSS in `colorSpace`: `rgb(r,g,b)` to 255 for sRGB (the default), `color(space r g b)` otherwise */
  getStyle(colorSpace: ColorSpaceName = SRGB): string {
    const out = outOfWorking(colorSpace);
    const red = out(this.r);
    const green = out(this.g);
    const blue = out(this.b);
    if (colorSpace !== SRGB) return `color(${colorSpace} ${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)})`;
    return `rgb(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)})`;
  }

  /** its hue, saturation and lightness (linear) moved by the three given */
  offsetHSL(h: number, s: number, l: number): this {
    this.getHSL(hslA);
    return this.setHSL(hslA.h + h, hslA.s + s, hslA.l + l);
  }

  /** adds `color` */
  add(color: Color): this {
    return this.setRGB(this.r + color.r, this.g + color.g, this.b + color.b);
  }

  /** adds `scalar` to each */
  addScalar(scalar: number): this {
    return this.setRGB(this.r + scalar, this.g + scalar, this.b + scalar);
  }

  /** multiplies each by `color`'s */
  multiply(color: Color): this {
    return this.setRGB(this.r * color.r, this.g * color.g, this.b * color.b);
  }

  /** multiplies each by `scalar` */
  multiplyScalar(scalar: number): this {
    return this.setRGB(this.r * scalar, this.g * scalar, this.b * scalar);
  }

  /** moved `alpha` of the way to `color` (in linear RGB) */
  lerp(color: Color, alpha: number): this {
    const r = this.r;
    const g = this.g;
    const b = this.b;
    return this.setRGB(r + (color.r - r) * alpha, g + (color.g - g) * alpha, b + (color.b - b) * alpha);
  }

  /** becomes the colour `alpha` of the way from `a` to `b` (in linear RGB) */
  lerpColors(a: Color, b: Color, alpha: number): this {
    return this.setRGB(a.r + (b.r - a.r) * alpha, a.g + (b.g - a.g) * alpha, a.b + (b.b - a.b) * alpha);
  }

  /** moved `alpha` of the way to `color` by hue, saturation and lightness (the hue straight, not the short way) */
  lerpHSL(color: Color, alpha: number): this {
    this.getHSL(hslA);
    color.getHSL(hslB);
    const h = lerp(hslA.h, hslB.h, alpha);
    const s = lerp(hslA.s, hslB.s, alpha);
    const l = lerp(hslA.l, hslB.l, alpha);
    return this.setHSL(h, s, l);
  }

  /** whether `color` has the same components */
  equals(color: Color): boolean {
    return color.r === this.r && color.g === this.g && color.b === this.b;
  }

  /** takes three linear components from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.setRGB(array[offset], array[offset + 1], array[offset + 2]);
  }

  /** the three linear components as a new array */
  toArray(): [number, number, number];
  /** writes the three linear components into `array` at `offset` */
  toArray<T extends NumberArray>(array: T, offset?: number): T;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }
}

/** the HSL `offsetHSL` and `lerpHSL` work in */
const hslA: HSL = { h: 0, s: 0, l: 0 };
const hslB: HSL = { h: 0, s: 0, l: 0 };
