// What a scrolling panel holds out of its view (#973): the panels inside it that lie wholly past its box, more than
// a quarter of its height (or width) away, whose texts and pictures give their slots of the labels' atlas back till they're
// scrolled near again. A long scrolled page held every text's slot, seen or not: the guide's hero's page filled the
// atlas (the engine's fault banner, "the label atlas is full") and the words past it were never painted.
import type { Panel } from './panel';

/** how far past a view a panel keeps its slots, a share of the view's size each way: a wheel's turn or a finger's
 *  flick comes into it painted (a full view each way held three views of the guide's hero's page, and its atlas was
 *  full still) */
const NEAR = 0.25;

/** A box on the screen (css px). */
interface Box { x: number; y: number; w: number; h: number }

/** Whether `inner` lies wholly outside `view` widened by `NEAR` of its size each way. */
function farOutside(inner: Box, view: Box): boolean {
  const left = view.x - view.w * NEAR;
  const top = view.y - view.h * NEAR;
  const right = view.x + view.w * (1 + NEAR);
  const bottom = view.y + view.h * (1 + NEAR);
  return inner.x + inner.w < left || inner.x > right || inner.y + inner.h < top || inner.y > bottom;
}

/** Whether `inner` lies wholly inside `view`. */
function within(inner: Box, view: Box): boolean {
  return inner.x >= view.x && inner.y >= view.y && inner.x + inner.w <= view.x + view.w
    && inner.y + inner.h <= view.y + view.h;
}

/** The panels in `round` far outside `view` added to `out`: one wholly inside is left whole, one across its edge
 *  looked into. */
function gather(round: Panel, view: Box, out: Set<Panel>): void {
  for (const child of round.inside) {
    const box = child.rect();
    if (!box) continue;
    if (farOutside(box, view)) out.add(child);
    else if (!within(box, view)) gather(child, view, out);
  }
}

/** Every panel far out of the view of a scrolling panel of `panels` shown now (read off the layout as it stands:
 *  one layout of the tree, before the frame's own). */
export function scrolledOut(panels: Iterable<Panel>): Set<Panel> {
  const out = new Set<Panel>();
  for (const panel of panels) {
    if (panel.styled.overflow !== 'scroll' || !panel.seen) continue;
    const view = panel.rect();
    if (view && view.h > 0) gather(panel, view, out);
  }
  return out;
}
