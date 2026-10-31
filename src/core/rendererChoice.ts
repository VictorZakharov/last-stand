// Which renderer draws the game, and WebGPU's flags: chosen in the pause menu and kept in cookies, read as the page
// loads (a change takes a reload: the renderer is made once, before anything is built). A URL's own `?renderer=`,
// `&meshlets=1` and `&lights=each` stand over the choice kept (the harnesses' measures name theirs).
import { readCookie, writeCookie } from './cookies';

/** a renderer the pause menu offers */
export type RendererKind = 'webgl' | 'webgpu';

/** WebGPU's flags: three's GPU-driven meshlets, and the point lights written out in full (three's own, to compare) */
export interface WebgpuFlags { meshlets: boolean; lightsEach: boolean }

const RENDERER_COOKIE = 'last-stand-renderer';
const FLAGS_COOKIE = 'last-stand-webgpu-flags';
/** each flag's name in its cookie */
const FLAG_NAMES: Record<keyof WebgpuFlags, string> = { meshlets: 'meshlets', lightsEach: 'lights-each' };

const params = new URLSearchParams(location.search);

/** The renderer chosen in the pause menu (WebGL where none was). */
export const chosenRenderer = (): RendererKind => (readCookie(RENDERER_COOKIE) === 'webgpu' ? 'webgpu' : 'webgl');

/** WebGPU's flags as chosen in the pause menu. */
export function chosenFlags(): WebgpuFlags {
  const kept = (readCookie(FLAGS_COOKIE) ?? '').split(',');
  return { meshlets: kept.includes(FLAG_NAMES.meshlets), lightsEach: kept.includes(FLAG_NAMES.lightsEach) };
}

/** `kind` kept for the next load. */
export function chooseRenderer(kind: RendererKind): void {
  writeCookie(RENDERER_COOKIE, kind);
}

/** `flags` kept for the next load. */
export function chooseFlags(flags: WebgpuFlags): void {
  const on = (Object.keys(FLAG_NAMES) as (keyof WebgpuFlags)[]).filter((flag) => flags[flag]);
  writeCookie(FLAGS_COOKIE, on.map((flag) => FLAG_NAMES[flag]).join(','));
}

/** Whether the address sets the renderer or a flag, over the choice kept. */
export const setByAddress = params.has('renderer') || params.has('meshlets') || params.has('lights');

/** the renderer this page runs: the address's (`webgpu`, `webgpu-gl` its WebGL 2 backend), else the choice kept */
const asked = params.get('renderer') ?? chosenRenderer();
export const RUNNING = {
  /** three's WebGPURenderer draws it */
  webgpu: asked === 'webgpu' || asked === 'webgpu-gl',
  /** on WebGPURenderer's WebGL 2 backend */
  webgpuOnGl: asked === 'webgpu-gl',
  meshlets: params.has('meshlets') ? params.get('meshlets') === '1' : chosenFlags().meshlets,
  lightsEach: params.has('lights') ? params.get('lights') === 'each' : chosenFlags().lightsEach,
};
