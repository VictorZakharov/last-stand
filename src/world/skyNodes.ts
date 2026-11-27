// The skies' materials: props.ts's night and day domes and the village's, each a look material drawn by its look
// alone (engine/looks/sky.ts: the WGSL, on the far plane, out of the fog), its uniforms read by name each frame.
import { BackSide, LookMaterial, type Uniforms } from '../engine/api/index.ts';
import { rustLook } from '../engine/custom';
import { daySkyLook, nightSkyLook, villageSkyLook } from '../engine/looks/sky';

/** A dome's material, reading `uniforms`: seen from inside, writing no depth, unfogged. */
const domeMaterial = (uniforms: Uniforms): LookMaterial =>
  new LookMaterial({ uniforms, side: BackSide, depthWrite: false, fog: false });

/** The night sky (`buildSky`, its `uFog`, `uMoon` and `uZenith`): the fog's colour at the horizon, a faint glow above
 *  it, the zenith overhead, a moon and a sprinkle of stars. */
export const nightSkyMaterial = (uniforms: Uniforms): LookMaterial =>
  rustLook(domeMaterial(uniforms), nightSkyLook(uniforms));

/** The day sky (`buildDaySky`, its `uHorizon`, `uZenith`, `uSun` and `uTime`): the horizon rising into the zenith, a
 *  sun with a warm glow round it, and slow soft clouds. */
export const daySkyMaterial = (uniforms: Uniforms): LookMaterial =>
  rustLook(domeMaterial(uniforms), daySkyLook(uniforms));

/** The village's sky (`buildDaySky` in `village.ts`, its `uHorizon`, `uZenith`, `uSun`, `uDay` and `uTime`): the
 *  sun's glow and disc by day, the moon's by night, stars fading in as the day goes, clouds lit by day, grey by night. */
export const villageSkyMaterial = (uniforms: Uniforms): LookMaterial =>
  rustLook(domeMaterial(uniforms), villageSkyLook(uniforms));
