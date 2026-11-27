// A co-op run's downed and watching UI drawn by the engine (ui/kit; #973): the note while the hero is down (how long
// he bleeds, who raises him, the raise filling), the prompt to hold E by a downed partner with the revive filling
// under it, the bar while he watches the rest of the run (who, the buttons for the previous and next partner and the
// free camera, the keys), and on touch the round button held to revive. They were `#down-note`, `.rvprompt`,
// `#spectate` and `#btn-revive`, styled by `_coop.scss`; the page's stay, out of sight (`.kit-mirror`): `coop.ts`
// writes them as before, and the panels here follow them each frame. The note's sizes are px of the HUD (it was
// scaled by `--hud` whole); the revive button's are css px placed by the touch controls' scale, written divided by it.
import { Panel, onFrame } from './kit/panel';
import { pressable, standIn, type PressState } from './kit/press';
import { safeInsets } from './kit/safeArea';
import { uiScales } from './scale';
import { input } from '../core/input';
import { holdRevive } from './coop';
import type { Shadow, TextStyle } from './overlay/paint';

const INK = '#e6dcc8';
const GOLD = '#ffe6a0';
const HIGHLIGHT = '#f0c860';
const ICE = '#cfe6ff';
/** `$outline` (`0 1px 2px #000, 0 0 6px #000`) and the note's shadow */
const OUTLINE: Shadow[] = [{ x: 0, y: 1, blur: 2, color: '#000' }, { x: 0, y: 0, blur: 6, color: '#000' }];
const NOTE_SHADE: Shadow[] = [{ x: 0, y: 2, blur: 4, color: '#000' }];
const DOWN_TITLE: TextStyle = { face: 'display', size: 34, spacing: 2, color: '#ff5040', shadows: NOTE_SHADE };
const DOWN_LINE: TextStyle = { face: 'body', size: 17, color: INK, shadows: NOTE_SHADE };
const KEY: TextStyle = { face: 'display', size: 24, color: '#1a1208' };
const PROMPT: TextStyle = { face: 'display', size: 22, color: GOLD, shadows: OUTLINE };
const WATCH: TextStyle = { face: 'body', size: 15, color: ICE };
const WATCH_KEYS: TextStyle = { face: 'body', size: 12, color: 'rgba(207,230,255,.7)' };
const REVIVE: TextStyle = { face: 'display', size: 16, color: GOLD };
/** the note's top (a share of the HUD's height), its bar's size, the gap between its lines */
const NOTE_TOP = '32%';
const NOTE_BAR: [number, number] = [220, 6];
const NOTE_GAP = 4;
/** the prompt's height over the screen's foot, its key cap's side, its bar's size (px of the HUD) */
const PROMPT_UP = 150;
const KEY_SIDE = 40;
const PROMPT_BAR: [number, number] = [260, 6];
/** the watching bar's top, its name's least width, its buttons' least sizes: css px, or px of the HUD where more */
const WATCH_TOP = 86;
const NAME_LEAST = 150;
const BUTTON_CSS = 40;
const BUTTON_WIDE = 30;
const BUTTON_TALL = 28;
const ICON_CSS = 24;
const ICON_HUD = 20;
/** the touch revive button: its side (css px), how far from the screen's right (px of the touch controls) and foot */
const REVIVE_SIDE = 84;
const REVIVE_RIGHT = 290;
const REVIVE_UP = 24;

/** A length of css px as px of the HUD (its panel's lengths are scaled by it). */
const css = (px: number): number => px / uiScales.hud;

/** The page's `selector` text in `page`. */
const textOf = (page: Element, selector: string): string => page.querySelector(selector)?.textContent ?? '';

/** A fill's share as the page's `style.width` says it (`'40%'`). */
const shareOf = (element: HTMLElement | null): number => (parseFloat(element?.style.width ?? '') || 0) / 100;

/** A bar: a dark track with a gold fill from its left. */
interface Bar { track: Panel; fill: Panel }

function barIn(parent: Panel, [w, h]: [number, number], radius = 0): Bar {
  const track = new Panel(parent, { width: w, height: h, position: 'relative', overflow: 'hidden' },
    { fill: 'rgba(0,0,0,.7)', radius });
  const fill = new Panel(track, { position: 'absolute', inset: [0, 'auto', 0, 0] }, { fill: GOLD });
  return { track, fill };
}

// --- the note while he's down ---

interface Note { root: Panel; title: Panel; line: Panel; bar: Bar }
let note: Note | null = null;

