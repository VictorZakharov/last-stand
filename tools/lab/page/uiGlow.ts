// tools/lab ui `glow`: the stash's items that fit a hovered item's slot lit up (src/ui/menus.ts `focusSlot`, its glow
// in styles/_items.scss), pictured round the stash at set moments of the glow's looping animations, each held there,
// so a picture of this tree and of main's are of the same moment (`--ab`). And what those loops animate: only what
// the compositor moves without painting anything again (a layer's transform and opacity). Each of the glow's three
// loops animated what has to be painted again (its blurred shadow, its arc's conic gradient, its sheen's background),
// and with a full stash lit the lobby fell from 145 frames a second to 44, the frame waiting on the browser's paint
// (#267, measured by `npm run stalls -- --scenario hover --stash 40`). The canary loops a shadow on a lit item, which
// must read as painted again.
import { G } from '../../../src/state';
import { makeItem } from '../../../src/loot/items';
import { renderMenu } from '../../../src/ui/menus';
import type { Item, RarityId, Slot } from '../../../src/types';
import type { Lab, Pictured } from './lab';

/** the stash's items while the glow is pictured: so many, in turn of these slots and rarities */
const STASH_ITEMS = 20;
const SLOTS: Slot[] = ['weapon', 'chest', 'head'];
const RARITIES: RarityId[] = ['common', 'magic', 'rare', 'epic', 'legendary'];
/** the slot whose stash item is hovered */
const HOVERED: Slot = 'weapon';
/** the moments of the glow's loops pictured (ms into each) */
const MOMENTS = [400, 1000, 1600];
/** what a keyframe holds besides the properties it animates (`getKeyframes`), and the properties the compositor
 *  animates alone */
const KEYFRAME_FIELDS = new Set(['offset', 'computedOffset', 'easing', 'composite']);
const COMPOSITED = new Set(['transform', 'opacity', 'translate', 'rotate', 'scale']);
/** the canary's loop, and what its finding names */
const CANARY_NAME = 'lab-canary';

/** the hero's own stash, kept while the glow's is shown */
let kept: Item[] | null = null;

/** The stash given `STASH_ITEMS` items, and one fitting `HOVERED` hovered: those that fit its slot lit, its loops
 *  let run (the lab opens its pages with the decorative animation left out: `Lab.reduceMotion`). */
export async function openGlow(lab: Lab): Promise<void> {
  await lab.reduceMotion(false);
  kept = G.profile.stash;
  G.profile.stash = Array.from({ length: STASH_ITEMS }, (_, index) => makeItem({
    slot: SLOTS[index % SLOTS.length],
    rarity: RARITIES[index % RARITIES.length],
    cls: G.player.cls,
  }));
  renderMenu();
  const hovered = document.querySelector(`#stash .sitem[data-slot="${HOVERED}"]`);
  if (!hovered) throw new Error(`lab: ui glow: no stash item for the ${HOVERED} to hover`);
  hovered.dispatchEvent(new PointerEvent('pointerenter'));
}

/** The hero's own stash back, nothing hovered, the decorative animation left out again. */
export async function closeGlow(lab: Lab): Promise<void> {
  document.querySelector('#stash .sitem')?.dispatchEvent(new PointerEvent('pointerleave'));
  if (kept) G.profile.stash = kept;
  kept = null;
  renderMenu();
  await lab.reduceMotion(true);
}

/** The stash pictured round it at each of `MOMENTS`, every looping animation held there. */
export async function glowPictures(lab: Lab): Promise<Pictured[]> {
  const pictures: Pictured[] = [];
  for (const moment of MOMENTS) {
    for (const animation of looping()) {
      animation.pause();
      animation.currentTime = moment;
    }
    pictures.push(await lab.screen(`glow at ${moment} ms`, [], '#stash'));
  }
  return pictures;
}

/** The page's animations that loop without end. */
const looping = () => document.getAnimations().filter((animation) => {
  return animation.effect?.getComputedTiming().iterations === Infinity;
});

/**
 * The glow lit: how many items it lit, the loops they run, and those that animate what has to be painted again (its
 * name, where, the properties, how many such), a problem each. With `canary`, a lit item loops a shadow first.
 */
