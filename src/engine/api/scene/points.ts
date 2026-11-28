// What's drawn as the engine's sprites and lines (`../../sprites.ts`) rather than as triangles: points of a geometry
// (each a sprite facing the camera), a lone sprite, and lines through a geometry's points (a strip, or pairs).
// Each holds its geometry and material as a mesh does, telling the stage when either is swapped.
import { Geometry } from '../geometry/index.ts';
import { LineMaterial, PointsMaterial, SpriteMaterial, type Material } from '../material/index.ts';
import { Vec2 } from '../math/index.ts';
import { Node } from './node.ts';

/** A node drawing a geometry by a material that isn't made of triangles: the base of points and lines. */
class Drawn<G extends Geometry, M extends Material | Material[]> extends Node {
  private _geometry: G;
  private _material: M;

  /** `geometry` drawn by `material`. */
  constructor(geometry: G, material: M) {
    super();
    this._geometry = geometry;
    this._material = material;
  }

  /** what it draws */
  get geometry(): G { return this._geometry; }
  set geometry(value: G) {
    if (value === this._geometry) return;
    this._geometry = value;
    this.link?.redraw(this);
  }

  /** what it's drawn by */
  get material(): M { return this._material; }
  set material(value: M) {
    if (value === this._material) return;
    this._material = value;
    this.link?.redraw(this);
  }

  /** `source` copied onto it, its geometry and material shared; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof Drawn) {
      this.geometry = source.geometry as G;
      this.material = (Array.isArray(source.material) ? source.material.slice() : source.material) as M;
    }
    return this;
  }
}

/** A geometry's points, each drawn as a sprite facing the camera. */
export class Points<G extends Geometry = Geometry, M extends Material | Material[] = Material | Material[]>
  extends Drawn<G, M> {
  /** what every set of points says it is */
  readonly isPoints = true;

  /** `geometry`'s points drawn by `material` (an empty geometry and a white points material if none). */
  constructor(geometry?: G, material?: M) {
    super(geometry ?? (new Geometry() as G), material ?? (new PointsMaterial() as unknown as M));
    this.type = 'Points';
  }

  /** A copy of it, its geometry and material shared. */
  override clone(recursive = true): Points<G, M> {
    return new Points<G, M>(this.geometry, this.material).copy(this, recursive);
  }
}

/** Lines through a geometry's points, one after another. */
export class Line<G extends Geometry = Geometry, M extends Material | Material[] = Material | Material[]>
  extends Drawn<G, M> {
  /** what every line says it is */
  readonly isLine = true;

  /** Lines through `geometry`'s points drawn by `material` (an empty geometry and a white line material if none). */
  constructor(geometry?: G, material?: M) {
    super(geometry ?? (new Geometry() as G), material ?? (new LineMaterial() as unknown as M));
    this.type = 'Line';
  }

  /** A copy of it, its geometry and material shared. */
  override clone(recursive = true): Line<G, M> {
    return new Line<G, M>(this.geometry, this.material).copy(this, recursive);
  }
}

/** Lines between a geometry's points two by two. */
export class LineSegments<G extends Geometry = Geometry, M extends Material | Material[] = Material | Material[]>
  extends Line<G, M> {
  /** what every set of line segments says it is */
  readonly isLineSegments = true;

  /** Lines between `geometry`'s points in pairs drawn by `material`. */
  constructor(geometry?: G, material?: M) {
    super(geometry, material);
    this.type = 'LineSegments';
  }

  /** A copy of it, its geometry and material shared. */
  override clone(recursive = true): LineSegments<G, M> {
    return new LineSegments<G, M>(this.geometry, this.material).copy(this, recursive);
  }
}

/** A picture facing the camera wherever it stands. */
export class Sprite<M extends Material = Material> extends Node {
  /** what every sprite says it is */
  readonly isSprite = true;
  /** the point of the picture that stands at its place, 0 to 1 across and up (its middle by default) */
  readonly center = new Vec2(0.5, 0.5);
  private _material: M;

  /** A sprite drawn by `material` (a white sprite material if none). */
  constructor(material?: M) {
    super();
    this.type = 'Sprite';
    this._material = material ?? (new SpriteMaterial() as unknown as M);
  }

  /** what it's drawn by */
  get material(): M { return this._material; }
  set material(value: M) {
    if (value === this._material) return;
    this._material = value;
    this.link?.redraw(this);
  }

  /** `source` copied onto it, its material shared; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof Sprite) {
      this.center.copy(source.center);
      this.material = source.material as M;
    }
    return this;
  }

  /** A copy of it, its material shared. */
  override clone(recursive = true): Sprite<M> {
    return new Sprite<M>(this._material).copy(this, recursive);
  }
}
