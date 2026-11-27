// The skill bar drawn by the engine (ui/kit; #973), in the bottom bar between the health and the energy
// (`bottomBar.ts`): a tray of slots, each its skill's face (`slotFace.ts`), its cooldown's shade swept round from the
// top and the seconds left, its key. It was `#hotbar`'s `.slot`s, styled by `_hud.scss`, in px of the HUD's
// reference layout. The page's `#hotbar` stays, out of sight (`.kit-mirror`): `hud.ts` builds and writes it as
// before (`buildHotbar`, `updateHud`), and each slot here follows its slot there each frame (its classes, its
// cooldown's `--p`, its words). A slot takes no press (one there is the world's, core/input.ts's TIP_ONLY); the mouse
// over it is its page slot's, which opens its skill's tooltip (`tips` in kit/press.ts).
import { Panel } from './kit/panel';
import { noStandIn, standIn, tips, untipped } from './kit/press';
import type { TextStyle } from './overlay/paint';
import { FACE, artLoaded, faceKey, paintFace, type SlotFace } from './slotFace';

/** the slot's side and its gap after a separator (`.slot`, `.slot.sep`), the tray's gap and padding (`#hotbar`) */
const SLOT = 62;
const SEP = 10;
const GAP = 6;
const PAD: [number, number] = [7, 12];
/** the tray's border and its corners (`frame` in _mixins.scss: 2 px of the frame's dark) */
const BORDER = 2;
const RADIUS = 4;
const FRAME_DARK = '#4a3620';
const TRAY: [string, string] = ['#1a1614', '#0a0909'];
const TRAY_LINE = 'rgba(160, 124, 70, .6)';
const TRAY_SHADOW = { blur: 14, y: 6, color: 'rgba(0,0,0,.8)' };
/** a cast's glow round its slot (`.slot.active`'s `0 0 12px rgba($highlight, .6)`) */
const CAST_GLOW = { blur: 12, color: 'rgba(240,200,96,.6)' };
const COOLDOWN = 'rgba(0,0,0,.78)';
const SECONDS: TextStyle = {
  face: 'display', size: 20, weight: 700, color: '#fff', shadows: [{ x: 0, y: 0, blur: 4, color: '#000' }],
};
const KEY: TextStyle = {
  face: 'body', size: 12, weight: 700, color: '#fff',
  shadows: [{ x: 0, y: 0, blur: 3, color: '#000' }, { x: 0, y: 0, blur: 3, color: '#000' }],
};

/** A slot drawn: its panels, the page's slot it follows. */
interface DrawnSlot {
  page: HTMLElement;
  root: Panel;
  face: Panel;
  cooldown: Panel;
  seconds: Panel;
  key: Panel;
}

/** The skill bar drawn: its ring (its outer panel), its tray, its slots. */
export interface Hotbar {
  root: Panel;
  tray: Panel;
  slots: DrawnSlot[];
}

/** The skill bar made in `parent`, standing for the page's `#hotbar`. */
export function makeHotbar(parent: Panel): Hotbar {
  // (its black ring and its shadow, laid out as if they weren't there, as CSS's box-shadow is)
  const root = new Panel(parent, { border: 1, margin: -1 }, { border: '#000', radius: RADIUS + 1, shadow: TRAY_SHADOW });
  const tray = new Panel(root, {
    position: 'relative', direction: 'row', alignItems: 'center', gap: GAP, padding: PAD, border: BORDER,
  }, { fill: TRAY, border: FRAME_DARK, radius: RADIUS });
  new Panel(tray, { position: 'absolute', inset: 0, border: 1 }, { border: TRAY_LINE, radius: RADIUS - BORDER });
  const page = document.getElementById('hotbar');
  if (page) standIn(page, tray);
  return { root, tray, slots: [] };
}