export function glowShown(canary: boolean): { lines: string[]; problems: string[] } {
  const lit = document.querySelectorAll('#stash .sitem.match').length;
  const planted = canary ? plantShadowLoop() : null;
  const running = looping().filter(runsLit);
  const painted = countedWords(running.flatMap(paintedBy));
  planted?.cancel();
  const painting = painted.reduce((sum, loop) => sum + loop.count, 0);
  const lines = [`  the glow: ${lit} of the stash's ${STASH_ITEMS} items lit, the ${HOVERED}s; ${running.length} `
    + `loops running, ${painting} of them animating what has to be painted again`];
  const problems = painted.map(({ words, count }) => `glow: ${count} x ${words} (painted again every frame: animate `
    + 'a layer\'s transform or opacity alone)');
  if (lit === 0) problems.push(`glow: hovering a ${HOVERED} lit none of the stash's items`);
  return { lines, problems };
}

/** Whether a loop runs: a CSS animation its element's style doesn't pause (an item not lit pauses its glow's), or
 *  one played by a script. */
function runsLit(animation: Animation): boolean {
  if (!(animation instanceof CSSAnimation)) return true;
  const effect = animation.effect;
  if (!(effect instanceof KeyframeEffect) || !effect.target) return false;
  return getComputedStyle(effect.target, effect.pseudoElement).animationPlayState !== 'paused';
}

/** The same words counted once each, the most first. */
function countedWords(all: string[]): { words: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const words of all) counts.set(words, (counts.get(words) ?? 0) + 1);
  return [...counts].map(([words, count]) => ({ words, count })).sort((a, b) => b.count - a.count);
}

/** A looping shadow on the first lit item, as a glow that paints every frame has (the canary's). */
function plantShadowLoop(): Animation | null {
  const item = document.querySelector('#stash .sitem.match');
  if (!item) return null;
  const frames = [{ boxShadow: '0 0 0 rgb(255 0 0)' }, { boxShadow: '0 0 12px rgb(255 0 0)' }];
  return item.animate(frames, { duration: 1000, iterations: Infinity, id: CANARY_NAME });
}

/** Whether a finding is the canary's planted loop. */
export const isGlowCanary = (problem: string) => problem.includes(CANARY_NAME);

/** What `animation` animates that has to be painted again, as words (nothing if it's the compositor's alone). */
function paintedBy(animation: Animation): string[] {
  const effect = animation.effect;
  if (!(effect instanceof KeyframeEffect)) return [];
  const painted = animatedBy(animation, effect).filter((property) => !COMPOSITED.has(property));
  if (painted.length === 0) return [];
  return [`${nameOf(animation)} on ${whereOf(effect)} animates ${painted.join(', ')}`];
}

/** The properties an animation animates: a CSS animation's read off its `@keyframes` rule (Chrome leaves a custom
 *  property out of `getKeyframes`, and the glow's arc, turned by one, read as animating nothing), another's off its
 *  keyframes. */
function animatedBy(animation: Animation, effect: KeyframeEffect): string[] {
  const rule = animation instanceof CSSAnimation ? keyframesRule(animation.animationName) : null;
  if (!rule) {
    const fields = effect.getKeyframes().flatMap((frame) => Object.keys(frame));
    return [...new Set(fields)].filter((field) => !KEYFRAME_FIELDS.has(field));
  }
  const properties = new Set<string>();
  for (const keyframe of rule.cssRules) {
    const { style } = keyframe as CSSKeyframeRule;
    for (let index = 0; index < style.length; index++) properties.add(style[index]);
  }
  return [...properties];
}

/** The page's `@keyframes` rule named `name` (in a style sheet or a rule within one, a media query's), or null. */
function keyframesRule(name: string): CSSKeyframesRule | null {
  const within = (rules: Iterable<CSSRule>): CSSKeyframesRule | null => {
    for (const rule of rules) {
      if (rule instanceof CSSKeyframesRule && rule.name === name) return rule;
      const found = rule instanceof CSSGroupingRule ? within(rule.cssRules) : null;
      if (found) return found;
    }
    return null;
  };
  for (const sheet of document.styleSheets) {
    const found = within(rulesOf(sheet));
    if (found) return found;
  }
  return null;
}

/** A style sheet's rules: none of one from another host, which the page can't read (the fonts', which has no
 *  keyframes of the game's). */
function rulesOf(sheet: CSSStyleSheet): Iterable<CSSRule> {
  try {
    return sheet.cssRules;
  } catch {
    return [];
  }
}

/** An animation's name: a CSS animation's, or its id. */
function nameOf(animation: Animation): string {
  if (animation instanceof CSSAnimation) return animation.animationName;
  return animation.id || 'an animation';
}

/** Where an effect runs: its element's tag and classes, and its pseudo-element. */
function whereOf(effect: KeyframeEffect): string {
  const element = effect.target;
  if (!element) return '?';
  const classes = [...element.classList].map((name) => `.${name}`).join('');
  return `${element.tagName.toLowerCase()}${classes}${effect.pseudoElement ?? ''}`;
}
