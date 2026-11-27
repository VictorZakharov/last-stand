// The page's modals drawn by the engine (ui/kit's sheet; #973): the backdrop over the screen and the framed box in its
// middle (`styles/_modals.scss`'s `.modal` and `.modal-box`, rule for rule), and how one is drawn: its page element
// kept out of sight (`.kit-mirror`), written and listened to by its module as before, a sheet following it each frame.
// A modal's own rules follow these in its sheet. Sizes are px of the lobby's scale (the box's `zoom: var(--ui)`); the
// backdrop's are the screen's.
import { Panel, LAYERS, layer } from './kit/panel';
import { SheetTree, type Sheet } from './kit/sheet';
import { CONTROLS, TOUCH, framed } from './controlsSheet';
import { uiScales } from './scale';
import type { PanelStyle } from '../engine/ui';

/** The window's width and height in px of the lobby's scale, `share` of each (CSS's `94vw / var(--ui)`). */
export const windowShare = (share: number): { w: number; h: number } =>
  ({ w: (innerWidth * share) / uiScales.ui, h: (innerHeight * share) / uiScales.ui });

/** a finger's height on touch (css px) as px of the lobby's scale */
export const finger = (css: number): number => css / uiScales.ui;

/** A box held to the window's share (`max-width: calc(94vw / var(--ui))`, and its height). */
function heldToWindow(): PanelStyle {
  const room = windowShare(0.94);
  return { maxWidth: room.w, maxHeight: room.h };
}

export const MODAL: Sheet = [
  ...CONTROLS,
  // the backdrop, taking every press over the world, the box in its middle
  { at: '.modal', flex: true, hits: true, box: { position: 'absolute', inset: 0, alignItems: 'center',
    justify: 'center' }, look: { fill: 'rgba(0,0,0,.55)' } },
  {
    at: '.modal-box',
    flex: true,
    scrolls: true,
    ...framed(['rgba(20,17,16,.98)', 'rgba(8,7,8,.98)']),
    box: () => ({ direction: 'column', gap: 12, width: 520, padding: [22, 26], border: 2, overflow: 'scroll',
      ...heldToWindow() }),
    text: { align: 'center' },
  },
  { at: '.modal-box', look: { shadow: { blur: 60, y: 20, color: 'rgba(0,0,0,.9)' } } },
  // (what's in it keeps its height and the box scrolls it, as a block's children do: a flex column shrank them)
  { at: '.modal-box > *', box: { shrink: 0 } },
  { at: '.dc-buttons', flex: true, box: { direction: 'row', gap: 12, justify: 'center', shrink: 0 } },
  { at: '.dc-buttons .btn', when: TOUCH, box: () => ({ minHeight: finger(32) }) },
];

/** The modal `id` drawn by the engine from now on by `sheet` (the modals' rules first), its page element out of sight;
 *  its tree, or none where the page hasn't it. */
export function drawModal(id: string, sheet: Sheet): SheetTree | null {
  const page = document.getElementById(id);
  if (!page) return null;
  page.classList.add('kit-mirror');
  const room = new Panel(layer(LAYERS.modal), { position: 'absolute', inset: 0 }, {}, 'ui');
  return new SheetTree(page, [...MODAL, ...sheet], 'ui', room);
}
