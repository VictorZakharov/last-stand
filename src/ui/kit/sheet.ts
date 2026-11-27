// A screen of the page's drawn by the kit as a typed style sheet (#973: the lobby's and the menus' screens, whose markup
// is many elements written by the game's code): each rule of the SCSS ported rule for rule, keyed by its own selector
// (`Rule.at` in `sheetRules.ts`, matched by the page's `Element.matches`, so `.seg button.active` or
// `#vcard[data-page="pvp"]` mean what they meant), its declarations as the kit's layout, look and text. A `SheetTree`
// follows an element of the page's, kept out of sight (`.kit-mirror`), each frame: a panel for each element, its text
// as styled runs, its SVG icons as pictures, and the pointer's events over it told to the page's element drawn there
// (`forward.ts`). The game's code writes the page's markup and listens to its events as before.
//
// What CSS does that a rule says by hand: text's inheritance (`text` passes down the tree, as CSS's font and colour
// do), an inset ring (`ring`), the ornamented frame's corner brackets (`brackets`), a `:hover` (`hover`), a transition
// (`ease`, `shift`), a looping animation of the opacity (`pulse`), a `z-index` over later siblings (`lift`). The
// cascade is the sheet's order: a later rule wins, so a port lists its rules as the SCSS's specificity orders them.
import { KeptText } from './keptText';
import { decorate, dimmed, drawPicture, isField, markNode, stopFields, type Node } from './sheetNode';
import { environmentChanged, takeMutations, watchTree } from './sheetDirty';
import { Panel, kitSent, onFrame, type Scaled } from './panel';
import { standIn } from './press';
import { forwards, unforward, type Forwarded } from './forward';
import { engineCanvas } from '../../engine/index';
import { RunLine, runsOf, type RunStyle } from './runs';
import { textField, type FieldInput } from './field';
import { isSlider, isTicked, slider, tickBox } from './formControls';
import { scrolls } from './scroll';
import { uiScales } from '../scale';
import { BODY, SKIPPED, aroundKey, isText, now, ownKey, whole, type Gathered, type Rule, type Sheet,
  type SheetText } from './sheetRules';
import { gather, step } from './sheetParts';
import type { PanelStyle } from '../../engine/ui';
import type { TextStyle } from '../overlay/paint';

export type { Dyn, Painted, Rule, Sheet, SheetText } from './sheetRules';


/** A screen of the page's drawn by the kit, following its element each frame. */
export class SheetTree implements Forwarded {
  readonly root: Node;
  /** the panel over the whole screen a lifted node stands in, made after the root's so drawn over it */
  private readonly top: Panel;
  private readonly stop: () => void;
  /** whether a rule reads an inline style (`[style*=...]`): the elements' keys then hold their styles */
  private readonly styled: boolean;
  /** the rules each inline element in a line matched, for the key it matched by */
  private readonly inlineMatched = new WeakMap<Element, { key: string; rules: Rule[] }>();
  /** whether it follows its element this frame (`sheetDirty.ts`: told so as what it reads changes) */
  private dirty = true;
  private readonly forget: () => void;
  /** its nodes with a box ticked or a slider, followed every frame (code sets `checked` and `value` unannounced) */
  private readonly controlled = new Set<Node>();

  /** `element` (kept out of sight) drawn by `sheet` in a panel inside `parent` (none: on the screen), its px those
   *  of `scaled`; `base` the text it starts from. */
  constructor(element: Element, private readonly sheet: Sheet, private readonly scaled: Scaled,
    parent: Panel | null = null, private readonly base: TextStyle = BODY) {
    this.styled = sheet.some((rule) => rule.at.includes('[style'));
    const room = parent ?? new Panel(null, { position: 'absolute', inset: 0 }, {}, scaled);
    this.root = this.make(element, room);
    // (after the root in its room, so drawn over it)
    this.top = new Panel(room, { position: 'absolute', inset: 0 }, {}, scaled);
    standIn(element, this.root.panel);
    this.stop = onFrame(() => this.tick());
    this.forget = watchTree({ element, again: () => { this.dirty = true; } });
    forwards(this);
  }

