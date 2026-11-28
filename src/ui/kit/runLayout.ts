// A line of styled runs laid out as one picture (#973, `RunLine`): its words broken into lines at a width as CSS
// breaks a paragraph (at spaces, a word wider than the line alone on its own, a `<br>` ending its line), each word in
// its run's style, the words of a line on one baseline and each line as tall as its tallest run's line. It was a
// panel and a label a word: a guide's hero page some 2,000 of each, its first frame 300 to 500 ms of their making,
// measuring and painting (`lab guide`), where the page's own markup took 50.
import { drawText, measure, shadowReach, type Measured } from '../overlay/paint';
import { normalLine } from './lineHeight';
import { BREAK, wordsOf, type Run, type RunStyle } from './runs';
import type { TextAlign } from './wrap';

/** A word placed on its line: its measure, its style and how far along the line it starts (px). */
interface Piece {
  measured: Measured;
  style: RunStyle;
  x: number;
}

/** A line of words: how wide its words reach, how tall it is, and its baseline's reach above and below. */
interface Line {
  pieces: Piece[];
  width: number;
  height: number;
  ascent: number;
  descent: number;
}

/** Runs laid out at a width: their lines, how tall they are together, and how they stand in the width. */
export interface LaidRuns {
  lines: Line[];
  width: number;
  height: number;
  align: TextAlign;
}

/** A word of a run measured: without the space after it (where a line may end) and the space's own width. */
interface Word {
  text: string;
  style: RunStyle;
  broken: boolean;
  measured: Measured;
  space: number;
}

/** each style's space's width, by its font (a word's space is laid after it, never at a line's end) */
const spaces = new Map<string, number>();

/** The width of a space in `style` (px). */
function spaceIn(style: RunStyle): number {
  const key = `${style.face} ${style.weight ?? 400} ${style.size} ${style.spacing ?? 0} ${style.italic ?? false}`;
  let width = spaces.get(key);
  if (width === undefined) {
    width = measure('a a', style).w - measure('aa', style).w;
    spaces.set(key, width);
  }
  return width;
}

/** `runs`' words, each measured. */
function measuredWords(runs: Run[]): Word[] {
  return wordsOf(runs).map((word) => {
    if (word.text === BREAK) {
      return { text: '', style: word.style, broken: true, measured: measure('', word.style), space: 0 };
    }
    const trimmed = word.text.replace(/ +$/, '');
    const space = trimmed.length < word.text.length ? spaceIn(word.style) : 0;
    return { text: trimmed, style: word.style, broken: false, measured: measure(trimmed, word.style), space };
  });
}

/** The line height a run is laid out at: its `line` times its size, the font's normal one, or its face's box. */
function lineOf(style: RunStyle, measured: Measured): number {
  if (style.line) return style.line * style.size;
  return normalLine(style) || measured.h;
}

/** A line made of `words`, each placed after the last, its height and baseline from them (`base` where empty). */
function lineFrom(words: Word[], base: RunStyle): Line {
  const pieces: Piece[] = [];
  let x = 0;
  let width = 0;
  let height = 0;
  let ascent = 0;
  let descent = 0;
  for (const word of words) {
    pieces.push({ measured: word.measured, style: word.style, x });
    width = x + word.measured.w;
    x = width + word.space;
    height = Math.max(height, lineOf(word.style, word.measured));
    ascent = Math.max(ascent, word.measured.ascent);
    descent = Math.max(descent, word.measured.h - word.measured.ascent);
  }
  if (!words.length) {
    const empty = measure('', base);
    height = lineOf(base, empty);
    ascent = empty.ascent;
    descent = empty.h - empty.ascent;
  }
  // (as tall as its line height, its words' own boxes reaching past it where it's shorter, as CSS's line box)
  return { pieces, width, height, ascent, descent };
}

/** `runs` laid out at `width` (px), broken into lines where `wraps` and at their breaks, standing as `align` says. */
export function layRuns(runs: Run[], width: number, align: TextAlign, wraps: boolean): LaidRuns {
  const base = runs[0]?.style ?? ({ face: 'body', size: 14, color: '#fff' } as RunStyle);
  const lines: Line[] = [];
  let line: Word[] = [];
  let reach = 0;
  for (const word of measuredWords(runs)) {
    if (word.broken) {
      lines.push(lineFrom(line, base));
      line = [];
      reach = 0;
      continue;
    }
    // (a word that would reach past the width starts a line of its own; a space at a line's end takes no room)
    if (wraps && line.length && reach + word.measured.w > width + 0.5) {
      lines.push(lineFrom(line, base));
      line = [];
      reach = 0;
    }
    line.push(word);
    reach += word.measured.w + word.space;
  }
  if (line.length || !lines.length) lines.push(lineFrom(line, base));
  const height = lines.reduce((sum, each) => sum + each.height, 0);
  return { lines, width, height, align };
}

/** How wide `runs` are on one line (CSS's max-content) and their widest word (its min-content), px. */
export function runsWidths(runs: Run[]): { most: number; least: number } {
  let most = 0;
  let least = 0;
  let reach = 0;
  for (const word of measuredWords(runs)) {
    if (word.broken) {
      reach = 0;
      continue;
    }
    least = Math.max(least, word.measured.w);
    most = Math.max(most, reach + word.measured.w);
    reach += word.measured.w + word.space;
  }
  return { most, least };
}

/** How far the shadows of `runs`' styles reach past their words (px). */
export const runsReach = (runs: Run[]): number => Math.max(0, ...runs.map((run) => shadowReach(run.style)));

/** How far `line` stands from the text's left edge in the width it was laid out at (px). */
function indentOf(laid: LaidRuns, line: Line): number {
  const room = Math.max(0, laid.width - line.width);
  if (laid.align === 'center') return room / 2;
  if (laid.align === 'right') return room;
  return 0;
}

/** Laid runs painted with their top left at (x, y) (px), each word on its line's baseline. */
export function drawRuns(c: CanvasRenderingContext2D, laid: LaidRuns, x: number, y: number, scale: number): void {
  let top = y;
  for (const line of laid.lines) {
    const baseline = top + (line.height - line.ascent - line.descent) / 2 + line.ascent;
    const indent = x + indentOf(laid, line);
    for (const piece of line.pieces) {
      drawText(c, piece.measured, indent + piece.x, baseline - piece.measured.ascent, piece.style, scale);
    }
    top += line.height;
  }
}
