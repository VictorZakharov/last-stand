// A lit material (three's MeshStandardMaterial and MeshPhysicalMaterial, as one class: the engine shades both
// alike, and a clear coat or a sheen of 0 is none).
import type { Color, Vec2 } from '../math/index.ts';
import { copyFields, TintedMaterial, type TintedParameters } from './material.ts';
import { FIELDS, watchFields } from './fields.ts';
import type { Texture } from './texture.ts';
import { setColour, WatchedColor, WatchedVec2, type ColorValue } from './watched.ts';

/** The fields of a lit material, each watched. */
export interface LitFields {
  /** 0 a mirror, 1 matte */
  roughness: number;
  /** 0 a dielectric, 1 a metal */
  metalness: number;
  /** its roughness multiplied by this map's green */
  roughnessMap: Texture | null;
  /** its metalness multiplied by this map's blue */
  metalnessMap: Texture | null;
  /** its surface's normals, in its tangents' space */
  normalMap: Texture | null;
  /** a height map, bumping the surface where there's no normal map */
  bumpMap: Texture | null;
  /** how much `bumpMap` bumps it */
  bumpScale: number;
  /** how strongly `emissive` glows */
  emissiveIntensity: number;
  /** its glow multiplied by this map */
  emissiveMap: Texture | null;
  /** shaded by its faces' own normals */
  flatShading: boolean;
  /** a clear coat's strength, 0 to 1 */
  clearcoat: number;
  /** the clear coat's roughness */
  clearcoatRoughness: number;
  /** a cloth's sheen's strength, 0 to 1 */
  sheen: number;
  /** the sheen's roughness */
  sheenRoughness: number;
  /** the sheen's colour multiplied by this map */
  sheenColorMap: Texture | null;
  /** how much of its surroundings it gives back */
  envMapIntensity: number;
  /** how strongly it shines, 0 to 1 (a physical material's) */
  specularIntensity: number;
}

/** A lit material's parameters: its colours as numbers, strings (sRGB) or `Color`s, its normals' scale copied. */
export type LitParameters = TintedParameters & Partial<LitFields> & {
  emissive?: ColorValue;
  sheenColor?: ColorValue;
  normalScale?: Vec2;
};

/** three's defaults for MeshStandardMaterial, and for MeshPhysicalMaterial's fields past it */
const LIT_DEFAULTS: LitFields = {
  roughness: 1, metalness: 0, roughnessMap: null, metalnessMap: null, normalMap: null, bumpMap: null, bumpScale: 1,
  emissiveIntensity: 1, emissiveMap: null, flatShading: false, clearcoat: 0, clearcoatRoughness: 0, sheen: 0,
  sheenRoughness: 1, sheenColorMap: null, envMapIntensity: 1, specularIntensity: 1,
};
const LIT_NAMES = Object.keys(LIT_DEFAULTS);

/** A lit material's fields typed on its class. */
export interface LitMaterial extends LitFields {}

/** A material lit by the sun, the sky and the lamps: three's MeshStandardMaterial and MeshPhysicalMaterial. */
export class LitMaterial extends TintedMaterial {
  /** always true: it's lit */
  readonly isLitMaterial = true;
  private readonly glow = new WatchedColor(this, 0, 0, 0);
  private readonly sheenTint = new WatchedColor(this, 0, 0, 0);
  private readonly normalBy = new WatchedVec2(this, 1, 1);

  /** A lit material with three's defaults, `params` set over them. */
  constructor(params?: LitParameters) {
    super();
    Object.assign(this[FIELDS], LIT_DEFAULTS);
    if (params) this.assign(params);
    this.version = 0;
  }

  /** its glow, linear, times `emissiveIntensity`; black by default */
  get emissive(): Color {
    return this.glow;
  }
  set emissive(value: ColorValue) {
    setColour(this.glow, value);
  }

  /** its sheen's colour, linear, times `sheen`; black by default */
  get sheenColor(): Color {
    return this.sheenTint;
  }
  set sheenColor(value: ColorValue) {
    setColour(this.sheenTint, value);
  }

  /** how far its normal map turns its normals, x and y; 1, 1 by default */
  get normalScale(): Vec2 {
    return this.normalBy;
  }
  set normalScale(value: Vec2) {
    this.normalBy.copy(value);
  }

  override get type(): string {
    return 'LitMaterial';
  }

  override setValues(params: LitParameters): void {
    this.assign(params);
  }

  override copy(source: LitMaterial): this {
    super.copy(source);
    copyFields(this, source, LIT_NAMES);
    this.glow.copy(source.glow);
    this.sheenTint.copy(source.sheenTint);
    this.normalBy.copy(source.normalBy);
    return this;
  }
}
watchFields(LitMaterial.prototype, LIT_NAMES);
