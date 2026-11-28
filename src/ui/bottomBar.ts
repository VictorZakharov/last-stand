// The run's bottom bar drawn by the engine (ui/kit; #973): the health and the energy either side of the skill bar
// (`hotbarPanel.ts`), the warrior's Frenzy over it (`frenzyPips.ts`), in one row at the foot of the screen; on touch a
// column of the two bars beside the top left buttons, the Frenzy under them, no skill bar (the touch controls' own
// buttons are its). It was `#bottombar`, styled by `_hud.scss` and `_touch.scss`, in px of the HUD's reference
// layout (the touch controls' scale on touch). The page's `#bottombar` stays, out of sight (`.kit-mirror`): `hud.ts`
// writes it as before, and the panels here follow it each frame (its bars' widths, words and low health, whether it
// shows: the lobby's practice and the watching bar hide it by the page's own rules). A fill's width eases as the
// page's did (`transition`), and low health pulses.
import { Panel, onFrame, type Scaled } from './kit/panel';
import { standIn } from './kit/press';
import { input } from '../core/input';
import { uiScales } from './scale';
import { ease, easeOut, keyframed, now } from './kit/motion';
import type { TextStyle } from './overlay/paint';
import type { Length } from '../engine/ui';
import { HOTBAR_HEIGHT, followHotbar, hotbarWidth, makeHotbar, type Hotbar } from './hotbarPanel';
import { FRENZY_BLEED, frenzyKey, frenzyOf, frenzySize, paintFrenzy } from './frenzyPips';
import { shownOnPage } from './kit/shownOnPage';

const FRAME = '#a07c46';
const FRAME_DARK = '#4a3620';
/** a bar's colours: its well, its fill's three stops, the damage taken still shown */
const WELL: [string, string] = ['#0a0808', '#1a1414'];
const LIFE = ['#ff5a4a', '#c4141c', '#6a0408'];
const ENERGY = ['#7affd8', '#1fae8a', '#0a4a3c'];
const LAG = 'rgba(255,210,140,.45)';
/** the bottom bar's drop shadow (`filter: drop-shadow(0 6px 14px rgba(0,0,0,.85))`) */
const DROP = { blur: 14, y: 6, color: 'rgba(0,0,0,.85)' };
/** a fill's easing to a new width, the damage's after a wait, low health's pulse (s: their CSS transitions) */
const FILL_TIME = 0.1;
const LAG_TIME = 0.6;
const LAG_WAIT = 0.15;
const PULSE = 0.6;

/** A bar's size and edge, at a size of screen: the desktop's or the touch HUD's. */
interface BarFit { w: number; h: number; border: number; radius: number; text: TextStyle; label: boolean }

const TEXT: TextStyle = {
  face: 'display', size: 17, weight: 700, color: '#fff',
  shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }, { x: 0, y: 0, blur: 4, color: '#000' }],
};
const LABEL: TextStyle = {
  face: 'body', size: 10, spacing: 2, upper: true, color: 'rgba(255,255,255,.55)',
  shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }],
};
const DESKTOP: BarFit = { w: 300, h: 46, border: 2, radius: 23, text: TEXT, label: true };
const TOUCH: BarFit = { w: 220, h: 24, border: 1, radius: 12, text: { ...TEXT, size: 13 }, label: false };

/** A width easing to where it goes: from where it stood, from when (s), over how long. */
interface Eased { from: number; to: number; at: number; time: number; curve: (t: number) => number }

/** A bar drawn: which, its panels, its fill's and its damage's widths easing. */
interface DrawnBar {
  life: boolean;
  inner: { w: number; h: number };
  ring: Panel;
  /** the well inside its border, as wide as a full fill */
  well: Panel;
  fillClip: Panel;
  fill: Panel;
  glow: Panel;
  lagClip: Panel | null;
  text: Panel;
  fit: BarFit;
  filled: Eased;
  lag: Eased;
}

/** The bottom bar drawn, for the desktop or for touch. */
interface Drawn {
  touch: boolean;
  root: Panel;
  life: DrawnBar;
  energy: DrawnBar;
  hotbar: Hotbar | null;
  spacer: Panel | null;
  frenzy: Panel;
}

