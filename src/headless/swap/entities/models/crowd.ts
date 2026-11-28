// The crowds the engine draws a kind's foes in, for the fight with nothing drawn: no foe ever joins one.
import type * as Real from '../../../../entities/models/crowd';

export const joinCrowd: typeof Real.joinCrowd = () => false;
export const leaveCrowd: typeof Real.leaveCrowd = () => undefined;
