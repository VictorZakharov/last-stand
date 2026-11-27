// A screen of the page's drawn by the kit as a typed style sheet (#973: the lobby's and the menus' screens, whose markup
// is many elements written by the game's code): each rule of the SCSS ported rule for rule, keyed by its own selector
// (`Rule.at`, matched by the page's `Element.matches`, so `.seg button.active` or `#vcard[data-page="pvp"]` mean what
// they meant), its declarations as the kit's layout, look and text. A `SheetTree` follows an element of the page's,
// kept out of sight (`.kit-mirror`), each frame: a panel for each element, its text as styled runs, its buttons pressed
// on the engine's canvas (`press.ts`). The game's code writes the page's markup as before.
//
// What CSS does that a rule says by hand: text's inheritance (`text` passes down the tree, as CSS's font and colour
// do), an inset ring (`box-shadow: inset 0 0 0 1px`: `ring`), the ornamented frame's corner brackets (`brackets`), a
// button's `:hover` (`hover`, its `filter: brightness()` as `lit`), an SVG icon (`picture`). The cascade is the sheet's
// order: a later rule wins, so a port lists its rules as the SCSS's specificity orders them.
import { Panel, onFrame, type Scaled } from './panel';
import { standIn, type PressState } from './press';
import { forwards, unforward, type Forwarded } from './forward';
import { engineCanvas } from '../../engine/index';
import { RunLine, runsOf, type RunStyle } from './runs';
import { svgArt } from './svgArt';
import { scrolls } from './scroll';
import type { PanelLook, PanelStyle } from '../../engine/ui';
import type { TextStyle } from '../overlay/paint';
import { INK } from './theme';
import { accent } from '../diagFrame';

/** A value given as it is, or read as each frame needs it (a class's accent). */
export type Dyn<T> = T | (() => T);

/** A text's style as a rule gives it: the parts it sets, and how its lines stand in their box (`text-align`). */
export type SheetText = Partial<RunStyle> & { align?: 'start' | 'center' | 'end' };

/** One rule of a screen's style sheet. */
export interface Rule {
  /** the SCSS rule's selector, matched by the page's own `matches` */
  at: string;
  /** whether it applies now (its `@media`'s query: a short screen's), always where none */
  when?: () => boolean;
  /** its layout (not inherited) */
  box?: Dyn<PanelStyle>;
  /** laid out as CSS's flex or grid (`display: flex`): what's in it is boxes, never runs of a line of text */
  flex?: boolean;
  /** it and all in it take the pointer (CSS's `pointer-events: auto` on a box the page's `.kit-mirror` turns off):
   *  the pointer's events over them are the page's elements' (`forward.ts`), none of the world's */
  hits?: boolean;
  /** what's in it scrolls (`overflow-y: auto`): the wheel and a finger's drag move it (`scroll.ts`) */
  scrolls?: boolean;
  /** words after its own (CSS's `::after` with `content`), in their style */
  after?: { says: string; text?: SheetText };
  /** its look (not inherited) */
  look?: Dyn<PanelLook>;
  /** its text's style, inherited by everything inside it as CSS inherits font and colour */
  text?: Dyn<SheetText>;
  /** a ring drawn just inside its border (CSS's `box-shadow: inset 0 0 0 1px colour`) */
  ring?: Dyn<string>;
  /** the ornamented frame's line and corner brackets inside it (`::before` with `corner-brackets`) */
  brackets?: boolean;
  /** an SVG in it drawn as a picture this size (px), as its stylesheet paints it */
  picture?: [number, number];
  /** what changes while the pointer's over it or pressing it (CSS's `:hover`; `lit`: `filter: brightness()`) */
  hover?: { look?: PanelLook; text?: SheetText; lit?: number };
}

/** A screen's style sheet: its rules in the cascade's order. */
export type Sheet = readonly Rule[];

/** what CSS lays out inline: an element of these in a text's line is a run of it, not a box of its own */
const INLINE = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'SMALL', 'S', 'A', 'KBD', 'CODE', 'BR', 'ABBR', 'TIME']);
/** what's never drawn */
const SKIPPED = new Set(['TEMPLATE', 'SCRIPT', 'STYLE', 'DEFS']);
/** the text every tree starts from (the page's body: its face, the browser's 16 px, the theme's ink) */
const BODY: TextStyle = { face: 'body', size: 16, color: INK };

/** `fields` with each of `before` it hasn't now given back as none (a style keeps the fields it isn't given). */
function whole<T extends object>(fields: T, before: string[]): T {
  const out: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
  for (const key of before) {
    if (!(key in out)) out[key] = undefined;
  }
  return out as T;
}

