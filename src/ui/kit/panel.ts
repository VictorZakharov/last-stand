// A panel of the game's UI drawn by the engine (#973: the UI moved off the page; engine/ui.ts writes it, Bulwark's
// ui.rs lays it out): a box laid out as CSS's flexbox lays one out, in px of the UI's reference layout at a scale
// (the HUD's, the lobby's or the touch controls', ui/scale.ts), painted by its look, holding other panels, a line of
// text or a picture painted with the canvas (a skill's icon). Either is a
// label of the overlay's (painted into its atlas with the canvas, as the world's labels are, and painted again when
// the atlas is emptied), laid out by its text's box, its shadows reaching past it as CSS's do.
import { G } from '../../state';
import { uiScales } from '../scale';
import { atlasSide } from '../overlay/atlas';
import { Label } from '../overlay/layer';
import { drawText, measure, shadowReach, type TextStyle } from '../overlay/paint';
import { normalLine } from './lineHeight';
import { drawWrapped, wrapText, wrappedHeight, type TextAlign } from './wrap';
import { drawRuns, layRuns, runsReach, runsWidths } from './runLayout';
import { contentOf, type Text } from './panelText';
import type { Run } from './runs';
import { engineCanvas } from '../../engine/index';
import { scrolledOut } from './scrolledOut';
import { differs, sameStyle } from './panelCompare';
import { overFrame } from '../../core/renderer';
import { LAYERS, layer, makingScreen, placedBefore, screenNow } from './panelLayers';
export { LAYERS, everyLayer, layer } from './panelLayers';
import { beginFrame, beginPaints, countRemoved, countSent, mayPaint } from './kitCounts';
export { frameTicks, kitFrame, kitSent, labelsWaiting, onFrame, panelsRemoved } from './kitCounts';
import {
  four, lookFloats, styleFloats, uiContent, uiMake, uiRect, uiRelook, uiRemove, uiRestyle, uiScreen,
  type Length, type PanelLook, type PanelStyle,
} from '../../engine/ui';

/** The UI's scale a panel is drawn at. */
export type Scaled = 'hud' | 'ui' | 'touch' | 'panes';

/** How a picture is painted: its top left at the origin, `scale` the canvas's pixels per px of it. */
export type Paint = (c: CanvasRenderingContext2D, scale: number) => void;

const panels = new Set<Panel>();
/** the panels far out of a scrolling panel's view this frame, their texts' slots given back (`scrolledOut.ts`) */
let outOfView: Set<Panel> = new Set();
let nextId = 0;
/** the ids given back, for the next panel made */
const freeIds: number[] = [];

export class Panel {
  readonly id: number;
  private styleNow: PanelStyle;
  private lookNow: PanelLook;
  private text: Text | null = null;
  private readonly children = new Set<Panel>();
  /** the scale and canvas ratio its numbers were last written at, and its text painted at */
  private writtenAt = 0;
  private paintedAt = 0;
  private removed = false;

  readonly parent: Panel | null;

  /** A panel made inside `parent` (none: on the screen), laid out by `style` and painted by `look`. */
  constructor(parent: Panel | null, style: PanelStyle = {}, look: PanelLook = {},
    readonly scaled: Scaled = parent?.scaled ?? 'hud') {
    this.id = freeIds.pop() ?? nextId++;
    // (a panel made is a change: a tree that made one follows again the next frame, its layout read back then. Not
    // counted, a page written afresh had its boxes sized off a layout not yet made, and the tree settled with the
    // guide's tiles 0 px wide)
    countSent();
    this.parent = parent === null && !makingScreen() ? layer(LAYERS.hud) : parent;
    this.styleNow = style;
    this.lookNow = look;
    this.parent?.children.add(this);
    panels.add(this);
    const k = this.scale();
    const before = placedBefore()?.id ?? null;
    uiMake(this.id, this.parent?.id ?? null, before, styleFloats(style, k), lookFloats(this.fullLook(), k));
    this.writtenAt = k;
  }

  /** Its layout changed: `style`'s fields over those it had (nothing sent where none differs). */
  style(style: PanelStyle): this {
    if (!differs(this.styleNow, style)) return this;
    countSent();
    this.styleNow = { ...this.styleNow, ...style };
    uiRestyle(this.id, this.styleFloats());
    return this;
  }

  /** Its look changed: `look`'s fields over those it had (nothing sent where none differs). */
  look(look: PanelLook): this {
    if (!differs(this.lookNow, look)) return this;
    countSent();
    this.lookNow = { ...this.lookNow, ...look };
    uiRelook(this.id, lookFloats(this.fullLook(), this.scale()));
    return this;
  }

