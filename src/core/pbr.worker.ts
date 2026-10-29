// Makes procedural PBR maps off the main thread during loading (core/textures.ts preloadTextures), or reads them
// back where a visit before kept them (core/kept.ts). The workers share the maps out among themselves, by the
// orders each was made with (its name): the page's main thread passes a worker its messages, so a map handed out
// by it waited for its long tasks.
import { RECIPES, photosFor, recipeKey, type PBRData } from './pbr';
import { keepAll, keepAs, kept } from './kept';
import type { Job, MapMade, MapOrders } from './textures';

/** when this script ran, in this worker's clock (`MapMade.up`) */
const up = performance.timeOrigin + performance.now();
const orders = JSON.parse(self.name) as MapOrders;
if (orders.keepAs) keepAs(orders.keepAs);

/** the maps made here, kept once every worker has finished (`keep`, the page's word): a read of the store waits
 *  for every write asked before it (core/kept.ts `keepAll`) */
const toKeep: [string, PBRData][] = [];

/** `data` with pixels of its own: its buffers are sent on to the page, and the store copies them only later */
const copyOf = (data: PBRData): PBRData => ({
  ...data, albedo: data.albedo.slice(), normal: data.normal.slice(), rough: data.rough.slice(),
});

/** resolved as the page lets the workers go: the maps claimed till then stay claimed */
let letGo = (): void => undefined;
const lettingGo = new Promise<void>((resolve) => { letGo = resolve; });

/** Whether this worker makes the `index`th map, `key`: the first worker to claim it does (a lock held till the
 *  workers are let go, so none makes it again), or without locks (an insecure page's) each worker its share. */
function claimed(key: string, index: number): Promise<boolean> {
  if (!('locks' in navigator)) return Promise.resolve(index % orders.workers === orders.worker);
  return new Promise((resolve) => {
    void navigator.locks.request(`${orders.boot} ${key}`, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      return lock ? lettingGo : undefined;
    });
  });
}

/** `job`'s map read back from the store, or made, and sent to the page. */
async function make([name, args]: Job, key: string): Promise<void> {
  const begun = performance.now();
  const read = await kept<PBRData>(key);
  const readMs = performance.now() - begun;
  if (!read) await photosFor(name);
  const data = read ?? (RECIPES[name] as (...a: unknown[]) => PBRData)(...args);
  if (!read) toKeep.push([key, copyOf(data)]);
  // (when, from the worker's time origin: the page's differs)
  const start = performance.timeOrigin + begun;
  const made: MapMade = { key, data, start, ms: performance.now() - begun, kept: !!read, readMs, up };
  self.postMessage(made, { transfer: [data.albedo.buffer, data.normal.buffer, data.rough.buffer] });
}

/** Every map no other worker claimed first, in turn; then the page is told. */
async function work(): Promise<void> {
  for (const [index, job] of orders.jobs.entries()) {
    const key = recipeKey(job[0], job[1]);
    if (await claimed(key, index)) await make(job, key);
  }
  self.postMessage('finished');
}

// the page's word, once every worker has finished: what was made here is kept, and the worker closes
self.onmessage = async () => {
  await keepAll(toKeep);
  letGo();
  self.close();
};
void work();
