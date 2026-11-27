// A material drawn by a look of its own alone (three's ShaderMaterial): its WGSL is the look's (`../custom.ts`,
// `rustLook`), and what it reads off the material is its uniforms, written into the look's numbers each frame. It
// holds no shader of its own: the GLSL three's ShaderMaterial took is read by nothing the engine draws.
import { Material, type MaterialParameters } from './material.ts';

/** A uniform: a value its look reads each frame (a number, a colour, a vector, a texture...). */
export interface Uniform<T = unknown> {
  /** what the look reads */
  value: T;
}

/** A look material's uniforms by name. */
export type Uniforms = Record<string, Uniform>;

/** A define's value. */
export type Define = string | number | boolean;

/** A look material's parameters: its uniforms and defines besides every material's. */
export type LookParameters<U extends Uniforms> = MaterialParameters & {
  uniforms?: U;
  defines?: Record<string, Define>;
};

/** A material drawn by its look alone, `U` its uniforms: three's ShaderMaterial (and RawShaderMaterial). */
export class LookMaterial<U extends Uniforms = Uniforms> extends Material {
  /** always true: it's drawn by its look */
  readonly isLookMaterial = true;
  /** what its look reads, by name (`{ name: { value } }`); not watched: the look's numbers are read each frame */
  uniforms: U;
  /** the look's switches, by name */
  defines: Record<string, Define> = {};

  /** A look material with three's ShaderMaterial's defaults (no fog, drawn in one pass), `params` set over them;
   *  its uniforms are the object given, not a copy (as three takes them). */
  constructor(params?: LookParameters<U>) {
    super();
    this.uniforms = {} as U;
    this.fog = false;
    this.forceSinglePass = true;
    if (params) this.assign(params);
    this.version = 0;
  }

  override get type(): string {
    return 'LookMaterial';
  }

  override setValues(params: LookParameters<U>): void {
    this.assign(params);
  }

  /** Everything `source` has, its uniforms copied a value at a time (one with a `clone` cloned, an array sliced,
   *  the rest as they are: a texture shared, so a clone's maps are the engine's same ones), its defines copied. */
  override copy(source: LookMaterial<U>): this {
    super.copy(source);
    this.uniforms = copyUniforms(source.uniforms);
    this.defines = { ...source.defines };
    return this;
  }
}

/** Something whose copy is made by `clone()` (a colour, a vector, a matrix). */
interface Cloneable {
  clone(): unknown;
  isTexture?: boolean;
}

/** `uniforms` copied a value at a time (`LookMaterial.copy`). */
export function copyUniforms<U extends Uniforms>(uniforms: U): U {
  const made: Uniforms = {};
  for (const [name, uniform] of Object.entries(uniforms)) made[name] = { value: copyValue(uniform.value) };
  return made as U;
}

/** A uniform's value copied: cloned where it can be (but a texture), sliced if an array, else as it is. */
function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice();
  if (typeof value !== 'object' || value === null) return value;
  const cloneable = value as Partial<Cloneable>;
  if (typeof cloneable.clone !== 'function' || cloneable.isTexture) return value;
  return cloneable.clone();
}
