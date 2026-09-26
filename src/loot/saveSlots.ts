// Save slots: three separate saves, each with its own heroes (every class's gear, stash and records),
// skill loadouts and stash filters, so a player can start over (with a friend, say) and keep the old
// heroes. Slot 1 keeps the storage keys from before there were slots, which older builds on this
// origin (the PR previews) still read; slots 2 and 3 add `s2` / `s3` after the `last-stand` prefix.
import { readCookie, writeCookie } from '../core/cookies';

export const SAVE_SLOTS = [1, 2, 3];
const COOKIE = 'last-stand-save-slot';

let current = 0;

/** The save slot in use: the one picked last time, else 1. */
export function saveSlot(): number {
  if (!current) {
    const n = Number(readCookie(COOKIE));
    current = SAVE_SLOTS.includes(n) ? n : 1;
  }
  return current;
}

export function setSaveSlot(n: number): void {
  current = n;
  writeCookie(COOKIE, String(n));
}

/** A storage key or cookie name as it is in a save slot (the one in use by default). */
export const saveKey = (key: string, slot = saveSlot()): string =>
  slot === 1 ? key : key.replace(/^last-stand([.-])/, `last-stand$1s${slot}$1`);
