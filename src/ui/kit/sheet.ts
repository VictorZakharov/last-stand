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
import { Panel, onFrame, type Scaled } from './panel';
import { standIn, type PressState } from './press';
import { forwards, unforward, type Forwarded } from './forward';
import { engineCanvas } from '../../engine/index';
import { RunLine, runsOf, type RunStyle } from './runs';
import { svgArt } from './svgArt';
import { scrolls } from './scroll';
import { uiScales } from '../scale';
import { accent } from '../diagFrame';
import { BODY, SKIPPED, aroundKey, isText, now, ownKey, whole, type Gathered, type Rule, type Sheet,
  type SheetText } from './sheetRules';
import { gather, makeBrackets, step, type Moving } from './sheetParts';
import type { PanelStyle } from '../../engine/ui';
import type { TextStyle } from '../overlay/paint';

export type { Dyn, Painted, Rule, Sheet, SheetText } from './sheetRules';

/** A panel standing for one element of the page's. */
interface Node {
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
  /** its words, where it's a line of text; its picture, where it's an SVG */
  line: RunLine | null;
  picture: Panel | null;
  kids: Node[];
  state: PressState;
  /** whether it takes the pointer, by its rules or what's round it */
  hits: boolean;
  /** whether it was made to scroll */
  scrolling: boolean;
  /** its opacity and shift in their transition */
  moving: Moving | null;
  /** the layout's and the look's fields it was last given, so a field no rule gives now is taken back */
  given: { box: string[]; look: string[] };
  /** the rules that matched it, for the key they matched by */
  matched: { key: string; rules: Rule[] } | null;
}

/** A screen of the page's drawn by the kit, following its element each frame. */
export class SheetTree implements Forwarded {
  readonly root: Node;
  /** the panel over the whole screen a lifted node stands in, made after the root's so drawn over it */
  private readonly top: Panel;
  private readonly stop: () => void;

  /** `element` (kept out of sight) drawn by `sheet` in a panel inside `parent` (none: on the screen), its px those
   *  of `scaled`; `base` the text it starts from. */
  constructor(element: Element, private readonly sheet: Sheet, private readonly scaled: Scaled,
    parent: Panel | null = null, private readonly base: TextStyle = BODY) {
    const room = parent ?? new Panel(null, { position: 'absolute', inset: 0 }, {}, scaled);
    this.root = this.make(element, room);
    this.top = new Panel(null, { position: 'absolute', inset: 0 }, {}, scaled);
    standIn(element, this.root.panel);
    this.stop = onFrame(() => this.follow(this.root, this.base, aroundKey(element), false, null));
    forwards(this);
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
      node.state = hovered ? (pressed && node.element.contains(pressed) ? 'down' : 'hover') : 'none';
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
    unforward(this);
    this.root.panel.remove();
    this.top.remove();
  }

  private make(element: Element, parent: Panel): Node {
    const panel = new Panel(parent, {});
    const node: Node = { element, panel, anchor: null, ring: null, brackets: null, painted: null, marks: [], line: null,
      picture: null, kids: [], state: 'none', hits: false, scrolling: false, moving: null,
      given: { box: [], look: [] }, matched: null };
    // (each element's box read where it's drawn: the lab's, the tutorial's ring's)
    standIn(element, panel);
    return node;
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
    const element = node.element;
    const key = `${parentKey}>${ownKey(element)}`;
    const style = gather(this.rulesOf(node, key), element, round?.panel ?? null, node.state, around);
    node.hits = style.hits ?? hitsRound;
    if (style.scrolls && !node.scrolling) {
      node.scrolling = true;
      scrolls(node.panel);
    }
    // (said each frame, shown too: a style keeps the fields it isn't given, and a card hidden once stayed hidden)
    const hidden = (element as HTMLElement).hidden || element.classList.contains('hidden');
    if (hidden) style.box.display = 'none';
    style.box.display ??= 'flex';
    this.move(node, style);
    if (style.lift) this.lift(node, round, style.box.display !== 'none');
    if (node.hits) style.look.hits = true;
    node.panel.style(whole(style.box, node.given.box));
    node.panel.look(whole(style.look, node.given.look));
    node.given = { box: Object.keys(style.box), look: Object.keys(style.look) };
    if (style.box.display === 'none') return;
    this.decorate(node, style);
    if (style.picture || element instanceof SVGSVGElement) this.drawPicture(node, style.picture, style.turn);
    else if (isText(element) && !(style.flex && element.children.length)) this.sayText(node, style.text, style.after);
    else this.followKids(node, style.text, key, node.hits);
    this.mark(node, style.marks);
  }

