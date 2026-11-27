// The materials drawn by their colour alone, unlit: a mesh's (three's MeshBasicMaterial), the points', the sprites'
// and the lines' (`../sprites.ts` of the engine's page side draws the last three).
import { copyFields, TintedMaterial, type TintedParameters } from './material.ts';
import { FIELDS, watchFields } from './fields.ts';

/** A mesh drawn by its colour and map alone, unlit: three's MeshBasicMaterial. */
export class UnlitMaterial extends TintedMaterial {
  /** always true: it's unlit */
  readonly isUnlitMaterial = true;

  /** An unlit material with three's defaults, `params` set over them. */
  constructor(params?: TintedParameters) {
    super();
    if (params) this.assign(params);
    this.version = 0;
  }

  override get type(): string {
    return 'UnlitMaterial';
  }
}

/** The fields of the points' and the sprites' materials, each watched. */
export interface PointFields {
  /** a point's size: in pixels, or in the world's units where `sizeAttenuation` */
  size: number;
  /** sized by its distance from the camera */
  sizeAttenuation: boolean;
  /** a sprite's turn about the view's axis, in radians */
  rotation: number;
}

/** The points', the sprites' and the lines' parameters. */
export type PointParameters = TintedParameters & Partial<PointFields>;

/** three's defaults for PointsMaterial and SpriteMaterial (a sprite's `transparent` is true) */
const POINT_DEFAULTS: PointFields = { size: 1, sizeAttenuation: true, rotation: 0 };
const POINT_NAMES = Object.keys(POINT_DEFAULTS);

/** A points' or a sprite's material's fields typed on its class. */
export interface SpotMaterial extends PointFields {}

/** What the points' and the sprites' materials share: a size and a turn. */
export class SpotMaterial extends TintedMaterial {
  /** A material with three's defaults for points and sprites. */
  constructor() {
    super();
    Object.assign(this[FIELDS], POINT_DEFAULTS);
    this.version = 0;
  }

  override setValues(params: PointParameters): void {
    this.assign(params);
  }

  override copy(source: SpotMaterial): this {
    super.copy(source);
    copyFields(this, source, POINT_NAMES);
    return this;
  }
}
watchFields(SpotMaterial.prototype, POINT_NAMES);

/** A `Points`' material: three's PointsMaterial. */
export class PointsMaterial extends SpotMaterial {
  /** always true: it's a points' material */
  readonly isPointsMaterial = true;

  /** A points' material with three's defaults, `params` set over them. */
  constructor(params?: PointParameters) {
    super();
    if (params) this.assign(params);
    this.version = 0;
  }

  override get type(): string {
    return 'PointsMaterial';
  }
}

/** A `Sprite`'s material: three's SpriteMaterial, blended by default. */
export class SpriteMaterial extends SpotMaterial {
  /** always true: it's a sprite's material */
  readonly isSpriteMaterial = true;

  /** A sprite's material with three's defaults (blended), `params` set over them. */
  constructor(params?: PointParameters) {
    super();
    this.transparent = true;
    if (params) this.assign(params);
    this.version = 0;
  }

  override get type(): string {
    return 'SpriteMaterial';
  }
}

/** A `Line`'s material: three's LineBasicMaterial (its width is always a pixel, as WebGPU draws lines). */
export class LineMaterial extends TintedMaterial {
  /** always true: it's a line's material */
  readonly isLineMaterial = true;

  /** A line's material with three's defaults, `params` set over them. */
  constructor(params?: TintedParameters) {
    super();
    if (params) this.assign(params);
    this.version = 0;
  }

  override get type(): string {
    return 'LineMaterial';
  }
}
