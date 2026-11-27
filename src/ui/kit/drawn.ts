// What the kit draws read as the page's is (#973): for the lab, whose checks read a page's boxes, scrolls and what lies
// under a point, on a screen the kit draws in the page's place. Each answers as the page's own would where the kit
// draws nothing there.
import { drawnFor } from './press';
import { onFrame } from './panel';
import { elementAt, seenThrough } from './forward';
import { scrollRoom, scrollTo } from './scroll';
export { picturesLoaded } from './svgArt';
import { uiScales } from '../scale';
import { engineCanvas } from '../../engine/index';

/** How far `element` scrolls past what it shows (css px): its drawn panel's room, else the page's own. */
export function scrollMore(element: Element): number {
  const panel = element.closest('.kit-mirror') ? drawnFor(element) : null;
  if (!panel) return element.scrollHeight - element.clientHeight;
  return scrollRoom(panel) * uiScales[panel.scaled];
}

/** `element` scrolled into view in the scrolling panel round it (the page's `scrollIntoView`, `block: 'center'`),
 *  where the kit draws it; the page's own scrolled where it doesn't. */
export function reveal(element: Element): void {
  const panel = element.closest('.kit-mirror') ? drawnFor(element) : null;
  if (!panel) {
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    return;
  }
  let round = panel.parent;
  while (round && round.styled.overflow !== 'scroll') round = round.parent;
  const box = panel.rect();
  const view = round?.rect();
  if (!round || !box || !view) return;
  const k = uiScales[round.scaled];
  const off = (box.y + box.h / 2 - (view.y + view.h / 2)) / k;
  scrollTo(round, round.scrolled + off);
}

/** The page's element drawn under (`x`, `y`) css px taking the pointer: the page's own where it lies over the
 *  engine's canvas (a notice, a ghost the kit draws), else a screen's the kit draws there, else the page's. */
export function elementUnder(x: number, y: number): Element | null {
  const page = document.elementFromPoint(x, y);
  const canvas = engineCanvas();
  // (a page's element the screens are drawn over, the touch controls' move pad, is the canvas's there)
  const overKit = !!page && !!canvas && page !== canvas && !page.contains(canvas) && !seenThrough(page);
  return overKit ? page : elementAt(x, y) ?? page;
}

/** how many frames a list's end is held in view after its words change: the kit lays it out a frame or two later */
const END_FRAMES = 4;

/** `element`'s scrolling list scrolled to its end, where the kit draws it (the page's `scrollTop = scrollHeight`,
 *  which the kit's panel never hears: the talk's lines as he says more), held there as it's laid out again. */
export function scrollToEnd(element: Element): void {
  const panel = element.closest('.kit-mirror') ? drawnFor(element) : null;
  if (!panel) return;
  let left = END_FRAMES;
  const stop = onFrame(() => {
    scrollTo(panel, scrollRoom(panel));
    if (--left <= 0) stop();
  });
}
