// A boss readied at its wave, for the fight with nothing drawn: its code loaded (every boss's at the first, a few
// hundred KB the server loads once), nothing to warm.
import { ENEMIES, type EnemyId } from '../../../data/enemies';
import { isLazyFoe, loadFoe } from '../../../entities/bosses';
import type * as Real from '../../../game/bossReady';

const bosses = (Object.keys(ENEMIES) as EnemyId[]).filter(isLazyFoe);

export const readyNextBoss: typeof Real.readyNextBoss = () => Promise.all(bosses.map(loadFoe)).then(() => undefined);
