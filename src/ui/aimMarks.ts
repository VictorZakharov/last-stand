// The close views' marks at the screen's middle drawn by the engine (ui/kit; #973): the crosshair, bold and swelling
// once as a heart knocks while a drawn shot is held at full draw (`.full`, main.ts); a held skill's charge as a ring
// round it, drawn clockwise from the top (`chargeMark.ts`); and the hint under them to click to look round. They
// were `#crosshair`, `#charge-ring` and `#look-hint`, styled by `_hud.scss`; the page's stay, out of sight
// (`.kit-mirror`), what shows them toggling their classes as before, and the panels here follow them each frame.
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import { along, easeOut, keyframed, now, reducedMotion } from './kit/motion';
import { chargeRing } from './chargeMark';
import type { TextStyle } from './overlay/paint';
import type { Length } from '../engine/ui';
import { uiScales } from './scale';
import { shownIf, shownOnPage } from './kit/shownOnPage';

/** the crosshair's box and its bars' width, at rest and at full draw (px); its colour so */
const CROSS = 22;
const BAR = 2;
const BAR_FULL = 3.5;
const CROSS_INK = 'rgba(255,240,210,.9)';
const CROSS_INK_FULL = 'rgb(255,240,210)';
/** each bar's part out from the middle: a gap from 35% to 65% of the box (`linear-gradient(c 0 35%, ...)`) */
const ARM = 0.35;
/** the bars' drop shadow (`drop-shadow(0 0 1.5px #000)`) */
const CROSS_SHADE = { blur: 1.5, color: '#000' };
/** its heart's knock as full draw is reached (`crosshair-beat`, 0.3 s: up to 1.5 times by 35%, each step eased out) */
const BEAT_TIME = 0.3;
const BEAT: [number, number][] = [[0, 1], [0.35, 1.5], [1, 1]];
/** the charge's ring: its box, its line's width, its faint whole ring under it, its colour charging and full */
const RING = 54;
const RING_LINE = 3;
const RING_UNDER = 'rgba(255,240,210,.22)';
const RING_UNDER_LINE = 1.5;
const RING_INK = 'rgba(255,240,210,.95)';
const RING_INK_FULL = '#ffd98a';
/** the steps of a turn the ring is painted at: painted again as its charge passes one */
const RING_STEPS = 120;
/** the hint: a line on a dark pill, 58% of the way down (`#look-hint`) */
const HINT: TextStyle = { face: 'body', size: 15, color: '#f0e6d0' };
const HINT_TOP = '58%';

interface Marks {
  root: Panel;
  cross: Panel;
  bars: Panel[];
  ring: Panel;
  hintRoot: Panel;
  hint: Panel;
}

let marks: Marks | null = null;

/** The crosshair as drawn, for the lab (`tools/lab/page/crosshair.ts`): its bars' width now (css px), its scale, the
 *  beats begun (one each time it turns full, with motion on); and what the lab holds and plants: its beat's share
 *  held there, and its swell about its top left corner, the canary's fault. */
export const CROSSHAIR = {
  bar: 0,
  scale: 1,
  beats: 0,
  /** a beat's length (ms) and its largest swell */
  beatLength: BEAT_TIME * 1000,
  beatSwell: Math.max(...BEAT.map(([, scale]) => scale)),
  /** where through its beat it swells most */
  beatHeight: BEAT.reduce((best, frame) => (frame[1] > best[1] ? frame : best))[0],
  hold: null as number | null,
  aboutCorner: false,
};
/** whether the crosshair was full last frame, and when it last turned so (s of the page's clock) */
let wasFull = false;
let fullAt = -Infinity;

/** A panel at the screen's middle, absolute over the whole of it. */
function middle(): Panel {
  return new Panel(null, { position: 'absolute', inset: 0, alignItems: 'center', justify: 'center' });
}

