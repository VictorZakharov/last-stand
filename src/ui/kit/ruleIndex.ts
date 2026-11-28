// A sheet's rules found by what their selectors' last parts name (#973): an element is tested against the rules whose
// last compound names its id, one of its classes or its tag, and those that name none of them (`*`, `:is(...)`, an
// attribute alone), never against every rule. Every rule tested on every element was 0.9 s of a walk through the
// guide's pages (`Element.matches`, `lab guide --profile`): a hero's page is some 2,000 elements, its sheet 300 rules.
import type { Rule, Sheet } from './sheet';

/** What a selector's last compound names, the first of its id, a class or its tag; none where it names none. */
type Named = { id: string } | { cls: string } | { tag: string } | null;

/** `text` split where `by` says, outside brackets and parentheses. */
function topLevel(text: string, by: (char: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (depth === 0 && by(char)) {
      parts.push(text.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

/** `compound` with what's inside its brackets and parentheses taken out (`:not(.x)` names nothing it must have). */
function outerOf(compound: string): string {
  let depth = 0;
  let out = '';
  for (const char of compound) {
    if (char === '(' || char === '[') depth++;
    if (depth === 0) out += char;
    if (char === ')' || char === ']') depth--;
  }
  return out;
}

/** What `selector`'s last compound names. */
function namedBy(selector: string): Named {
  const compounds = topLevel(selector.trim(), (char) => char === ' ' || char === '>' || char === '+' || char === '~')
    .filter((part) => part.trim());
  const last = outerOf(compounds[compounds.length - 1] ?? '');
  const id = /#([\w-]+)/.exec(last)?.[1];
  if (id) return { id };
  const cls = /\.([\w-]+)/.exec(last)?.[1];
  if (cls) return { cls };
  const tag = /^([a-zA-Z][\w-]*)/.exec(last)?.[1];
  return tag ? { tag: tag.toUpperCase() } : null;
}

/** A sheet's rules by what their selectors' last parts name. */
export class RuleIndex {
  private byId = new Map<string, number[]>();
  private byClass = new Map<string, number[]>();
  private byTag = new Map<string, number[]>();
  private any: number[] = [];
  /** each kind of element's rules to test (by its tag, id and classes) */
  private known = new Map<string, Rule[]>();

  constructor(private readonly sheet: Sheet) {
    sheet.forEach((rule, index) => this.add(rule, index));
  }

  /** The rules that may match `element`, in the sheet's order: test each with `matches`. */
  candidates(element: Element): Rule[] {
    const kind = `${element.tagName}#${element.id}.${element.getAttribute('class') ?? ''}`;
    let rules = this.known.get(kind);
    if (!rules) {
      rules = this.gather(element);
      this.known.set(kind, rules);
    }
    return rules;
  }

  /** The rules matching `element`, in the sheet's order. */
  matching(element: Element): Rule[] {
    return this.candidates(element).filter((rule) => element.matches(rule.at));
  }

  /** `rule`, the sheet's `index`th, filed under what each of its selectors names. */
  private add(rule: Rule, index: number): void {
    for (const selector of topLevel(rule.at, (char) => char === ',')) {
      const named = namedBy(selector);
      if (!named) this.file(this.any, index);
      else if ('id' in named) this.file(this.listIn(this.byId, named.id), index);
      else if ('cls' in named) this.file(this.listIn(this.byClass, named.cls), index);
      else this.file(this.listIn(this.byTag, named.tag), index);
    }
  }

  /** The list under `key` in `map`, made if there's none. */
  private listIn(map: Map<string, number[]>, key: string): number[] {
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    return list;
  }

  /** `index` put in `list` once. */
  private file(list: number[], index: number): void {
    if (list[list.length - 1] !== index) list.push(index);
  }

  /** The rules filed under what `element` has, in the sheet's order. */
  private gather(element: Element): Rule[] {
    const indices = new Set<number>(this.any);
    const add = (list: number[] | undefined): void => list?.forEach((index) => indices.add(index));
    if (element.id) add(this.byId.get(element.id));
    add(this.byTag.get(element.tagName.toUpperCase()));
    for (const cls of element.classList) add(this.byClass.get(cls));
    return [...indices].sort((a, b) => a - b).map((index) => this.sheet[index]);
  }
}
