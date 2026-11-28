// The height of a line of text as the page lays it out with `line-height: normal` (#973): the font's ascent, descent
// and line gap, as its own metrics give them. A canvas measures the ascent and descent alone, so a panel's text laid
// out by the canvas's box stood a few px shorter than the page's (the choice after a wave's chips, 4 px each). Read
// once a font off a hidden element of the page's, kept once the font has loaded.
import { fontOf, type TextStyle } from '../overlay/paint';

const heights = new Map<string, number>();
let probe: HTMLSpanElement | null = null;

/** A line's height in `style` as the page lays it out (px), or none until the page can say. */
export function normalLine(style: TextStyle): number | null {
  const font = fontOf(style);
  const known = heights.get(font);
  if (known !== undefined) return known;
  if (typeof document === 'undefined' || !document.body) return null;
  probe ??= made();
  probe.style.font = font;
  probe.style.lineHeight = 'normal';
  const height = probe.getBoundingClientRect().height;
  if (height > 0 && document.fonts.check(font)) heights.set(font, height);
  return height > 0 ? height : null;
}

/** The hidden element lines are measured in. */
function made(): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;display:inline-block;white-space:nowrap';
  span.textContent = 'Ag';
  document.body.append(span);
  return span;
}
