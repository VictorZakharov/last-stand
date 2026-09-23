// Persistent profile: equipment, stash and records (localStorage).
import { CLASSES, DEFAULT_CLASS } from '../data/classes/index';
import { RUN } from '../data/balance';
import { makeItem } from './items';
import type { Item, Profile, Slot } from '../types';

const KEY = 'last-stand.profile.v1';

function fresh(): Profile {
  const cls = CLASSES[DEFAULT_CLASS];
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) equipped[g.slot] = makeItem(g);
  return {
    classId: cls.id,
    equipped,
    stash: [],
    records: { bestWave: 0, runs: 0, banked: 0, bestScore: 0 },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.equipped && Array.isArray(p.stash)) return p;
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return fresh();
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function resetProfile(): Profile {
  const p = fresh();
  saveProfile(p);
  return p;
}

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

// Returns how many items did not fit.
export function bankItems(p: Profile, items: Item[]): number {
  let lost = 0;
  for (const it of items) {
    if (p.stash.length < RUN.bagLimit) p.stash.push(it);
    else lost++;
  }
  p.records.banked += items.length - lost;
  saveProfile(p);
  return lost;
}
