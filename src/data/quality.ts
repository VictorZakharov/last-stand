// Graphics quality presets. None of these settings change shader variants, so they
// can be switched live without a compile hitch (see core/shaders.ts).
export type QualityLevel = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityPreset {
  label: string;
  /** the most pixels the scene renders, counted on the screen (Infinity: all the screen's own); never by the OS's
   *  scaling, which says nothing of what the hardware draws. Every level renders them all: what a level cuts is
   *  other work ("I want to run the game at full phone res") */
  pixels: number;
  /** MSAA samples on the scene render target (0 = off) */
  msaa: number;
  /** directional (moon) shadow map resolution */
  shadowMap: number;
  /** character parts with a smaller bounding radius don't cast shadows (each caster is a draw call) */
  minCasterRadius: number;
  /** the heroes' geometric detail (hair locks, fur tufts, curve segments), 1 = full; taken when a hero is built */
  heroDetail: number;
  /** enemies further than this from the local player (m) skip the leg IK (models/ik.ts): their walk cycle's own legs */
  ikRange: number;
  /** the floors' relief: the most steps down each view ray (core/parallax.ts), 0 = flat */
  relief: number;
  /** whether the frame may be shown in HDR on a display in HDR mode (`setHdrAllowed` in core/hdr.ts): its copy of
   *  the frame at the screen's pixels cost a 4K laptop's integrated GPU 26 ms of 38 */
  hdr: boolean;
  /** whether the props sculpted for close looks are drawn coarser (the crypt's skulls: `setSkullDetail` in
   *  world/skull.ts) */
  coarseProps: boolean;
  /** the share of the scene's pixels each way bloom draws at (`setBloomShare` in core/renderer.ts): Low's half,
   *  a quarter of the pixels (an S25 Edge's bloom was 6 ms of an 80 ms frame at full res) */
  bloomShare: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  high:   { label: 'High',   pixels: Infinity,    msaa: 2, shadowMap: 4096, minCasterRadius: 0.07, heroDetail: 1, ikRange: Infinity, relief: 16 },
  medium: { label: 'Medium', pixels: 2560 * 1440, msaa: 2, shadowMap: 2048, minCasterRadius: 0.11, heroDetail: 0.6, ikRange: Infinity, relief: 8 },
  low:    { label: 'Low',    pixels: 1920 * 1080, msaa: 0, shadowMap: 1024, minCasterRadius: 0.16, heroDetail: 0.35, ikRange: 14, relief: 0 },
};

export const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low'];

/**
 * Auto quality: step down when the average FPS stays below `minFps` for `window` seconds. High first renders fewer
 * pixels, half as many a step, down to `highFloor`; then the level goes down, keeping the pixels; then Low renders
 * fewer, down to `fewest` (each the screen's own, if fewer). What the hardware holds is measured, never guessed from
 * the device or the OS's scaling. Far below it (under `farBelow` of `minFps`) a window of `farWindow` is enough, and it
 * takes as many steps at once as halving the frame's cost that many times would need: a step at a time, 6 s each, a
 * phone's first visit (Auto starting from High) drew a few frames a second for half a minute, from play "insane
 * slowdown when choosing a hero upon first entry into the game, on phone".
 */
export const AUTO_QUALITY = {
  minFps: 50, window: 4, settle: 2, highFloor: 1920 * 1080, fewest: 960 * 540, farBelow: 0.5, farWindow: 1.5,
};
