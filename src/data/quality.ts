// Graphics quality presets. None of these settings change shader variants, so they
// can be switched live without a compile hitch (see core/shaders.ts).
export type QualityLevel = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityPreset {
  label: string;
  /** cap on devicePixelRatio for the render resolution */
  pixelRatio: number;
  /** MSAA samples on the scene render target (0 = off) */
  msaa: number;
  /** directional (moon) shadow map resolution */
  shadowMap: number;
  /** character parts with a smaller bounding radius don't cast shadows (each caster is a draw call) */
  minCasterRadius: number;
  /** the heroes' geometric detail (hair locks, fur tufts, curve segments), 1 = full; taken when a hero is built */
  heroDetail: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  high:   { label: 'High',   pixelRatio: 1.5,  msaa: 4, shadowMap: 4096, minCasterRadius: 0.07, heroDetail: 1 },
  medium: { label: 'Medium', pixelRatio: 1.25, msaa: 2, shadowMap: 2048, minCasterRadius: 0.11, heroDetail: 0.6 },
  low:    { label: 'Low',    pixelRatio: 1,    msaa: 0, shadowMap: 1024, minCasterRadius: 0.16, heroDetail: 0.35 },
};

export const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low'];

/** Auto quality: step down a level when the average FPS stays below `minFps` for `window` seconds. */
export const AUTO_QUALITY = { minFps: 50, window: 4, settle: 2 };