function makeNote(page: HTMLElement): Note {
  const root = new Panel(null, { position: 'absolute', inset: [NOTE_TOP, 0, 'auto', 0], direction: 'column',
    alignItems: 'center' });
  const block = new Panel(root, { direction: 'column', alignItems: 'center', gap: NOTE_GAP });
  standIn(page, block);
  return { root, title: new Panel(block), line: new Panel(block), bar: barIn(block, NOTE_BAR) };
}

function followNote(): void {
  const page = document.getElementById('down-note');
  if (!page) return;
  const shows = page.checkVisibility();
  if (!note && !shows) return;
  note ??= makeNote(page);
  note.root.show(shows);
  if (!shows) return;
  note.title.say(textOf(page, 'b'), DOWN_TITLE);
  note.line.say(textOf(page, 'span'), DOWN_LINE);
  note.bar.fill.style({ width: `${shareOf(page.querySelector<HTMLElement>('.dn-bar div')) * 100}%` });
}

// --- the prompt by a downed partner ---

interface Prompt { root: Panel; box: Panel; words: Panel; bar: Bar; page: HTMLElement }
let prompt: Prompt | null = null;

function makePrompt(page: HTMLElement): Prompt {
  const root = new Panel(null, { position: 'absolute', inset: ['auto', 0, PROMPT_UP, 0], direction: 'column',
    alignItems: 'center' });
  const box = new Panel(root, { direction: 'column', alignItems: 'center', gap: 6, padding: [10, 18], border: 1 }, {
    fill: 'rgba(10,6,4,.78)', border: 'rgba(255,230,160,.45)', radius: 6,
    shadow: { blur: 18, color: 'rgba(255,230,160,.25)' },
  });
  const line = new Panel(box, { direction: 'row', alignItems: 'center', gap: 12 });
  const key = new Panel(line, { minWidth: KEY_SIDE, height: KEY_SIDE, border: 1, alignItems: 'center',
    justify: 'center' }, {
    fill: ['#fff4d0', '#e8c878'], border: '#fff8e0', radius: 6, shadow: { blur: 0, y: 3, color: '#8a6a2a' },
  });
  new Panel(key).say(textOf(page, 'kbd') || 'E', KEY);
  const words = new Panel(line);
  standIn(page, box);
  return { root, box, words, bar: barIn(box, PROMPT_BAR, 3), page };
}

function followPrompt(): void {
  const page = document.querySelector<HTMLElement>('#hud .rvprompt');
  if (!page) return;
  page.classList.add('kit-mirror');
  const shows = page.checkVisibility();
  if (!prompt && !shows) return;
  prompt ??= makePrompt(page);
  if (prompt.page !== page) {
    // (made again: the game makes it once, the lab's state may make another)
    prompt.page = page;
    standIn(page, prompt.box);
  }
  prompt.root.show(shows);
  if (!shows) return;
  prompt.root.inside[0].style({ border: css(1) });
  prompt.words.say(textOf(page, '.rp-line span'), PROMPT);
  prompt.bar.fill.style({ width: `${shareOf(page.querySelector<HTMLElement>('.rp-bar div')) * 100}%` });
}

// --- the watching bar ---

interface WatchButton { root: Panel; state: PressState }
interface Watch { root: Panel; name: Panel; free: Panel; keys: Panel; buttons: WatchButton[]; back: Panel; on: Panel }
let watch: Watch | null = null;

/** A chevron as the bar's SVG draws it (`M15 5l-7 7 7 7`, or its mirror), on a 24 px box drawn at `side`. */
function paintChevron(side: number, back: boolean) {
  return (c: CanvasRenderingContext2D): void => {
    const unit = side / 24;
    c.strokeStyle = ICE;
    c.lineWidth = 2.4 * unit;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    const [from, to] = back ? [15, 8] : [9, 16];
    c.moveTo(from * unit, 5 * unit);
    c.lineTo(to * unit, 12 * unit);
    c.lineTo(from * unit, 19 * unit);
    c.stroke();
  };
}