  /** A frame: its element followed where something it reads may have changed, and again the frame after one that
   *  sent the engine anything (a layout read back, an easing), until one sends nothing; else its controls alone. */
  private tick(): void {
    takeMutations();
    if (!this.dirty && !environmentChanged()) {
      for (const node of this.controlled) node.control!.follow();
      return;
    }
    this.dirty = false;
    const before = kitSent();
    this.follow(this.root, this.base, aroundKey(this.root.element), false, null);
    if (kitSent() !== before) this.dirty = true;
  }

  /** The deepest element taking the pointer drawn under (`x`, `y`) css px (the last drawn of those that meet). */
  elementAt(x: number, y: number): Element | null {
    const under = (node: Node): Element | null => {
      if (!node.panel.seen || (node.anchor && !node.anchor.seen)) return null;
      const box = node.panel.rect();
      const inside = !!box && x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;
      // (what's in a box may reach past it, unless it's cut there)
      if (!inside && node.panel.styled.overflow && node.panel.styled.overflow !== 'visible') return null;
      // (the lifted first, drawn over the rest)
      const order = [...node.kids].sort((a, b) => Number(!!b.anchor) - Number(!!a.anchor) || 0);
      for (let at = order.length - 1; at >= 0; at--) {
        const found = under(order[at]);
        if (found) return found;
      }
      return inside && node.hits ? node.element : null;
    };
    return under(this.root);
  }

  /** Each node shown as the pointer stands: over it or what's in it (CSS's `:hover`), pressing it (`:active`). */
  hovers(over: Element | null, pressed: Element | null): void {
    const show = (node: Node): void => {
      const hovered = !!over && node.element.contains(over);
      const state = hovered ? (pressed && node.element.contains(pressed) ? 'down' : 'hover') : 'none';
      if (state !== node.state) this.dirty = true;
      node.state = state;
      for (const kid of node.kids) show(kid);
    };
    show(this.root);
    const canvas = engineCanvas();
    if (canvas && over && this.root.element.contains(over)) {
      const hand = over.closest('button:not(:disabled), [draggable="true"], a, label, select');
      canvas.style.cursor = hand ? 'var(--cursor-hand)' : '';
    }
  }

  /** The panel standing for the screen's element. */
  get panel(): Panel {
    return this.root.panel;
  }

  /** Taken away, the page's element left as it is. */
  remove(): void {
    this.stop();
    this.forget();
    this.uncontrol(this.root);
    stopFields(this.root);
    unforward(this);
    this.root.panel.remove();
    this.top.remove();
  }

  private make(made: Element | Text, parent: Panel): Node {
    const panel = new Panel(parent, {});
    const words = made instanceof Text ? made : null;
    const element = words ? words.parentElement! : (made as Element);
    const node: Node = { element, panel, anchor: null, ring: null, brackets: null, painted: null, marks: [], line: null,
      field: null, control: null, words, kept: null, picture: null, kids: [], state: 'none', hits: false, scrolling: false,
      moving: null, given: { box: [], look: [] }, matched: null };
    // (each element's box read where it's drawn: the lab's, the tutorial's ring's; a run of words stands for none)
    if (!words) standIn(element, panel);
    return node;
  }

  /** A run of words beside boxes, in the text round it, its spaces at either end dropped as CSS's are there. */
  private sayWords(node: Node, around: TextStyle & SheetText, hitsRound: boolean): void {
    node.hits = hitsRound;
    node.panel.look({ hits: hitsRound || undefined });
    node.line ??= new RunLine(node.panel);
    const text = (node.words!.textContent ?? '').replace(/\s+/g, ' ').trim();
    node.line.set([{ text, style: around }]);
  }

  /** The rules matching `node`'s element, found again only as its key (its and its ancestors') changes. */
  private rulesOf(node: Node, key: string): Rule[] {
    if (node.matched?.key === key) return node.matched.rules;
    const rules = this.sheet.filter((rule) => node.element.matches(rule.at));
    node.matched = { key, rules };
    return rules;
  }