let drawn: Drawn | null = null;

/** Where an eased width stands now. */
function easedNow(e: Eased): number {
  const t = e.time > 0 ? Math.max(0, Math.min(1, (now() - e.at) / e.time)) : 1;
  return e.from + (e.to - e.from) * e.curve(t);
}

/** `e` eased to `to` from where it stands, after `wait` s. */
function easeTo(e: Eased, to: number, wait = 0): void {
  if (e.to === to) return;
  e.from = easedNow(e);
  e.to = to;
  e.at = now() + wait;
}

/** (Painted in px of the art, as the atlas's context is scaled already: `scale` for what it doesn't scale.)
 *  A fill's three colours from top to bottom with its top's light line (`inset 0 1px 0 rgba(255,255,255,.35)`),
 *  `w` by `h` (the bar's whole width: a few px stretched across it blended at its ends with the atlas's empty
 *  pixels beside them), `bright` times as bright (low health's pulse at its height). */
function paintFill(stops: string[], w: number, h: number, bright: number) {
  return (c: CanvasRenderingContext2D, _scale: number): void => {
    const fill = c.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, stops[0]);
    fill.addColorStop(0.35, stops[1]);
    fill.addColorStop(1, stops[2]);
    c.filter = bright === 1 ? 'none' : `brightness(${bright})`;
    c.fillStyle = fill;
    c.fillRect(0, 0, w, h);
    c.filter = 'none';
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(0, 0, w, 1);
  };
}

/** The well's inner line and its shade from the top (`inset 0 0 0 1px $frame, inset 0 8px 14px rgba(0,0,0,.6)`),
 *  painted inside the bar's border, `radius` its corners on the side it's rounded. */
function paintWell(w: number, h: number, radii: number[]) {
  return (c: CanvasRenderingContext2D, scale: number): void => {
    const [W, H] = [w, h];
    const r = radii;
    c.save();
    c.beginPath();
    c.roundRect(0, 0, W, H, r);
    c.clip();
    c.shadowColor = 'rgba(0,0,0,.6)';
    c.shadowBlur = 14 * scale;
    c.shadowOffsetY = 8 * scale;
    c.fillStyle = '#000';
    c.beginPath();
    c.rect(-W, -H * 3, W * 3, H * 7);
    c.roundRect(0, 0, W, H, r);
    c.fill('evenodd');
    c.restore();
    c.lineWidth = 1;
    c.strokeStyle = FRAME;
    c.beginPath();
    c.roundRect(0.5, 0.5, W - 1, H - 1, r.map((v) => Math.max(0, v - 0.5)));
    c.stroke();
  };
}

