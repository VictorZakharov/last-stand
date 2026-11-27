// The lights: nodes the engine reads each frame for their colour, strength and place (`../../lights.ts`): a point
// light's reach and falloff, the sun's way to its target and its shadow's box, the sky's two halves, the ambient
// fill. A light faces the way it shines by its −z, as a camera looks. The pooled point lights (`fx/lights.ts`)
// stay the game's rule: a light added or taken away changes what every lit shader is drawn with.
import { Color, Mat4, Vec2, Vec3 } from '../math/index.ts';
import { OrthoCamera, PerspectiveCamera, type Camera } from './camera.ts';
import { Node } from './node.ts';

/** a colour as a light takes it: a colour, an sRGB hex number, or a CSS string */
export type LightColor = Color | number | string;

const _from = new Vec3();
const _toward = new Vec3();
const _viewProjection = new Mat4();

/** A light's shadow: the camera its map is drawn through and how it's read. */
export class LightShadow<C extends Camera = Camera> {
  /** the camera the shadow's map is drawn through */
  camera: C;
  /** how dark the shadow is, 0 none to 1 whole */
  intensity = 1;
  /** a depth offset against the map's own shadow on what casts it */
  bias = 0;
  /** an offset along the surface's normal, against the same */
  normalBias = 0;
  /** how soft its edge is */
  radius = 1;
  /** the map's size in texels */
  readonly mapSize = new Vec2(512, 512);
  /** the world into the map's texture space and depth (made by `updateMatrices`) */
  readonly matrix = new Mat4();
  /** whether its map is drawn again every frame */
  autoUpdate = true;
  /** whether its map is drawn again once (the game's ask, while `autoUpdate` is off) */
  needsUpdate = false;

  /** A shadow drawn through `camera`. */
  constructor(camera: C) {
    this.camera = camera;
  }

  /**
   * Its camera put where `light` stands, looking at its target, and `matrix` made from it: three 0.187's
   * `LightShadow.updateMatrices`, its texture-space bias for a depth already 0 to 1 (WebGPU's).
   */
  updateMatrices(light: { readonly matrixWorld: Mat4; readonly target: Node }): void {
    const camera = this.camera;
    _from.setFromMatrixPosition(light.matrixWorld);
    camera.position.copy(_from);
    _toward.setFromMatrixPosition(light.target.matrixWorld);
    camera.lookAt(_toward);
    _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.matrix.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 1, 0,
      0, 0, 0, 1,
    );
    this.matrix.multiply(_viewProjection);
  }

  /** `source`'s settings copied, its camera cloned; itself. */
  copy(source: LightShadow<C>): this {
    this.camera = source.camera.clone() as C;
    this.intensity = source.intensity;
    this.bias = source.bias;
    this.normalBias = source.normalBias;
    this.radius = source.radius;
    this.mapSize.copy(source.mapSize);
    this.autoUpdate = source.autoUpdate;
    this.needsUpdate = source.needsUpdate;
    return this;
  }

  /** Nothing held to let go (the engine holds the maps): kept for the game's calls. */
  dispose(): void {}
}

/** A point light's shadow: six faces drawn through a 90° camera. */
export class PointLightShadow extends LightShadow<PerspectiveCamera> {
  /** what every point light's shadow says it is */
  readonly isPointLightShadow = true;

  constructor() {
    super(new PerspectiveCamera(90, 1, 0.5, 500));
  }

  /** A copy of it. */
  clone(): PointLightShadow { return new PointLightShadow().copy(this); }
}

/** The sun's shadow: a box drawn through an ortho camera. */
export class DirectionalLightShadow extends LightShadow<OrthoCamera> {
  /** what every directional light's shadow says it is */
  readonly isDirectionalLightShadow = true;

  constructor() {
    super(new OrthoCamera(-5, 5, 5, -5, 0.5, 500));
  }

  /** A copy of it. */
  clone(): DirectionalLightShadow { return new DirectionalLightShadow().copy(this); }
}

