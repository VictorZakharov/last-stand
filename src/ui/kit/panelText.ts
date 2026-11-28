// The text or picture a panel shows (#973): what it says and how, its label in the overlay's atlas, and the size it
// asks of its panel's layout.
import type { Label } from '../overlay/layer';
import type { TextStyle } from '../overlay/paint';
import type { TextAlign } from './wrap';
import type { Run } from './runs';

/** A line of text a panel shows: what it says and how, and how far its line's box reaches past the face's own each
 *  side (px: negative where its line height is shorter, as CSS's half-leading); or a picture (no style), `text` the
 *  key it's painted again by. */
export interface Text {
  text: string;
  style: TextStyle | null;
  label: Label;
  w: number;
  h: number;
  reach: number;
  lead: number;
  /** how its lines stand where it wraps at its panel's width, and the width it was last broken at */
  align: TextAlign | null;
  wrapped: { width: number } | null;
  /** a line of styled runs (`sayRuns`), whether it wraps, and how wide it is on one line (CSS's max-content) */
  runs?: { list: Run[]; wraps: boolean; most: number; least: number };
}

/** The size a panel's text asks of its layout (px of the screen): a wrapped text asks for no width (its panel's is
 *  given it, and a width asked would hold the panel from narrowing as the window does), only its lines' height. */
export function contentOf(text: Text, k: number): { w: number; h: number } {
  if (text.runs) return { w: text.runs.most * k, h: text.h * k };
  return { w: text.align ? 0 : text.w * k, h: text.h * k };
}
