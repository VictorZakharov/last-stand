// `lab ui`'s `barsBusy` state's measure: the run's bottom bar as a fight leaves it (`../../../src/ui/hud.ts`, drawn
// by the engine in `../../../src/ui/bottomBar.ts`): the health low and pulsing, the energy short of every skill's
// cost, a skill cooling down, the warrior's Frenzy part lit. What the page writes is read on both sides of an A/B, so
// its lines and its picture compare with main's; where the engine draws the bar, each fill as drawn is held to the
// share the page wrote. Its canary writes a share the drawn bar hasn't followed.
import { G } from '../../../src/state';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import type { Lab } from './lab';
import { caught, type Found } from './uiKit';
import type { SkillKey } from '../../../src/types';

/** the bar's drawn fills (src/ui/bottomBar.ts), where the tree has them (main's had none: `--ab`) */
interface BottomBar { drawnShares(): { life: number; energy: number } | null }
const BAR = Object.values(import.meta.glob<BottomBar>('../../../src/ui/bottomBar.ts', { eager: true }))[0];
/** the kit's clock (src/ui/kit/motion.ts), to finish the fills' easing as the page's transitions are finished */
interface Motion { finishMotion(): void }
const MOTION = Object.values(import.meta.glob<Motion>('../../../src/ui/kit/motion.ts', { eager: true }))[0];

/** how much of each the fight leaves: the health under low's 0.3, the energy under every cost */
const LIFE_LEFT = 0.25;
const ENERGY_LEFT = 0.04;
/** how much of its cooldown the cooling skill has left, and the Frenzy's stacks */
const COOLDOWN_LEFT = 0.6;
const FRENZY_STACKS = 3;
/** how far a drawn fill may be from the page's share (a px or two of a 300 px bar) */
const SHARE_SLACK = 0.01;
/** frames for the HUD to write what was set, then for the kit to draw it */
const SETTLE = 3;

/** the planted share: the page's health fill written wider than the drawn bar has followed */
export const BARS_CANARY = { name: 'drawn at', what: 'a share the drawn bar never followed' };

/** The canary looked for where the engine draws the bar (main's tree, the page's own, has none to plant). */
export function barsCanary(found: Found, state: string): Found {
  return BAR ? caught(BARS_CANARY)(found, state) : { lines: [], problems: [] };
}

/** The first key whose skill has a cooldown, cooling down. */
function coolOne(): SkillKey | null {
  const hero = G.player;
  for (const key of SKILL_KEYS) {
    const def = hero.skillAt(key)?.def;
    const whole = def ? hero.cooldownOf(def) : 0;
    if (!def || whole <= 0) continue;
    hero.cooldowns.set(def.impl, whole * COOLDOWN_LEFT);
    return key;
  }
  return null;
}

/** The key cooled down, for the check's lines. */
let cooled: SkillKey | null = null;

/** The bar as a fight leaves it, the HUD and the kit followed, their easing finished. */
export async function openBarsBusy(lab: Lab): Promise<void> {
  const hero = G.player;
  // (the lab holds his health at a share each frame: set there, or it's full again at the next)
  lab.lifeShare = LIFE_LEFT;
  hero.energy = hero.stats.maxEnergy * ENERGY_LEFT;
  hero.frenzy = FRENZY_STACKS;
  cooled = coolOne();
  await lab.step(SETTLE);
  MOTION?.finishMotion();
  await lab.step(SETTLE);
}

/** The hero whole again for the states after. */
export function closeBarsBusy(lab: Lab): void {
  const hero = G.player;
  lab.lifeShare = 1;
  hero.energy = hero.stats.maxEnergy;
  hero.frenzy = 0;
  hero.cooldowns.clear();
}

/** A share the page wrote on `selector`'s width (0 to 1). */
function pageShare(selector: string): number {
  const width = document.querySelector<HTMLElement>(selector)?.style.width ?? '';
  return (parseFloat(width) || 0) / 100;
}

/** The page's lines: each fill's share, low health, the cooling slot's countdown, the slots short of energy. */
function pageLines(): string[] {
  const life = pageShare('#bottombar .bar.life .fill');
  const energy = pageShare('#bottombar .bar.energy .fill');
  const low = document.querySelector('#bottombar .bar.life')?.classList.contains('low');
  const slots = [...document.querySelectorAll<HTMLElement>('#hotbar .slot')];
  const at = cooled ? SKILL_KEYS.indexOf(cooled) : -1;
  const countdown = at >= 0 ? slots[at]?.querySelector('.cdt')?.textContent ?? '' : '';
  const short = slots.filter((slot) => slot.classList.contains('nomana')).length;
  const pips = document.querySelectorAll('#frenzy i.on').length;
  return [
    `  health ${(life * 100).toFixed(0)}%${low ? ', low' : ''}; energy ${(energy * 100).toFixed(0)}%`,
    `  ${cooled ?? 'no key'} cooling down: ${countdown || 'no countdown'}`,
    `  ${short} of ${slots.length} slots short of energy`,
    `  Frenzy pips lit: ${pips}`,
  ];
}

/** Each drawn fill against the page's share (the engine's bar alone), with the canary's wider share planted. */
function drawnProblems(canary: boolean): { lines: string[]; problems: string[] } {
  const drawn = BAR?.drawnShares();
  if (!BAR || !drawn) return { lines: [], problems: BAR ? ['barsBusy: the bottom bar isn\'t drawn'] : [] };
  const fill = document.querySelector<HTMLElement>('#bottombar .bar.life .fill');
  const written = fill?.style.width ?? '';
  if (canary && fill) fill.style.width = '90%';
  const problems: string[] = [];
  const lines: string[] = [];
  const bars = [['health', '.bar.life .fill'], ['energy', '.bar.energy .fill']] as const;
  for (const [name, selector] of bars) {
    const wanted = pageShare(`#bottombar ${selector}`);
    const got = name === 'health' ? drawn.life : drawn.energy;
    const off = Math.abs(got - wanted) > SHARE_SLACK;
    lines.push(`  the ${name} drawn at ${(got * 100).toFixed(1)}% of its well${off ? '' : ', as the page writes it'}`);
    const shares = `${(got * 100).toFixed(1)}%, the page's ${(wanted * 100).toFixed(1)}%`;
    if (off) problems.push(`barsBusy: the ${name} ${BARS_CANARY.name} ${shares}`);
  }
  // (put back as the page wrote it, for the states after)
  if (fill) fill.style.width = written;
  return { lines, problems };
}

/** The bar's lines, and where the engine draws it, its fills held to the page's shares. */
export function barsBusyShown(canary: boolean): Found {
  const page = pageLines();
  const drawn = drawnProblems(canary);
  return { lines: [...page, ...drawn.lines], problems: drawn.problems };
}
