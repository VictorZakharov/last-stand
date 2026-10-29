// Values a dev build can change while it runs (the lab's `--tune`): a part of the game registers an object of numbers
// by name, reads its fields where it uses them, and the lab sets them before a command runs, so a pose or a camera is
// compared across values without editing the source and booting again each time. A production build registers nothing.

/** a tunable value: a number, or a list of them (a point, a way) */
type Value = number | number[];

/** a registered object of values, and its lists of keys: each one's field, and the numbers a key takes in it; every
 *  copy registered under its name since (one a hero's build declares is made again by each build), and the fields set
 *  so far, which a copy registered later takes */
interface Registered {
  values: Record<string, Value>; keyed: Record<string, number>;
  copies: WeakRef<Record<string, Value>>[]; set: Map<string, Value>;
}

const registry = new Map<string, Registered>();

/** Registers `values` under `name` (dev builds) and returns them: read their fields where they're used, each frame.
 *  `keyed`: the fields that are lists of keys, by the numbers a key takes (a key can be added or taken out as they're
 *  tuned; every other list keeps its length, a point's three numbers). Registered again under the same name (declared
 *  in a hero's build, made again by each build), every copy is tuned, and a new one takes what was set: tuned on the
 *  last copy alone, the warrior's `warriorLay` set a hall's or a warm-up's build and the hero in the scene kept his. */
export function tunable<T extends Record<string, Value>>(
  name: string, values: T, keyed: Partial<Record<keyof T, number>> = {},
): T {
  if (!import.meta.env.DEV) return values;
  const had = registry.get(name);
  const copies = had ? had.copies.filter((copy) => copy.deref()) : [];
  const set = had?.set ?? new Map<string, Value>();
  for (const [field, value] of set) values[field as keyof T] = copyOf(value) as T[keyof T];
  copies.push(new WeakRef(values));
  registry.set(name, { values, keyed: keyed as Record<string, number>, copies, set });
  return values;
}

/** A value as a new number or list, so no two copies share a list. */
const copyOf = (value: Value): Value => typeof value === 'number' ? value : [...value];

/** The tunable object and field `path` (`name.field`) names, the field's value now, and the numbers a key takes in it
 *  if it's a list of keys. */
function fieldOf(path: string): { values: Record<string, Value>; field: string; now: Value; key?: number } {
  const [name, field] = path.split('.');
  const registered = registry.get(name);
  if (!registered) throw new Error(`no tunable ${name} (there are: ${[...registry.keys()].join(', ') || 'none'})`);
  const { values, keyed } = registered;
  const now = values[field];
  if (now === undefined) throw new Error(`${name} has no ${field} (it has: ${Object.keys(values).join(', ')})`);
  return { values, field, now, key: keyed[field] };
}

/** The value of `path` (`name.field`) now, as a list (the lab's `match --fit` starts from it). */
function tuned(path: string): number[] {
  const { now } = fieldOf(path);
  return typeof now === 'number' ? [now] : [...now];
}

/** Sets `path` (`name.field`) to `value`, a number or a list of as many as the field holds (a list of keys: any number
 *  of whole keys). */
function tune(path: string, value: number[]): void {
  const { field, now, key } = fieldOf(path);
  if (typeof now === 'number') {
    if (value.length !== 1) throw new Error(`${path} is one number`);
  } else if (key !== undefined) {
    if (value.length === 0 || value.length % key !== 0) throw new Error(`${path} is keys of ${key} numbers`);
  } else if (value.length !== now.length) throw new Error(`${path} is ${now.length} numbers`);
  const registered = registry.get(path.split('.')[0])!;
  const set: Value = typeof now === 'number' ? value[0] : [...value];
  registered.set.set(field, set);
  for (const copy of registered.copies) {
    const values = copy.deref();
    if (!values) continue;
    // (a list set in place: a pose may hold the list itself)
    const was = values[field];
    if (typeof was === 'number' || typeof set === 'number') values[field] = copyOf(set);
    else was.splice(0, was.length, ...set);
  }
}

declare global {
  interface Window {
    /** dev builds: sets a tunable value (`tunable`), and reads one */
    __tune?: (path: string, value: number[]) => void;
    __tuned?: (path: string) => number[];
  }
}

if (import.meta.env.DEV) {
  window.__tune = tune;
  window.__tuned = tuned;
}
