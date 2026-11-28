// The hero's colour picker drawn by the engine (ui/kit's sheet; #973): a swatch a colour and Any, the colour wheel's
// button, and the wheel's panel (its disc, its marker, its lightness and the colour as picked), rule for rule from
// `styles/_coop.scss`. The picker is `colourPicker.ts`'s markup, written and bound there as before; the disc is its
// canvas, copied as it's drawn. Sizes are px of the lobby's scale.
import { TOUCH } from './controlsSheet';
import { accent } from './diagFrame';
import { FRAME, INK, alpha } from './kit/theme';
import { uiScales } from './scale';
import type { Painted, Sheet } from './kit/sheet';

/** a swatch's side, and on touch a finger's (css px, the zoom taken out) */
const SWATCH = 32;
const FINGER = 40;
/** the disc's side and its marker's */
const DISC = 132;
const MARK = 12;
/** a chosen swatch's light */
const CHOSEN = '#ffe7b0';

/** A swatch's side now: a finger's on touch. */
const side = (): number => (TOUCH() ? FINGER / uiScales.ui : SWATCH);

/** An element's inline `--swatch` colour. */
const swatchOf = (element: Element): string =>
  (element as HTMLElement).style.getPropertyValue('--swatch').trim() || 'rgba(0,0,0,0)';

/** The wheel's button: a ring of every hue, the colour worn in its middle where it's the wheel's. */
function hueRing(element: Element, w: number, h: number): Painted {
  const worn = swatchOf(element);
  return {
    key: `${worn} ${w}x${h}`,
    paint: (c) => {
      const middle = { x: w / 2, y: h / 2 };
      const ring = c.createConicGradient(-Math.PI / 2, middle.x, middle.y);
      ['#c33', '#cc3', '#3c3', '#3cc', '#33c', '#c3c', '#c33'].forEach((hue, at, all) =>
        ring.addColorStop(at / (all.length - 1), hue));
      c.fillStyle = ring;
      c.beginPath();
      c.arc(middle.x, middle.y, Math.min(w, h) / 2, 0, Math.PI * 2);
      c.fill();
      if (worn === 'transparent') return;
      c.fillStyle = worn;
      c.beginPath();
      c.arc(middle.x, middle.y, Math.min(w, h) * 0.43, 0, Math.PI * 2);
      c.fill();
    },
  };
}

/** The disc: the page's canvas copied across the box, painted again as the canvas changes size. */
function disc(element: Element, w: number, h: number): Painted | null {
  const canvas = element as HTMLCanvasElement;
  if (!canvas.width) return null;
  return { key: `disc ${canvas.width} ${w}x${h}`, paint: (c) => c.drawImage(canvas, 0, 0, w, h) };
}

/** A share of the disc from an inline `left` or `top` (`50%`), as a length. */
const placed = (value: string): `${number}%` => `${parseFloat(value) || 50}%`;

export const COLOUR_PICKER: Sheet = [
  { at: '.coop-colour', flex: true, box: { direction: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch',
    justify: 'center', wrap: true } },
  { at: '.coop-colour > span', text: () => ({ face: 'display', size: 16, color: accent() }) },
  { at: '.coop-colour.off', look: { opacity: 0.7 } },
  { at: '.cc-swatches', flex: true, box: { direction: 'row', gap: 6, wrap: true, justify: 'center' } },
  { at: '#hero-colour-settings .coop-colour', box: { justify: 'start', gap: 6 } },
  // (growing into the rest of its line: as wide as its swatches alone, rounding wrapped Any onto a line of its own)
  { at: '#hero-colour-settings .cc-swatches', box: { justify: 'start', grow: 1 } },
  { at: '#hero-colour-settings', box: { margin: [0, 0, 8, 0] } },
  {
    at: '.cc-swatch',
    box: () => ({ width: side(), height: side(), minWidth: TOUCH() ? side() : undefined, padding: 0, border: 2 }),
    look: (element) => ({ fill: swatchOf(element), border: alpha(FRAME, 0.55), radius: SWATCH }),
    ring: 'rgba(0,0,0,.45)',
  },
  { at: '.cc-swatch[aria-checked="true"]', look: { border: CHOSEN, shadow: { blur: 0, color: alpha(CHOSEN, 0.45) } } },
  { at: '.cc-swatch:disabled:not([aria-checked="true"])', look: { opacity: 0.35 } },
  { at: '.cc-swatch.cc-any', box: { width: 'auto', padding: [0, 10] }, look: { fill: '#0a0909', radius: 16 },
    text: { weight: 600, size: 13, color: INK, whole: true } },
  { at: '.cc-swatch.cc-any', when: TOUCH, look: { radius: 20 } },
  {
    at: '.cc-wheel-open',
    box: () => ({ width: side(), height: side(), minWidth: TOUCH() ? side() : undefined, padding: 0, border: 2 }),
    look: { border: alpha(FRAME, 0.55), radius: SWATCH },
    paint: hueRing,
  },
  { at: '.cc-wheel-open:is(.cc-worn, [aria-expanded="true"])', look: { border: CHOSEN } },
  { at: '.cc-wheel-open:disabled', look: { opacity: 0.35 } },
  // the wheel's panel, on a line of its own under the swatches
  { at: '.cc-wheel', flex: true, box: { basis: '100%', direction: 'row', alignItems: 'center', gap: 14, wrap: true } },
  { at: '.cc-wheel[hidden]', box: { display: 'none' } },
  { at: '.cc-disc', flex: true, box: { position: 'relative', width: DISC, height: DISC, shrink: 0 } },
  { at: '.cc-disc canvas', box: { width: '100%', height: '100%' }, paint: disc },
  { at: '.cc-mark', box: (element) => ({ position: 'absolute', width: MARK, height: MARK, border: 2,
    inset: [placed((element as HTMLElement).style.top), 'auto', 'auto', placed((element as HTMLElement).style.left)],
    margin: [-MARK / 2, 0, 0, -MARK / 2] }),
  look: { border: '#ffffff', radius: MARK, hits: false }, ring: 'rgba(0,0,0,.7)' },
  { at: '.cc-light', flex: true, box: { direction: 'column', gap: 6, minWidth: 120 }, text: { size: 13, color: INK } },
  { at: '.cc-light input', box: { height: 16 } },
  { at: '.cc-wheel input[type="range"]', when: TOUCH, box: () => ({ height: FINGER / uiScales.ui }) },
  { at: '.cc-picked', box: { width: SWATCH, height: SWATCH, border: 2 },
    look: (element) => ({ fill: swatchOf(element), border: alpha(FRAME, 0.55), radius: SWATCH }),
    ring: 'rgba(0,0,0,.45)' },
];
