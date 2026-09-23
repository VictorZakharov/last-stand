// Biomes: each has its own arena (world/), enemy roster and boss. The wave rules
// (budget, groups, loot) in waves.ts are shared.
import type { EnemyId } from './enemies';

export type BiomeId = 'crypt' | 'forest';
/** the player's choice in the lobby: a biome, or a random one each run */
export type BiomeSetting = BiomeId | 'random';

export interface BiomeDef {
  /** short label for the lobby picker */
  label: string;
  /** full name, shown when a run starts */
  title: string;
  /** enemy pool unlocked at wave `w`, as [enemy, weight] */
  pool(w: number): [EnemyId, number][];
  boss: EnemyId;
  /** short boss name for the Continue button */
  bossShort: string;
  /** banner subtitle on boss waves */
  bossBanner: string;
  /** minimap: shape of the boundary and colour of the spawn gates */
  minimap: { wall: 'octagon' | 'circle'; portal: string };
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  crypt: {
    label: 'Crypt', title: 'The Crypt',
    pool: (w) => {
      const p: [EnemyId, number][] = [['imp', 3], ['husk', 4]];
      if (w >= 2) p.push(['witch', 2 + w * 0.2]);
      if (w >= 3) p.push(['brute', 0.6 + w * 0.12]);
      return p;
    },
    boss: 'colossus', bossShort: 'Colossus', bossBanner: 'A colossal presence approaches…',
    minimap: { wall: 'octagon', portal: '#b050ff' },
  },
  forest: {
    label: 'Forest', title: 'The Thornwood',
    pool: (w) => {
      const p: [EnemyId, number][] = [['thornling', 3], ['mossback', 4]];
      if (w >= 2) p.push(['sporecaller', 2 + w * 0.2]);
      if (w >= 3) p.push(['barkhulk', 0.6 + w * 0.12]);
      return p;
    },
    boss: 'thornheart', bossShort: 'Thornheart', bossBanner: 'The old wood wakes…',
    minimap: { wall: 'circle', portal: '#70ff60' },
  },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
