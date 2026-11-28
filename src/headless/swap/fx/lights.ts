// The pooled point lights, for the fight with nothing drawn: a flash is a slot nothing lights.
import * as THREE from 'three';
import type * as Real from '../../../fx/lights';

/** A slot as the real pool hands one out, lit by nothing. */
const slot = (): Real.LightSlot => ({ light: new THREE.PointLight(), life: 0, maxLife: 1, peak: 0, hold: 0, follow: null, born: 0 });

export const flash: typeof Real.flash = () => slot();
export const flashFree: typeof Real.flashFree = () => null;
export const release: typeof Real.release = () => undefined;
export const clearLights: typeof Real.clearLights = () => undefined;
