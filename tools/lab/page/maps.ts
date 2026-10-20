// `lab maps`: the game's procedural maps (`PRELOAD` in src/core/pbr.ts), each made on the page as a worker makes it,
// timed by the browser's own clock, and a digest of its pixels (and of a face's grid, which its head is built on). A
// first visit makes every one before the lobby shows what it needs (30 s of the workers' CPU, the forest floor alone
// 5 s), so a map made faster must keep every pixel: with `--ab`, each digest matches main's, and the times are side
// by side. `--canary` changes a byte of the first map's pixels after it's made: its digest must change.
import type { Lab, Report } from './lab';
import { PRELOAD, RECIPES, recipeKey, type PBRData, type RecipeName } from '../../../src/core/pbr';

export interface MapsOptions {
  /** the recipes made, by name (every one `PRELOAD` lists by default) */
  maps?: string[];
  /** how many times each is made: its time is the fastest */
  runs: number;
  canary: boolean;
}

/** One map made: its key, its size, its digest and its fastest time (ms). */
interface Made {
  key: string;
  size: string;
  digest: string;
  ms: number;
}

/** FNV-1a's offset and prime (32 bits) */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** `bytes` folded into the digest `hash` (FNV-1a). */
function folded(hash: number, bytes: Uint8Array): number {
  let h = hash;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], FNV_PRIME);
  return h >>> 0;
}

/** A typed array's bytes, as they lie in its buffer. */
function bytesOf(array: ArrayBufferView): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/** The digest of a map's pixels, and of its grid where it has one (a face's), as 8 hex digits. */
function digestOf(data: PBRData): string {
  const arrays: ArrayBufferView[] = [data.albedo, data.normal, data.rough];
  if (data.grid) arrays.push(data.grid.az, data.grid.el, data.grid.r, data.grid.p);
  const hash = arrays.reduce((h, array) => folded(h, bytesOf(array)), FNV_OFFSET);
  return hash.toString(16).padStart(8, '0');
}

/** The jobs `options.maps` names, in `PRELOAD`'s order (every one by default); an error for a name it lacks. */
function jobsOf(options: MapsOptions): (typeof PRELOAD)[number][] {
  if (!options.maps?.length) return PRELOAD;
  const known = new Set<string>(PRELOAD.map(([name]) => name));
  const unknown = options.maps.filter((name) => !known.has(name));
  if (unknown.length) throw new Error(`lab: maps: no map named ${unknown.join(', ')} (${[...known].join(', ')})`);
  return PRELOAD.filter(([name]) => options.maps!.includes(name));
}

/** `name(args)` made `runs` times: the last one's data and the fastest time (ms, the browser's own clock). */
function made(name: RecipeName, args: readonly unknown[], runs: number): { data: PBRData; ms: number } {
  const recipe = RECIPES[name] as (...a: unknown[]) => PBRData;
  let data: PBRData | null = null;
  let fastest = Infinity;
  for (let run = 0; run < runs; run++) {
    const start = window.__labClock.realNow();
    data = recipe(...args);
    fastest = Math.min(fastest, window.__labClock.realNow() - start);
  }
  return { data: data!, ms: fastest };
}

/** `lab maps`: each map made, its digest and its time, and the canary's verdict. */
export function maps(_lab: Lab, options: MapsOptions): Report {
  const runs = Math.max(1, Math.round(options.runs));
  const results: Made[] = [];
  const problems: string[] = [];
  let canaryLine = '';
  for (const [name, args] of jobsOf(options)) {
    const { data, ms } = made(name, args, runs);
    const digest = digestOf(data);
    const size = `${data.size}x${data.height ?? data.size}`;
    results.push({ key: recipeKey(name, args), size, digest, ms });
    if (!options.canary || canaryLine) continue;
    data.albedo[0] ^= 1;
    const changed = digestOf(data) !== digest;
    canaryLine = `canary: a byte of ${recipeKey(name, args)} changed ${changed ? 'caught' : 'went unseen'}`;
    if (!changed) problems.push(`maps: the canary's changed byte in ${recipeKey(name, args)} went unseen`);
  }
  const total = results.reduce((sum, result) => sum + result.ms, 0);
  const lines = [
    `maps: ${results.length} made, ${(total / 1000).toFixed(2)} s in all (each the fastest of ${runs})`,
    ...results.map((result) => `  ${result.key}: ${result.size}, pixels ${result.digest}`),
    'their times, ms:',
    ...results.map((result) => `  ${result.key} ${Math.round(result.ms)}`),
    ...(canaryLine ? [canaryLine] : []),
  ];
  return { text: lines.join('\n'), problems };
}
