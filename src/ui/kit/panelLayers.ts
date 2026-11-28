// The screen's panel and its layers (#973): every panel the kit draws is inside the screen's, in the layer of its z
// (`LAYERS`, the page's z-indices), each layer placed among the others by its z whenever it was made.
import { Panel } from './panel';

/** the panel the screen is, every other inside it (shown or not as a whole: photo mode leaves them out) */
let screen: Panel | null = null;
/** The screen's panel, if it was made. */
export const screenNow = (): Panel | null => screen;
/** whether the screen's panel is being made (it alone is made on the engine's own screen) */
let making = false;
/** Whether the panel being made is the screen's. */
export const makingScreen = (): boolean => making;

function screenPanel(): Panel {
  if (!screen) {
    making = true;
    screen = new Panel(null, { width: '100%', height: '100%', position: 'relative' });
    making = false;
  }
  return screen;
}

/** the layers' z of what's drawn in them, as the page's z-indices stood their elements: the touch controls under the
 *  HUD, the lobby's panels and the village's card over it, the modals over those, the tooltip over every one, and a
 *  dragged item's picture over all */
export const LAYERS = { touch: 8, hud: 10, lobby: 20, modal: 40, tooltip: 50, drag: 150 } as const;

/** the screen's layers by their z: what's in a higher one is drawn over what's in a lower, whenever it was made */
const layers = new Map<number, Panel>();
/** the sibling the panel being made goes before (a layer placed among the others), or none: at its parent's end */
let placeBefore: Panel | null = null;
/** The sibling the panel being made goes before, or none. */
export const placedBefore = (): Panel | null => placeBefore;

/**
 * The screen's layer at `z` (CSS's z-index of what's in it: the HUD's 0, the lobby's 20, the modals' 40, the
 * tooltip's 50: `LAYERS`), made the first time it's asked for, among the others by its z. A panel made with no
 * parent goes in the HUD's. The screen's own children were drawn in the order they were made, and the HUD's bars, made again as a run
 * began, were drawn over the summary's backdrop.
 */
export function layer(z: number): Panel {
  const found = layers.get(z);
  if (found) return found;
  const above = [...layers.keys()].filter((other) => other > z).sort((a, b) => a - b)[0];
  placeBefore = above === undefined ? null : layers.get(above)!;
  // (as large as the screen, and laid out as it is: what was the screen's own child is the layer's alike)
  const made = new Panel(screenPanel(), { position: 'absolute', inset: 0 });
  placeBefore = null;
  layers.set(z, made);
  return made;
}

/** Every layer made so far, with its z. */
export const everyLayer = (): [number, Panel][] => [...layers.entries()];
