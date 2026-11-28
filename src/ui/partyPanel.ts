// The co-op party's frames drawn by the engine (ui/kit; #973): top left (below the bars on touch), the local
// player's first, each a card with its portrait (the host's starred), the name and the class in its accent, the life
// bar and a line saying how it stands (down, banked, readying...); a partner being healed has a breathing green light
// over the bar and a + over the portrait's corner. They were `#party`'s `.pf`, styled by `_coop.scss`; the page's
// stay, out of sight (`.kit-mirror`): `coop.ts` writes them as before, and the panels here follow them each frame.
import { Panel, onFrame, type Scaled } from './kit/panel';
import { standIn } from './kit/press';
import { input } from '../core/input';
import { uiScales } from './scale';
import { now, reducedMotion } from './kit/motion';
import type { TextStyle } from './overlay/paint';
import { shownOnPage } from './kit/shownOnPage';

const FRAME_RGB = '160,124,70';
const ALLY_BORDER = 'rgba(106,184,255,.4)';
const HEAL_BORDER = 'rgba(76,255,106,.8)';
const DANGER = '#ff5a4a';
const HIGHLIGHT = '#f0c860';
const OUTLINE = [
  { x: 1, y: 1, blur: 0, color: '#000' }, { x: -1, y: -1, blur: 0, color: '#000' },
  { x: 1, y: -1, blur: 0, color: '#000' }, { x: -1, y: 1, blur: 0, color: '#000' },
];
const NAME: TextStyle = { face: 'display', size: 13, color: '#cfe6ff' };
const STATE: TextStyle = { face: 'body', size: 12, color: '#9a8f7c' };
const STAR: TextStyle = { face: 'body', size: 14, line: 1, color: HIGHLIGHT, shadows: OUTLINE };
const PLUS: TextStyle = { face: 'display', size: 19, weight: 700, line: 1, color: '#eafff0',
  shadows: [{ x: 0, y: 0, blur: 4, color: '#063' }] };
/** a card's sizes as a screen has them: its padding, the portrait's side, the heading's size, the bar's height and
 *  its gap over it, the state line's size (a phone held sideways in touch mode: tighter, `_coop.scss`) */
interface Fit { padding: [number, number, number, number]; portrait: number; heading: number; bar: number;
  barGap: number; state: number; line?: number }
const ROOMY: Fit = { padding: [5, 8, 6, 8], portrait: 36, heading: 13, bar: 8, barGap: 3, state: 12 };
const TIGHT: Fit = { padding: [4, 6, 4, 6], portrait: 28, heading: 12, bar: 6, barGap: 2, state: 11, line: 1.1 };
const SHORT_PX = 520;
/** the cards' width and the gap between them; where the column stands (px of the HUD's layout, or the touch
 *  controls' on touch: beside the left corner's buttons, below the bars) */
const WIDTH = 200;
const GAP = 6;
const CORNER = 14;
const TOUCH_EDGE = 10;
const TOUCH_BUTTON = 54;
const TOUCH_DOWN = 104;
/** the healed light's breath (s a way, its least and most) and its still share with motion reduced */
const BREATH = 0.9;
const MEND_LOW = 0.15;
const MEND_HIGH = 0.6;
const MEND_STILL = 0.4;

/** A card as the page has it. */
interface Card {
  self: boolean; down: boolean; out: boolean; healed: boolean; host: boolean; accent: string;
  name: string; cls: string; fill: number; state: string; image: HTMLImageElement | null;
}

/** A card drawn: its panels. */
interface Drawn {
  card: Panel; portrait: Panel; star: Panel; content: Panel; name: Panel; cls: Panel; fill: Panel; mend: Panel;
  state: Panel; plus: Panel;
}

let root: Panel | null = null;
let rootTouch = false;
let rootFit: Fit = ROOMY;
let cards: Drawn[] = [];

/** The cards as the page has them. */
function cardsOf(page: HTMLElement): Card[] {
  return [...page.querySelectorAll<HTMLElement>('.pf')].map((frame) => {
    const classes = frame.classList;
    const portrait = frame.querySelector<HTMLElement>('.pf-portrait');
    const fill = frame.querySelector<HTMLElement>('.pf-fill');
    return {
      self: classes.contains('self'), down: classes.contains('down'),
      out: classes.contains('out'), healed: classes.contains('healed'),
      host: !!portrait?.classList.contains('host'), accent: frame.style.getPropertyValue('--class-colour') || '#fff',
      name: frame.querySelector('.pf-name')?.textContent ?? '', cls: frame.querySelector('.pf-class')?.textContent ?? '',
      fill: (parseFloat(fill?.style.width ?? '') || 0) / 100,
      state: frame.querySelector('.pf-state')?.textContent ?? '',
      image: portrait?.hidden ? null : portrait?.querySelector('img') ?? null,
    };
  });
}

