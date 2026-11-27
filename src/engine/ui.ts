// The engine's panels as the page writes them (Bulwark's ui.rs, gpu/panels.rs; #973: the game's UI moved off the
// page): a panel's layout and look written as the fixed numbers Bulwark reads (`ui/style.rs`, `ui/look.rs`), and
// the calls that make, change and take away panels by the page's ids, lay them out and find the one under a point.
// What the game builds on them is `ui/kit/`.
import { RUST } from './index';

/** A length: px of the UI's reference layout, a percent of the container, or auto. */
export type Length = number | `${number}%` | 'auto';
/** Four sides as CSS gives them: one for all, or top, right, bottom, left. */
export type Sides<T> = T | [T, T, T, T];
type Align = 'start' | 'end' | 'center' | 'stretch' | 'baseline';
type Spread = 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';

/** A panel's layout, as CSS's flexbox lays it out (grid and block are laid out as flex rows and columns). */
export interface PanelStyle {
  display?: 'flex' | 'none';
  position?: 'relative' | 'absolute';
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: boolean;
  alignItems?: Align;
  alignSelf?: Align;
  justify?: Spread;
  alignContent?: Spread;
  grow?: number;
  shrink?: number;
  basis?: Length;
  width?: Length;
  height?: Length;
  minWidth?: Length;
  minHeight?: Length;
  maxWidth?: Length;
  maxHeight?: Length;
  margin?: Sides<Length>;
  padding?: Sides<Length>;
  /** each side's border width (px) */
  border?: Sides<number>;
  inset?: Sides<Length>;
  /** between items: one for both, or across and down (px) */
  gap?: number | [number, number];
  overflow?: 'visible' | 'hidden' | 'scroll';
  aspect?: number;
}

/** A shadow under a box: its blur and how far down it falls (px), its colour. */
export interface PanelShadow { blur: number; y?: number; color: string }

/** A panel's look. Colours are CSS's (`#rgb`, `#rrggbb`, `rgb()`, `rgba()`). */
export interface PanelLook {
  /** its fill, or its fill from top to bottom */
  fill?: string | [string, string];
  border?: string;
  /** its corners' radii: one for all, or top left, top right, bottom right, bottom left (px) */
  radius?: Sides<number>;
  /** how much of it, and of all inside it, shows */
  opacity?: number;
  /** whether it takes the pointer */
  hits?: boolean;
  shadow?: PanelShadow;
  /** how far what's inside it is scrolled up (px) */
  scroll?: number;
  /** its picture: the overlay's atlas's corners (u, v of the top left, then of the bottom right), a tint, and how far
   *  it reaches past its box each side (px) */
  picture?: { uv: [number, number, number, number]; tint?: string; bleed?: number };
}

/** floats a panel's layout and look take (Bulwark's `STYLE_FLOATS`, `LOOK_FLOATS`) */
export const STYLE_FLOATS = 56;
export const LOOK_FLOATS = 36;

const PX = 1;
const PERCENT = 2;
const ALIGN: Record<Align, number> = { start: 0, end: 1, center: 2, stretch: 3, baseline: 4 };
const SPREAD: Record<Spread, number> = { start: 0, end: 1, center: 2, between: 3, around: 4, evenly: 5 };
const DIRECTION = { row: 0, column: 1, 'row-reverse': 2, 'column-reverse': 3 } as const;
const OVERFLOW = { visible: 0, hidden: 1, scroll: 2 } as const;

/** Four sides of `sides`, top first. */
function four<T>(sides: Sides<T>): [T, T, T, T] {
  return Array.isArray(sides) ? sides : [sides, sides, sides, sides];
}

/** A length's value and unit, px scaled by `scale`; `fallback`'s where none is given. */
function lengthOf(length: Length | undefined, scale: number, fallback: Length = 'auto'): [number, number] {
  const given = length ?? fallback;
  if (given === 'auto') return [0, 0];
  if (typeof given === 'number') return [given * scale, PX];
  return [parseFloat(given), PERCENT];
}

