// The rootmother sounds (core/sounds/rootmother.ts), for the fight with nothing heard: every one asked for is dropped.
import type * as Real from '../../../../core/sounds/rootmother';

export const rootSounds = new Proxy({}, { get: () => () => undefined }) as typeof Real.rootSounds;
