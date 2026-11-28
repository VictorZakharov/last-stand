// The overlays down the left drawn by the engine (ui/kit; #973): the column they stand in and the performance
// overlay, whole or mini (the network overlay and the battle log are `netLogPanels.ts`). They were `#diag`'s
// `#perf`, `#net` and `#blog`, styled by `_perf.scss`; the page's stay, out of sight (`.kit-mirror`): `perfHud.ts`
// writes the overlay as before, and `#diag` is still placed by the page (its corner, clear of the lobby's panels and
// the party's frames, `clearOverlays` in `menus.ts`, or where a finger put it, `overlayPlace.ts`: its `--clear-x` and
// `--clear-y`), which the column here follows each frame. Its sizes are px of the lobby's layout (`#diag` was scaled
// by `--ui` whole).
import { Panel, onFrame } from './kit/panel';
import { pressable, standIn } from './kit/press';
import { runsOf, RunLine, type StyleOf } from './kit/runs';
import { scrolls } from './kit/scroll';
import { uiScales } from './scale';
import { input } from '../core/input';
import { BOLD, DIM, FRAME_LOOK, INK_DIM, MONO, RULE, accent, chWidth, faded } from './diagFrame';
import { drawNetLog } from './netLogPanels';
import type { TextStyle } from './overlay/paint';

/** the column's corner (px of the lobby's layout), its top on touch (px of the touch controls'), its gap */
const CORNER = 10;
const TOUCH_TOP = 180;
const GAP = 6;
const FOOT_ROOM = 10;
/** the frame rate's colour: steady, dropping, low (`--pf`) */
const PF = { steady: '#7affb0', warn: '#ffc07a', bad: '#ff6a5a' };
/** the overlay's width whole, its graph's height whole and mini, mini's graph's width */
const WIDTH = 212;
const GRAPH_H = 40;
const MINI_GRAPH: [number, number] = [96, 26];
/** the graph's drawing (`viewBox="0 0 160 40"`) and its lines' heights in it */
const VIEW: [number, number] = [160, 40];
const RULES = [1, 20];
const SCALE_TEXT: TextStyle = { ...MONO, size: 9, line: 1, color: 'rgba(230,220,200,.35)' };
const GPU: TextStyle = { ...MONO, size: 9.5, color: 'rgba(230,220,200,.45)' };
/** the rows of the overlay's list, by their `data-p` (each a label and its value, `<dt>` and `<dd>`) */
const ROWS = ['cpu', 'gpu', 'calls', 'tris', 'progs', 'geo', 'res', 'quality', 'ents'];

/** The page's `selector` in `page`. */
const part = (page: Element, selector: string): HTMLElement => page.querySelector<HTMLElement>(selector)!;

/** `b` bold and white; the touch or the mouse's words of the other left out. */
const styleOf: StyleOf = (element, around) => {
  if (element.classList.contains('mouse-only') && input.touchMode) return null;
  if (element.classList.contains('touch-inline') && !input.touchMode) return null;
  return element.tagName === 'B' ? { ...around, weight: 700, color: '#fff' } : around;
};

/** The graph's line and rules, its drawing's path `d` stretched over `w` by `h` px. */
function paintGraph(d: string, colour: string, w: number, h: number) {
  return (c: CanvasRenderingContext2D): void => {
    c.strokeStyle = faded(accent(), 0.14);
    c.lineWidth = 1;
    for (const y of RULES) {
      c.beginPath();
      c.moveTo(0, (y / VIEW[1]) * h);
      c.lineTo(w, (y / VIEW[1]) * h);
      c.stroke();
    }
    if (!d) return;
    const line = new Path2D();
    line.addPath(new Path2D(d), new DOMMatrix().scale(w / VIEW[0], h / VIEW[1]));
    c.strokeStyle = colour;
    c.lineWidth = 1.6;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke(line);
  };
}

interface Row { label: Panel; value: RunLine }
interface Perf {
  root: Panel; head: Panel; fps: Panel; unit: Panel; ms: RunLine; graph: Panel; top: Panel; mid: Panel;
  sub: RunLine; list: Panel; rows: Row[]; gpu: Panel; copy: RunLine; hovered: boolean;
}

