// A sheet's node (`sheet.ts`: a panel standing for one element of the page's) and what it's dressed in apart from its
// layout (#973): its ring, its corner brackets and a painted picture, made as a rule first asks for them; its marks
// over its corners; an SVG drawn as a picture; and its text field's helpers.
import { Panel } from './panel';
import type { PressState } from './press';
import type { RunLine } from './runs';
import { svgArt } from './svgArt';
import { INK, alpha } from './theme';
import type { Field, FieldInput } from './field';
import type { Control } from './formControls';
import type { KeptText } from './keptText';
import { accent } from '../diagFrame';
import { BODY, type Gathered, type Rule } from './sheetRules';
import { makeBrackets, type Moving } from './sheetParts';

/** A panel standing for one element of the page's. */
export interface Node {
  element: Element;
  panel: Panel;
  /** where a lifted node stands: a panel over the whole screen placed on its parent's box each frame */
  anchor: Panel | null;
  /** the ring, the brackets and a painted picture, made as a rule first asks for them (drawn under what's in it) */
  ring: Panel | null;
  brackets: Panel | null;
  painted: Panel | null;
  /** its marks over its corners, drawn over what's in it */
  marks: Panel[];
  /** its words, where it's a line of text; its picture, where it's an SVG; its field, where it's a text field */
  line: RunLine | null;
  field: Field | null;
  /** its ticked box or slider, where it's one */
  control: Control | null;
  /** the words it stands for, where it's a run of words beside boxes in its parent (CSS's anonymous box: a label's
   *  words after its ticked box), its `element` then the parent's */
  words: Text | null;
  picture: Panel | null;
  kids: Node[];
  state: PressState;
  /** whether it takes the pointer, by its rules or what's round it */
  hits: boolean;
  /** whether it was made to scroll */
  scrolling: boolean;
  /** a `pre`'s lines, a panel each */
  kept: KeptText | null;
  /** its opacity and shift in their transition */
  moving: Moving | null;
  /** the layout's and the look's fields it was last given, so a field no rule gives now is taken back */
  given: { box: string[]; look: string[] };
  /** the rules that matched it, for the key they matched by */
  matched: { key: string; rules: Rule[] } | null;
}

/** Its marks, made after what's in it so drawn over it, and shown as its rules give them now. */
export function markNode(node: Node, marks: Gathered['marks']): void {
  while (node.marks.length > marks.length) node.marks.pop()!.remove();
  while (node.marks.length < marks.length) node.marks.push(new Panel(node.panel, { position: 'absolute' }));
  marks.forEach((mark, at) => {
    const panel = node.marks[at];
    const side = mark.dot?.side;
    const bar = mark.bar;
    panel.style({ inset: mark.inset, width: side ?? bar?.width, height: side ?? bar?.height });
    const barFill = typeof bar?.fill === 'function' ? bar.fill(node.element) : bar?.fill;
    panel.look({ fill: mark.dot?.fill ?? barFill, radius: side ? side / 2 : undefined });
    panel.say(mark.says ?? '', { ...BODY, ...mark.text });
  });
}

/** Its ring, its brackets and its painted picture, made as first asked for, shown as asked. */
export function decorate(node: Node, style: Gathered): void {
  // (the painted picture first, so under the ring: a slot's frame is drawn over its art, as `.slot.art::after`)
  const border = typeof style.box.border === 'number' ? style.box.border : 0;
  const w = (typeof style.box.width === 'number' ? style.box.width : 0) - border * 2;
  const h = (typeof style.box.height === 'number' ? style.box.height + 0 : w + border * 2) - border * 2;
  const painted = w > 0 ? style.paint?.(node.element, w, h) ?? null : null;
  if (painted && !node.painted) {
    node.painted = new Panel(node.panel, { position: 'absolute', inset: 0 }, { radius: style.look.radius });
  }
  node.painted?.show(!!painted);
  const [pw, ph] = painted?.size ?? [w, h];
  if (painted) node.painted!.picture(`painted ${painted.key} ${pw}x${ph}`, pw, ph, painted.paint);
  const ring = style.ring;
  if (ring && !node.ring) node.ring = new Panel(node.panel, { position: 'absolute', inset: 0, border: 1 });
  if (node.ring) {
    node.ring.show(!!ring);
    if (ring) node.ring.look({ border: ring, radius: node.panel.looked.radius });
  }
  if (style.brackets && !node.brackets) node.brackets = makeBrackets(node.panel);
  node.brackets?.show(style.brackets);
  if (style.brackets) for (const bar of node.brackets!.inside) bar.look({ fill: accent() });
}

/** Its SVG (itself, or the one in it) drawn as its stylesheet paints it, at `size` (px) or its own box's, turned
 *  `turn` degrees. */
export function drawPicture(node: Node, size: [number, number] | undefined, turn: number): void {
  const svg = node.element instanceof SVGSVGElement ? node.element : node.element.querySelector('svg');
  if (!svg) return;
  const [w, h] = size ?? [Number(svg.getAttribute('width')) || 16, Number(svg.getAttribute('height')) || 16];
  node.picture ??= new Panel(node.panel, { width: w, height: h, shrink: 0 });
  node.picture.style({ width: w, height: h });
  const { key, image } = svgArt(svg);
  if (!image) return;
  node.picture.picture(`sheet ${key} ${w}x${h} ${turn}`, w, h, (c) => {
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate((turn * Math.PI) / 180);
    c.drawImage(image, -w / 2, -h / 2, w, h);
    c.restore();
  });
}

/** Whether `element` is a field typed into: a text input or a text area (not a box ticked, a slider or a button). */
export function isField(element: Element): element is FieldInput {
  if (element instanceof HTMLTextAreaElement) return true;
  // (a ticked box and a slider are `formControls.ts`'s)
  return element instanceof HTMLInputElement && !NOT_TYPED.has(element.type);
}

/** the inputs that aren't typed into */
const NOT_TYPED = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'hidden']);

/** A placeholder's colour: its field's at half its opacity (the browser's own `::placeholder`), where it's `#rrggbb`. */
export function dimmed(color: string | undefined): string {
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color : INK;
  return alpha(hex, 0.5);
}

/** Every text field in `node` and what's in it stops following its input (taken away). */
export function stopFields(node: Node): void {
  node.field?.stop();
  for (const kid of node.kids) stopFields(kid);
}
