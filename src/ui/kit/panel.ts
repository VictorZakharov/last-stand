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
import { drawWrapped, wrapText, wrappedHeight, type TextAlign, type Wrapped } from './wrap';
import { engineCanvas } from '../../engine/index';
import { overFrame } from '../../core/renderer';
import {
  four, lookFloats, styleFloats, uiContent, uiMake, uiRect, uiRelook, uiRemove, uiRestyle, uiScreen,
  type Length, type PanelLook, type PanelStyle,
} from '../../engine/ui';

/** The UI's scale a panel is drawn at. */
export type Scaled = 'hud' | 'ui' | 'touch' | 'panes';

/** A line of text a panel shows: what it says and how, and how far its line's box reaches past the face's own each
 *  side (px: negative where its line height is shorter, as CSS's half-leading); or a picture (no style), `text` the
 *  key it's painted again by. */
interface Text {
  text: string;
  style: TextStyle | null;
  label: Label;
  w: number;
  h: number;
  reach: number;
  lead: number;
  /** how its lines stand where it wraps at its panel's width, and the lines it was last broken into */
  align: TextAlign | null;
  wrapped: Wrapped | null;
}

/** How a picture is painted: its top left at the origin, `scale` the canvas's pixels per px of it. */
export type Paint = (c: CanvasRenderingContext2D, scale: number) => void;

