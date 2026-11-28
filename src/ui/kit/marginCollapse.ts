// Margins collapsed as CSS collapses them in a block's flow (#973): two blocks one under the other stand the larger
// of the bottom and top margins between them apart, not their sum, and a block's first or last child's margin goes
// through it where nothing (a padding, a border, a height) stands between. The kit lays a block out as a flex column,
// whose items' margins add: the guide's page, a paragraph's 6 px over a row's 6 px, stood 12 px apart where the
// page's stood 6, and a page of them a sixth taller than main's (`lab ui --states guideKeys --ab`).

/** A box of a block's flow: its own margins (top, bottom; null where they're not plain lengths), whether it's in the
 *  flow (not placed apart, not hidden), and, where it's a block its children's margins go through, which of its
 *  ends keep them in (a padding, a border, a height). Its collapsed margins are written on it: `outer`, what it shows
 *  round it, its children's let through; `given`, what its panel is given. */
export interface FlowBox {
  own: [number, number] | null;
  inFlow: boolean;
  /** a block whose own children's margins may go through its top and bottom (CSS's `display: block`, not starting
   *  a flow of its own: no scroll, no flex) */
  through: boolean;
  closedTop: boolean;
  closedBottom: boolean;
  outer?: [number, number];
  given?: [number, number] | null;
}

/** Two margins that meet, as one: the largest of the positive ones and the most negative of the negative. */
export function joined(a: number, b: number): number {
  return Math.max(a, b, 0) + Math.min(a, b, 0);
}

/** `kids`' margins collapsed in `parent`'s flow (siblings' between them, the first's and last's through `parent`
 *  where it lets them), each kid's `given` written, and `parent`'s `outer`. `flows` whether `parent` is a block whose
 *  children are a flow (CSS's block or list item, a scrolling block too): a flex box's children's margins add. */
export function collapseKids(parent: FlowBox, kids: FlowBox[], flows: boolean): void {
  const flowing = kids.filter((kid) => kid.inFlow);
  for (const kid of kids) kid.given = kid.own && kid.outer ? [kid.outer[0], kid.outer[1]] : null;
  parent.outer = parent.own ? [parent.own[0], parent.own[1]] : undefined;
  if (!flows) return;
  // (the bottom margin of the box before, which the next one's top meets; none after a box of no plain margins)
  let before: number | null = null;
  for (const kid of flowing) {
    if (!kid.given) {
      before = null;
      continue;
    }
    if (before !== null) kid.given[0] = joined(before, kid.given[0]) - before;
    before = kid.given[1];
  }
  if (!parent.through || !parent.outer) return;
  const first = flowing[0];
  const last = flowing[flowing.length - 1];
  if (first?.given && !parent.closedTop) {
    parent.outer[0] = joined(parent.outer[0], first.given[0]);
    first.given[0] = 0;
  }
  if (last?.given && !parent.closedBottom) {
    parent.outer[1] = joined(parent.outer[1], last.given[1]);
    last.given[1] = 0;
  }
}
