// The bellWarden sounds (core/sounds/bellWarden.ts), for the fight with nothing heard: every one asked for is dropped.
import type * as Real from '../../../../core/sounds/bellWarden';

export const bellSounds = new Proxy({}, { get: () => () => undefined }) as typeof Real.bellSounds;
