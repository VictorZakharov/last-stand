// What the overlays down the left share as the engine draws them (ui/kit; #973, `_perf.scss`): their monospaced
// text, their frame, the page's accent (a class's colour) and the links in their heads and feet.
import { Panel } from './kit/panel';
import { pressable, standIn } from './kit/press';
import type { PanelLook } from '../engine/ui';
import type { TextStyle } from './overlay/paint';

/** the overlays' text: `11px/1.35` monospaced, pale green */
export const MONO: TextStyle = { face: 'mono', size: 11, line: 1.35, color: '#cfe9d8' };
/** bold and white (`b`) */
export const BOLD: TextStyle = { ...MONO, weight: 700, color: '#fff' };
export const INK_DIM = '#9a8f7c';
export const DIM: TextStyle = { ...MONO, color: INK_DIM };
/** the frame's line, and the line between a head and what's under it */
export const FRAME_LINE = 'rgba(160,124,70,.45)';
export const RULE = 'rgba(160,124,70,.25)';

/** The overlays' frame: a dark box, a thin line round it, a shadow under it. */
export const FRAME_LOOK: PanelLook = {
  fill: 'rgba(6,6,8,.86)', border: FRAME_LINE, radius: 4, shadow: { blur: 18, y: 6, color: 'rgba(0,0,0,.6)' },
};

let accentFor = '';
let accentNow = '#e2c07e';
/** The page's accent now (`--accent`: a class sets its own), read again only as the body's classes change. */
export function accent(): string {
  const key = document.body.className + (document.documentElement.getAttribute('style') ?? '');
  if (key !== accentFor) {
    accentFor = key;
    accentNow = getComputedStyle(document.body).getPropertyValue('--accent').trim() || accentNow;
  }
  return accentNow;
}

/** `colour` (`#rgb` or `#rrggbb`) at `alpha`. */
export function faded(colour: string, alpha: number): string {
  const hex = colour.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  if ([r, g, b].some(Number.isNaN)) return colour;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A link's text (`.link` in a head or a foot: 9.5 px, spaced, upper case, the accent faded). */
export const linkStyle = (): TextStyle => ({
  ...MONO, size: 9.5, line: 1.35, spacing: 1, upper: true, underline: true, color: faded(accent(), 0.75),
});

/** A link drawn for the page's `button`: pressed where it's drawn, its words the button's. */
export class Link {
  readonly panel: Panel;
  private readonly words: Panel;

  constructor(parent: Panel, readonly button: HTMLButtonElement) {
    this.panel = new Panel(parent, { shrink: 0 });
    this.words = new Panel(this.panel);
    pressable({ panel: this.panel, mirror: button });
    standIn(button, this.panel);
  }

  /** Its words brought up to the button's. */
  follow(): void {
    this.words.say(this.button.textContent ?? '', linkStyle());
  }
}

/** The width of one character (`ch`) of the monospaced face at `size`. */
export function chWidth(size: number): number {
  return measure.at(size);
}

const measure = {
  context: null as CanvasRenderingContext2D | null,
  widths: new Map<number, number>(),
  at(size: number): number {
    const known = this.widths.get(size);
    if (known !== undefined) return known;
    this.context ??= document.createElement('canvas').getContext('2d')!;
    this.context.font = `${size}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    const width = this.context.measureText('0').width;
    if (document.fonts.status === 'loaded') this.widths.set(size, width);
    return width;
  },
};
