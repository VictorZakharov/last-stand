// The root of what's drawn (three's `Scene`): a node with the world's fog and background. The stage shows one
// world at a time (`../stage.ts`), and only what's under it is the engine's.
import { Color } from '../math/index.ts';
import type { Texture } from '../material/index.ts';
import { Node } from './node.ts';

/** Fog by distance: none nearer than `near`, whole from `far`. */
export class Fog {
  /** what every fog by distance says it is */
  readonly isFog = true;
  readonly color: Color;
  near: number;
  far: number;

  constructor(color: Color | number | string, near = 1, far = 1000) {
    this.color = new Color(color);
    this.near = near;
    this.far = far;
  }

  /** A copy of it. */
  clone(): Fog { return new Fog(this.color, this.near, this.far); }
}

/** Fog thickening with distance by `density`. */
export class FogExp2 {
  /** what every thickening fog says it is */
  readonly isFogExp2 = true;
  readonly color: Color;
  density: number;

  constructor(color: Color | number | string, density = 0.00025) {
    this.color = new Color(color);
    this.density = density;
  }

  /** A copy of it. */
  clone(): FogExp2 { return new FogExp2(this.color, this.density); }
}

/** The root of what's drawn. */
export class World extends Node {
  /** what every world says it is */
  readonly isWorld = true;
  /** the fog over it, if any */
  fog: Fog | FogExp2 | null = null;
  /** what's behind it: a colour, a picture, or nothing (the sky's dome draws it) */
  background: Color | Texture | null = null;
  /** what stands for its surroundings' light: the engine reads only whether one is set (its sky's two halves light
   *  the scene), and how strongly */
  environment: Texture | null = null;
  environmentIntensity = 1;

  constructor() {
    super();
    this.type = 'World';
  }
}