/** A panel standing for one element of the page's. */
interface Node {
  element: Element;
  panel: Panel;
  /** the ring and the brackets, made as a rule first asks for them (drawn under what's in it) */
  ring: Panel | null;
  brackets: Panel | null;
  /** its words, where it's a line of text; its picture, where it's an SVG */
  line: RunLine | null;
  picture: Panel | null;
  kids: Node[];
  state: PressState;
  /** whether it takes the pointer, by its rules or what's round it */
  hits: boolean;
  /** whether it was made to scroll */
  scrolling: boolean;
  /** the layout's and the look's fields it was last given, so a field no rule gives now is taken back */
  given: { box: string[]; look: string[] };
  /** the rules that matched it, for the key they matched by */
  matched: { key: string; rules: Rule[] } | null;
}

/** The value of `value` now. */
const now = <T>(value: Dyn<T>): T => (typeof value === 'function' ? (value as () => T)() : value);

/** Whether `element` is a line of text: words of its own, or only inline elements in it. */
function isText(element: Element): boolean {
  let words = false;
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()) words = true;
    else if (child instanceof Element && !INLINE.has(child.tagName) && !SKIPPED.has(child.tagName.toUpperCase())) {
      return false;
    }
  }
  return words || [...element.children].some((child) => INLINE.has(child.tagName) && child.textContent?.trim());
}

/** What an element's rules depend on: its own name, classes and attributes (the `style` aside). */
function ownKey(element: Element): string {
  let key = element.tagName;
  for (const attribute of element.attributes) {
    if (attribute.name !== 'style') key += ` ${attribute.name}=${attribute.value}`;
  }
  if ((element as HTMLButtonElement).disabled) key += ' :disabled';
  return key;
}

/** `colour` brightened `by`, as CSS's `brightness()` filter on it (a `#rrggbb`, `rgb()` or `rgba()`). */
function lit(colour: string, by: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  const parts = hex
    ? [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16)).concat(1)
    : (/rgba?\(([^)]+)\)/.exec(colour)?.[1].split(',').map(Number) ?? null);
  if (!parts) return colour;
  const [r, g, b] = parts.slice(0, 3).map((value) => Math.min(255, Math.round(value * by)));
  return `rgba(${r},${g},${b},${parts[3] ?? 1})`;
}

/** `look` brightened `by` (its fills and its border). */
function litLook(look: PanelLook, by: number): PanelLook {
  const fill = look.fill;
  const lighter = Array.isArray(fill) ? [lit(fill[0], by), lit(fill[1], by)] as [string, string]
    : fill ? lit(fill, by) : fill;
  return { ...look, fill: lighter, border: look.border ? lit(look.border, by) : look.border };
}

/** A screen of the page's drawn by the kit, following its element each frame. */
export class SheetTree implements Forwarded {
  readonly root: Node;
  private readonly stop: () => void;

  /** `element` (kept out of sight) drawn by `sheet` in a panel inside `parent` (none: on the screen), its px those
   *  of `scaled`; `base` the text it starts from. */
  constructor(element: Element, private readonly sheet: Sheet, scaled: Scaled, parent: Panel | null = null,
    private readonly base: TextStyle = BODY) {
    this.root = this.make(element, parent ?? new Panel(null, { position: 'absolute', inset: 0 }, {}, scaled));
    standIn(element, this.root.panel);
    this.stop = onFrame(() => this.follow(this.root, this.base, '', false));
    forwards(this);
  }

