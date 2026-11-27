// `lab kit`: the kit's own pieces held to what the engine draws (#973: the UI moved onto the engine's panels), each
// built afresh beside the others in the lobby and read off the engine's frame. Text that wraps: its lines within its
// panel's width, as many as its height says. A panel that scrolls: the wheel over it moves it, never past what's
// inside it, and nothing inside it is drawn outside its box. A text field: a click on it focuses its input, what's
// typed is drawn, its caret stands at the end of it. Each with a canary: the text left unwrapped, the scroll's clip
// taken off, the field no longer following its input.
import type { Lab, Pictured } from './lab';
import { drawFrame, type Canvas } from './light';
import { Panel } from '../../../src/ui/kit/panel';
import { scrolls, scrollRoom } from '../../../src/ui/kit/scroll';
import { textField, type Field } from '../../../src/ui/kit/field';
import { measure, type TextStyle } from '../../../src/ui/overlay/paint';
import { uiScales } from '../../../src/ui/scale';

/** the colour every piece is drawn in here, which nothing else on the screen has, and the box each stands in */
const INK = '#ff00ff';
const BLOCK = { top: 160, left: 160, width: 300, gap: 40 };
/** the words wrapped: some 40, at least three lines at its width */
const WORDS = 'Each wave the horde grows stronger and the spoils grow richer, but every item you carry is lost if you'
  + ' fall before you bank it, so weigh the risk of one more wave against what you have already won today.';
const TEXT: TextStyle = { face: 'body', size: 16, color: INK };
const PLACEHOLDER: TextStyle = { face: 'body', size: 16, color: '#808080' };
/** the scroll's box and its rows: ten of 40 with 10 between, 490 of them in a box of 200 */
const SCROLL = { height: 200, rows: 10, row: 40, apart: 10 };
const TYPED = 'abc';
/** the field's padding each side (px of the reference layout) */
const FIELD_PAD = 10;
/** the frames a change is given to be laid out and drawn */
const SETTLE = 3;

/** Which of the kit's pieces a canary breaks, if any. */
export type KitCanary = '' | 'wrap' | 'scroll' | 'field';

/** A box on the screen (css px). */
interface Box { x: number; y: number; w: number; h: number }

/** How many pixels of `frame` in `box` (css px) are the pieces' ink. */
function inkIn(frame: Canvas, box: Box): number {
  const ratio = frame.width / innerWidth;
  const left = Math.max(0, Math.floor(box.x * ratio));
  const right = Math.min(frame.width, Math.ceil((box.x + box.w) * ratio));
  const top = Math.max(0, Math.floor(box.y * ratio));
  const bottom = Math.min(frame.height, Math.ceil((box.y + box.h) * ratio));
  let ink = 0;
  for (let y = top; y < bottom; y++) {
    // (the frame's rows from its bottom up)
    const row = frame.height - 1 - y;
    for (let x = left; x < right; x++) {
      const at = (row * frame.width + x) * 4;
      const pixels = frame.pixels;
      if (pixels[at] > 0.6 && pixels[at + 2] > 0.6 && pixels[at + 1] < 0.4) ink++;
    }
  }
  return ink;
}

/** The frame drawn after `SETTLE` frames, the kit's panels laid out and painted. */
async function settled(lab: Lab): Promise<Canvas> {
  await lab.step(SETTLE);
  return drawFrame(lab);
}

/** A block of the kit's, the `index`th from the left, in a column on black. */
function block(index: number, height?: number): Panel {
  const left = BLOCK.left + index * (BLOCK.width + BLOCK.gap);
  const style = { position: 'absolute' as const, inset: [BLOCK.top, 'auto', 'auto', left] as [number, 'auto',
    'auto', number], width: BLOCK.width, direction: 'column' as const, height };
  return new Panel(null, style, { fill: '#000' }, 'ui');
}

/** The box of `panel` as drawn, or a throw saying it isn't. */
function boxOf(panel: Panel, what: string): Box {
  const box = panel.rect();
  if (!box) throw new Error(`lab: kit: ${what} isn't drawn`);
  return box;
}

/** Text that wraps: its lines within its block, as many as its height says. */
async function wrapping(lab: Lab, canary: boolean, lines: string[], problems: string[]): Promise<Panel> {
  const parent = block(0);
  const words = new Panel(parent).say(WORDS, TEXT, canary ? null : 'left');
  const frame = await settled(lab);
  const k = uiScales.ui;
  const box = boxOf(parent, 'the wrapped text\'s block');
  const text = boxOf(words, 'the wrapped text');
  const right = { x: box.x + box.w + 2, y: box.y, w: innerWidth - box.x - box.w - 2, h: box.h };
  const inside = inkIn(frame, box);
  const past = inkIn(frame, right);
  const line = measure('Ag', TEXT).h;
  const shownLines = Math.round(text.h / k / line);
  lines.push(`wrap: ${shownLines} lines (${Math.round(text.h)} px tall), ${inside} pixels inside its block, `
    + `${past} past its right edge`);
  // (left unwrapped, a line is squeezed into its panel's width, its words drawn across its box: none past it)
  if (shownLines < 3) problems.push(`wrap: ${shownLines} lines, where its words need 3 or more`);
  if (inside === 0) problems.push('wrap: none of its words drawn');
  if (past > 0) problems.push(`wrap: ${past} pixels of its words past its block's right edge`);
  return parent;
}

