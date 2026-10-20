// Sculpts a side's hand off the main thread while the game loads (models/hands.ts `preloadHands`): the side is
// the worker's name.
import { sculptSide } from './hands';
import { packHand } from './handShape';

const { packed, buffers } = packHand(sculptSide(Number(self.name)));
self.postMessage(packed, { transfer: buffers });
