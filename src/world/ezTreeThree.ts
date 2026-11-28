// What ez-tree's source imports as `three` (vite.config.ts resolves it here for ez-tree's own modules alone,
// VictorZakharov/last-stand#973): three's names for the scene API's classes, so ez-tree grows its trees as the
// engine's geometry and nodes, and three is in no bundle. Only the names ez-tree's source uses (`src/lib/*.js`); its
// textures' module is a stub (`ezTreeTextures.ts`), and its materials are made and let go (`ezTrees.ts` keeps its
// geometry alone), so they take only what a lit material has.
import {
  Attribute, Color, DoubleSide, Euler, Geometry, LitMaterial, Mesh, Node, Quat, RepeatWrapping, SRGBColorSpace,
  Texture, Vec2, Vec3, type LitParameters,
} from '../engine/api/index.ts';
import * as shapes from '../engine/api/shapes/index.ts';

export { Color, DoubleSide, Euler, Mesh, RepeatWrapping, SRGBColorSpace, Texture };
export const Vector2 = Vec2;
export const Vector3 = Vec3;
export const Quaternion = Quat;
export const Group = Node;
export const BufferGeometry = Geometry;
export const BufferAttribute = Attribute;

/** three's Phong's parameters ez-tree gives that a lit material hasn't got: its dithering, its shine */
interface PhongParameters extends LitParameters {
  dithering?: boolean;
  shininess?: number;
}

/** ez-tree's bark and leaves (three's `MeshPhongMaterial`): a lit material, its Phong-only settings left out. */
export class MeshPhongMaterial extends LitMaterial {
  constructor(parameters: PhongParameters = {}) {
    const { dithering, shininess, ...lit } = parameters;
    void dithering;
    void shininess;
    super(lit);
  }
}

/** ez-tree's trellis's material (three's `MeshStandardMaterial`). */
export const MeshStandardMaterial = LitMaterial;

/** ez-tree's trellis's bars (three's `CylinderGeometry`): the API's cylinder, made by `new` as three's is. */
export class CylinderGeometry extends Geometry {
  constructor(...args: Parameters<typeof shapes.cylinder>) {
    super();
    this.copy(shapes.cylinder(...args));
  }
}

/** three's loader, which ez-tree's textures module makes as it loads: the stub that replaces that module never does. */
export class TextureLoader {
  /** Loads nothing: the trees' pictures never ship (`ezTreeTextures.ts`). */
  load(): Texture {
    throw new Error('ez-tree: its pictures never ship, and nothing loads one (ezTreeTextures.ts)');
  }
}
