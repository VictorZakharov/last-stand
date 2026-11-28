// The village's map drawn by the engine (ui/kit's sheet; #973), rule for rule from `_villageMap.scss`: the parchment
// over the village, as large as the window leaves room for, unfolding out of its four panels (each its canvas's
// picture, laid where `villageMap.ts` moves the page's panel and squeezed as its `scaleX` squeezes it, shaded as it
// turns), the names over it once it lies flat (where the page lays them out, `layNames`, each with its pointer to its
// place), the hero's arrow and Close. The page's map is `villageMap.ts`'s, written and listened to there as before;
// the kit reads where it moves each part. Sizes are px of the lobby's scale. Not drawn: the names' fade in, the
// arrow's glow.
import { CONTROLS, TOUCH } from './controlsSheet';
import { Panel, layer } from './kit/panel';
import { SheetTree, type Painted, type Sheet } from './kit/sheet';
import { uiScales } from './scale';
import type { Mark } from './kit/sheetRules';

/** the map's layer among the page's (`z-index: 32`: over the lobby's panels, under the modals) */
const MAP_LAYER = 32;
const INK = '#3a2a1a';
const PAPER = 'rgba(240,226,196,.9)';
const EDGE = 'rgba(58,42,26,.7)';
/** a name's pointer's size (px: `border: ui(4px)`), and how far a name stands off its place (`ui(8px)`) */
const POINTER = 4;
/** the arrow's side (px: `ui(22px)`) */
const ARROW = 22;

/** css px as px of the lobby's scale */
const lobbyPx = (css: number): number => css / uiScales.ui;

