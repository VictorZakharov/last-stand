// Optional performance overlay: FPS history graph, frame / CPU / GPU timings and
// renderer stats. Off by default; toggled from the pause menu, persisted in a cookie.
import * as THREE from 'three';
import { G } from '../state';
import { particles } from '../fx/particles';
import { readCookie, writeCookie } from '../core/cookies';
import { programsCompiledInGame, lateCompiles } from '../core/shaders';

const COOKIE = 'last-stand-perf-hud';
// the hashed bundle name identifies the build a report came from
const BUILD = import.meta.url.split('/').pop()?.replace(/\?.*$/, '') ?? 'unknown';
const WINDOW_MS = 15_000;     // history shown in the graph
const BUCKET_MS = 500;        // one graph point per bucket
const REDRAW_MS = 250;
const GRAPH_W = 160, GRAPH_H = 40;

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

interface Sample { t: number; frame: number; cpu: number }

let enabled = false;
let el: HTMLElement;
let renderer: THREE.WebGLRenderer;
let gpuName = 'unknown';
const samples: Sample[] = [];   // one per frame inside WINDOW_MS
let lastFrame = 0, cpuStart = 0, lastDraw = 0;
let frameCalls = 0, frameTris = 0;

// GPU time via EXT_disjoint_timer_query_webgl2 (Chrome/Edge/Firefox; not Safari)
let gl: WebGL2RenderingContext | null = null;
let timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
let activeQuery: WebGLQuery | null = null;
const pendingQueries: WebGLQuery[] = [];
const gpuTimes: { t: number; ms: number }[] = [];

export function initPerfHud(r: THREE.WebGLRenderer): void {
  renderer = r;
  el = $('#perf');
  // postprocessing issues several render calls per frame: count them all, reset per frame
  renderer.info.autoReset = false;
  gl = renderer.getContext() as WebGL2RenderingContext;
  timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  gpuName = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  el.onclick = copyReport;
  setPerfHud(readCookie(COOKIE) === '1', false);
}

export const perfHudEnabled = (): boolean => enabled;

export function setPerfHud(on: boolean, persist = true): void {
  enabled = on;
  el.classList.toggle('hidden', !on);
  samples.length = 0; gpuTimes.length = 0; lastFrame = 0;
  if (persist) writeCookie(COOKIE, on ? '1' : '0');
}

/** Call at the very start of a rAF callback. */
export function perfBeginFrame(now: number): void {
  renderer.info.reset();
  if (!enabled) return;
  if (lastFrame) samples.push({ t: now, frame: now - lastFrame, cpu: 0 });
  lastFrame = now;
  cpuStart = performance.now();
  if (gl && timerExt) {
    pollQueries();
    if (pendingQueries.length < 3) {
      activeQuery = gl.createQuery();
      gl.beginQuery(timerExt.TIME_ELAPSED_EXT, activeQuery);
    }
  }
}

/** Call after the frame has been rendered. */
export function perfEndFrame(): void {
  if (!enabled) return;
  const now = performance.now();
  const last = samples[samples.length - 1];
  if (last) last.cpu = now - cpuStart;
  frameCalls = renderer.info.render.calls;
  frameTris = renderer.info.render.triangles;
  if (gl && timerExt && activeQuery) {
    gl.endQuery(timerExt.TIME_ELAPSED_EXT);
    pendingQueries.push(activeQuery);
    activeQuery = null;
  }
  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].t < cutoff) samples.shift();
  while (gpuTimes.length && gpuTimes[0].t < cutoff) gpuTimes.shift();
  if (now - lastDraw >= REDRAW_MS) { lastDraw = now; draw(now); }
}

function pollQueries(): void {
  if (!gl || !timerExt) return;
  while (pendingQueries.length) {
    const q = pendingQueries[0];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
    pendingQueries.shift();
    const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT) as boolean;
    const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
    gl.deleteQuery(q);
    if (!disjoint) gpuTimes.push({ t: performance.now(), ms: ns / 1e6 });
  }
}

// --- stats ------------------------------------------------------------------------
const percentile = (sorted: number[], q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] : NaN;
const mean = (a: number[]): number => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const fmt = (v: number, digits = 1): string => Number.isFinite(v) ? v.toFixed(digits) : '--';
const fmtFps = (v: number): string => Number.isFinite(v) ? (v < 20 ? v.toFixed(1) : String(Math.round(v))) : '--';
const kilo = (n: number): string => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(n);

interface Stats {
  fps: number; avgFps: number; lowFps: number; p50: number; p95: number; cpu: number; gpu: number;
  buckets: (number | null)[];
}

