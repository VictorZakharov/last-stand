// The network overlay and the battle log drawn by the engine (ui/kit; #973), in the column down the left
// (`diagPanels.ts`). They were `#net` and `#blog`, styled by `_perf.scss`; the page's stay, out of sight
// (`.kit-mirror`): `netHud.ts` and `battleLog.ts` write them as before (the net overlay twice a second, the log's lines
// as hits come), and the panels here follow what they wrote. Sizes are px of the lobby's layout.
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import { runsOf, RunLine, type StyleOf } from './kit/runs';
import { scrollRoom, scrollTo, scrolls } from './kit/scroll';
import { uiScales } from './scale';
import { input } from '../core/input';
import { DIM, FRAME_LOOK, INK_DIM, Link, MONO, RULE, accent, chWidth } from './diagFrame';
import type { TextStyle } from './overlay/paint';

const WIDTH = 212;
const SMALL: TextStyle = { ...MONO, size: 9.5, color: 'rgba(230,220,200,.45)' };
/** a link's state's dot (`li.ok`...) */
const DOTS: Record<string, string> = { ok: '#7affb0', wait: '#ffc07a', bad: '#ff6a5a' };
const DOT_NONE = 'rgba(230,220,200,.35)';
/** the log's width at most, its least height, its lines' room (lines of 11 px at 1.35), fewer on a short screen */
const LOG_WIDTH = 340;
const LOG_LEAST = 64;
const LINES = 10;
const LINES_SHORT = 6;
const SHORT_PX = 520;
/** the badge's half width (px of the HUD) and the gap kept from it, for the log's width at most */
const BADGE_HALF = 35;
const BADGE_GAP = 8;
const TIME: TextStyle = { ...MONO, color: 'rgba(230,220,200,.38)' };
const FOE_TAKEN = '#ff9a8a';
/** a log line's notes' size (`small`) */
const NOTE_SIZE = 9.5;
/** how near the foot (px) the log's list counts as following it */
const FOLLOWING = 4;

/** The page's `selector` in `page`. */
const part = (page: Element, selector: string): HTMLElement => page.querySelector<HTMLElement>(selector)!;

/** The net overlay's words: `b` bold and white. */
const netStyle: StyleOf = (element, around) =>
  (element.tagName === 'B' ? { ...around, weight: 700, color: '#fff' } : around);

// --- the network overlay ---

interface Net { root: Panel; body: Panel; said: string; links: Link[] }

function makeNet(column: Panel, page: HTMLElement): Net {
  const root = new Panel(column, { width: WIDTH, border: 1, padding: [8, 11], direction: 'column', shrink: 0 },
    { ...FRAME_LOOK });
  scrolls(root);
  const body = new Panel(root, { direction: 'column' });
  const acts = new Panel(root, { direction: 'row', gap: 12, margin: [5, 0, 0, 0] });
  const links = [...page.querySelectorAll<HTMLButtonElement>('.nt-acts .link')].map((button) => new Link(acts, button));
  standIn(page, root);
  return { root, body, said: '', links };
}

/** A link's line: its dot, its words cut at its end, a small line under them. */
function netItem(list: Panel, item: Element): void {
  const row = new Panel(list, { direction: 'row', padding: [0, 0, 0, 11], position: 'relative' });
  const dot = DOTS[[...item.classList].find((name) => name in DOTS) ?? ''] ?? DOT_NONE;
  new Panel(row, { position: 'absolute', inset: [5, 'auto', 'auto', 1], width: 5, height: 5 },
    { fill: dot, radius: 2.5 });
  const words = new Panel(row, { direction: 'column', minWidth: 0, grow: 1 });
  const small = item.querySelector('small');
  const line = new RunLine(words, { wrap: false, overflow: 'hidden' });
  line.set(runsOf(item, DIM, (element, around) => (element.tagName === 'SMALL' ? null : netStyle(element, around))));
  if (small) new Panel(words).say(small.textContent ?? '', SMALL);
}