function makePerf(column: Panel, page: HTMLElement): Perf {
  const root = new Panel(column, { border: 1, shrink: 1, minHeight: 0, direction: 'column' }, { ...FRAME_LOOK });
  scrolls(root);
  const head = new Panel(root, { direction: 'row', alignItems: 'baseline', gap: 5 });
  const fps = new Panel(head);
  const unit = new Panel(head);
  const ms = new RunLine(head, { grow: 1, justify: 'end', wrap: false });
  const graph = new Panel(root, { position: 'relative', height: GRAPH_H, margin: [6, 0, 0, 0] });
  const top = new Panel(graph, { position: 'absolute', inset: [2, 0, 'auto', 'auto'] });
  const mid = new Panel(graph, { position: 'absolute', inset: [21, 0, 'auto', 'auto'] });
  const sub = new RunLine(root, { margin: [3, 0, 0, 0] });
  const list = new Panel(root, { direction: 'column', gap: 1, margin: [6, 0, 0, 0], padding: [6, 0, 0, 0],
    border: [1, 0, 0, 0] }, { border: RULE });
  const rows = ROWS.map(() => {
    const row = new Panel(list, { direction: 'row', gap: 10 });
    const label = new Panel(row);
    return { label, value: new RunLine(row, { grow: 1, justify: 'end', wrap: false }) };
  });
  const gpu = new Panel(root, { margin: [5, 0, 0, 0] });
  const copy = new RunLine(root, { margin: [4, 0, 0, 0] });
  const perf: Perf = { root, head, fps, unit, ms, graph, top, mid, sub, list, rows, gpu, copy, hovered: false };
  pressable({ panel: root, mirror: page as unknown as HTMLButtonElement, shows: (state) => {
    perf.hovered = state !== 'none';
  } });
  standIn(page, root);
  // (the parts a measure reads or a finger takes, where they're drawn)
  const parts: [string, Panel][] = [
    ['.pf-head', head], ['[data-p="fps"]', fps], ['.pf-ms', ms.panel], ['.pf-graph', graph], ['.pf-sub', sub.panel],
    ['dl', list], ['.pf-gpu', gpu], ['.pf-copy', copy.panel],
  ];
  for (const [selector, panel] of parts) standIn(part(page, selector), panel);
  return perf;
}

/** The overlay brought up to the page's: its numbers, its graph, whole or mini. */
function followPerf(perf: Perf, page: HTMLElement): void {
  const shows = !page.classList.contains('hidden');
  perf.root.show(shows);
  if (!shows) return;
  const mini = page.classList.contains('mini');
  const said = page.classList.contains('said');
  const colour = page.classList.contains('bad') ? PF.bad : page.classList.contains('warn') ? PF.warn : PF.steady;
  const border = page.classList.contains('held') ? '#f0c860' : perf.hovered ? accent() : FRAME_LOOK.border;
  // (on touch, with the move stick there, it lets the stick have what's under it: `ui/touch.ts` copies on a tap)
  const touchPad = input.touchMode && !document.getElementById('touch')?.classList.contains('hidden');
  perf.root.look({ border, hits: !touchPad });
  perf.root.style(mini
    ? { width: 'auto', padding: [5, 8], direction: 'row', wrap: true, alignItems: 'center', gap: [8, 0] }
    : { width: WIDTH, padding: [9, 11, 8, 11], direction: 'column', wrap: false, alignItems: 'stretch', gap: 0 });
  const fpsSize = mini ? 22 : 26;
  perf.fps.style({ minWidth: mini ? 2 * chWidth(fpsSize) : 0 });
  // (white, as main's `#perf b` outranks the frame rate's colour, `.pf-head > b`: the graph alone takes it)
  perf.fps.say(part(page, '[data-p="fps"]').textContent ?? '', { ...MONO, size: fpsSize, line: 1, weight: 700,
    color: '#fff' }, mini ? 'right' : undefined);
  perf.unit.say('FPS', { ...MONO, size: 10, spacing: 1.5, color: INK_DIM });
  perf.ms.panel.show(!mini);
  perf.ms.set(runsOf(part(page, '.pf-ms'), DIM, styleOf));
  const [graphW, graphH] = mini ? MINI_GRAPH : [WIDTH - 2 - 22, GRAPH_H];
  perf.graph.style({ width: graphW, height: graphH, margin: mini ? 0 : [6, 0, 0, 0] });
  const d = part(page, '.pf-line').getAttribute('d') ?? '';
  perf.graph.picture(`perf graph ${graphW}x${graphH} ${colour} ${accent()} ${d}`, graphW, graphH,
    paintGraph(d, colour, graphW, graphH));
  perf.top.say(part(page, '[data-p="top"]').textContent ?? '', SCALE_TEXT);
  perf.mid.show(!mini);
  perf.mid.say(part(page, '[data-p="mid"]').textContent ?? '', SCALE_TEXT);
  for (const shown of [perf.sub.panel, perf.list, perf.gpu]) shown.show(!mini);
  if (!mini) followList(perf, page);
  perf.copy.panel.show(!mini || said);
  perf.copy.panel.style({ basis: mini ? '100%' : 'auto', margin: [mini ? 3 : 4, 0, 0, 0] });
  const copyStyle: TextStyle = { ...MONO, size: 9, spacing: 1, upper: true, color: faded(accent(), 0.5) };
  perf.copy.set(runsOf(part(page, '[data-p="copy"]'), copyStyle, styleOf));
}

