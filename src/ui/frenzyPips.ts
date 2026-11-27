// The warrior's Frenzy painted with the canvas for the engine's kit (#973, `bottomBar.ts`): what `#frenzy` drew on
// the page (_hud.scss): a dark rounded box, its label, a row of skewed pips lit a stack each in its own colour, those
// past the usual cap edged red, and a red glow round it under Unchained. Read off the page's `#frenzy`, which
// `hud.ts` writes only as the stacks change, so it's painted again only then. Painted in px of its art (the atlas's
// context is scaled already), `scale` for the shadows alone.
import { drawText, measure, type TextStyle } from './overlay/paint';

/** A pip as the page shows it: shown at all, lit, one past the usual cap, its colour. */
interface Pip { shown: boolean; on: boolean; extra: boolean; color: string }

/** The Frenzy as the page shows it now. */
export interface Frenzy { shown: boolean; full: boolean; unchained: boolean; pips: Pip[] }

/** its padding, the gap after its label, a pip's size, slant and gap (`#frenzy`, `#frenzy i`) */
const PAD: [number, number] = [3, 10];
const LABEL_GAP = 8;
const PIP: [number, number] = [10, 14];
const PIP_GAP = 3;
const SLANT = Math.tan((-14 * Math.PI) / 180);
const RADIUS = 10;
/** how far its painting reaches past its box each side (px): its outer ring and glow */
export const FRENZY_BLEED = 12;
const LABEL: TextStyle = {
  face: 'body', size: 10, spacing: 2, upper: true, color: 'rgba(255, 210, 170, .7)',
  shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }],
};
const LABEL_FULL: TextStyle = { ...LABEL, color: '#ff8a5a' };

/** What the page's `#frenzy` shows now. */
export function frenzyOf(page: HTMLElement): Frenzy {
  const pips = [...page.querySelectorAll<HTMLElement>('.fz-pips i')].map((pip) => ({
    shown: pip.classList.contains('shown'),
    on: pip.classList.contains('on'),
    extra: pip.classList.contains('extra'),
    color: pip.style.getPropertyValue('--c') || '#ff8a40',
  }));
  const looks = page.classList;
  return { shown: !looks.contains('hidden'), full: looks.contains('full'), unchained: looks.contains('unchained'), pips };
}

/** The key it's painted again by. */
export function frenzyKey(f: Frenzy): string {
  const pips = f.pips.map((p) => (p.shown ? (p.on ? 'o' : '.') + (p.extra ? 'x' : '') : '')).join('');
  return `${f.full ? 'f' : ''}${f.unchained ? 'u' : ''}${pips}`;
}

/** Its box's size (px), as the page lays it out. */
export function frenzySize(f: Frenzy): { w: number; h: number } {
  const label = measure('Frenzy', f.full ? LABEL_FULL : LABEL);
  const shown = f.pips.filter((p) => p.shown).length;
  const pips = shown * PIP[0] + Math.max(0, shown - 1) * PIP_GAP;
  return { w: PAD[1] * 2 + label.w + LABEL_GAP + pips, h: PAD[0] * 2 + Math.max(label.h, PIP[1]) };
}

/** A pip lit as `#frenzy i.on`: from pale gold through its colour to its colour darkened. */
function litFill(c: CanvasRenderingContext2D, pip: Pip, top: number, h: number): CanvasGradient {
  // (the page's stop at -40% is pale gold reached above the pip; its 45% is the colour; its foot the colour at 55%)
  const fill = c.createLinearGradient(0, top - h * 0.4, 0, top + h);
  fill.addColorStop(0, '#fff2c8');
  fill.addColorStop(0.85 / 1.4, pip.color);
  fill.addColorStop(1, `color-mix(in srgb, ${pip.color} 55%, #000)`);
  return fill;
}

/** One pip at (`x`, `y`) px, slanted about its middle. */
function paintPip(c: CanvasRenderingContext2D, pip: Pip, x: number, y: number, scale: number): void {
  const [w, h] = PIP;
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.transform(1, 0, SLANT, 1, 0, 0);
  c.translate(-w / 2, -h / 2);
  c.beginPath();
  c.roundRect(0, 0, w, h, 2);
  if (pip.on) {
    c.save();
    c.shadowColor = pip.color;
    c.shadowBlur = 6 * scale;
    c.fillStyle = litFill(c, pip, 0, h);
    c.fill();
    c.restore();
  } else {
    c.fillStyle = 'rgba(40, 18, 14, .9)';
    c.fill();
  }
  c.lineWidth = 1;
  c.strokeStyle = pip.on ? 'rgba(0, 0, 0, .5)' : pip.extra ? 'rgba(255, 70, 40, .55)' : 'rgba(255, 140, 90, .25)';
  c.beginPath();
  c.roundRect(0.5, 0.5, w - 1, h - 1, 1.5);
  c.stroke();
  c.restore();
}

/** Paints `f` at `scale` canvas pixels a px, its box `FRENZY_BLEED` in from the top left. */
export function paintFrenzy(c: CanvasRenderingContext2D, f: Frenzy, scale: number): void {
  const { w, h } = frenzySize(f);
  const at = FRENZY_BLEED;
  c.save();
  if (f.unchained) {
    c.shadowColor = 'rgba(255, 60, 30, .45)';
    c.shadowBlur = 10 * scale;
  }
  // (its outer ring, `0 0 0 1px #000`, then its fill and its inner line)
  c.lineWidth = 1;
  c.strokeStyle = '#000';
  c.beginPath();
  c.roundRect(at - 0.5, at - 0.5, w + 1, h + 1, RADIUS + 0.5);
  c.stroke();
  c.shadowColor = 'transparent';
  c.fillStyle = 'rgba(10, 6, 6, .72)';
  c.beginPath();
  c.roundRect(at, at, w, h, RADIUS);
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = f.unchained ? 'rgba(255, 80, 40, .7)' : 'rgba(160, 124, 70, .45)';
  c.beginPath();
  c.roundRect(at + 0.5, at + 0.5, w - 1, h - 1, RADIUS - 0.5);
  c.stroke();
  c.restore();
  const style = f.full ? LABEL_FULL : LABEL;
  const label = measure('Frenzy', style);
  drawText(c, label, at + PAD[1], at + (h - label.h) / 2, style, scale);
  let x = at + PAD[1] + label.w + LABEL_GAP;
  for (const pip of f.pips) {
    if (!pip.shown) continue;
    paintPip(c, pip, x, at + (h - PIP[1]) / 2, scale);
    x += PIP[0] + PIP_GAP;
  }
}
