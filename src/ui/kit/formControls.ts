// A form's ticked boxes and sliders on the kit (#973: the pause menu's settings, the bug report's, photo mode's), drawn
// as Chrome draws its own in the page's light scheme with an `accent-color`: a box white and grey-edged, filled with
// the accent and ticked once checked; a slider's track grey, filled with the accent to its value, a round thumb of the
// accent there. The page's input stays on the page out of sight (`.kit-mirror`), its value and checked state what's
// drawn; a click forwarded to it ticks it (`forward.ts`), a press dragged along a slider moves it (`altForms.ts`).
import { Panel } from './panel';
import { accent } from '../diagFrame';
import type { TextStyle } from '../overlay/paint';
import { BODY } from './sheetRules';

/** a box's border and fill unticked (Chrome's light scheme), and its tick's colour on a light accent */
const UNTICKED = { fill: '#ffffff', border: '#767676' };
const TICK = '#101010';
/** a slider's track (its height, px) and thumb (its side, px), the track's unfilled colour */
const TRACK = 4;
const THUMB = 16;
const TRACK_FILL = '#efefef';
const TRACK_EDGE = '#b2b2b2';

/** A control drawn for an input: what it shows followed each frame. */
export interface Control {
  follow(): void;
}

/** Whether `element` is a box ticked (a checkbox, a radio button). */
export function isTicked(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio');
}

/** Whether `element` is a slider. */
export function isSlider(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === 'range';
}

/** `input`'s box drawn across `panel`: unticked, or the accent's fill and its tick. */
export function tickBox(panel: Panel, input: HTMLInputElement): Control {
  const round = input.type === 'radio';
  const box = new Panel(panel, { position: 'absolute', inset: 0, border: 1, alignItems: 'center', justify: 'center' });
  const tick: TextStyle = { ...BODY, size: 12, weight: 900, color: TICK };
  let shown = '';
  return {
    follow(): void {
      const colour = accent();
      const key = `${input.checked} ${colour}`;
      if (key === shown) return;
      shown = key;
      const radius = round ? THUMB : 2;
      box.look(input.checked ? { fill: colour, border: colour, radius } : { ...UNTICKED, radius });
      box.say(input.checked ? (round ? '●' : '✓') : '', tick);
    },
  };
}

/** How far along its track `input`'s value stands, 0 to 1. */
function shareOf(input: HTMLInputElement): number {
  const min = Number(input.min) || 0;
  const max = input.max === '' ? 100 : Number(input.max);
  return max > min ? Math.min(1, Math.max(0, (Number(input.value) - min) / (max - min))) : 0;
}

/** `input`'s slider drawn across `panel`: its track, filled to its value, and its thumb there. */
export function slider(panel: Panel, input: HTMLInputElement): Control {
  // (the thumb's travel is the track less its side: its middle at either end stands half a thumb in)
  const travel = new Panel(panel, { position: 'absolute', inset: [0, THUMB / 2, 0, THUMB / 2], direction: 'column',
    justify: 'center' });
  const track = new Panel(travel, { height: TRACK, border: 1, direction: 'row' },
    { fill: TRACK_FILL, border: TRACK_EDGE, radius: TRACK / 2 });
  const filled = new Panel(track, { height: '100%' }, { radius: TRACK / 2 });
  const thumb = new Panel(travel, { position: 'absolute', width: THUMB, height: THUMB },
    { radius: THUMB / 2 });
  let shown = '';
  return {
    follow(): void {
      const colour = accent();
      const share = shareOf(input);
      const key = `${share} ${colour}`;
      if (key === shown) return;
      shown = key;
      const at = `${Number((share * 100).toFixed(3))}%` as const;
      filled.style({ width: at });
      filled.look({ fill: colour, radius: TRACK / 2 });
      thumb.style({ inset: ['50%', 'auto', 'auto', at], margin: [-THUMB / 2, 0, 0, -THUMB / 2] });
      thumb.look({ fill: colour, radius: THUMB / 2 });
    },
  };
}
