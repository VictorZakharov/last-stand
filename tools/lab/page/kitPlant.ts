// A canary's plant of a layout, wherever the element is drawn (#973): on the page, its inline style; where the UI kit
// draws it (`.kit-mirror`), the panel the kit draws for it, laid out as planted. A stylesheet or an inline style planted
// on an element the kit draws moves nothing, and the canary goes unseen (the talk's card, its Leave). The kit keeps a
// field it was given from outside until a rule of the element's gives that field: plant fields its rules leave alone,
// or the tree takes them back as it follows the page.
import { uiScales } from '../../../src/ui/scale';
import type { Lab } from './lab';

/** a planted layout, px of the page (css px) */
export interface Planted {
  /** stood this far down from where it's laid out (`position: relative; top`) */
  down?: number;
  /** this tall, and not shrunk to fit its room */
  height?: number;
}

/** A panel the UI kit draws, laid out as told (src/ui/kit/panel.ts) */
interface KitPanel {
  style(style: Record<string, unknown>): unknown;
  readonly scaled: string;
}
/** the UI kit's presses (src/ui/kit/press.ts), where the tree has them: the panel drawn for an element */
interface KitPress {
  drawnFor(element: Element): KitPanel | null;
}
const KIT_PRESS = Object.values(import.meta.glob<KitPress>('../../../src/ui/kit/press.ts', { eager: true }))[0];
/** frames the kit takes to lay out a change */
const KIT_FRAMES = 3;

/** A style's field as CSS names it (`maxHeight`, `max-height`). */
const cssName = (field: string): string => field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** The page's inline style for `planted`. */
function pageStyle(planted: Planted): Partial<CSSStyleDeclaration> {
  const style: Partial<CSSStyleDeclaration> = {};
  if (planted.down !== undefined) Object.assign(style, { position: 'relative', top: `${planted.down}px` });
  if (planted.height !== undefined) Object.assign(style, { height: `${planted.height}px`, maxHeight: 'none' });
  return style;
}

/** The kit's layout for `planted`, in px of the panel's scale (`k` css px a px). */
function kitStyle(planted: Planted, k: number): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  if (planted.down !== undefined) Object.assign(style, { position: 'relative', inset: [planted.down / k, 'auto',
    'auto', 'auto'] });
  if (planted.height !== undefined) {
    Object.assign(style, { height: planted.height / k, maxHeight: planted.height / k, shrink: 0 });
  }
  return style;
}

/** `planted` laid on `element` where it's drawn, and the frames run for it to show; a function taking it away. */
export async function plantLayout(lab: Lab, element: HTMLElement, planted: Planted): Promise<() => Promise<void>> {
  const panel = element.closest('.kit-mirror') ? KIT_PRESS?.drawnFor(element) : null;
  if (!panel) {
    const style = pageStyle(planted);
    Object.assign(element.style, style);
    await lab.step(1);
    return async () => {
      for (const name of Object.keys(style)) element.style.removeProperty(cssName(name));
      await lab.step(1);
    };
  }
  const k = uiScales[panel.scaled as keyof typeof uiScales] ?? 1;
  const style = kitStyle(planted, k);
  panel.style(style);
  await lab.step(KIT_FRAMES);
  return async () => {
    panel.style(Object.fromEntries(Object.keys(style).map((name) => [name, undefined])));
    // (the page changed: its tree follows it again, its rules' fields back)
    element.classList.toggle('lab-planted');
    element.classList.toggle('lab-planted');
    await lab.step(KIT_FRAMES);
  };
}