  /** Shown or not (`display: none`). */
  show(shown: boolean): this {
    const display = shown ? 'flex' : 'none';
    return this.styleNow.display === display ? this : this.style({ display });
  }

  /** It says `text` in `style` from now on (painted again only when either changed); nothing at all for '', laid
   *  out as CSS lays out an empty box (no line: as high as its padding and border). With `wrap`, its lines are
   *  broken at its own width inside its padding, standing as `wrap` says: that width is its parent's to give (a
   *  width, a share of the row, or stretched across a column), as its text asks for none. */
  say(text: string, style: TextStyle, wrap: TextAlign | null = null): this {
    if (text === '') return this.silence();
    // (by value: a sheet gives a new style each time it follows, and every text was measured and painted again)
    const same = this.text && this.text.text === text && sameStyle(this.text.style, style);
    if (same && this.text!.align === wrap) return this;
    countSent();
    if (wrap) return this.sayWrapped(text, style, wrap);
    const label = this.text?.label ?? new Label(0);
    const measured = measure(text, style);
    const reach = shadowReach(style);
    const w = Math.ceil(measured.w + reach * 2);
    const h = Math.ceil(measured.h + reach * 2);
    label.sizedBy = this.scaled;
    label.show({ w, h, paint: (c, s) => drawText(c, measured, reach, reach, style, s) });
    // (its line's box as the page's: its line height, or the font's normal one)
    const line = style.line ? style.line * style.size : normalLine(style);
    const lead = line ? (line - measured.h) / 2 : 0;
    const restyle = (this.text?.lead ?? 0) !== lead;
    this.text = { text, style, label, w: measured.w, h: measured.h, reach, lead, align: null, wrapped: null };
    this.paintedAt = 0;
    if (restyle) uiRestyle(this.id, this.styleFloats());
    return this;
  }

  /** It says `runs`, each word in its run's style, laid out at its width as one picture (`runLayout.ts`): broken
   *  into lines there where it `wraps`, standing as `align` says. It asks its one line's width of its layout and
   *  shrinks to its widest word where it wraps and `holdsWords` (CSS's max- and min-content), as tall as its lines
   *  at its width. */
  sayRuns(runs: Run[], align: TextAlign, wraps: boolean, holdsWords = true): this {
    if (!runs.length) return this.silence();
    const key = `${align} ${wraps} ${JSON.stringify(runs)}`;
    if (this.text?.runs && this.text.text === key) return this;
    countSent();
    const label = this.text?.label ?? new Label(0);
    label.sizedBy = this.scaled;
    const restyle = (this.text?.lead ?? 0) !== 0;
    const width = this.text?.wrapped?.width ?? 0;
    const { most, least } = runsWidths(runs);
    this.text = { text: key, style: runs[0].style, label, w: 0, h: 0, reach: runsReach(runs), lead: 0, align,
      wrapped: null, runs: { list: runs, wraps, most, least: wraps ? least : most } };
    this.wrapAt(width > 0 ? width : most);
    if (wraps && holdsWords && this.styleNow.minWidth !== least) this.style({ minWidth: least });
    // (no wider than its parent, as CSS fits a wrapping line to its box: its one line's width asked as a fixed size,
    // a column centring it never narrowed it, and the talk's name plate's "Brother Hollis" stood on one line past it)
    if (wraps && this.styleNow.maxWidth === undefined) this.style({ maxWidth: '100%' });
    if (restyle) uiRestyle(this.id, this.styleFloats());
    return this;
  }

  /** The least width its runs take (CSS's min-content: its widest word where it wraps, else all of it), px of the
   *  reference layout; 0 where it says none. */
  get leastWidth(): number {
    return this.text?.runs?.least ?? 0;
  }

  /** The width its wrapped text was last broken at (px of the reference layout; 0 before it's laid out). */
  get wrapWidth(): number {
    return this.text?.wrapped?.width ?? 0;
  }

  /** `say`'s text broken at its panel's width, as wide as that and as tall as its lines (`wrapAgain`). */
  private sayWrapped(text: string, style: TextStyle, align: TextAlign): this {
    const label = this.text?.label ?? new Label(0);
    label.sizedBy = this.scaled;
    const restyle = (this.text?.lead ?? 0) !== 0;
    const width = this.text?.wrapped?.width ?? 0;
    this.text = { text, style, label, w: 0, h: 0, reach: shadowReach(style), lead: 0, align, wrapped: null };
    this.wrapAt(width);
    if (restyle) uiRestyle(this.id, this.styleFloats());
    return this;
  }

