// The engine's effect looks, for the fight with nothing drawn: a material is kept as it is, with no look.
import type * as Real from '../../../engine/effects';

export const FX_PLAIN_VERTEX: typeof Real.FX_PLAIN_VERTEX = 'fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}\n';
export const num: typeof Real.num = (uniforms, name) => uniforms[name].value as number;
export const rgb: typeof Real.rgb = () => undefined;
export const effectShader: typeof Real.effectShader = () => undefined;
export const effectLook: typeof Real.effectLook = (material) => material;
