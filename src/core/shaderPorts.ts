// The game's own GLSL `ShaderMaterial`s on WebGPU (core/webgpu.ts, docs/research/webgpu.md): an effect gives its
// material a port (`portShader`), its shader as nodes (WGSL written line for line from the GLSL, `wgslFn`), and three
// takes the port in its place as it builds the material there (its library's `fromMaterial`, `takePorts`). The
// material stays the one the game holds and drives: the port reads its uniforms by reference (`uniformsOf`), and the
// draw takes its blending, sides and depth from it as they are. On WebGL nothing changes.
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { NEAR_GLOW, type KitLooks } from './materials';
import type { SeeThrough } from './seeThrough';
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

/** `material`'s uniforms as nodes by name, each read off the material being drawn as the frame draws it (but a
 *  texture not yet given, null: its port reads it itself). Read off this material's own uniforms, every material of
 *  a kind drew with the first's: three builds them once, by their shape (Maelstrom's walls drew with the warm-up's,
 *  faded out). */
export function uniformsOf(material: THREE.ShaderMaterial): Record<string, N> {
  const nodes: Record<string, N> = {};
  for (const [name, uniform] of Object.entries(material.uniforms)) {
    if (uniform.value === null) continue;
    nodes[name] = tsl.materialReference(`uniforms.${name}.value`, typeOf(uniform.value));
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
  // (its uniforms are read off the material three draws: this one where it asks the build's)
  node.uniforms = material.uniforms;
  const nearGlow = material.customProgramCacheKey() === 'nearGlow';
  node.fragmentNode = nearGlow ? nearGlowed(fragment) : fragment;
  if (vertex) node.vertexNode = vertex;
  if (position) node.positionNode = position;
  return node;
}

/** How much of a fragment at `world` to drop where it stands between the camera and the hero, as `seeFade()` has it
 *  (core/seeThrough.ts), by the hole and floor `see` reads (each a node of the `SeeThrough`'s values) */
export function seeFade(world: N, see: { focus: N; k: N; minY: N }): N {
  const { wgslFn, cameraPosition } = tsl as any;
  return wgslFn(`fn seeFade(wp: vec3f, eye: vec3f, focus: vec3f, k: vec4f, minY: f32) -> f32 {
    if (k.z <= 0.0 || wp.y <= minY) { return 0.0; }
    let ca = focus - eye;
    let l = length(ca);
    let dir = ca / l;
    let cp = wp - eye;
    let along = dot(cp, dir);
    if (along <= 0.0 || along >= l - k.w) { return 0.0; }
    return (1.0 - smoothstep(k.x, k.y, length(cp - dir * along))) * k.z;
  }`)({ wp: world, eye: cameraPosition, ...see });
}

/** The share of a raw shader's light kept as its prop dissolves (`seeThroughFade`'s `1.0 - seeFade()`), at the
 *  mesh's own place before any displacement, as its GLSL reads it; `see` its `uSee*` uniforms as nodes. */
export function seeKept(see: { focus: N; k: N; minY: N }): N {
  const { modelWorldMatrix, positionGeometry, varying, vec4 } = tsl as any;
  return seeFade(varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz), see).oneMinus();
}

/** `uniforms`' `seeThroughFade` values as nodes, each read off its object (one for every material of a kind) */
export function seeUniforms(uniforms: Record<string, { value: unknown }>): { focus: N; k: N; minY: N } {
  const { reference } = tsl as any;
  return {
    focus: reference('value', 'vec3', uniforms.uSeeFocus),
    k: reference('value', 'vec4', uniforms.uSeeK),
    minY: reference('value', 'float', uniforms.uSeeMinY),
  };
}

/** A see-through material's mask on WebGPU (`seeThrough`'s screen door): a fragment kept unless a share of the
 *  pixels as large as its fade is dropped there, by the same dither. Its values read off the material drawn, as
 *  every material of the kind shares the build. */
function seeMask(): N {
  const { materialReference, positionWorld, screenCoordinate, fract, dot, vec2 } = tsl as any;
  const see = {
    focus: materialReference('seeThrough.focus.value', 'vec3'),
    k: materialReference('seeThrough.k.value', 'vec4'),
    minY: materialReference('seeThrough.minY.value', 'float'),
  };
  const dither = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  return dither.greaterThanEqual(seeFade(positionWorld, see));
}

/** A kit material's looks on WebGPU, set on its converted node material (`patch` in core/materials.ts, in TSL): the
 *  dissolve (its pixels dropped by the noise, an edge glowing round the hole), frost and char over its colour, its
 *  glow dimmed near the camera (`near`), a rim of light at glancing angles, the frost's, the char's embers and a hit's
 *  flash. Each read off the material drawn: every kit's material of a kind shares the build. (Not yet: the hood's
 *  shade, the shine's cap.) */
