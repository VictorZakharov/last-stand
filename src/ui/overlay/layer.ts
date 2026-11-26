// The world's overlays, drawn by the game's renderer over the finished frame (`overFrame`): damage numbers, the
// foes' bars and names, the props' gauges, the dummies' meters, the lobby floor's item names, the partners' tags and
// a downed partner's marker. Each is a label painted with the canvas into the atlas (atlas.ts) when what it shows
// changes, and placed every frame where it shows; all of them are one draw. (As page elements over the canvas,
// moved every frame by a transform, Chrome repainted the page round them, and froze for seconds on Windows.)
import { G } from '../../state';
import { frameRect, overFrame } from '../../core/renderer';
import { OVERLAY_ROW, overlayRows } from '../../engine/overlay';
import { uiScales } from '../scale';
import { sendOutline } from './outline';
import {
  atlasCrowded, atlasSide, clearAtlas, fits, freeSlot, paintCanvas, takeSlot, uploadSlot, type Slot,
} from './atlas';

/**
 * What a label shows: its size and how to paint it there (its top left at the origin), in px of the UI's reference
 * layout, as the page's are: drawn at the UI's scale (ui/scale.ts), so it is the same share of any screen.
 */
export interface LabelArt {
  w: number;
  h: number;
  /** the point of it (px from its top left) placed on its anchor, where it isn't the label's own `ax`, `ay` share of
   *  its size: the bottom of a bar, as the page's box hung from its anchor, its shadows' room round it aside */
  anchor?: { x: number; y: number };
  /** `scale` is the canvas's pixels per px of the art, for what the context's transform doesn't scale (shadows) */
  paint(c: CanvasRenderingContext2D, scale: number): void;
}

/** Which labels are drawn over which: the floor's names lowest, a co-op ping's pin over the numbers, a downed partner's
 *  marker on top. */
export const ORDER = { floor: 0, bar: 1, tag: 2, float: 3, ping: 3.5, marker: 4 } as const;

/** A label over the world: placed each frame (`at`), painted when its art changes (`show`). */
export class Label {
  private art: LabelArt | null = null;
  slot: Slot | null = null;
  /** the canvas's pixels per px of its art it was last painted at (0: to paint), and the fonts' load it was painted
   *  with */
  painted = 0;
  paintedFonts = -1;
  /** the UI's scale it's drawn at: the HUD's, or the lobby's for what only the lobby shows (ui/scale.ts) */
  sizedBy: 'hud' | 'ui' = 'hud';
  /** where its anchor shows this frame (css px), and whether it shows at all */
  x = 0;
  y = 0;
  shown = false;
  /** how its box hangs off its anchor: fractions of its size (0.5, 1: centred above it) */
  ax = 0.5;
  ay = 1;
  alpha = 1;
  scale = 1;
  /** a label the pointer can pick (the floor's names) */
  pickable = false;
  /** its box on screen as last drawn (css px) */
  readonly box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(readonly order: number) {
    labels.add(this);
  }

  /** What it shows from now on: painted again before it's next drawn. */
  show(art: LabelArt): void {
    this.art = art;
    this.painted = 0;
  }

  get size(): { w: number; h: number } {
    return { w: this.art?.w ?? 0, h: this.art?.h ?? 0 };
  }

  /** The point of it placed on its anchor (px of its art from its top left, unscaled). */
  get anchorAt(): { x: number; y: number } {
    const { w, h } = this.size;
    return this.art?.anchor ?? { x: this.ax * w, y: this.ay * h };
  }

  /** Paints it into its slot at `ratio` canvas pixels per px of its art. */
  paint(ratio: number): void {
    const art = this.art;
    if (!art) return;
    const w = Math.ceil(art.w * ratio), h = Math.ceil(art.h * ratio);
    if (this.slot && !fits(this.slot, w, h)) {
      freeSlot(this.slot);
      this.slot = null;
    }
    this.slot ??= takeSlot(w, h);
    // (with no room in the atlas, painted next frame it's shown: marked painted, a co-op partner's tag that found the
    // atlas full of a fight's numbers wasn't drawn until its art next changed, its bar a step down)
    if (!this.slot) return;
    const c = paintCanvas(this.slot);
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    art.paint(c, ratio);
    // (painted only once it's in the engine's atlas: before the engine has started, painted again next frame)
    if (!uploadSlot(this.slot)) return;
    this.painted = ratio;
    this.paintedFonts = fontLoads;
  }

