// The particle pools on WebGPU (core/webgpu.ts), which draws points a pixel wide: each particle an instanced quad
// (three's sprite path of `PointsNodeMaterial`), sized, faded and dimmed as particles.ts's GLSL does it.
import * as THREE from 'three';
import { NEAR_GLOW } from '../core/materials';
import { gpu, tsl } from '../core/webgpu';

/** A pool's mesh on WebGPU and its scale (particles.ts's `uScale`: a size in metres to pixels at 1 m). */
export interface ParticleQuads { mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material>; scale: { value: number } }

/** A quad a particle over `centers`, `colors` and `sizes` (instanced attributes), blended by `blending`. */
export function particleQuads(
  centers: THREE.InstancedBufferAttribute, colors: THREE.InstancedBufferAttribute, sizes: THREE.InstancedBufferAttribute,
  blending: THREE.Blending, soft: number,
): ParticleQuads {
  // (untyped: TSL's types don't follow these conversions yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Fn, If, Discard, attribute, uniform, varying, vec4, uv, positionView, screenDPR, smoothstep, clamp, pow } = tsl as any;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  geo.setAttribute('aCenter', centers);
  geo.setAttribute('aColor', colors);
  geo.setAttribute('aSize', sizes);
  geo.instanceCount = 0;
  const scale = uniform(400);
  const material = new gpu.PointsNodeMaterial({ transparent: true, depthWrite: false, blending });
  material.sizeAttenuation = false;
  const node = material as unknown as Record<'positionNode' | 'sizeNode' | 'colorNode', unknown>;
  node.positionNode = attribute('aCenter', 'vec3');
  const depth = positionView.z.negate();
  // (its diameter in the scene's pixels, as gl_PointSize had it; three multiplies the pixel ratio back in)
  node.sizeNode = attribute('aSize', 'float').mul(scale).div(depth).div(screenDPR);
  const color = attribute('aColor', 'vec4');
  // fade out near the lens (particles.ts), and an additive pool's glow dims with distance (`nearGlow`)
  const near = varying(smoothstep(0.5, 3.5, depth));
  const glow = blending === THREE.AdditiveBlending
    ? varying(clamp(pow(depth.div(NEAR_GLOW.ref), NEAR_GLOW.pow), NEAR_GLOW.min, 1)) : 1;
  const c = varying(color);
  node.colorNode = Fn(() => {
    const d = uv().sub(0.5).length().mul(2).toVar();
    If(d.greaterThan(1), () => { Discard(); });
    return vec4(c.rgb.mul(glow), c.a.mul(near).mul(pow(d.oneMinus(), soft)));
  })();
  const mesh = new THREE.Mesh(geo, material as unknown as THREE.Material);
  return { mesh, scale };
}
