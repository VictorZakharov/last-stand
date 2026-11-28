// A text field on the kit (#973: a form's fields drawn by the engine, as the bug report's and the save slots' names
// need). The page's own input stays on the page out of sight (`.kit-mirror`): it holds the focus, takes the keys and
// a phone's keyboard, its value and its caret, its name for a screen reader, and whatever listens to it does as it
// did. A press on the panel focuses it; each frame the panel shows its value (its placeholder, dimmed, while it's
// empty; a password's as dots) and a caret where the input's is, while it has the focus.
import { measure, type TextStyle } from '../overlay/paint';
import { onFrame, Panel } from './panel';
import { pressable } from './press';
import { wrapText } from './wrap';

/** the caret's width (px of the reference layout), and how long it shows and hides in turn while still (ms) */
const CARET_W = 1.5;
const BLINK_MS = 530;
/** what a password's every character shows as */
const DOT = '•';

/** A field's input on the page. */
export type FieldInput = HTMLInputElement | HTMLTextAreaElement;

/** A text field drawn by the kit: its box, its words, its caret, and the input it stands for. */
export interface Field {
  panel: Panel;
  words: Panel;
  caret: Panel;
  input: FieldInput;
  /** stops following the input (the field taken away) */
  stop: () => void;
}

/** What `input` shows now: its value (a password's as dots), or its placeholder while it's empty. */
function shownOf(input: FieldInput): { text: string; placeholder: boolean } {
  if (!input.value) return { text: input.placeholder, placeholder: true };
  const hidden = input instanceof HTMLInputElement && input.type === 'password';
  return { text: hidden ? DOT.repeat(input.value.length) : input.value, placeholder: false };
}

/** How far into its words the caret stands (px of the reference layout). */
function caretAt(input: FieldInput, style: TextStyle): number {
  const shown = shownOf(input);
  if (shown.placeholder) return 0;
  const end = input.selectionEnd ?? input.value.length;
  return measure(shown.text.slice(0, end), style).w;
}

/**
 * A field inside `panel` standing for `input`: its words in `style` (its placeholder in `placeholder`), a caret in
 * the words' colour while the input has the focus. The panel's own style and look are its box's (padding, border,
 * fill); its words stand at its left, as an input's do, clipped to it.
 */
export function textField(panel: Panel, input: FieldInput, style: TextStyle, placeholder: TextStyle,
  keepsFocus = false): Field {
  const area = input instanceof HTMLTextAreaElement;
  // (a text area's lines from its top, wrapped at its width; an input's one line in its middle)
  panel.style({ overflow: 'hidden', direction: 'row', alignItems: area ? 'start' : 'center', justify: 'start' });
  // (its words and caret in a line of their own, so the field's padding moves both)
  const line = new Panel(panel, area
    ? { position: 'relative', grow: 1, shrink: 1, minWidth: 0 }
    : { position: 'relative', alignItems: 'center', shrink: 0 });
  const words = new Panel(line, area ? { grow: 1, shrink: 1, minWidth: 0 } : { shrink: 0 });
  const caret = new Panel(line, { position: 'absolute', width: CARET_W }, { fill: style.color });
  pressable({ panel, mirror: input, press: () => focusAtEnd(input), keepsFocus });
  const stop = onFrame(() => follow(words, caret, input, style, placeholder, area));
  return { panel, words, caret, input, stop };
}

/** `input` focused, its caret at its end (a press anywhere on the field, as an input's own; the forwarder's too). */
export function focusAtEnd(input: FieldInput): void {
  input.focus({ preventScroll: true });
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

/** The field's words and caret brought up to the input's value, caret and focus (a text area's wrapped). */
function follow(words: Panel, caret: Panel, input: FieldInput, style: TextStyle, placeholder: TextStyle,
  area: boolean): void {
  const shown = shownOf(input);
  words.say(shown.text, shown.placeholder ? placeholder : style, area ? 'left' : null);
  const focused = document.activeElement === input;
  const lit = focused && Math.floor(performance.now() / BLINK_MS) % 2 === 0;
  const tall = style.line ? style.line * style.size : measure('Ag', style).h;
  const at = area ? caretInLines(input, style, words.wrapWidth) : { x: caretAt(input, style), y: 0 };
  caret.style({ height: tall, inset: [at.y, 'auto', 'auto', at.x] });
  caret.look({ opacity: lit ? 1 : 0 });
}

/** Where a text area's caret stands in its words wrapped at `width` (px): after the line its text before it ends on. */
function caretInLines(input: FieldInput, style: TextStyle, width: number): { x: number; y: number } {
  if (!input.value || !width) return { x: 0, y: 0 };
  const before = wrapText(input.value.slice(0, input.selectionEnd ?? input.value.length), style, width, 'left');
  const last = before.lines[before.lines.length - 1];
  return { x: last.w, y: (before.lines.length - 1) * before.line };
}
