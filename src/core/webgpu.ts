// The game on three's WebGPURenderer, behind `?renderer=webgpu` (docs/research/webgpu.md): the renderer made and
// given what the WebGL code around it asks of a WebGLRenderer, and the post chain as a node pipeline.
import * as THREE from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';

/** Whether this page draws with WebGPURenderer (`?renderer=webgpu`; `?renderer=webgpu-gl` its WebGL 2 backend). */
const asked = new URLSearchParams(location.search).get('renderer');
export const WEBGPU = asked === 'webgpu' || asked === 'webgpu-gl';

let pipeline: RenderPipeline | null = null;

/**
 * A WebGPURenderer, initialised, typed as the WebGLRenderer the rest of the game takes. What it lacks of one is
 * stood in for: `compile` (nothing listed as made), its programs (none
 * are WebGL's) and the anisotropy asked at boot. (Its own `debug` stays: its node builder reads hooks off it.)
 */
export async function makeWebGPURenderer(): Promise<THREE.WebGLRenderer> {
  const { WebGPURenderer } = await import('three/webgpu');
  const renderer = new WebGPURenderer({ antialias: false, powerPreference: 'high-performance', forceWebGL: asked === 'webgpu-gl' });
  await renderer.init();
  // (own properties over the class's getters: `compile` is one)
  const stand = (key: string, value: unknown) => Object.defineProperty(renderer, key, { value, writable: true });
  // (TODO: the warm-up's compiles as `compileAsync`; started into its WebGL targets they failed for want of a depth
  // format, so each pipeline is made as it's first drawn for now)
  stand('compile', () => new Set<THREE.Material>());
  stand('capabilities', { getMaxAnisotropy: () => renderer.getMaxAnisotropy(), isWebGL2: true });
  Object.defineProperty(renderer.info, 'programs', { value: [], writable: true });
  return renderer as unknown as THREE.WebGLRenderer;
}

/** The post chain on WebGPU: the scene's pass, its bloom added, tone mapped and in sRGB on the way out. */
export async function makePipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
  const { RenderPipeline } = await import('three/webgpu');
  const { pass } = await import('three/tsl');
  const { bloom } = await import('three/addons/tsl/display/BloomNode.js');
  const gpu = renderer as unknown as WebGPURenderer;
  const scenePass = pass(scene, camera);
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