/** The card's breathing light: a band across the bar, clear at both ends. */
function paintMend(w: number, h: number) {
  return (c: CanvasRenderingContext2D): void => {
    const band = c.createLinearGradient(0, 0, w, 0);
    band.addColorStop(0, 'rgba(76,255,106,0)');
    band.addColorStop(0.5, 'rgba(76,255,106,.85)');
    band.addColorStop(1, 'rgba(76,255,106,0)');
    c.fillStyle = band;
    c.fillRect(0, 0, w, h);
  };
}

/** The + over a healed card's portrait: a green disc fading at its rim. */
function paintPlusDisc(c: CanvasRenderingContext2D): void {
  const disc = c.createRadialGradient(11, 11, 0, 11, 11, 11);
  disc.addColorStop(0, '#4cff6a');
  disc.addColorStop(0.45, '#4cff6a');
  disc.addColorStop(0.7, 'rgba(76,255,106,.35)');
  disc.addColorStop(0.72, 'rgba(76,255,106,0)');
  c.fillStyle = disc;
  c.fillRect(0, 0, 22, 22);
}

/** A card's panels in the column. */
function cardIn(column: Panel, fit: Fit): Drawn {
  const card = new Panel(column, {
    width: WIDTH, padding: fit.padding, border: 1, direction: 'row', alignItems: 'center', gap: 7,
  }, { fill: 'rgba(8,8,12,.72)', border: ALLY_BORDER, radius: 3 });
  const portraitBox = new Panel(card, { position: 'relative', shrink: 0 });
  const portrait = new Panel(portraitBox, {
    width: fit.portrait + 2, height: fit.portrait + 2, border: 1,
  }, { border: `rgba(${FRAME_RGB},.65)`, radius: 3 });
  const star = new Panel(portraitBox, { position: 'absolute', inset: ['auto', 'auto', 0, 1] });
  const content = new Panel(card, { grow: 1, basis: 0, minWidth: 0, direction: 'column' });
  const heading = new Panel(content, { direction: 'row', justify: 'between', alignItems: 'baseline', gap: 6 });
  const nameBox = new Panel(heading, { shrink: 1, minWidth: 0, overflow: 'hidden' });
  const name = new Panel(nameBox, { shrink: 0 });
  const cls = new Panel(heading, { shrink: 0 });
  // (its frame's ring round the bar, laid out as if it weren't there, as CSS's box-shadow was)
  const ring = new Panel(content, { border: 1, margin: [fit.barGap - 1, -1, -1, -1], direction: 'column' }, {
    border: `rgba(${FRAME_RGB},.35)`,
  });
  const bar = new Panel(ring, { height: fit.bar, alignSelf: 'stretch', position: 'relative' },
    { fill: 'rgba(0,0,0,.8)' });
  const fill = new Panel(bar, { position: 'absolute', inset: [0, 'auto', 0, 0] }, { fill: ['#ff5a4a', '#8a0c10'] });
  const mend = new Panel(bar, { position: 'absolute', inset: 0 });
  const state = new Panel(content);
  const plus = new Panel(card, {
    position: 'absolute', inset: [-4, 'auto', 'auto', 32], width: 22, height: 22, alignItems: 'center',
    justify: 'center',
  }).picture('plus disc', 22, 22, paintPlusDisc);
  new Panel(plus).say('+', PLUS);
  return { card, portrait, star, content, name, cls, fill, mend, state, plus };
}

