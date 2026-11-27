// A style sheet's rules as the kit takes them (#973; `sheet.ts` draws a screen by them): each rule of the SCSS keyed
// by its own selector, its declarations as the kit's layout, look and text, and what CSS does that a rule says by
// hand. Here too the helpers that read the page's markup the way CSS reads it.
import type { Panel, Paint } from './panel';
import type { RunStyle } from './runs';
import type { PanelLook, PanelStyle } from '../../engine/ui';
import type { TextStyle } from '../overlay/paint';
import { INK } from './theme';

/** A value given as it is, or read as each frame needs it: from the element it's for and the panel round its own (a
 *  class's accent, an item's colour in its inline `--c`, a width shared out of its row's). */
export type Dyn<T> = T | ((element: Element, round: Panel | null) => T);

/** A text's style as a rule gives it: the parts it sets, and how its lines stand in their box (`text-align`). */
export type SheetText = Partial<RunStyle> & { align?: 'start' | 'center' | 'end' };

/** A picture a rule paints across its element's box (a skill slot's face, as the skill bar paints it): its key, which
 *  changes as what it shows does, and how it's painted (px of the art). */
export interface Painted {
  key: string;
  paint: Paint;
}

/** A mark over a corner of a box: where it stands (its inset, px), and a dot (its side and fill) or a glyph. */
export interface Mark {
  inset: PanelStyle['inset'];
  dot?: { side: number; fill: string };
  /** a bar down the box, this wide, in its element's colour (a side's border of another colour: `border-left: 3px
   *  solid var(--cc)`, a save's hero in his class's accent) */
  bar?: { width: number; fill: (element: Element) => string };
  says?: string;
  text?: SheetText;
}

/** One rule of a screen's style sheet. */
export interface Rule {
  /** the SCSS rule's selector, matched by the page's own `matches` */
  at: string;
  /** whether it applies now (its `@media`'s query: a short screen's), always where none */
  when?: () => boolean;
  /** drawn apart, by another screen or left on the page: no panel made for it here, nor stood in for it (the lobby's
   *  tree held the card's hidden, and the lab read the card as not shown) */
  apart?: boolean;
  /** its layout (not inherited) */
  box?: Dyn<PanelStyle>;
  /** laid out as CSS's flex or grid (`display: flex`): what's in it is boxes, never runs of a line of text */
  flex?: boolean;
  /** it and all in it take the pointer (CSS's `pointer-events: auto` on a box the page's `.kit-mirror` turns off):
   *  the pointer's events over them are the page's elements' (`forward.ts`), none of the world's */
  hits?: boolean;
  /** what's in it scrolls (`overflow-y: auto`): the wheel and a finger's drag move it (`scroll.ts`) */
  scrolls?: boolean;
  /** words after its own (CSS's `::after` with `content`), in their style */
  after?: { says: string; text?: SheetText };
  /** words before its own (CSS's `::before`, a `summary`'s marker), in their style */
  before?: { says: string; text?: SheetText };
  /** words in place of its own (a `::after` laid over them with `content`: a held button's hint) */
  says?: Dyn<string>;
  /** its look (not inherited) */
  look?: Dyn<PanelLook>;
  /** its text's style, inherited by everything inside it as CSS inherits font and colour */
  text?: Dyn<SheetText>;
  /** a ring drawn just inside its border (CSS's `box-shadow: inset 0 0 0 1px colour`) */
  ring?: Dyn<string>;
  /** the ornamented frame's line and corner brackets inside it (`::before` with `corner-brackets`) */
  brackets?: boolean;
  /** an SVG in it drawn as a picture this size (px), as its stylesheet paints it */
  picture?: Dyn<[number, number]>;
  /** small marks laid over its corners (CSS's `::before` and `::after` boxes: a new item's dot, a better one's ▲) */
  marks?: Mark[];
  /** its picture turned this far (degrees, clockwise: CSS's `transform: rotate()` on an icon) */
  turn?: number;
  /** a picture painted across the box inside its border (`w` by `h` px of the art), under what's in it and its ring */
  paint?: (element: Element, w: number, h: number) => Painted | null;
  /** what changes while the pointer's over it or pressing it (CSS's `:hover`; `lit`: `filter: brightness()`) */
  hover?: { look?: PanelLook; text?: SheetText; lit?: number; ring?: string };
  /** its opacity and its shift eased over this long (s: CSS's `transition: opacity, transform`) */
  ease?: number;
  /** moved this far across and down (px: CSS's `transform: translate()`), laid out where it was */
  shift?: [number, number];
  /** its opacity running from `from` to `to` and back, each way `period` s (an `infinite alternate` animation) */
  pulse?: { period: number; from: number; to: number };
  /** drawn over everything else of its screen (a `z-index` over its later siblings: the stash filter's panel over
   *  the stash), placed against its parent's box as an absolute box is */
  lift?: boolean;
}