/** One of the bar's buttons, standing for the page's `mirror`. */
function watchButton(row: Panel, mirror: HTMLButtonElement): WatchButton {
  const root = new Panel(row, { alignItems: 'center', justify: 'center', border: 1, padding: [0, 8] }, {
    fill: 'rgba(255,255,255,.08)', border: 'rgba(207,230,255,.25)',
  });
  const button: WatchButton = { root, state: 'none' };
  pressable({
    panel: root, mirror, shows: (state) => {
      button.state = state;
      root.look({ fill: state === 'none' ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.16)' });
    },
  });
  standIn(mirror, root);
  return button;
}

function makeWatch(page: HTMLElement): Watch {
  const root = new Panel(null, { position: 'absolute', inset: [WATCH_TOP, 0, 'auto', 0], direction: 'column',
    alignItems: 'center' });
  const box = new Panel(root, { direction: 'column', alignItems: 'center', gap: 5, padding: [6, 10] },
    { fill: 'rgba(8,8,14,.72)' });
  const row = new Panel(box, { direction: 'row', alignItems: 'center', gap: 6 });
  const mirrors = ['.sp-prev', '.sp-next', '.sp-free'].map((selector) => page.querySelector<HTMLButtonElement>(selector)!);
  const prev = watchButton(row, mirrors[0]);
  const nameBox = new Panel(row, { minWidth: NAME_LEAST, alignItems: 'center', justify: 'center' });
  const next = watchButton(row, mirrors[1]);
  const free = watchButton(row, mirrors[2]);
  const keys = new Panel(box);
  standIn(page, box);
  return {
    root, name: new Panel(nameBox), free: new Panel(free.root), keys, buttons: [prev, next, free],
    back: new Panel(prev.root), on: new Panel(next.root),
  };
}

function followWatch(): void {
  const page = document.getElementById('spectate');
  if (!page) return;
  const shows = page.checkVisibility();
  if (!watch && !shows) return;
  watch ??= makeWatch(page);
  watch.root.show(shows);
  if (!shows) return;
  const box = watch.root.inside[0];
  box.look({ radius: css(4) });
  const icon = Math.max(css(ICON_CSS), ICON_HUD);
  for (const button of watch.buttons) {
    button.root.style({ minWidth: Math.max(css(BUTTON_CSS), BUTTON_WIDE), height: Math.max(css(BUTTON_CSS),
      BUTTON_TALL), border: css(1) });
    button.root.look({ radius: css(4) });
  }
  watch.back.style({ width: icon, height: icon }).picture(`chevron back ${icon}`, icon, icon, paintChevron(icon, true));
  watch.on.style({ width: icon, height: icon }).picture(`chevron ${icon}`, icon, icon, paintChevron(icon, false));
  watch.name.say(textOf(page, '.sp-name'), WATCH);
  watch.free.say(textOf(page, '.sp-free'), WATCH);
  watch.keys.show(!input.touchMode);
  watch.keys.say(textOf(page, '.sp-keys'), WATCH_KEYS);
}

// --- the touch revive button ---

interface Revive { root: Panel; button: Panel }
let revive: Revive | null = null;

function makeRevive(page: HTMLButtonElement): Revive {
  const root = new Panel(null, { position: 'absolute', inset: 0 }, {}, 'touch');
  const button = new Panel(root, { position: 'absolute', alignItems: 'center', justify: 'center' }, {
    fill: ['#5a4a20', '#1a140a'], radial: { y: 0.4, stop: 0.75 }, border: HIGHLIGHT,
    shadow: { blur: 16, color: 'rgba(240,200,96,.5)' },
  });
  new Panel(button);
  pressable({ panel: button, mirror: page, held: holdRevive });
  standIn(page, button);
  return { root, button };
}

function followRevive(): void {
  const page = document.getElementById('btn-revive') as HTMLButtonElement | null;
  if (!page) return;
  const shows = page.checkVisibility();
  if (!revive && !shows) return;
  revive ??= makeRevive(page);
  revive.root.show(shows);
  if (!shows) return;
  const k = uiScales.touch;
  const side = REVIVE_SIDE / k;
  revive.button.style({
    inset: ['auto', REVIVE_RIGHT + safeInsets().right / k, REVIVE_UP, 'auto'], width: side, height: side,
    border: 2 / k,
  });
  revive.button.look({ radius: side / 2 });
  revive.button.inside[0].say(page.textContent ?? '', { ...REVIVE, size: REVIVE.size / k });
}

/** The downed and watching UI drawn by the engine from now on, the page's own out of sight. */
export function drawDownedPanels(): void {
  for (const id of ['down-note', 'spectate', 'btn-revive']) document.getElementById(id)?.classList.add('kit-mirror');
  onFrame(() => {
    followNote();
    followPrompt();
    followWatch();
    followRevive();
  });
}