/** A panel that scrolls: the wheel moves it within what's inside it, nothing drawn outside its box. */
async function scrolling(lab: Lab, canary: boolean, lines: string[], problems: string[]): Promise<Panel> {
  const parent = block(1, SCROLL.height);
  for (let row = 0; row < SCROLL.rows; row++) {
    new Panel(parent, { height: SCROLL.row, shrink: 0, margin: [0, 0, SCROLL.apart, 0] }, { fill: INK });
  }
  scrolls(parent);
  if (canary) parent.style({ overflow: 'visible' });
  await settled(lab);
  const box = boxOf(parent, 'the scrolling panel');
  const middle = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const k = uiScales.ui;
  await lab.wheel(middle, 120 * k);
  await lab.step(SETTLE);
  const once = parent.scrolled;
  await lab.wheel(middle, 5000 * k);
  const frame = await settled(lab);
  const room = scrollRoom(parent);
  const below = inkIn(frame, { x: box.x, y: box.y + box.h + 1, w: box.w, h: SCROLL.rows * SCROLL.row * k });
  const above = inkIn(frame, { x: box.x, y: 0, w: box.w, h: box.y - 1 });
  const expected = SCROLL.rows * (SCROLL.row + SCROLL.apart) - SCROLL.height;
  lines.push(`scroll: ${once.toFixed(0)} px after a turn of the wheel, ${parent.scrolled.toFixed(0)} after a long `
    + `one (${room.toFixed(0)} to scroll, ${expected} by its rows), ${above + below} pixels drawn outside its box`);
  if (once <= 0) problems.push('scroll: the wheel over it scrolled nothing');
  if (Math.abs(parent.scrolled - expected) > 1) {
    problems.push(`scroll: scrolled to ${parent.scrolled.toFixed(1)} px, where its rows reach ${expected}`);
  }
  if (above + below > 0) problems.push(`scroll: ${above + below} pixels of its rows drawn outside its box`);
  return parent;
}

/** The input a field stands for, on the page out of sight as the game's are. */
function hiddenInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.placeholder = 'Your name';
  input.className = 'kit-mirror';
  document.body.append(input);
  return input;
}

/** A text field: a click on it focuses its input, what's typed is drawn, its caret at its end. */
async function typing(lab: Lab, canary: boolean, lines: string[], problems: string[]): Promise<Field> {
  const parent = block(2, 36);
  parent.style({ padding: [0, FIELD_PAD] });
  const field = textField(parent, hiddenInput(), TEXT, PLACEHOLDER);
  await settled(lab);
  const box = boxOf(parent, 'the text field');
  await lab.click({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
  const focused = document.activeElement === field.input;
  if (canary) field.stop();
  await lab.type(TYPED);
  const frame = await settled(lab);
  const words = field.words.rect();
  const caret = field.caret.rect();
  const k = uiScales.ui;
  const wanted = measure(TYPED, TEXT).w * k;
  const caretAt = words && caret ? caret.x - words.x : NaN;
  const ink = inkIn(frame, box);
  // (its words at its left inside its padding, half way down it, as an input's stand)
  const indent = words ? (words.x - box.x) / k : NaN;
  const middle = words ? (words.y + words.h / 2 - box.y - box.h / 2) / k : NaN;
  lines.push(`field: ${focused ? 'focused' : 'not focused'} by a click, says "${field.words.said}", its caret `
    + `${caretAt.toFixed(1)} px in (${wanted.toFixed(1)} the typed words' width), ${ink} pixels of its words drawn, `
    + `its words ${indent.toFixed(1)} px in and ${middle.toFixed(1)} off its middle`);
  if (!focused) problems.push('field: a click on it left its input unfocused');
  if (field.words.said !== TYPED) problems.push(`field: says "${field.words.said}" after "${TYPED}" was typed`);
  if (!(Math.abs(caretAt - wanted) <= 1)) problems.push(`field: its caret ${caretAt.toFixed(1)} px in, not at its end`);
  if (ink === 0) problems.push('field: none of its words drawn');
  if (!(Math.abs(indent - FIELD_PAD) <= 1)) problems.push(`field: its words ${indent.toFixed(1)} px in from its left`);
  if (!(Math.abs(middle) <= 1)) problems.push(`field: its words ${middle.toFixed(1)} px off its middle`);
  return field;
}

/** Each of the kit's pieces built, read off the engine's frame and taken away; `canary` breaks one. */
export async function kit(lab: Lab, canary: KitCanary): Promise<{ lines: string[]; problems: string[];
  moments: Pictured[] }> {
  const lines: string[] = [];
  const problems: string[] = [];
  const made: Panel[] = [];
  let field: Field | null = null;
  try {
    made.push(await wrapping(lab, canary === 'wrap', lines, problems));
    made.push(await scrolling(lab, canary === 'scroll', lines, problems));
    field = await typing(lab, canary === 'field', lines, problems);
    made.push(field.panel);
    const moments = [await lab.screen('the kit')];
    return { lines, problems, moments };
  } finally {
    field?.stop();
    field?.input.remove();
    for (const panel of made) panel.remove();
  }
}
