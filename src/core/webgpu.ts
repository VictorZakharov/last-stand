// The game on three's WebGPURenderer, behind `?renderer=webgpu` (docs/research/webgpu.md): the renderer made and
// given what the WebGL code around it asks of a WebGLRenderer, and the post chain as a node pipeline.
import * as THREE from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';

/** Whether this page draws with WebGPURenderer (`?renderer=webgpu`; `?renderer=webgpu-gl` its WebGL 2 backend). */
const asked = new URLSearchParams(location.search).get('renderer');
export const WEBGPU = asked === 'webgpu' || asked === 'webgpu-gl';

/** the point lights the shaders' loop takes (`DynamicLighting`): a biome's eight without shadows, the hero's two,
 *  the effects' pool of eight (`fx/lights.ts`), with room */
const MAX_LOOPED_LIGHTS = 24;

/** how long three's async compile works before it yields a frame (ms, `compileSlice`): while nothing is played (the
 *  loading screen, the fight's loading bar), and while the lobby is. Its own 8 ms kept the GPU's compilers a third
 *  busy (2.7 of Chrome's 9 at once), the lobby's main thread building nodes between frames: 40 took a return's lobby
 *  from 7.1 to 6.5 s and its fight's bar from 2.1 to 0.8 s, but behind the lobby drew it at 14 to 19 a second. */
export const COMPILE_SLICE = { loading: 40, playing: 8 };
/** three's async compile set to work `ms` before it yields a frame (`vite.config.ts` makes its build read it). */
export function compileSlice(ms: number): void {
  (globalThis as { __compileSliceMs?: number }).__compileSliceMs = ms;
}

let pipeline: RenderPipeline | null = null;
let sceneTarget: THREE.RenderTarget | null = null;
/** the compiles started and not yet waited for (`compiled`) */
const compiling: Promise<unknown>[] = [];

/** Waits for every compile started so far (and any started meanwhile) to have made its pipelines. */
export async function compiled(): Promise<void> {
  while (compiling.length) await Promise.all(compiling.splice(0));
}

/** The target the scene's pass draws into: what its pipelines are made for, the warm-ups' too. */
export const webgpuSceneTarget = (): THREE.RenderTarget => sceneTarget!;
/** three's WebGPU build and its node language, loaded with the renderer: what node materials are made from */
export let gpu: typeof import('three/webgpu');
export let tsl: typeof import('three/tsl');

/**
 * A WebGPURenderer, initialised, typed as the WebGLRenderer the rest of the game takes. What it lacks of one is
 * stood in for: `compile` (nothing listed as made), its programs (none
 * are WebGL's) and the anisotropy asked at boot. (Its own `debug` stays: its node builder reads hooks off it.)
 */
export async function makeWebGPURenderer(): Promise<THREE.WebGLRenderer> {
  gpu = await import('three/webgpu');
  tsl = await import('three/tsl');
  const { WebGPURenderer } = gpu;
  const renderer = new WebGPURenderer({ antialias: false, powerPreference: 'high-performance', forceWebGL: asked === 'webgpu-gl', trackTimestamp: true });
  await renderer.init();
  // three's GPU-driven drawing (r187): clusters of 64 triangles culled and their detail picked on the GPU, for what
  // it supports (static meshes and instanced ones in plain node materials); the rest drawn as before
  if (new URLSearchParams(location.search).get('meshlets') === '1') {
    const { MeshletDrawingPipeline } = await import('three/addons/pipelines/MeshletDrawingPipeline.js');
    (renderer as unknown as { drawingPipeline: unknown }).drawingPipeline = new MeshletDrawingPipeline();
  }
  // the point lights casting no shadow drawn by one loop over a uniform array in each lit shader, where three wrote
  // each out in full (the physical model's every term, eight times over): the lit fragment shaders were 55 kB of
  // WGSL each, 3.5 MB of the 4.6 the game made, and Chrome's DXC compiled them again on every visit (its cache
  // never served them). `?lights=each` for three's own, to compare.
  if (new URLSearchParams(location.search).get('lights') !== 'each') {
    const { DynamicLighting } = await import('three/addons/lighting/DynamicLighting.js');
    renderer.lighting = new DynamicLighting({ maxPointLights: MAX_LOOPED_LIGHTS });
  }
  compileShadowsToo(renderer);
  compileSlice(COMPILE_SLICE.loading);
  // TEMP: every node build, the compile's (started, `async`) and a draw's, with its key's parts (`&builds`, read by
  // `npm run stalls -- --read`)
  if (new URLSearchParams(location.search).has('builds')) recordBuilds(renderer);
  if (new URLSearchParams(location.search).has('shaders')) recordShaders(renderer);
  if (new URLSearchParams(location.search).has('drawn')) recordDraws(renderer);
  // (own properties over the class's getters: `compile` is one)
  const stand = (key: string, value: unknown) => Object.defineProperty(renderer, key, { value, writable: true });
  // the WebGL code's compiles started as `compileAsync`, for the target set (the warm-ups': the scene's pass's,
  // `sceneTarget` in renderer.ts): its pipelines made on the GPU's threads, its node builds a slice a frame, where
  // they were made at each material's first draw, on the main thread (the loading screen froze 10-15 s); waited for
  // by `compiled`. (Nothing listed as made: no WebGL programs to link.)
  stand('compile', (scene: THREE.Object3D, camera: THREE.Camera, target?: THREE.Scene | null) => {
    compiling.push(renderer.compileAsync(scene, camera, target ?? null).catch((e: unknown) => console.warn('WebGPU compile:', e)));
    return new Set<THREE.Material>();
  });
  stand('capabilities', { getMaxAnisotropy: () => renderer.getMaxAnisotropy(), isWebGL2: true });
  Object.defineProperty(renderer.info, 'programs', { value: [], writable: true });
  return renderer as unknown as THREE.WebGLRenderer;
}

