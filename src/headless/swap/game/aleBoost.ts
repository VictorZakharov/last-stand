// The tavern's ale, for the fight with nothing drawn: the local hero's alone, and the server has none.
import type * as Real from '../../../game/aleBoost';

export const aleBoost: typeof Real.aleBoost = { waiting: false, waves: 0 };
export const aleRunBegins: typeof Real.aleRunBegins = () => undefined;
export const aleRunEnds: typeof Real.aleRunEnds = () => undefined;
