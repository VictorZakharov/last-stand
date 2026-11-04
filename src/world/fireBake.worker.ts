// Simulates the fire once off the main thread (world/fireBake.ts), and keeps it across visits (core/kept.ts): a return
// reads in a few ms what took a first visit's worker seconds.
import { keepAll, keepAs, kept } from '../core/kept';
import { bakeFlames } from './fireBake';

/** The atlas as it's sent and kept. */
interface Baked {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
}

const KEY = 'fire-volume';

self.onmessage = async (e: MessageEvent<{ keepName?: string }>) => {
  if (e.data.keepName) keepAs(e.data.keepName);
  const had = await kept<Baked>(KEY);
  if (had) {
    self.postMessage(had, { transfer: [had.data.buffer] });
    return;
  }
  const made = bakeFlames();
  await keepAll([[KEY, made]]);
  self.postMessage(made, { transfer: [made.data.buffer] });
};
