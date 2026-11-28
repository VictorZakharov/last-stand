// The sounds, for the fight with nothing heard: every sound asked for is dropped.
import type * as Real from '../../../core/audio';

/** Any of the real `sfx`'s sounds, played by doing nothing. */
export const sfx = new Proxy({}, { get: () => () => undefined }) as typeof Real.sfx;