  /** Its wrapped text broken again at `width` (px of the reference layout), its picture and size with it. */
  private wrapAt(width: number): void {
    const text = this.text;
    if (!text?.style || !text.align) return;
    const style = text.style;
    const reach = text.reach;
    text.wrapped = { width };
    text.w = width;
    let paint: Paint;
    if (text.runs) {
      const laid = layRuns(text.runs.list, width, text.align, text.runs.wraps);
      text.h = laid.height;
      paint = (c, s) => drawRuns(c, laid, reach, reach, s);
    } else {
      const wrapped = wrapText(text.text, style, width, text.align);
      text.h = wrappedHeight(wrapped);
      paint = (c, s) => drawWrapped(c, wrapped, reach, reach, style, s);
    }
    const w = Math.ceil(width + reach * 2);
    const h = Math.ceil(text.h + reach * 2);
    text.label.show({ w, h, paint });
    this.paintedAt = 0;
  }

  /** Its wrapped text broken again where its panel's width inside its padding and border has changed. */
  private wrapAgain(k: number): void {
    const text = this.text;
    if (!text?.align) return;
    const box = uiRect(this.id);
    if (!box) return;
    const [, right, , left] = four(this.styleNow.padding ?? 0);
    const [, edgeRight, , edgeLeft] = four(this.styleNow.border ?? 0);
    const sides = [right, left].reduce<number>((sum, side) => sum + (typeof side === 'number' ? side : 0), 0);
    const width = Math.max(0, box.w / k - sides - edgeRight - edgeLeft);
    if (Math.abs(width - (text.wrapped?.width ?? -1)) < 0.5) return;
    this.wrapAt(width);
  }

  /** It shows a picture `w` by `h` px painted by `paint`, laid out as an image is, and painted again only when
   *  `key` changes (a skill's icon in a state: `key` names both). */
  picture(key: string, w: number, h: number, paint: Paint): this {
    if (this.text && this.text.style === null && this.text.text === key) return this;
    countSent();
    const label = this.text?.label ?? new Label(0);
    label.sizedBy = this.scaled;
    label.show({ w, h, paint });
    const restyle = (this.text?.lead ?? 0) !== 0;
    this.text = { text: key, style: null, label, w, h, reach: 0, lead: 0, align: null, wrapped: null };
    this.paintedAt = 0;
    if (restyle) uiRestyle(this.id, this.styleFloats());
    return this;
  }

  /** Its layout as the engine takes it: its text's line height laid out as margins round the face's box. */
  private styleFloats(): Float32Array {
    const lead = this.text?.lead ?? 0;
    if (!lead) return styleFloats(this.styleNow, this.scale());
    const [top, right, bottom, left] = four(this.styleNow.margin ?? 0);
    const led = (side: Length) => (typeof side === 'number' ? side + lead : side);
    return styleFloats({ ...this.styleNow, margin: [led(top), right, led(bottom), left] }, this.scale());
  }

  /** It says nothing: its text's picture and size let go. */
  private silence(): this {
    if (!this.text) return this;
    this.text.label.remove();
    const led = this.text.lead !== 0;
    this.text = null;
    this.paintedAt = 0;
    uiContent(this.id, null);
    if (led) uiRestyle(this.id, this.styleFloats());
    uiRelook(this.id, lookFloats(this.fullLook(), this.scale()));
    return this;
  }

  /** Its box as it will be drawn next (css px), if it's shown. */
  rect(): { x: number; y: number; w: number; h: number } | null {
    return uiRect(this.id);
  }

  /** Whether it can be seen: it and every panel round it shown and with some opacity (`checkVisibility`'s). */
  /** Its opacity as drawn: its own times every panel's round it. */
  get opacity(): number {
    let opacity = 1;
    for (let panel: Panel | null = this; panel; panel = panel.parent) opacity *= panel.lookNow.opacity ?? 1;
    return opacity;
  }

  get seen(): boolean {
    for (let panel: Panel | null = this; panel; panel = panel.parent) {
      if ((panel.lookNow.opacity ?? 1) <= 0 || panel.styleNow.display === 'none') return false;
    }
    return true;
  }

  /** The panels inside it. */
  get inside(): readonly Panel[] {
    return [...this.children];
  }

  /** Its layout as it was last given. */
  get styled(): Readonly<PanelStyle> {
    return this.styleNow;
  }

  /** Its look as set now. */
  get looked(): Readonly<PanelLook> {
    return this.lookNow;
  }

  /** How far what's inside it is scrolled up (px of the reference layout). */
  get scrolled(): number {
    return this.lookNow.scroll ?? 0;
  }