/** A light: a node with a colour and a strength. */
export class Light extends Node {
  /** what every light says it is */
  readonly isLight = true;
  /** its colour (linear) */
  readonly color: Color;
  /** its strength */
  intensity: number;

  /** A light of `color` (white if none) at `intensity`. */
  constructor(color: LightColor = 0xffffff, intensity = 1) {
    super();
    this.type = 'Light';
    this.color = new Color(color);
    this.intensity = intensity;
  }

  /** It shines by its −z: `lookAt` turns that to the target. */
  protected override facesByMinusZ(): boolean { return true; }

  /** `source`'s state copied onto it, its colour and strength too; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof Light) {
      this.color.copy(source.color);
      this.intensity = source.intensity;
    }
    return this;
  }

  /** Nothing held to let go: kept for the game's calls. */
  dispose(): void {}
}

/** A light from a point, falling off with distance. */
export class PointLight extends Light {
  /** what every point light says it is */
  readonly isPointLight = true;
  /** how far it reaches (0: without end) */
  distance: number;
  /** how it falls off: 2 the square of the distance (past 2, the game's softness: `core/lamps.ts`) */
  decay: number;
  /** its shadow, where it casts one */
  shadow = new PointLightShadow();

  /** A light of `color` at `intensity`, reaching `distance`, falling off by `decay`. */
  constructor(color?: LightColor, intensity = 1, distance = 0, decay = 2) {
    super(color, intensity);
    this.type = 'PointLight';
    this.distance = distance;
    this.decay = decay;
  }

  /** `source`'s state copied onto it, its reach and shadow too; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof PointLight) {
      this.distance = source.distance;
      this.decay = source.decay;
      this.shadow = source.shadow.clone();
    }
    return this;
  }

  /** A copy of it. */
  override clone(recursive = true): PointLight { return new PointLight().copy(this, recursive); }
}

/** Light from far off along one way: from where it stands to its target (the sun, the moon). */
export class DirectionalLight extends Light {
  /** what every directional light says it is */
  readonly isDirectionalLight = true;
  /** what it shines toward (the way is from it to the target's place in the world) */
  target = new Node();
  /** its shadow, where it casts one */
  shadow = new DirectionalLightShadow();

  /** A light of `color` at `intensity`, standing over the origin (0, 1, 0), shining at it. */
  constructor(color?: LightColor, intensity = 1) {
    super(color, intensity);
    this.type = 'DirectionalLight';
    this.position.set(0, 1, 0);
  }

  /** `source`'s state copied onto it, its target and shadow cloned; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof DirectionalLight) {
      this.target = source.target.clone();
      this.shadow = source.shadow.clone();
    }
    return this;
  }

  /** A copy of it. */
  override clone(recursive = true): DirectionalLight { return new DirectionalLight().copy(this, recursive); }
}

/** Light from the sky above and the ground below, blended by which way a surface faces. */
export class HemisphereLight extends Light {
  /** what every hemisphere light says it is */
  readonly isHemisphereLight = true;
  /** the ground's colour (the sky's is `color`) */
  readonly groundColor: Color;

  /** The sky's `sky` over the ground's `ground` at `intensity` (both white if none). */
  constructor(sky?: LightColor, ground: LightColor = 0xffffff, intensity = 1) {
    super(sky, intensity);
    this.type = 'HemisphereLight';
    this.position.set(0, 1, 0);
    this.groundColor = new Color(ground);
  }

  /** `source`'s state copied onto it, its ground's colour too; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof HemisphereLight) this.groundColor.copy(source.groundColor);
    return this;
  }

  /** A copy of it. */
  override clone(recursive = true): HemisphereLight { return new HemisphereLight().copy(this, recursive); }
}

/** Light alike on everything, from no way. */
export class AmbientLight extends Light {
  /** what every ambient light says it is */
  readonly isAmbientLight = true;

  /** A light of `color` at `intensity`. */
  constructor(color?: LightColor, intensity = 1) {
    super(color, intensity);
    this.type = 'AmbientLight';
  }

  /** A copy of it. */
  override clone(recursive = true): AmbientLight { return new AmbientLight().copy(this, recursive); }
}
