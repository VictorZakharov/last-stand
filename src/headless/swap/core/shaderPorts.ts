// The effects' shader ports, for the fight with nothing drawn: a material is kept as it is, with no port.
import { float } from 'three/tsl';
import type * as Real from '../../../core/shaderPorts';

export const portShader: typeof Real.portShader = (material) => material;
export const wgslNoise: typeof Real.wgslNoise = () => ({}) as ReturnType<typeof Real.wgslNoise>;
/** A shader node never compiled: what the see-through helpers hand the looks built here (nothing seen through). */
const nothing = <T>(): T => float(0) as unknown as T;
export const seeFade: typeof Real.seeFade = () => nothing();
export const seeKept: typeof Real.seeKept = () => nothing();
export const seeUniforms: typeof Real.seeUniforms = () => ({}) as ReturnType<typeof Real.seeUniforms>;
