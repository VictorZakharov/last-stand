// Makes procedural PBR maps off the main thread during loading (core/textures.ts preloadTextures), or reads them
// back where a visit before kept them (core/kept.ts).
import { RECIPES, recipeKey, type PBRData, type RecipeName } from './pbr';
import { keepAll, kept } from './kept';
import type { MapMade } from './textures';

/** when this script ran, in this worker's clock (`MapMade.up`) */
const up = performance.timeOrigin + performance.now();

/** the maps made here, kept once no job is left to hand out (`done`): a read of the store waits for every write
 *  asked before it (core/kept.ts `keepAll`); the worker closes once they're written */
const toKeep: [string, PBRData][] = [];

/** `data` with pixels of its own: its buffers are sent on to the page, and the store copies them only later */
const copyOf = (data: PBRData): PBRData => ({
  ...data, albedo: data.albedo.slice(), normal: data.normal.slice(), rough: data.rough.slice(),
});

self.onmessage = async (e: MessageEvent<[RecipeName, unknown[]] | 'done'>) => {
  if (e.data === 'done') {
    await keepAll(toKeep);
    self.close();
    return;
  }
  const [name, args] = e.data;
  const key = recipeKey(name, args);
  const begun = performance.now();
  const read = await kept<PBRData>(key);
  const readMs = performance.now() - begun;
  const data = read ?? (RECIPES[name] as (...a: unknown[]) => PBRData)(...args);
  if (!read) toKeep.push([key, copyOf(data)]);
  // (when, from the worker's time origin: the page's differs)
  const start = performance.timeOrigin + begun;
  const made: MapMade = { key, data, start, ms: performance.now() - begun, kept: !!read, readMs, up };
  self.postMessage(made, { transfer: [data.albedo.buffer, data.normal.buffer, data.rough.buffer] });
};
