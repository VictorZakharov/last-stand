// A material as the engine reads it: data, nothing compiled on the page. Every field that changes how it's drawn
// is an accessor that moves its `version` when its value changes, and the stage sends a material again only when
// its version moved. Its colours and vectors are watched objects (`watched.ts`) that move it too.
import { Color, Vec2 } from '../math/index.ts';
import {
  AddEquation, FrontSide, NormalBlending, OneMinusSrcAlphaFactor, SrcAlphaFactor,
  type Blending, type BlendingEquation, type BlendingFactor, type Side,
} from './constants.ts';
import { copyUserData, counter, DisposeHooks, FIELDS, nextUuid, watchFields } from './fields.ts';
import type { Texture } from './texture.ts';
import { setColour, WatchedColor, type ColorValue } from './watched.ts';

/** The fields every material has, each watched (`watchFields`). */
export interface MaterialFields {
  /** how opaque, 0 to 1 (drawn blended only when `transparent`) */
  opacity: number;
  /** drawn blended, after what's opaque */
  transparent: boolean;
  /** a pixel whose alpha is under it is dropped; 0: none */
  alphaTest: number;
  /** which faces are drawn */
  side: Side;
  /** which faces cast; null: as `side` has it */
  shadowSide: Side | null;
  /** how its pixels are laid over what's drawn */
  blending: Blending;
  /** with `CustomBlending`: the source's factor */
  blendSrc: BlendingFactor;
  /** with `CustomBlending`: the destination's factor */
  blendDst: BlendingFactor;
  /** with `CustomBlending`: how the two are joined */
  blendEquation: BlendingEquation;
  /** with `CustomBlending`: the alpha's own source factor; null: `blendSrc` */
  blendSrcAlpha: BlendingFactor | null;
  /** with `CustomBlending`: the alpha's own destination factor; null: `blendDst` */
  blendDstAlpha: BlendingFactor | null;
  /** with `CustomBlending`: the alpha's own equation; null: `blendEquation` */
  blendEquationAlpha: BlendingEquation | null;
  /** writes its depth */
  depthWrite: boolean;
  /** is hidden by what's nearer */
  depthTest: boolean;
  /** writes its colour (false: a caster for the depth or the shadow alone) */
  colorWrite: boolean;
  /** drawn a little nearer or further than it is (with the two below) */
  polygonOffset: boolean;
  /** how much nearer by its slope (under 0: towards the eye) */
  polygonOffsetFactor: number;
  /** how much nearer by depth's units */
  polygonOffsetUnits: number;
  /** drawn at all */
  visible: boolean;
  /** its colour multiplied by its geometry's `color` attribute */
  vertexColors: boolean;
  /** greyed by the fog */
  fog: boolean;
  /** graded with the frame (three's tone mapping; kept for the game's settings) */
  toneMapped: boolean;
  /** its alpha test smoothed by the samples (a hair card's) */
  alphaToCoverage: boolean;
  /** drawn in one pass though two-sided and blended (three drew such twice) */
  forceSinglePass: boolean;
}

/** A material's parameters object: any of its fields, its name and its user data. */
export type MaterialParameters = Partial<MaterialFields> & { name?: string; userData?: Record<string, unknown> };

/** three's defaults for every material */
const MATERIAL_DEFAULTS: MaterialFields = {
  opacity: 1, transparent: false, alphaTest: 0, side: FrontSide, shadowSide: null, blending: NormalBlending,
  blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendEquation: AddEquation, blendSrcAlpha: null,
  blendDstAlpha: null, blendEquationAlpha: null, depthWrite: true, depthTest: true, colorWrite: true,
  polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0, visible: true, vertexColors: false, fog: true,
  toneMapped: true, alphaToCoverage: false, forceSinglePass: false,
};
const MATERIAL_NAMES = Object.keys(MATERIAL_DEFAULTS);
const nextId = counter();

/** A material's fields typed on its class. */
export interface Material extends MaterialFields {}

/** What every material has; drawn as its class says (`LitMaterial`, `UnlitMaterial`, `LookMaterial`...). */
export class Material {
  /** its watched fields' values (`watchFields`) */
  [FIELDS]: Record<string, unknown> = { ...MATERIAL_DEFAULTS };
  /** moves on with every change to how it's drawn: the stage sends it again when it has */
  version = 0;
  /** its own id, counted from 0 */
  readonly id = nextId();
  /** a name to know it by */
  name = '';
  /** the game's own data on it (copied through JSON by `copy`, as three does) */
  userData: Record<string, unknown> = {};
  /** always true: it's a material */
  readonly isMaterial = true;
  private ownUuid: string | undefined;
  private readonly disposeHooks = new DisposeHooks();

