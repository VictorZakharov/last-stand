// The game on three's WebGPURenderer, behind `?renderer=webgpu` (docs/research/webgpu.md): the renderer made and
// given what the WebGL code around it asks of a WebGLRenderer, and the post chain as a node pipeline.
import * as THREE from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';

/** Whether this page draws with WebGPURenderer (`?renderer=webgpu`; `?renderer=webgpu-gl` its WebGL 2 backend). */
const asked = new URLSearchParams(location.search).get('renderer');
export const WEBGPU = asked === 'webgpu' || asked === 'webgpu-gl';

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
  compileShadowsToo(renderer);
  // TEMP: the node builds that take a while, and whether a compile asked them
  if (import.meta.env.DEV) {
    const nodes = (renderer as unknown as { _nodes: { getForRender: (ro: unknown, ...rest: unknown[]) => unknown } })._nodes;
    const getForRender = nodes.getForRender.bind(nodes);
    const builds: string[] = [];
    Object.assign(window, { __builds: builds });
    nodes.getForRender = (ro: unknown, ...rest: unknown[]) => {
      const at = performance.now();
      const pre = (renderer as unknown as { _precompilationState: unknown })._precompilationState !== null;
      const out = getForRender(ro, ...rest);
      const ms = performance.now() - at;
      if (ms > 0.3) {
        const r = ro as { object: THREE.Object3D; material: THREE.Material; renderContext: { id: number; depth?: boolean }; camera: THREE.Camera; lightsNode: { id: number } };
        builds.push(`${Math.round(at)} ${ms.toFixed(0)}ms ${pre ? 'compile' : 'draw'} ${r.object?.name || r.object?.type} ${r.material?.type}${r.material?.name ? ` "${r.material.name}"` : ''} ctx${r.renderContext?.id} lights${r.lightsNode?.id} cam${r.camera?.id}`);
      }
      return out;
    };
  }
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
