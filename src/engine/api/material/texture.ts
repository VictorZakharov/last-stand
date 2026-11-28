// A map as the engine reads it: its picture (a canvas, an image, a bitmap, or bytes with their size) and how it's
// read. Its `version` moves when `needsUpdate` is set, and the stage hands its picture over again then; its other
// fields are read as the materials that use it are sent (a placement changed later is a material's `needsUpdate`).
import { Vec2 } from '../math/index.ts';
import {
  ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, NearestFilter, NoColorSpace, RGBAFormat,
  UnsignedByteType, type ColorSpace, type PixelFormat, type TextureDataType, type TextureFilter, type Wrapping,
} from './constants.ts';
import { copyUserData, counter, DisposeHooks, nextUuid, noteChanged } from './fields.ts';

/** A picture the GPU copies by itself. */
export type PictureImage = HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap;

/** Bytes (or floats) and their size, a texel after another from row 0. */
export interface DataImage {
  /** the texels; null: none yet (a map the GPU alone writes) */
  data: ArrayBufferView | null;
  /** texels a row */
  width: number;
  /** rows */
  height: number;
}

/** A volume's cells and its size, a layer after another. */
export interface VolumeImage extends DataImage {
  /** layers */
  depth: number;
}

/** What a texture's picture may be; null: none yet. */
export type TextureImage = PictureImage | DataImage | VolumeImage | null;

const nextId = counter();

/** A map: its picture and how it's read. `I` is what its picture is. */
export class Texture<I extends TextureImage = TextureImage> {
  /** always true: it's a texture */
  readonly isTexture = true;
  /** its own id, counted from 0 */
  readonly id = nextId();
  /** a name to know it by */
  name = '';
  /** the game's own data on it, anything its own code reads back (copied through JSON by `copy`, as three does) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: Record<string, any> = {};
  /** its picture, shared with its clones */
  image: I;
  /** how it's read past its edges across u */
  wrapS: Wrapping = ClampToEdgeWrapping;
  /** and across v */
  wrapT: Wrapping = ClampToEdgeWrapping;
  /** how it's read where a texel covers more than a pixel */
  magFilter: TextureFilter = LinearFilter;
  /** and where less */
  minFilter: TextureFilter = LinearMipmapLinearFilter;
  /** its smaller levels made */
  generateMipmaps = true;
  /** how many samples it's read with at a slant */
  anisotropy = 1;
  /** what its colours are: sRGB for a picture's, none for numbers */
  colorSpace: ColorSpace = NoColorSpace;
  /** its picture's foot put at v 0 (a picture's top is its first row) */
  flipY = true;
  /** which channels a texel has (bytes' maps) */
  format: PixelFormat = RGBAFormat;
  /** what a texel's numbers are */
  type: TextureDataType = UnsignedByteType;
  /** its colour multiplied by its alpha as it's handed over */
  premultiplyAlpha = false;
  /** the bytes a row of its data is aligned to: 1, 2, 4 or 8 */
  unpackAlignment = 4;
  /** its tiles across a face, u and v */
  readonly repeat = new Vec2(1, 1);
  /** where its first tile begins, u and v */
  readonly offset = new Vec2(0, 0);
  /** what it turns about, u and v */
  readonly center = new Vec2(0, 0);
  /** its turn about `center`, in radians */
  rotation = 0;
  /** moves on each time `needsUpdate` is set: the stage hands its picture over again */
  version = 0;
  private ownUuid: string | undefined;
  private readonly disposeHooks = new DisposeHooks();

  /** A texture of `image`, with three's defaults. */
  constructor(image?: I) {
    this.image = (image ?? null) as I;
  }

  /** a key unique in this page, made when first read */
  get uuid(): string {
    this.ownUuid ??= nextUuid();
    return this.ownUuid;
  }
  set uuid(value: string) {
    this.ownUuid = value;
  }

  /** true: its picture has changed, and is handed to the engine again (its version moves) */
  set needsUpdate(value: boolean) {
    if (!value) return;
    this.version++;
    noteChanged(this);
  }

  /** A texture of its class sharing this one's picture, with everything else of it copied. */
  clone(): this {
    const made = new (this.constructor as new () => this)();
    return made.copy(this);
  }

  /** Everything `source` has set on this one, its picture shared (and handed over again: its version moves). */
  copy(source: Texture<I>): this {
    this.name = source.name;
    this.image = source.image;
    this.wrapS = source.wrapS;
    this.wrapT = source.wrapT;
    this.magFilter = source.magFilter;
    this.minFilter = source.minFilter;
    this.generateMipmaps = source.generateMipmaps;
    this.anisotropy = source.anisotropy;
    this.colorSpace = source.colorSpace;
    this.flipY = source.flipY;
    this.format = source.format;
    this.type = source.type;
    this.premultiplyAlpha = source.premultiplyAlpha;
    this.unpackAlignment = source.unpackAlignment;
    this.repeat.copy(source.repeat);
    this.offset.copy(source.offset);
    this.center.copy(source.center);
    this.rotation = source.rotation;
    this.userData = copyUserData(source.userData);
    this.needsUpdate = true;
    return this;
  }

  /** `callback` run each time it's disposed (the stage lets the engine's map go); the function returned takes it
   *  off. */
  onDispose(callback: () => void): () => void {
    return this.disposeHooks.add(callback);
  }

  /** Let go: its `onDispose` hooks run. It may be used again after, and is handed over again then. */
  dispose(): void {
    this.disposeHooks.run();
  }
}

/** A canvas's picture as a map, handed over as it's first used. */
export class CanvasTexture<C extends PictureImage = HTMLCanvasElement> extends Texture<C> {
  /** always true: its picture is a canvas's */
  readonly isCanvasTexture = true;

  /** A map of `canvas`, marked to be handed over (as three's). */
  constructor(canvas?: C) {
    super(canvas);
    this.needsUpdate = true;
  }
}

/** A map of bytes or floats (three's DataTexture): read texel by texel (nearest), no smaller levels, rows from v 0. */
export class DataTexture extends Texture<DataImage> {
  /** always true: its picture is bytes */
  readonly isDataTexture = true;

  /** A map of `data`, `width` by `height` texels of `format` and `type` (RGBA bytes by default); `data` null: none
   *  yet. */
  constructor(
    data: ArrayBufferView | null = null,
    width = 1,
    height = 1,
    format: PixelFormat = RGBAFormat,
    type: TextureDataType = UnsignedByteType,
  ) {
    super({ data, width, height });
    this.format = format;
    this.type = type;
    this.magFilter = NearestFilter;
    this.minFilter = NearestFilter;
    this.generateMipmaps = false;
    this.flipY = false;
    this.unpackAlignment = 1;
  }
}

/** A volume of bytes (three's Data3DTexture): read cell by cell (nearest), clamped on every axis. */
export class VolumeTexture extends Texture<VolumeImage> {
  /** always true: its picture is a volume */
  readonly isVolumeTexture = true;
  /** how it's read past its edges across its depth */
  wrapR: Wrapping = ClampToEdgeWrapping;

  /** A volume of `data`, `width` by `height` by `depth` cells; `data` null: none yet. */
  constructor(data: ArrayBufferView | null = null, width = 1, height = 1, depth = 1) {
    super({ data, width, height, depth });
    this.magFilter = NearestFilter;
    this.minFilter = NearestFilter;
    this.generateMipmaps = false;
    this.flipY = false;
    this.unpackAlignment = 1;
  }

  override copy(source: VolumeTexture): this {
    super.copy(source);
    this.wrapR = source.wrapR;
    return this;
  }
}
