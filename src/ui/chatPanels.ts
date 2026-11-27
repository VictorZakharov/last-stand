// The co-op chat drawn by the engine (ui/kit; #973): its lines in the bottom left corner over the bars, each `Name:
// text` on a dark see-through strip, the name in its player's colour; quiet a while, all of them fading together;
// with the box open, every line kept to scroll back through, and the box to type in with Send; on touch, the chat
// button under the scores button. They were `#chat` and `#btn-chat`, styled by `_chat.scss`; the page's stay, out of
// sight (`.kit-mirror`): `chat.ts` writes them as before (its lines, `open`, `idle`, the field), and the panels here
// follow them each frame. Sizes are px of the HUD (the touch button's, of the touch controls).
import { Panel, onFrame, type Scaled } from './kit/panel';
import { pressable, standIn } from './kit/press';
import { RunLine, type Run, type RunStyle } from './kit/runs';
import { textField, type Field } from './kit/field';
import { scrollRoom, scrollTo, scrolls } from './kit/scroll';
import { safeInsets } from './kit/safeArea';
import { reducedMotion } from './kit/motion';
import { uiScales } from './scale';
import { input } from '../core/input';
import { accent } from './diagFrame';
import type { Shadow, TextStyle } from './overlay/paint';

const NAME_BLUE = '#7cc0ff';
const PANEL = 'rgba(12,12,16,.5)';
const BOX = 'rgba(12,12,16,.8)';
const BOX_LINE = 'rgba(124,192,255,.45)';
const SHADE: Shadow[] = [{ x: 0, y: 1, blur: 1, color: '#000' }, { x: 0, y: 0, blur: 3, color: 'rgba(0,0,0,.6)' }];
const LINE: RunStyle = { face: 'body', size: 15, line: 1.3, color: '#f4f1ea', shadows: SHADE };
const NOTE: RunStyle = { ...LINE, color: '#b8b2a6', italic: true };
/** the corner (px of the HUD; the touch controls' on touch), the chat's widest, its gap, the log's tallest */
const LEFT = 14;
const UP = 132;
const UP_TOUCH = 150;
const MOST = 360;
const MOST_TOUCH = 320;
const ROOM_CSS = 28;
const GAP = 4;
const LOG_MOST = 200;
/** shut, the newest lines alone */
const SHUT_LINES = 6;
/** its fade back in (s) as a line comes; out, `--chat-fade` (CHAT.fade) */
const BACK = 0.15;
/** the touch button: its side, its top and left (px of the touch controls; its left css px) */
const BUTTON = 44;
const BUTTON_TOP = 118;
const BUTTON_LEFT_CSS = 10;

/** A length of css px as px of the panel's scale. */
const css = (px: number, scaled: Scaled): number => px / uiScales[scaled];
/** A length of px of the HUD as px of the panel's scale (on touch the chat's text and corner are the touch
 *  controls', its paddings and gaps still the HUD's: `_chat.scss`). */
const hud = (px: number, scaled: Scaled): number => (px * uiScales.hud) / uiScales[scaled];
const CLEAR = 'rgba(0,0,0,0)';
/** a line's size on touch (`touch(14px)`) */
const LINE_TOUCH = 14;

/** A line's runs as the page has it: its name in its colour, its text, its tag. */
function runsOfLine(line: HTMLElement, touch: boolean): Run[] {
  const note = line.classList.contains('note');
  const size = touch ? LINE_TOUCH : LINE.size;
  const base = { ...(note ? NOTE : LINE), size };
  const runs: Run[] = [];
  for (const node of line.childNodes) {
    const text = node.textContent ?? '';
    if (node instanceof HTMLElement && node.classList.contains('chat-name')) {
      const colour = node.style.color ? getComputedStyle(node).color : NAME_BLUE;
      runs.push({ text, style: { ...base, color: colour } });
    } else {
      runs.push({ text, style: base });
    }
  }
  return runs;
}

interface Chat {
  touch: boolean; root: Panel; log: Panel; lines: Map<Element, RunLine>; form: Panel; field: Field; send: Panel;
  enter: Panel; opacity: number; fade: { from: number; to: number; at: number; time: number };
}
let chat: Chat | null = null;

