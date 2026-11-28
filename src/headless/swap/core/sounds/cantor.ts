// The cantor sounds (core/sounds/cantor.ts), for the fight with nothing heard: every one asked for is dropped.
import type * as Real from '../../../../core/sounds/cantor';

export const cantorSounds = new Proxy({}, { get: () => () => undefined }) as typeof Real.cantorSounds;