  /** The deepest element taking the pointer drawn under (`x`, `y`) css px (the last drawn of those that meet). */
  elementAt(x: number, y: number): Element | null {
    const under = (node: Node): Element | null => {
      if (!node.panel.seen) return null;
      const box = node.panel.rect();
      const inside = !!box && x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;
      // (what's in a box may reach past it, unless it's cut there)
      if (!inside && node.panel.styled.overflow && node.panel.styled.overflow !== 'visible') return null;
      for (let at = node.kids.length - 1; at >= 0; at--) {
        const found = under(node.kids[at]);
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
  }

  private make(element: Element, parent: Panel): Node {
    const panel = new Panel(parent, {});
    const node: Node = { element, panel, ring: null, brackets: null, line: null, picture: null, kids: [],
      state: 'none', hits: false, scrolling: false, given: { box: [], look: [] }, matched: null };
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

  /** `node` brought up to its element's markup and classes, its text from `around` (its parent's). */
  private follow(node: Node, around: TextStyle & { align?: SheetText['align'] }, parentKey: string,
    hitsRound: boolean): void {
    const element = node.element;
    const key = `${parentKey}>${ownKey(element)}`;
    const rules = this.rulesOf(node, key);
    node.hits = hitsRound;
    const box: PanelStyle = { direction: element instanceof HTMLButtonElement ? 'row' : 'column' };
    if (element instanceof HTMLButtonElement) Object.assign(box, { alignItems: 'center', justify: 'center' });
    let look: PanelLook = {};
    let text: TextStyle & { align?: SheetText['align'] } = { ...around };
    let ring: string | undefined;
    let brackets = false;
    let picture: [number, number] | undefined;
    let flex = false;
    let after: Rule['after'];
    for (const rule of rules) {
      if (rule.when && !rule.when()) continue;
      if (rule.box) Object.assign(box, now(rule.box));
      if (rule.flex !== undefined) flex = rule.flex;
      if (rule.after) after = rule.after;
      if (rule.hits !== undefined) node.hits = rule.hits;
      if (rule.scrolls && !node.scrolling) {
        node.scrolling = true;
        scrolls(node.panel);
      }
      if (rule.look) look = { ...look, ...now(rule.look) };
      if (rule.text) text = { ...text, ...now(rule.text) };
      if (rule.ring) ring = now(rule.ring);
      if (rule.brackets) brackets = true;
      if (rule.picture) picture = rule.picture;
      if (rule.hover && node.state !== 'none') {
        if (rule.hover.look) look = { ...look, ...rule.hover.look };
        if (rule.hover.text) text = { ...text, ...rule.hover.text };
        if (rule.hover.lit) look = litLook(look, rule.hover.lit);
      }
    }
    // (said each frame, shown too: a style keeps the fields it isn't given, and a card hidden once stayed hidden)
    const hidden = (element as HTMLElement).hidden || element.classList.contains('hidden');
    if (hidden) box.display = 'none';
    box.display ??= 'flex';
    if (node.hits) look.hits = true;
    node.panel.style(whole(box, node.given.box));
    node.panel.look(whole(look, node.given.look));
    node.given = { box: Object.keys(box), look: Object.keys(look) };
    if (box.display === 'none') return;
    this.decorate(node, ring, brackets);
    if (picture || element instanceof SVGSVGElement) {
      this.drawPicture(node, picture);
      return;
    }
    if (isText(element) && !(flex && element.children.length)) {
      this.sayText(node, text, after);
      return;
    }
    this.followKids(node, text, key, node.hits);
  }

  /** Its ring and its brackets, made as first asked for, shown as asked. */
  private decorate(node: Node, ring: string | undefined, brackets: boolean): void {
    if (ring && !node.ring) {
      node.ring = new Panel(node.panel, { position: 'absolute', inset: 0, border: 1 });
    }
    if (node.ring) {
      node.ring.show(!!ring);
      if (ring) node.ring.look({ border: ring, radius: node.panel.looked.radius });
    }
    if (brackets && !node.brackets) node.brackets = makeBrackets(node.panel);
    node.brackets?.show(brackets);
    if (brackets) for (const bar of node.brackets!.inside) bar.look({ fill: accent() });
  }

  /** Its words as styled runs, each inline element in it styled by its rules. */
  private sayText(node: Node, text: TextStyle & SheetText, after: Rule['after']): void {
    node.line ??= new RunLine(node.panel);
    const runs = runsOf(node.element, text, (inline, outer) => {
      if (inline.classList.contains('hidden') || (inline as HTMLElement).hidden) return null;
      let style: RunStyle = { ...outer };
      for (const rule of this.sheet) {
        if (rule.when && !rule.when()) continue;
        if (rule.text && inline.matches(rule.at)) style = { ...style, ...now(rule.text) };
      }
      return style;
    });
    if (after) runs.push({ text: after.says, style: { ...text, ...after.text } });
    node.line.set(runs);
    const align = text.align === 'center' ? 'center' : text.align === 'end' ? 'end' : 'start';
    node.line.panel.style({ justify: align });
  }

  /** Its SVG (itself, or the one in it) drawn as its stylesheet paints it, at `size` (px) or its own box's. */
  private drawPicture(node: Node, size: [number, number] | undefined): void {
    const svg = node.element instanceof SVGSVGElement ? node.element : node.element.querySelector('svg');
    if (!svg) return;
    const [w, h] = size ?? [Number(svg.getAttribute('width')) || 16, Number(svg.getAttribute('height')) || 16];
    node.picture ??= new Panel(node.panel, { width: w, height: h, shrink: 0 });
    node.picture.style({ width: w, height: h });
    const { key, image } = svgArt(svg);
    if (!image) return;
    node.picture.picture(`sheet ${key} ${w}x${h}`, w, h, (c) => c.drawImage(image, 0, 0, w, h));
  }

  /** Its elements' panels, made again where the markup changed. */
  private followKids(node: Node, text: TextStyle, key: string, hits: boolean): void {
    const elements = [...node.element.children].filter((child) => !SKIPPED.has(child.tagName.toUpperCase()));
    const same = elements.length === node.kids.length && elements.every((child, at) => node.kids[at].element === child);
    if (!same) {
      for (const kid of node.kids) kid.panel.remove();
      node.kids = elements.map((child) => this.make(child, node.panel));
    }
    for (const kid of node.kids) this.follow(kid, text, key, hits);
  }
}

/** the ornamented frame's inner line (`inset: 6px`, 1 px of the frame at .22) and its brackets (26 by 2 px, accent) */
const BRACKET_INSET = 6;
const BRACKET_LONG = 26;
const BRACKET_THICK = 2;

/** The frame's line and its corner brackets inside `panel` (CSS's `::before` with `corner-brackets`). */
function makeBrackets(panel: Panel): Panel {
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
