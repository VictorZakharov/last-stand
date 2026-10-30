// A crowd slot's material on WebGPU (core/webgpu.ts): crowd.ts's GLSL, the body skinned from its row of the float
// texture by its instance, and the kit's looks (core/materials.ts: dissolve and its edge, frost, char, hit flash)
// from its row, as TSL nodes. Not yet ported: the near glow, the rim, the screen door at the camera and the
// shadow's caster sizes.
import * as THREE from 'three';
import { gpu, tsl } from '../../core/webgpu';

/** What a slot's material reads of its kind: its rows, how many joints a row holds, the texels of looks after them. */
export interface Rows { texture: THREE.DataTexture; joints: number; looks: number }

// (untyped: TSL's types don't follow its int conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** The kit's value noise (`fxNoise` in core/materials.ts), for the dissolve's edge and the char's cracks. */
function fxNoise(x: N): N {
  const { Fn, floor, fract, mix, vec3 } = tsl as any;
  const hash = (q: N): N => {
    const p = fract(q.mul(0.3183099).add(0.1)).mul(17);
    return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
  };
  return Fn(() => {
    const i = floor(x).toVar(), f0 = fract(x);
    const f = f0.mul(f0).mul(f0.mul(-2).add(3)).toVar();
    const at = (a: number, b: number, c: number): N => hash(i.add(vec3(a, b, c)));
    const z0 = mix(mix(at(0, 0, 0), at(1, 0, 0), f.x), mix(at(0, 1, 0), at(1, 1, 0), f.x), f.y);
    const z1 = mix(mix(at(0, 0, 1), at(1, 0, 1), f.x), mix(at(0, 1, 1), at(1, 1, 1), f.x), f.y);
    return mix(z0, z1, f.z);
  })();
}

/** A copy of `base` as a node material, skinned from `rows`, its looks and glow the body's own (`slot`'s, from its row). */
export function crowdNodeMaterial(base: THREE.MeshStandardMaterial, rows: Rows, slot: number): THREE.Material {
  const {
    Fn, If, Discard, attribute, textureLoad, ivec2, int, instanceIndex, mat4, vec3, vec4, positionLocal, normalLocal,
    positionGeometry, materialColor, materialOpacity, materialEmissive, varying, mix, smoothstep,
  } = tsl as any;
  const source = base.clone();
  source.emissiveIntensity = 1;
  const Node = (base as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? gpu.MeshPhysicalNodeMaterial : gpu.MeshStandardNodeMaterial;
  const m = new Node() as unknown as Record<string, unknown> & THREE.Material;
  // (as three's own conversion copies a material over: NodeLibrary.fromMaterial)
  for (const key in source) m[key] = (source as unknown as Record<string, unknown>)[key];
  m.onBeforeCompile = () => {};
  const texel = (x: N): N => textureLoad(rows.texture, ivec2(x, int(instanceIndex)));
  const joint = (i: N): N => {
    const x = int(i).mul(4);
    return mat4(texel(x), texel(x.add(1)), texel(x.add(2)), texel(x.add(3)));
  };
  const index = attribute('crowdIndex', 'vec2');
  const weight = attribute('crowdWeight', 'vec2');
  const node = m as unknown as Record<'positionNode' | 'colorNode' | 'emissiveNode', N>;
  node.positionNode = Fn(() => {
    const skin = joint(index.x).mul(weight.x).add(joint(index.y).mul(weight.y)).toVar();
    normalLocal.assign(skin.mul(vec4(normalLocal, 0)).xyz);
    return skin.mul(vec4(positionLocal, 1)).xyz;
  })();
  const looks = rows.joints * 4;
  // (the kit's looks: dissolve, frost, char, hit; its edge's colour; this material's glow)
  const fx = varying(texel(int(looks)));
  const edgeColor = varying(texel(int(looks + 1)).xyz);
  const glow = varying(texel(int(looks + rows.looks + Math.floor(slot / 4))).element(int(slot % 4)));
  const at = varying(positionGeometry);
  const dn = fxNoise(at.mul(7)).mul(0.65).add(fxNoise(at.mul(19)).mul(0.35)).toVar();
  node.colorNode = Fn(() => {
    If(fx.x.greaterThan(0).and(dn.lessThan(fx.x)), () => { Discard(); });
    const frozen = mix(materialColor.rgb, vec3(0.55, 0.8, 1.0), fx.y.mul(0.75));
    return vec4(mix(frozen, vec3(0.045, 0.035, 0.03), fx.z.mul(0.9)), materialOpacity);
  })();
  const edge = fx.x.greaterThan(0).select(smoothstep(fx.x, fx.x.add(0.09), dn).oneMinus(), 0);
  node.emissiveNode = materialEmissive.mul(glow).mul(fx.z.mul(-0.7).add(1))
    .add(edgeColor.mul(edge).mul(3))
    .add(vec3(0.25, 0.55, 0.9).mul(fx.y).mul(0.35))
    .add(vec3(1.0, 0.32, 0.06).mul(fx.z).mul(smoothstep(0.6, 0.78, dn)).mul(1.6))
    .add(vec3(1.0, 0.9, 0.85).mul(fx.w).mul(0.45));
  return m;
}
