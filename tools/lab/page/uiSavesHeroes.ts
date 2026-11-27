// `lab ui`'s `savesHeroes` state: the save slots with heroes in them, as a player's are after some runs (each hero's
// records, gear, skills, attributes, stash and starting waves: `savesHeroes.ts` in `uiStates/`). Slots 2 and 3 are
// written with heroes made from fresh ones, each with records and a stash, and given back as they were once it
// closes: the save slots screen alone showed an empty slot and the hero in play's, none of a hero's card.
import { CLASS_ENTRY, readSlot, writeSlot, type Entries } from '../../../src/loot/slotData';
import { loadProfile } from '../../../src/loot/profile';
import { openSaves } from '../../../src/ui/saves';
import type { Item, Profile } from '../../../src/types';

/** the slots written, and the heroes each holds */
const SEEDED: Record<number, string[]> = { 2: ['mage', 'warrior'], 3: ['ranger'] };

/** what the seeded slots held before, written back as the state closes */
const before = new Map<number, Entries>();

/** the profile's entry, as a slot names it (src/loot/slotData.ts) */
const profileEntry = (classId: string): string => `last-stand.profile.${classId}.v1`;

/** A fresh hero of `classId` as some runs leave him: records in every column, and a stash of copies of his gear. */
function playedHero(classId: string, runs: number): Profile {
  const profile = structuredClone(loadProfile(classId));
  const worn = Object.values(profile.equipped).filter((item): item is Item => Boolean(item));
  profile.stash = worn.map((item, at) => ({ ...structuredClone(item), id: `lab-${classId}-${at}` }));
  profile.records = {
    ...profile.records,
    bestWave: 7 + runs,
    bestBanked: { crypt: 6 + runs, forest: 4 },
    bestReached: { crypt: 8 + runs, forest: 5 },
    runs,
    banked: 12 * runs,
    bestScore: 18_450 * runs,
    kills: 340 * runs,
    time: 3_600 * runs + 1_260,
  };
  profile.saved = Date.UTC(2026, 10, 20, 18, 30);
  return profile;
}

/** The save slots opened with slots 2 and 3 holding heroes. */
export function openSavesHeroes(): void {
  for (const [slot, heroes] of Object.entries(SEEDED)) {
    const number = Number(slot);
    before.set(number, readSlot(number));
    const entries: Entries = { [CLASS_ENTRY]: heroes[0] };
    heroes.forEach((classId, at) => {
      entries[profileEntry(classId)] = JSON.stringify(playedHero(classId, 3 + at * 9));
    });
    writeSlot(number, entries);
  }
  openSaves(true);
}

/** The save slots closed, and the seeded slots given back what they held. */
export function closeSavesHeroes(): void {
  openSaves(false);
  for (const [slot, entries] of before) writeSlot(slot, entries);
  before.clear();
}