/** a render object as the build record reads it */
type Built = {
  object: THREE.Object3D; material: THREE.Material; camera: THREE.Camera; context?: { id: number };
  initialCacheKey: number; getMaterialCacheKey(): number; getDynamicCacheKey(): number;
  lightsNode?: { _lights?: THREE.Light[] }; scene: object;
};

/** TEMP: each node build three makes, kept in `window.__builds` (see `makeWebGPURenderer`). */
function recordBuilds(renderer: WebGPURenderer): void {
  type Nodes = {
    getForRender: (ro: Built, ...rest: unknown[]) => unknown;
    get(ro: Built): { nodeBuilderState?: unknown };
    nodeBuilderCache: Map<number, unknown>;
  };
  const nodes = (renderer as unknown as { _nodes: Nodes })._nodes;
  const getForRender = nodes.getForRender.bind(nodes);
  const builds: object[] = [];
  Object.assign(window, { __builds: builds });
  nodes.getForRender = (ro: Built, ...rest: unknown[]) => {
    if (nodes.get(ro).nodeBuilderState !== undefined) return getForRender(ro, ...rest);
    const cached = nodes.nodeBuilderCache.has(ro.initialCacheKey);
    const at = performance.now();
    const compiling = (renderer as unknown as { _precompilationState: unknown })._precompilationState !== null;
    const out = getForRender(ro, ...rest);
    builds.push({
      t: Math.round(at), ms: +(performance.now() - at).toFixed(1), phase: compiling ? 'compile' : 'draw', cached,
      name: ro.object.name || ro.object.type, material: ro.material.name || ro.material.type,
      camera: ro.camera.id, context: ro.context?.id, key: ro.initialCacheKey,
      materialKey: ro.getMaterialCacheKey(), dynamicKey: ro.getDynamicCacheKey(),
      lights: (ro.lightsNode?._lights ?? []).map((l) => l.id).join(','), receive: ro.object.receiveShadow,
      environment: (ro.scene as { environmentNode?: { id: number } }).environmentNode?.id,
      fog: (ro.scene as { fog?: { id?: number } }).fog ? 1 : 0,
      contextNode: `${renderer.contextNode.id}.${renderer.contextNode.version}`,
    });
    return out;
  };
}

/** TEMP: the draws of the frames, by camera, object and its type, counted in `window.__drawn` (each frame's
 *  counts start afresh, so it holds the last frame's when read). */
