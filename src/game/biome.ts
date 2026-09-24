// The lobby's biome choice (cookie): a biome, or Random, which rolls a biome for every run.
import { G } from '../state';
import { BIOME_IDS, type BiomeId, type BiomeSetting } from '../data/biomes';
import { readCookie, writeCookie } from '../core/cookies';
import { pick } from '../util';

const COOKIE = 'last-stand-biome';
let setting: BiomeSetting = 'random';

const isBiome = (v: string | null): v is BiomeId => BIOME_IDS.includes(v as BiomeId);

/** Show the saved biome (a random one on Random) once the arena is built. */
export function initBiome(): void {
  const saved = readCookie(COOKIE);
  setting = saved === 'random' || isBiome(saved) ? saved : 'random';
  G.arena.setBiome(setting === 'random' ? pick(BIOME_IDS) : setting);
}

export const biomeSetting = (): BiomeSetting => setting;

/** Choosing a biome in the lobby switches to it right away; Random keeps the current one until the run starts. */
export function setBiomeSetting(s: BiomeSetting): void {
  setting = s;
  writeCookie(COOKIE, s);
  if (s !== 'random') G.arena.setBiome(s);
}

/** At the start of a run: Random rolls the biome for it. */
export function rollBiome(): void {
  if (setting === 'random') G.arena.setBiome(pick(BIOME_IDS));
}

/** Back to the lobby's own choice (after a co-op host's): the chosen biome, or Random's current one. */
export function showBiomeSetting(): void {
  if (setting !== 'random') G.arena.setBiome(setting);
}