function computeStats(now: number): Stats {
  const frames = samples.map((s) => s.frame).sort((a, b) => a - b);
  const recent = samples.filter((s) => s.t > now - 1000);
  const span = samples.length ? now - samples[0].t + samples[0].frame : 0;
  const n = WINDOW_MS / BUCKET_MS, t0 = now - WINDOW_MS, first = samples[0]?.t ?? now;
  const counts = new Array<number>(n).fill(0);
  for (const s of samples) counts[Math.min(n - 1, Math.max(0, Math.floor((s.t - t0) / BUCKET_MS)))]++;
  // buckets before the first sample have no data; the first partial bucket is rated by its covered time
  const buckets = counts.map((c, i) => {
    const start = t0 + i * BUCKET_MS, end = start + BUCKET_MS;
    return end <= first ? null : c * 1000 / (end - Math.max(start, first));
  });
  return {
    fps: recent.length * 1000 / Math.max(1, Math.min(1000, span)),
    avgFps: span > 0 ? samples.length * 1000 / span : NaN,
    lowFps: 1000 / percentile(frames, 0.99),
    p50: percentile(frames, 0.5),
    p95: percentile(frames, 0.95),
    cpu: mean(samples.slice(-60).map((s) => s.cpu)),
    gpu: mean(gpuTimes.slice(-60).map((g) => g.ms)),
    buckets,
  };
}

function graphPath(buckets: (number | null)[], top: number): string {
  const step = GRAPH_W / (buckets.length - 1);
  let d = '';
  buckets.forEach((v, i) => {
    if (v === null) return;
    const y = GRAPH_H - Math.min(1, v / top) * (GRAPH_H - 2) - 1;
    d += `${d ? 'L' : 'M'}${(i * step).toFixed(1)} ${y.toFixed(1)}`;
  });
  return d;
}

function draw(now: number): void {
  const s = computeStats(now);
  const info = renderer.info;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const peak = Math.max(60, ...s.buckets.map((v) => v ?? 0));
  const top = Math.ceil(peak / 30) * 30;
  const set = (k: string, v: string) => { el.querySelector(`[data-p="${k}"]`)!.textContent = v; };
  set('fps', fmtFps(s.fps));
  set('ms', fmt(s.p50));
  set('p95', fmt(s.p95));
  set('avg', fmtFps(s.avgFps));
  set('low', fmtFps(s.lowFps));
  set('cpu', fmt(s.cpu, 2));
  set('gpu', timerExt ? fmt(s.gpu, 2) : 'n/a');
  set('top', String(top));
  set('mid', String(top / 2));
  set('calls', kilo(frameCalls));
  set('tris', kilo(frameTris));
  set('progs', `${info.programs?.length ?? 0} (+${programsCompiledInGame()})`);
  set('geo', String(info.memory.geometries));
  set('tex', String(info.memory.textures));
  set('res', `${size.x}×${size.y} @${renderer.getPixelRatio().toFixed(2)}`);
  set('ents', `${G.enemies.length} / ${G.projectiles.length} / ${particles.glow.count + particles.smoke.count}`);
  set('gpuname', gpuName);
  el.querySelector('.pf-line')!.setAttribute('d', graphPath(s.buckets, top));
  // amber when the last seconds dropped well below the 15s average, red below 30
  el.classList.toggle('warn', s.fps < s.avgFps * 0.75);
  el.classList.toggle('bad', s.fps < 30);
  placeBesideLobby();
}

/** In the lobby, sit just right of the left panel instead of on top of it. */
function placeBesideLobby(): void {
  const menu = $('#menu');
  const left = menu.querySelector<HTMLElement>('.menu-left');
  const covered = G.mode === 'menu' && !menu.classList.contains('hidden') && !menu.classList.contains('stowed');
  el.style.left = covered && left ? `${Math.round(left.getBoundingClientRect().right + 12)}px` : '';
}

// --- report -----------------------------------------------------------------------
function report(): string {
  const s = computeStats(performance.now());
  const info = renderer.info;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  return [
    `Last Stand performance report (${new Date().toISOString()}, build ${BUILD})`,
    `FPS now ${fmtFps(s.fps)} | 15s avg ${fmtFps(s.avgFps)} | 1% low ${fmtFps(s.lowFps)}`,
    `Frame p50 ${fmt(s.p50)} ms | p95 ${fmt(s.p95)} ms | CPU ${fmt(s.cpu, 2)} ms | GPU ${timerExt ? fmt(s.gpu, 2) + ' ms' : 'n/a'}`,
    `Draw calls ${frameCalls} | triangles ${frameTris} | programs ${info.programs?.length ?? 0} (compiled after load ${programsCompiledInGame()}) | geometries ${info.memory.geometries} | textures ${info.memory.textures}`,
    `Canvas ${size.x}x${size.y} | pixel ratio ${renderer.getPixelRatio()} | devicePixelRatio ${window.devicePixelRatio} | window ${window.innerWidth}x${window.innerHeight}`,
    `Mode ${G.mode} | enemies ${G.enemies.length} | projectiles ${G.projectiles.length} | particles ${particles.glow.count + particles.smoke.count}`,
    `GPU ${gpuName}`,
    `UA ${navigator.userAgent}`,
    `FPS history (0.5s buckets) ${s.buckets.map((v) => v === null ? '-' : Math.round(v)).join(' ')}`,
  ].join('\n');
}

function copyReport(): void {
  const hint = el.querySelector('[data-p="copy"]')!;
  navigator.clipboard.writeText(report()).then(
    () => { hint.textContent = 'Copied to clipboard'; },
    () => { hint.textContent = 'Copy failed'; },
  ).finally(() => setTimeout(() => { hint.textContent = 'Click to copy a report'; }, 1600));
}
