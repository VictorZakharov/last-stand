// Makes procedural PBR maps off the main thread during loading (core/textures.ts preloadTextures), or reads them
// back where a visit before kept them (core/kept.ts).
import { RECIPES, recipeKey, type PBRData, type RecipeName } from './pbr';
import { keep, kept } from './kept';
import type { MapMade } from './textures';

/** the maps being written to the store: the worker closes once they're done (`done`, sent with no job left) */
const writing: Promise<void>[] = [];

self.onmessage = async (e: MessageEvent<[RecipeName, unknown[]] | 'done'>) => {
  if (e.data === 'done') {
    await Promise.all(writing);
    self.close();
    return;
  }
  const [name, args] = e.data;
  const key = recipeKey(name, args);
  const begun = performance.now();
  const read = await kept<PBRData>(key);
  const data = read ?? (RECIPES[name] as (...a: unknown[]) => PBRData)(...args);
  if (!read) writing.push(keep(key, data));
  // (when, from the worker's time origin: the page's differs)
  const made: MapMade = { key, data, start: performance.timeOrigin + begun, ms: performance.now() - begun, kept: !!read };
  self.postMessage(made, { transfer: [data.albedo.buffer, data.normal.buffer, data.rough.buffer] });
};