  /** `node` brought up to its element's markup and classes, its text from `around` (its parent's), inside `round`. */
  private follow(node: Node, around: TextStyle & SheetText, parentKey: string, hitsRound: boolean,
    round: Node | null): void {
    if (node.words) {
      this.sayWords(node, around, hitsRound);
      return;
    }
    const element = node.element;
    const key = `${parentKey}>${ownKey(element, this.styled)}`;
    const style = gather(this.rulesOf(node, key), element, round?.panel ?? null, node.state, around);
    node.hits = style.hits ?? hitsRound;
    if (style.scrolls && !node.scrolling) {
      node.scrolling = true;
      scrolls(node.panel);
    }
    // (said each frame, shown too: a style keeps the fields it isn't given, and a card hidden once stayed hidden)
    const hidden = (element as HTMLElement).hidden || element.classList.contains('hidden')
      || (element as HTMLElement).style?.display === 'none';
    if (hidden) style.box.display = 'none';
    // (claimed again while it shows: an element moved to another tree and back, as the duel's ask into the rack's card
    // and out, kept the other's stand-in, and the lab read the card's page round it)
    else standIn(element, node.panel);
    style.box.display ??= 'flex';
    this.move(node, style);
    if (style.lift) this.lift(node, round, style.box.display !== 'none');
    if (node.hits) style.look.hits = true;
    node.panel.style(whole(style.box, node.given.box));
    node.panel.look(whole(style.look, node.given.look));
    node.given = { box: Object.keys(style.box), look: Object.keys(style.look) };
    if (style.box.display === 'none') return;
    decorate(node, style);
    if (style.picture || element instanceof SVGSVGElement) drawPicture(node, style.picture, style.turn);
    else if (isField(element)) this.fieldOf(node, element, style.text);
    else if (isTicked(element) || isSlider(element)) {
      node.control ??= isTicked(element) ? tickBox(node.panel, element) : slider(node.panel, element);
      this.controlled.add(node);
      node.control.follow();
    }
    else if (element.tagName === 'PRE') this.sayKept(node, style.text);
    else if (isText(element) && !(style.flex && element.children.length)) this.sayText(node, style.text, style.after,
      style.before, style.says);
    else this.followKids(node, style.text, key, node.hits);
    markNode(node, style.marks);
  }

  /** Its text field, made the first time it shows, its words in `text` (its placeholder dimmed) where its rules
   *  stand them (`text-align`). */
  private fieldOf(node: Node, input: FieldInput, text: TextStyle & SheetText): void {
    if (node.field) return;
    const placeholder = { ...text, color: dimmed(text.color) };
    node.field = textField(node.panel, input, text, placeholder, true);
    const justify = text.align === 'center' ? 'center' : text.align === 'end' ? 'end' : 'start';
    node.panel.style({ justify });
  }

  /** Its opacity and shift stepped in their transition, a pulse laid over: written into its look and its layout. */
  private move(node: Node, style: Gathered): void {
    const opacity = style.look.opacity ?? 1;
    if (!style.ease && !style.pulse && !node.moving && !style.shift[0] && !style.shift[1]) return;
    node.moving ??= { opacity, shift: style.shift, at: 0 };
    const moved = step(node.moving, opacity, style.shift, style.ease, style.pulse);
    style.look.opacity = moved.opacity;
    const [across, down] = moved.shift;
    if (!across && !down) return;
    const box: PanelStyle = style.box;
    if (box.position === 'absolute') {
      const inset = Array.isArray(box.inset) && box.inset.length === 4 ? [...box.inset] : null;
      if (inset && typeof inset[0] === 'number') inset[0] += down;
      if (inset && typeof inset[3] === 'number') inset[3] += across;
      if (inset) box.inset = inset as PanelStyle['inset'];
      return;
    }
    box.position = 'relative';
    box.inset = [down, 'auto', 'auto', across];
  }

