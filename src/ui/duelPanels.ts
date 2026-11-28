// A duel's score and result drawn by the engine (ui/kit; #973): each side's name either side of the round's badge,
// the rounds each has and the round's time under the badge; and the match's result where the banner stands, a
// framed card. They were `#duel-score` and `#duel-result`, styled by `_hud.scss`, whose text and the result's box
// were css px the HUD's scale never scaled (its offsets and the score's columns did): those are written here divided
// by it. The page's stay, out of sight (`.kit-mirror`): `duelHud.ts` writes them as before, and the panels here
// follow them each frame.
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import { uiScales } from './scale';
import type { Shadow, TextStyle } from './overlay/paint';
import { shownOnPage } from './kit/shownOnPage';

const FRAME = '#a07c46';
const INK = '#e6dcc8';
const INK_DIM = '#9a8f7c';
/** the score's words' shadows (`text-shadow: 0 2px 4px #000, 0 0 10px rgba(0,0,0,.8)`) */
const SCORE_SHADE: Shadow[] = [{ x: 0, y: 2, blur: 4, color: '#000' }, { x: 0, y: 0, blur: 10, color: 'rgba(0,0,0,.8)' }];
const SIDE_A: TextStyle = { face: 'display', size: 19, weight: 700, color: '#f0a184', shadows: SCORE_SHADE };
const SIDE_B: TextStyle = { ...SIDE_A, color: '#9fd0ff' };
const POINTS: TextStyle = { face: 'display', size: 24, spacing: 2, color: '#ffe7b0', shadows: SCORE_SHADE };
const NOTE: TextStyle = { face: 'body', size: 15, spacing: 1, color: INK_DIM, shadows: SCORE_SHADE };
const TITLE: TextStyle = { face: 'display', size: 44, weight: 900, spacing: 3, color: '#f3e1b0' };
const TITLE_LOST = '#e2a08c';
const WHO: TextStyle = { face: 'body', size: 19, color: INK };
const RESULT: TextStyle = { face: 'display', size: 30, weight: 700, spacing: 3, color: '#ffe7b0' };
const RESULT_NOTE: TextStyle = { face: 'body', size: 14, color: INK_DIM };
/** the score's top, its middle column, its widest and its share of the window at most, the names' and the middle's
 *  tops (px of the HUD's layout) */
const SCORE_TOP = 22;
const MIDDLE = 96;
const SCORE_WIDEST = 620;
const SCORE_SHARE = 0.74;
const NAMES_DOWN = 12;
const MIDDLE_DOWN = 62;
/** the result's top, its widest (css px) and its share of the window at most, its padding, its outline */
const RESULT_TOP = '24%';
const RESULT_WIDEST = 460;
const RESULT_SHARE = 0.86;
const OUTLINE = 3;

interface Score { root: Panel; a: Panel; b: Panel; points: Panel; note: Panel }
interface Result { root: Panel; card: Panel; title: Panel; who: Panel; score: Panel; note: Panel }

let score: Score | null = null;
let result: Result | null = null;

/** `style` at css px whatever the HUD's scale (its panel's lengths are scaled by it). */
function unscaled(style: TextStyle): TextStyle {
  const k = uiScales.hud;
  const shadows = style.shadows?.map((s) => ({ ...s, x: s.x / k, y: s.y / k, blur: s.blur / k }));
  return { ...style, size: style.size / k, spacing: (style.spacing ?? 0) / k, shadows };
}

/** The page's `selector` text. */
const textOf = (page: HTMLElement, selector: string): string => page.querySelector(selector)?.textContent ?? '';