  /** Its marks, made after what's in it so drawn over it, and shown as its rules give them now. */
  private mark(node: Node, marks: Gathered['marks']): void {
    while (node.marks.length > marks.length) node.marks.pop()!.remove();
    while (node.marks.length < marks.length) node.marks.push(new Panel(node.panel, { position: 'absolute' }));
    marks.forEach((mark, at) => {
      const panel = node.marks[at];
      const side = mark.dot?.side;
      panel.style({ inset: mark.inset, width: side, height: side });
      panel.look({ fill: mark.dot?.fill, radius: side ? side / 2 : undefined });
      panel.say(mark.says ?? '', { ...BODY, ...mark.text });
    });
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

  /** Its ring, its brackets and its painted picture, made as first asked for, shown as asked. */
  private decorate(node: Node, style: Gathered): void {
    // (the painted picture first, so under the ring: a slot's frame is drawn over its art, as `.slot.art::after`)
    const border = typeof style.box.border === 'number' ? style.box.border : 0;
    const w = (typeof style.box.width === 'number' ? style.box.width : 0) - border * 2;
    const h = (typeof style.box.height === 'number' ? style.box.height + 0 : w + border * 2) - border * 2;
    const painted = w > 0 ? style.paint?.(node.element, w, h) ?? null : null;
    if (painted && !node.painted) {
      node.painted = new Panel(node.panel, { position: 'absolute', inset: 0 }, { radius: style.look.radius });
    }
    node.painted?.show(!!painted);
    if (painted) node.painted!.picture(`painted ${painted.key} ${w}x${h}`, w, h, painted.paint);
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

  /** Its words as styled runs, each inline element in it styled by its rules. */
  private sayText(node: Node, text: TextStyle & SheetText, after: Rule['after']): void {
    node.line ??= new RunLine(node.panel);
    const runs = runsOf(node.element, text, (inline, outer) => {
      if (inline.classList.contains('hidden') || (inline as HTMLElement).hidden) return null;
      let style: RunStyle = { ...outer };
      for (const rule of this.sheet) {
        if (rule.when && !rule.when()) continue;
        if (rule.text && inline.matches(rule.at)) style = { ...style, ...now(rule.text, inline, node.panel) };
      }
      return style;
    });
    if (after) runs.push({ text: after.says, style: { ...text, ...after.text } });
    node.line.set(runs);
    const align = text.align === 'center' ? 'center' : text.align === 'end' ? 'end' : 'start';
    node.line.panel.style({ justify: align });
  }

  /** Its SVG (itself, or the one in it) drawn as its stylesheet paints it, at `size` (px) or its own box's, turned
   *  `turn` degrees. */
  private drawPicture(node: Node, size: [number, number] | undefined, turn: number): void {
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

  /** Its elements' panels, made again where the markup changed. */
  private followKids(node: Node, text: TextStyle, key: string, hits: boolean): void {
    const elements = [...node.element.children].filter((child) => !SKIPPED.has(child.tagName.toUpperCase()));
    const same = elements.length === node.kids.length && elements.every((child, at) => node.kids[at].element === child);
    if (!same) {
      for (const kid of node.kids) {
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
