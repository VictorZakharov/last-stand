// The lobby's panels opened for a `ui` state, as the village opens them: the stash is the chest's alone and the
// inventory is I's (on touch, the Bag button's), so a state that pictures them opens them first and puts back what
// showed after.
import { openPanels, panelsOpen, type Panels } from '../../../src/ui/menus';
import type { Lab } from './lab';

/** frames for the panels shown to be drawn: the kit draws them on its frames (`src/ui/lobbyPanels.ts`), so what a
 *  state hovers or taps in them is laid out where it's drawn */
const DRAWN_FRAMES = 3;

/** what the panels showed before the first `showPanels` since the last `panelsBack` (undefined: nothing to put back) */
let before: Panels | undefined;

/** The lobby's panels shown as `open` (the chest's, with the stash; the inventory), what showed before them kept,
 *  and drawn. */
export async function showPanels(lab: Lab, open: Panels): Promise<void> {
  if (before === undefined) before = panelsOpen();
  openPanels(open);
  await lab.step(DRAWN_FRAMES);
}

/** The lobby's panels as they were before `showPanels`. */
export function panelsBack(): void {
  if (before === undefined) return;
  openPanels(before);
  before = undefined;
}
