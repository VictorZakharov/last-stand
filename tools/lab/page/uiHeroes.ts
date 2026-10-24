// tools/lab ui `heroes`: the hero selection screen (src/ui/heroSelect.ts) over the hall of heroes (src/game/hall.ts),
// opened as a player opens it, by the lobby's Change hero clicked with the mouse, and pictured once the camera has
// come to the hero and his showcase is over. Checked: the screen and the hall up, the hero in focus the lobby's own,
// his card shown and every other hidden, the hero standing in the room the panel leaves (his middle on the screen,
// clear of the panel, the arrows and the heroes' names, head to feet within the window, and tall enough to read); the
// screen's parts within the window and none over another; the choice within reach, its words within it; the hero
// beside him clicked and in focus as he would be; each hero's name clicked in turn, the card's parts and the choice
// keeping their places in the panel (a shift as the hero changed); and the screen closed by Esc, the lobby back with
// its hero. Read through the page and the scene alone (the heroes by their names, `hero <class>`): main's side of an
// A/B has no such screen, and says so. Then a finger dragged across the scene: the camera following it, and the
// hero it carried the row to in focus as it lifts. The canary lays Back over the heroes' names and pushes a card's
// traits down, which must be found.
import { G } from '../../../src/state';
import type { Lab } from './lab';
import type * as THREE from 'three';

/** frames run after Change hero is clicked: the camera's flight in, the hero's showcase over (s at 60 a second) */
const SETTLE_FRAMES = 300;
/** frames run after another hero is clicked: the camera on its way to him */
const FOCUS_FRAMES = 30;
/** the least height of the hero in focus on the screen, a share of the window's (he's who the screen is about) */
const HERO_TALL = 0.4;
/** how far a box may reach past the window, or into another, and still be within it (css px: rounding) */
const SLACK = 0.5;

/** What the state found: lines for its report, and its problems. */
interface Found {
  lines: string[];
  problems: string[];
}

/** Where a hero shows on the screen: his middle, and his head's and feet's heights (css px). */
interface Placed {
  x: number;
  y: number;
  top: number;
  bottom: number;
}

/** what `openHeroes` saw: the hero the lobby had, and whether the tree has the screen at all */
let opened: { before: string; screen: boolean } | null = null;

const screenOf = (): HTMLElement | null => document.getElementById('heroes');
/** whether `element` is laid out and visible (the screen is fixed: it has no `offsetParent`) */
const shown = (element: Element | null): boolean => !!element?.checkVisibility({ visibilityProperty: true });

/** Change hero clicked with the mouse, and the camera's flight and the hero's showcase played out. */
export async function openHeroes(lab: Lab): Promise<void> {
  const button = document.getElementById('btn-hero');
  opened = { before: G.player.cls.id, screen: !!button && !!screenOf() };
  if (!button) return;
  await lab.clickOn(button);
  await lab.step(SETTLE_FRAMES);
}

/** The screen closed by Esc, as a player goes back to the lobby. */
export async function closeHeroes(lab: Lab): Promise<void> {
  if (!opened?.screen || !shown(screenOf())) return;
  await lab.step(1, () => ({ keys: ['escape'] }));
}

/** The heroes the hall shows: the scene's heroes drawn (the lobby's own is hidden while it's up), by class. */
function hallHeroes(): Map<string, THREE.Object3D> {
  const heroes = new Map<string, THREE.Object3D>();
  for (const object of G.scene.children) {
    if (object.visible && object.name.startsWith('hero ')) heroes.set(object.name.slice(5), object);
  }
  return heroes;
}

/** Where `hero` shows on the screen. */
function onScreen(hero: THREE.Object3D): Placed {
  const height = G.player.model.height;
  const to = (up: number) => {
    const point = hero.position.clone().setY(hero.position.y + up).project(G.camera);
    return { x: (point.x * 0.5 + 0.5) * innerWidth, y: (-point.y * 0.5 + 0.5) * innerHeight };
  };
  const middle = to(height / 2);
  return { x: middle.x, y: middle.y, top: to(height).y, bottom: to(0).y };
}