function makeScore(page: HTMLElement): Score {
  const root = new Panel(null, {
    position: 'absolute', inset: [SCORE_TOP, 0, 'auto', 0], alignItems: 'center', direction: 'column',
  });
  const row = new Panel(root, { direction: 'row', alignItems: 'start' });
  // (each name in a column of its own, the first against the middle's left, the second against its right)
  const left = new Panel(row, { grow: 1, basis: 0, direction: 'row', justify: 'end', padding: [NAMES_DOWN, 0, 0, 0],
    overflow: 'hidden' });
  const middle = new Panel(row, { width: MIDDLE, shrink: 0, direction: 'column', alignItems: 'center',
    padding: [MIDDLE_DOWN, 0, 0, 0] });
  const right = new Panel(row, { grow: 1, basis: 0, direction: 'row', justify: 'start', padding: [NAMES_DOWN, 0, 0, 0],
    overflow: 'hidden' });
  standIn(page, row);
  return {
    root, a: new Panel(left, { shrink: 0 }), b: new Panel(right, { shrink: 0 }), points: new Panel(middle),
    note: new Panel(middle),
  };
}

function makeResult(page: HTMLElement): Result {
  const root = new Panel(null, {
    position: 'absolute', inset: [RESULT_TOP, 0, 'auto', 0], alignItems: 'center', direction: 'column',
  });
  // (its outline round its border, laid out as if it weren't there)
  const ring = new Panel(root, { margin: -OUTLINE, border: OUTLINE }, { border: 'rgba(74,54,32,.9)' });
  const card = new Panel(ring, { border: 1, direction: 'column', alignItems: 'center' }, {
    fill: ['rgba(8,7,9,.94)', 'rgba(8,7,9,.86)'], border: FRAME,
  });
  standIn(page, card);
  return {
    root, card, title: new Panel(card), who: new Panel(card), score: new Panel(card), note: new Panel(card),
  };
}

/** The score brought up to the page's. */
function followScore(): void {
  const page = document.getElementById('duel-score');
  if (!page) return;
  const shows = shownOnPage(page);
  if (!score && !shows) return;
  score ??= makeScore(page);
  score.root.show(shows);
  if (!shows) return;
  const k = uiScales.hud;
  score.root.inside[0].style({ width: Math.min(innerWidth * SCORE_SHARE, SCORE_WIDEST * k) / k });
  score.a.say(textOf(page, '.ds-a'), unscaled(SIDE_A));
  score.b.say(textOf(page, '.ds-b'), unscaled(SIDE_B));
  score.points.say(textOf(page, '.ds-points'), unscaled(POINTS));
  score.note.say(textOf(page, '.ds-note'), unscaled(NOTE));
}

/** The result brought up to the page's. */
function followResult(): void {
  const page = document.getElementById('duel-result');
  if (!page) return;
  const shows = shownOnPage(page);
  if (!result && !shows) return;
  result ??= makeResult(page);
  result.root.show(shows);
  if (!shows) return;
  const k = uiScales.hud;
  const px = (n: number): number => n / k;
  // (`width: min(86vw, 460px)`, its padding `18px 22px`, its lines' margins over each: all css px)
  result.card.style({ width: Math.min(innerWidth * RESULT_SHARE, RESULT_WIDEST) / k, padding: [px(18), px(22)] });
  result.root.inside[0].style({ margin: -px(OUTLINE), border: px(OUTLINE) });
  const lost = page.dataset.outcome === 'lost';
  result.title.say(textOf(page, '.dr-title'), unscaled(lost ? { ...TITLE, color: TITLE_LOST } : TITLE));
  result.who.style({ margin: [px(4), 0, 0, 0] }).say(textOf(page, '.dr-who'), unscaled(WHO));
  result.score.style({ margin: [px(6), 0, 0, 0] }).say(textOf(page, '.dr-score'), unscaled(RESULT));
  result.note.style({ margin: [px(8), 0, 0, 0] }).say(textOf(page, '.dr-note'), unscaled(RESULT_NOTE), 'center');
  result.note.style({ alignSelf: 'stretch' });
}

/** The duel's score and result drawn by the engine from now on, the page's own out of sight. */
export function drawDuelPanels(): void {
  for (const id of ['duel-score', 'duel-result']) document.getElementById(id)?.classList.toggle('kit-mirror', true);
  onFrame(() => {
    followScore();
    followResult();
  });
}
