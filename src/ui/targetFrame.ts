// The target frame at the top of the run's HUD, drawn by the engine (ui/kit; #973: the first of the page's panels
// moved off it): the foe aimed at (or the encounter's boss), its name, its line under it (a guard, a boss and what
// wards it, a hero) and its life, a ghost of the life it just lost running down after it. It was `#target`, styled
// by `_hud.scss`; its sizes, colours and fonts are those, in px of the HUD's reference layout.
import { G } from '../state';
import { Panel } from './kit/panel';
import type { TextStyle } from './overlay/paint';

const INK_DIM = '#9a8f7c';
const FRAME_DARK = '#4a3620';
const NAME: TextStyle = {
  face: 'display', size: 19, weight: 700, color: '#f5d27a',
  shadows: [{ x: 0, y: 2, blur: 4, color: '#000' }, { x: 0, y: 0, blur: 10, color: '#000' }],
};
const BOSS_NAME: TextStyle = { ...NAME, size: 24, color: '#d8b0ff' };
const SUB: TextStyle = { face: 'body', size: 12, color: INK_DIM, shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }] };
/** the frame's top, under the wave's badge (px; in a duel under the score and the round's clock) */
const TOP = 88;
const TOP_IN_DUEL = 150;
/** the ghost's run down after the life lost: a wait, then an ease out over its time (s), as its CSS transition */
const GHOST_WAIT = 0.1;
const GHOST_TIME = 0.5;

/** What the frame shows: a target's name, its line, its life's share and whether it's a boss. */
export interface Target { name: string; sub: string; life: number; boss: boolean }

/** The frame's panels, made the first time it's shown. */
interface Frame { root: Panel; box: Panel; name: Panel; sub: Panel; ring: Panel; bar: Panel; fill: Panel; ghost: Panel }

let frame: Frame | null = null;
let shown: Target | null = null;
/** the ghost's share and its run: from where to where, and when it set off (game time) */
const ghost = { share: 1, from: 1, to: 1, at: -Infinity };

function make(): Frame {
  const root = new Panel(null, {
    position: 'absolute', inset: [TOP, 0, 'auto', 0], direction: 'column', alignItems: 'center',
  });
  const box = new Panel(root, { direction: 'column', alignItems: 'center', minWidth: 260 });
  const name = new Panel(box, {});
  const sub = new Panel(box, { margin: [0, 0, 3, 0] });
  // (a ring round the bar laid out as if it weren't there, as CSS's box-shadow was)
  const ring = new Panel(box, { border: 1, margin: -1 }, { border: FRAME_DARK });
  const bar = new Panel(ring, { width: 300, height: 12, border: 1 }, { fill: '#120808', border: '#000' });
  const ghostBar = new Panel(bar, { position: 'absolute', inset: [0, 'auto', 0, 0] }, { fill: 'rgba(255,220,160,.5)' });
  const fill = new Panel(bar, { position: 'absolute', inset: [0, 'auto', 0, 0] }, { fill: ['#e03a30', '#7a0a0a'] });
  return { root, box, name, sub, ring, bar, fill, ghost: ghostBar };
}

/** The frame shows `target` (none: hidden), placed for a duel's HUD or a run's. */
export function showTarget(target: Target | null, duel: boolean): void {
  if (!target) {
    if (frame && shown) frame.root.show(false);
    shown = null;
    return;
  }
  frame ??= make();
  const f = frame;
  f.root.show(true);
  if (!shown || shown.boss !== target.boss) {
    f.bar.style({ width: target.boss ? 520 : 300, height: target.boss ? 16 : 12 });
    f.ring.look(target.boss
      ? { border: '#a060ff', shadow: { blur: 14, color: 'rgba(160,96,255,.5)' } }
      : { border: FRAME_DARK, shadow: undefined });
  }
  f.root.style({ inset: [duel ? TOP_IN_DUEL : TOP, 0, 'auto', 0] });
  f.name.say(target.name, target.boss ? BOSS_NAME : NAME);
  // (an empty line is no line, its margin kept: as the page's empty box)
  f.sub.say(target.sub, SUB);
  const life = Math.max(0, Math.min(1, target.life));
  if (!shown || shown.name !== target.name) {
    // (another target: no ghost run from the last one's life)
    Object.assign(ghost, { share: life, from: life, to: life, at: -Infinity });
  } else if (life !== ghost.to) {
    Object.assign(ghost, { from: ghost.share, to: life, at: G.time });
  }
  const t = Math.max(0, Math.min(1, (G.time - ghost.at - GHOST_WAIT) / GHOST_TIME));
  ghost.share = ghost.from + (ghost.to - ghost.from) * (1 - (1 - t) ** 3);
  f.fill.style({ width: `${life * 100}%` });
  f.ghost.style({ width: `${ghost.share * 100}%` });
  shown = target;
}

/** What the frame shows and its box (css px), if it's shown (the lab reads it). */
export function targetShown(): { name: string; sub: string; box: { x: number; y: number; w: number; h: number } | null }
  | null {
  return frame && shown ? { name: frame.name.said, sub: frame.sub.said, box: frame.box.rect() } : null;
}
