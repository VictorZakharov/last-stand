// What the village's meadow's looks read (engine/looks/meadow.ts: the blades placed from their instance's cell, the
// ground's sward under them): a ring's uniforms as meadow.ts sets them, before each frame draws it, and its numbers.
import type { DataTexture, Texture, Vec2, Vec4 } from '../engine/api/index.ts';

/** A ring's uniforms as `meadow.ts` sets them. */
export interface BladeUniforms {
  uOrigin: { value: Vec2 };
  uCell: { value: number };
  uWider: { value: number };
  uCombed: { value: number };
  uS: { value: number };
  uTiles: { value: Vec2[] };
  /** the tiles drawn, a pair of floats each (WebGL's map; the Rust engine's list) */
  uTileMap: { value: DataTexture };
  uFocus: { value: Vec2 };
  uEye: { value: Vec2 };
  uBand: { value: Vec4 };
  uByStrand: { value: number };
  uStrandsBy: { value: number };
  uTime: { value: number };
  uMeadow: { value: Texture };
  uMeadowHalf: { value: number };
  uSolid: { value: Texture };
  uRoom: { value: number };
}

/** `meadow.ts`'s numbers for a blade's width and how its strands rise. */
export interface BladeNumbers { widthInCells: number; grows: number; strandCut: number; strandsRise: number }
