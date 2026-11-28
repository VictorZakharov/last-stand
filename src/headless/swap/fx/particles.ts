// The particles, for the fight with nothing drawn: bursts, smoke and debris are never made.
import * as THREE from 'three';
import type * as Real from '../../../fx/particles';

export const burst: typeof Real.burst = () => undefined;
export const debris: typeof Real.debris = () => undefined;
export const smokePuff: typeof Real.smokePuff = () => undefined;
export const col: typeof Real.col = (hex, mul = 1) => new THREE.Color(hex).multiplyScalar(mul);
type Pool = typeof Real.particles.glow;
/** A pool as the fight's code uses one (`spawn`, `count`), holding nothing. */
const emptyPool = (): Pool => ({ count: 0, spawn: () => undefined }) as Partial<Pool> as Pool;

export const particles: typeof Real.particles = {
  glow: emptyPool(),
  smoke: emptyPool(),
  init: () => undefined,
  update: () => undefined,
  clear: () => undefined,
};