/** The overlay's body made again from the page's, as its words changed (twice a second at most). */
function remakeNet(net: Net, body: HTMLElement): void {
  for (const child of [...net.body.inside]) child.remove();
  for (const block of body.children) {
    if (block.tagName === 'UL') {
      const list = new Panel(net.body, { direction: 'column', margin: [2, 0, 0, 0] });
      for (const item of block.children) netItem(list, item);
    } else if (block.classList.contains('nt-sec')) {
      new Panel(net.body, { margin: [6, 0, 0, 0], padding: [5, 0, 0, 0], border: [1, 0, 0, 0] }, { border: RULE })
        .say(block.textContent ?? '', DIM);
    } else {
      const margin = block.classList.contains('nt-sub') ? 5 : 0;
      const base = block.classList.contains('nt-head') ? MONO : DIM;
      new RunLine(net.body, { margin: [margin, 0, 0, 0] }).set(runsOf(block, base, netStyle));
    }
  }
}

function followNet(net: Net, page: HTMLElement): void {
  const shows = !page.classList.contains('hidden');
  net.root.show(shows);
  if (!shows) return;
  net.root.style({ maxHeight: innerHeight / uiScales.ui - 20 });
  const body = page.querySelector<HTMLElement>('.nt-body');
  if (body && body.innerHTML !== net.said) {
    net.said = body.innerHTML;
    remakeNet(net, body);
  }
  for (const link of net.links) link.follow();
}

// --- the battle log ---

interface LogLine { row: Panel; time: Panel; what: RunLine }
interface Log {
  root: Panel; title: Panel; links: Link[]; list: Panel; none: Panel; lines: Map<Element, LogLine>;
  /** whether the list follows its foot (left there, or scrolled back to it), and where it was last scrolled to */
  following: boolean; scrolledTo: number;
}

function makeLog(column: Panel, page: HTMLElement): Log {
  const root = new Panel(column, { width: LOG_WIDTH, minHeight: LOG_LEAST, shrink: 1, border: 1,
    padding: [6, 9, 7, 9], direction: 'column' }, { ...FRAME_LOOK, hits: true });
  const head = new Panel(root, { direction: 'row', alignItems: 'baseline', gap: 12, padding: [0, 0, 4, 0],
    border: [0, 0, 1, 0] }, { border: RULE });
  // (its words in a panel of their own, the row's room after them: words are drawn across their box)
  const title = new Panel(new Panel(head, { grow: 1, alignItems: 'baseline' }));
  const links = [...page.querySelectorAll<HTMLButtonElement>('.bl-head .link')].map((button) => new Link(head, button));
  const list = new Panel(root, { direction: 'column', minHeight: 0, margin: [4, 0, 0, 0] });
  scrolls(list);
  const none = new Panel(list);
  standIn(page, root);
  standIn(part(page, '.bl-head'), head);
  standIn(part(page, '.bl-head span'), title);
  standIn(part(page, '.bl-lines'), list);
  shown.log = list;
  return { root, title, links, list, none, lines: new Map(), following: true, scrolledTo: 0 };
}

/** A log line's words: names bold (the hero's in the accent, a foe's red on a hit taken), the damage in its type's
 *  colour, the notes small. */
function logStyle(taken: boolean): StyleOf {
  return (element, around) => {
    if (element.tagName === 'B') {
      const you = element.classList.contains('you');
      const colour = you ? accent() : taken && element.classList.contains('foe') ? FOE_TAKEN : '#fff';
      return { ...around, weight: 700, color: colour };
    }
    // (the damage and the notes each unbroken, `white-space: nowrap`)
    if (element.tagName === 'EM') {
      return { ...around, weight: 700, color: (element as HTMLElement).style.color || around.color, whole: true };
    }
    if (element.tagName === 'SMALL') {
      // (in its line's height, as an inline element sits in its paragraph's: `11px` at 1.35)
      const line = (around.size * (around.line ?? 1)) / NOTE_SIZE;
      return { ...around, size: NOTE_SIZE, line, color: 'rgba(230,220,200,.5)', whole: true };
    }
    return around;
  };
}

