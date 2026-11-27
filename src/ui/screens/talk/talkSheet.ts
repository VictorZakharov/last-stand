// A talk with the village's folk drawn by the engine (ui/kit's sheet; #973), rule for rule from `_talk.scss`: the
// card at the screen's foot under a shade towards it, his face in its oval (`folkFaceSheet.ts`) and his name plate
// beside his lines, the hint while he speaks, the replies two to a row where the card is wide, each with its number's
// key, the one the keys are on lit as a hover is. Short screens: the face small, the replies two to a row again;
// narrow ones: the face and plate in a row over the lines. The card is `talk.ts`'s markup, written and bound there as
// before. Sizes are px of the lobby's scale. Not drawn: each line's and reply's rise as it comes.
import { SHORT, TOUCH, mediaQuery } from '../../controlsSheet';
import { accent } from '../../diagFrame';
import { FOLK_FACE, faceBox } from '../../folkFaceSheet';
import { FRAME, INK, INK_DIM, WELL, alpha } from '../../kit/theme';
import { safeInsets } from '../../kit/safeArea';
import { columnOf } from '../../savesGrid';
import { uiScales } from '../../scale';
import type { Painted, Sheet } from '../../kit/sheet';

/** a narrow window (`max-width: 900px`: one reply to a row) and a phone held upright (`max-width: 560px`) */
const NARROW = mediaQuery('(max-width: 900px)');
const UPRIGHT_PHONE = mediaQuery('(max-width: 560px)');
/** a reply's words, and its key lit */
const REPLY = '#ffe7b0';
const KEY_LIT = '#1a120c';
/** the shade towards the screen's foot, painted this small and stretched (it's a smooth gradient) */
const SHADE_SIZE: [number, number] = [8, 64];

/** How many replies to a row. */
function repliesInRow(): number {
  if (UPRIGHT_PHONE()) return 1;
  if (SHORT()) return 2;
  return NARROW() ? 1 : 2;
}

/** The shade over the room, clear to 40% of the way down, then darkening to the foot. */
function shade(): Painted {
  const [w, h] = SHADE_SIZE;
  return {
    key: 'talk shade',
    size: SHADE_SIZE,
    paint: (c) => {
      const fade = c.createLinearGradient(0, 0, 0, h);
      fade.addColorStop(0.4, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,.6)');
      c.fillStyle = fade;
      c.fillRect(0, 0, w, h);
    },
  };
}

/** The face's size: the card's, the short screen's or the upright phone's. */
function faceSize(): [number, number] {
  if (UPRIGHT_PHONE()) return [56, 65];
  return SHORT() ? [78, 91] : [136, 159];
}

