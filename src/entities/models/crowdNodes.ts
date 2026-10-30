// A crowd slot's material on WebGPU (core/webgpu.ts): crowd.ts's GLSL, the body skinned from its row of the float
// texture by its instance, as TSL nodes. Not yet ported: the kit's looks (dissolve, frost, char, hit, edge), the
// screen door at the camera and the shadow's caster sizes.
import * as THREE from 'three';
import { gpu, tsl } from '../../core/webgpu';

/** What a slot's material reads of its kind: its rows, how many joints a row holds, the texels of looks after them. */
export interface Rows { texture: THREE.DataTexture; joints: number; looks: number }

/** A copy of `base` as a node material, skinned from `rows` and its glow the body's own (`slot`'s, from its row). */
export function crowdNodeMaterial(base: THREE.MeshStandardMaterial, rows: Rows, slot: number): THREE.Material {
  // (untyped: TSL's types don't follow its int conversions across these calls yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Fn, attribute, textureLoad, ivec2, int, instanceIndex, mat4, vec4, positionLocal, normalLocal, materialEmissive, varying } = tsl as any;
  const source = base.clone();
  source.emissiveIntensity = 1;
  const Node = (base as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? gpu.MeshPhysicalNodeMaterial : gpu.MeshStandardNodeMaterial;
  const m = new Node() as unknown as Record<string, unknown> & THREE.Material;
  // (as three's own conversion copies a material over: NodeLibrary.fromMaterial)
  for (const key in source) m[key] = (source as unknown as Record<string, unknown>)[key];
  m.onBeforeCompile = () => {};
  const texel = (x: unknown) => textureLoad(rows.texture, ivec2(x, int(instanceIndex)));
  const joint = (i: unknown) => {
    const x = int(i).mul(4);
    return mat4(texel(x), texel(x.add(1)), texel(x.add(2)), texel(x.add(3)));
  };
  const index = attribute('crowdIndex', 'vec2');
  const weight = attribute('crowdWeight', 'vec2');
  const node = m as unknown as { positionNode: unknown; emissiveNode: unknown };
  node.positionNode = Fn(() => {
    const skin = joint(index.x).mul(weight.x).add(joint(index.y).mul(weight.y)).toVar();
    normalLocal.assign(skin.mul(vec4(normalLocal, 0)).xyz);
    return skin.mul(vec4(positionLocal, 1)).xyz;
  })();
  const glows = texel(int(rows.joints * 4 + rows.looks + Math.floor(slot / 4)));
  node.emissiveNode = materialEmissive.mul(varying(glows.element(int(slot % 4))));
  return m;
}
