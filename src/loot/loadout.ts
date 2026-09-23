// Spell loadout: which skill is bound to which key. Any skill may be bound to
// any key, including the same skill on several keys. Persisted in a cookie.
// A class whose skills depend on the gear held (the warrior's shield and two-handed skills) keeps
// one loadout per weapon style, so each style comes back as the player left it.
import { readCookie, writeCookie } from '../core/cookies';
import type { ClassDef, Gear, SkillDef, SkillKey } from '../types';

export const SKILL_KEYS: SkillKey[] = ['mouse0', 'mouse2', '1', '2', '3', '4', 'q'];

/** key -> skill id (the skill's `impl` name), or null for an empty slot */
export type Loadout = Record<SkillKey, string | null>;

/** How the weapons are held: each has its own loadout (for a class with gear-driven skills). */
export type WeaponStyle = 'shield' | 'twoHanded' | 'dual' | 'oneHanded';

export function weaponStyle(cls: ClassDef, gear: Gear): WeaponStyle | null {
  if (!cls.skills.some((s) => s.needs)) return null;   // one loadout, whatever is held
  return gear.shield ? 'shield' : gear.twoHanded ? 'twoHanded' : gear.offWeapon ? 'dual' : 'oneHanded';
}

/** Whether the gear held allows a skill (some need a shield, a two-handed weapon or two weapons). */
export function usableWith(def: SkillDef, gear: Gear): boolean {
  return def.needs === 'shield' ? gear.shield : def.needs === 'twoHanded' ? gear.twoHanded : def.needs === 'dual' ? !!gear.offWeapon : true;
}

/** The skill a key bound to `def` fires with this gear: itself, its fallback for the gear, or none. */
export function resolveFor(def: SkillDef, gear: Gear): string | null {
  if (usableWith(def, gear)) return def.impl;
  const fb = def.fallback;
  return (gear.shield ? fb?.shield : gear.twoHanded ? fb?.twoHanded : gear.offWeapon ? fb?.dual : fb?.oneHanded) ?? null;
}

const COOKIE = (classId: string, style: WeaponStyle | null) => `last-stand-loadout-${classId}${style ? '-' + style : ''}`;

/** The class's defaults (a key gets the last skill listing it), fitted to the gear held. */
export function defaultLoadout(cls: ClassDef, gear?: Gear): Loadout {
  const l = Object.fromEntries(SKILL_KEYS.map((k) => [k, null])) as Loadout;
  for (const s of cls.skills) l[s.key] = s.impl;
  return gear ? fit(cls, l, gear) : l;
}

/** Swap skills the gear doesn't allow for their fallback (or nothing). */
function fit(cls: ClassDef, l: Loadout, gear: Gear): Loadout {
  for (const k of SKILL_KEYS) {
    const def = cls.skills.find((s) => s.impl === l[k]);
    if (def) l[k] = resolveFor(def, gear);
  }
  return l;
}

function read(name: string, into: Loadout, known: Set<string>): boolean {
  try {
    const raw = readCookie(name);
    if (!raw) return false;
    const saved = JSON.parse(raw) as Partial<Record<SkillKey, string | null>>;
    for (const k of SKILL_KEYS) {
      const v = saved[k];
      if (v === null || (typeof v === 'string' && known.has(v))) into[k] = v;
    }
    return true;
  } catch { return false; /* corrupt cookie: keep defaults */ }
}

/**
 * Load the saved loadout for the gear held, falling back to defaults for missing / unknown entries.
 * A style never set up yet starts from the loadout saved before there were styles, if any.
 */
export function loadLoadout(cls: ClassDef, gear: Gear): Loadout {
  const style = weaponStyle(cls, gear);
  const known = new Set(cls.skills.map((s) => s.impl));
  const loadout = defaultLoadout(cls);
  if (!read(COOKIE(cls.id, style), loadout, known) && style) read(COOKIE(cls.id, null), loadout, known);
  return fit(cls, loadout, gear);
}

export function saveLoadout(cls: ClassDef, gear: Gear, loadout: Loadout): void {
  writeCookie(COOKIE(cls.id, weaponStyle(cls, gear)), JSON.stringify(loadout));
}
