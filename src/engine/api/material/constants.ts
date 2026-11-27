// The constants the game names for its materials, textures and attributes, each equal to three 0.187's value of the
// same name (the engine's readers compare them, and the game's code is ported by its names alone). Only what the
// game names: what three's renderer alone meant (tone mapping, coordinate systems, depth packing) is left out.

/** which faces of a mesh are drawn */
export type Side = typeof FrontSide | typeof BackSide | typeof DoubleSide;
/** the faces wound towards the camera */
export const FrontSide = 0;
/** the faces wound away from it */
export const BackSide = 1;
/** both */
export const DoubleSide = 2;

/** how a material's pixels are laid over what's drawn */
export type Blending =
  | typeof NoBlending | typeof NormalBlending | typeof AdditiveBlending | typeof SubtractiveBlending
  | typeof MultiplyBlending | typeof CustomBlending;
/** laid over whole */
export const NoBlending = 0;
/** blended by its alpha (drawn whole unless `transparent`) */
export const NormalBlending = 1;
/** its light added */
export const AdditiveBlending = 2;
/** its light taken away */
export const SubtractiveBlending = 3;
/** multiplied in */
export const MultiplyBlending = 4;
/** by `blendSrc`, `blendDst` and `blendEquation` */
export const CustomBlending = 5;

/** how a custom blend joins its two sides */
export type BlendingEquation =
  | typeof AddEquation | typeof SubtractEquation | typeof ReverseSubtractEquation | typeof MinEquation
  | typeof MaxEquation;
/** source plus destination */
export const AddEquation = 100;
/** source less destination */
export const SubtractEquation = 101;
/** destination less source */
export const ReverseSubtractEquation = 102;
/** the least of the two */
export const MinEquation = 103;
/** the most of the two */
export const MaxEquation = 104;

/** what a custom blend weighs each side by */
export type BlendingFactor =
  | typeof ZeroFactor | typeof OneFactor | typeof SrcColorFactor | typeof OneMinusSrcColorFactor
  | typeof SrcAlphaFactor | typeof OneMinusSrcAlphaFactor | typeof DstAlphaFactor | typeof OneMinusDstAlphaFactor
  | typeof DstColorFactor | typeof OneMinusDstColorFactor;
/** 0 */
export const ZeroFactor = 200;
/** 1 */
export const OneFactor = 201;
/** the source's colour */
export const SrcColorFactor = 202;
/** 1 less the source's colour */
export const OneMinusSrcColorFactor = 203;
/** the source's alpha */
export const SrcAlphaFactor = 204;
/** 1 less the source's alpha */
export const OneMinusSrcAlphaFactor = 205;
/** the destination's alpha */
export const DstAlphaFactor = 206;
/** 1 less the destination's alpha */
export const OneMinusDstAlphaFactor = 207;
/** the destination's colour */
export const DstColorFactor = 208;
/** 1 less the destination's colour */
export const OneMinusDstColorFactor = 209;

/** how a map is read past its edges */
export type Wrapping = typeof RepeatWrapping | typeof ClampToEdgeWrapping | typeof MirroredRepeatWrapping;
/** tiled */
export const RepeatWrapping = 1000;
/** its edge held */
export const ClampToEdgeWrapping = 1001;
/** tiled, every other tile mirrored */
export const MirroredRepeatWrapping = 1002;

/** how a map is read between its texels and across its levels */
export type TextureFilter =
  | typeof NearestFilter | typeof NearestMipmapNearestFilter | typeof NearestMipmapLinearFilter
  | typeof LinearFilter | typeof LinearMipmapNearestFilter | typeof LinearMipmapLinearFilter;
/** the nearest texel */
export const NearestFilter = 1003;
/** the nearest texel of the nearest level */
export const NearestMipmapNearestFilter = 1004;
/** the nearest texel, two levels blended */
export const NearestMipmapLinearFilter = 1005;
/** four texels blended */
export const LinearFilter = 1006;
/** four texels blended, of the nearest level */
export const LinearMipmapNearestFilter = 1007;
/** four texels blended, two levels blended */
export const LinearMipmapLinearFilter = 1008;

/** what a texel's numbers are */
export type TextureDataType = typeof UnsignedByteType | typeof FloatType | typeof HalfFloatType;
/** a byte each */
export const UnsignedByteType = 1009;
/** a 32-bit float each */
export const FloatType = 1015;
/** a 16-bit float each */
export const HalfFloatType = 1016;

/** which channels a texel has */
export type PixelFormat = typeof RGBAFormat | typeof RedFormat | typeof RGFormat;
/** four */
export const RGBAFormat = 1023;
/** red alone */
export const RedFormat = 1028;
/** red and green */
export const RGFormat = 1030;

/** what a map's colours are: sRGB (a picture's), linear, or none (numbers, not colours) */
export type ColorSpace = typeof NoColorSpace | typeof SRGBColorSpace | typeof LinearSRGBColorSpace;
/** numbers, not colours */
export const NoColorSpace = '';
/** sRGB */
export const SRGBColorSpace = 'srgb';
/** linear sRGB, the working space */
export const LinearSRGBColorSpace = 'srgb-linear';

/** how often an attribute's numbers change */
export type Usage = typeof StaticDrawUsage | typeof DynamicDrawUsage | typeof StreamDrawUsage;
/** written once */
export const StaticDrawUsage = 35044;
/** written often */
export const DynamicDrawUsage = 35048;
/** written every frame, read once */
export const StreamDrawUsage = 35040;
