// A line of styled runs (#973: the page's inline markup, a bold name or a coloured number in a line of plain words):
// each word a text panel of its own in a row that wraps, as CSS breaks a paragraph at its spaces. `runsOf` reads the
// runs off an element of the page's, each inline element's style given by the port (as its SCSS gives it).
import { Panel } from './panel';
import type { PanelStyle } from '../../engine/ui';
import type { TextStyle } from '../overlay/paint';

/** A run's style: its text's, and whether it's never broken (CSS's `white-space: nowrap`). */
export interface RunStyle extends TextStyle {
  whole?: boolean;
  /** the line broken after it (CSS's block or a flex column's item: a rail button's icon over its word) */
  block?: boolean;
}

/** a word standing for a run's line break */
const BREAK = '\n';

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
function wordsOf(runs: Run[]): Run[] {
  return runs.flatMap((run) => {
    const words = (run.style.whole ? [run] : run.text.split(/(?<= )/))
      .map((piece) => (typeof piece === 'string' ? { text: piece, style: run.style } : piece));
    return run.style.block ? [...words, { text: BREAK, style: run.style }] : words;
  });
}

/** A row of words that wraps at its width: set from runs, its panels made or taken away as their count changes. */
export class RunLine {
  readonly panel: Panel;
  private words: Panel[] = [];
  private said = '';

  constructor(parent: Panel, style: PanelStyle = {}) {
    this.panel = new Panel(parent, { direction: 'row', wrap: true, alignItems: 'baseline', ...style });
  }

  /** The line saying `runs` (nothing done where it says them already). */
  set(runs: Run[]): this {
    const said = JSON.stringify(runs);
    if (said === this.said) return this;
    this.said = said;
    const words = wordsOf(runs);
    while (this.words.length > words.length) this.words.pop()!.remove();
    while (this.words.length < words.length) this.words.push(new Panel(this.panel, { shrink: 0 }));
    words.forEach((word, at) => {
      const broken = word.text === BREAK;
      // (a break is a row's whole width and no height, so the next word starts a line of its own)
      this.words[at].style({ basis: broken ? '100%' : undefined, height: broken ? 0 : undefined });
      this.words[at].say(broken ? '' : word.text, word.style);
    });
    return this;
  }

  /** The line's words' text, as one string. */
  get text(): string {
    return (JSON.parse(this.said || '[]') as Run[]).map((run) => run.text).join('');
  }
}
