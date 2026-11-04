// tools/lab ui `villageHud` and `villageHudTouch`: the village's minimap and the training's tracker under it, the hero
// in the training yard, where the touch skills show too: each within the window, the tracker under the minimap on the
// right, none over another of the corner's controls. Its canary makes the tracker as tall as the window.
import * as THREE from 'three';
import { yardToWorld } from '../../../src/data/village';
import { restartTraining, skipTraining } from '../../../src/game/training';
import { groundHeight } from '../../../src/world/ground';
import type { Lab } from './lab';
import type { TouchFound } from './uiTouch';

/** the canary's problem, and what it plants */
export const VILLAGE_HUD_CANARY = { name: 'reaches past the window', what: 'the tracker as tall as the window' };
/** the parts that must lie clear of each other, those a screen shows */
const PARTS = ['#minimap', '#training', '#touch-village', '#touch-skills', '#bottombar'];
/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.4, y: 0.45 };
/** a short screen's height (css px; the short-screen layout, src/ui/AGENTS.md) */
const SHORT_SCREEN = 520;
/** frames for the village's parts and the touch controls to show */
const SHOW_FRAMES = 15;

/** `selector`'s box, or null when it shows nothing. */
function boxOf(selector: string): DOMRect | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element?.checkVisibility()) return null;
  const box = element.getBoundingClientRect();
  return box.width >= 1 && box.height >= 1 ? box : null;
}

/** What each of the skills' buttons and the village's buttons covers: the parts' own children, as `#touch-skills` and
 *  `#touch-village` are wider than what they show. */
function boxesOf(selector: string): DOMRect[] {
  const whole = boxOf(selector);
  if (!whole) return [];
  if (selector !== '#touch-skills' && selector !== '#touch-village') return [whole];
  const element = document.querySelector<HTMLElement>(selector)!;
  return [...element.children]
    .filter((child) => (child as HTMLElement).checkVisibility())
    .map((child) => child.getBoundingClientRect())
    .filter((box) => box.width >= 1);
}

/** Whether boxes `a` and `b` overlap. */
function overlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The tracker begun afresh and the hero in the yard, with `touch` the page in touch mode. */
export async function openVillageHud(lab: Lab, touch: boolean): Promise<void> {
  restartTraining();
  if (touch && !document.body.classList.contains('touch')) {
    await lab.tap({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
  }
  const [x, z] = yardToWorld(0, 0);
  lab.player.walkTo = null;
  lab.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SHOW_FRAMES);
}

/** The training put away for the states after. */
export function closeVillageHud(): void {
  skipTraining();
}

/** The parts' boxes against the window and each other. */
function partsFound(): TouchFound {
  const lines: string[] = [];
  const problems: string[] = [];
  const shown = PARTS.filter((selector) => boxOf(selector));
  for (const selector of shown) {
    const box = boxOf(selector)!;
    const size = `${box.width.toFixed(0)}x${box.height.toFixed(0)}`;
    lines.push(`  ${selector}: ${size} px at ${box.left.toFixed(0)}, ${box.top.toFixed(0)}`);
    if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
      problems.push(`villageHud: ${selector} reaches past the window`);
    }
  }
  if (!shown.includes('#minimap')) problems.push('villageHud: no minimap shown');
  if (!shown.includes('#training')) problems.push('villageHud: no tracker shown');
  for (const [i, first] of shown.entries()) {
    for (const second of shown.slice(i + 1)) {
      const met = boxesOf(first).some((a) => boxesOf(second).some((b) => overlap(a, b)));
      if (met) problems.push(`villageHud: ${first} lies over ${second}`);
    }
  }
  const map = boxOf('#minimap');
  const tracker = boxOf('#training');
  // (a short screen has no room under it above the skill buttons: beside it there, on the right all the same)
  const placed = innerHeight <= SHORT_SCREEN ? tracker && map && tracker.right <= map.left : tracker && map
    && tracker.top >= map.bottom;
  if (map && tracker && !placed) problems.push('villageHud: the tracker is not under the minimap');
  return { lines, problems };
}

/** The parts checked; with the canary, again the tracker as tall as the window, which must be found. */
export function villageHudShown(canary: boolean): TouchFound {
  const found = partsFound();
  if (!canary) return found;
  const tracker = document.querySelector<HTMLElement>('#training')!;
  tracker.style.height = `${innerHeight * 2}px`;
  const planted = partsFound();
  tracker.style.height = '';
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}