/** The card, its face and plate, and his lines. */
const CARD: Sheet = [
  ...FOLK_FACE,
  { at: '#talk', box: () => ({ justify: 'end', width: innerWidth / uiScales.ui, height: innerHeight / uiScales.ui,
    padding: [0, 0, (safeInsets().bottom + innerHeight * 0.02) / uiScales.ui, 0] }),
  look: { fill: 'rgba(0,0,0,0)' }, paint: shade },
  { at: '.tk-box', box: () => ({ position: 'relative', width: 880, direction: UPRIGHT_PHONE() ? 'column' : 'row',
    alignItems: 'stretch', gap: SHORT() ? 12 : UPRIGHT_PHONE() ? 10 : 20, overflow: 'hidden',
    padding: SHORT() ? [10, 14, 10, 10] : [18, 22, 18, 18] }), text: { align: 'start' } },
  // his face and name plate
  { at: '.tk-side', flex: true, box: () => (UPRIGHT_PHONE()
    ? { direction: 'row', alignItems: 'center', gap: 8, shrink: 0 }
    : { direction: 'column', alignItems: 'center', gap: SHORT() ? 5 : 8, width: faceSize()[0], shrink: 0 }) },
  { at: '.tk-portrait', box: () => faceBox(...faceSize()) },
  { at: '.tk-plate', flex: true, box: () => ({ direction: 'column', alignItems: UPRIGHT_PHONE() ? 'start' : 'center',
    gap: 1, padding: SHORT() ? [3, 4] : [5, 6, 6, 6], border: 1, alignSelf: UPRIGHT_PHONE() ? undefined : 'stretch' }),
  look: { fill: WELL, border: alpha(FRAME, 0.7), radius: 2 } },
  { at: '.tk-name', text: () => ({ face: 'display', weight: 900, size: SHORT() ? 11 : 15, line: 1.15,
    spacing: 0.3, color: accent(), align: 'center' }) },
  { at: '.tk-title', text: () => ({ italic: true, size: SHORT() ? 10 : 12, line: 1.2, color: INK_DIM,
    align: 'center' }) },
  // what he says
  { at: '.tk-body', flex: true, box: () => ({ direction: 'column', gap: SHORT() ? 6 : 10, grow: 1, basis: 0,
    minWidth: 0 }) },
  { at: '.tk-close', box: { position: 'absolute', inset: [6, 8, 'auto', 'auto'], width: 32, height: 32, padding: 0 },
    text: { size: 26, line: 1, color: INK_DIM }, hover: { text: { color: INK } } },
  { at: '.tk-says', flex: true, scrolls: true, box: () => ({ direction: 'column', overflow: 'scroll', border: [0, 0, 0, 2],
    padding: [0, 30, 0, 14], shrink: 0, maxHeight: (innerHeight * (SHORT() ? 0.28 : 0.3)) / uiScales.ui }),
  look: { border: alpha(FRAME, 0.35) } },
  { at: '.tk-says p', box: () => ({ margin: [0, 0, SHORT() ? 4 : 8, 0], shrink: 0 }),
    text: () => ({ size: SHORT() ? 15 : 18, line: SHORT() ? 1.3 : 1.42, color: INK }) },
  { at: '.tk-says p:last-child', box: { margin: 0 } },
  // (the hint while he speaks, breathing)
  { at: '.tk-more', box: { display: 'none' } },
  { at: '.revealing .tk-more', box: { display: 'flex', padding: [0, 0, 0, 16] },
    says: () => `▸  ${TOUCH() ? 'Tap to go on' : 'Click or press Space to go on'}`,
    text: { size: 12, weight: 600, spacing: 0.72, upper: true, color: INK_DIM }, pulse: { period: 1.2, from: 1, to: 0.45 } },
];

/** The replies: framed rows, each its key, the one asked before quieter and marked, Leave last and plainer. */
const REPLIES: Sheet = [
  { at: '.tk-replies', flex: true, box: () => ({ direction: 'row', wrap: true, gap: SHORT() ? 4 : 6, shrink: 0 }) },
  {
    at: '.tk-reply',
    flex: true,
    box: (_element, round) => ({ direction: 'row', alignItems: 'center', justify: 'start', gap: 9, border: [1, 1, 1, 3],
      width: columnOf(round, repliesInRow(), SHORT() ? 4 : 6), padding: SHORT() ? [4, 8] : [6, 10],
      minHeight: TOUCH() ? Math.max(40, 36 / uiScales.ui) : SHORT() ? 34 : 40 }),
    look: { fill: 'rgba(255,255,255,.03)', border: alpha(FRAME, 0.45), radius: 3 },
    text: () => ({ weight: 500, size: SHORT() ? 14 : 16, line: 1.25, color: REPLY, align: 'start' }),
    hover: { look: { fill: 'rgba(255,231,176,.1)' } },
  },
  { at: '.tk-reply.focus', look: () => ({ fill: 'rgba(255,231,176,.1)', border: accent() }) },
  { at: '.tk-reply .tx', box: { grow: 1, basis: 0, minWidth: 0 } },
  { at: '.tk-reply .k', box: { shrink: 0, minWidth: 22, padding: [1, 5], border: 1 },
    look: { fill: 'rgba(0,0,0,.35)', border: FRAME, radius: 2 },
    text: () => ({ face: 'display', weight: 700, size: 12, color: accent(), align: 'center', whole: true }) },
  { at: '.tk-reply.focus .k', look: () => ({ fill: accent() }), text: { color: KEY_LIT } },
  { at: '.tk-reply .mark', box: { shrink: 0 }, text: { size: 13, color: INK_DIM, whole: true } },
  { at: '.tk-reply .asked-mark', box: { padding: [1, 5], border: 1 }, look: { border: alpha(FRAME, 0.3), radius: 2 },
    text: { size: 10, weight: 600, spacing: 0.8, upper: true } },
  { at: '.tk-reply.asked', text: { color: 'rgba(255,231,176,.62)' } },
  { at: '.tk-reply.leave', look: { fill: 'rgba(0,0,0,0)' }, text: { color: INK_DIM } },
  { at: '.tk-reply.leave.focus', text: { color: INK } },
];

export const TALK: Sheet = [...CARD, ...REPLIES];