  /** A material with three's defaults, `params` set over them. */
  constructor(params?: MaterialParameters) {
    if (params) this.assign(params);
    this.version = 0;
  }

  /** its class's name (what the stage counts it by when it isn't drawn) */
  get type(): string {
    return 'Material';
  }

  /** a key unique in this page, made when first read */
  get uuid(): string {
    this.ownUuid ??= nextUuid();
    return this.ownUuid;
  }
  set uuid(value: string) {
    this.ownUuid = value;
  }

  /** true: sent to the engine again (its version moved), whatever changed */
  set needsUpdate(value: boolean) {
    if (value) this.version++;
  }

  /** Told by its watched colours and vectors that one changed: its version moves. */
  touched(): void {
    this.version++;
  }

  /** `params` set over its fields: a colour from a number or a string (sRGB) or a `Color` (copied), a vector
   *  copied, anything else assigned. */
  setValues(params: MaterialParameters): void {
    this.assign(params);
  }

  /** Each of `params` set (`setValues`); a key it has no field of is left out, with a warning (as three does). */
  protected assign(params: object): void {
    const fields = this as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      const current = fields[key];
      if (current instanceof Color) setColour(current, value as ColorValue);
      else if (current instanceof Vec2 && value instanceof Vec2) current.copy(value);
      else if (key in this) fields[key] = value;
      else console.warn(`${this.type}: '${key}' is not a field of it`);
    }
  }

  /** A material of its class with everything this one has (its maps shared, its colours copied). */
  clone(): this {
    const made = new (this.constructor as new () => this)();
    return made.copy(this);
  }

  /** Everything `source` has set on this one (its maps shared, its colours copied, its user data through JSON). */
  copy(source: Material): this {
    copyFields(this, source, MATERIAL_NAMES);
    this.name = source.name;
    this.userData = copyUserData(source.userData);
    return this;
  }

  /** `callback` run each time it's disposed (the stage lets the engine's material go); the function returned
   *  takes it off. */
  onDispose(callback: () => void): () => void {
    return this.disposeHooks.add(callback);
  }

  /** Let go: its `onDispose` hooks run. It may be drawn again after, and is sent again then. */
  dispose(): void {
    this.disposeHooks.run();
  }
}
watchFields(Material.prototype, MATERIAL_NAMES);

/** `names` of `source`'s watched fields set on `target`, each through its accessor (a change moves its version). */
export function copyFields(target: Material, source: Material, names: readonly string[]): void {
  const into = target as unknown as Record<string, unknown>;
  const from = source[FIELDS];
  for (const name of names) into[name] = from[name];
}

/** The fields of a material that has a colour and a base map. */
export interface TintedFields {
  /** its base map (its colour multiplied by it) */
  map: Texture | null;
  /** its alpha by this map's green */
  alphaMap: Texture | null;
}

/** A tinted material's parameters: its colour as a number, a string (sRGB) or a `Color`. */
export type TintedParameters = MaterialParameters & Partial<TintedFields> & { color?: ColorValue };

const TINTED_DEFAULTS: TintedFields = { map: null, alphaMap: null };
const TINTED_NAMES = Object.keys(TINTED_DEFAULTS);

/** A tinted material's fields typed on its class. */
export interface TintedMaterial extends TintedFields {}

/** A material with a colour and a base map: what's lit, what's unlit, the points, the sprites and the lines. */
export class TintedMaterial extends Material {
  /** its colour, linear; white by default */
  private readonly tint = new WatchedColor(this, 1, 1, 1);

  /** A tinted material with three's defaults, `params` set over them. */
  constructor(params?: TintedParameters) {
    super();
    Object.assign(this[FIELDS], TINTED_DEFAULTS);
    if (params) this.assign(params);
    this.version = 0;
  }

  /** its colour, linear (a write copies the colour given; a change moves its version) */
  get color(): Color {
    return this.tint;
  }
  set color(value: ColorValue) {
    setColour(this.tint, value);
  }

  override get type(): string {
    return 'TintedMaterial';
  }

  override setValues(params: TintedParameters): void {
    this.assign(params);
  }

  override copy(source: TintedMaterial): this {
    super.copy(source);
    copyFields(this, source, TINTED_NAMES);
    this.tint.copy(source.tint);
    return this;
  }
}
watchFields(TintedMaterial.prototype, TINTED_NAMES);
