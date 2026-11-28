// The wave's badge at the top of the run's HUD, drawn by the engine (ui/kit; #973): a round rimmed gem, its label
// ("Wave", or a duel's "Round") over its number. It was `#wavebadge`, styled by `_hud.scss`; its sizes, colours and
// fonts are those, in px of the HUD's reference layout. The page's `#wavebadge` stays, out of sight
// (`.kit-mirror`): what the game writes in it (`hud.ts`, `duelHud.ts`) and its classes are read each frame, so its
// writers are as they were: `morphed` as the choice after a wave grows out of it (it fades), `back` as the choice
// folds into it again (it flares).
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import type { TextStyle } from './overlay/paint';
import { along, ease, now, reducedMotion } from './kit/motion';

const FRAME = '#a07c46';
const GLOW = 'rgba(240,190,90,';
const LABEL: TextStyle = { face: 'body', size: 9, spacing: 2, upper: true, color: '#9a8f7c' };
const NUM: TextStyle = {
  face: 'display', size: 28, weight: 900, color: '#e2c07e', line: 1,
  shadows: [{ x: 0, y: 0, blur: 8, color: `${GLOW}.5)` }],
};
/** the dark halo round it (`.gem`'s box-shadow) */
const HALO = { blur: 18, color: 'rgba(0,0,0,.9)' };
/** its top (px), its side, its rim */
const TOP = 10;
const SIDE = 70;
const RIM = 3;
/** its fade as the choice grows out of it and back (s: its CSS transition, the way out after a wait) */
const FADE = 0.3;
const FADE_WAIT = 0.12;
/** its flare (s: `gem-flare`, at its brightest 30% of the way), as the choice leaves it and as it comes back */
const FLARE_OUT = 0.3;
const FLARE_BACK = 0.6;
const FLARE_PEAK = 0.3;
/** its number's pop as it comes back (s: `gem-num`, its fade in alone) */
const POP = 0.5;

interface Badge { root: Panel; ring: Panel; gem: Panel; label: Panel; num: Panel }

let badge: Badge | null = null;
/** where its fade stood and where it goes, from when (s of the page's clock) */
const fade = { from: 1, to: 1, at: -Infinity, wait: 0 };
/** when it last flared and for how long, when its number last popped */
const flare = { at: -Infinity, time: FLARE_BACK };
let popAt = -Infinity;
let morphed = false;
let back = false;

function make(): Badge {
  const root = new Panel(null, { position: 'absolute', inset: [TOP, 0, 'auto', 0], direction: 'column',
    alignItems: 'center' });
  // (its black ring and dark halo, laid out as if they weren't there, as CSS's box-shadow is)
  const ring = new Panel(root, { border: 2, margin: -2 }, { border: '#000', radius: SIDE / 2 + 2, shadow: HALO });
  const gem = new Panel(ring, {
    width: SIDE, height: SIDE, border: RIM, direction: 'column', alignItems: 'center', justify: 'center',
  }, { fill: ['#3a3430', '#0c0a0a'], radial: { y: 0.35, stop: 0.7 }, border: FRAME, radius: SIDE / 2 });
  const label = new Panel(gem, { margin: [2, 0, 0, 0] });
  const num = new Panel(gem, {});
  const page = document.getElementById('wavebadge');
  if (page) standIn(page, gem);
  return { root, ring, gem, label, num };
}

/** Whether the page's HUD shows the badge: the run's, not the lobby's. */
function hudShows(): boolean {
  const hud = document.getElementById('hud');
  return !!hud && !hud.classList.contains('hidden') && !hud.classList.contains('lobby');
}

/** The badge brought up to its mirror on the page: its words, whether it shows, its fade and flare. */
function follow(): void {
  const mirror = document.getElementById('wavebadge');
  if (!mirror) return;
  const shows = hudShows();
  if (!badge && !shows) return;
  badge ??= make();
  const b = badge;
  b.root.show(shows);
  if (!shows) return;
  b.label.say(mirror.querySelector('.gem-label')?.textContent ?? '', LABEL);
  b.num.say(mirror.querySelector('.gem-num')?.textContent ?? '', NUM);
  const isMorphed = mirror.classList.contains('morphed');
  const isBack = mirror.classList.contains('back');
  const still = reducedMotion();
  if (isMorphed !== morphed) {
    const at = fadeNow();
    Object.assign(fade, { from: at, to: isMorphed ? 0 : 1, at: now(), wait: isMorphed ? FADE_WAIT : 0 });
    if (isMorphed) Object.assign(flare, { at: now(), time: FLARE_OUT });
    morphed = isMorphed;
  }
  if (isBack && !back) {
    Object.assign(flare, { at: now(), time: FLARE_BACK });
    popAt = now();
  }
  back = isBack;
  const opacity = still ? fade.to : fadeNow();
  const glow = still ? 0 : flareNow();
  b.ring.look({
    opacity,
    shadow: glow > 0 ? { blur: 30, color: `${GLOW}${(0.8 * glow).toFixed(3)})` } : HALO,
  });
  b.num.look({ opacity: still ? 1 : ease(along(popAt, POP)) });
}

/** Its fade's share now. */
function fadeNow(): number {
  return fade.from + (fade.to - fade.from) * ease(along(fade.at + fade.wait, FADE));
}

/** Its flare's share now: up to its peak, then down. */
function flareNow(): number {
  const t = along(flare.at, flare.time);
  if (t >= 1) return 0;
  return t < FLARE_PEAK ? t / FLARE_PEAK : (1 - t) / (1 - FLARE_PEAK);
}

/** The badge drawn by the engine from now on, its page's own put out of sight. */
export function drawWaveBadge(): void {
  document.getElementById('wavebadge')?.classList.toggle('kit-mirror', true);
  onFrame(follow);
}

/** What the badge shows and its box (css px), if it's shown (the lab reads it). */
export function waveBadgeShown(): { label: string; num: string; box: { x: number; y: number; w: number; h: number } | null }
  | null {
  return badge && hudShows() ? { label: badge.label.said, num: badge.num.said, box: badge.gem.rect() } : null;
}
