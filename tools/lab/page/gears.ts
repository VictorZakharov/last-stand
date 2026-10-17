// The ways of holding weapons a measure goes through, for a hero whose skills follow how they're held (the warrior's:
// a skill of each style, a two-hander's blows slower and heavier), each a set-up of its own (`log`, `tooltips`).
import type { Fixture } from './lab';
import type { WeaponStyle } from '../../../src/types';
import { G } from '../../../src/state';

/** every way of holding weapons, for a class whose skills follow how they're held */
const STYLES: WeaponStyle[] = ['shield', 'twoHanded', 'dual', 'oneHanded'];

/** The ways of holding weapons measured: the fixture's, or each one for a class whose skills follow how they're held
 *  (none: as he is). */
export function gearsOf(fixture: Fixture): (WeaponStyle | undefined)[] {
  if (fixture.gear) return [fixture.gear];
  return G.player.cls.skills.some((skill) => skill.needs) ? STYLES : [undefined];
}
