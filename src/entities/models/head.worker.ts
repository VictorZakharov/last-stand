// Makes a hero's head geometry off the main thread while the game loads (models/head.ts `preloadHeads`): the worker's
// name is the hero's model and the detail he's built at, `mage@0.35`.
import { setHeroDetail } from './armor';
import { HERO_HEADS, headShapes, packHeadShapes } from './head';

const [model, detail] = self.name.split('@');
setHeroDetail(Number(detail));
const { who, ...style } = HERO_HEADS[model as keyof typeof HERO_HEADS];
headShapes(who, style);
const { packed, buffers } = packHeadShapes();
self.postMessage(packed, { transfer: buffers });
