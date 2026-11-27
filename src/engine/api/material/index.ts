// The materials, the textures and their constants: data the engine reads (`../AGENTS.md`'s Materials and textures).
export * from './constants.ts';
export { DisposeHooks, FIELDS, type Watching } from './fields.ts';
export { LitMaterial, type LitFields, type LitParameters } from './lit.ts';
export {
  copyUniforms, LookMaterial, type Define, type LookParameters, type Uniform, type Uniforms,
} from './look.ts';
export {
  Material, TintedMaterial, type MaterialFields, type MaterialParameters, type TintedFields, type TintedParameters,
} from './material.ts';
export {
  CanvasTexture, DataTexture, Texture, VolumeTexture,
  type DataImage, type PictureImage, type TextureImage, type VolumeImage,
} from './texture.ts';
export {
  LineMaterial, PointsMaterial, SpotMaterial, SpriteMaterial, UnlitMaterial,
  type PointFields, type PointParameters,
} from './unlit.ts';
export { setColour, WatchedColor, WatchedVec2, type ColorValue, type Owner } from './watched.ts';