function kitNodes(node: N): void {
  const {
    materialReference, materialColor, materialOpacity, materialEmissive, positionGeometry, positionView, normalView,
    positionViewDirection, varying, mix, vec3, vec4, smoothstep, clamp, pow, dot, select,
  } = tsl as any;
  const read = (name: string, type: string): N => materialReference(`kitLooks.${name}.value`, type);
  const dissolve = read('u.uDissolve', 'float');
  const frozen = read('u.uFrozen', 'float');
  const char = read('u.uChar', 'float');
  const { noise3 } = wgslNoise();
  const at = varying(positionGeometry);
  const dn = noise3({ x: at.mul(7) }).mul(0.65).add(noise3({ x: at.mul(19) }).mul(0.35));
  const near = clamp(pow(positionView.z.negate().div(NEAR_GLOW.ref), NEAR_GLOW.pow), NEAR_GLOW.min, 1);
  const frost = mix(materialColor.rgb, vec3(0.55, 0.8, 1.0), frozen.mul(0.75));
  node.colorNode = vec4(mix(frost, vec3(0.045, 0.035, 0.03), char.mul(0.9)), materialOpacity);
  const kept = dissolve.lessThanEqual(0).or(dn.greaterThanEqual(dissolve));
  node.maskNode = node.maskNode ? node.maskNode.and(kept) : kept;
  const edge = select(dissolve.greaterThan(0), smoothstep(dissolve, dissolve.add(0.09), dn).oneMinus(), 0);
  const facing = clamp(dot(normalView, positionViewDirection), 0, 1);
  node.emissiveNode = materialEmissive.mul(mix(1, near, read('near', 'float')))
    .add(read('rim', 'color').mul(pow(facing.oneMinus(), 3)))
    .add(read('u.uEdge', 'color').mul(edge).mul(3))
    .add(vec3(0.25, 0.55, 0.9).mul(frozen).mul(0.35))
    .mul(char.mul(-0.7).add(1))
    .add(vec3(1.0, 0.32, 0.06).mul(char).mul(smoothstep(0.6, 0.78, dn)).mul(1.6).mul(near))
    .add(vec3(1.0, 0.9, 0.85).mul(read('u.uHit', 'float')).mul(0.45).mul(near));
}

/** three's library made to take each ported material's node material in its place (its blending, sides and depth
 *  copied over every time three asks: the draw reads them off the game's material, the build off this one). */
/** `material`'s uniforms refreshed at every draw. three looks for a node on the material it was given, not on the
 *  node material it built from it, and finding none, refreshes a mesh that stays still only as its own properties
 *  change: a port's or a look's uniforms stayed as they first drew (the outline's strength at the warm-up's 0). The
 *  node is an own, enumerable property, as three looks for one. */
function refreshedEachDraw(material: THREE.Material): void {
  if (!Object.prototype.hasOwnProperty.call(material, 'refreshNode')) {
    (material as N).refreshNode = (tsl as any).float(0);
  }
}

/** A lit material's own looks on WebGPU, where its GLSL patch (`onBeforeCompile`) is WebGL's alone: given the node
 *  material three converts it to, as it's converted (a fire's char and embers: world/fireNodes.ts `emberNodes`).
 *  Its uniforms are read off the material drawn (`materialReference`), as three shares the build. */
export interface OwnLooks { webgpuLooks: (converted: N) => void }

export function takePorts(renderer: WebGPURenderer): void {
  const library = renderer.library as unknown as { fromMaterial(material: THREE.Material): THREE.Material | null };
  const fromMaterial = library.fromMaterial.bind(library);
  library.fromMaterial = (material) => {
    const port = ports.get(material);
    if (!port) {
      // (three logs only "ShaderMaterial is not compatible": which one, by its fragment shader's start)
      const fragment = (material as THREE.ShaderMaterial).isShaderMaterial && (material as THREE.ShaderMaterial).fragmentShader;
      if (fragment) console.error(`Not ported to WebGPU: ${material.name || fragment.trim().slice(0, 60).replace(/\s+/g, ' ')}`);
      const converted = fromMaterial(material);
      // (the props' and canopies' dissolve: their GLSL patch is WebGL's alone)
      const see = (material as { seeThrough?: SeeThrough }).seeThrough;
      const kit = (material as { kitLooks?: KitLooks }).kitLooks;
      const own = (material as Partial<OwnLooks>).webgpuLooks;
      // (a material three converts afresh each time: its own node materials, the crowds', are left as they are)
      if (converted && !(material as N).isNodeMaterial) {
        if (see) (converted as N).maskNode = seeMask();
        if (kit) kitNodes(converted);
        if (own) own(converted);
        if (see || kit || own) refreshedEachDraw(material);
      }
      return converted;
    }
    let node = made.get(material);
    if (!node) made.set(material, node = madeFrom(material as THREE.ShaderMaterial, port));
    THREE.Material.prototype.copy.call(node, material);
    refreshedEachDraw(material);
    return node;
  };
}