function recordDraws(renderer: WebGPURenderer): void {
  type Drawn = { object: THREE.Object3D; camera: THREE.Camera; material: THREE.Material };
  const backend = (renderer as unknown as { backend: { draw(ro: Drawn, info: unknown): void } }).backend;
  const draw = backend.draw.bind(backend);
  let counts: Record<string, number> = {};
  let frame = -1;
  backend.draw = (ro: Drawn, info: unknown) => {
    const now = (renderer as unknown as { info: { frame: number } }).info.frame;
    if (now !== frame) {
      frame = now;
      Object.assign(window, { __drawn: counts });
      counts = {};
    }
    const type = (ro.object as { isInstancedMesh?: boolean }).isInstancedMesh ? 'Instanced' : ro.object.type;
    const path: string[] = [];
    for (let at = ro.object.parent; at && path.length < 4; at = at.parent) if (at.name) path.push(at.name);
    const name = ro.object.name || `- in ${path.join(' < ')}`;
    const key = `${ro.camera.type}#${ro.camera.id} ${type} ${name} / ${ro.material.type}`;
    counts[key] = (counts[key] ?? 0) + 1;
    // (and each camera's draws over every frame since the page started, with the frames: a mean a frame)
    const all = ((window as { __drawnAll?: Record<string, number> }).__drawnAll ??= {});
    const cam = `${ro.camera.type}#${ro.camera.id}`;
    all[cam] = (all[cam] ?? 0) + 1;
    all.frames = now;
    draw(ro, info);
  };
}

/** TEMP: every shader module's source, kept in `window.__shaders` (see `makeWebGPURenderer`). */
function recordShaders(renderer: WebGPURenderer): void {
  const device = (renderer as unknown as { backend: { device: GPUDevice } }).backend.device;
  const create = device.createShaderModule.bind(device);
  const shaders: string[] = [];
  Object.assign(window, { __shaders: shaders });
  device.createShaderModule = (descriptor: GPUShaderModuleDescriptor) => {
    shaders.push(descriptor.code);
    return create(descriptor);
  };
}

/** a shadow node's view of its frame, and the renderer's state while it compiles */
type ShadowFrame = { renderer: { _precompilationState: unknown } };
type Shadowing = { updateShadow(frame: ShadowFrame): void };

/**
 * three's `compileAsync` draws no shadow (r187: "do not render shadow maps during precompilation"), so every
 * caster's shadow pipeline was made as its shadow was first drawn, on the main thread, and with them the GPU's
 * process (the boot's 12 s stalls, which held the logo's WebGL exit up too). Here a compile draws each shadow once
 * as it meets it, its casters queued with the rest of the compile's work as any render inside a compile is
 * (each shadow drawn once a compile started: every object its light reaches meets it).
 */
function compileShadowsToo(renderer: WebGPURenderer): void {
  let compile = 0;
  const drawnFor = new WeakMap<object, number>();
  const compileAsync = renderer.compileAsync.bind(renderer);
  renderer.compileAsync = (...args: Parameters<typeof compileAsync>) => {
    compile++;
    return compileAsync(...args);
  };
  // (a shadow is drawn once a render, by the render's number, and a compile's queue is worked through under the
  // last frame's, whose shadows were drawn: so they're drawn here, where the compile updates each object's nodes)
  const nodes = (renderer as unknown as { _nodes: CompileNodes })._nodes;
  const updateBefore = nodes.updateBefore.bind(nodes);
  nodes.updateBefore = (renderObject: unknown) => {
    if ((renderer as unknown as ShadowFrame['renderer'])._precompilationState !== null) {
      for (const node of nodes_(renderObject).updateBeforeNodes) {
        if (!(node instanceof gpu.ShadowNode) || drawnFor.get(node) === compile) continue;
        drawnFor.set(node, compile);
        (node as unknown as Shadowing).updateShadow(nodes.getNodeFrameForRender(renderObject) as ShadowFrame);
      }
    }
    updateBefore(renderObject);
  };
}

/** what of three's node manager a compile's shadows use */
type CompileNodes = { updateBefore(renderObject: unknown): void; getNodeFrameForRender(renderObject: unknown): unknown };
const nodes_ = (renderObject: unknown): { updateBeforeNodes: object[] } =>
  (renderObject as { getNodeBuilderState(): { updateBeforeNodes: object[] } }).getNodeBuilderState();

/** The post chain on WebGPU: the scene's pass, its bloom added, tone mapped and in sRGB on the way out. */
export async function makePipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
  const { RenderPipeline } = await import('three/webgpu');
  const { pass } = await import('three/tsl');
  const { bloom } = await import('three/addons/tsl/display/BloomNode.js');
  const gpu = renderer as unknown as WebGPURenderer;
  const scenePass = pass(scene, camera);
  sceneTarget = scenePass.renderTarget;
  const color = scenePass.getTextureNode('output');
  pipeline = new RenderPipeline(gpu);
  pipeline.outputNode = color.add(bloom(color, 0.85, 0, 0.9));
}

/** the scene's environment as one node, its map swapped (`oneEnvironment`) */
let environment: { value: THREE.Texture } | null = null;

