// tools/lab ui `villageMap`: the village's map laid flat, each name on it against the others and the sheet (from play,
// "need to fix the map, there is overlap": the Chronicle's name over the Stash's). None lies over another, each within
// the sheet, and each pointer's tip still at its place on the map, as a name moved aside must point where it did. Its
// canary lays one name on another.
import { setVillageMap } from '../../../src/ui/villageMap';
import type { Lab } from './lab';
import type { TouchFound } from './uiTouch';

/** the canary's problem, and what it plants */
export const VILLAGE_MAP_CANARY = { name: 'lies over', what: 'one name laid on another' };
/** frames for the map to unfold or fold (`FOLD_TIME` in `ui/villageMap.ts`, and some) */
const FOLD_FRAMES = 60;
/** how far a pointer's tip may stand from its place on the map (css px) */
const TIP_MOST_PX = 2;

/** Whether boxes `a` and `b` overlap. */
function overlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Each name on the map. */
const names = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#vmap .vm-name')];

/** The map laid flat. */
export async function openVillageMap(lab: Lab): Promise<void> {
  setVillageMap(true);
  await lab.step(FOLD_FRAMES);
}

/** The map put away. */
export async function closeVillageMap(lab: Lab): Promise<void> {
  setVillageMap(false);
  await lab.step(FOLD_FRAMES);
}

/** Where `name`'s pointer's tip stands across the page (css px): its `left` as laid out, which it's centred on. */
function tipOf(name: HTMLElement): number {
  const box = name.getBoundingClientRect();
  return box.left + parseFloat(getComputedStyle(name, '::after').left);
}

/** The names' boxes against each other and the sheet, and their tips against their places. */
function namesFound(): TouchFound {
  const sheet = document.querySelector('#vmap .vm-sheet')!.getBoundingClientRect();
  const shown = names().map((name) => ({ name, box: name.getBoundingClientRect() }));
  const problems: string[] = [];
  if (shown.length < 2) problems.push('villageMap: no names on the map');
  let worstTip = 0;
  for (const [i, { name, box }] of shown.entries()) {
    const said = name.textContent;
    if (box.left < sheet.left || box.right > sheet.right || box.top < sheet.top || box.bottom > sheet.bottom) {
      problems.push(`villageMap: "${said}" reaches past the sheet`);
    }
    const place = sheet.left + (parseFloat(name.style.left) / 100) * sheet.width;
    const off = Math.abs(tipOf(name) - place);
    worstTip = Math.max(worstTip, off);
    if (off > TIP_MOST_PX) problems.push(`villageMap: "${said}" points ${off.toFixed(1)} px off its place`);
    for (const other of shown.slice(i + 1)) {
      if (overlap(box, other.box)) problems.push(`villageMap: "${said}" lies over "${other.name.textContent}"`);
    }
  }
  const lines = [`  ${shown.length} names on a sheet ${sheet.width.toFixed(0)} px across, `
    + `their pointers at most ${worstTip.toFixed(1)} px off their places`];
  return { lines, problems };
}

/** The names checked; with the canary, again with one laid on another, which must be found. */
export function villageMapShown(canary: boolean): TouchFound {
  const found = namesFound();
  if (!canary) return found;
  const [first, second] = names();
  const heldLeft = second.style.left;
  const heldTop = second.style.top;
  second.style.left = first.style.left;
  second.style.top = first.style.top;
  const planted = namesFound();
  second.style.left = heldLeft;
  second.style.top = heldTop;
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}