/** A number of an element's inline style (`--vm-open`, `opacity`), or `fallback`. */
function styleNumber(element: Element | null, name: string, fallback: number): number {
  const value = parseFloat((element as HTMLElement | null)?.style.getPropertyValue(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

/** How open the map is (0 folded, 1 flat): `--vm-open` on its root. */
const openOf = (): number => styleNumber(document.getElementById('vmap'), '--vm-open', 0);

/** The sheet's size, css px: `min(94vw, 88vh * 78 / 63)` wide, `78 / 63` its shape. */
function sheetSize(): { w: number; h: number } {
  const w = Math.min(innerWidth * 0.94, (innerHeight * 0.88 * 78) / 63);
  return { w, h: (w * 63) / 78 };
}

/** Where a page panel's transform stands it (`translate(Xpx, 0) scaleX(S)`): its left (css px) and its squeeze. */
function foldOf(element: Element): { left: number; squeeze: number } {
  const transform = (element as HTMLElement).style.transform;
  const left = parseFloat(/translate\(([-\d.]+)px/.exec(transform)?.[1] ?? '0');
  const squeeze = parseFloat(/scaleX\(([-\d.]+)\)/.exec(transform)?.[1] ?? '1');
  return { left, squeeze };
}

/** how far a panel's picture reaches past its box each side (px): its edge's pixels drawn again there, so the edge
 *  the atlas blends with its empty neighbours lies under the next panel (each panel's edge was a faint seam) */
const BLEED = 1;

/** A panel's picture: its canvas painted at its whole width (`calc(25% + 1px)`) and its edges' bleed, squeezed into
 *  its box. */
function panelPicture(element: Element): Painted | null {
  const canvas = element.querySelector('canvas');
  if (!canvas?.width) return null;
  const [w, h] = [lobbyPx(sheetSize().w / 4 + 1), lobbyPx(sheetSize().h)];
  const index = [...(element.parentElement?.children ?? [])].indexOf(element);
  return {
    key: `vmap panel ${index} ${canvas.width}x${canvas.height}`,
    size: [w + BLEED * 2, h],
    paint: (c) => {
      c.drawImage(canvas, 0, 0, 1, canvas.height, 0, 0, BLEED, h);
      c.drawImage(canvas, canvas.width - 1, 0, 1, canvas.height, BLEED + w, 0, BLEED, h);
      c.drawImage(canvas, BLEED, 0, w, h);
    },
  };
}

/** A name's box where the page lays it out (its translate, `--aside` and widening `layNames` gave it), on its sheet. */
function nameBox(element: Element): { left: number; top: number; w: number; h: number } {
  const sheet = element.closest('.vm-sheet')!.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return { left: box.left - sheet.left, top: box.top - sheet.top, w: box.width, h: box.height };
}

/** A name's pointer to its place (`::after`): under it, above it (`.below`) or before it (`.beside`), its tail moved
 *  as the page's `--tail`. */
function pointerOf(element: Element): Mark[] {
  const { w, h } = nameBox(element);
  const tail = styleNumber(element, '--tail', 0);
  const [across, down] = [lobbyPx(w), lobbyPx(h)];
  const text = { size: POINTER * 2.4, line: 1, color: EDGE };
  if (element.classList.contains('beside')) {
    return [{ inset: [down / 2 - POINTER * 1.2, 'auto', 'auto', -POINTER * 2.2], says: '◀', text }];
  }
  const left = across / 2 + lobbyPx(tail) - POINTER * 1.2;
  if (element.classList.contains('below')) return [{ inset: [-POINTER * 2.2, 'auto', 'auto', left], says: '▲', text }];
  return [{ inset: [down, 'auto', 'auto', left], says: '▼', text }];
}

/** The hero's arrow the way he faces (`clip-path: polygon(50% 0, 92% 100%, 50% 74%, 8% 100%)`), turned `turn`°. */
function arrowPicture(turn: number): Painted {
  return {
    key: `vmap you ${turn}`,
    paint: (c) => {
      c.translate(ARROW / 2, ARROW / 2);
      c.rotate((turn * Math.PI) / 180);
      c.translate(-ARROW / 2, -ARROW / 2);
      c.beginPath();
      c.moveTo(ARROW * 0.5, 0);
      c.lineTo(ARROW * 0.92, ARROW);
      c.lineTo(ARROW * 0.5, ARROW * 0.74);
      c.lineTo(ARROW * 0.08, ARROW);
      c.closePath();
      c.lineWidth = 2;
      c.strokeStyle = '#fff';
      c.stroke();
      c.fillStyle = '#b0201a';
      c.fill();
    },
  };
}

/** Where the page's arrow stands and turns (`translate(Xpx, Ypx) rotate(Rdeg)`). */
function youOf(element: Element): { x: number; y: number; turn: number } {
  const transform = (element as HTMLElement).style.transform;
  const at = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform);
  const turn = parseFloat(/rotate\(([-\d.]+)deg\)/.exec(transform)?.[1] ?? '0');
  // (turned in steps of 3°: a picture a step, painted again only as he turns past one)
  return { x: parseFloat(at?.[1] ?? '0'), y: parseFloat(at?.[2] ?? '0'), turn: Math.round(turn / 3) * 3 };
}

/** The touch Close's side, css px (`touch(44px)`) as px of the lobby's scale. */
const closeSide = (): number => (44 * uiScales.touch) / uiScales.ui;

const MAP: Sheet = [
  ...CONTROLS,
  // the backdrop, darkening as it opens, and the sheet in its middle
  { at: '#vmap', flex: true, hits: true, box: { position: 'absolute', inset: 0, alignItems: 'center',
    justify: 'center' },
  look: (element) => ({ fill: `rgba(10,8,6,${(0.55 * openOf()).toFixed(3)})`,
    opacity: styleNumber(element, 'opacity', 1) }) },
  // (rehearsed over the loading screen for Chrome's programs on the page: nothing of the kit's to rehearse)
  { at: '#vmap.ahead', box: { display: 'none' } },
  { at: '.vm-sheet', flex: true, hits: true, box: () => ({ width: lobbyPx(sheetSize().w),
    height: lobbyPx(sheetSize().h), shrink: 0 }),
  look: (element) => ({ opacity: styleNumber(element, 'opacity', 1) }) },
  { at: '.vm-panels, .vm-names', flex: true, box: { position: 'absolute', inset: 0 } },
  // the panels: each where the page moves it, squeezed as it turns, its shade over it
  { at: '.vm-panel', flex: true, box: (element) => {
    const fold = foldOf(element);
    return { position: 'absolute', inset: [0, 'auto', 'auto', lobbyPx(fold.left) - BLEED * fold.squeeze],
      width: (lobbyPx(sheetSize().w / 4 + 1) + BLEED * 2) * fold.squeeze, height: lobbyPx(sheetSize().h) };
  }, paint: panelPicture },
  { at: '.vm-panel canvas', box: { display: 'none' } },
  { at: '.vm-shade', box: { position: 'absolute', inset: 0 },
    look: (element) => ({ fill: '#1a120a', opacity: styleNumber(element, 'opacity', 0) }) },
  // the names, once it lies flat
  { at: '.vm-names, .vm-you', box: { display: 'none' } },
  { at: '#vmap.flat :is(.vm-names, .vm-you)', box: { display: 'flex' } },
  {
    at: '.vm-name',
    flex: true,
    hits: true,
    box: (element) => {
      const box = nameBox(element);
      return { position: 'absolute', inset: [lobbyPx(box.top), 'auto', 'auto', lobbyPx(box.left)],
        width: lobbyPx(box.w), height: lobbyPx(box.h), direction: 'row', alignItems: 'center', justify: 'center',
        padding: [2, 6], border: 1 };
    },
    look: { fill: PAPER, border: EDGE, radius: 3, shadow: { blur: 4, y: 1, color: 'rgba(40,24,8,.35)' } },
    text: { face: 'display', weight: 700, size: 10, spacing: 0.4, color: INK, align: 'center', whole: true },
    hover: { look: { fill: '#fff3d6' }, text: { color: '#1a0f04' } },
    marks: pointerOf,
  },
  { at: '.vm-name[data-biome="crypt"]', text: { color: '#5a1f86' } },
  { at: '.vm-name[data-biome="forest"]', text: { color: '#1f6a32' } },
  { at: '.vm-name[data-use="enter"]', box: { gap: 4 }, text: { color: '#7a3412' } },
  { at: '.vm-name.occupied', box: { wrap: true, gap: [4, 2] } },
  { at: '.vm-house', box: { width: 11, height: 11, shrink: 0 }, picture: [11, 11] },
  { at: '.vm-inside', box: { basis: '100%', padding: [1, 5] }, look: { fill: 'rgba(20,42,70,.88)', radius: 2 },
    text: { face: 'display', weight: 700, size: 9, spacing: 0.27, color: '#cfe6ff', align: 'center', whole: true } },
  { at: '.vm-inside[hidden]', box: { display: 'none' } },
  // the hero's arrow
  { at: '.vm-you', box: (element) => {
    const you = youOf(element);
    return { position: 'absolute', inset: [lobbyPx(you.y) - ARROW / 2, 'auto', 'auto', lobbyPx(you.x) - ARROW / 2],
      width: ARROW, height: ARROW };
  }, paint: (element) => arrowPicture(youOf(element).turn) },
  // Close: its words with a mouse, a red square with an X on touch
  { at: '.vm-close', flex: true, hits: true, box: { position: 'absolute', inset: [12, 14, 'auto', 'auto'],
    padding: [4, 10], border: 1 },
  look: () => ({ fill: PAPER, border: EDGE, opacity: openOf() }),
  text: { face: 'display', weight: 700, size: 13, color: INK, whole: true } },
  { at: '.vm-close-x', box: { display: 'none' } },
  { at: '.vm-close', when: TOUCH, box: () => ({ width: closeSide(), height: closeSide(), padding: 0, border: 2,
    alignItems: 'center', justify: 'center' }),
  look: () => ({ fill: '#a3241c', border: '#4a120d', radius: 6, opacity: openOf(),
    shadow: { blur: 6, y: 2, color: 'rgba(0,0,0,.45)' } }) },
  { at: '.vm-close-key', when: TOUCH, box: { display: 'none' } },
  { at: '.vm-close-x', when: TOUCH, box: () => ({ display: 'flex', width: closeSide() * 0.56,
    height: closeSide() * 0.56 }), picture: () => [closeSide() * 0.56, closeSide() * 0.56] },
];

let tree: SheetTree | null = null;

/** The village's map drawn by the engine from now on, the page's out of sight. */
export function drawVillageMap(): void {
  const page = document.getElementById('vmap');
  if (!page || tree) return;
  page.classList.toggle('kit-mirror', true);
  const room = new Panel(layer(MAP_LAYER), { position: 'absolute', inset: 0 }, {}, 'ui');
  tree = new SheetTree(page, MAP, 'ui', room);
}