/** A layout as Bulwark reads it, every px of the reference layout `scale` of the UI's own. */
export function styleFloats(s: PanelStyle, scale: number): Float32Array {
  const f = new Float32Array(STYLE_FLOATS).fill(NaN);
  const put = (at: number, length: Length | undefined, fallback: Length = 'auto') => {
    f.set(lengthOf(length, scale, fallback), at);
  };
  f[0] = s.display === 'none' ? 3 : 0;
  f[1] = s.position === 'absolute' ? 1 : 0;
  f[2] = DIRECTION[s.direction ?? 'row'];
  f[3] = s.wrap ? 1 : 0;
  if (s.alignItems) f[4] = ALIGN[s.alignItems];
  if (s.alignSelf) f[5] = ALIGN[s.alignSelf];
  if (s.justify) f[6] = SPREAD[s.justify];
  if (s.alignContent) f[7] = SPREAD[s.alignContent];
  f[8] = s.grow ?? 0;
  f[9] = s.shrink ?? 1;
  put(10, s.basis);
  put(12, s.width);
  put(14, s.height);
  put(16, s.minWidth);
  put(18, s.minHeight);
  put(20, s.maxWidth);
  put(22, s.maxHeight);
  four(s.margin ?? 0).forEach((side, i) => put(24 + i * 2, side));
  four(s.padding ?? 0).forEach((side, i) => put(32 + i * 2, side));
  four(s.border ?? 0).forEach((side, i) => { f[40 + i] = side * scale; });
  four(s.inset ?? 'auto').forEach((side, i) => put(44 + i * 2, side));
  const gap = s.gap ?? 0;
  const [across, down] = Array.isArray(gap) ? gap : [gap, gap];
  f[52] = across * scale;
  f[53] = down * scale;
  f[54] = OVERFLOW[s.overflow ?? 'visible'];
  if (s.aspect) f[55] = s.aspect;
  return f;
}

/** A look as Bulwark reads it, every px of the reference layout `scale` of the UI's own. */
export function lookFloats(l: PanelLook, scale: number): Float32Array {
  const f = new Float32Array(LOOK_FLOATS).fill(NaN);
  const [top, bottom] = Array.isArray(l.fill) ? l.fill : [l.fill, undefined];
  f.set(rgba(top ?? 'transparent'), 0);
  if (bottom) f.set(rgba(bottom), 4);
  f.set(rgba(l.border ?? 'transparent'), 8);
  f.set(four(l.radius ?? 0).map((r) => r * scale), 12);
  f[16] = l.opacity ?? 1;
  f[17] = l.hits ? 1 : 0;
  if (l.picture) {
    f.set(l.picture.uv, 18);
    if (l.picture.tint) f.set(rgba(l.picture.tint), 22);
    f[33] = (l.picture.bleed ?? 0) * scale;
  }
  f[26] = (l.scroll ?? 0) * scale;
  if (l.shadow) {
    f[27] = l.shadow.blur * scale;
    f[28] = (l.shadow.y ?? 0) * scale;
    f.set(rgba(l.shadow.color), 29);
  }
  return f;
}

const parsed = new Map<string, [number, number, number, number]>();
/** A CSS colour as red, green, blue and alpha, each 0 to 1 (as the page's canvas reads it). */
export function rgba(color: string): [number, number, number, number] {
  const known = parsed.get(color);
  if (known) return known;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color)?.[1];
  let out: [number, number, number, number] = [0, 0, 0, 0];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((d) => d + d).join('') : hex;
    const at = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    out = [at(0), at(1), at(2), full.length === 8 ? at(3) : 1];
  } else {
    const parts = /^rgba?\(([^)]*)\)$/i.exec(color.trim())?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts && parts.length >= 3) out = [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
  }
  parsed.set(color, out);
  return out;
}

/** The engine's handle, none before it has started. */
const engine = () => RUST.bridge?.handle ?? null;

/** The panels' screen: `width` by `height` css px, `scale` of the engine's canvas's pixels each. */
export function uiScreen(width: number, height: number, scale: number): void {
  engine()?.ui_screen(width, height, scale);
}

/** A panel made by the page's id inside `parent` (none: the screen), before its child `before` (none: at its end). */
export function uiMake(id: number, parent: number | null, before: number | null, style: Float32Array,
  look: Float32Array): void {
  engine()?.ui_make(id, parent ?? -1, before ?? -1, style, look);
}

export function uiRestyle(id: number, style: Float32Array): void {
  engine()?.ui_restyle(id, style);
}

export function uiRelook(id: number, look: Float32Array): void {
  engine()?.ui_relook(id, look);
}

/** A panel's picture `width` by `height` css px (none: it has none). */
export function uiContent(id: number, size: { w: number; h: number } | null): void {
  engine()?.ui_content(id, size ? size.w : -1, size ? size.h : 0);
}

export function uiRemove(id: number): void {
  engine()?.ui_remove(id);
}

/** The topmost panel that takes the pointer at `x`, `y` (css px), if any. */
export function uiHit(x: number, y: number): number | null {
  const id = engine()?.ui_hit(x, y) ?? -1;
  return id < 0 ? null : id;
}

/** A panel's box (css px) as it will be drawn next, if it's shown. */
export function uiRect(id: number): { x: number; y: number; w: number; h: number } | null {
  const handle = engine();
  if (!handle) return null;
  handle.ui_update();
  const r = handle.ui_rect(id);
  return r.length === 4 ? { x: r[0], y: r[1], w: r[2], h: r[3] } : null;
}

/** How many rows the panels' pass draws (the lab's count). */
export const uiRows = (): number => engine()?.ui_rows() ?? 0;
