// Sculpts a side's hand off the main thread while the game loads (models/hands.ts `preloadHands`).
import { sculptSide } from './hands';
import { packHand } from './handShape';

self.onmessage = (e: MessageEvent<number>) => {
  const { packed, buffers } = packHand(sculptSide(e.data));
  self.postMessage(packed, { transfer: buffers });
};