  /** Takes it off the screen for good, its slot given back. */
  remove(): void {
    labels.delete(this);
    if (this.slot) freeSlot(this.slot);
    this.slot = null;
  }
}

const labels = new Set<Label>();
/** times the page's fonts finished loading: a label painted before then is painted again in its font */
let fontLoads = 0;
if (typeof document !== 'undefined') document.fonts?.addEventListener('loadingdone', () => { fontLoads++; });

// --- drawing: a row a label, its box in canvas pixels, its slot's corners in the atlas and its share,
// handed to the engine, which draws them all in one call over its finished frame (engine/overlay.ts)
let rows = new Float32Array(64 * OVERLAY_ROW);
/** how many of `rows` this frame's labels fill */
let filled = 0;

/** the labels drawn last frame, in the order drawn (lowest first) */
let drawn: Label[] = [];

/** the most canvas pixels per px of a label's art the atlas was sized for */
let atlasRatio = 0;
/** The atlas emptied for every label to be painted again as it's next shown: at a new ratio (each takes a slot of
 *  another size, and the old sizes' shelves would stay taken: a move to another monitor changes the canvas's
 *  ratio, a resize the UI's scale), or packed again when it's full of slots given back. */
function restartAtlas(ratio: number): void {
  atlasRatio = ratio;
  clearAtlas(ratio);
  for (const l of labels) {
    l.slot = null;
    l.painted = 0;
  }
}

/** Every label where it shows now, painted where it changed, into this frame's draw (after the camera moved). */
export function layoutLabels(): void {
  const ratio = G.renderer.getPixelRatio();
  const most = ratio * Math.max(uiScales.hud, uiScales.ui);
  if (most !== atlasRatio || atlasCrowded()) restartAtlas(most);
  const side = atlasSide();
  drawn = [...labels].filter((l) => l.shown && l.alpha > 0.002 && l.size.w > 0).sort((a, b) => a.order - b.order);
  if (rows.length < drawn.length * OVERLAY_ROW) {
    rows = new Float32Array(2 ** Math.ceil(Math.log2(drawn.length + 1)) * OVERLAY_ROW);
  }
  let n = 0;
  for (const l of drawn) {
    const k = uiScales[l.sizedBy], paint = ratio * k;
    if (l.painted !== paint || l.paintedFonts !== fontLoads) l.paint(paint);
    const slot = l.slot;
    if (!slot) continue;
    const { w, h } = l.size;
    // (in canvas pixels; on whole pixels when it's drawn at its size, so each texel falls on one)
    const pw = Math.ceil(w * paint), ph = Math.ceil(h * paint);
    const a = l.anchorAt;
    let x = l.x * ratio - a.x * l.scale * paint, y = l.y * ratio - a.y * l.scale * paint;
    if (l.scale === 1) {
      x = Math.round(x);
      y = Math.round(y);
    }
    l.box.x = x / ratio;
    l.box.y = y / ratio;
    l.box.w = w * l.scale * k;
    l.box.h = h * l.scale * k;
    rows.set([x, y, pw * l.scale, ph * l.scale, slot.x / side, slot.y / side, (slot.x + pw) / side,
      (slot.y + ph) / side, l.alpha], n * OVERLAY_ROW);
    n++;
  }
  filled = n;
}

/** This frame's labels and outline handed to the engine, drawn over its frame from now on (none where `shown`
 *  is false: photo mode, the free camera's World labels off). */
function sendLabels(shown: boolean): void {
  const f = frameRect();
  overlayRows(rows, shown ? filled : 0, f.width, f.height);
  sendOutline(shown);
}
// (all of it the engine's: nothing is drawn on three's canvas, left out of the page's frame)
overFrame.labels = sendLabels;

/** The labels drawn last frame, lowest first (tools/lab's `ui` measures their boxes). */
export function drawnLabels(): readonly Label[] { return drawn; }

/** The topmost pickable label under a point of the page (css px), as last drawn. */
export function labelAt(x: number, y: number): Label | null {
  for (let i = drawn.length - 1; i >= 0; i--) {
    const l = drawn[i];
    if (!l.pickable) continue;
    const b = l.box;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return l;
  }
  return null;
}
