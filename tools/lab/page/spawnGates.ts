// The gates the foes came by (tools/lab `spawns`, beside page/spawnVerdicts.ts): how many gates each group came by and
// how many foes each gate sent of it (its packs), the waves that left a gate idle though their packs were enough for
// every gate, each gate's share of the foes, and the gates the bosses came by; as lines and problems.
import type { BiomeId } from '../../../src/data/biomes';
import type { Rise } from './spawnVerdicts';
import { G } from '../../../src/state';

/** the fewest waves whose bosses' gates are judged: by chance one goes unused in 24 waves 1 time in 250 */
const SPREAD_WAVES = 24;
/** the fewest groups with foes enough for so many gates that say whether a group ever comes by that many */
const SPLIT_GROUPS = 10;
/** the least share of the foes a gate may have, of an even share: under it a gate is idle more than chance has it */
const LEAST_SHARE = 0.5;
/** the fewest foes whose shares are judged */
const SHARE_FOES = 100;

/** The gate nearest a point: its index among the biome's portals. */
export function gateOf(x: number, z: number): number {
  const distances = G.arena.portals.map((portal) => Math.hypot(x - portal.pos.x, z - portal.pos.z));
  return distances.indexOf(Math.min(...distances));
}

/** A gate as the report names it: its index and where it is. */
export function gateName(gate: number): string {
  const at = G.arena.portals[gate].pos;
  return `gate ${gate} (${Math.round(at.x)},${Math.round(at.z)})`;
}

/** The biome's gates, by index. */
function allGates(): number[] {
  return G.arena.portals.map((_, gate) => gate);
}

/** The rises sorted into lists by `by`'s key (a group's, a wave's), each list in the order they rose. */
export function groupsOf(rises: Rise[], by: (rise: Rise) => string): Rise[][] {
  const groups = new Map<string, Rise[]>();
  for (const rise of rises) {
    const key = by(rise);
    groups.set(key, [...(groups.get(key) ?? []), rise]);
  }
  return [...groups.values()];
}

/** How many gates a list of foes came by. */
function gatesUsed(foes: Rise[]): number {
  return new Set(foes.map((rise) => rise.gate)).size;
}

/** Each wave's groups of foes but the boss. */
function groupsBut(rises: Rise[]): Rise[][] {
  return groupsOf(rises.filter((rise) => !rise.boss), (rise) => `${rise.wave}.${rise.group}`);
}

/** Each wave's foes but the boss, by its groups. */
function wavesBut(rises: Rise[]): Rise[][][] {
  const waves = groupsOf(rises.filter((rise) => !rise.boss), (rise) => `${rise.wave}`);
  return waves.map((wave) => groupsOf(wave, (rise) => `${rise.group}`));
}

/** How many groups came by each number of gates, from one to the arena's (the list's index is the number less one). */
function splits(groups: Rise[][]): number[] {
  return allGates().map((gate) => groups.filter((foes) => gatesUsed(foes) === gate + 1).length);
}

/**
 * The numbers of gates no group came by though enough of them had foes for that many (`SPLIT_GROUPS`; a group of one
 * foe comes by one gate, which says nothing).
 */
function unseenSplits(groups: Rise[][]): number[] {
  const counts = allGates().map((gate) => gate + 1);
  return counts.filter((count) => {
    const could = groups.filter((foes) => foes.length >= Math.max(count, 2));
    return could.length >= SPLIT_GROUPS && !could.some((foes) => gatesUsed(foes) === count);
  });
}

/** The packs' sizes: each group's foes by each gate it came by. */
function packSizes(groups: Rise[][]): number[] {
  return groups.flatMap((foes) => groupsOf(foes, (rise) => `${rise.gate}`).map((pack) => pack.length));
}

/** The waves that left a gate idle though their groups came in packs enough for every gate. */
function idleWaves(waves: Rise[][][]): Rise[][][] {
  const gates = G.arena.portals.length;
  return waves.filter((groups) => {
    const packs = groups.reduce((sum, foes) => sum + gatesUsed(foes), 0);
    return packs >= gates && gatesUsed(groups.flat()) < gates;
  });
}

