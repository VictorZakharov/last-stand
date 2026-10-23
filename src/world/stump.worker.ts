// Sculpts the forest's pool of stumps off the main thread while the game loads (world/stump.ts `preloadStump`).
import { POOL, sculptStump } from './stump';

const stumps = Array.from({ length: POOL }, (_, k) => sculptStump(k));
const buffers = stumps.flatMap((stump) => [stump.positions.buffer, stump.normals.buffer, stump.uvs.buffer]);
self.postMessage(stumps, { transfer: buffers });
