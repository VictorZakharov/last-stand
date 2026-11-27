// The parts a style sheet's tree draws besides an element's own box (#973, `sheet.ts`): its rules gathered in the
// cascade's order, the ornamented frame's brackets, and what moves (a transition's ease of the opacity and the
// shift, a looping pulse), stepped by the kit's clock (`motion.ts`: still under reduced motion, as CSS's are kept).
import { Panel } from './panel';
import { easeInOut, now as clock, reducedMotion } from './motion';
import { litLook, now, type Gathered, type Rule, type SheetText } from './sheetRules';
import type { PressState } from './press';
import type { PanelStyle } from '../../engine/ui';
import type { TextStyle } from '../overlay/paint';

/** The style `rules` give `element` in `round`, shown as the pointer stands (`state`), from the text round it. */
export function gather(rules: Rule[], element: Element, round: Panel | null, state: PressState,
  around: TextStyle & SheetText): Gathered {
  const button = element instanceof HTMLButtonElement;
  const box: PanelStyle = button ? { direction: 'row', alignItems: 'center', justify: 'center' }
    : { direction: 'column' };
  const out: Gathered = { box, look: {}, text: { ...around }, brackets: false, marks: [], turn: 0, flex: false,
    scrolls: false, ease: 0, shift: [0, 0], lift: false };
  for (const rule of rules) {
    if (rule.when && !rule.when()) continue;
    if (rule.box) Object.assign(out.box, now(rule.box, element, round));
    if (rule.look) out.look = { ...out.look, ...now(rule.look, element, round) };
    if (rule.text) out.text = { ...out.text, ...now(rule.text, element, round) };
    if (rule.ring) out.ring = now(rule.ring, element, round);
    if (rule.flex !== undefined) out.flex = rule.flex;
    if (rule.hits !== undefined) out.hits = rule.hits;
    if (rule.after) out.after = rule.after;
    if (rule.before) out.before = rule.before;
    if (rule.says !== undefined) out.says = now(rule.says, element, round);
    if (rule.brackets) out.brackets = true;
    if (rule.picture) out.picture = now(rule.picture, element, round);
    if (rule.marks) out.marks = [...out.marks, ...now(rule.marks, element, round)];
    if (rule.turn !== undefined) out.turn = rule.turn;
    if (rule.paint) out.paint = rule.paint;
    if (rule.scrolls) out.scrolls = true;
    if (rule.ease !== undefined) out.ease = rule.ease;
    if (rule.shift) out.shift = rule.shift;
    if (rule.pulse) out.pulse = rule.pulse;
    if (rule.lift) out.lift = true;
    if (rule.hover && state !== 'none') {
      if (rule.hover.look) out.look = { ...out.look, ...rule.hover.look };
      if (rule.hover.text) out.text = { ...out.text, ...rule.hover.text };
      if (rule.hover.lit) out.look = litLook(out.look, rule.hover.lit);
      if (rule.hover.ring) out.ring = rule.hover.ring;
    }
  }
  return out;
}

/** An element's opacity and shift as they stand in their transition, and the time it was stepped last. */
export interface Moving {
  opacity: number;
  shift: [number, number];
  at: number;
}

/** `moving` stepped toward `opacity` and `shift`, over `ease` s for a whole change (at once with none, or reduced
 *  motion); a pulse's opacity laid over it. Returns the opacity to draw and the shift to lay it out by. */
export function step(moving: Moving, opacity: number, shift: [number, number], ease: number,
  pulse: Rule['pulse']): { opacity: number; shift: [number, number] } {
  const t = clock();
  const dt = Math.max(0, t - moving.at);
  moving.at = t;
  const reach = ease > 0 && !reducedMotion() ? dt / ease : Infinity;
  const toward = (from: number, to: number, whole: number): number => {
    const most = reach * whole;
    return Math.abs(to - from) <= most ? to : from + Math.sign(to - from) * most;
  };
  moving.opacity = toward(moving.opacity, opacity, 1);
  const span = Math.max(1, Math.hypot(shift[0] - moving.shift[0], shift[1] - moving.shift[1]), 24);
  moving.shift = [toward(moving.shift[0], shift[0], span), toward(moving.shift[1], shift[1], span)];
  let shown = moving.opacity;
  if (pulse && !reducedMotion()) {
    const phase = (t / pulse.period) % 2;
    const along = easeInOut(phase <= 1 ? phase : 2 - phase);
    shown *= pulse.from + (pulse.to - pulse.from) * along;
  } else if (pulse) {
    shown *= pulse.from;
  }
  return { opacity: shown, shift: moving.shift };
}

/** the ornamented frame's inner line (`inset: 6px`, 1 px of the frame at .22) and its brackets (26 by 2 px, accent) */
const BRACKET_INSET = 6;
const BRACKET_LONG = 26;
const BRACKET_THICK = 2;

/** The frame's line and its corner brackets inside `panel` (CSS's `::before` with `corner-brackets`). */
export function makeBrackets(panel: Panel): Panel {
  const line = new Panel(panel, { position: 'absolute', inset: BRACKET_INSET, border: 1 },
    { border: 'rgba(160,124,70,.22)' });
  const corners: [string, string][] = [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']];
  for (const [vertical, horizontal] of corners) {
    for (const [w, h] of [[BRACKET_LONG, BRACKET_THICK], [BRACKET_THICK, BRACKET_LONG]]) {
      const inset: [number | 'auto', number | 'auto', number | 'auto', number | 'auto'] = [
        vertical === 'top' ? 0 : 'auto', horizontal === 'right' ? 0 : 'auto',
        vertical === 'bottom' ? 0 : 'auto', horizontal === 'left' ? 0 : 'auto'];
      // (from the line's inside edge, as a background is laid from its padding box)
      new Panel(line, { position: 'absolute', inset, width: w, height: h });
    }
  }
  return line;
}