/** The gates with under `LEAST_SHARE` of an even share of the foes, once there are foes enough to say. */
function starvedGates(rises: Rise[]): number[] {
  if (rises.length < SHARE_FOES) return [];
  const even = rises.length / G.arena.portals.length;
  return allGates().filter((gate) => rises.filter((rise) => rise.gate === gate).length < even * LEAST_SHARE);
}

/** The gates foes came by, as a line's part: each gate's count. */
function gatesCount(rises: Rise[]): string {
  const counts = allGates().map((gate) => rises.filter((rise) => rise.gate === gate).length);
  return counts.map((count, gate) => `${gateName(gate)} ${count}`).join(', ');
}

/** The gates no boss came by, when there were enough waves to say. */
function unusedGates(bosses: Rise[]): number[] {
  if (bosses.length < SPREAD_WAVES) return [];
  return allGates().filter((gate) => !bosses.some((rise) => rise.gate === gate));
}

/** The gates' lines: each gate's foes, the groups by how many gates they came by, packs, idle waves, the bosses. */
export function gatesLines(rises: Rise[]): string[] {
  const groups = groupsBut(rises);
  const waves = wavesBut(rises);
  const sizes = groups.map((foes) => foes.length);
  const packs = packSizes(groups);
  const byGates = splits(groups).map((count, gate) => `${gate + 1} ${count}`).join(', ');
  const bosses = rises.filter((rise) => rise.boss);
  const spread = bosses.length >= SPREAD_WAVES ? '' : ` (too few to judge: ${SPREAD_WAVES} at least)`;
  return [
    `${rises.length} foes came by ${gatesCount(rises)}`,
    `in ${groups.length} groups of ${Math.min(...sizes)} to ${Math.max(...sizes)} besides the bosses, by so many `
      + `gates: ${byGates}; in packs of ${Math.min(...packs)} to ${Math.max(...packs)} a gate; `
      + `${idleWaves(waves).length} of ${waves.length} waves left a gate idle though their packs were enough for all`,
    `the bosses came by ${gatesCount(bosses)}${spread}`,
  ];
}

/** The gates' problems: a split no group came in, waves leaving a gate idle, a gate starved, one no boss came by. */
export function gatesProblems(biome: BiomeId, rises: Rise[]): string[] {
  const problems: string[] = [];
  const unseen = unseenSplits(groupsBut(rises));
  if (unseen.length > 0) problems.push(`${biome}: no group came by ${unseen.join(' or ')} gates`);
  const waves = wavesBut(rises);
  const idle = idleWaves(waves);
  if (idle.length > 0) problems.push(`${biome}: ${idle.length} of ${waves.length} waves left a gate idle`);
  const starved = starvedGates(rises.filter((rise) => !rise.boss));
  if (starved.length > 0) problems.push(`${biome}: ${starved.map(gateName).join(', ')} sent under half a share`);
  const unused = unusedGates(rises.filter((rise) => rise.boss));
  if (unused.length > 0) problems.push(`${biome}: no boss came by ${unused.map(gateName).join(', ')}`);
  return problems;
}

/**
 * What the gates' checks make of a canary's rises, every foe moved onto one gate: the splits no group came in, the
 * waves that left a gate idle, and whether it is caught (both, the bosses by that gate alone when they are enough to
 * say).
 */
export function oneGateVerdict(rises: Rise[]): { unseen: number[]; waves: number; caught: boolean } {
  const unseen = unseenSplits(groupsBut(rises));
  const waves = idleWaves(wavesBut(rises)).length;
  const bosses = rises.filter((rise) => rise.boss);
  const bossesOnOne = bosses.length < SPREAD_WAVES || unusedGates(bosses).length === G.arena.portals.length - 1;
  return { unseen, waves, caught: unseen.length > 0 && waves > 0 && bossesOnOne };
}
