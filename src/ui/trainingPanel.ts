// The training's tracker drawn by the engine (ui/kit; #973): the first visit's steps or a tutorial's station, each
// with its box ticked once it's done, the step to take now in full (what, how, why), and Skip or Leave. It stands in
// the minimap's column under the spoils (`minimapColumn.ts`), beside the minimap on a short screen, and out of its
// column with the bag open (`afloat`: on the right at the top beside the panels, or a line along their foot on a
// short screen). It was `#training`, styled by `_training.scss` and `_responsive.scss`. The page's `#training` stays,
// out of sight (`.kit-mirror`): `training.ts` writes it as before (its classes, its steps, where it floats), and the
// panels here follow it each frame.
import { Panel, onFrame, type Scaled } from './kit/panel';
import { pressable, standIn } from './kit/press';
import { input } from '../core/input';
import { minimapColumnPanels, minimapZoom, zoomed } from './minimapColumn';
import { uiScales } from './scale';
import type { Shadow, TextStyle } from './overlay/paint';
import { shownOnPage } from './kit/shownOnPage';

const HIGHLIGHT = '#f0c860';
const ACCENT = '#e2c07e';
/** its words' shadow, read over the world with no panel behind them (`#training`'s text-shadow) */
const SHADE: Shadow[] = [
  { x: 0, y: 1, blur: 1, color: '#000' }, { x: 0, y: 0, blur: 2, color: '#000' }, { x: 0, y: 0, blur: 3, color: '#000' },
  { x: 0, y: 0, blur: 6, color: '#000' }, { x: 0, y: 0, blur: 10, color: 'rgba(0,0,0,.8)' },
];
const TITLE: TextStyle = { face: 'display', size: 15, weight: 700, spacing: 1.2, upper: true, color: '#ffe7b0', shadows: SHADE };
const STEP: TextStyle = { face: 'body', size: 14, line: 1.3, color: '#fbf3e0', shadows: SHADE };
const DONE: TextStyle = { ...STEP, color: '#d9cfb8' };
const LATER: TextStyle = { ...STEP, size: 13, color: '#cfc5ad' };
const DO: TextStyle = { ...STEP, weight: 700, color: '#ffe7b0' };
const WHY: TextStyle = { ...STEP, size: 13, italic: true, color: '#e2d6ba' };
const FINISHED: TextStyle = { face: 'body', size: 14, italic: true, color: '#ffe7b0', shadows: SHADE };
const SKIP: TextStyle = { face: 'body', size: 13, underline: true, color: '#fbf3e0', shadows: SHADE };
/** the screens' heights (css px) the page's rules change it at */
const SHORT_PX = 520;
const SHORTER_PX = 340;

/** A step as the page has it: its words (a line each), whether it's done or the one to take now. */
interface Step { lines: { cls: string; text: string }[]; done: boolean; now: boolean }

/** How it's laid out now: in its column, beside the minimap, afloat beside the panels, or along their foot. */
type Place = 'column' | 'beside' | 'afloat' | 'foot';

/** The tracker drawn for a place. */
interface Drawn {
  place: Place;
  tour: boolean;
  /** its share of its size: the minimap's column's on the shortest screens, where it stands in it */
  zoom: number;
  root: Panel;
  title: Panel;
  steps: Panel;
  stepsKey: string;
  finished: Panel;
  skip: Panel;
}

let drawn: Drawn | null = null;
let page: { root: HTMLElement; title: HTMLElement; steps: HTMLElement; finished: HTMLElement;
  skip: HTMLButtonElement } | null = null;

/** Where the tracker stands now, by the page's classes and the screen's height. */
function placeNow(root: HTMLElement): Place {
  const short = innerHeight <= SHORT_PX;
  if (root.classList.contains('afloat')) return short && root.classList.contains('over-bag') ? 'foot' : 'afloat';
  return short ? 'beside' : 'column';
}

/** The steps as the page has them. */
function stepsOf(list: HTMLElement): Step[] {
  return [...list.children].map((li) => {
    const spans = [...li.children] as HTMLElement[];
    const lines = spans.length
      ? spans.map((span) => ({ cls: span.className, text: span.textContent ?? '' }))
      : [{ cls: '', text: li.textContent ?? '' }];
    return { lines, done: li.classList.contains('done'), now: li.classList.contains('now') };
  });
}

