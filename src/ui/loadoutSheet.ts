// The lobby's key bar and spellbook as the kit's sheet takes them (#973: `styles/_loadout.scss`, `_hud.scss`'s
// `.slot` and `_responsive.scss`, rule for rule): the bar the skills are bound to, the book that opens over it, the
// chevron between them, and each slot's face painted as the skill bar paints its own (`slotFace.ts`). Sizes are px of
// the lobby's scale.
import { SHORT_OR_UPRIGHT, TOUCH } from './controlsSheet';
import { accent } from './diagFrame';
import { faceOf } from './hotbarPanel';
import { FACE, artLoaded, faceKey, paintFace } from './slotFace';
import { FRAME, HIGHLIGHT, INK_DIM, alpha } from './kit/theme';
import type { Painted, Sheet } from './kit/sheet';

/** what's done as a slot's art loads: nothing, its next frame's follow paints it */
const NOTHING = (): void => undefined;

/** A slot's face as the skill bar paints it, at `w` by `h` px of the art. */
export function slotFace(element: Element, w: number, h: number): Painted {
  const face = faceOf(element as HTMLElement);
  const image = face.art ? artLoaded(face.art, NOTHING) : null;
  return {
    key: faceKey(face, !!image),
    paint: (c, scale) => {
      c.save();
      c.scale(w / FACE, h / FACE);
      paintFace(c, face, image, scale);
      c.restore();
    },
  };
}

/** a slot's side (px): the spellbook's, the key bar's, and a short screen's */
const SIDE = { book: 42, bar: 46, bookShort: 56, barShort: 60 };

export const LOADOUT: Sheet = [
  {
    at: '#menu #loadout',
    flex: true,
    box: { direction: 'column', alignItems: 'center', gap: 6, padding: [8, 12, 10, 12], maxWidth: '100%', border: 0 },
    look: { fill: 'rgba(8,7,9,.8)', border: undefined, radius: [6, 6, 0, 0], shadow: undefined },
    ring: 'rgba(0,0,0,0)',
  },
  { at: '.lo-book', flex: true, box: { display: 'none', direction: 'column', alignItems: 'center', gap: 6,
    maxWidth: '100%' } },
  { at: '#loadout.open .lo-book', box: { display: 'flex' } },
  { at: '#loadout .lo-head', flex: true,
    box: { direction: 'column', alignItems: 'center', gap: 2, maxWidth: 440 }, text: { align: 'center' } },
  { at: '#loadout .lo-top', flex: true,
    box: { direction: 'row', wrap: true, justify: 'center', alignItems: 'baseline', gap: [14, 0] } },
  { at: '#loadout .lo-title', text: () => ({ face: 'display', size: 16, color: accent() }) },
  { at: '#loadout .lo-style', flex: true, box: { direction: 'row', gap: 8, alignItems: 'baseline' },
    text: { size: 12, color: INK_DIM } },
  { at: '#loadout .lo-style-name:empty', box: { display: 'none' } },
  { at: '#loadout #btn-lo-reset', text: { size: 12 } },
  { at: '#loadout .lo-hint', text: { size: 11, color: INK_DIM, line: 1.3 } },
  { at: '.touch-inline', box: { display: 'none' } },
  { at: '.mouse-only', when: TOUCH, box: { display: 'none' } },
  { at: '.touch-inline', when: TOUCH, box: { display: 'flex' } },
  { at: '#loadout .lo-free', text: { size: 13, color: INK_DIM, line: 1.3, align: 'center' } },
  // the spellbook: its tiles in rows that wrap, centred
  {
    at: '#spellbook',
    flex: true,
    box: { direction: 'row', wrap: true, justify: 'center', padding: [3, 7], border: 1 },
    look: { border: 'rgba(0,0,0,0)', radius: 4 },
  },
  { at: '#loadout.drag-slot #spellbook', look: { border: 'rgba(255,90,70,.6)', fill: 'rgba(80,16,12,.35)' } },
  { at: '#spellbook.over', look: { fill: 'rgba(120,24,16,.5)' } },
  // a skill's slot: its face painted, its frame over it, its key at its corner
  {
    at: '#loadout .slot',
    flex: true,
    box: { width: 62, height: 62, border: 1, overflow: 'hidden', alignItems: 'center', justify: 'center',
      shrink: 0 },
    look: { border: '#000', radius: 3 },
    ring: alpha(FRAME, 0.7),
    paint: slotFace,
  },
  { at: '#loadout .slot :is(.icon, .cd, .cdt)', box: { display: 'none' } },
  { at: '#loadout .slot .key', box: { position: 'absolute', inset: ['auto', 4, 2, 'auto'] },
    text: { size: 12, weight: 700, color: '#fff', shadows: [{ x: 0, y: 0, blur: 3, color: '#000' }] } },
  { at: '#spellbook .slot', box: { width: SIDE.book, height: SIDE.book, margin: 3 } },
  { at: '#spellbook .slot .key', box: { display: 'none' } },
  { at: '#spellbook .slot.unusable', look: { opacity: 0.45 } },
  { at: '#loadout-bar .slot', box: { width: SIDE.bar, height: SIDE.bar } },
  { at: '#loadout-bar .slot.sep', box: { margin: [0, 0, 0, 6] } },
  { at: '#loadout-bar .slot.picking', ring: HIGHLIGHT, pulse: { period: 0.6, from: 0.75, to: 1 } },
  { at: '#loadout.drag-book #loadout-bar .slot, #loadout.drag-slot #loadout-bar .slot',
    ring: alpha(HIGHLIGHT, 0.55) },
  { at: '#loadout-bar .slot.over', ring: HIGHLIGHT, look: { border: HIGHLIGHT } },
  { at: '.slot.dragging', look: { opacity: 0.4 } },
  // the key bar, and beside it the chevron that opens the book above it (up) and folds it back down
  { at: '.lo-keys', flex: true, box: { direction: 'row', gap: 6, maxWidth: '100%' } },
  { at: '#loadout-bar', flex: true,
    box: { direction: 'row', wrap: true, justify: 'center', gap: 5, minWidth: 0 } },
  { at: '#lo-toggle', box: { width: 26, padding: 0, shrink: 0, alignSelf: 'stretch' }, look: { radius: 3 },
    text: () => ({ color: accent() }), hover: { look: { fill: alpha(FRAME, 0.15) } } },
  { at: '#lo-toggle svg', picture: [14, 9] },
  { at: '#loadout.open #lo-toggle svg', turn: 180 },
  // a short screen: larger slots, the book always open, no chevron
  { at: '#spellbook .slot', when: SHORT_OR_UPRIGHT, box: { width: SIDE.bookShort, height: SIDE.bookShort } },
  { at: '#loadout-bar .slot', when: SHORT_OR_UPRIGHT, box: { width: SIDE.barShort, height: SIDE.barShort } },
  { at: '#loadout .lo-hint', when: SHORT_OR_UPRIGHT, text: { size: 13 } },
  { at: '.lo-book', when: SHORT_OR_UPRIGHT, box: { display: 'flex' } },
  { at: '#lo-toggle', when: SHORT_OR_UPRIGHT, box: { display: 'none' } },
];
