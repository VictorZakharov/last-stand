// The labels painted in a frame and sent to the atlas together (#973): each painted into a row of its shelf's height
// at its slot's own place along the shelf, and every run of slots side by side on a shelf sent in one copy as the
// frame is drawn (`sendPainted`). A slot sent alone as it was painted was a copy of its own: a guide's page is a
// label a word, some 950 of them, and the copies were 2 to 3 s of a walk through its pages (`lab guide`). New
// labels of one height take the slots after each other on their shelf, so a page's words go in a few copies.
import { overlayPaint } from '../../engine/overlay';

/** A slot of the atlas: its place and size (px). */
interface Box { x: number; y: number; w: number; h: number }

/** A row a shelf's labels are painted on, and the spans painted on it since it was last sent. */
interface Row {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  /** the shelf's top in the atlas (px) */
  shelf: number;
  /** each span painted since it was last sent: from, to (px along the shelf) */
  spans: [number, number][];
}

/** the least width of a row (px), doubled as one needs more */
const LEAST_WIDTH = 256;
/** the most rows kept, the longest unused let go past it (sent first): a row a shelf, as a slot given back and
 *  taken again may be on any shelf of its height, and a row a height sent its spans at every change of shelf,
 *  hundreds of copies a page again */
const MOST_ROWS = 64;

/** A canvas `w` by `h` on the CPU (drawn, copied and sent from the CPU: on the GPU each send waited on both). */
function cpuCanvas(w: number, h: number): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, c: canvas.getContext('2d', { willReadFrequently: true })! };
}

/** `need` rounded up to `LEAST_WIDTH` doubled, at most `most`. */
function widthFor(need: number, most: number): number {
  let width = LEAST_WIDTH;
  while (width < need) width *= 2;
  return Math.min(most, width);
}

/** The spans joined where they meet or overlap, in order along the shelf. */
function joined(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = runs[runs.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else runs.push([from, to]);
  }
  return runs;
}

/** The rows of an atlas `side` px square, its slots `gutter` px apart. */
export class AtlasRows {
  private rows = new Map<number, Row>();
  /** the row the label being painted is on, and its slot */
  private painting: { row: Row; slot: Box } | null = null;

  constructor(private readonly side: number, private readonly gutter: number) {}

  /** The context a label of `slot` is painted on, cleared over it and its gutter and held to it, and how far along
   *  it the slot starts (px: its art's own place, unscaled). */
  paint(slot: Box): { c: CanvasRenderingContext2D; x: number } {
    const row = this.rowFor(slot);
    const c = row.c;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(slot.x, 0, slot.w + this.gutter, slot.h + this.gutter);
    // (art painted past its slot would land in its neighbour's)
    c.beginPath();
    c.rect(slot.x, 0, slot.w, slot.h);
    c.clip();
    this.painting = { row, slot };
    return { c, x: slot.x };
  }

  /** The label painted on `slot` done: its span kept to send with the frame. */
  painted(slot: Box): void {
    const now = this.painting;
    this.painting = null;
    if (!now || now.slot !== slot) return;
    now.row.c.restore();
    const to = Math.min(this.side, slot.x + slot.w + this.gutter);
    now.row.spans.push([slot.x, to]);
  }

  /** Every span painted since the last, sent: a copy a run of slots side by side. */
  send(): void {
    for (const row of this.rows.values()) this.sendRow(row);
  }

  /** Every row let go, its spans unsent (the atlas emptied). */
  forget(): void {
    this.rows.clear();
  }

  /** The row for `slot`'s shelf, made or widened to reach it (its spans sent first), the last used. */
  private rowFor(slot: Box): Row {
    let row = this.rows.get(slot.y);
    const need = slot.x + slot.w + this.gutter;
    if (!row || row.canvas.width < need || row.canvas.height < slot.h + this.gutter) {
      if (row) this.sendRow(row);
      const made = cpuCanvas(widthFor(need, this.side), slot.h + this.gutter);
      row = { ...made, shelf: slot.y, spans: [] };
    }
    // (kept in the order used: the first is the longest unused)
    this.rows.delete(slot.y);
    this.rows.set(slot.y, row);
    if (this.rows.size > MOST_ROWS) this.letGoOldest();
    return row;
  }

  /** The longest unused row let go, its spans sent. */
  private letGoOldest(): void {
    const [shelf, row] = this.rows.entries().next().value!;
    this.sendRow(row);
    this.rows.delete(shelf);
  }

  /** `row`'s spans sent, a copy a run, each read where it was painted (copied to a canvas's top left first, every
   *  run was drawn twice on the CPU: 267 ms of a wave's run at wave 36). */
  private sendRow(row: Row): void {
    if (!row.spans.length) return;
    const h = Math.min(row.canvas.height, this.side - row.shelf);
    for (const [from, to] of joined(row.spans)) overlayPaint(row.canvas, from, 0, to - from, h, from, row.shelf);
    row.spans = [];
  }
}
