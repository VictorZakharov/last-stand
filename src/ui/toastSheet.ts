// The page's small cards at the top's middle of the screen drawn by the engine (ui/kit's sheet; #973): the prompt to
// send a performance report (`styles/_perfAsk.scss`) and a partner's ask for the local player's place in a duel
// (`#duel-ask`, `_lobby.scss`). The prompt back to the window and a new version's (`_pwa.scss`) stay on the page: they
// show over the loading screen, which covers the engine's canvas. Each was `position: fixed; top: N; left: 50%; translate: -50% 0`, zoomed by the UI's scale: here a room
// over the screen in its layer, the card stood at its top's middle. Its page element stays, out of sight, written and
// listened to by its module as before.
import { Panel, layer, onFrame } from './kit/panel';
import { SheetTree, type Sheet } from './kit/sheet';
import { CONTROLS, TOUCH } from './controlsSheet';
import { FRAME, FRAME_DARK, INK, INK_DIM } from './kit/theme';
import { accent } from './diagFrame';
import { uiScales } from './scale';
import type { PanelLook } from '../engine/ui';

/** the cards' fill and shadow (`linear-gradient(rgba(20,17,16,.97), rgba(8,7,8,.97))`, `0 6px 18px rgba(0,0,0,.7)`) */
export const TOAST_LOOK: PanelLook = {
  fill: ['rgba(20,17,16,.97)', 'rgba(8,7,8,.97)'],
  shadow: { blur: 18, y: 6, color: 'rgba(0,0,0,.7)' },
};

/** A card's width held within the window (`calc((100vw - room) / var(--ui))`), px of the lobby's scale. */
export const inWindow = (room: number): number => (innerWidth - room) / uiScales.ui;

/** a finger's height for a card's button on touch (css px, the zoom taken out) */
const FINGER = 40;

/** The rules every card shares: a line of buttons, and theirs (`.btn { padding: 5px 12px; font-size: 13px }`). */
const TOAST: Sheet = [
  ...CONTROLS,
  { at: ':is(#perf-ask, #duel-ask) .btn', box: { padding: [5, 12] }, text: { size: 13 } },
];

/** One card: its element's id, its rules, its layer and how far from the top it stands (px of the UI's scale). */
export interface Toast {
  id: string;
  sheet: Sheet;
  z: number;
  /** px of the UI's scale, or read from its element each frame */
  top: number | ((element: HTMLElement) => number);
  /** whether it's drawn here now (the duel's ask is drawn by the rack's card while it stands in it) */
  here?: (element: Element) => boolean;
}

/** `toast` drawn by the engine from now on, its page element out of sight. */
export function drawToast(toast: Toast): void {
  const page = document.getElementById(toast.id);
  if (!page) return;
  page.classList.toggle('kit-mirror', true);
  const room = new Panel(layer(toast.z), { position: 'absolute', inset: 0, direction: 'column', alignItems: 'center' },
    {}, 'ui');
  const sheet = [...TOAST, ...toast.sheet];
  let tree: SheetTree | null = null;
  let stands = -1;
  onFrame(() => {
    const top = typeof toast.top === 'number' ? toast.top : toast.top(page);
    if (top !== stands) room.style({ padding: [top, 0, 0, 0] });
    stands = top;
    const here = toast.here?.(page) ?? true;
    // (made afresh each time it comes back: its panels stand in for its elements again, `standIn`)
    if (here && !tree) tree = new SheetTree(page, sheet, 'ui', room);
    if (!here && tree) {
      tree.remove();
      tree = null;
    }
  });
}

/** a card's frame (`@include frame(var(--frame), ...)`: its dark border, the frame's line inside) */
const FRAMED = { box: { border: 2 }, look: { ...TOAST_LOOK, border: FRAME_DARK }, ring: FRAME };

/** The performance report's prompt (`_perfAsk.scss`). */
const PERF_ASK: Sheet = [
  { at: '#perf-ask', ...FRAMED, box: () => ({ border: 2, width: Math.min(440, inWindow(24)), padding: [10, 12, 12, 14] }),
    text: { size: 13, line: 1.35, color: INK } },
  { at: '#perf-ask .pa-title', box: { margin: [0, 0, 4, 0] },
    text: () => ({ face: 'display', weight: 700, size: 15, color: accent() }) },
  { at: '#perf-ask .pa-text', text: { color: INK_DIM } },
  { at: '#perf-ask .pa-buttons', flex: true, box: { direction: 'row', wrap: true, gap: 8, margin: [9, 0, 0, 0] } },
  { at: '#perf-ask .pa-done', box: { display: 'none' } },
  { at: '#perf-ask:is(.sending, .sent) .pa-done', flex: true, box: { display: 'flex', direction: 'row',
    alignItems: 'center', gap: 10 } },
  { at: '#perf-ask .pa-close', box: { margin: [0, 0, 0, 'auto'], padding: [2, 9] }, text: { size: 16, line: 1 } },
  { at: '#perf-ask:not(.asking) .pa-ask', box: { display: 'none' } },
  { at: '#perf-ask.sending .pa-close', box: { display: 'none' } },
  { at: '#perf-ask .btn', when: TOUCH, box: () => ({ minHeight: Math.max(32 * uiScales.touch, 34) / uiScales.ui,
    padding: [5, 14] }) },
];

/** A partner's ask for the local player's place in a duel, while it isn't in the rack's card (`_lobby.scss`). */
const DUEL_ASK: Sheet = [
  { at: '#duel-ask', flex: true, box: () => ({ direction: 'row', wrap: true, alignItems: 'center', justify: 'center',
    gap: [6, 10], maxWidth: inWindow(16), padding: [8, 10, 8, 14], border: 1 }),
  look: () => ({ ...TOAST_LOOK, border: accent() }), text: { size: 14, color: INK } },
  { at: '#duel-ask .btn', when: TOUCH, box: () => ({ minHeight: FINGER / uiScales.ui }) },
];

/** the performance report's prompt's top: under the choice after a wave while it shows (`perf/consent.ts` writes it as
 *  `calc(Npx / var(--ui, 1))`, css px), else 12 */
function perfAskTop(element: HTMLElement): number {
  const under = /calc\((\d+(?:\.\d+)?)px/.exec(element.style.top);
  return under ? parseFloat(under[1]) / uiScales.ui : 12;
}

/** The cards drawn by the engine from now on (the page's z-indices their layers). */
export function drawToasts(): void {
  drawToast({ id: 'perf-ask', sheet: PERF_ASK, z: 46, top: perfAskTop });
  drawToast({ id: 'duel-ask', sheet: DUEL_ASK, z: 102, top: 64,
    here: (element) => element.parentElement === document.body });
}
