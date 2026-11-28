// A panel's changes told from what it has (#973, `panel.ts`): a change is sent the engine only where a field
// differs, a text painted again only where its style does.
import type { TextStyle } from '../overlay/paint';

/** Whether two texts' styles are alike field for field (their shadows by value). */
export function sameStyle(a: TextStyle | null, b: TextStyle): boolean {
  if (a === b) return true;
  if (!a) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof TextStyle>;
  for (const key of keys) {
    const [was, now] = [a[key], b[key]];
    if (was === now) continue;
    if (Array.isArray(was) && Array.isArray(now) && JSON.stringify(was) === JSON.stringify(now)) continue;
    return false;
  }
  return true;
}

/** Whether any of `change`'s fields differs from `now`'s (a list or an object by its parts as text). */
export function differs<T extends object>(now: T, change: Partial<T>): boolean {
  for (const key of Object.keys(change) as (keyof T)[]) {
    const a = now[key];
    const b = change[key];
    if (a === b) continue;
    if (typeof a !== 'object' || typeof b !== 'object' || JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}
