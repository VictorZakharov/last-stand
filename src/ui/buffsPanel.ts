// The run's buffs drawn by the engine (ui/kit; #973): a row of small framed boxes over the bottom bar's left end, each
// a glyph in its colour (the ward, the tavern's ale) with what's left of it under it. It was `#buffs`, styled by
// `_hud.scss` and `_touch.scss` (beside the left corner's buttons on touch); the page's stays, out of sight
// (`.kit-mirror`): `hud.ts` writes its boxes as before, and the panels here follow them each frame.
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import { input } from '../core/input';
import { uiScales } from './scale';
import type { TextStyle } from './overlay/paint';
import type { Length } from '../engine/ui';

const FRAME = '#a07c46';
/** a box's side, the gap between boxes, its glyph's size, its words' (px) */
const SIDE = 30;
const GAP = 4;
const GLYPH: TextStyle = { face: 'body', size: 18, color: '#fff' };
const UNDER: TextStyle = {
  face: 'body', size: 11, color: '#fff', shadows: [{ x: 0, y: 0, blur: 3, color: '#000' }],
};
/** how far its words hang under a box (`bottom: -14px`), and the room either side they're centred in */
const UNDER_DROP = 14;
const UNDER_ROOM = 60;
/** where the row stands: left of the screen's middle and up from its foot (px of the HUD's layout); on touch,
 *  beside the left corner's buttons (css px, and px of the touch controls' layout), down from the top */
const FROM_MIDDLE = 470;
const UP = 76;
const TOUCH_EDGE = 10;
const TOUCH_BUTTON = 54;
const TOUCH_DOWN = 76;

/** A buff as the page has it: its glyph, its colour, its words under it. */
interface Buff { glyph: string; color: string; under: string }

let root: Panel | null = null;
let boxes: { box: Panel; glyph: Panel; under: Panel }[] = [];

/** The buffs as the page has them. */
function buffsOf(page: HTMLElement): Buff[] {
  return [...page.children].map((buff) => {
    const glyph = [...buff.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent).join('');
    return {
      glyph, color: (buff as HTMLElement).style.color || '#fff', under: buff.querySelector('.bt')?.textContent ?? '',
    };
  });
}

/** A buff's box in the row. */
function boxIn(row: Panel): { box: Panel; glyph: Panel; under: Panel } {
  const box = new Panel(row, {
    width: SIDE, height: SIDE, border: 1, alignItems: 'center', justify: 'center', shrink: 0,
  }, { fill: '#111', border: FRAME, shadow: { blur: 8, color: 'rgba(0,0,0,.8)' } });
  const glyph = new Panel(box);
  const hang = new Panel(box, {
    position: 'absolute', inset: ['auto', -UNDER_ROOM, -UNDER_DROP, -UNDER_ROOM], alignItems: 'center',
    direction: 'column',
  });
  return { box, glyph, under: new Panel(hang) };
}

/** Where the row stands now (px of the HUD's layout). */
function placeNow(): [Length, Length, Length, Length] {
  const hud = uiScales.hud;
  if (input.touchMode) {
    return [TOUCH_DOWN * uiScales.touch / hud, 'auto', 'auto', (TOUCH_EDGE + TOUCH_BUTTON * uiScales.touch) / hud];
  }
  return ['auto', 'auto', UP, (innerWidth / 2 - FROM_MIDDLE * hud) / hud];
}

/** The row brought up to the page's. */
function follow(): void {
  const page = document.getElementById('buffs');
  if (!page) return;
  const shows = page.checkVisibility() && page.children.length > 0;
  if (!root && !shows) return;
  if (!root) {
    root = new Panel(null, { position: 'absolute', direction: 'row', gap: GAP });
    standIn(page, root);
  }
  root.show(shows);
  if (!shows) return;
  root.style({ inset: placeNow() });
  const buffs = buffsOf(page);
  while (boxes.length > buffs.length) boxes.pop()!.box.remove();
  while (boxes.length < buffs.length) boxes.push(boxIn(root));
  buffs.forEach((buff, at) => {
    boxes[at].glyph.say(buff.glyph, { ...GLYPH, color: buff.color });
    boxes[at].under.say(buff.under, UNDER);
  });
}

/** The buffs drawn by the engine from now on, the page's own out of sight. */
export function drawBuffs(): void {
  document.getElementById('buffs')?.classList.add('kit-mirror');
  onFrame(follow);
}