/** A slot made at the tray's end for the page's slot `page`. */
function makeSlot(tray: Panel, page: HTMLElement): DrawnSlot {
  const root = new Panel(tray, {
    width: SLOT, height: SLOT, border: 1, overflow: 'hidden', margin: [0, 0, 0, page.classList.contains('sep') ? SEP : 0],
  }, { border: '#000', radius: 3 });
  const inner = { position: 'absolute', inset: 0 } as const;
  const face = new Panel(root, { ...inner, width: FACE, height: FACE }, { radius: 2 });
  const cooldown = new Panel(root, inner, { fill: COOLDOWN, radius: 2, sweep: 0 });
  const middle = new Panel(root, { ...inner, alignItems: 'center', justify: 'center' });
  const seconds = new Panel(middle, {});
  const key = new Panel(root, { position: 'absolute', inset: ['auto', 4, 2, 'auto'] });
  tips(root, page);
  return { page, root, face, cooldown, seconds, key };
}

/** A slot taken away with its page slot. */
function dropSlot(slot: DrawnSlot): void {
  untipped(slot.root);
  noStandIn(slot.page);
  slot.root.remove();
}

/** The address of a painted icon in `icon`'s background, if it has one. */
function artOf(icon: HTMLElement | null): string | undefined {
  const background = icon?.classList.contains('art') ? icon.style.backgroundImage : '';
  return /url\(["']?(.*?)["']?\)/.exec(background ?? '')?.[1];
}

/** What the page's slot shows now. */
function faceOf(page: HTMLElement): SlotFace {
  const icon = page.querySelector<HTMLElement>('.icon');
  const art = artOf(icon);
  const looks = page.classList;
  return {
    art,
    glyph: art ? undefined : icon?.textContent ?? undefined,
    color: icon?.style.color || undefined,
    nomana: looks.contains('nomana'),
    active: looks.contains('active'),
    busy: looks.contains('busy'),
  };
}

const NOTHING = (): void => undefined;

/** A slot brought up to its page slot: its face, its cooldown, its words, its glow as it's cast. */
function followSlot(slot: DrawnSlot): void {
  const face = faceOf(slot.page);
  // (loaded, it's painted at the next frame's follow)
  const image = face.art ? artLoaded(face.art, NOTHING) : null;
  slot.face.picture(faceKey(face, !!image), FACE, FACE, (c, scale) => paintFace(c, face, image, scale));
  slot.root.look({ shadow: face.active ? CAST_GLOW : undefined });
  const share = parseFloat(slot.page.querySelector<HTMLElement>('.cd')?.style.getPropertyValue('--p') ?? '') || 0;
  slot.cooldown.look({ sweep: share / 100 });
  slot.seconds.say(slot.page.querySelector('.cdt')?.textContent ?? '', SECONDS);
  slot.key.say(slot.page.querySelector('.key')?.textContent ?? '', KEY);
}

/** The skill bar brought up to the page's `#hotbar`: its slots made again where the page's were, each followed. */
export function followHotbar(bar: Hotbar, page: HTMLElement): void {
  const pages = [...page.children].filter((child): child is HTMLElement => child.classList.contains('slot'));
  const same = pages.length === bar.slots.length && pages.every((p, i) => bar.slots[i].page === p);
  if (!same) {
    for (const slot of bar.slots) dropSlot(slot);
    bar.slots = pages.map((p) => makeSlot(bar.tray, p));
  }
  for (const slot of bar.slots) followSlot(slot);
}

/** The tray's height (px), as the page lays it out: the bottom bar's row is as tall. */
export const HOTBAR_HEIGHT = SLOT + PAD[0] * 2 + BORDER * 2;

/** The tray's width with `bar`'s slots (px), as the page lays it out: its ring's room in the bottom bar. */
export function hotbarWidth(bar: Hotbar): number {
  const n = bar.slots.length;
  const seps = bar.slots.filter((slot) => slot.page.classList.contains('sep')).length;
  return BORDER * 2 + PAD[1] * 2 + n * SLOT + Math.max(0, n - 1) * GAP + seps * SEP;
}
