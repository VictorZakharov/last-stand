// What the kit draws read as the page's is (#973): for the lab, whose checks read a page's boxes, scrolls and what lies
// under a point, on a screen the kit draws in the page's place. Each answers as the page's own would where the kit
// draws nothing there.
import { drawnFor } from './press';
import { elementAt } from './forward';
import { scrollRoom, scrollTo } from './scroll';
import { uiScales } from '../scale';

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

/** The page's element drawn under (`x`, `y`) css px taking the pointer: a screen's the kit draws, else the page's. */
export function elementUnder(x: number, y: number): Element | null {
  return elementAt(x, y) ?? document.elementFromPoint(x, y);
}