function logLine(log: Log, row: Element): LogLine {
  const panel = new Panel(log.list, { direction: 'row', alignItems: 'start', gap: [4, 0] });
  const time = new Panel(new Panel(panel, { width: 7 * chWidth(MONO.size), shrink: 0, alignItems: 'start' }));
  const what = new RunLine(panel, { grow: 1, minWidth: 0 });
  const line = { row: panel, time, what };
  log.lines.set(row, line);
  standIn(row, panel);
  const words = row.querySelector('.bl-what');
  if (words) standIn(words, what.panel);
  return line;
}

function followLog(log: Log, page: HTMLElement): void {
  const shows = !page.classList.contains('hidden');
  log.root.show(shows);
  if (!shows) return;
  const most = (innerWidth / 2 - BADGE_HALF * uiScales.hud - BADGE_GAP) / uiScales.ui - 10;
  log.root.style({ maxWidth: Math.min(LOG_WIDTH, most) });
  const paused = page.classList.contains('paused');
  log.title.say(part(page, '.bl-head span').textContent ?? '', {
    ...MONO, size: 9.5, spacing: 1, upper: true, color: paused ? accent() : INK_DIM,
  });
  for (const link of log.links) link.follow();
  const lines = innerHeight <= SHORT_PX ? LINES_SHORT : LINES;
  log.list.style({ maxHeight: MONO.size * 1.35 * lines });
  // (on touch it lets the move stick have what's under it, its links alone pressed)
  log.root.look({ hits: !input.touchMode });
  followLines(log, part(page, '.bl-lines'));
}

/** The log's lines brought up to the page's: new ones made, gone ones taken away, the list kept at its foot while
 *  it was there. */
function followLines(log: Log, box: HTMLElement): void {
  const rows = [...box.querySelectorAll('.bl-line')];
  const none = box.querySelector('.bl-none');
  log.none.show(!!none && !none.classList.contains('hidden'));
  log.none.say(none?.textContent ?? '', DIM);
  // (the player scrolled it since the last frame: it follows its foot only if they left it there)
  if (log.list.scrolled !== log.scrolledTo) log.following = log.list.scrolled >= scrollRoom(log.list) - FOLLOWING;
  for (const [row, line] of log.lines) {
    if (row.isConnected && row.parentElement === box) continue;
    line.row.remove();
    log.lines.delete(row);
  }
  for (const row of rows) {
    const line = log.lines.get(row) ?? logLine(log, row);
    const taken = row.classList.contains('taken');
    line.time.say(row.querySelector('.bl-t')?.textContent ?? '', TIME);
    const what = row.querySelector('.bl-what');
    if (what) line.what.set(runsOf(what, DIM, logStyle(taken)));
  }
  if (log.following) scrollTo(log.list, Infinity);
  log.scrolledTo = log.list.scrolled;
}

/** the log's list as drawn, for the lab (its scroll: the page's list is out of sight and never scrolls) */
const shown: { log: Panel | null } = { log: null };

/** How far the battle log's list is scrolled now (css px), as drawn. */
export const battleLogScrolled = (): number => (shown.log?.scrolled ?? 0) * uiScales.ui;

/** The net overlay and the battle log in `column`, drawn by the engine from now on. */
export function drawNetLog(column: Panel): void {
  const netPage = document.getElementById('net');
  const logPage = document.getElementById('blog');
  if (!netPage || !logPage) return;
  const net = makeNet(column, netPage);
  const log = makeLog(column, logPage);
  onFrame(() => {
    if (!column.seen) return;
    followNet(net, netPage);
    followLog(log, logPage);
  });
}
