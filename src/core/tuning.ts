// Values a dev build can change while it runs (the lab's `--tune`): a part of the game registers an object of numbers
// by name, reads its fields where it uses them, and the lab sets them before a command runs, so a pose or a camera is
// compared across values without editing the source and booting again each time. A production build registers nothing.

/** a tunable value: a number, or a list of them (a point, a way) */
type Value = number | number[];

const registry = new Map<string, Record<string, Value>>();

/** Registers `values` under `name` (dev builds) and returns them: read their fields where they're used, each frame. */
export function tunable<T extends Record<string, Value>>(name: string, values: T): T {
  if (import.meta.env.DEV) registry.set(name, values);
  return values;
}

/** Sets `path` (`name.field`) to `value`, a number or a list of as many as the field holds. */
function tune(path: string, value: number[]): void {
  const [name, field] = path.split('.');
  const values = registry.get(name);
  if (!values) throw new Error(`no tunable ${name} (there are: ${[...registry.keys()].join(', ') || 'none'})`);
  const now = values[field];
  if (now === undefined) throw new Error(`${name} has no ${field} (it has: ${Object.keys(values).join(', ')})`);
  if (typeof now === 'number') {
    if (value.length !== 1) throw new Error(`${path} is one number`);
    values[field] = value[0];
    return;
  }
  if (value.length !== now.length) throw new Error(`${path} is ${now.length} numbers`);
  now.splice(0, now.length, ...value);
}

declare global {
  interface Window {
    /** dev builds: sets a tunable value (`tunable`) */
    __tune?: (path: string, value: number[]) => void;
  }
}

if (import.meta.env.DEV) window.__tune = tune;
