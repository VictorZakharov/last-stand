// A panel of the game's UI drawn by the engine (#973: the UI moved off the page; engine/ui.ts writes it, Bulwark's
// ui.rs lays it out): a box laid out as CSS's flexbox lays one out, in px of the UI's reference layout at a scale
// (the HUD's or the lobby's, ui/scale.ts), painted by its look, holding other panels or a line of text. A text is a
// label of the overlay's (painted into its atlas with the canvas, as the world's labels are, and painted again when
// the atlas is emptied), laid out by its text's box, its shadows reaching past it as CSS's do.
import { G } from '../../state';
import { uiScales } from '../scale';
import { atlasSide } from '../overlay/atlas';
import { Label } from '../overlay/layer';
import { drawText, measure, shadowReach, type TextStyle } from '../overlay/paint';
import { normalLine } from './lineHeight';
import { engineCanvas } from '../../engine/index';
import { overFrame } from '../../core/renderer';
import {
  four, lookFloats, styleFloats, uiContent, uiMake, uiRect, uiRelook, uiRemove, uiRestyle, uiScreen,
  type Length, type PanelLook, type PanelStyle,
} from '../../engine/ui';

/** The UI's scale a panel is drawn at. */
export type Scaled = 'hud' | 'ui';

/** A line of text a panel shows: what it says and how, and how far its line's box reaches past the face's own each
 *  side (px: negative where its line height is shorter, as CSS's half-leading). */
interface Text { text: string; style: TextStyle; label: Label; w: number; h: number; reach: number; lead: number }

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

  readonly parent: Panel | null;

  /** A panel made inside `parent` (none: on the screen), laid out by `style` and painted by `look`. */
  constructor(parent: Panel | null, style: PanelStyle = {}, look: PanelLook = {},
    readonly scaled: Scaled = parent?.scaled ?? 'hud') {
    this.id = freeIds.pop() ?? nextId++;
    this.parent = parent === null && !making ? screenPanel() : parent;
    this.styleNow = style;
    this.lookNow = look;
    this.parent?.children.add(this);
    panels.add(this);
    const k = this.scale();
    uiMake(this.id, this.parent?.id ?? null, null, styleFloats(style, k), lookFloats(this.fullLook(), k));
    this.writtenAt = k;
  }

  /** Its layout changed: `style`'s fields over those it had (nothing sent where none differs). */
  style(style: PanelStyle): this {
    if (!differs(this.styleNow, style)) return this;
    this.styleNow = { ...this.styleNow, ...style };
    uiRestyle(this.id, this.styleFloats());
    return this;
  }

  /** Its look changed: `look`'s fields over those it had (nothing sent where none differs). */
  look(look: PanelLook): this {
    if (!differs(this.lookNow, look)) return this;
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
   *  out as CSS lays out an empty box (no line: as high as its padding and border). */
  say(text: string, style: TextStyle): this {
    if (text === '') return this.silence();
    if (this.text && this.text.text === text && this.text.style === style) return this;
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
    this.text = { text, style, label, w: measured.w, h: measured.h, reach, lead };
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

  /** Whether it can be seen: it and every panel round it with some opacity (a page element's `checkVisibility`). */
  get seen(): boolean {
    for (let panel: Panel | null = this; panel; panel = panel.parent) {
      if ((panel.lookNow.opacity ?? 1) <= 0) return false;
    }
    return true;
  }

  /** What it says, if anything (the lab reads it). */
  get said(): string {
    return this.text?.text ?? '';
  }

  /** Taken away, with every panel inside it. */
  remove(): void {
    this.forget();
    uiRemove(this.id);
  }

  private forget(): void {
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
  refresh(ratio: number): void {
    const k = this.scale();
    const text = this.text;
    let relook = false;
    if (text) {
      const paint = ratio * k;
      const label = text.label;
      if (label.painted !== paint || !label.slot) {
        label.paint(paint);
        if (label.painted === paint) {
          this.paintedAt = paint;
          uiContent(this.id, { w: text.w * k, h: text.h * k });
          relook = true;
        }
      }
    }
    if (this.writtenAt !== k) {
      this.writtenAt = k;
      uiRestyle(this.id, this.styleFloats());
      relook = true;
      if (text) uiContent(this.id, { w: text.w * k, h: text.h * k });
    }
    if (relook) uiRelook(this.id, lookFloats(this.fullLook(), k));
  }
}

/** Whether any of `change`'s fields differs from `now`'s (a list or an object by its parts as text). */
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

const everyFrame = new Set<() => void>();
/** `tick` run before each frame's panels are brought up to date (an animation's step), until `stop` is called. */
export function onFrame(tick: () => void): () => void {
  everyFrame.add(tick);
  return () => everyFrame.delete(tick);
}

/** Every panel brought up to date before the engine's frame (the screen's size and ratio, each text painted), all
 *  of them shown or not. */
function refreshPanels(shown: boolean): void {
  const canvas = engineCanvas();
  if (!canvas) return;
  // (an animation's step may make the first panel, and the screen's with it)
  for (const tick of everyFrame) tick();
  if (!screen) return;
  uiScreen(innerWidth, innerHeight, canvas.width / Math.max(1, innerWidth));
  screen.show(shown);
  const ratio = G.renderer.getPixelRatio();
  for (const panel of panels) panel.refresh(ratio);
}
overFrame.panels = refreshPanels;
