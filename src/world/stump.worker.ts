// Sculpts the forest's stump off the main thread while the game loads (world/stump.ts `preloadStump`).
import { sculptStump } from './stump';

const stump = sculptStump();
self.postMessage(stump, { transfer: [stump.positions.buffer, stump.normals.buffer, stump.uvs.buffer] });
