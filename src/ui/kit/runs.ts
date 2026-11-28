// A line of styled runs (#973: the page's inline markup, a bold name or a coloured number in a line of plain words):
// one panel whose picture is its runs laid out at its width (`runLayout.ts`), broken as CSS breaks a paragraph at its
// spaces. `runsOf` reads the runs off an element of the page's, each inline element's style given by the port (as
// its SCSS gives it).
import { Panel } from './panel';
import type { PanelStyle } from '../../engine/ui';
import type { TextStyle } from '../overlay/paint';
import type { TextAlign } from './wrap';

/** A run's style: its text's, and whether it's never broken (CSS's `white-space: nowrap`). */
export interface RunStyle extends TextStyle {
  whole?: boolean;
  /** the line broken after it (CSS's block or a flex column's item: a rail button's icon over its word) */
  block?: boolean;
  /** a long word broken after its dots and signs too (CSS's `overflow-wrap: anywhere`: an email address, which
   *  otherwise reached past its box) */
  anywhere?: boolean;
}

/** what a `<br>` says: a character of no width, so its run's line can end after it */
const LINE_BREAK = '​';

/** a word standing for a run's line break */
export const BREAK = '\n';

/** A run of text in one style. */
export interface Run { text: string; style: RunStyle }

/** An inline element's style, from the style it's in; null leaves it (and all in it) out. */
export type StyleOf = (element: Element, around: RunStyle) => RunStyle | null;

/** `element`'s text as runs, its spaces collapsed as CSS collapses them, each inline element styled by `styleOf`. */
export function runsOf(element: Element, base: RunStyle, styleOf: StyleOf): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node, style: RunStyle): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        runs.push({ text: child.textContent ?? '', style });
      } else if (child instanceof Element && child.tagName === 'BR') {
        // (a line break: a word of no width that ends its line)
        runs.push({ text: LINE_BREAK, style: { ...style, block: true } });
      } else if (child instanceof Element) {
        const own = styleOf(child, style);
        if (own) walk(child, own);
      }
    }
  };
  walk(element, base);
  return collapsed(runs);
}

/** Runs with each stretch of white space one space, none at the line's ends, and empty runs left out. */
function collapsed(runs: Run[]): Run[] {
  const text = runs.map((run) => run.text.replace(/\s+/g, ' '));
  // (a space after a space, across runs, is none)
  for (let at = 1; at < text.length; at++) {
    if (text[at - 1].endsWith(' ') && text[at].startsWith(' ')) text[at] = text[at].slice(1);
  }
  if (text.length) {
    text[0] = text[0].trimStart();
    text[text.length - 1] = text[text.length - 1].trimEnd();
  }
  return runs.map((run, at) => ({ text: text[at], style: run.style })).filter((run) => run.text.length > 0);
}

/** The words of `runs`, each with the space after it, in its run's style (a run kept whole, one piece). */
export function wordsOf(runs: Run[]): Run[] {
  return runs.flatMap((run) => {
    const breaks = run.style.anywhere ? /(?<=[ .@_-])/ : /(?<= )/;
    const words = (run.style.whole ? [run] : run.text.split(breaks))
      .map((piece) => (typeof piece === 'string' ? { text: piece, style: run.style } : piece));
    return run.style.block ? [...words, { text: BREAK, style: run.style }] : words;
  });
}

/** How a line's words stand along it, from a flex row's `justify` (CSS's `text-align` on a line of words). */
function alignOf(justify: PanelStyle['justify']): TextAlign {
  if (justify === 'center') return 'center';
  if (justify === 'end') return 'right';
  return 'left';
}

/** A line of runs that wraps at its width (none where its style says `wrap: false`), its words standing as its
 *  `justify` says: one panel, its picture the runs laid out at its width (`Panel.sayRuns`). */
export class RunLine {
  readonly panel: Panel;
  private runs: Run[] = [];
  private align: TextAlign;
  private readonly wraps: boolean;
  /** whether it narrows no further than its widest word (none where its style gives a least width of its own) */
  private readonly holdsWords: boolean;

  constructor(parent: Panel, style: PanelStyle = {}) {
    const { justify, wrap, ...rest } = style;
    this.panel = new Panel(parent, rest);
    this.align = alignOf(justify);
    this.wraps = wrap !== false;
    this.holdsWords = style.minWidth === undefined;
  }

  /** The line saying `runs` (nothing done where it says them already). */
  set(runs: Run[]): this {
    this.runs = runs;
    this.panel.sayRuns(runs, this.align, this.wraps, this.holdsWords);
    return this;
  }

  /** Its words standing as a flex row's `justify` says (CSS's `text-align`). */
  justify(justify: PanelStyle['justify']): this {
    const align = alignOf(justify);
    if (align === this.align) return this;
    this.align = align;
    this.panel.sayRuns(this.runs, align, this.wraps, this.holdsWords);
    return this;
  }

  /** The least width it takes (its widest word where it wraps, else all of it). */
  get least(): number {
    return this.panel.leastWidth;
  }

  /** The line's words' text, as one string. */
  get text(): string {
    return this.runs.map((run) => run.text).join('');
  }
}
