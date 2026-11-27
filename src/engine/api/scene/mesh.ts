// A node that draws: a geometry by a material (or by several, one a group of the geometry's), its draws the engine's
// while it's under a shown world. Changing its geometry or material tells the stage; what changes inside them is
// told by their own versions, which the stage compares for the ones it draws.
import { Geometry } from '../geometry/index.ts';
import { UnlitMaterial, type Material } from '../material/index.ts';
import { Node } from './node.ts';
import type { Hit, Raycaster } from './raycaster.ts';
import { raycastMesh } from './raycast.ts';

/** A node that draws a geometry. */
export class Mesh<G extends Geometry = Geometry, M extends Material | Material[] = Material | Material[]>
  extends Node {
  /** what every mesh says it is */
  readonly isMesh = true;
  private _geometry: G;
  private _material: M;
  /** run before each frame that draws it, where its material's look asks (`RustLook.before` in `../../custom.ts`):
   *  a look that lists its own rows or sets its numbers from where it stands */
  onBeforeRender: ((mesh: Mesh) => void) | null = null;

  /** A mesh of `geometry` drawn by `material` (an empty geometry and a white unlit material if none). */
  constructor(geometry?: G, material?: M) {
    super();
    this.type = 'Mesh';
    this._geometry = geometry ?? (new Geometry() as G);
    this._material = material ?? (new UnlitMaterial() as unknown as M);
  }

  /** what it draws */
  get geometry(): G { return this._geometry; }
  set geometry(value: G) {
    if (value === this._geometry) return;
    this._geometry = value;
    this.link?.redraw(this);
  }

  /** what it's drawn by: one material, or one a group of its geometry's */
  get material(): M { return this._material; }
  set material(value: M) {
    if (value === this._material) return;
    this._material = value;
    this.link?.redraw(this);
  }

  /** Its draws told again: a material in its list or a group of its geometry changed in place. */
  redraw(): void { this.link?.redraw(this); }

  /** Where `raycaster`'s ray meets its triangles, added to `hits`. */
  raycast(raycaster: Raycaster, hits: Hit[]): void { raycastMesh(this, raycaster, hits); }

  /** `source` copied onto it, its geometry and material shared; itself. */
  override copy(source: Node, recursive = true): this {
    super.copy(source, recursive);
    if (source instanceof Mesh) {
      this.geometry = source.geometry as G;
      this.material = (Array.isArray(source.material) ? source.material.slice() : source.material) as M;
      this.onBeforeRender = source.onBeforeRender;
    }
    return this;
  }

  /** A copy of it, its geometry and material shared. */
  override clone(recursive = true): Mesh<G, M> {
    return new Mesh<G, M>(this._geometry, this._material).copy(this, recursive);
  }
}
