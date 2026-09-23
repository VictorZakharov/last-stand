// Item generation and stat aggregation.
import { SLOTS, SLOT_INFO, RARITIES, STATS, AFFIX_NAMES, LEGENDARY_NAMES, type RarityInfo } from '../data/items';
import { LOOT } from '../data/waves';
import { pick, rand, randInt, weighted } from '../util';
import type { BaseStats, ClassDef, DerivedStats, Item, Profile, RarityId, Slot, StatBlock, StatKey } from '../types';

let uid = Date.now() % 1e6;

const STAT_KEYS = Object.keys(STATS) as StatKey[];
/** Typed Object.entries for a stat block. */
export const statEntries = (s: StatBlock) => Object.entries(s) as [StatKey, number][];

export const rarityOf = (id: RarityId): RarityInfo => RARITIES.find((r) => r.id === id) ?? RARITIES[0];
export const rarityIndex = (id: RarityId): number => RARITIES.findIndex((r) => r.id === id);

function rollStat(stat: StatKey, ilvl: number, power: number, weight = 1): number {
  const s = STATS[stat];
  let v = s.base * (1 + s.grow * (ilvl - 1)) * power * weight * rand(0.75, 1.05);
  if (s.cap) v = Math.min(v, s.cap);
  const dec = s.dec || 0;
  const f = 10 ** dec;
  return Math.max(dec ? 0.1 : 1, Math.round(v * f) / f);
}

export function rollRarity(wave: number, bonus = 0): RarityId {
  const w = LOOT.rarityWeights(wave, bonus);
  return weighted(RARITIES.map((r, i) => [r.id, w[i]] as const));
}

/** Implicit stats of a slot for a class (its own, or the defaults). */
export const implicitsFor = (slot: Slot, cls?: ClassDef): [StatKey, number][] => cls?.implicits?.[slot] ?? SLOT_INFO[slot].implicit;
/** A weapon held in both hands (no off-hand with it). */
export const isTwoHanded = (it: Item | undefined, cls?: ClassDef): boolean => !!it && it.slot === 'weapon' && !!cls?.twoHanded?.includes(it.base);
/** A one-handed weapon of a class that dual-wields: it can go in the off-hand. */
export const fitsOffhand = (it: Item | undefined, cls?: ClassDef): boolean => !!it && it.slot === 'weapon' && !!cls?.dualWield && !isTwoHanded(it, cls);
/** A weapon in the off-hand counts its implicit (the weapon's damage) at this much: two one-handers
 *  come to a little less than a two-hander's 1.8x, and pay for the second set of affixes with the block. */
export const OFFHAND_WEAPON = 0.6;

/** Item base names of a slot for a class (its own, or the defaults). */
export const basesFor = (slot: Slot, cls?: ClassDef): string[] => cls?.bases?.[slot] ?? SLOT_INFO[slot].bases;

/** Create an item for `cls` (its base names and stats). Everything is plain JSON so it can be saved directly. */
export function makeItem({ slot = pick(SLOTS), rarity = 'common', ilvl = 1, cls }: { slot?: Slot; rarity?: RarityId; ilvl?: number; cls?: ClassDef } = {}): Item {
  const r = rarityOf(rarity);
  const base = pick(basesFor(slot, cls));
  const stats: StatBlock = {};
  // a two-handed weapon makes up for the missing off-hand with a much bigger implicit
  const hands = cls?.twoHanded?.includes(base) ? 1.8 : 1;
  for (const [stat, weight] of implicitsFor(slot, cls)) stats[stat] = rollStat(stat, ilvl, r.power, weight * hands);

  const pool = STAT_KEYS.filter((s) => !(s in stats) && !STATS[s].implicitOnly && !cls?.excludeStats?.includes(s));
  const count = randInt(r.affixes[0], r.affixes[1]);
  const affixes: StatKey[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const stat = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    stats[stat] = rollStat(stat, ilvl, r.power, 0.8);
    affixes.push(stat);
  }

  let name = base;
  if (rarity === 'legendary') name = pick(LEGENDARY_NAMES);
  else if (affixes.length) {
    const pre = AFFIX_NAMES[affixes[0]][0];
    const suf = affixes[1] ? AFFIX_NAMES[affixes[1]][1] : '';
    name = `${pre} ${base}${suf ? ' ' + suf : ''}`;
  }

  return { id: `i${(uid++).toString(36)}`, slot, rarity, ilvl, name, base, stats };
}

export function rollDrop(cls: ClassDef, wave: number, bonus = 0): Item {
  return makeItem({ rarity: rollRarity(wave, bonus), ilvl: wave + randInt(0, 1), cls });
}

export function formatStat(stat: StatKey, v: number): string {
  return STATS[stat].fmt.replace('{v}', String(v));
}

/** Rough single-number score to make comparisons readable. */
export function itemPower(item: Item): number {
  let p = 0;
  for (const [k, v] of statEntries(item.stats)) p += v / STATS[k].base;
  return Math.round(p * 10);
}

/** Sort comparator: best first (rarity, then power). */
export const byValue = (a: Item, b: Item): number => rarityIndex(b.rarity) - rarityIndex(a.rarity) || itemPower(b) - itemPower(a);

/** Combine class base stats with equipped items into final derived stats. */
const WEAPON_IMPLICIT = new Set(SLOT_INFO.weapon.implicit.map(([k]) => k));

export function computeStats(base: BaseStats, equipped: Profile['equipped']): DerivedStats {
  const add = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Record<StatKey, number>;
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (!it) continue;
    const offWeapon = slot === 'offhand' && it.slot === 'weapon';
    for (const [k, v] of statEntries(it.stats)) add[k] += offWeapon && WEAPON_IMPLICIT.has(k) ? v * OFFHAND_WEAPON : v;
  }
  const capped = (k: StatKey, cap: number) => Math.min(cap, add[k]);
  return {
    maxLife: base.life + add.life,
    maxEnergy: base.energy + add.energy,
    lifeRegen: base.lifeRegen + add.lifeRegen,
    energyRegen: base.energyRegen + add.energyRegen,
    moveSpeed: base.moveSpeed * (1 + capped('moveSpeed', 40) / 100),
    crit: Math.min(75, base.crit + add.crit),
    critDmg: base.critDmg + add.critDmg,
    armor: Math.min(70, base.armor + add.armor),
    resist: Math.min(75, base.resist + add.resist),
    damagePct: add.damagePct,
    arcanePct: add.arcanePct,
    elementalPct: add.elementalPct,
    castSpeed: capped('castSpeed', 60),
    cdr: capped('cdr', 40),
    leech: capped('leech', 15),
    block: capped('block', 60),
    blockAmount: add.blockAmount,
  };
}