  /** What it says, if anything (the lab reads it). */
  get said(): string {
    return this.text?.text ?? '';
  }

  /** Taken away, with every panel inside it. */
  remove(): void {
    // (taken away already, with a panel round it: its id may be another panel's now, which this would take away)
    if (this.removed) return;
    this.forget();
    uiRemove(this.id);
  }

  /** Whether it was taken away (its id may be another panel's now). */
  get gone(): boolean {
    return this.removed;
  }

  private forget(): void {
    this.removed = true;
    countRemoved();
    for (const child of [...this.children]) child.forget();
    this.text?.label.remove();
    this.parent?.children.delete(this);
    panels.delete(this);
    freeIds.push(this.id);
  }

  private scale(): number {
    return uiScales[this.scaled];
  }

  /** Its look with its text's picture in it. */
  private fullLook(): PanelLook {
    const slot = this.text?.label.slot;
    if (!this.text || !slot || !this.paintedAt) return this.lookNow;
    const side = atlasSide();
    const pw = Math.ceil(this.text.label.size.w * this.paintedAt);
    const ph = Math.ceil(this.text.label.size.h * this.paintedAt);
    const uv: [number, number, number, number] = [slot.x / side, slot.y / side, (slot.x + pw) / side,
      (slot.y + ph) / side];
    return { ...this.lookNow, picture: { uv, bleed: this.text.reach } };
  }

  /** Written again at the scale now, its text painted again where the atlas let it go or the ratio changed. */
  /** It and every panel inside it brought up to date, `seenRound` whether what's round it is seen: a text not seen
   *  gives its slot of the atlas back (painted, the pause menu's hidden tabs and every screen put away held their
   *  texts' slots, and opening the bug report twice filled the atlas: #973). */
  refreshTree(ratio: number, seenRound: boolean): void {
    const seen = this.seenIn(seenRound);
    this.refresh(ratio, seen);
    for (const child of this.children) child.refreshTree(ratio, seen);
  }

  /** Its texts not seen give their slots back, and those of every panel inside it: done for the whole screen before
   *  any is painted, so a page scrolled paints what came into view into the slots of what left it. */
  releaseTree(seenRound: boolean): void {
    const seen = this.seenIn(seenRound);
    if (!seen && this.text?.label.slot) {
      this.text.label.release();
      this.paintedAt = 0;
    }
    for (const child of this.children) child.releaseTree(seen);
  }

  /** Whether it's seen, `seenRound` whether what's round it is: shown, with some opacity, near its scroll's view. */
  private seenIn(seenRound: boolean): boolean {
    return seenRound && (this.lookNow.opacity ?? 1) > 0 && this.styleNow.display !== 'none' && !outOfView.has(this);
  }

  private refresh(ratio: number, seen: boolean): void {
    const k = this.scale();
    const text = this.text;
    let relook = false;
    if (text?.align) this.wrapAgain(k);
    if (text && !seen && text.label.slot) {
      text.label.release();
      this.paintedAt = 0;
    }
    if (text && seen) {
      const paint = ratio * k;
      const label = text.label;
      if ((label.painted !== paint || !label.slot) && mayPaint()) {
        label.paint(paint);
        if (label.painted === paint) {
          this.paintedAt = paint;
          uiContent(this.id, contentOf(text, k));
          relook = true;
        }
      }
    }
    if (this.writtenAt !== k) {
      this.writtenAt = k;
      uiRestyle(this.id, this.styleFloats());
      relook = true;
      if (text) uiContent(this.id, contentOf(text, k));
    }
    if (relook) uiRelook(this.id, lookFloats(this.fullLook(), k));
  }
}


export const panelCount = (): number => panels.size;

/** Every panel brought up to date before the engine's frame (the screen's size and ratio, each text painted), all
 *  of them shown or not. */
function refreshPanels(shown: boolean): void {
  const canvas = engineCanvas();
  if (!canvas) return;
  // (an animation's step may make the first panel, and the screen's with it)
  beginFrame();
  const screen = screenNow();
  if (!screen) return;
  uiScreen(innerWidth, innerHeight, canvas.width / Math.max(1, innerWidth));
  screen.show(shown);
  const ratio = G.renderer.getPixelRatio();
  outOfView = scrolledOut(panels);
  const roots = [...panels].filter((panel) => !panel.parent);
  for (const panel of roots) panel.releaseTree(true);
  beginPaints();
  for (const panel of roots) panel.refreshTree(ratio, true);
}
overFrame.panels = refreshPanels;
overFrame.hidePanels = () => { screenNow()?.show(false); };