function makeChat(page: HTMLElement, touch: boolean): Chat {
  const scaled: Scaled = touch ? 'touch' : 'hud';
  const root = new Panel(null, { position: 'absolute', direction: 'column', gap: hud(GAP, scaled) }, {}, scaled);
  const log = new Panel(root, { direction: 'column', maxHeight: hud(LOG_MOST, scaled) });
  scrolls(log);
  const form = new Panel(root, { direction: 'row', gap: hud(6, scaled) });
  const inputEl = page.querySelector<HTMLInputElement>('.chat-input')!;
  const fieldPanel = new Panel(form, { grow: 1, minWidth: 0, padding: [hud(6, scaled), hud(10, scaled)],
    border: css(1, scaled) }, { fill: BOX, border: BOX_LINE });
  const fieldSize = touch ? css(16, scaled) : 16;
  const words: TextStyle = { ...LINE, size: fieldSize, shadows: undefined, line: undefined };
  const field = textField(fieldPanel, inputEl, words, { ...words, color: 'rgba(244,241,234,.5)' }, true);
  const sendButton = page.querySelector<HTMLButtonElement>('.chat-send')!;
  const send = new Panel(form, { direction: 'row', alignItems: 'center', justify: 'center', gap: hud(5, scaled),
    padding: [0, hud(12, scaled)], border: css(1, scaled) }, { fill: BOX, border: BOX_LINE });
  pressable({ panel: send, mirror: sendButton, keepsFocus: true });
  standIn(sendButton, send);
  new Panel(send).say('Send', { face: 'body', size: touch ? css(15, scaled) : 15, color: NAME_BLUE });
  const enter = new Panel(send, { padding: [0, 3], border: css(1, scaled) },
    { border: 'rgba(124,192,255,.5)', radius: 3 });
  new Panel(enter).say('⏎', { face: 'body', size: 15 * 1.15, line: 1, color: NAME_BLUE });
  enter.show(!touch);
  if (touch) send.style({ minHeight: css(40, scaled), minWidth: css(64, scaled) });
  if (touch) fieldPanel.style({ minHeight: css(40, scaled) });
  standIn(page, root);
  standIn(page.querySelector('.chat-log')!, log);
  return {
    touch, root, log, lines: new Map(), form, field, send, enter, opacity: 1,
    fade: { from: 1, to: 1, at: 0, time: 0 },
  };
}

/** Its lines brought up to the page's: made as they come, taken away as they go, shut showing the newest alone. */
function followLines(c: Chat, page: HTMLElement, open: boolean): void {
  const rows = [...page.querySelectorAll<HTMLElement>('.chat-log .chat-line')];
  for (const [row, line] of c.lines) {
    if (row.isConnected) continue;
    line.panel.remove();
    c.lines.delete(row);
  }
  rows.forEach((row, at) => {
    let line = c.lines.get(row);
    if (!line) {
      line = new RunLine(c.log, { shrink: 0 });
      c.lines.set(row, line);
      standIn(row, line.panel);
    }
    const shown = open || at >= rows.length - SHUT_LINES;
    line.panel.show(shown);
    const first = at === Math.max(0, open ? 0 : rows.length - SHUT_LINES);
    const last = at === rows.length - 1;
    const scaled: Scaled = c.touch ? 'touch' : 'hud';
    const [edge, side, between] = [hud(3, scaled), hud(7, scaled), hud(1, scaled)];
    line.panel.style({ padding: [first ? edge : between, side, last ? edge : between, side] });
    line.panel.look({ fill: open ? CLEAR : PANEL });
    line.set(runsOfLine(row, c.touch));
  });
}

/** Its fade: out over `--chat-fade` (eased in) once quiet, back at once as a line comes. */
function fadeTo(c: Chat, page: HTMLElement, idle: boolean): number {
  const to = idle ? 0 : 1;
  if (to !== c.fade.to) {
    const out = parseFloat(page.style.getPropertyValue('--chat-fade')) || 0.8;
    c.fade = { from: c.opacity, to, at: performance.now() / 1000, time: to === 0 ? out : BACK };
  }
  if (reducedMotion()) return (c.opacity = to);
  const t = Math.min(1, (performance.now() / 1000 - c.fade.at) / c.fade.time);
  const eased = to === 0 ? t * t * t : t;
  c.opacity = c.fade.from + (c.fade.to - c.fade.from) * eased;
  return c.opacity;
}

