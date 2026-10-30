// The labels' material on WebGPU (core/webgpu.ts): layer.ts's GLSL as TSL nodes, each quad placed in the canvas's
// pixels and read from its slot of the atlas.
import * as THREE from 'three';
import { gpu, tsl } from '../../core/webgpu';

/** What layer.ts sets on the labels' material each frame: the canvas's size in pixels, and the atlas. */
export interface LabelsLook { material: THREE.Material; view: THREE.Vector2; atlas: { value: THREE.Texture } }

/** The labels' material as nodes, blended as `layer.ts`'s (its colours premultiplied by their alpha). */
export function labelsNodeMaterial(atlas: THREE.Texture): LabelsLook {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { attribute, uniform, texture, vec4, varying, positionGeometry, mix } = tsl as any;
  const view = new THREE.Vector2(1, 1);
  const uView = uniform(view);
  const rect = attribute('aRect', 'vec4'), uvs = attribute('aUv', 'vec4'), alpha = attribute('aAlpha', 'float');
  const px = rect.xy.add(positionGeometry.xy.mul(rect.zw));
  const material = new gpu.NodeMaterial();
  const node = material as unknown as Record<string, unknown>;
  node.vertexNode = vec4(px.x.div(uView.x).mul(2).sub(1), px.y.div(uView.y).mul(-2).add(1), 0, 1);
  const map = texture(atlas, varying(mix(uvs.xy, uvs.zw, positionGeometry.xy)));
  node.fragmentNode = map.mul(varying(alpha));
  Object.assign(material, {
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  return { material, view, atlas: map };
}