/** A bar made in `parent`: the health (`life`) or the energy, at `fit`. */
function makeBar(parent: Panel, life: boolean, fit: BarFit, touch: boolean): DrawnBar {
  const { w, h, border: b, radius: r } = fit;
  const outer = touch ? [r, r, r, r] : life ? [r, 0, 0, r] : [0, r, r, 0];
  const border: [number, number, number, number] = touch ? [b, b, b, b] : life ? [b, 0, b, b] : [b, b, b, 0];
  const inner = { w: w - border[1] - border[3], h: h - border[0] - border[2] };
  const radii = outer.map((v) => Math.max(0, v - b));
  // (its black ring and the bar's drop shadow, laid out as if they weren't there)
  const ring = new Panel(parent, { border: 1, margin: -1 }, {
    border: '#000', radius: outer.map((v) => (v ? v + 1 : 0)) as [number, number, number, number], shadow: DROP,
  });
  const bar = new Panel(ring, { position: 'relative', width: w, height: h, border, overflow: 'hidden' }, {
    fill: WELL, border: FRAME_DARK, radius: outer as [number, number, number, number],
  });
  const full = { position: 'absolute', width: inner.w, height: inner.h } as const;
  const edge: [Length, Length, Length, Length] = life ? [0, 0, 0, 'auto'] : [0, 'auto', 0, 0];
  const anchored = { inset: edge };
  const round = { radius: radii as [number, number, number, number] };
  const well = new Panel(bar, { ...full, inset: 0 }, round).picture(`well${inner.w}x${inner.h}`, inner.w, inner.h,
    paintWell(inner.w, inner.h, radii));
  let lagClip: Panel | null = null;
  if (life) {
    lagClip = new Panel(bar, { position: 'absolute', ...anchored, height: inner.h, overflow: 'hidden' });
    new Panel(lagClip, { ...full, ...anchored }, { ...round, fill: LAG });
  }
  const fillClip = new Panel(bar, { position: 'absolute', ...anchored, height: inner.h, overflow: 'hidden' });
  const stops = life ? LIFE : ENERGY;
  const fill = new Panel(fillClip, { ...full, ...anchored }, round).picture('fill', inner.w, inner.h,
    paintFill(stops, inner.w, inner.h, 1));
  const glow = new Panel(fill, { position: 'absolute', inset: 0 }, { ...round, opacity: 0 }).picture('bright',
    inner.w, inner.h, paintFill(stops, inner.w, inner.h, 1.8));
  const middle = new Panel(bar, { position: 'absolute', inset: 0, alignItems: 'center', justify: 'center' });
  const text = new Panel(middle, {});
  if (fit.label) {
    const label = new Panel(bar, { position: 'absolute', inset: life ? [3, 'auto', 'auto', 22] : [3, 22, 'auto', 'auto'] });
    label.say(life ? 'Health' : 'Energy', LABEL);
  }
  const eased = (time: number, curve: (t: number) => number): Eased => ({ from: 1, to: 1, at: 0, time, curve });
  return {
    life, inner, ring, well, fillClip, fill, glow, lagClip, text, fit,
    filled: eased(FILL_TIME, (t) => t), lag: eased(LAG_TIME, easeOut),
  };
}

/** The bottom bar made for the desktop or for touch, standing for the page's `#bottombar`. */
function make(touch: boolean): Drawn {
  const scaled: Scaled = touch ? 'touch' : 'hud';
  const fit = touch ? { ...TOUCH, w: touchBarWidth() } : DESKTOP;
  const root = new Panel(null, touch
    ? { position: 'absolute', direction: 'column', alignItems: 'stretch', gap: 4 }
    : { position: 'absolute', inset: ['auto', 0, 12, 0], direction: 'row', justify: 'center' }, {}, scaled);
  const row = touch ? root : new Panel(root, { position: 'relative', direction: 'row', alignItems: 'center' });
  const life = makeBar(row, true, fit, touch);
  // (the skill bar's room in the row, as tall as it: it's laid over the row, drawn after both bars as the page's
  // z-index drew it over them)
  const spacer = touch ? null : new Panel(row, { height: HOTBAR_HEIGHT });
  const energy = makeBar(row, false, fit, touch);
  let hotbar: Hotbar | null = null;
  if (!touch) {
    const over = new Panel(row, { position: 'absolute', inset: 0, alignItems: 'center', justify: 'center' });
    hotbar = makeHotbar(over);
  }
  const frenzyAt = touch ? root : new Panel(row, {
    position: 'absolute', inset: ['auto', 0, '100%', 0], margin: [0, 0, 6, 0], justify: 'center',
  });
  const frenzy = new Panel(frenzyAt, touch ? { alignSelf: 'start' } : {});
  const page = document.getElementById('bottombar');
  if (page) standIn(page, row);
  for (const [bar, cls] of [[life, 'life'], [energy, 'energy']] as const) {
    const element = document.querySelector(`#bottombar .bar.${cls}`);
    if (element) standIn(element, bar.ring);
  }
  return { touch, root, life, energy, hotbar, spacer, frenzy };
}

/** The touch bars' width (px: `--touch-bar`). */
function touchBarWidth(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-bar')) || TOUCH.w;
}

