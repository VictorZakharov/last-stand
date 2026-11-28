// The minimap's column drawn by the engine (ui/kit; #973): in the top right corner, the place's name over the
// minimap, a run's objectives and its unbanked spoils under it, and the training's tracker under them
// (`trainingPanel.ts`). It was `#minimap-wrap`, styled by `_hud.scss` and `_responsive.scss` in px of the HUD's
// reference layout. The page's elements stay, out of sight (`.kit-mirror`): `hud.ts` writes them as before (the name,
// the objective, the spoils' counts) and draws the minimap into its canvas, and the panels here follow them each
// frame, shown as the page's own rules show them (the lobby's, a duel's, the watching bar's). On a short screen (a
// phone held sideways) the minimap is smaller at the corner, a thin line round it, with no name or objectives; on a
// shorter one the column is 0.85 of its size.
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import { input } from '../core/input';
import type { TextStyle } from './overlay/paint';
import { minimapDraws } from './hud';
import { shownOnPage } from './kit/shownOnPage';
import { holdLayout } from '../engine/ui';

const INK = '#e6dcc8';
const INK_DIM = '#9a8f7c';
const HIGHLIGHT = '#f0c860';
const FRAME = '#a07c46';
/** the minimap's bezel, its dark ring and its drop (`border: 4px solid`, `box-shadow: 0 0 0 2px #000, ..., 0 6px
 *  14px rgba(0,0,0,.8)`), its well (`background`) and the shade inside its rim (`inset 0 0 20px #000`) */
const BEZEL = '#6e6a62';
const WELL = 'rgba(10,10,12,.55)';
const RIM_SHADE = 20;
/** the screens' heights (css px) the page's rules change it at: a short one's, and a shorter one's */
const SHORT_PX = 520;
const SHORTER_PX = 340;

const TITLE: TextStyle = { face: 'display', size: 16, color: '#f0e2c0', shadows: [{ x: 0, y: 2, blur: 4, color: '#000' }] };
const OBJ_TITLE: TextStyle = { face: 'display', size: 16, color: '#8fa8ff', shadows: [{ x: 0, y: 1, blur: 3, color: '#000' }] };
const OBJ_TEXT: TextStyle = { face: 'body', size: 14, color: INK, shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }] };
const SP_TITLE: TextStyle = { face: 'body', size: 13, color: INK_DIM, upper: true, spacing: 1 };
const SP_COUNT: TextStyle = { ...SP_TITLE, size: 15, weight: 700, color: HIGHLIGHT };
/** a rarity's count in the spoils' list (its colour the rarity's) */
const SP_CHIP: TextStyle = { face: 'body', size: 13, weight: 500, color: INK, shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }] };

/** The column as a size of screen has it: its zoom, width, the minimap's size and edge, and what shows. */
interface Fit {
  zoom: number;
  room: number;
  disk: number;
  bezel: number;
  bezelColour: string;
  ring: boolean;
  drop: { blur: number; y: number; color: string };
  /** the name and the objectives shown */
  told: boolean;
  /** the column's items at its right edge, not its middle */
  atEdge: boolean;
}

const DESKTOP: Fit = {
  zoom: 1, room: 212, disk: 200, bezel: 4, bezelColour: BEZEL, ring: true,
  drop: { blur: 14, y: 6, color: 'rgba(0,0,0,.8)' }, told: true, atEdge: false,
};
const SHORT: Fit = {
  zoom: 1, room: 180, disk: 144, bezel: 1, bezelColour: 'rgba(110,106,98,.8)', ring: false,
  drop: { blur: 8, y: 2, color: 'rgba(0,0,0,.6)' }, told: false, atEdge: true,
};

/** The fit for the screen as it is now. */
function fitNow(): Fit {
  if (innerHeight <= SHORTER_PX) return { ...SHORT, zoom: 0.85, room: 153 };
  return innerHeight <= SHORT_PX ? SHORT : DESKTOP;
}

/** The column drawn: its panels, the page's elements they follow, the fit it was built for. */
interface Column {
  fit: Fit;
  root: Panel;
  title: Panel;
  ring: Panel;
  disk: Panel;
  map: Panel;
  objectives: Panel;
  objText: Panel;
  objBox: Panel;
  spoils: Panel;
  spCount: Panel;
  spList: Panel;
  chips: Panel[];
  /** the panel the training's tracker stands in, under the spoils */
  below: Panel;
}