/** The screen's parts that mustn't lie over one another, by name, as laid out. */
function parts(screen: HTMLElement): [string, DOMRect][] {
  const named: [string, string][] = [
    ['the title', '.hs-top'], ['the panel', '.hs-panel'], ['the previous arrow', '.hs-prev'],
    ['the next arrow', '.hs-next'], ['the heroes\' names', '.hs-tabs'], ['Back', '.hs-back'],
  ];
  const boxes: [string, DOMRect][] = [];
  for (const [name, selector] of named) {
    const element = screen.querySelector(selector);
    if (shown(element)) boxes.push([name, boxOf(element!)]);
  }
  return boxes;
}

/** Where `element` is drawn: the heroes' names are a row across the room the panel leaves that takes no pointer, so
 *  the names themselves. */
function boxOf(element: Element): DOMRect {
  if (!element.classList.contains('hs-tabs')) return element.getBoundingClientRect();
  const names = [...element.children].map((name) => name.getBoundingClientRect());
  const left = Math.min(...names.map((box) => box.left)), right = Math.max(...names.map((box) => box.right));
  const top = Math.min(...names.map((box) => box.top)), bottom = Math.max(...names.map((box) => box.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right - SLACK && b.left < a.right - SLACK && a.top < b.bottom - SLACK && b.top < a.bottom - SLACK;
}

function within(box: DOMRect): boolean {
  const across = box.left >= -SLACK && box.right <= innerWidth + SLACK;
  return across && box.top >= -SLACK && box.bottom <= innerHeight + SLACK;
}

/** Whether `element`'s words lie within its padding (they may reach into it, short of its border, unclipped). */
function wordsFit(element: Element): boolean {
  const words = document.createRange();
  words.selectNodeContents(element);
  const box = words.getBoundingClientRect();
  const style = getComputedStyle(element);
  const inner = element.getBoundingClientRect();
  const left = inner.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
  const right = inner.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
  return box.left >= left - SLACK && box.right <= right + SLACK;
}

const percent = (value: number, whole: number): string => (value / whole * 100).toFixed(1);

/** The hero in focus where the screen leaves him room: problems where he isn't. */
function heroPlaced(id: string, boxes: [string, DOMRect][]): Found {
  const hero = hallHeroes().get(id);
  if (!hero) return { lines: [], problems: [`heroes: the ${id} in focus isn't drawn`] };
  const at = onScreen(hero);
  const tall = (at.bottom - at.top) / innerHeight;
  const where = `${percent(at.x, innerWidth)},${percent(at.y, innerHeight)}`;
  const lines = [`  the ${id} at ${where}% of the window, ${percent(tall, 1)}% of its height`];
  const problems: string[] = [];
  if (tall < HERO_TALL) problems.push(`heroes: the ${id} stands ${percent(tall, 1)}% of the window tall`);
  for (const [name, box] of boxes) {
    if (name === 'the title') continue;
    if (at.x > box.left && at.x < box.right && at.y > box.top && at.y < box.bottom) {
      problems.push(`heroes: the ${id}'s middle is under ${name}`);
    }
  }
  const off = at.x < 0 || at.x > innerWidth || at.y < 0 || at.y > innerHeight;
  if (off) problems.push(`heroes: the ${id} is off the screen`);
  else if (at.top < 0 || at.bottom > innerHeight) problems.push(`heroes: the ${id}'s head or feet are past the window`);
  return { lines, problems };
}

/** Whether `hero`'s middle shows on the screen, clear of the panel. */
function clickable(hero: THREE.Object3D): boolean {
  const at = onScreen(hero);
  const panel = document.querySelector('.hs-panel')?.getBoundingClientRect();
  return at.x > 0 && at.x < (panel?.left ?? innerWidth) && at.y > 0 && at.y < innerHeight;
}

/** The hero beside the one in focus clicked where he stands, as a player picks him: whether the focus came to him
 *  (the screen's card and name), then the one before clicked back by his name. */
async function clickBeside(lab: Lab, id: string): Promise<Found> {
  const heroes = hallHeroes();
  const other = [...heroes.keys()].find((key) => key !== id && clickable(heroes.get(key)!));
  if (!other) return { lines: ['  no other hero on the screen to click'], problems: [] };
  await lab.click(onScreen(heroes.get(other)!));
  await lab.step(FOCUS_FRAMES);
  const card = document.querySelector<HTMLElement>('.hs-card.active')?.dataset.c;
  const name = document.querySelector<HTMLElement>('.hs-tabs .active')?.dataset.c;
  const back = document.querySelector<HTMLElement>(`.hs-tabs [data-c="${id}"]`);
  if (back) await lab.clickOn(back);
  await lab.step(1);
  const lines = [`  the ${other} beside him clicked: the ${card ?? 'no'} card and the ${name ?? 'no'} name shown`];
  const problems = card === other && name === other ? [] : [`heroes: the ${other} clicked, the ${card} in focus`];
  return { lines, problems };
}

/** The parts laid out (`canary`: Back laid over the heroes' names first), and those over another or past the
 *  window. */
function partsPlaced(screen: HTMLElement, canary: boolean): { boxes: [string, DOMRect][]; problems: string[] } {
  const back = screen.querySelector<HTMLElement>('.hs-back')!;
  const names = boxOf(screen.querySelector('.hs-tabs')!);
  if (canary) Object.assign(back.style, { left: `${names.left}px`, top: `${names.top}px`, bottom: 'auto' });
  const boxes = parts(screen);
  back.style.cssText = '';
  const problems: string[] = [];
  for (const [name, box] of boxes) if (!within(box)) problems.push(`heroes: ${name} reaches past the window`);
  for (const [i, [name, box]] of boxes.entries()) {
    for (const [other, its] of boxes.slice(i + 1)) {
      if (overlaps(box, its)) problems.push(`heroes: ${name} lies over ${other}`);
    }
  }
  return { boxes, problems };
}

/**
 * The screen as it opened (`openHeroes`), checked; then the hero beside clicked, each hero's name in turn (the
 * panel's parts kept in their places) and the scene dragged. `canary`: Back laid over the heroes' names, and a card's
 * traits pushed down, which must both be found.
 */
export async function heroesShown(canary: boolean, lab: Lab): Promise<Found> {
  if (!opened?.screen) return { lines: ['  no hero selection screen in this tree'], problems: [] };
  const screen = screenOf()!;
  const id = opened.before;
  if (!shown(screen)) return { lines: [], problems: ['heroes: Change hero clicked, and no screen came'] };
  const { boxes, problems } = partsPlaced(screen, canary);
  const drawn = [...hallHeroes().keys()];
  const card = screen.querySelector<HTMLElement>('.hs-card.active')?.dataset.c;
  const cards = [...screen.querySelectorAll('.hs-card')];
  const visible = cards.filter((each) => getComputedStyle(each).visibility === 'visible').length;
  const lines = [`  the hall: ${drawn.join(', ')} drawn; the ${card ?? 'no'} card shown (${visible} visible)`];
  if (card !== id) problems.push(`heroes: opened from the ${id}, the ${card} in focus`);
  if (visible !== 1) problems.push(`heroes: ${visible} cards visible`);
  if (G.player.obj.visible) problems.push('heroes: the lobby\'s hero drawn over the hall');
  const cardsBox = screen.querySelector<HTMLElement>('.hs-cards')!;
  const scrolls = cardsBox.scrollHeight > cardsBox.clientHeight + 1;
  const choose = screen.querySelector('.hs-choose')!;
  lines.push(`  the card ${scrolls ? 'scrolls in' : 'fits'} the panel; the choice says "${choose.textContent}"`);
  if (!within(choose.getBoundingClientRect())) problems.push('heroes: the choice reaches past the window');
  if (!wordsFit(choose)) problems.push("heroes: the choice's words reach its edges");
  const placed = heroPlaced(id, boxes);
  const clicked = await clickBeside(lab, id);
  const steady = await cardsSteady(lab, screen, canary);
  const swept = await dragged(lab, screen);
  lines.push(...placed.lines, ...clicked.lines, ...steady.lines, ...swept.lines);
  problems.push(...placed.problems, ...clicked.problems, ...steady.problems, ...swept.problems);
  return { lines, problems };
}

/** the card's parts that must stand in the same place whichever hero's card is shown, and the choice */
const STEADY_PARTS: [string, string][] = [
  ['traits', '.hs-card.active .hs-traits'], ['skills', '.hs-card.active .hs-skills'],
  ['records', '.hs-card.active .hs-records'], ['choice', '.hs-choose'],
];

/** Where `element`'s box is laid out within `root` (css px), its transforms left out (a card fades up as it shows). */
function laidOutIn(element: HTMLElement, root: HTMLElement): { x: number; y: number; height: number } {
  let x = 0;
  let y = 0;
  for (let at: HTMLElement | null = element; at && at !== root; at = at.offsetParent as HTMLElement | null) {
    x += at.offsetLeft;
    y += at.offsetTop;
  }
  return { x, y, height: element.offsetHeight };
}

/** Each hero's name clicked in turn, as a player goes through them: the panel's parts where his card lays them out.
 *  One that stands elsewhere for another hero is a layout shift (`canary`: the second card's traits pushed down). */
async function cardsSteady(lab: Lab, screen: HTMLElement, canary: boolean): Promise<Found> {
  const panel = screen.querySelector<HTMLElement>('.hs-panel')!;
  const names = [...screen.querySelectorAll<HTMLElement>('.hs-tabs [data-c]')];
  const planted = canary ? screen.querySelectorAll<HTMLElement>('.hs-card .hs-traits')[1] : undefined;
  if (planted) planted.style.marginTop = '20px';
  const places = new Map<string, Map<string, { x: number; y: number; height: number }>>();
  for (const name of names) {
    await lab.clickOn(name);
    await lab.step(2);
    const parts = new Map<string, { x: number; y: number; height: number }>();
    for (const [part, selector] of STEADY_PARTS) {
      const element = screen.querySelector<HTMLElement>(selector);
      if (element && shown(element)) parts.set(part, laidOutIn(element, panel));
    }
    places.set(name.dataset.c!, parts);
  }
  if (planted) planted.style.marginTop = '';
  const [first, ...rest] = [...places.entries()];
  const problems: string[] = [];
  for (const [hero, parts] of rest) {
    for (const [part, at] of parts) {
      const was = first[1].get(part);
      if (!was) continue;
      const moved = Math.max(Math.abs(at.x - was.x), Math.abs(at.y - was.y), Math.abs(at.height - was.height));
      if (moved <= SLACK) continue;
      problems.push(`heroes: the ${part} moved ${moved.toFixed(1)} px from the ${first[0]}'s card to the ${hero}'s`);
    }
  }
  const verdict = problems.length ? `${problems.length} parts moved` : 'every part kept its place';
  return { lines: [`  each hero's name clicked in turn (${[...places.keys()].join(', ')}): ${verdict}`], problems };
}

/** how far a drag carries the scene, in the heroes' spacing on the screen, and the frames it's moved over */
const DRAG_HEROES = 1.6;
const DRAG_FRAMES = 10;
/** how far the camera must have gone with the finger by the drag's middle, a share of the drag (it glides after) */
const DRAG_FOLLOW = 0.3;

/** The heroes' spacing on the screen (css px): from the first to the second as the camera shows them. */
function heroSpacing(): number {
  const [first, second] = [...hallHeroes().values()].map((hero) => onScreen(hero).x);
  return Math.abs(second - first);
}

/** The camera's place along the row, in heroes from the first (the scene's own: where it stands over the row). */
function cameraAlongRow(): number {
  const xs = [...hallHeroes().values()].map((hero) => hero.position.x);
  return (G.camera.position.x - xs[0]) / (xs[1] - xs[0]);
}

/** A finger dragged across the scene towards the first hero, held still, and lifted, as a player pans to a hero:
 *  the camera following it as it moves, and the hero in focus where it carried the row to (`DRAG_HEROES`, short of
 *  the room the panel leaves). */
async function dragged(lab: Lab, screen: HTMLElement): Promise<Found> {
  const ids = [...hallHeroes().keys()];
  const before = ids.indexOf(screen.querySelector<HTMLElement>('.hs-card.active')?.dataset.c ?? '');
  const spacing = heroSpacing();
  const panel = screen.querySelector('.hs-panel')!.getBoundingClientRect();
  // (the room the panel leaves: beside it, up to it; over an upright screen's, the window's width)
  const room = panel.top < innerHeight * 0.4 ? panel.left : innerWidth;
  // (in the open scene: over an upright screen's panel, half way down the room above it, clear of the names)
  const from = { x: room * 0.15, y: panel.top < innerHeight * 0.4 ? innerHeight * 0.5 : panel.top * 0.45 };
  const across = Math.min(DRAG_HEROES * spacing, room * 0.7);
  const expected = Math.max(0, Math.min(ids.length - 1, Math.round(before - across / spacing)));
  const start = cameraAlongRow();
  await lab.touchDown(from);
  let midway = start;
  for (let frame = 1; frame <= DRAG_FRAMES; frame++) {
    await lab.touchMove({ x: from.x + across * frame / DRAG_FRAMES, y: from.y });
    await lab.step(1);
    if (frame === DRAG_FRAMES / 2) midway = cameraAlongRow();
  }
  await lab.step(DRAG_FRAMES);
  await lab.touchUp();
  await lab.step(FOCUS_FRAMES);
  const landed = screen.querySelector<HTMLElement>('.hs-card.active')?.dataset.c;
  const followed = (start - midway) / (across / spacing / 2);
  const line = `  dragged ${(across / spacing).toFixed(2)} heroes' spacing from the ${ids[before]}: the camera went `
    + `${(followed * 100).toFixed(0)}% of the way with the finger by its middle, landed on the ${landed ?? 'none'}`;
  const problems: string[] = [];
  if (followed < DRAG_FOLLOW) problems.push(`heroes: the camera went ${(followed * 100).toFixed(0)}% of a drag's way`);
  if (landed !== ids[expected]) problems.push(`heroes: dragged to the ${ids[expected]}, landed on the ${landed}`);
  return { lines: [line], problems };
}

/** Whether the canaries were found among `problems`: Back over the heroes' names, and the card's moved traits. */
export const heroesCanaryCaught = (problems: string[]): boolean =>
  problems.some((problem) => problem.includes('Back lies over') || problem.includes('lies over Back'))
  && problems.some((problem) => problem.includes(' moved '));

/** After the screen closed by Esc: the lobby back, its hero drawn. */
export function heroesClosed(): Found {
  if (!opened?.screen) return { lines: [], problems: [] };
  const problems: string[] = [];
  if (shown(screenOf())) problems.push('heroes: Esc left the screen up');
  if (!G.player.obj.visible) problems.push('heroes: the lobby\'s hero stayed hidden');
  if (!shown(document.getElementById('menu'))) problems.push('heroes: the lobby\'s panels never came back');
  const back = problems.length ? 'not all of the lobby back' : 'the lobby back with its hero';
  return { lines: [`  closed by Esc: ${back}`], problems };
}