/** A share of a width the page wrote (`"62.5%"`), 0 to 1. */
function shareOf(element: HTMLElement | null): number {
  const share = parseFloat(element?.style.width ?? '');
  return Number.isFinite(share) ? Math.max(0, Math.min(1, share / 100)) : 1;
}

/** A bar brought up to the page's: its fill's and its damage's widths, its words, low health's pulse. */
function followBar(bar: DrawnBar, page: Element | null): void {
  if (!page) return;
  easeTo(bar.filled, shareOf(page.querySelector('.fill')));
  bar.fillClip.style({ width: bar.inner.w * easedNow(bar.filled) });
  if (bar.lagClip) {
    easeTo(bar.lag, shareOf(page.querySelector('.lag')), LAG_WAIT);
    bar.lagClip.style({ width: bar.inner.w * easedNow(bar.lag) });
  }
  bar.text.say(page.querySelector('.txt')?.textContent ?? '', bar.fit.text);
  // (`lowpulse`: its brightness to 1.8 and back, each way eased, as the page's alternating animation)
  const low = page.classList.contains('low');
  const phase = (now() / PULSE) % 2;
  const pulse = keyframed([[0, 0], [1, 1]], phase < 1 ? phase : 2 - phase, ease);
  bar.glow.look({ opacity: low ? pulse : 0 });
}

/** The Frenzy brought up to the page's `#frenzy`: painted again as its stacks change. */
function followFrenzy(panel: Panel, page: HTMLElement | null): void {
  const f = page ? frenzyOf(page) : null;
  panel.show(!!f?.shown);
  if (!f?.shown) return;
  // (its picture reaches past its box by its ring and glow, laid out as its box alone)
  const { w, h } = frenzySize(f);
  const bleed = FRENZY_BLEED;
  panel.style({ width: w + bleed * 2, height: h + bleed * 2, margin: -bleed });
  panel.picture(frenzyKey(f), w + bleed * 2, h + bleed * 2, (c, scale) => paintFrenzy(c, f, scale));
}

/** Whether the page shows its bottom bar now (the run's, the lobby's practice: not the lobby's, nor watching). */
function pageShows(page: HTMLElement): boolean {
  return shownOnPage(page);
}

/** The bottom bar brought up to the page's each frame: made for the desktop or touch, shown as it is. */
function follow(): void {
  const page = document.getElementById('bottombar');
  if (!page) return;
  const shows = pageShows(page);
  if (!drawn && !shows) return;
  const touch = input.touchMode;
  if (drawn && (drawn.touch !== touch || (touch && drawn.life.fit.w !== touchBarWidth()))) {
    drawn.root.remove();
    drawn = null;
  }
  drawn ??= make(touch);
  const d = drawn;
  d.root.show(shows);
  if (!shows) return;
  if (d.touch) {
    // (beside the top left buttons, 10 px in and 54 px a button there, 12 px down: css px, the bar's own scale aside)
    const k = uiScales.touch || 1;
    d.root.style({ inset: [12 / k, 'auto', 'auto', 10 / k + 54] });
  }
  followBar(d.life, page.querySelector('.bar.life'));
  followBar(d.energy, page.querySelector('.bar.energy'));
  const bar = document.getElementById('hotbar');
  if (d.hotbar && d.spacer && bar) {
    followHotbar(d.hotbar, bar);
    d.spacer.style({ width: hotbarWidth(d.hotbar) });
  }
  followFrenzy(d.frenzy, document.getElementById('frenzy'));
}

/** How far each bar's fill is drawn now, a share of its well (the lab holds them to the page's), if it's drawn. */
export function drawnShares(): { life: number; energy: number } | null {
  if (!drawn?.root.seen) return null;
  const share = (bar: DrawnBar): number => {
    const fill = bar.fillClip.rect();
    const whole = bar.well.rect();
    return fill && whole ? fill.w / whole.w : 0;
  };
  return { life: share(drawn.life), energy: share(drawn.energy) };
}

/** The bottom bar drawn by the engine from now on, the page's kept out of sight. */
export function drawBottomBar(): void {
  document.getElementById('bottombar')?.classList.toggle('kit-mirror', true);
  onFrame(follow);
}
