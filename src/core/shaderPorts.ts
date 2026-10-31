// The game's own GLSL `ShaderMaterial`s on WebGPU (core/webgpu.ts, docs/research/webgpu.md): an effect gives its
// material a port (`portShader`), its shader as nodes (WGSL written line for line from the GLSL, `wgslFn`), and three
// takes the port in its place as it builds the material there (its library's `fromMaterial`, `takePorts`). The
// material stays the one the game holds and drives: the port reads its uniforms by reference (`uniformsOf`), and the
// draw takes its blending, sides and depth from it as they are. On WebGL nothing changes.
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { NEAR_GLOW } from './materials';
import { WEBGPU, gpu, tsl } from './webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
/** the node language as a port is given it (untyped as `N`: its types reject one `wgslFn` as another's include) */
export type Tsl = Record<string, N>;

/** A material's shader as nodes: its whole output (`gl_FragColor`), and where its vertex goes, in clip space
 *  (`vertex`, `gl_Position`) or in the object's own (`position`); three's own transform where neither is given. */
export interface Port { fragment: N; vertex?: N; position?: N }

/** Each material's port, as its effect gave it, and the node material made from it */
const ports = new WeakMap<THREE.Material, (t: Tsl, u: Record<string, N>) => Port>();
const made = new WeakMap<THREE.Material, THREE.Material>();

/** `material` drawn on WebGPU as `port` has it (given the node language and its uniforms as nodes). */
export function portShader<T extends THREE.ShaderMaterial>(material: T, port: (t: Tsl, u: Record<string, N>) => Port): T {
  if (WEBGPU) ports.set(material, port);
  return material;
}

/** The effects' shared noise in WGSL, made once: `hash2` and `noise2` (value noise on a plane, the GLSL's `h` and
 *  `n`), `hash3` and `noise3` (in space, the kit's `fxHash` and `fxNoise`) and `fbm3` (three octaves of it, the
 *  bolts' `fbm`); give a function the ones it calls. */
let noise: Record<'hash2' | 'noise2' | 'hash3' | 'noise3' | 'fbm3', N> | null = null;
export function wgslNoise(): Record<'hash2' | 'noise2' | 'hash3' | 'noise3' | 'fbm3', N> {
  if (noise) return noise;
  const { wgslFn } = tsl as any;
  const hash2 = wgslFn(`fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }`);
  const noise2 = wgslFn(`fn noise2(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), f.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), f.x), f.y);
  }`, [hash2]);
  const hash3 = wgslFn(`fn hash3(start: vec3f) -> f32 {
    var p = fract(start * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }`);
  const noise3 = wgslFn(`fn noise3(x: vec3f) -> f32 {
    let i = floor(x);
    var f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3f(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3f(0.0, 1.0, 0.0)), hash3(i + vec3f(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash3(i + vec3f(0.0, 0.0, 1.0)), hash3(i + vec3f(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3f(0.0, 1.0, 1.0)), hash3(i + vec3f(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }`, [hash3]);
  const fbm3 = wgslFn(`fn fbm3(p: vec3f) -> f32 {
    return noise3(p) * 0.55 + noise3(p * 2.1 + 3.1) * 0.3 + noise3(p * 4.3 + 7.7) * 0.15;
  }`, [noise3]);
  return noise = { hash2, noise2, hash3, noise3, fbm3 };
}

/** The node type of a uniform's value, as `reference` takes it */
function typeOf(value: unknown): string {
  if (typeof value === 'number') return 'float';
  if (value instanceof THREE.Color) return 'color';
  if (value instanceof THREE.Vector2) return 'vec2';
  if (value instanceof THREE.Vector3) return 'vec3';
  if (value instanceof THREE.Vector4) return 'vec4';
  if (value instanceof THREE.Matrix4) return 'mat4';
  if (value instanceof THREE.Texture) return 'texture';
  throw new Error(`shaderPorts: no node type for the uniform ${String(value)}`);
}

/** `material`'s uniforms as nodes by name, each read as the frame draws it (but a texture not yet given, null: its
 *  port reads it itself) */
export function uniformsOf(material: THREE.ShaderMaterial): Record<string, N> {
  const nodes: Record<string, N> = {};
  for (const [name, uniform] of Object.entries(material.uniforms)) {
    if (uniform.value === null) continue;
    nodes[name] = tsl.reference('value', typeOf(uniform.value), uniform);
  }
  return nodes;
}

/** `colour` dimmed near the camera as `nearGlow` dims it on WebGL (core/materials.ts): full from the top-down
 *  camera's distance, down to a quarter up close */
function nearGlowed(colour: N): N {
  const { positionView, vec4, clamp, pow } = tsl as any;
  const glow = clamp(pow(positionView.z.negate().div(NEAR_GLOW.ref), NEAR_GLOW.pow), NEAR_GLOW.min, 1);
  return vec4(colour.rgb.mul(glow), colour.a);
}

/** The node material three draws `material` with, made once from its port */
function madeFrom(material: THREE.ShaderMaterial, port: (t: Tsl, u: Record<string, N>) => Port): THREE.Material {
  const { fragment, vertex, position } = port(tsl as unknown as Tsl, uniformsOf(material));
  const node = new gpu.MeshBasicNodeMaterial() as N;
  const nearGlow = material.customProgramCacheKey() === 'nearGlow';
  node.fragmentNode = nearGlow ? nearGlowed(fragment) : fragment;
  if (vertex) node.vertexNode = vertex;
  if (position) node.positionNode = position;
  return node;
}

/** three's library made to take each ported material's node material in its place (its blending, sides and depth
 *  copied over every time three asks: the draw reads them off the game's material, the build off this one). */
export function takePorts(renderer: WebGPURenderer): void {
  const library = renderer.library as unknown as { fromMaterial(material: THREE.Material): THREE.Material | null };
  const fromMaterial = library.fromMaterial.bind(library);
  library.fromMaterial = (material) => {
    const port = ports.get(material);
    if (!port) {
      // (three logs only "ShaderMaterial is not compatible": which one, by its fragment shader's start)
      const fragment = (material as THREE.ShaderMaterial).isShaderMaterial && (material as THREE.ShaderMaterial).fragmentShader;
      if (fragment) console.error(`Not ported to WebGPU: ${material.name || fragment.trim().slice(0, 60).replace(/\s+/g, ' ')}`);
      return fromMaterial(material);
    }
    let node = made.get(material);
    if (!node) made.set(material, node = madeFrom(material as THREE.ShaderMaterial, port));
    THREE.Material.prototype.copy.call(node, material);
    return node;
  };
}