let column: Column | null = null;
/** the page's elements followed */
let page: {
  wrap: HTMLElement; title: HTMLElement; canvas: HTMLCanvasElement; objectives: HTMLElement; objLine: HTMLElement;
  spoils: HTMLElement; spCount: HTMLElement; spList: HTMLElement;
} | null = null;

/** The column's panels the training's tracker stands in: its root, and the room under the spoils (none before the
 *  column is drawn). */
export const minimapColumnPanels = (): { root: Panel; below: Panel } | null =>
  column ? { root: column.root, below: column.below } : null;

/** The minimap's painted picture: the shade inside its rim, then the canvas over it, `w` px across. */
function paintMap(canvas: HTMLCanvasElement, w: number) {
  return (c: CanvasRenderingContext2D): void => {
    const r = w / 2;
    const shade = c.createRadialGradient(r, r, Math.max(0, r - RIM_SHADE), r, r, r);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = shade;
    c.fillRect(0, 0, w, w);
    c.drawImage(canvas, 0, 0, w, w);
  };
}

/** The column built for `fit`. */
function build(fit: Fit): Column {
  const z = fit.zoom;
  const root = new Panel(null, {
    position: 'absolute', inset: [8 * z, 12 * z, 'auto', 'auto'], width: fit.room * z, direction: 'column',
    alignItems: fit.atEdge ? 'end' : 'center',
  }, {}, 'hud');
  const title = new Panel(root, { margin: [0, 0, 2 * z, 0] });
  // (its dark ring round the bezel laid out as if it weren't there, as CSS's box-shadow was)
  const ringWidth = fit.ring ? 2 * z : 0;
  const ring = new Panel(root, { border: ringWidth, margin: ringWidth ? -ringWidth : 0 }, {
    border: '#000', radius: fit.disk * z / 2 + ringWidth, shadow: fit.drop,
  });
  const disk = new Panel(ring, { width: fit.disk * z, height: fit.disk * z, border: fit.bezel * z }, {
    fill: WELL, border: fit.bezelColour, radius: fit.disk * z / 2,
  });
  const inner = (fit.disk - 2 * fit.bezel) * z;
  const map = new Panel(disk, { width: inner, height: inner }, { radius: inner / 2 });
  const objectives = new Panel(root, {
    alignSelf: 'stretch', margin: [12 * z, 0, 0, 0], padding: [0, 0, 0, 8 * z], direction: 'column',
  });
  // (a text's words are drawn across its box: stretched across the column they stretched with it)
  new Panel(objectives, { alignSelf: 'start' }).say('Objectives', zoomed(OBJ_TITLE, z));
  const objLine = new Panel(objectives, { direction: 'row', alignItems: 'center', gap: 6 * z });
  const objBox = new Panel(objLine, { width: 10 * z, height: 10 * z, border: 1 * z, shrink: 0 }, { border: INK_DIM });
  const objText = new Panel(objLine);
  const spoils = new Panel(root, {
    alignSelf: 'stretch', margin: [10 * z, 0, 0, 0], padding: [6 * z, 8 * z], border: [0, 0, 0, 2 * z],
    direction: 'column',
  }, { fill: 'rgba(0,0,0,.45)', border: FRAME });
  const spTitle = new Panel(spoils, { direction: 'row', alignItems: 'baseline' });
  new Panel(spTitle).say('Unbanked spoils ', zoomed(SP_TITLE, z));
  const spCount = new Panel(spTitle);
  const spList = new Panel(spoils, {
    direction: 'row', wrap: true, gap: [10 * z, 2 * z], maxHeight: 170 * z, overflow: 'hidden',
  });
  const below = new Panel(root, { alignSelf: 'stretch', direction: 'column', alignItems: 'end' });
  return {
    fit, root, title, ring, disk, map, objectives, objText, objBox, spoils, spCount, spList, chips: [], below,
  };
}

/** The column's share of its size now (0.85 on the shortest screens, as CSS's `zoom` had it). */
export const minimapZoom = (): number => fitNow().zoom;

