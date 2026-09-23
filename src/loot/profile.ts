// Persistent profiles, one per class: equipment, stash and records (localStorage).
// Classes share nothing, so each has its own loot and starting waves.
import { CLASSES, DEFAULT_CLASS } from '../data/classes/index';
import { RUN } from '../data/balance';
import { readCookie, writeCookie } from '../core/cookies';
import { makeItem, byValue } from './items';
import type { Item, Profile, Slot } from '../types';

const KEY = (classId: string) => `last-stand.profile.${classId}.v1`;
/** the single profile from before there were classes to choose from: the mage's */
const LEGACY = 'last-stand.profile.v1';
const CLASS_COOKIE = 'last-stand-class';

function fresh(classId: string): Profile {
  const cls = CLASSES[classId];
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) equipped[g.slot] = makeItem({ ...g, cls });
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

// Move an item from the stash into its slot (swapping out the current one).
export function equipFromStash(p: Profile, itemId: string): void {
  const idx = p.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return;
  const item = p.stash[idx];
  const prev = p.equipped[item.slot];
  p.stash.splice(idx, 1);
  if (prev) p.stash.splice(idx, 0, prev);
  p.equipped[item.slot] = item;
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
