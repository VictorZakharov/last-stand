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
  /** how far apart the grass's blades stand, against High's, each as many times wider (`setGrassSpread` in
   *  world/meadow.ts): twice, a quarter of the blades cover the ground as before, a quarter of the vertices shaded
   *  (on an S25 Edge at full res the grass was 21 ms of an 80 ms frame) */
  grassSpread: number;
  /** the share of the village's lamps' reach, and whether they read the shadows' map of what stands round them
   *  (`setLampQuality` in core/lamps.ts) */
  lampReach: number;
  lampShadows: boolean;
  /** whether the village draws what moves into its kept shadow maps only on frames it moved
   *  (`world/shadowsOnMove.ts`) */
  shadowsOnMove: boolean;
  /** the share of the scene's pixels each way bloom draws at (`setBloomShare` in core/renderer.ts) */
  bloomShare: number;
  /** the rounds a skirt's cloth is draped over the limbs a frame (`setDrapeRounds` in entities/models/armor.ts) */
  drapeRounds: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  high:   { label: 'High',   pixels: Infinity,    msaa: 2, shadowMap: 4096, minCasterRadius: 0.07, heroDetail: 1, ikRange: Infinity, relief: 16, grassSpread: 1, lampReach: 1, lampShadows: true, shadowsOnMove: false, bloomShare: 1, drapeRounds: 4 },
  medium: { label: 'Medium', pixels: Infinity,   msaa: 2, shadowMap: 2048, minCasterRadius: 0.11, heroDetail: 0.6, ikRange: Infinity, relief: 8, grassSpread: 1, lampReach: 1, lampShadows: true, shadowsOnMove: false, bloomShare: 1, drapeRounds: 4 },
  low:    { label: 'Low',    pixels: Infinity,    msaa: 0, shadowMap: 1024, minCasterRadius: 0.16, heroDetail: 0.35, ikRange: 14, relief: 0, grassSpread: 2, lampReach: 0.7, lampShadows: false, shadowsOnMove: true, bloomShare: 0.5, drapeRounds: 2 },
};

export const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low'];

/**
 * Auto quality: a level down when the average FPS stays below `minFps` for `window` seconds, the screen's own pixels
 * kept at every level. What the hardware holds is measured, never guessed from the device. Far below it (under
 * `farBelow` of `minFps`) a window of `farWindow` is enough, and it goes to the bottom at once: a step at a time, 6 s
 * each, a phone's first visit (Auto starting from High) drew a few frames a second for half a minute, from play
 * "insane slowdown when choosing a hero upon first entry into the game, on phone".
 */
export const AUTO_QUALITY = { minFps: 50, window: 4, settle: 2, farBelow: 0.5, farWindow: 1.5 };
