// A text field on the kit (#973: a form's fields drawn by the engine, as the bug report's and the save slots' names
// need). The page's own input stays on the page out of sight (`.kit-mirror`): it holds the focus, takes the keys and
// a phone's keyboard, its value and its caret, its name for a screen reader, and whatever listens to it does as it
// did. A press on the panel focuses it; each frame the panel shows its value (its placeholder, dimmed, while it's
// empty; a password's as dots) and a caret where the input's is, while it has the focus.
import { measure, type TextStyle } from '../overlay/paint';
import { onFrame, Panel } from './panel';
import { pressable } from './press';

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
  panel.style({ overflow: 'hidden', direction: 'row', alignItems: 'center', justify: 'start' });
  // (its words and caret in a line of their own, so the field's padding moves both)
  const line = new Panel(panel, { position: 'relative', alignItems: 'center', shrink: 0 });
  const words = new Panel(line, { shrink: 0 });
  const caret = new Panel(line, { position: 'absolute', width: CARET_W }, { fill: style.color });
  pressable({ panel, mirror: input, press: () => focusAtEnd(input), keepsFocus });
  const stop = onFrame(() => follow(words, caret, input, style, placeholder));
  return { panel, words, caret, input, stop };
}

/** `input` focused, its caret at its end (a press anywhere on the field, as an input's own). */
function focusAtEnd(input: FieldInput): void {
  input.focus({ preventScroll: true });
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

/** The field's words and caret brought up to the input's value, caret and focus. */
function follow(words: Panel, caret: Panel, input: FieldInput, style: TextStyle, placeholder: TextStyle): void {
  const shown = shownOf(input);
  words.say(shown.text, shown.placeholder ? placeholder : style);
  const focused = document.activeElement === input;
  const lit = focused && Math.floor(performance.now() / BLINK_MS) % 2 === 0;
  const tall = style.line ? style.line * style.size : measure('Ag', style).h;
  caret.style({ height: tall, inset: [0, 'auto', 'auto', caretAt(input, style)] });
  caret.look({ opacity: lit ? 1 : 0 });
}