/** A screen's style sheet: its rules in the cascade's order. */
export type Sheet = readonly Rule[];

/** what CSS lays out inline: an element of these in a text's line is a run of it, not a box of its own */
export const INLINE = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'SMALL', 'S', 'A', 'KBD', 'CODE', 'BR', 'ABBR',
  'TIME']);
/** what's never drawn */
export const SKIPPED = new Set(['TEMPLATE', 'SCRIPT', 'STYLE', 'DEFS']);
/** the text every tree starts from (the page's body: its face, the browser's 16 px, the theme's ink) */
export const BODY: TextStyle = { face: 'body', size: 16, color: INK };

/** The value of `value` now, for `element` in `round`. */
export function now<T>(value: Dyn<T>, element: Element, round: Panel | null): T {
  return typeof value === 'function' ? (value as (e: Element, r: Panel | null) => T)(element, round) : value;
}

/** `fields` with each of `before` it hasn't now given back as none (a style keeps the fields it isn't given). */
export function whole<T extends object>(fields: T, before: string[]): T {
  const out: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
  for (const key of before) {
    if (!(key in out)) out[key] = undefined;
  }
  return out as T;
}

/** Whether `element` is a line of text: words of its own, or only inline elements in it. */
export function isText(element: Element): boolean {
  let words = false;
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()) words = true;
    else if (child instanceof Element && !INLINE.has(child.tagName) && !SKIPPED.has(child.tagName.toUpperCase())) {
      return false;
    }
  }
  return words || [...element.children].some((child) => INLINE.has(child.tagName) && child.textContent?.trim());
}

/** What an element's rules depend on: its own name, classes and attributes, its `style` only where `styled` (a sheet
 *  with rules on it: a placed element's style changes as it moves, matched again at each move). */
export function ownKey(element: Element, styled = false): string {
  let key = element.tagName;
  for (const attribute of element.attributes) {
    if (styled || attribute.name !== 'style') key += ` ${attribute.name}=${attribute.value}`;
  }
  if ((element as HTMLButtonElement).disabled) key += ' :disabled';
  return key;
}

/** What the rules of an element at the root of a screen depend on round it: its ancestors' keys. */
export function aroundKey(element: Element): string {
  let key = '';
  for (let at = element.parentElement; at; at = at.parentElement) key = `${ownKey(at)}>${key}`;
  return key;
}

/** `colour` brightened `by`, as CSS's `brightness()` filter on it (a `#rrggbb`, `rgb()` or `rgba()`). */
export function lit(colour: string, by: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  const parts = hex
    ? [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16)).concat(1)
    : (/rgba?\(([^)]+)\)/.exec(colour)?.[1].split(',').map(Number) ?? null);
  if (!parts) return colour;
  const [r, g, b] = parts.slice(0, 3).map((value) => Math.min(255, Math.round(value * by)));
  return `rgba(${r},${g},${b},${parts[3] ?? 1})`;
}

/** `look` brightened `by` (its fills and its border). */
export function litLook(look: PanelLook, by: number): PanelLook {
  const fill = look.fill;
  const lighter = Array.isArray(fill) ? [lit(fill[0], by), lit(fill[1], by)] as [string, string]
    : fill ? lit(fill, by) : fill;
  return { ...look, fill: lighter, border: look.border ? lit(look.border, by) : look.border };
}

/** The style an element's rules give it, gathered in the cascade's order. */
export interface Gathered {
  box: PanelStyle;
  look: PanelLook;
  text: TextStyle & SheetText;
  ring?: string;
  brackets: boolean;
  picture?: [number, number];
  marks: Mark[];
  turn: number;
  paint?: Rule['paint'];
  flex: boolean;
  after?: Rule['after'];
  before?: Rule['before'];
  says?: string;
  hits?: boolean;
  scrolls: boolean;
  ease: number;
  shift: [number, number];
  pulse?: Rule['pulse'];
  lift: boolean;
}
