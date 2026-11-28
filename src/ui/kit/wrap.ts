// Text that wraps in a panel (`Panel.say` with `wrap`): a run of text broken into lines at a width as the page's
// CSS breaks it (at spaces, a word wider than the line alone on its own; a line break kept), each line measured and
// painted under the last at the text's line height, aligned in the width it was wrapped at.
import { drawText, measure, type Measured, type TextStyle } from '../overlay/paint';
import { normalLine } from './lineHeight';

/** How a wrapped text's lines stand in its width (CSS's `text-align`). */
export type TextAlign = 'left' | 'center' | 'right';

/** A text broken into lines: each line laid out, the width it was broken at, and its line height (px). */
export interface Wrapped {
  lines: Measured[];
  width: number;
  line: number;
  align: TextAlign;
}

/** The line height a text is laid out at: its `line` times its size, the font's normal one, or its face's box. */
function lineOf(style: TextStyle, measured: Measured): number {
  if (style.line) return style.line * style.size;
  return normalLine(style) || measured.h;
}

/** `paragraph`'s words broken into lines no wider than `width` (px), a word wider than it alone on its line. */
function breakParagraph(paragraph: string, style: TextStyle, width: number): Measured[] {
  const words = paragraph.split(/ +/).filter((word) => word !== '');
  if (!words.length) return [measure('', style)];
  const lines: Measured[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const longer = `${line} ${word}`;
    if (measure(longer, style).w <= width) {
      line = longer;
      continue;
    }
    lines.push(measure(line, style));
    line = word;
  }
  lines.push(measure(line, style));
  return lines;
}

/** `text` broken into lines no wider than `width` (px) in `style`, its own line breaks kept. */
export function wrapText(text: string, style: TextStyle, width: number, align: TextAlign): Wrapped {
  const lines = text.split('\n').flatMap((paragraph) => breakParagraph(paragraph, style, width));
  return { lines, width, line: lineOf(style, lines[0]), align };
}

/** How tall a wrapped text's lines are together (px). */
export const wrappedHeight = (wrapped: Wrapped): number => wrapped.lines.length * wrapped.line;

/** How far a line stands from its text's left edge in the width it was wrapped at (px). */
function indentOf(wrapped: Wrapped, line: Measured): number {
  const room = Math.max(0, wrapped.width - line.w);
  if (wrapped.align === 'center') return room / 2;
  if (wrapped.align === 'right') return room;
  return 0;
}

/** A wrapped text painted with its top left at (x, y) (px), each line in its place. */
export function drawWrapped(c: CanvasRenderingContext2D, wrapped: Wrapped, x: number, y: number, style: TextStyle,
  scale: number): void {
  wrapped.lines.forEach((line, index) => {
    const top = y + index * wrapped.line + (wrapped.line - line.h) / 2;
    drawText(c, line, x + indentOf(wrapped, line), top, style, scale);
  });
}
