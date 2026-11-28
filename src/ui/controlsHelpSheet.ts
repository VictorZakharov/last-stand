// The controls' help drawn by the engine (ui/kit's sheet; #973): the pause menu's Controls tab and How to play (both
// `.controls-help`, written by `menus.ts`'s `renderControlsHelp`), rule for rule from `styles/_modals.scss`: the left of
// a keyboard, its keys staggered as a real one's, those the game uses lit with what they do (a glyph, a drawn icon or
// a skill's picture, its name under it); a mouse with callouts; on touch a list of the controls. Sizes are px of the
// lobby's scale. Not drawn: the keyboard's faded right edge (CSS's mask; the rows end before it) and a key's
// tooltip (its `title`).
import { drawnAt } from './kit/press';
import { kitFrame } from './kit/panel';
import { SHORT } from './controlsSheet';
import { accent } from './diagFrame';
import { INK, INK_DIM, alpha } from './kit/theme';
import { uiScales } from './scale';
import { artLoaded } from './slotFace';
import { measure } from './overlay/paint';
import { BODY } from './kit/sheetRules';
import type { Painted, Sheet } from './kit/sheet';

/** a key's most width (px of one key's), the gaps between keys, the room after the rows, and the keys along a row */
const KEY_MOST = 46;
const KEY_GAP = 4;
const AFTER_ROWS = 84;
const ROW_KEYS = 11.5;
/** a key's height, the top row's */
const KEY_H = 54;
const TOP_KEY_H = 34;

/** The diagrams' zoom: 0.6 in the pause menu on a short screen (`.pause-box .controls-help.diagrams { zoom: .6 }`). */
const zoomOf = (element: Element): number => (SHORT() && element.closest('.pause-box') ? 0.6 : 1);

/** each pause page's drawn box, read once a frame (read for each key, its search of every stand-in was a fifth of
 *  the pause menu's frame) */
const pagesDrawn = new WeakMap<Element, { frame: number; drawn: ReturnType<typeof drawnAt> }>();

/** `page`'s drawn box this frame. */
function pageDrawn(page: Element): ReturnType<typeof drawnAt> {
  const kept = pagesDrawn.get(page);
  if (kept?.frame === kitFrame()) return kept.drawn;
  const drawn = drawnAt(page);
  pagesDrawn.set(page, { frame: kitFrame(), drawn });
  return drawn;
}

/** The keyboard's column's width (CSS's `100cqw`: the pause page's inside, else the window's), px of its scale. */
function columnOf(element: Element): number {
  const page = element.closest('.pb-page');
  const drawn = page ? pageDrawn(page) : null;
  const zoom = zoomOf(element);
  if (!drawn) return innerWidth / uiScales.ui / zoom;
  return (drawn.w / uiScales.ui - 24) / zoom;
}

/** One key's width (CSS's `--u`): as wide as its column lets 11.5 keys and their gaps and the room after them be. */
const keyUnit = (element: Element): number => Math.min(KEY_MOST, (columnOf(element) - AFTER_ROWS) / ROW_KEYS);

/** The keyboard's widest row (px of one key's unit): its keys' spans and the gaps between them. */
function widestRow(keyboard: Element): number {
  const unit = keyUnit(keyboard);
  const rowWidth = (row: Element): number => {
    const keys = [...row.children] as HTMLElement[];
    const spans = keys.map((key) => Number(key.style.getPropertyValue('--w')) || 1);
    return spans.reduce((sum, span) => sum + unit * span + KEY_GAP * (span - 1), 0) + KEY_GAP * (keys.length - 1);
  };
  return Math.max(0, ...[...keyboard.children].map(rowWidth));
}

/** A key's own colour (its inline `--c`), or the class's accent. */
const keyColour = (element: Element): string =>
  (element.closest('[style*="--c"]') as HTMLElement | null)?.style.getPropertyValue('--c').trim() || accent();

/** `colour` (`#rrggbb`) at `share` over `under` (`#rrggbb`): CSS's `color-mix` of a lit key's middle. */
function mixed(colour: string, share: number, under: string): string {
  const parse = (hex: string): number[] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const top = /^#[0-9a-f]{6}$/i.test(colour) ? parse(colour) : parse('#f0be5a');
  const low = parse(under);
  const [r, g, b] = top.map((value, at) => Math.round(value * share + low[at] * (1 - share)));
  return `rgb(${r},${g},${b})`;
}