/** `style` at `zoom` of its size (the shorter screen's column, and the training's tracker in it). */
export function zoomed(style: TextStyle, zoom: number): TextStyle {
  if (zoom === 1) return style;
  const shadows = style.shadows?.map((s) => ({ ...s, x: s.x * zoom, y: s.y * zoom, blur: s.blur * zoom }));
  return { ...style, size: style.size * zoom, spacing: (style.spacing ?? 0) * zoom, shadows };
}

/** Whether the page's `el` shows, as its own rules have it (the column's elements are out of sight, not hidden). */
const shows = (el: Element): boolean => shownOnPage(el);

/** The spoils' list as the page has it: each rarity's count and colour. */
function chipsOf(list: HTMLElement): { text: string; color: string }[] {
  return [...list.children].map((chip) => ({
    text: chip.textContent ?? '', color: (chip as HTMLElement).style.color || INK,
  }));
}

/** The spoils' chips brought up to the page's. */
function followChips(c: Column): void {
  const chips = chipsOf(page!.spList);
  const z = c.fit.zoom;
  while (c.chips.length > chips.length) c.chips.pop()!.remove();
  while (c.chips.length < chips.length) c.chips.push(new Panel(c.spList, { shrink: 0 }));
  chips.forEach((chip, at) => c.chips[at].say(chip.text, zoomed({ ...SP_CHIP, color: chip.color }, z)));
}

/** The column brought up to the page's elements: shown as they show, saying what they say. */
function follow(): void {
  if (!page) return;
  const fit = fitNow();
  if (column && (column.fit.zoom !== fit.zoom || column.fit.disk !== fit.disk)) {
    column.root.remove();
    column = null;
  }
  if (!column) {
    column = build(fit);
    standIn(page.canvas, column.disk);
    standIn(page.wrap, column.root);
    standIn(page.spoils, column.spoils);
  }
  const c = column;
  const z = fit.zoom;
  const shown = shows(page.wrap);
  c.root.show(shown);
  if (!shown) return;
  c.title.show(fit.told && shows(page.title));
  c.title.say(page.title.textContent ?? '', zoomed(TITLE, z));
  // (its box as last laid out: asked as the frame's panels follow their elements, every one after it was laid out
  // again first, the whole tree, once more a frame)
  const inner = holdLayout(() => c.map.rect());
  if (inner && shows(page.canvas)) {
    const w = fit.disk - 2 * fit.bezel;
    c.map.picture(`minimap ${minimapDraws()} ${w}`, w * z, w * z, paintMap(page.canvas, w * z));
  }
  c.ring.show(shows(page.canvas));
  // (on touch a finger held on it pings there, ui/ping.ts: it takes the pointer then, never the world's)
  c.disk.look({ hits: input.touchMode });
  c.objectives.show(fit.told && shows(page.objectives));
  c.objText.say(page.objLine.querySelector('.obj-text')?.textContent ?? '', zoomed(OBJ_TEXT, z));
  c.objBox.look({ fill: page.objLine.classList.contains('done') ? HIGHLIGHT : 'transparent' });
  c.spoils.show(shows(page.spoils));
  c.spCount.say(page.spCount.textContent ?? '0', zoomed(SP_COUNT, z));
  followChips(c);
}

/** The column drawn by the engine from now on, the page's own out of sight. */
export function initMinimapColumn(): void {
  const wrap = document.querySelector<HTMLElement>('#minimap-wrap')!;
  const q = <T extends Element = HTMLElement>(selector: string) => wrap.querySelector<T>(selector)!;
  page = {
    wrap, title: q('.mm-title'), canvas: q<HTMLCanvasElement>('#minimap'), objectives: q('.objectives'),
    objLine: q('.obj-line'), spoils: q('#spoils'), spCount: q('.sp-count'), spList: q('.sp-list'),
  };
  // (the column whole, as the lab reads it and the pause button stands beside it; the tracker is out of sight on its
  // own, as it leaves the column with the bag open)
  for (const el of [wrap, page.title, page.canvas, page.objectives, page.spoils]) el.classList.toggle('kit-mirror', true);
  onFrame(follow);
  follow();
}

/** The minimap's box as drawn (css px), its bezel inside it, if it's shown (the pings place a finger's spot on it). */
export function minimapDrawn(): { box: { x: number; y: number; w: number; h: number }; bezel: number } | null {
  const c = column;
  const box = c?.disk.rect();
  if (!c || !box || !c.root.seen) return null;
  return { box, bezel: box.w * c.fit.bezel / c.fit.disk };
}
