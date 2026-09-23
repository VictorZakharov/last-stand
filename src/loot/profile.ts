// Persistent profiles, one per class: equipment, stash and records (localStorage).
// Classes share nothing, so each has its own loot and starting waves.
import { CLASSES, DEFAULT_CLASS } from '../data/classes/index';
import { RUN } from '../data/balance';
import { readCookie, writeCookie } from '../core/cookies';
import { makeItem, byValue, isTwoHanded, fitsOffhand } from './items';
import type { Item, Profile, Slot } from '../types';

const KEY = (classId: string) => `last-stand.profile.${classId}.v1`;
/** the single profile from before there were classes to choose from: the mage's */
const LEGACY = 'last-stand.profile.v1';
const CLASS_COOKIE = 'last-stand-class';

function fresh(classId: string): Profile {
  const cls = CLASSES[classId];
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) {
    // starter weapons are one-handed, so a starter off-hand fits
    let it = makeItem({ ...g, cls });
    for (let i = 0; i < 20 && isTwoHanded(it, cls); i++) it = makeItem({ ...g, cls });
    equipped[g.slot] = it;
  }
  return {
    classId: cls.id,
    equipped,
    stash: [],
    records: { bestWave: 0, bestBanked: {}, runs: 0, banked: 0, bestScore: 0 },
  };
}

function read(key: string): Profile | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const p = JSON.parse(raw);
  if (!p || !p.equipped || !Array.isArray(p.stash)) return null;
  p.records.bestBanked ??= {}; // older profiles: bestWave counts deaths too, so start over
  return p;
}

export function loadProfile(classId: string): Profile {
  try {
    const p = read(KEY(classId));
    if (p) return { ...p, classId };
    if (classId === 'mage') {
      const old = read(LEGACY);
      if (old) {
        old.classId = classId;
        saveProfile(old);
        localStorage.removeItem(LEGACY);
        return old;
      }
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return fresh(classId);
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY(p.classId), JSON.stringify(p)); } catch { /* ignore */ }
}

/** Start the class over (the other classes keep theirs). */
export function resetProfile(classId: string): Profile {
  const p = fresh(classId);
  saveProfile(p);
  return p;
}

/** The class picked last time in the lobby (cookie). */
export function savedClass(): string {
  const id = readCookie(CLASS_COOKIE);
  return id && Object.hasOwn(CLASSES, id) ? id : DEFAULT_CLASS;
}

export function saveClass(classId: string): void { writeCookie(CLASS_COOKIE, classId); }

/** The slots an item can go in: its own, and the off-hand for a one-handed weapon of a class that dual-wields. */
export function slotsFor(p: Profile, item: Item): Slot[] {
  return fitsOffhand(item, CLASSES[p.classId]) ? ['weapon', 'offhand'] : [item.slot];
}

// Move an item from the stash into a slot (swapping out the current one). Without a slot, it goes in
// its own, except a one-handed weapon fills an empty off-hand next to another one-hander
export function equipFromStash(p: Profile, itemId: string, to?: Slot): void {
  const idx = p.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return;
  const item = p.stash[idx];
  const cls = CLASSES[p.classId];
  const main = p.equipped.weapon;
  const slot = to ?? (fitsOffhand(item, cls) && main && !isTwoHanded(main, cls) && !p.equipped.offhand ? 'offhand' : item.slot);
  if (!slotsFor(p, item).includes(slot)) return;
  const prev = p.equipped[slot];
  // a two-handed weapon and an off-hand don't go together: the other one goes to the stash
  const clash = slot === 'weapon' && isTwoHanded(item, cls) ? 'offhand' : slot === 'offhand' && isTwoHanded(main, cls) ? 'weapon' : null;
  const bumped = clash ? p.equipped[clash] : undefined;
  if (bumped && p.stash.length + (prev ? 1 : 0) > RUN.bagLimit) return;
  p.stash.splice(idx, 1);
  if (prev) p.stash.splice(idx, 0, prev);
  if (bumped) { delete p.equipped[clash!]; p.stash.unshift(bumped); }
  p.equipped[slot] = item;
  saveProfile(p);
}

export function unequip(p: Profile, slot: Slot): void {
  const it = p.equipped[slot];
  if (!it || p.stash.length >= RUN.bagLimit) return;
  delete p.equipped[slot];
  p.stash.unshift(it);
  saveProfile(p);
}

export function salvage(p: Profile, itemId: string): void {
  p.stash = p.stash.filter((i) => i.id !== itemId);
  saveProfile(p);
}

export function salvageEquipped(p: Profile, slot: Slot): void {
  delete p.equipped[slot];
  saveProfile(p);
}

// When the stash would overflow, the least valuable items of stash and loot together
// go, so new loot pushes out weaker stash items and is only discarded when nothing in
// the stash is weaker (on a tie the stash item stays).
export function bankItems(p: Profile, items: Item[]): { lost: Item[]; replaced: Item[] } {
  const keep = new Set([...p.stash, ...items].sort(byValue).slice(0, RUN.bagLimit));
  const replaced = p.stash.filter((i) => !keep.has(i));
  const kept = items.filter((i) => keep.has(i)).sort(byValue);
  p.stash = p.stash.filter((i) => keep.has(i)).concat(kept);
  p.records.banked += kept.length;
  saveProfile(p);
  return { lost: items.filter((i) => !keep.has(i)), replaced };
}