/** A skill's picture filling its key, darkened behind the key's words (`.kb-key.on.art` and its `::after`). */
function keyArt(element: Element, w: number, h: number): Painted | null {
  const art = (element.querySelector('i.art') as HTMLElement | null)?.style.backgroundImage;
  const url = art ? /url\(["']?([^"')]+)["']?\)/.exec(art)?.[1] : undefined;
  if (!url) return null;
  const image = artLoaded(url, () => undefined);
  return {
    key: `${url} ${w}x${h} ${!!image}`,
    paint: (c) => {
      if (image) {
        const side = Math.max(w, h);
        c.drawImage(image, (w - side) / 2, (h - side) / 2, side, side);
      }
      const shade = c.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, 'rgba(0,0,0,.55)');
      shade.addColorStop(0.32, 'rgba(0,0,0,0)');
      shade.addColorStop(0.52, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,.8)');
      c.fillStyle = shade;
      c.fillRect(0, 0, w, h);
    },
  };
}

/** the words over a skill's picture: white, in a dark glow */
const OVER_ART = [{ x: 0, y: 0, blur: 2, color: '#000' }, { x: 0, y: 0, blur: 4, color: '#000' },
  { x: 0, y: 0, blur: 6, color: '#000' }, { x: 0, y: 1, blur: 2, color: '#000' }];

/** the touch list's gap between its columns (px) */
const LIST_GAP = 14;

/** The widest of `parts`' words in `style` (px of the reference layout). */
function widest(parts: Element[], style: typeof BODY): number {
  return Math.max(0, ...parts.map((part) => measure(part.textContent ?? '', style).w));
}

/** The touch list's names' column: as wide as its widest name (the grid's `auto` column). */
function namesWidth(element: Element): number {
  const help = element.closest('.controls-help');
  const names = help ? [...help.querySelectorAll('.k')] : [];
  return widest(names, { ...BODY, face: 'display', size: 14 });
}

/** The room the touch list's column has (px of its scale): its pause page's inside, or its box's. */
function listRoom(element: Element): number {
  const column = element.closest('.pb-page, .help-cols, .modal-box');
  const drawn = column ? drawnAt(column) : null;
  if (!drawn) return Infinity;
  const inside = column!.matches('.pb-page') ? 24 : column!.matches('.modal-box') ? 52 : 0;
  return drawn.w / uiScales.ui - inside;
}

/** The touch list's doings' column: its widest line's width, held within the room its names leave (the grid's `1fr`
 *  of a list as wide as its content, `fit-content`). */
function doingsWidth(element: Element): number {
  const help = element.closest('.controls-help');
  const doings = help ? [...help.querySelectorAll('.k + span')] : [];
  const most = widest(doings, { ...BODY, size: 14 }) + 1;
  return Math.max(0, Math.min(most, listRoom(element) - namesWidth(element) - 1 - LIST_GAP));
}

/** The mouse's callouts' places (shares of the drawing: `.ms-label`'s `calc(146 / 460 * 100%)` and the rest). */
const MS = { left: 314 / 460, right: 1 - 146 / 460, buttons: 42 / 170, wheel: 100 / 170, move: 130 / 170 };
/** half a callout's height (CSS's `translateY(-50%)`: a name's line over its doing's) */
const HALF_CALLOUT = 14;
const pct = (share: number): `${number}%` => `${Number((share * 100).toFixed(3))}%`;

