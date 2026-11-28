// The warm-up, for the fight with nothing drawn: no program to compile, so a foe is warm once its code is here (a
// boss's chunk loaded: entities/bosses.ts).
import { foeLoaded } from '../../../entities/bosses';
import type * as Real from '../../../game/warmup';

export const foeWarm: typeof Real.foeWarm = foeLoaded;