function followChat(): void {
  const page = document.getElementById('chat');
  if (!page) return;
  const shows = !page.classList.contains('hidden');
  if (!chat && !shows) return;
  const touch = input.touchMode;
  if (chat && chat.touch !== touch) {
    chat.field.stop();
    chat.root.remove();
    chat = null;
  }
  chat ??= makeChat(page, touch);
  chat.root.show(shows);
  if (!shows) return;
  const scaled: Scaled = touch ? 'touch' : 'hud';
  const k = uiScales[scaled];
  const clearX = parseFloat(page.style.getPropertyValue('--clear-x')) || 0;
  // (`left: calc(hud(14px) + env(safe-area-inset-left))`, moved by the lobby's clearance, on touch too)
  const left = (LEFT * uiScales.hud + safeInsets().left + clearX) / k;
  const most = touch
    ? Math.min(MOST_TOUCH, (innerWidth - ROOM_CSS) / k)
    : Math.min(MOST, (innerWidth - clearX - ROOM_CSS) / k);
  const open = page.classList.contains('open');
  chat.root.style({
    inset: ['auto', 'auto', touch ? UP_TOUCH : UP, left], maxWidth: most, width: open ? most : 'auto',
  });
  const wasAtFoot = chat.log.scrolled >= scrollRoom(chat.log) - 1;
  followLines(chat, page, open);
  chat.log.style({ justify: open ? 'start' : 'end', overflow: open ? 'scroll' : 'hidden' });
  chat.log.look({ fill: open ? PANEL : CLEAR, opacity: fadeTo(chat, page, page.classList.contains('idle')),
    hits: open });
  chat.form.show(open);
  if (open && wasAtFoot) scrollTo(chat.log, Infinity);
}

// --- the touch button ---

interface ChatButton { root: Panel; button: Panel }
let chatButton: ChatButton | null = null;

/** The button's speech bubble (`M4 5h16v11H9l-4 4v-4H4z` on a 24 px box), drawn at `side`. */
function paintBubble(side: number, colour: string) {
  return (c: CanvasRenderingContext2D): void => {
    const unit = side / 24;
    c.fillStyle = colour;
    c.beginPath();
    const points: [number, number][] = [[4, 5], [20, 5], [20, 16], [9, 16], [5, 20], [5, 16], [4, 16]];
    points.forEach(([x, y], at) => (at ? c.lineTo(x * unit, y * unit) : c.moveTo(x * unit, y * unit)));
    c.closePath();
    c.fill();
  };
}

function followButton(): void {
  const page = document.getElementById('btn-chat') as HTMLButtonElement | null;
  if (!page) return;
  const shows = !page.classList.contains('hidden');
  if (!chatButton && !shows) return;
  if (!chatButton) {
    const root = new Panel(null, { position: 'absolute', inset: 0 }, {}, 'touch');
    const button = new Panel(root, { position: 'absolute', width: BUTTON, height: BUTTON, alignItems: 'center',
      justify: 'center', border: 1 }, { fill: 'rgba(10,9,11,.75)', radius: BUTTON / 2 });
    new Panel(button, { width: 20, height: 20 });
    pressable({ panel: button, mirror: page, keepsFocus: true });
    standIn(page, button);
    chatButton = { root, button };
  }
  chatButton.root.show(shows);
  if (!shows) return;
  chatButton.button.style({ inset: [BUTTON_TOP, 'auto', 'auto', css(BUTTON_LEFT_CSS, 'touch')] });
  const on = page.classList.contains('on');
  chatButton.button.look({ border: on ? accent() : 'rgba(160,124,70,.6)' });
  const colour = accent();
  chatButton.button.inside[0].picture(`chat bubble ${colour}`, 20, 20, paintBubble(20, colour));
}

/** The chat drawn by the engine from now on, the page's own out of sight. */
export function drawChat(): void {
  onFrame(() => {
    for (const id of ['chat', 'btn-chat']) document.getElementById(id)?.classList.add('kit-mirror');
    followChat();
    followButton();
  });
}
