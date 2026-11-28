// The twins sounds (core/sounds/twins.ts), for the fight with nothing heard: every one asked for is dropped.
import type * as Real from '../../../../core/sounds/twins';

export const twinSounds = new Proxy({}, { get: () => () => undefined }) as typeof Real.twinSounds;