/** A card brought up to the page's. */
function followCard(drawn: Drawn, card: Card, fit: Fit): void {
  const border = card.healed ? HEAL_BORDER : card.down ? DANGER : card.self ? HIGHLIGHT : ALLY_BORDER;
  drawn.card.style({ border: card.self ? [0, 0, 0, 3] : 1 });
  drawn.card.look({ border, opacity: card.out ? 0.55 : 1 });
  const image = card.image;
  const loaded = !!image && image.complete && image.naturalWidth > 0;
  const side = fit.portrait;
  drawn.portrait.show(!!image);
  if (loaded) {
    drawn.portrait.picture(`portrait ${image.src.slice(-80)} ${side}`, side, side, (c) => {
      c.drawImage(image, 0, 0, side, side);
    });
  }
  drawn.star.show(card.host && !!image);
  drawn.star.say('★', STAR);
  const line = fit.line;
  drawn.name.say(card.name, { ...NAME, size: fit.heading, line });
  drawn.cls.say(card.cls, { ...NAME, size: fit.heading, line, color: card.accent });
  drawn.fill.style({ width: `${Math.round(card.fill * 1000) / 10}%` });
  drawn.state.show(!!card.state);
  drawn.state.say(card.state, { ...STATE, size: fit.state });
  drawn.mend.show(card.healed);
  drawn.plus.show(card.healed);
  if (!card.healed) return;
  const breath = reducedMotion() ? MEND_STILL : MEND_LOW + (MEND_HIGH - MEND_LOW) * pingPong(now() / BREATH);
  drawn.mend.picture(`mend ${WIDTH}`, WIDTH, fit.bar, paintMend(WIDTH, fit.bar)).look({ opacity: breath });
}

/** 0 to 1 and back, each way a whole number of `t`'s steps, eased in and out (`ease-in-out ... alternate`). */
function pingPong(t: number): number {
  const along = t % 2 < 1 ? t % 1 : 1 - (t % 1);
  return along * along * (3 - 2 * along);
}

/** Where the column stands now, in px of its scale. */
function placeNow(touch: boolean): [number, 'auto', 'auto', number] {
  if (!touch) return [CORNER, 'auto', 'auto', CORNER];
  return [TOUCH_DOWN, 'auto', 'auto', (TOUCH_EDGE + TOUCH_BUTTON * uiScales.touch) / uiScales.touch];
}

/** The frames brought up to the page's. */
function follow(): void {
  const page = document.getElementById('party');
  if (!page) return;
  const all = cardsOf(page);
  const shows = shownOnPage(page) && all.length > 0;
  if (!root && !shows) return;
  const touch = input.touchMode;
  const fit = touch && innerHeight <= SHORT_PX ? TIGHT : ROOMY;
  if (root && (rootTouch !== touch || rootFit !== fit)) {
    root.remove();
    root = null;
    cards = [];
  }
  if (!root) {
    const scaled: Scaled = touch ? 'touch' : 'hud';
    root = new Panel(null, { position: 'absolute', direction: 'column', gap: GAP }, {}, scaled);
    rootTouch = touch;
    rootFit = fit;
    standIn(page, root);
  }
  root.show(shows);
  if (!shows) return;
  root.style({ inset: placeNow(touch) });
  while (cards.length > all.length) cards.pop()!.card.remove();
  while (cards.length < all.length) cards.push(cardIn(root, fit));
  const frames = [...page.querySelectorAll('.pf')];
  all.forEach((card, at) => {
    followCard(cards[at], card, fit);
    standIn(frames[at], cards[at].card);
  });
}

/** A box (css px), or none. */
type Box = { x: number; y: number; w: number; h: number } | null;

/** A card as drawn, for the lab (`tools/lab/page/portraits.ts`): its parts' boxes (css px), its borders' widths (top,
 *  right, bottom, left: px of its layout) and colour, its class's colour. */
export interface CardDrawn {
  card: Box; content: Box; name: Box; cls: Box; portrait: Box; star: Box;
  border: number[]; borderColour: string; clsColour: string;
}

/** The cards as drawn now, in the page's order. */
export function partyCardsDrawn(): CardDrawn[] {
  const page = document.getElementById('party');
  const all = page ? cardsOf(page) : [];
  return cards.slice(0, all.length).map((drawn, at) => {
    const border = drawn.card.styled.border ?? 0;
    const sides = Array.isArray(border) ? border : [border, border, border, border];
    return {
      card: drawn.card.rect(), content: drawn.content.rect(), name: drawn.name.rect(), cls: drawn.cls.rect(),
      portrait: drawn.portrait.rect(), star: drawn.star.rect(), border: sides,
      borderColour: drawn.card.looked.border ?? '', clsColour: all[at].accent,
    };
  });
}

/** The party's frames drawn by the engine from now on, the page's own out of sight. */
export function drawParty(): void {
  document.getElementById('party')?.classList.toggle('kit-mirror', true);
  onFrame(follow);
}