function make(): Marks {
  const root = middle();
  const cross = new Panel(root, { position: 'relative', width: CROSS, height: CROSS });
  // (top, bottom, left, right: each from the box's edge to its gap)
  const bars = [0, 1, 2, 3].map(() => new Panel(cross, { position: 'absolute' }, { shadow: CROSS_SHADE }));
  const ring = new Panel(middle(), { width: RING, height: RING });
  const hintRoot = new Panel(null, {
    position: 'absolute', inset: [HINT_TOP, 0, 'auto', 0], alignItems: 'center',
  });
  // (its padding `0.5em 1em` of its 15 px)
  const hint = new Panel(hintRoot, { padding: [7.5, 15] }, { fill: 'rgba(8,8,14,.75)', radius: 6 });
  for (const [id, panel] of [['crosshair', cross], ['charge-ring', ring], ['look-hint', hint]] as const) {
    const page = document.getElementById(id);
    if (page) standIn(page, panel);
  }
  return { root, cross, bars, ring, hintRoot, hint };
}

/** The crosshair laid out at `scale` of its size, its bars `width` wide in `ink`. */
function layCross(m: Marks, scale: number, width: number, ink: string): void {
  const side = CROSS * scale;
  const arm = side * ARM;
  const across = (side - width) / 2;
  // (swelling about its corner, the canary's fault: its top left kept where it stood at rest)
  const off = CROSSHAIR.aboutCorner ? side - CROSS : 0;
  m.cross.style({ width: side, height: side, margin: [off, 0, 0, off] });
  const insets: [Length, Length, Length, Length][] = [
    [0, 'auto', 'auto', across], ['auto', 'auto', 0, across], [across, 'auto', 'auto', 0], [across, 0, 'auto', 'auto'],
  ];
  m.bars.forEach((bar, at) => {
    const upright = at < 2;
    bar.style({ inset: insets[at], width: upright ? width : arm, height: upright ? arm : width });
    bar.look({ fill: ink });
  });
}

/** The charge's ring painted `share` of the way round from the top, in `ink`, over its faint whole ring. */
function paintRing(share: number, ink: string) {
  return (c: CanvasRenderingContext2D): void => {
    const r = RING / 2;
    c.lineWidth = RING_UNDER_LINE;
    c.strokeStyle = RING_UNDER;
    c.beginPath();
    c.arc(r, r, r - RING_UNDER_LINE / 2, 0, Math.PI * 2);
    c.stroke();
    if (share <= 0) return;
    c.lineWidth = RING_LINE;
    c.strokeStyle = ink;
    c.beginPath();
    c.arc(r, r, r - RING_LINE / 2, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
    c.stroke();
  };
}

/** Whether the page's `id` shows, as its own rules have it. */
const shows = (id: string): boolean => shownIf(document.getElementById(id));

/** The marks brought up to the page's: each frame, and when the lab reads them as the page stands now. */
export function followAimMarks(): void {
  const cross = shows('crosshair');
  const ring = shows('charge-ring');
  const hint = shows('look-hint');
  if (!marks && !cross && !ring && !hint) return;
  marks ??= make();
  const m = marks;
  m.cross.show(cross);
  const full = !!document.getElementById('crosshair')?.classList.contains('full');
  if (full && !wasFull) {
    fullAt = now();
    if (!reducedMotion()) CROSSHAIR.beats++;
  }
  wasFull = full;
  if (cross) {
    const share = CROSSHAIR.hold ?? along(fullAt, BEAT_TIME);
    const beat = full && !reducedMotion() ? keyframed(BEAT, share, easeOut) : 1;
    const bar = (full ? BAR_FULL : BAR) * beat;
    layCross(m, beat, bar, full ? CROSS_INK_FULL : CROSS_INK);
    Object.assign(CROSSHAIR, { bar: bar * uiScales.hud, scale: beat });
  }
  m.ring.show(ring);
  if (ring) {
    const ringFull = !!document.getElementById('charge-ring')?.classList.contains('full');
    const step = Math.round(chargeRing.share * RING_STEPS) / RING_STEPS;
    const ink = ringFull ? RING_INK_FULL : RING_INK;
    m.ring.picture(`charge ${step} ${ink}`, RING, RING, paintRing(step, ink));
  }
  m.hintRoot.show(hint);
  if (hint) m.hint.say(document.getElementById('look-hint')?.textContent ?? '', HINT);
}

/** The crosshair's beat ended where it stands (the lab's, as it ends the page's animation). */
export function finishBeat(): void {
  fullAt = -Infinity;
}

/** The marks drawn by the engine from now on, the page's own out of sight. */
export function drawAimMarks(): void {
  for (const id of ['crosshair', 'charge-ring', 'look-hint']) document.getElementById(id)?.classList.toggle('kit-mirror', true);
  onFrame(followAimMarks);
}
