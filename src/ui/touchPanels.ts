// The touch controls drawn by the engine (ui/kit; #973): the move stick, the skill buttons, the round buttons (pause,
// full screen, the view, the scores) and the village's Use, Bag and Map. They were `#touch`'s parts and the buttons,
// styled by `_touch.scss` and `_scoreboard.scss`. Their page elements stay where they were, laid out and taking the
// fingers as before (`touch.ts`'s pointer capture, two fingers, buttons held), but paint nothing (`.kit-ghost`: a
// filter, so their opacity still says whether they show): each panel here stands where its element is laid out,
// read each frame, and shows what it shows.
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import { svgArt } from './kit/svgArt';
import { uiScales } from './scale';
import { accent, faded } from './diagFrame';
import { faceOf } from './hotbarPanel';
import { FACE, artLoaded, faceKey, paintFace } from './slotFace';
import type { TextStyle } from './overlay/paint';

const ROUND_FILL = 'rgba(10,9,11,.75)';
const ROUND_LINE = 'rgba(160,124,70,.6)';
const HIGHLIGHT = '#f0c860';
/** the skill buttons' look: their opacity, an empty one's, the cooldown's shade, the seconds left */
const SLOT_OPACITY = 0.92;
const EMPTY_OPACITY = 0.35;
const COOLDOWN = 'rgba(0,0,0,.78)';
const SECONDS: TextStyle = {
  face: 'display', size: 20, weight: 700, color: '#fff', shadows: [{ x: 0, y: 0, blur: 4, color: '#000' }],
};
const PILL: TextStyle = { face: 'display', size: 15, weight: 600, spacing: 0.6, color: '#f3e1b0' };
/** the round buttons, each with its icon's side (px of the touch controls) */
const ROUND: [string, number][] = [['btn-pause', 20], ['btn-full', 20], ['btn-view', 22], ['btn-scores', 20]];
/** the elements drawn here, painting nothing on the page */
const GHOSTS = '#touch-stick, #touch-skills, #touch-village, #btn-pause, #btn-full, #btn-view, #btn-scores';

/** The touch controls' scale: their panels' px. */
const scale = (): number => uiScales.touch;

/** `panel` stood where `element` is laid out (its box read now, css px), or hidden where it isn't shown. */
function placeOn(panel: Panel, element: Element | null): boolean {
  const shown = !!element && element.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  panel.show(shown);
  if (!shown) return false;
  const box = element.getBoundingClientRect();
  const k = scale();
  panel.style({ inset: [box.top / k, 'auto', 'auto', box.left / k], width: box.width / k, height: box.height / k });
  return true;
}

let root: Panel | null = null;

/** The panel every touch control is drawn in: the whole window, in px of the touch controls. */
function rootOf(): Panel {
  root ??= new Panel(null, { position: 'absolute', inset: 0 }, {}, 'touch');
  return root;
}

// --- the round buttons ---

interface Round { id: string; button: Panel; icon: Panel; side: number }
const rounds: Round[] = [];

function followRound(round: Round): void {
  const page = document.getElementById(round.id);
  if (!placeOn(round.button, page)) return;
  standIn(page!, round.button);
  const k = scale();
  round.button.look({ radius: 999, border: ROUND_LINE });
  round.button.style({ border: 1 / k });
  const svg = [...page!.querySelectorAll('svg')].find((icon) => icon.checkVisibility()) ?? null;
  if (!svg) return;
  const { key, image } = svgArt(svg);
  if (!image) return;
  round.icon.picture(`svg ${key} ${round.side}`, round.side, round.side, (c) => {
    c.drawImage(image, 0, 0, round.side, round.side);
  });
}

// --- the move stick ---

interface Stick { base: Panel; knob: Panel }
let stick: Stick | null = null;

function followStick(): void {
  const page = document.getElementById('touch-stick');
  const shown = !!page?.classList.contains('on') && page.checkVisibility();
  stick ??= makeStick();
  stick.base.show(shown);
  if (!shown) return;
  placeOn(stick.base, page);
  placeOn(stick.knob, page!.querySelector('.knob'));
  stick.base.look({ border: faded(accent(), 0.45) });
}

function makeStick(): Stick {
  const base = new Panel(rootOf(), { position: 'absolute', border: 2 }, {
    fill: ['rgba(0,0,0,.35)', 'rgba(0,0,0,.08)'], radial: { y: 0.5, stop: 0.7 }, radius: 999,
  });
  const knob = new Panel(rootOf(), { position: 'absolute' }, {
    fill: ['#f3e1b0', '#7a5a2a'], radial: { y: 0.35, stop: 0.7 }, radius: 999,
    shadow: { blur: 14, color: 'rgba(240,200,96,.45)' },
  });
  return { base, knob };
}

// --- the skill buttons ---

interface SkillButton { page: HTMLElement; root: Panel; face: Panel; cooldown: Panel; seconds: Panel }
let skills: SkillButton[] = [];