const panels = new Set<Panel>();
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
    this.parent = parent === null && !making ? layer(LAYERS.hud) : parent;
    this.styleNow = style;
    this.lookNow = look;
    this.parent?.children.add(this);
    panels.add(this);
    const k = this.scale();
    const before = placeBefore?.id ?? null;
    uiMake(this.id, this.parent?.id ?? null, before, styleFloats(style, k), lookFloats(this.fullLook(), k));
    this.writtenAt = k;
  }

  /** Its layout changed: `style`'s fields over those it had (nothing sent where none differs). */
  style(style: PanelStyle): this {
    if (!differs(this.styleNow, style)) return this;
    sent++;
    this.styleNow = { ...this.styleNow, ...style };
    uiRestyle(this.id, this.styleFloats());
    return this;
  }

  /** Its look changed: `look`'s fields over those it had (nothing sent where none differs). */
  look(look: PanelLook): this {
    if (!differs(this.lookNow, look)) return this;
    sent++;
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
    sent++;
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
    const wrapped = wrapText(text.text, style, width, text.align);
    const reach = text.reach;
    text.wrapped = wrapped;
    text.w = width;
    text.h = wrappedHeight(wrapped);
    const w = Math.ceil(width + reach * 2);
    const h = Math.ceil(text.h + reach * 2);
    text.label.show({ w, h, paint: (c, s) => drawWrapped(c, wrapped, reach, reach, style, s) });
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
    sent++;
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
    const seen = seenRound && (this.lookNow.opacity ?? 1) > 0 && this.styleNow.display !== 'none';
    this.refresh(ratio, seen);
    for (const child of this.children) child.refreshTree(ratio, seen);
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
      if (label.painted !== paint || !label.slot) {
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

/** The size a panel's text asks of its layout (px of the screen): a wrapped text asks for no width (its panel's is
 *  given it, and a width asked would hold the panel from narrowing as the window does), only its lines' height. */
function contentOf(text: Text, k: number): { w: number; h: number } {
  return { w: text.align ? 0 : text.w * k, h: text.h * k };
}

/** Whether any of `change`'s fields differs from `now`'s (a list or an object by its parts as text). */
/** Whether two texts' styles are alike field for field (their shadows by value). */
function sameStyle(a: TextStyle | null, b: TextStyle): boolean {
  if (a === b) return true;
  if (!a) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof TextStyle>;
  for (const key of keys) {
    const [was, now] = [a[key], b[key]];
    if (was === now) continue;
    if (Array.isArray(was) && Array.isArray(now) && JSON.stringify(was) === JSON.stringify(now)) continue;
    return false;
  }
  return true;
}

function differs<T extends object>(now: T, change: Partial<T>): boolean {
  for (const key of Object.keys(change) as (keyof T)[]) {
    const a = now[key];
    const b = change[key];
    if (a === b) continue;
    if (typeof a !== 'object' || typeof b !== 'object' || JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}

/** the panel the screen is, every other inside it (shown or not as a whole: photo mode leaves them out) */
let screen: Panel | null = null;
/** whether the screen's panel is being made (it alone is made on the engine's own screen) */
let making = false;

function screenPanel(): Panel {
  if (!screen) {
    making = true;
    screen = new Panel(null, { width: '100%', height: '100%', position: 'relative' });
    making = false;
  }
  return screen;
}

/** the layers' z of what's drawn in them, as the page's z-indices stood their elements: the touch controls under the
 *  HUD, the lobby's panels and the village's card over it, the modals over those, the tooltip over every one, and a
 *  dragged item's picture over all */
export const LAYERS = { touch: 8, hud: 10, lobby: 20, modal: 40, tooltip: 50, drag: 150 } as const;

/** the screen's layers by their z: what's in a higher one is drawn over what's in a lower, whenever it was made */
const layers = new Map<number, Panel>();
/** the sibling the panel being made goes before (a layer placed among the others), or none: at its parent's end */
let placeBefore: Panel | null = null;

/**
 * The screen's layer at `z` (CSS's z-index of what's in it: the HUD's 0, the lobby's 20, the modals' 40, the
 * tooltip's 50: `LAYERS`), made the first time it's asked for, among the others by its z. A panel made with no
 * parent goes in the HUD's. The screen's own children were drawn in the order they were made, and the HUD's bars, made again as a run
 * began, were drawn over the summary's backdrop.
 */
export function layer(z: number): Panel {
  const found = layers.get(z);
  if (found) return found;
  const above = [...layers.keys()].filter((other) => other > z).sort((a, b) => a - b)[0];
  placeBefore = above === undefined ? null : layers.get(above)!;
  // (as large as the screen, and laid out as it is: what was the screen's own child is the layer's alike)
  const made = new Panel(screenPanel(), { position: 'absolute', inset: 0 });
  placeBefore = null;
  layers.set(z, made);
  return made;
}

/** Every layer made so far, with its z. */
export const everyLayer = (): [number, Panel][] => [...layers.entries()];

const everyFrame = new Set<() => void>();
/** the frames the panels were brought up to date for */
let frames = 0;
/** how many changes panels have sent the engine (a style, a look, a text or a picture) */
let sent = 0;
/** How many changes panels have sent the engine so far: a tree that sent none in a frame has settled. */
export const kitSent = (): number => sent;
/** Which frame the panels are being brought up to date for: what's read once a frame is keyed by it. */
export const kitFrame = (): number => frames;
/** `tick` run before each frame's panels are brought up to date (an animation's step), until `stop` is called. */
export function onFrame(tick: () => void): () => void {
  everyFrame.add(tick);
  return () => everyFrame.delete(tick);
}

/** The ticks run before each frame, and how many panels there are: what the kit does each frame, for the lab's
 *  measure of its cost (`lab ui --cost`). */
export const frameTicks = (): ReadonlySet<() => void> => everyFrame;
export const panelCount = (): number => panels.size;

/** Every panel brought up to date before the engine's frame (the screen's size and ratio, each text painted), all
 *  of them shown or not. */
function refreshPanels(shown: boolean): void {
  const canvas = engineCanvas();
  if (!canvas) return;
  frames++;
  // (an animation's step may make the first panel, and the screen's with it)
  for (const tick of everyFrame) tick();
  if (!screen) return;
  uiScreen(innerWidth, innerHeight, canvas.width / Math.max(1, innerWidth));
  screen.show(shown);
  const ratio = G.renderer.getPixelRatio();
  for (const panel of panels) {
    if (!panel.parent) panel.refreshTree(ratio, true);
  }
}
overFrame.panels = refreshPanels;
overFrame.hidePanels = () => { screen?.show(false); };
