// What materials and textures share: their ids, their uuids, the fields that move a material's version as they
// change, and the hooks run as one is disposed.
import { noteChanged } from '../changes.ts';

export { noteChanged, takeChanged } from '../changes.ts';

/** a material's or a texture's store of its watched fields, by name */
export const FIELDS: unique symbol = Symbol('fields');

/** Something with watched fields: their values, and the version their changes move. */
export interface Watching {
  [FIELDS]: Record<string, unknown>;
  version: number;
}

/** Each of `names` made an accessor on `prototype` over its instance's store (`FIELDS`), a write of another value
 *  than it holds moving its `version`. The class declares their types (an interface merged with it). */
export function watchFields(prototype: object, names: readonly string[]): void {
  for (const name of names) {
    Object.defineProperty(prototype, name, {
      configurable: true,
      enumerable: true,
      get(this: Watching): unknown {
        return this[FIELDS][name];
      },
      set(this: Watching, value: unknown): void {
        const store = this[FIELDS];
        if (store[name] === value) return;
        store[name] = value;
        this.version++;
        noteChanged(this);
      },
    });
  }
}

/** The next id of a counter that starts at 0, as three's do (one for materials, one for textures). */
export function counter(): () => number {
  let next = 0;
  return () => next++;
}

let uuids = 0;

/** A uuid unique in this page (a key, never parsed): made from a count, not from random numbers, so making a material
 *  mid-fight draws nothing from the game's seeded stream. */
export function nextUuid(): string {
  const count = (uuids++).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${count}`;
}

/** `userData` copied as three copies it: through JSON, so what isn't JSON (a function, a map) is left out. */
export function copyUserData(source: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
}

/** The hooks run as something is disposed (`onDispose`, `dispose`). */
export class DisposeHooks {
  private readonly hooks = new Set<() => void>();

  /** `callback` run at each dispose; the function returned takes it off again. */
  add(callback: () => void): () => void {
    this.hooks.add(callback);
    return () => {
      this.hooks.delete(callback);
    };
  }

  /** Every hook run, in the order added. */
  run(): void {
    for (const hook of [...this.hooks]) hook();
  }
}