/**
 * The scene's environment map given to WebGPU as one node for good, its map swapped as the look changes: three
 * makes each map a node of its own, whose id is in every lit pipeline's key, so each biome's map and the hall of
 * heroes' had a copy of every lit pipeline, made at the first frames in its look (a first visit's hall: 6 s held up).
 */
export function oneEnvironment(scene: THREE.Scene): void {
  const map = scene.environment;
  if (!WEBGPU || !map) return;
  environment ??= (map as THREE.CubeTexture).isCubeTexture ? tsl.cubeTexture(map as THREE.CubeTexture) : tsl.texture(map);
  environment.value = map;
  (scene as unknown as { environmentNode: unknown }).environmentNode = environment;
}

/** `group`'s point lights, those casting shadows first (as the rig has them: `rigPointLights`). */
function pointLightsIn(group: THREE.Object3D): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  group.traverse((o) => { if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight); });
  return [...lights.filter((l) => l.castShadow), ...lights.filter((l) => !l.castShadow)];
}

/** `light`'s place, colour, reach and shadow given to `rigged`, and a shadow it was to draw again handed on. */
function mirror(light: THREE.PointLight, rigged: THREE.PointLight): void {
  light.getWorldPosition(rigged.position);
  rigged.color.copy(light.color);
  rigged.intensity = light.intensity;
  rigged.distance = light.distance;
  rigged.decay = light.decay;
  if (light.castShadow) {
    rigged.shadow.mapSize.copy(light.shadow.mapSize);
    rigged.shadow.camera.near = light.shadow.camera.near;
    rigged.shadow.bias = light.shadow.bias;
    rigged.shadow.radius = light.shadow.radius;
    if (light.shadow.needsUpdate) rigged.shadow.needsUpdate = true;
    light.shadow.needsUpdate = false;
  }
  rigged.updateMatrixWorld();
}

/**
 * The biomes' and the hall of heroes' point lights drawn by one rig of lights, the shown one's copied onto it before
 * each render (its own hidden from WebGPU): WebGPU keys every lit pipeline by its lights' ids, where WebGL counts
 * them, so each biome and the hall had a copy of every lit pipeline, and a run in another biome than the lobby's
 * built its foes', heroes' and effects' at their first draws (7 s under the fight's loading bar on a return). Each
 * has as many as the rig, as many casting (`arena.ts` checks): the casters take its first slots.
 */
export function rigPointLights(scene: THREE.Scene, groups: THREE.Object3D[]): void {
  if (!WEBGPU) return;
  const lightsOf = new Map(groups.map((group) => [group, pointLightsIn(group)]));
  const most = Math.max(...[...lightsOf.values()].map((lights) => lights.length));
  const rig = Array.from({ length: most }, () => new THREE.PointLight(0xffffff, 0));
  [...lightsOf.values()][0].forEach((light, i) => {
    rig[i].castShadow = light.castShadow;
    rig[i].shadow.autoUpdate = light.shadow.autoUpdate;
  });
  for (const lights of lightsOf.values()) for (const light of lights) light.visible = false;
  scene.add(...rig);
  // TEMP: the rig, read by `npm run stalls -- --read` (`&drawn`)
  if (new URLSearchParams(location.search).has('drawn')) Object.assign(window, { __rig: rig });
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    const shown = groups.find((group) => group.visible);
    const lights = shown ? lightsOf.get(shown)! : [];
    rig.forEach((rigged, i) => {
      if (lights[i]) mirror(lights[i], rigged);
      else rigged.intensity = 0;
    });
    before.apply(scene, args);
  };
}

/** Draws a frame through the WebGPU post chain. */
export function renderWebGPU(): void { pipeline?.render(); }

// TEMP: what the page logged, readable off `window.__trace` (dropped before the PR leaves draft)
if (WEBGPU && import.meta.env.DEV) {
  const trace: string[] = [];
  Object.assign(window, { __trace: trace });
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      trace.push(`${level}: ${args.map((a) => (a instanceof Error ? `${a.message} @ ${a.stack?.split('\n')[1]}` : String(a))).join(' ')}`.slice(0, 400));
      original(...args);
    };
  }
  window.addEventListener('error', (e) => trace.push(`uncaught: ${e.message} ${String(e.error?.stack).split('\n').slice(1, 4).join(' | ')}`));
  window.addEventListener('unhandledrejection', (e) => trace.push(`rejection: ${String(e.reason?.stack ?? e.reason).slice(0, 400)}`));
}