/** the tick's picture's size (px), from the box's outer corner: it reaches past the box's right edge, as CSS's did */
const TICK_PX = 16;

/** A box's tick: CSS's 5 by 9 px box with its right and bottom borders, turned 40 degrees, from the box's corner. */
function paintTick(c: CanvasRenderingContext2D): void {
  c.strokeStyle = ACCENT;
  c.lineWidth = 2;
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
  c.beginPath();
  c.moveTo(1.6, 6.1);
  c.lineTo(6.6, 10.3);
  c.lineTo(13.3, 2.2);
  c.stroke();
}

/** Where the tracker stands beside the minimap, under the village's touch buttons: from the column's right edge, by
 *  the page's rule, further on the shortest screen while the skill buttons show (their arc reaches up to it). */
function besideAt(z: number): [number, number, 'auto', 'auto'] {
  const armed = input.touchMode && innerHeight <= SHORTER_PX && !document.body.classList.contains('unarmed');
  // (`top: calc(42px / var(--hud))` in the column the HUD's scale scales and its zoom: 42 css px down, times it)
  return [42 / uiScales.hud * z, (armed ? 240 : 184) * z, 'auto', 'auto'];
}

/** The root's panel for `place` (in the column's room, or on the screen at the lobby's scale). */
function rootFor(place: Place, tour: boolean, z: number): Panel {
  const scaled: Scaled = place === 'afloat' || place === 'foot' ? 'ui' : 'hud';
  if (place === 'column' || place === 'beside') {
    const column = minimapColumnPanels();
    const width = (tour ? (place === 'beside' ? 250 : 300) : 250) * z;
    const padding = (tour && place === 'beside' ? [4, 8, 4, 8] : [10, 14, 8, 14]).map((n) => n * z) as [number,
      number, number, number];
    if (place === 'column' || !column) {
      const margin = [10 * z, 6 * z, 0, 0] as [number, number, number, number];
      return new Panel(column?.below ?? null, { width, padding, margin, direction: 'column' }, {}, scaled);
    }
    // (its margin in the column kept, as `_training.scss`'s rule came after the short screen's and won)
    return new Panel(column.root, {
      position: 'absolute', inset: besideAt(z), width, padding, margin: [10 * z, 6 * z, 0, 0], direction: 'column',
    }, {}, scaled);
  }
  if (place === 'foot') {
    return new Panel(null, {
      position: 'absolute', inset: ['auto', 8, 1, 'auto'], padding: [2, 12], border: 1, direction: 'row',
      alignItems: 'baseline',
    }, { fill: 'rgba(12,10,8,.94)', border: 'rgba(232,217,180,.35)', radius: 5 }, scaled);
  }
  return new Panel(null, { position: 'absolute', inset: [12, 12, 'auto', 'auto'], width: tour ? 300 : 250,
    padding: [10, 14, 8, 14], direction: 'column' }, {}, scaled);
}

/** The tracker built for `place`. */
function build(place: Place, tour: boolean, z: number): Drawn {
  const root = rootFor(place, tour, z);
  // (a text's words are drawn across its box: stretched across the column they stretched with it)
  const title = new Panel(root, { alignSelf: 'start' });
  const steps = new Panel(root, {
    direction: 'column', gap: 5 * z, margin: place === 'foot' ? 0 : [8 * z, 0, 6 * z, 0],
  });
  const finished = new Panel(root, { margin: [6 * z, 0, 0, 0] });
  const skip = new Panel(root, { alignSelf: 'start', padding: 4 * z });
  pressable({ panel: skip, mirror: page!.skip });
  standIn(page!.root, root);
  return { place, tour, zoom: z, root, title, steps, stepsKey: '', finished, skip };
}

/** A step's line panels in `li` (a wrapped text each), its style as the page's class gives it. */
function sayLines(li: Panel, step: Step, d: Drawn, foot: boolean): void {
  const tour = d.tour;
  const text = new Panel(li, { direction: foot ? 'row' : 'column', grow: 1, gap: (foot ? 6 : 3) * d.zoom });
  for (const line of step.lines) {
    if (foot && line.cls === 'tr-why') continue;
    const style = line.cls === 'tr-do' ? DO : line.cls === 'tr-why' ? WHY
      : step.done ? DONE : tour && !step.now ? LATER : STEP;
    new Panel(text, foot ? { shrink: 0 } : { alignSelf: 'stretch' })
      .say(line.text, foot ? { ...style, size: 13, shadows: [] } : zoomed(style, d.zoom), foot ? null : 'left');
  }
}

