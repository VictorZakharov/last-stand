// tools/lab ui `target`: the run's target frame (src/ui/targetFrame.ts: drawn by the engine since #973; `#target` on
// the page before it), its foe's name, its line and its bar, with the mouse on a hurt foe and then on a boss. Read as
// the game shows it: the engine's frame's words and box where the tree has it, the page's `#target` where it hasn't
// (main's, for --ab), and pictured round where it stands, under the wave's badge. The canary aims the mouse away from
// every foe, and the frame must be found not shown.
import { Vec3 } from './sceneApi.ts';
import { G } from '../../../src/state';
import { uiScales } from '../../../src/ui/scale';
import type { Enemy } from '../../../src/entities/enemy';
import type { Frame, Lab, Pictured } from './lab';
import type { Found } from './uiKit';

/** how far beside the hero the foe is held, and how far off the canary aims (m) */
const BESIDE = 2.5;
const AWAY = 30;
/** frames the mouse rests on the foe for the HUD to name it, and the frame's bar to settle (its ghost's run: 0.6 s) */
const REST_FRAMES = 45;
/** the area pictured round the frame, in px of the HUD's reference layout: across the screen's middle, under the
 *  badge (the boss's bar is 520 px wide) */
const AREA = { width: 600, top: 70, height: 110 };
/** how far off the screen's middle the frame's box may be centred (css px: rounding) */
const SLACK = 1;

/** What the frame shows, as the game shows it. */
interface Shown { name: string; sub: string; box: { x: number; y: number; w: number; h: number } | null }

/** The engine's target frame's module (ui/targetFrame.ts), where the tree has it. */
interface TargetFrame { targetShown(): Shown | null }

/** the foe aimed at, and what each case read */
let aimed: Enemy | null = null;
const read: { foe: Shown | null; boss: Shown | null } = { foe: null, boss: null };

/** The frame's words and box as the game shows them, or null where it isn't shown. */
async function frameShown(): Promise<Shown | null> {
  const box = document.querySelector<HTMLElement>('#target');
  if (box) {
    if (box.classList.contains('hidden')) return null;
    const r = box.getBoundingClientRect();
    return {
      name: box.querySelector('.t-name')?.textContent ?? '',
      sub: box.querySelector('.t-sub')?.textContent ?? '',
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  }
  // (by a glob: a tree without the module, an import of it would stop this one loading)
  const found = import.meta.glob<TargetFrame>('../../../src/ui/targetFrame.ts');
  const load = Object.values(found)[0];
  return load ? (await load()).targetShown() : null;
}

/** The hurt foe the run's set-up stood ahead of him. */
function hurtFoe(): Enemy | null {
  return G.enemies.find((foe) => foe.alive && !foe.spawning) ?? null;
}

/** A frame's input: the foe held beside the hero, in the open by the screen's middle, and the mouse on its feet
 *  (where it stood, by the run's wall, the mouse over its feet met the wall's walk behind it, 4 m off, and it walked
 *  out from under the mouse as the HUD named it); in the canary's run the mouse away from every foe. */
export function onFoe(): Frame {
  if (!aimed) return {};
  const hero = G.player.pos;
  aimed.pos.set(hero.x + BESIDE, aimed.pos.y, hero.z);
  if (away) return { aim: new Vec3(hero.x - AWAY, 0, hero.z - AWAY) };
  return { aim: new Vec3(aimed.pos.x, 0, aimed.pos.z) };
}

/** whether the canary aims away from every foe */
let away = false;

/** The mouse rests on the hurt foe, which is read; then the foe is made a boss, read again. */
export async function openTarget(lab: Lab): Promise<void> {
  aimed = hurtFoe();
  read.foe = null;
  read.boss = null;
  if (!aimed) return;
  await lab.step(REST_FRAMES, onFoe);
  read.foe = await frameShown();
  await asBoss(lab, async () => { read.boss = await frameShown(); });
}

/** `then` done with the foe aimed at made a boss, and it a plain foe again after (its frame settled again). */
async function asBoss(lab: Lab, then: () => Promise<unknown>): Promise<void> {
  const foe = aimed as Enemy & { boss: boolean };
  const was = foe.boss;
  foe.boss = true;
  try {
    await lab.step(REST_FRAMES, onFoe);
    await then();
  } finally {
    foe.boss = was;
    await lab.step(REST_FRAMES, onFoe);
  }
}

/** The canary's aim put back. */
export function closeTarget(): void {
  away = false;
}

/** The area round the frame, in css px. */
function frameArea(): { x: number; y: number; width: number; height: number } {
  const k = uiScales.hud;
  const width = Math.min(innerWidth, AREA.width * k);
  return { x: (innerWidth - width) / 2, y: AREA.top * k, width, height: AREA.height * k };
}

/** The frame round a hurt foe, then round the same foe made a boss. */
export async function targetPictures(lab: Lab): Promise<Pictured[]> {
  await lab.step(1, onFoe);
  const pictures = [await lab.screen('target-foe', ['a hurt foe aimed at'], frameArea())];
  if (!aimed) return pictures;
  await asBoss(lab, async () => {
    pictures.push(await lab.screen('target-boss', ['the same foe made a boss'], frameArea()));
  });
  return pictures;
}

/** The frame named for the foe aimed at, centred under the badge, and as a boss named so; the canary aims away. */
export async function targetChecked(canary: boolean, lab: Lab): Promise<Found> {
  const lines: string[] = [];
  const problems: string[] = [];
  if (!aimed) return { lines, problems: ['target: no foe to aim at'] };
  if (canary) {
    away = true;
    await lab.step(REST_FRAMES, onFoe);
    read.foe = await frameShown();
  }
  const foe = read.foe;
  lines.push(`  target: ${foe ? `"${foe.name}" / "${foe.sub}"` : 'not shown'} with a hurt foe aimed at`);
  if (!foe) {
    problems.push('target: the frame isn\'t shown with a foe aimed at');
    return { lines, problems };
  }
  if (foe.name !== aimed.name) problems.push(`target: the frame names "${foe.name}", not "${aimed.name}"`);
  if (foe.box) {
    const off = foe.box.x + foe.box.w / 2 - innerWidth / 2;
    lines.push(`  target: its box ${Math.round(foe.box.w)}x${Math.round(foe.box.h)} at ${Math.round(foe.box.y)}, `
      + `${off.toFixed(1)} px off the middle`);
    if (Math.abs(off) > SLACK) problems.push(`target: the frame stands ${off.toFixed(1)} px off the screen's middle`);
  }
  const boss = read.boss;
  lines.push(`  target: ${boss ? `"${boss.name}" / "${boss.sub}"` : 'not shown'} with it made a boss`);
  if (!boss || boss.sub !== 'Boss') problems.push('target: the frame doesn\'t name a boss as one');
  return { lines, problems };
}
