// Model registry: id -> builder. Class and enemy data refer to these ids.
import { buildMage } from './mage';
import { buildHusk } from './husk';
import { buildImp } from './imp';
import { buildWitch } from './witch';
import { buildBrute } from './brute';
import { buildDummy } from './dummy';
import { buildThornling } from './thornling';
import { buildMossback } from './mossback';
import { buildSporecaller } from './sporecaller';
import { buildTreant } from './treant';

import type { Model } from '../../types';

export const MODELS: Record<string, () => Model> = {
  mage: buildMage,
  husk: buildHusk,
  imp: buildImp,
  witch: buildWitch,
  brute: () => buildBrute('brute'),
  colossus: () => buildBrute('colossus'),
  thornling: buildThornling,
  mossback: buildMossback,
  sporecaller: buildSporecaller,
  barkhulk: () => buildTreant('barkhulk'),
  thornheart: () => buildTreant('thornheart'),
  dummy: buildDummy,
};

export function buildModel(id: string): Model {
  const b = MODELS[id];
  if (!b) throw new Error(`Unknown model "${id}"`);
  return b();
}