/** The steps' panels made again as the page's changed. */
function followSteps(d: Drawn, steps: Step[], short: boolean): void {
  const key = JSON.stringify(steps) + d.place;
  if (key === d.stepsKey) return;
  d.stepsKey = key;
  for (const child of d.steps.inside) child.remove();
  const foot = d.place === 'foot';
  for (const step of steps) {
    // (on a short screen what's done goes, and a station shows the step to take now alone)
    if (short && (step.done || (d.tour && !step.now)) && d.place !== 'column') continue;
    const z = d.zoom;
    const li = new Panel(d.steps, { direction: 'row', padding: [0, 0, 0, foot ? 0 : 22 * z], alignSelf: 'stretch' });
    if (!foot) {
      // (its shadow, CSS's outer box-shadow, a dark ring round it: a panel's shadow is drawn under its see-through
      // fill too, and the boxes read black)
      const ring = new Panel(li, { position: 'absolute', inset: [z, 'auto', 'auto', -z], width: 14 * z,
        height: 14 * z, border: z }, { border: 'rgba(0,0,0,.55)', radius: 3 * z });
      const box = new Panel(ring, { width: 12 * z, height: 12 * z, border: z }, {
        border: step.now ? HIGHLIGHT : '#e8d9b4', radius: 2 * z, fill: 'rgba(0,0,0,.45)',
      });
      if (step.done) {
        const tick = TICK_PX * z;
        new Panel(box, { position: 'absolute', inset: [-z, 'auto', 'auto', -z], width: tick, height: tick })
          .picture(`tick ${z}`, tick, tick, (c) => {
            c.scale(z, z);
            paintTick(c);
          });
      }
    }
    sayLines(li, step, d, foot);
  }
}

/** The tracker brought up to the page's `#training`. */
function follow(): void {
  if (!page) return;
  const root = page.root;
  const shown = shownOnPage(root);
  const place = placeNow(root);
  const tour = root.classList.contains('tour');
  // (in the minimap's column, its zoom: the shortest screen's)
  const zoom = place === 'column' || place === 'beside' ? minimapZoom() : 1;
  if (drawn && (drawn.place !== place || drawn.tour !== tour || drawn.zoom !== zoom || drawn.root.gone)) {
    drawn.root.remove();
    drawn = null;
  }
  if (!shown) {
    drawn?.root.show(false);
    return;
  }
  drawn ??= build(place, tour, zoom);
  const d = drawn;
  d.root.show(true);
  const pending = root.classList.contains('pending');
  const foot = place === 'foot';
  d.title.show(!foot);
  d.title.say(page.title.textContent ?? '', zoomed(TITLE, zoom));
  d.steps.show(pending);
  followSteps(d, stepsOf(page.steps), innerHeight <= SHORT_PX);
  d.finished.show(!pending);
  d.finished.say(page.finished.textContent ?? '', zoomed(FINISHED, zoom));
  d.skip.show(pending && !foot);
  d.skip.say(page.skip.textContent ?? '', zoomed(SKIP, zoom));
  d.skip.style({ padding: input.touchMode ? [10 * zoom, 14 * zoom, 10 * zoom, 0] : 4 * zoom });
  // (a height the page's tracker is given, the lab's canary's, is the drawn one's too)
  const height = parseFloat(root.style.height);
  d.root.style({ height: height ? height / uiScales[d.root.scaled] : 'auto' });
  if (place === 'beside') d.root.style({ inset: besideAt(zoom) });
  // (afloat beside the panels: as far from the right as the page placed it)
  if (place === 'afloat') d.root.style({ inset: [12, parseFloat(root.style.right) || 12, 'auto', 'auto'] });
}

/** The tracker drawn by the engine from now on, the page's own out of sight. */
export function initTrainingPanel(): void {
  const root = document.querySelector<HTMLElement>('#training')!;
  page = {
    root, title: root.querySelector<HTMLElement>('.tr-title')!, steps: root.querySelector<HTMLElement>('.tr-steps')!,
    finished: root.querySelector<HTMLElement>('.tr-finished')!, skip: root.querySelector<HTMLButtonElement>('.tr-skip')!,
  };
  root.classList.toggle('kit-mirror', true);
  onFrame(follow);
}