/** The whole overlay's lines under its graph: the averages, the list, the GPU's name. */
function followList(perf: Perf, page: HTMLElement): void {
  perf.sub.set(runsOf(part(page, '.pf-sub'), DIM, styleOf));
  const labels = [...page.querySelectorAll('dl dt')];
  const values = [...page.querySelectorAll('dl dd')];
  perf.rows.forEach((row, at) => {
    row.label.say(labels[at]?.textContent ?? '', DIM);
    if (values[at]) row.value.set(runsOf(values[at], MONO, styleOf));
  });
  perf.gpu.say(part(page, '[data-p="gpuname"]').textContent ?? '', GPU, 'left');
}

interface Column { root: Panel; perf: Perf }
let column: Column | null = null;

/** Where `#diag` stands now (px of the lobby's layout): its corner, moved by the page's clearance. */
function placeOf(diag: HTMLElement): { top: number; left: number; most: number } {
  const ui = uiScales.ui;
  const clearX = parseFloat(diag.style.getPropertyValue('--clear-x')) || 0;
  const clearY = parseFloat(diag.style.getPropertyValue('--clear-y')) || 0;
  const topCss = input.touchMode ? TOUCH_TOP * uiScales.touch : CORNER * ui;
  return {
    top: (topCss + clearY) / ui, left: CORNER + clearX / ui,
    most: (innerHeight - clearY - topCss) / ui - FOOT_ROOM,
  };
}

/** The column brought up to the page's `#diag`. */
function follow(): void {
  const diag = document.getElementById('diag');
  const page = document.getElementById('perf');
  if (!diag || !page) return;
  const shows = !diag.classList.contains('booting')
    && [...diag.children].some((overlay) => !overlay.classList.contains('hidden'));
  if (!column && !shows) return;
  if (!column) {
    const root = new Panel(null, { position: 'absolute', direction: 'column', alignItems: 'start', gap: GAP }, {},
      'ui');
    column = { root, perf: makePerf(root, page) };
    drawNetLog(root);
  }
  column.root.show(shows);
  if (!shows) return;
  const place = placeOf(diag);
  column.root.style({ inset: [place.top, 'auto', 'auto', place.left], maxHeight: place.most });
  followPerf(column.perf, page);
}

/** The overlays down the left drawn by the engine from now on, the page's own out of sight. */
export function drawDiag(): void {
  for (const id of ['perf', 'net', 'blog']) document.getElementById(id)?.classList.toggle('kit-mirror', true);
  onFrame(follow);
}
