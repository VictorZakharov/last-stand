// tools/lab ui `heroes`: the hero selection screen (src/ui/heroSelect.ts) over the hall of heroes (src/game/hall.ts),
// opened as a player opens it, by the lobby's Change hero clicked with the mouse, and pictured once the camera has
// come to the hero and his showcase is over. Checked: the screen and the hall up, the hero in focus the lobby's own,
// his card shown and every other hidden, the hero standing in the room the panel leaves (his middle on the screen,
// clear of the panel, the arrows and the heroes' names, head to feet within the window, and tall enough to read); the
// screen's parts within the window and none over another; the choice within reach, its words within it; the hero
// beside him clicked and in focus as he would be; and the screen closed by Esc, the lobby back with its hero. Read through the page and the scene alone (the heroes by their
// names, `hero <class>`): main's side of an A/B has no such screen, and says so.
// The canary lays Back over the heroes' names, which must be found.
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
 * The screen as it opened (`openHeroes`), checked; then the hero beside clicked. `canary`: Back laid over the
 * heroes' names, which must be found.
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
  lines.push(...placed.lines, ...clicked.lines);
  problems.push(...placed.problems, ...clicked.problems);
  return { lines, problems };
}

/** Whether the canary's Back over the heroes' names was found among `problems`. */
export const heroesCanaryCaught = (problems: string[]): boolean =>
  problems.some((problem) => problem.includes('Back lies over') || problem.includes('lies over Back'));

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
