// A sheet's boxes laid out as CSS lays them where the kit's flexbox doesn't by itself: a line of words fitted to its
// box (`fitText`), and blocks with their margins collapsed as CSS's flow collapses them (`marginCollapse.ts`), inside
// a panel whose rule says `blocks` (the guide's page): each node's own margins read off its style before it's sent,
// given the collapsed ones its parent worked out the frame before (so a frame that changes nothing sends nothing), and
// its children's collapsed once they're followed.
import { four, type Length, type PanelStyle } from '../../engine/ui';
import { collapseKids, type FlowBox } from './marginCollapse';
import type { Node } from './sheetNode';

/** A node's place in a block's flow: its box, its element's CSS display (read once), its margins' sides across. */
export interface NodeFlow extends FlowBox {
  display: string;
  across: [Length, Length];
  /** its own margins as last read, so the collapsed ones are given again only while they stand */
  ownKey: string;
}

/** CSS displays whose children are a flow (their margins collapse), and those whose children's go through them. */
const FLOWS = new Set(['block', 'list-item', 'flow-root']);
const THROUGH = new Set(['block', 'list-item']);

/** A side of a padding or a border that keeps a child's margin in. */
const closes = (length: unknown): boolean => length !== 0 && length !== undefined;

/** `node`'s place in its flow read off `box` (its style, about to be sent), its margin replaced by the collapsed one
 *  its parent gave it while its own stand as they were; `scrolls` whether it scrolls (a flow of its own). */
export function flowOf(node: Node, box: PanelStyle, scrolls: boolean): void {
  const display = node.flow?.display ?? getComputedStyle(node.element).display;
  const [top, right, bottom, left] = four(box.margin ?? 0);
  const plain = typeof top === 'number' && typeof bottom === 'number';
  const own: [number, number] | null = plain ? [top, bottom] : null;
  const ownKey = `${top} ${bottom}`;
  const padding = four(box.padding ?? 0);
  const border = four(box.border ?? 0);
  const given = node.flow?.ownKey === ownKey ? node.flow.given : null;
  node.flow = {
    display, own, ownKey, across: [right, left], given,
    inFlow: box.position !== 'absolute' && box.display !== 'none',
    through: THROUGH.has(display) && !scrolls,
    closedTop: closes(padding[0]) || closes(border[0]),
    closedBottom: closes(padding[2]) || closes(border[2]) || box.height !== undefined,
    outer: own ?? undefined,
  };
  if (given) box.margin = [given[0], right, given[1], left];
}

/** The words beside boxes in a flow: a box of no margins (CSS's anonymous block). */
const WORDS: FlowBox = { own: [0, 0], inFlow: true, through: false, closedTop: true, closedBottom: true,
  outer: [0, 0] };
/** A child not followed yet: no margins known, so none collapse across it. */
const UNKNOWN: FlowBox = { own: null, inFlow: true, through: false, closedTop: true, closedBottom: true };

/** `node`'s children's margins collapsed in its flow, each given its collapsed ones where they changed. */
export function collapseFlow(node: Node): void {
  const flow = node.flow;
  if (!flow) return;
  const boxes = node.kids.map((kid) => kid.flow ?? (kid.words ? { ...WORDS } : { ...UNKNOWN }));
  collapseKids(flow, boxes, FLOWS.has(flow.display));
  node.kids.forEach((kid, at) => {
    const given = boxes[at].given;
    if (!kid.flow || !given) return;
    kid.flow.given = given;
    kid.panel.style({ margin: [given[0], kid.flow.across[0], given[1], kid.flow.across[1]] });
  });
}

/** How much of a box's width its padding and border take across it (px; a share of its parent's counted as none). */
function acrossOf(box: PanelStyle): number {
  const padding = four(box.padding ?? 0);
  const border = four(box.border ?? 0);
  const px = (length: unknown): number => (typeof length === 'number' ? length : 0);
  return px(padding[1]) + px(padding[3]) + px(border[1]) + px(border[3]);
}

/**
 * A line of words' own box fitted as CSS fits one: no wider than its parent, and narrowed in a row down to its
 * widest word, or all of it where it doesn't wrap (a tab's), with its padding and border. Its line's one line's width
 * is asked as a fixed size, so a column centring it never narrowed it (the talk's name plate's "Brother Hollis" stood
 * on one line past the plate), a row never shrank it (the guide's "Daze, freeze and other effects" past its entry),
 * and with a least width of 0 a tab shrank into its padding. The line's least width is as it was last said: a frame
 * late the first time, the line made after its box.
 */
export function fitText(node: Node, box: PanelStyle): void {
  box.maxWidth ??= '100%';
  if (node.line) box.minWidth ??= node.line.least + acrossOf(box);
}