function makeSkill(page: HTMLElement): SkillButton {
  const root = new Panel(rootOf(), { position: 'absolute', border: 1, overflow: 'hidden' },
    { border: '#000', radius: 999 });
  const inner = { position: 'absolute', inset: 0 } as const;
  // (each rounded with the button: a picture and a fill are rounded by their own panel's corners)
  const face = new Panel(root, inner, { radius: 999 });
  const cooldown = new Panel(root, inner, { fill: COOLDOWN, sweep: 0, radius: 999 });
  const middle = new Panel(root, { ...inner, alignItems: 'center', justify: 'center' });
  standIn(page, root);
  return { page, root, face, cooldown, seconds: new Panel(middle) };
}

const NOTHING = (): void => undefined;

function followSkill(button: SkillButton): void {
  if (!placeOn(button.root, button.page)) return;
  const k = scale();
  const side = button.page.getBoundingClientRect().width / k - 2;
  const face = faceOf(button.page);
  const image = face.art ? artLoaded(face.art, NOTHING) : null;
  const ratio = side / FACE;
  button.face.picture(`${faceKey(face, !!image)} round ${side.toFixed(1)}`, side, side, (c, pixels) => {
    c.save();
    c.scale(ratio, ratio);
    paintFace(c, face, image, pixels * ratio, true);
    c.restore();
  });
  const pressed = button.page.classList.contains('pressed');
  const empty = button.page.classList.contains('empty');
  button.root.look({
    opacity: empty ? EMPTY_OPACITY : SLOT_OPACITY, border: pressed ? HIGHLIGHT : '#000',
    shadow: pressed ? { blur: 16, color: 'rgba(240,200,96,.7)' } : undefined,
  });
  const share = parseFloat(button.page.querySelector<HTMLElement>('.cd')?.style.getPropertyValue('--p') ?? '') || 0;
  button.cooldown.look({ sweep: share / 100 });
  button.seconds.say(button.page.querySelector('.cdt')?.textContent ?? '', SECONDS);
}

function followSkills(): void {
  const pages = [...document.querySelectorAll<HTMLElement>('#touch-skills .slot')];
  const same = pages.length === skills.length && pages.every((page, at) => skills[at].page === page);
  if (!same) {
    for (const button of skills) button.root.remove();
    skills = pages.map(makeSkill);
  }
  for (const button of skills) followSkill(button);
}

// --- the village's buttons ---

interface Pill { page: HTMLElement; root: Panel; fill: Panel; words: Panel }
let pills: Pill[] = [];

function makePill(page: HTMLElement): Pill {
  const root = new Panel(rootOf(), { position: 'absolute', border: 1, overflow: 'hidden', alignItems: 'center',
    justify: 'center' }, { fill: 'rgba(8,7,9,.78)', radius: 24 });
  const fill = new Panel(root, { position: 'absolute', inset: [0, 'auto', 0, 0] });
  const words = new Panel(root);
  standIn(page, root);
  return { page, root, fill, words };
}

function followPill(pill: Pill): void {
  if (!placeOn(pill.root, pill.page)) return;
  const use = pill.page.classList.contains('tv-use');
  const colour = accent();
  pill.root.style({ border: 1 / scale() });
  pill.root.look({
    border: use ? colour : faded(colour, 0.55),
    shadow: use ? { blur: 12, color: 'rgba(240,200,96,.45)' } : undefined,
  });
  // (a door held: the fill across Use, its share the page's `scaleX`)
  const fillPage = pill.page.querySelector<HTMLElement>('.tv-fill');
  const holds = use && pill.page.classList.contains('holds');
  const share = holds ? Number(/scaleX\(([\d.]+)\)/.exec(fillPage?.style.transform ?? '')?.[1] ?? 0) : 0;
  pill.fill.show(holds);
  pill.fill.style({ width: `${share * 100}%` });
  pill.fill.look({ fill: faded(colour, 0.45) });
  const says = use ? pill.page.querySelector('.tv-says')?.textContent ?? '' : pill.page.textContent ?? '';
  pill.words.say(says, { ...PILL, color: use ? '#ffe7b0' : PILL.color });
}

function followPills(): void {
  const pages = [...document.querySelectorAll<HTMLElement>('#touch-village button')];
  const same = pages.length === pills.length && pages.every((page, at) => pills[at].page === page);
  if (!same) {
    for (const pill of pills) pill.root.remove();
    pills = pages.map(makePill);
  }
  for (const pill of pills) followPill(pill);
}

/** The touch controls brought up to the page's. */
function follow(): void {
  for (const ghost of document.querySelectorAll(GHOSTS)) ghost.classList.add('kit-ghost');
  const touch = document.body.classList.contains('touch');
  if (!root && !touch) return;
  rootOf().show(touch);
  if (!touch) return;
  if (!rounds.length) {
    for (const [id, side] of ROUND) {
      const button = new Panel(rootOf(), { position: 'absolute', alignItems: 'center', justify: 'center' },
        { fill: ROUND_FILL });
      rounds.push({ id, button, icon: new Panel(button, { width: side, height: side }), side });
    }
  }
  followStick();
  followSkills();
  for (const round of rounds) followRound(round);
  followPills();
}

/** The touch controls drawn by the engine from now on, their page elements taking the fingers and painting nothing. */
export function drawTouch(): void {
  onFrame(follow);
}