  /** A lifted node's anchor: over the whole screen, on its parent's box (css px as this screen's px). */
  private lift(node: Node, round: Node | null, shown: boolean): void {
    if (!node.anchor) {
      node.anchor = new Panel(this.top, { position: 'absolute' });
      const panel = new Panel(node.anchor, {});
      node.panel.remove();
      node.panel = panel;
      standIn(node.element, panel);
      node.given = { box: [], look: [] };
    }
    const box = round?.panel.rect();
    const k = uiScales[this.scaled];
    node.anchor.show(shown && !!box && !!round?.panel.seen);
    if (!box) return;
    node.anchor.style({ inset: [box.y / k, 'auto', 'auto', box.x / k], width: box.w / k, height: box.h / k });
  }

  /** A `pre`'s words as they are, its line breaks kept and its lines wrapped at its width (`white-space: pre-wrap`). */
  private sayKept(node: Node, text: TextStyle & SheetText): void {
    const align = text.align === 'center' ? 'center' : text.align === 'end' ? 'right' : 'left';
    node.kept ??= new KeptText(node.panel);
    node.kept.set(node.element.textContent ?? '', text, align);
  }

  /** The rules giving `inline`'s text in `node`'s line, found again only as its key or its line's changes
   *  (matched every frame, each run's every rule was a tenth of the pause menu's frame). */
  private inlineRules(inline: Element, node: Node): Rule[] {
    const key = `${node.matched?.key ?? ''}>${ownKey(inline, this.styled)}`;
    const kept = this.inlineMatched.get(inline);
    if (kept?.key === key) return kept.rules;
    const rules = this.sheet.filter((rule) => rule.text && inline.matches(rule.at));
    this.inlineMatched.set(inline, { key, rules });
    return rules;
  }

  /** Its words as styled runs, each inline element in it styled by its rules. */
  private sayText(node: Node, text: TextStyle & SheetText, after: Rule['after'], before?: Rule['before'],
    says?: string): void {
    node.line ??= new RunLine(node.panel);
    const runs = says !== undefined ? [{ text: says, style: text }] : runsOf(node.element, text, (inline, outer) => {
      if (inline.classList.contains('hidden') || (inline as HTMLElement).hidden) return null;
      let style: RunStyle = { ...outer };
      for (const rule of this.inlineRules(inline, node)) {
        if (rule.when && !rule.when()) continue;
        style = { ...style, ...now(rule.text!, inline, node.panel) };
      }
      return style;
    });
    if (after) runs.push({ text: after.says, style: { ...text, ...after.text } });
    if (before) runs.unshift({ text: before.says, style: { ...text, ...before.text } });
    node.line.set(runs);
    const align = text.align === 'center' ? 'center' : text.align === 'end' ? 'end' : 'start';
    node.line.panel.style({ justify: align });
  }

  /** Its controls and those inside it no longer followed (taken away). */
  private uncontrol(node: Node): void {
    this.controlled.delete(node);
    for (const kid of node.kids) this.uncontrol(kid);
  }

  /** Its elements' panels, made again where the markup changed. */
  private followKids(node: Node, text: TextStyle, key: string, hits: boolean): void {
    // (its elements, and any words of its own beside them, each a box)
    const elements = [...node.element.childNodes].filter((child): child is Element | Text => child instanceof Text
      ? !!child.textContent?.trim()
      : child instanceof Element && !SKIPPED.has(child.tagName.toUpperCase())
        && !this.sheet.some((rule) => rule.apart && child.matches(rule.at)));
    const same = elements.length === node.kids.length
      && elements.every((child, at) => (node.kids[at].words ?? node.kids[at].element) === child);
    if (!same) {
      for (const kid of node.kids) {
        this.uncontrol(kid);
        stopFields(kid);
        kid.panel.remove();
        kid.anchor?.remove();
      }
      node.kids = elements.map((child) => this.make(child, node.panel));
      // (its marks made again after them, to stay over them)
      for (const mark of node.marks.splice(0)) mark.remove();
    }
    for (const kid of node.kids) this.follow(kid, text, key, hits, node);
  }
}
