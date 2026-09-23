// Spell loadout: which skill is bound to which key. Any skill may be bound to
// any key, including the same skill on several keys. Persisted in a cookie.
import type { ClassDef, SkillKey } from '../types';

export const SKILL_KEYS: SkillKey[] = ['mouse0', 'mouse2', '1', '2', '3', '4', 'q'];

/** key -> skill id (the skill's `impl` name), or null for an empty slot */
export type Loadout = Record<SkillKey, string | null>;

const COOKIE = (classId: string) => `last-stand-loadout-${classId}`;
const MAX_AGE = 60 * 60 * 24 * 365 * 5; // five years

export function defaultLoadout(cls: ClassDef): Loadout {
  const l = Object.fromEntries(SKILL_KEYS.map((k) => [k, null])) as Loadout;
  for (const s of cls.skills) l[s.key] = s.impl;
  return l;
}

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Load the saved loadout, falling back to defaults for missing / unknown entries. */
export function loadLoadout(cls: ClassDef): Loadout {
  const loadout = defaultLoadout(cls);
  const known = new Set(cls.skills.map((s) => s.impl));
  try {
    const raw = readCookie(COOKIE(cls.id));
    if (!raw) return loadout;
    const saved = JSON.parse(raw) as Partial<Record<SkillKey, string | null>>;
    for (const k of SKILL_KEYS) {
      const v = saved[k];
      if (v === null || (typeof v === 'string' && known.has(v))) loadout[k] = v;
    }
  } catch { /* corrupt cookie: keep defaults */ }
  return loadout;
}

export function saveLoadout(cls: ClassDef, loadout: Loadout): void {
  document.cookie = `${COOKIE(cls.id)}=${encodeURIComponent(JSON.stringify(loadout))}; max-age=${MAX_AGE}; path=/; SameSite=Lax`;
}