export const CONTROLS_HELP: Sheet = [
  // the touch list: a name's column as wide as the widest, what it does beside it
  { at: '.controls-help', flex: true, box: (element) => ({ direction: 'row', wrap: true, gap: [LIST_GAP, 4],
    alignItems: 'baseline', width: namesWidth(element) + 1 + LIST_GAP + doingsWidth(element) + 0.5 }),
    text: { size: 14, align: 'start' } },
  { at: '.controls-help .k', box: (element) => ({ width: namesWidth(element) + 1 }),
    text: () => ({ face: 'display', color: accent(), align: 'end' }) },
  { at: '.controls-help .k + span', box: (element) => ({ width: doingsWidth(element) }) },
  { at: '.pause-box .controls-help', box: { gap: [14, 4], alignSelf: 'center' }, text: { size: 14 } },
  { at: '.pause-box .controls-help', when: SHORT, box: { gap: [12, 1] }, text: { size: 13 } },
  // the diagrams, the keyboard over the mouse
  { at: '.controls-help.diagrams', box: (element) => ({ direction: 'column', wrap: false, alignItems: 'center',
    gap: 14 * zoomOf(element), width: 'auto' }) },
  // (`.pause-box .controls-help`'s `gap: 4px 14px`, later in the SCSS, wins over the diagrams' 14 px in the menu)
  { at: '.pause-box .controls-help.diagrams', box: { gap: 4 } },
  { at: '.pause-box .controls-help.diagrams', when: SHORT, box: { gap: 8 * 0.6 } },
  { at: '.kb', flex: true, box: (element) => ({ direction: 'column', gap: KEY_GAP * zoomOf(element), alignSelf: 'center',
    width: (keyUnit(element) * ROW_KEYS + AFTER_ROWS) * zoomOf(element), maxWidth: '100%', shrink: 0 }) },
  // (not clipped, as CSS's `overflow: hidden` clips it: taffy sizes a clipping box by less than its rows, and the
  // column squeezed it to its first three; its rows end before its edge, where its fade was)
  // (fitted to its rows by an inline width: the lab's canary, as it was before #741)
  { at: '.kb[style*="fit-content"]', box: (element) => ({ width: widestRow(element) * zoomOf(element) }) },
  { at: '.kb-row', flex: true, box: (element) => ({ direction: 'row', gap: KEY_GAP * zoomOf(element) }) },
  {
    at: '.kb-key',
    flex: true,
    box: (element) => {
      const zoom = zoomOf(element);
      const span = Number((element as HTMLElement).style.getPropertyValue('--w')) || 1;
      const top = element.parentElement?.matches('.kb-row:first-child');
      return { position: 'relative', shrink: 0, width: (keyUnit(element) * span + KEY_GAP * (span - 1)) * zoom,
        height: (top ? TOP_KEY_H : KEY_H) * zoom, border: [zoom, zoom, 3 * zoom, zoom] };
    },
    look: (element) => ({ fill: ['#1c1814', '#0e0c0a'], border: '#2e261d', radius: 5 * zoomOf(element) }),
    text: { color: '#574b3c' },
  },
  { at: '.kb-key b', box: (element) => ({ position: 'absolute', inset: [2 * zoomOf(element), 'auto', 'auto',
    5 * zoomOf(element)] }), text: (element) => ({ face: 'display', weight: 600, size: 11 * zoomOf(element) }) },
  {
    at: '.kb-key.on',
    look: (element) => ({ fill: [mixed(keyColour(element), 0.3, '#3a2c1a'), '#15100a'], radial: { y: 0.45, stop: 0.7 },
      border: '#a07c46', shadow: { blur: 10 * zoomOf(element), color: alpha(hexOf(keyColour(element)), 0.25) } }),
    text: { color: '#f3dca8' },
  },
  { at: '.kb-key.on i', box: (element) => ({ position: 'absolute', inset: [7 * zoomOf(element), 0, 'auto', 0],
    alignItems: 'center' }),
  text: (element) => ({ size: 17 * zoomOf(element), line: 1, color: keyColour(element), align: 'center',
    shadows: [{ x: 0, y: 0, blur: 4 * zoomOf(element), color: keyColour(element) }] }) },
  { at: '.kb-key.on i:has(svg)', picture: (element) => [18 * zoomOf(element), 18 * zoomOf(element)] },
  { at: '.kb-key.on.art', paint: keyArt },
  { at: '.kb-key.on i.art', box: { display: 'none' } },
  { at: '.kb-key.on small', box: (element) => ({ position: 'absolute', inset: ['auto', 2 * zoomOf(element),
    3 * zoomOf(element), 2 * zoomOf(element)], maxHeight: 18 * zoomOf(element), overflow: 'hidden' }),
  text: (element) => ({ size: 9 * zoomOf(element), line: 1, color: INK, align: 'center' }) },
  { at: '.kb-row:first-child .kb-key.on small', box: (element) => ({ inset: ['auto', 2 * zoomOf(element),
    4 * zoomOf(element), 2 * zoomOf(element)] }) },
  { at: '.kb-key em', box: (element) => ({ position: 'absolute', inset: [2 * zoomOf(element), 3 * zoomOf(element),
    'auto', 'auto'] }), text: (element) => ({ size: 8 * zoomOf(element), italic: true, color: INK_DIM }) },
  { at: '.kb-key.on.art :is(b, small, em)', text: { color: '#ffffff', shadows: OVER_ART } },
  { at: '.kb-key.on.art b', text: { color: '#ffe6b0' } },
  // the mouse: its drawing, and each callout beside the part it names
  // (a width and height of its own, the column's at most: as a share of a width and an aspect, it was 0 tall as the
  // pause menu's cell of pages was sized, and the cell held to the keyboard alone cut it off)
  { at: '.ms', flex: true, box: (element) => {
    const w = Math.min(460 * zoomOf(element), columnOf(element));
    return { position: 'relative', width: w, height: (w * 170) / 460, shrink: 0 };
  } },
  { at: '.ms svg', box: { position: 'absolute', inset: 0 }, picture: (element) => {
    const w = Math.min(460 * zoomOf(element), columnOf(element));
    return [w, (w * 170) / 460];
  } },
  { at: '.ms-label', flex: true, box: (element) => ({ position: 'absolute', direction: 'column',
    margin: [-HALF_CALLOUT * zoomOf(element), 0, 0, 0] }),
  text: (element) => ({ size: 13 * zoomOf(element), line: 1.2 }) },
  { at: '.ms-label:is(.lb, .move)', box: { alignItems: 'end' }, text: { align: 'end' } },
  { at: '.ms-label.lb', box: { inset: [pct(MS.buttons), pct(MS.right), 'auto', 'auto'] } },
  { at: '.ms-label.move', box: { inset: [pct(MS.move), pct(MS.right), 'auto', 'auto'] } },
  { at: '.ms-label.rb', box: { inset: [pct(MS.buttons), 0, 'auto', pct(MS.left)] } },
  { at: '.ms-label.wheel', box: { inset: [pct(MS.wheel), 0, 'auto', pct(MS.left)] } },
  { at: '.ms-what', text: (element) => ({ face: 'display', weight: 600, size: 10 * zoomOf(element), spacing: 1,
    upper: true, color: accent() }) },
  { at: '.ms-what em', text: (element) => ({ face: 'body', italic: true, size: 10 * zoomOf(element), upper: false,
    spacing: 0, color: INK_DIM }) },
  { at: '.ms-do', text: { color: INK } },
  { at: '.ms-do i', text: (element) => ({ color: keyColour(element),
    shadows: [{ x: 0, y: 0, blur: 4, color: keyColour(element) }] }) },
  // a click's skill's picture beside its name (before it on the right, after it on the left: `row-reverse`)
  { at: '.ms-do:has(i.art)', flex: true, box: { direction: 'row', alignItems: 'center' } },
  { at: '.ms-label.lb .ms-do:has(i.art)', box: { direction: 'row-reverse' } },
  { at: '.ms-do i.art', box: (element) => {
    const side = 18 * zoomOf(element);
    return { width: side, height: side, shrink: 0, margin: [0, 5 * zoomOf(element)] };
  }, look: { radius: 2 }, paint: calloutArt },
];

/** A callout's skill picture, cut to its square (`background: center / cover`). */
function calloutArt(element: Element, w: number, h: number): Painted | null {
  const art = (element as HTMLElement).style.backgroundImage;
  const url = art ? /url\(["']?([^"')]+)["']?\)/.exec(art)?.[1] : undefined;
  if (!url) return null;
  const image = artLoaded(url, () => undefined);
  if (!image) return null;
  return {
    key: `${url} ${w}x${h}`,
    paint: (c) => {
      const side = Math.max(w, h);
      c.drawImage(image, (w - side) / 2, (h - side) / 2, side, side);
    },
  };
}

/** `colour` as `#rrggbb` for `alpha` (a key's colour may be a CSS variable's value already resolved, or the accent). */
function hexOf(colour: string): string {
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#f0be5a';
}
