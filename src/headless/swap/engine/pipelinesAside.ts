// The engine's pipelines, for the fight with nothing drawn: nothing to prepare, no work outstanding.
import type * as Real from '../../../engine/pipelinesAside';

export const AHEAD: typeof Real.AHEAD = { prepare: null, bakeLamps: null, propsRev: 0 };
export const engineWorkDone: typeof Real.engineWorkDone = () => Promise.resolve();
