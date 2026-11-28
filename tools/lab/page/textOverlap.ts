// Text drawn over other text: each run of text's box as the browser lays its glyphs out (a range's rectangles, which
// reach past an element's own box where its text runs on), cut to what the boxes round it let show (overflow other
// than visible clips it), and every two of them from different elements that share more than a sliver. An element's
// box alone says nothing of it: a card's class name ran on over the stats' labels beside it with every box apart
// (#700, from Victor's review: "Need to fix text overlap").

// The pure part, tested in Node (`test/textOverlap.test.mjs`); reading the page's boxes is `textOnScreen.ts`.

/** A run of text's box on the page (css px), named by what it is. */
export interface TextBox {
  name: string;
  left: number; top: number; right: number; bottom: number;
}

/** two boxes overlap when they share more than this (css px) both ways: a glyph's antialiasing is less */
export const SLIVER = 1.5;
/** the share of a line's box over and under its letters' ink, taken off each before they're compared: a range's box
 *  is the line's, the font's ascent and descent, and a big number over its label touched the label's line by 2 px at
 *  1920x1080 with their letters well apart */
export const LEADING = 0.15;

/** `box` cut to where its letters are drawn: `LEADING` of its height off its top and bottom. */
export function inked(box: TextBox): TextBox {
  const trim = (box.bottom - box.top) * LEADING;
  return { ...box, top: box.top + trim, bottom: box.bottom - trim };
}

/** The area two boxes share, as its width and height (none: 0, 0). */
export function shared(a: TextBox, b: TextBox): { width: number; height: number } {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? { width, height } : { width: 0, height: 0 };
}

/** Every two boxes of different names that overlap past a sliver, said as "a over b". */
export function overlapping(boxes: TextBox[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].name === boxes[j].name) continue;
      const { width, height } = shared(boxes[i], boxes[j]);
      if (width > SLIVER && height > SLIVER) {
        found.push(`"${boxes[i].name}" over "${boxes[j].name}" (${width.toFixed(0)}x${height.toFixed(0)} px)`);
      }
    }
  }
  return found;
}
